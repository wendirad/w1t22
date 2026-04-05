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
import logger from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';

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
  const existing = await Order.findOne({ idempotencyKey });
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

        const orderKey = groups.size > 1 ? `${idempotencyKey}-${orders.length}` : idempotencyKey;

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
  } finally {
    await session.endSession();
  }

  logger.info(
    { orderCount: orders.length, userId, dealershipId },
    'Orders created from cart'
  );

  return orders.length === 1 ? orders[0] : orders;
}

export async function transitionOrder(
  orderId: string,
  event: OrderEvent,
  userId: string,
  reason: string = ''
) {
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const fsm = createOrderStateMachine(order.status as OrderStatus);

  if (!fsm.can(event)) {
    throw new BadRequestError(
      `Cannot apply "${event}" to order in "${order.status}" status`
    );
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Transition timeout')), 5000)
  );

  const transitionPromise = (async () => {
    const { from, to } = await fsm.transition(event);

    if (event === OrderEvent.CANCEL) {
      // Release all reserved vehicles back to available
      for (const item of order.items) {
        await Vehicle.findByIdAndUpdate(item.vehicleId, {
          status: VehicleStatus.AVAILABLE,
        });
      }

      // Refund any completed payments for this order
      const payments = await Payment.find({
        orderId: order._id,
        status: PaymentStatus.COMPLETED,
      });
      for (const payment of payments) {
        try {
          await refundPayment(payment._id.toString(), reason || 'Order cancelled');
        } catch (refundErr: any) {
          logger.error(
            { paymentId: payment._id, orderId: order._id, error: refundErr.message },
            'Failed to refund payment during order cancellation'
          );
        }
      }

      // Void any unpaid invoices
      const invoices = await Invoice.find({
        orderId: order._id,
        status: { $in: [InvoiceStatus.ISSUED, InvoiceStatus.DRAFT] },
      });
      for (const invoice of invoices) {
        invoice.status = InvoiceStatus.VOIDED;
        await invoice.save();
      }

      order.cancelledAt = new Date();
      order.cancelReason = reason || 'Cancelled by user';
    }

    if (event === OrderEvent.FULFILL) {
      for (const item of order.items) {
        await Vehicle.findByIdAndUpdate(item.vehicleId, {
          status: VehicleStatus.SOLD,
        });
      }
    }

    order.status = to;
    await order.save();

    await OrderEventModel.create({
      orderId: order._id,
      fromStatus: from,
      toStatus: to,
      triggeredBy: userId,
      reason,
    });

    logger.info(
      { orderId, from, to, event, userId },
      'Order transitioned'
    );

    return order;
  })();

  try {
    return await Promise.race([transitionPromise, timeoutPromise]);
  } catch (error: any) {
    if (error.message === 'Transition timeout') {
      logger.error({ orderId, event }, 'Order transition timed out, rolling back with compensation');
      const freshOrder = await Order.findById(orderId);
      if (freshOrder && freshOrder.status !== order.status) {
        // Restore order status
        freshOrder.status = order.status as OrderStatus;
        await freshOrder.save();

        // Compensate vehicle status changes
        if (event === OrderEvent.CANCEL) {
          for (const item of freshOrder.items) {
            await Vehicle.findByIdAndUpdate(item.vehicleId, {
              status: VehicleStatus.RESERVED,
            });
          }
        }
        if (event === OrderEvent.FULFILL) {
          for (const item of freshOrder.items) {
            await Vehicle.findByIdAndUpdate(item.vehicleId, {
              status: VehicleStatus.RESERVED,
            });
          }
        }

        await OrderEventModel.create({
          orderId: freshOrder._id,
          fromStatus: freshOrder.status,
          toStatus: order.status,
          triggeredBy: userId,
          reason: 'Timeout rollback with compensation',
          rolledBack: true,
          rolledBackAt: new Date(),
        });
      }
      throw new BadRequestError('Order transition timed out');
    }
    throw error;
  }
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
  if (filters.dealershipId) query.dealershipId = filters.dealershipId;
  if (filters.buyerId) query.buyerId = filters.buyerId;
  if (filters.status) query.status = filters.status;

  const sort: any = { [pagination.sortBy]: pagination.sortOrder === 'asc' ? 1 : -1 };
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
