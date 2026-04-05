import mongoose from 'mongoose';
import { Order, IOrder } from '../../models/order.model';
import { OrderEvent as OrderEventModel } from '../../models/order-event.model';
import { Cart } from '../../models/cart.model';
import { Vehicle } from '../../models/vehicle.model';
import { OrderStatus, OrderEvent, VehicleStatus } from '../../types/enums';
import { createOrderStateMachine } from './order-state-machine';
import { NotFoundError, BadRequestError, ConflictError } from '../../lib/errors';
import { PaginationParams, buildPaginatedResult } from '../../lib/pagination';
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
      for (const item of order.items) {
        await Vehicle.findByIdAndUpdate(item.vehicleId, {
          status: VehicleStatus.AVAILABLE,
        });
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
      logger.error({ orderId, event }, 'Order transition timed out, rolling back');
      const freshOrder = await Order.findById(orderId);
      if (freshOrder && freshOrder.status !== order.status) {
        freshOrder.status = order.status as OrderStatus;
        await freshOrder.save();
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
