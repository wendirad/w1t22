import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import logger from '../lib/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.code).json({ code: err.code, msg: err.msg });
    return;
  }

  if (err.name === 'ValidationError') {
    res.status(422).json({ code: 422, msg: err.message });
    return;
  }

  if (err.name === 'CastError') {
    res.status(400).json({ code: 400, msg: 'Invalid ID format' });
    return;
  }

  if ((err as any).code === 11000) {
    res.status(409).json({ code: 409, msg: 'Duplicate entry' });
    return;
  }

  logger.error(
    { error: err.message, stack: err.stack, requestId: req.requestId },
    'Unhandled error'
  );

  res.status(500).json({ code: 500, msg: 'Internal server error' });
}
