import { Request, Response, NextFunction } from 'express';
import * as orderService from '../services/order/order.service';
import { parsePaginationParams } from '../lib/pagination';

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = req.body.dealershipId || req.scope?.dealershipId || req.user!.dealershipId!;
    const idempotencyKey = req.body.idempotencyKey || req.headers['x-idempotency-key'] as string;
    const result = await orderService.createOrderFromCart(req.user!.id, dealershipId, idempotencyKey);
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
    const filters = {
      dealershipId: req.query.dealershipId as string || req.scope?.dealershipId,
      buyerId: req.query.buyerId as string || (req.user!.role === 'buyer' ? req.user!.id : undefined),
      status: req.query.status as string,
    };
    const result = await orderService.listOrders(filters, pagination);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function transitionOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { event, reason } = req.body;
    const order = await orderService.transitionOrder(req.params.id, event, req.user!.id, reason);
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
