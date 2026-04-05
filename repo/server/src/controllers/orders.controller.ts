import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../lib/errors';
import * as orderService from '../services/order/order.service';
import { parsePaginationParams } from '../lib/pagination';
import { logAuditEvent } from '../services/audit.service';

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = req.body.dealershipId || req.scope?.dealershipId || req.user!.dealershipId;
    if (!dealershipId) {
      throw new BadRequestError('dealershipId is required');
    }
    const idempotencyKey = req.body.idempotencyKey || req.headers['x-idempotency-key'] as string;
    const result = await orderService.createOrderFromCart(req.user!.id, dealershipId, idempotencyKey);
    const orders = Array.isArray(result) ? result : [result];
    for (const order of orders) {
      await logAuditEvent({
        dealershipId,
        userId: req.user!.id,
        role: req.user!.role,
        ip: req.ip || '',
        action: 'order.create',
        resourceType: 'order',
        resourceId: order._id?.toString() || '',
        after: { orderNumber: order.orderNumber, status: order.status, totals: order.totals },
        requestId: (req as any).requestId,
      });
    }
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.getOrder(req.params.id);
    res.json(order);
  } catch (error) {
    next(error);
  }
}

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    const role = req.user!.role;
    const filters: any = { status: req.query.status as string };

    if (req.query.buyerId) {
      filters.buyerId = req.query.buyerId as string;
    } else if (role === 'buyer') {
      filters.buyerId = req.user!.id;
    }

    if (req.query.dealershipId) {
      filters.dealershipId = req.query.dealershipId as string;
    } else if (req.scope?.dealershipId) {
      filters.dealershipId = req.scope.dealershipId;
    }
    const result = await orderService.listOrders(filters, pagination);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function transitionOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const beforeOrder = await orderService.getOrder(req.params.id);
    const { event, reason } = req.body;
    const order = await orderService.transitionOrder(req.params.id, event, req.user!.id, reason);
    await logAuditEvent({
      dealershipId: beforeOrder.dealershipId?.toString(),
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: `order.transition.${event}`,
      resourceType: 'order',
      resourceId: req.params.id,
      before: { status: beforeOrder.status },
      after: { status: (order as any).status, reason },
      requestId: (req as any).requestId,
    });
    res.json(order);
  } catch (error) {
    next(error);
  }
}

export async function getOrderEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const events = await orderService.getOrderEvents(req.params.id);
    res.json(events);
  } catch (error) {
    next(error);
  }
}

export async function mergeOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderIds } = req.body;
    const merged = await orderService.mergeOrders(orderIds, req.user!.id);
    await logAuditEvent({
      dealershipId: (merged as any).dealershipId?.toString(),
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'order.merge',
      resourceType: 'order',
      resourceId: (merged as any)._id?.toString() || '',
      after: { mergedFrom: orderIds, orderNumber: (merged as any).orderNumber },
      requestId: (req as any).requestId,
    });
    res.json(merged);
  } catch (error) {
    next(error);
  }
}
