import { Request, Response, NextFunction } from 'express';
import { Role } from '../types/enums';
import { BadRequestError } from '../lib/errors';

export function dealershipScope(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next();
    return;
  }

  if (req.user.role === Role.ADMIN) {
    const headerDealershipId = req.headers['x-dealership-id'] as string;
    if (headerDealershipId) {
      req.scope = { dealershipId: headerDealershipId };
    }
    next();
    return;
  }

  if (!req.user.dealershipId) {
    next(new BadRequestError('User is not associated with a dealership'));
    return;
  }

  req.scope = { dealershipId: req.user.dealershipId };
  next();
}
