import { Request, Response, NextFunction } from 'express';
import * as cartService from '../services/cart.service';

export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = req.query.dealershipId as string || req.scope?.dealershipId || req.user!.dealershipId!;
    const cart = await cartService.getCart(req.user!.id, dealershipId);
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

export async function addToCart(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = req.body.dealershipId || req.scope?.dealershipId || req.user!.dealershipId!;
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
    const dealershipId = req.query.dealershipId as string || req.scope?.dealershipId || req.user!.dealershipId!;
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
