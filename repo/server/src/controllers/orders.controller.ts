import { Request, Response, NextFunction } from 'express';
import { BadRequestError, ForbiddenError } from '../lib/errors';
import * as orderService from '../services/order/order.service';
import { parsePaginationParams } from '../lib/pagination';
import { logAuditEvent } from '../services/audit.service';

function assertOrderAccess(order: any, req: Request) {
  if (req.user!.role === 'admin') return;

  const userDealership = req.user!.dealershipId || req.scope?.dealershipId;
  const orderDealership = order.dealershipId?.toString();
  const orderBuyerId = (order.buyerId as any)?._id?.toString() || order.buyerId?.toString();

  // Buyers: must own the order AND be in the same dealership
  if (req.user!.role === 'buyer') {
    if (orderBuyerId !== req.user!.id) {
      throw new ForbiddenError('You do not have access to this order');
    }
    if (userDealership && orderDealership !== userDealership) {
      throw new ForbiddenError('You do not have access to this order');
    }
    return;
  }

  // Staff/Finance: scoped to their dealership only
  if (!userDealership || orderDealership !== userDealership) {
    throw new ForbiddenError('You do not have access to this order');
  }
}

// Events that require staff/finance/admin role — buyers can only CANCEL their own orders
const PRIVILEGED_TRANSITIONS = new Set(['INVOICE', 'SETTLE', 'FULFILL']);

function assertTransitionRole(event: string, role: string) {
  if (PRIVILEGED_TRANSITIONS.has(event) && role === 'buyer') {
    throw new ForbiddenError(`Buyers cannot perform "${event}" transition`);
  }
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = req.user!.role === 'admin'
      ? req.scope?.dealershipId
      : (req.user!.dealershipId || req.scope?.dealershipId);
    if (!dealershipId) {
      throw new BadRequestError('dealershipId is required. Admin must use X-Dealership-Id header.');
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
    assertOrderAccess(order, req);
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

    if (role === 'buyer') {
      // Buyers can only see their own orders, scoped to their dealership
      filters.buyerId = req.user!.id;
      const buyerDealership = req.user!.dealershipId || req.scope?.dealershipId;
      if (buyerDealership) filters.dealershipId = buyerDealership;
    } else if (role === 'admin') {
      // Admins can optionally filter by buyer or dealership
      if (req.query.buyerId) filters.buyerId = req.query.buyerId as string;
      if (req.scope?.dealershipId) filters.dealershipId = req.scope.dealershipId;
      else if (req.query.dealershipId) filters.dealershipId = req.query.dealershipId as string;
    } else {
      // Staff/finance: always scoped to their dealership — never trust client input
      filters.dealershipId = req.user!.dealershipId || req.scope?.dealershipId;
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
    assertOrderAccess(beforeOrder, req);
    const { event, reason } = req.body;
    assertTransitionRole(event, req.user!.role);
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
    const order = await orderService.getOrder(req.params.id);
    assertOrderAccess(order, req);
    const events = await orderService.getOrderEvents(req.params.id);
    res.json(events);
  } catch (error) {
    next(error);
  }
}

export async function mergeOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderIds } = req.body;
    // Validate access to all orders before merging
    for (const oid of orderIds) {
      const order = await orderService.getOrder(oid);
      assertOrderAccess(order, req);
    }
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
