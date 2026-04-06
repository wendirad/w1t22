import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../lib/errors';
import * as cartService from '../services/cart.service';
import { logAuditEvent } from '../services/audit.service';

function resolveDealershipId(req: Request): string {
  // Non-admin users: always use their assigned dealership (never trust client input)
  if (req.user!.role !== 'admin') {
    const id = req.user!.dealershipId || req.scope?.dealershipId;
    if (!id) throw new BadRequestError('User is not associated with a dealership');
    return id;
  }
  // Admin: use scope set by X-Dealership-Id header (validated by dealershipScope middleware)
  const id = req.scope?.dealershipId;
  if (!id) throw new BadRequestError('Admin must specify dealership via X-Dealership-Id header');
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
    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'cart.add_item',
      resourceType: 'cart',
      resourceId: cart._id?.toString() || '',
      after: { vehicleId: req.body.vehicleId, addOnServices: req.body.addOnServices },
      requestId: (req as any).requestId,
    });
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

export async function removeFromCart(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = resolveDealershipId(req);
    const cart = await cartService.removeFromCart(req.user!.id, dealershipId, req.params.vehicleId);
    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'cart.remove_item',
      resourceType: 'cart',
      resourceId: cart._id?.toString() || '',
      after: { removedVehicleId: req.params.vehicleId },
      requestId: (req as any).requestId,
    });
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
