import { Request, Response, NextFunction } from 'express';
import * as auditService from '../services/audit.service';
import { parsePaginationParams } from '../lib/pagination';

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    const filters = {
      dealershipId: req.query.dealershipId as string || req.scope?.dealershipId,
      userId: req.query.userId as string,
      resourceType: req.query.resourceType as string,
      resourceId: req.query.resourceId as string,
      action: req.query.action as string,
    };
    const result = await auditService.getAuditLogs(filters, pagination);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
