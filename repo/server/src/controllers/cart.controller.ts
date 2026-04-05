import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../lib/errors';
import * as cartService from '../services/cart.service';

function resolveDealershipId(req: Request): string {
  const id = req.query.dealershipId as string || req.body?.dealershipId || req.scope?.dealershipId || req.user!.dealershipId;
  if (!id) {
    throw new BadRequestError('dealershipId is required. Admin users must provide dealershipId via query parameter or X-Dealership-Id header.');
  }
  return id;
}

export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = resolveDealershipId(req);
    const cart = await cartService.getCart(req.user!.id, dealershipId);
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

export async function addToCart(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = resolveDealershipId(req);
    const cart = await cartService.addToCart(
      req.user!.id,
      dealershipId,
      req.body.vehicleId,
      req.body.addOnServices || []
    );
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

export async function removeFromCart(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = resolveDealershipId(req);
    const cart = await cartService.removeFromCart(req.user!.id, dealershipId, req.params.vehicleId);
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

export async function getAddOns(req: Request, res: Response, next: NextFunction) {
  try {
    const addOns = cartService.getAvailableAddOns();
    res.json({ addOns });
  } catch (error) {
    next(error);
  }
}
