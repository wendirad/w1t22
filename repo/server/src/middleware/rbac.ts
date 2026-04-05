import { Request, Response, NextFunction } from 'express';
import { Role } from '../types/enums';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role as Role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}
