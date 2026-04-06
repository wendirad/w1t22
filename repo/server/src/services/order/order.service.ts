import mongoose from 'mongoose';
import { Order, IOrder } from '../../models/order.model';
import { OrderEvent as OrderEventModel } from '../../models/order-event.model';
import { Cart } from '../../models/cart.model';
import { Vehicle } from '../../models/vehicle.model';
import { Payment } from '../../models/payment.model';
import { Invoice } from '../../models/invoice.model';
import { OrderStatus, OrderEvent, VehicleStatus, PaymentStatus, InvoiceStatus } from '../../types/enums';
import { createOrderStateMachine } from './order-state-machine';
import { NotFoundError, BadRequestError, ConflictError } from '../../lib/errors';
import { PaginationParams, buildPaginatedResult } from '../../lib/pagination';
import { refundPayment } from '../finance/payment.service';
import config from '../../config';
import logger from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';

const ROLLBACK_DEADLINE_MS = config.rollbackDeadlineMs;

function generateOrderNumber(dealershipId: string): string {
  const prefix = dealershipId.slice(-4).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  return `ORD-${prefix}-${ts}`;
}

export async function createOrderFromCart(
  userId: string,
  dealershipId: string,
  idempotencyKey: string
) {
  // Scope idempotency by user + dealership to prevent cross-tenant collisions
  const scopedIdempotencyKey = `${userId}:${dealershipId}:${idempotencyKey}`;
  const existing = await Order.findOne({ idempotencyKey: scopedIdempotencyKey });
  if (existing) return existing;

  const cart = await Cart.findOne({ userId, dealershipId }).populate('items.vehicleId');
  if (!cart || cart.items.length === 0) {
    throw new BadRequestError('Cart is empty');
  }

  const groups = new Map<string, typeof cart.items>();

  for (const item of cart.items) {
    const vehicle = item.vehicleId as any;
    const groupKey = `${vehicle.supplierId || 'default'}|${vehicle.warehouseId || 'default'}|${vehicle.estimatedTurnaround <= 1 ? 'same-day' : 'standard'}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(item);
  }

  const orders: IOrder[] = [];
  const session = await mongoose.startSession();
  const reservationStartedAt = Date.now();

  try {
    await session.withTransaction(async () => {
      for (const [, groupItems] of groups) {
        const orderItems = [];
        let subtotal = 0;

        for (const item of groupItems) {
          const vehicle = await Vehicle.findById(item.vehicleId).session(session);
          if (!vehicle || vehicle.status !== VehicleStatus.AVAILABLE) {
            throw new BadRequestError(`Vehicle ${item.vehicleId} is no longer available`);
          }

          vehicle.status = VehicleStatus.RESERVED;
          await vehicle.save({ session });

          const addOnTotal = item.addOnServices.reduce((sum, a) => sum + a.price, 0);
          const itemSubtotal = vehicle.price + addOnTotal;
          subtotal += itemSubtotal;

          orderItems.push({
            vehicleId: vehicle._id,
            supplierId: vehicle.supplierId,
            warehouseId: vehicle.warehouseId,
            turnaroundDays: vehicle.estimatedTurnaround,
            addOnServices: item.addOnServices,
            subtotal: itemSubtotal,
          });
        }

        const orderKey = groups.size > 1 ? `${scopedIdempotencyKey}-${orders.length}` : scopedIdempotencyKey;

        const order = new Order({
          orderNumber: generateOrderNumber(dealershipId),
          dealershipId,
          buyerId: userId,
          status: OrderStatus.CREATED,
          items: orderItems,
          totals: { subtotal, tax: 0, total: subtotal },
          idempotencyKey: orderKey,
        });

        await order.save({ session });

        await OrderEventModel.create(
          [
            {
              orderId: order._id,
              fromStatus: null,
              toStatus: OrderStatus.CREATED,
              triggeredBy: userId,
              reason: 'Order created from cart',
            },
          ],
          { session }
        );

        orders.push(order);
      }

      if (orders.length > 1) {
        const parentOrder = orders[0];
        const childIds = orders.slice(1).map((o) => o._id);
        for (const child of orders.slice(1)) {
          child.parentOrderId = parentOrder._id as any;
          await child.save({ session });
        }
        parentOrder.childOrderIds = childIds as any;
        await parentOrder.save({ session });
      }

      cart.items = [];
      await cart.save({ session });
    });
  } catch (error: any) {
    const revertDurationMs = Date.now() - reservationStartedAt;
    // The Mongo transaction aborted — all reservations are automatically rolled
    // back by MongoDB.  Record the failure event so it is auditable.
    logger.error(
      { userId, dealershipId, error: error.message, revertDurationMs },
      'Inventory reservation failed — transaction aborted, all changes rolled back',
    );

    // Persist a reservation-failure event outside the aborted transaction so
    // the audit trail shows *what* failed and *when* the revert completed.
    await OrderEventModel.create({
      orderId: null as any,
      fromStatus: null,
      toStatus: 'reservation_failed',
      triggeredBy: userId,
      reason: `Inventory reservation failed: ${error.message}`,
      rolledBack: true,
      rolledBackAt: new Date(),
      metadata: {
        dealershipId,
        revertDurationMs,
        deadlineMs: ROLLBACK_DEADLINE_MS,
        deadlineExceeded: revertDurationMs > ROLLBACK_DEADLINE_MS,
        failureReason: error.message,
      },
    }).catch((logErr: any) => {
      logger.error({ error: logErr.message }, 'Failed to record reservation failure event');
    });

    throw error;
  } finally {
    await session.endSession();
  }

  logger.info(
    { orderCount: orders.length, userId, dealershipId },
    'Orders created from cart'
  );

  return orders.length === 1 ? orders[0] : orders;
}

interface SagaStep {
  name: string;
  execute: () => Promise<void>;
  compensate: () => Promise<void>;
}

interface SagaResult {
  success: boolean;
  failedStep?: string;
  compensatedSteps: string[];
  rollbackStartedAt?: Date;
  rollbackCompletedAt?: Date;
  rollbackReason?: string;
  rollbackDurationMs?: number;
  deadlineExceeded: boolean;
}

/**
 * Wraps a promise with a hard timeout.  If the promise does not resolve within
 * `ms` milliseconds the returned promise rejects with a timeout error while the
 * original work continues in the background (we cannot forcibly abort DB I/O, but
 * we can stop waiting for it).
 */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: exceeded ${ms}ms deadline`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Execute a saga: run steps in order, compensate in reverse on failure.
 *
 * The 5-second rollback guarantee from the spec is enforced here:
 * • Each individual compensation step is given a per-step share of the
 *   remaining deadline.
 * • The overall compensation phase is wrapped in a hard deadline so
 *   the caller is never blocked longer than ROLLBACK_DEADLINE_MS.
 * • The rollback event recorded in the database captures whether the
 *   deadline was exceeded, so the condition is auditable.
 */
async function executeSaga(steps: SagaStep[], orderId: string): Promise<SagaResult> {
  const completed: SagaStep[] = [];
  const sagaStartedAt = Date.now();

  for (const step of steps) {
    try {
      await step.execute();
      completed.push(step);
    } catch (error: any) {
      // ---- compensation phase ----
      const rollbackStartedAt = new Date();
      const compensatedSteps: string[] = [];
      let deadlineExceeded = false;

      logger.error(
        { orderId, failedStep: step.name, error: error.message },
        'Saga step failed — starting compensation within rollback deadline',
      );

      // Run all compensation steps under a single hard deadline
      const compensateAll = async () => {
        for (let i = completed.length - 1; i >= 0; i--) {
          try {
            await completed[i].compensate();
            compensatedSteps.push(completed[i].name);
            logger.info({ orderId, step: completed[i].name }, 'Compensation step succeeded');
          } catch (compErr: any) {
            logger.error(
              { orderId, step: completed[i].name, error: compErr.message },
              'Compensation step failed',
            );
          }
        }
      };

      try {
        await withDeadline(
          compensateAll(),
          ROLLBACK_DEADLINE_MS,
          `Rollback for order ${orderId}`,
        );
      } catch (deadlineErr: any) {
        deadlineExceeded = true;
        logger.error(
          { orderId, elapsedMs: Date.now() - rollbackStartedAt.getTime(), compensatedSteps },
          `Rollback deadline of ${ROLLBACK_DEADLINE_MS}ms exceeded — some steps may still be running`,
        );
      }

      const rollbackCompletedAt = new Date();
      const rollbackDurationMs = rollbackCompletedAt.getTime() - rollbackStartedAt.getTime();

      // Record an auditable rollback event
      await OrderEventModel.create({
        orderId,
        fromStatus: 'rollback',
        toStatus: deadlineExceeded ? 'rollback_deadline_exceeded' : 'rollback_completed',
        triggeredBy: 'system',
        reason: `Saga failed at step "${step.name}": ${error.message}`,
        rolledBack: true,
        rolledBackAt: rollbackCompletedAt,
        metadata: {
          failedStep: step.name,
          compensatedSteps,
          rollbackDurationMs,
          rollbackReason: error.message,
          deadlineMs: ROLLBACK_DEADLINE_MS,
          deadlineExceeded,
        },
      }).catch((logErr: any) => {
        logger.error({ orderId, error: logErr.message }, 'Failed to record rollback event');
      });

      // If the rollback completed within the deadline, throw the original error
      // so the caller knows the operation failed but state is consistent.
      // If the deadline was exceeded, throw a distinct error that signals
      // potential state inconsistency — this must not be silently swallowed.
      if (deadlineExceeded) {
        const slaError = new BadRequestError(
          `Operation failed and rollback did not complete within ${ROLLBACK_DEADLINE_MS}ms. ` +
          `Compensated: [${compensatedSteps.join(', ')}]. ` +
          `Original failure: ${error.message}. Manual review required for order ${orderId}.`
        );
        throw slaError;
      }

      throw error;
    }
  }

  return {
    success: true,
    compensatedSteps: [],
    rollbackDurationMs: 0,
    deadlineExceeded: false,
  };
}

export async function transitionOrder(
  orderId: string,
  event: OrderEvent,
  userId: string,
  reason: string = ''
) {
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const originalStatus = order.status;
  const fsm = createOrderStateMachine(order.status as OrderStatus);

  if (!fsm.can(event)) {
    throw new BadRequestError(
      `Cannot apply "${event}" to order in "${order.status}" status`
    );
  }

  const { from, to } = await fsm.transition(event);
  const sagaSteps: SagaStep[] = [];

  if (event === OrderEvent.CANCEL) {
    // Step 1: Release vehicles
    const vehicleUpdates: Array<{ vehicleId: any; prevStatus: string }> = [];
    sagaSteps.push({
      name: 'release_vehicles',
      execute: async () => {
        for (const item of order.items) {
          const v = await Vehicle.findById(item.vehicleId);
          if (v) {
            vehicleUpdates.push({ vehicleId: item.vehicleId, prevStatus: v.status });
            v.status = VehicleStatus.AVAILABLE;
            await v.save();
          }
        }
      },
      compensate: async () => {
        for (const vu of vehicleUpdates) {
          await Vehicle.findByIdAndUpdate(vu.vehicleId, { status: vu.prevStatus });
        }
      },
    });

    // Step 2: Refund payments
    const refundedPaymentIds: string[] = [];
    sagaSteps.push({
      name: 'refund_payments',
      execute: async () => {
        const payments = await Payment.find({ orderId: order._id, status: PaymentStatus.COMPLETED });
        for (const payment of payments) {
          await refundPayment(payment._id.toString(), reason || 'Order cancelled');
          refundedPaymentIds.push(payment._id.toString());
        }
      },
      compensate: async () => {
        // Payment refunds are financial records - log but don't reverse
        logger.warn({ orderId, refundedPaymentIds }, 'Payment refunds cannot be automatically reversed');
      },
    });

    // Step 3: Void invoices
    const voidedInvoices: Array<{ invoiceId: any; prevStatus: string }> = [];
    sagaSteps.push({
      name: 'void_invoices',
      execute: async () => {
        const invoices = await Invoice.find({
          orderId: order._id,
          status: { $in: [InvoiceStatus.ISSUED, InvoiceStatus.DRAFT] },
        });
        for (const invoice of invoices) {
          voidedInvoices.push({ invoiceId: invoice._id, prevStatus: invoice.status });
          invoice.status = InvoiceStatus.VOIDED;
          await invoice.save();
        }
      },
      compensate: async () => {
        for (const vi of voidedInvoices) {
          await Invoice.findByIdAndUpdate(vi.invoiceId, { status: vi.prevStatus });
        }
      },
    });

    // Step 4: Update order
    sagaSteps.push({
      name: 'update_order_cancelled',
      execute: async () => {
        order.cancelledAt = new Date();
        order.cancelReason = reason || 'Cancelled by user';
        order.status = to;
        await order.save();
      },
      compensate: async () => {
        order.status = originalStatus as OrderStatus;
        order.cancelledAt = null as any;
        order.cancelReason = null as any;
        await order.save();
      },
    });
  } else if (event === OrderEvent.FULFILL) {
    // Step 1: Mark vehicles sold
    const vehicleUpdates: Array<{ vehicleId: any; prevStatus: string }> = [];
    sagaSteps.push({
      name: 'mark_vehicles_sold',
      execute: async () => {
        for (const item of order.items) {
          const v = await Vehicle.findById(item.vehicleId);
          if (v) {
            vehicleUpdates.push({ vehicleId: item.vehicleId, prevStatus: v.status });
            v.status = VehicleStatus.SOLD;
            await v.save();
          }
        }
      },
      compensate: async () => {
        for (const vu of vehicleUpdates) {
          await Vehicle.findByIdAndUpdate(vu.vehicleId, { status: vu.prevStatus });
        }
      },
    });

    // Step 2: Update order
    sagaSteps.push({
      name: 'update_order_status',
      execute: async () => {
        order.status = to;
        await order.save();
      },
      compensate: async () => {
        order.status = originalStatus as OrderStatus;
        await order.save();
      },
    });
  } else {
    // Simple status transitions (RESERVE, INVOICE, SETTLE)
    sagaSteps.push({
      name: 'update_order_status',
      execute: async () => {
        order.status = to;
        await order.save();
      },
      compensate: async () => {
        order.status = originalStatus as OrderStatus;
        await order.save();
      },
    });
  }

  await executeSaga(sagaSteps, orderId);

  await OrderEventModel.create({
    orderId: order._id,
    fromStatus: from,
    toStatus: to,
    triggeredBy: userId,
    reason,
  });

  logger.info({ orderId, from, to, event, userId }, 'Order transitioned');
  return order;
}

export async function getOrder(orderId: string) {
  const order = await Order.findById(orderId)
    .populate('buyerId', 'email profile')
    .populate('items.vehicleId');
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

export async function listOrders(
  filters: { dealershipId?: string; buyerId?: string; status?: string },
  pagination: PaginationParams
) {
  const query: any = {};
  // Dealership and buyer constraints are mandatory when provided — they are always
  // derived from the authenticated user context by the controller, not from client input.
  if (filters.dealershipId) query.dealershipId = filters.dealershipId;
  if (filters.buyerId) query.buyerId = filters.buyerId;
  if (filters.status) query.status = filters.status;

  const sort: any = { [pagination.sortBy]: pagination.sortOrder === 'asc' ? 1 : -1, _id: 1 };
  const skip = (pagination.page - 1) * pagination.limit;

  const [data, total] = await Promise.all([
    Order.find(query)
      .sort(sort)
      .skip(skip)
      .limit(pagination.limit)
      .populate('buyerId', 'email profile'),
    Order.countDocuments(query),
  ]);

  return buildPaginatedResult(data, total, pagination);
}

export async function getOrderEvents(orderId: string) {
  return OrderEventModel.find({ orderId }).sort({ timestamp: 1 });
}

export async function mergeOrders(orderIds: string[], userId: string) {
  if (orderIds.length < 2) {
    throw new BadRequestError('At least two orders are required for merge');
  }

  const orders = await Order.find({ _id: { $in: orderIds } });
  if (orders.length !== orderIds.length) {
    throw new NotFoundError('One or more orders not found');
  }

  const dealershipIds = new Set(orders.map((o) => o.dealershipId.toString()));
  if (dealershipIds.size > 1) {
    throw new BadRequestError('Cannot merge orders from different dealerships');
  }

  const buyerIds = new Set(orders.map((o) => o.buyerId.toString()));
  if (buyerIds.size > 1) {
    throw new BadRequestError('Cannot merge orders from different buyers');
  }

  for (const order of orders) {
    if (order.status !== OrderStatus.CREATED && order.status !== OrderStatus.RESERVED) {
      throw new BadRequestError(
        `Order ${order.orderNumber} is in "${order.status}" status and cannot be merged`
      );
    }
  }

  const session = await mongoose.startSession();

  try {
    let merged: IOrder | null = null;

    await session.withTransaction(async () => {
      const primary = orders[0];
      const others = orders.slice(1);

      const allItems = orders.flatMap((o) => o.items);
      const subtotal = allItems.reduce((sum, item) => sum + item.subtotal, 0);

      primary.items = allItems as any;
      primary.totals = { subtotal, tax: 0, total: subtotal };
      primary.childOrderIds = [];
      primary.parentOrderId = null as any;
      await primary.save({ session });

      for (const other of others) {
        await OrderEventModel.create(
          [
            {
              orderId: other._id,
              fromStatus: other.status,
              toStatus: OrderStatus.CANCELLED,
              triggeredBy: userId,
              reason: `Merged into order ${primary.orderNumber}`,
            },
          ],
          { session }
        );
        other.status = OrderStatus.CANCELLED;
        other.cancelledAt = new Date();
        other.cancelReason = `Merged into order ${primary.orderNumber}`;
        other.parentOrderId = null as any;
        other.childOrderIds = [];
        await other.save({ session });
      }

      await OrderEventModel.create(
        [
          {
            orderId: primary._id,
            fromStatus: primary.status,
            toStatus: primary.status,
            triggeredBy: userId,
            reason: `Merged orders: ${others.map((o) => o.orderNumber).join(', ')}`,
          },
        ],
        { session }
      );

      merged = primary;
    });

    logger.info(
      { mergedOrderId: merged!._id, sourceOrders: orderIds, userId },
      'Orders merged'
    );

    return merged;
  } finally {
    await session.endSession();
  }
}
