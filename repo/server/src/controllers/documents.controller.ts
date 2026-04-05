import { Request, Response, NextFunction } from 'express';
import * as documentService from '../services/document/document.service';
import { checkPermission } from '../services/permission.service';
import { ForbiddenError } from '../lib/errors';
import { parsePaginationParams } from '../lib/pagination';

export async function uploadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ code: 400, msg: 'No file provided' });
      return;
    }

    const dealershipId = req.body.dealershipId || req.scope?.dealershipId || req.user!.dealershipId!;
    const doc = await documentService.uploadDocument(req.file, {
      dealershipId,
      uploadedBy: req.user!.id,
      type: req.body.type || 'other',
      orderId: req.body.orderId,
      vehicleId: req.body.vehicleId,
      sensitiveFlag: req.body.sensitiveFlag === 'true',
    });

    res.status(201).json(doc);
  } catch (error) {
    next(error);
  }
}

export async function getDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();

    const hasPermission = await checkPermission(
      req.user!.id,
      req.user!.role,
      dealershipId,
      'document',
      doc._id.toString(),
      'read',
      doc.sensitiveFlag
    );

    if (!hasPermission) throw new ForbiddenError('No permission to view this document');

    res.json(doc);
  } catch (error) {
    next(error);
  }
}

export async function downloadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();

    const hasPermission = await checkPermission(
      req.user!.id,
      req.user!.role,
      dealershipId,
      'document',
      doc._id.toString(),
      'download',
      doc.sensitiveFlag
    );

    if (!hasPermission) throw new ForbiddenError('No permission to download this document');

    const { buffer, mimeType, filename } = await documentService.downloadDocument(req.params.id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function listDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    const filters = {
      dealershipId: req.query.dealershipId as string || req.scope?.dealershipId,
      orderId: req.query.orderId as string,
      uploadedBy: req.query.uploadedBy as string,
      type: req.query.type as string,
    };
    const result = await documentService.listDocuments(filters, pagination);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();

    const hasPermission = await checkPermission(
      req.user!.id,
      req.user!.role,
      dealershipId,
      'document',
      doc._id.toString(),
      'delete',
      doc.sensitiveFlag
    );

    if (!hasPermission) throw new ForbiddenError('No permission to delete this document');

    await documentService.deleteDocument(req.params.id, req.user!.id);
    res.json({ msg: 'Document deleted' });
  } catch (error) {
    next(error);
  }
}
