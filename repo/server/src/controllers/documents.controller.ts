import { Request, Response, NextFunction } from 'express';
import * as documentService from '../services/document/document.service';
import { checkPermission } from '../services/permission.service';
import { ForbiddenError } from '../lib/errors';
import { parsePaginationParams } from '../lib/pagination';
import { logAuditEvent } from '../services/audit.service';

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

    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'document.upload',
      resourceType: 'document',
      resourceId: doc._id?.toString() || '',
      after: { filename: doc.originalFilename, type: doc.type, sensitiveFlag: doc.sensitiveFlag, quarantined: doc.quarantined },
      requestId: (req as any).requestId,
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
    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'document.delete',
      resourceType: 'document',
      resourceId: req.params.id,
      before: { filename: doc.originalFilename, type: doc.type },
      requestId: (req as any).requestId,
    });
    res.json({ msg: 'Document deleted' });
  } catch (error) {
    next(error);
  }
}

export async function editDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();

    const hasPermission = await checkPermission(
      req.user!.id,
      req.user!.role,
      dealershipId,
      'document',
      doc._id.toString(),
      'write',
      doc.sensitiveFlag
    );

    if (!hasPermission) throw new ForbiddenError('No permission to edit this document');

    const updated = await documentService.updateDocumentMetadata(req.params.id, {
      type: req.body.type,
      orderId: req.body.orderId,
      vehicleId: req.body.vehicleId,
      sensitiveFlag: req.body.sensitiveFlag,
    });

    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'document.edit',
      resourceType: 'document',
      resourceId: req.params.id,
      before: { type: doc.type, orderId: doc.orderId, vehicleId: doc.vehicleId },
      after: { type: updated.type, orderId: updated.orderId, vehicleId: updated.vehicleId },
      requestId: (req as any).requestId,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function shareDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();

    const hasPermission = await checkPermission(
      req.user!.id,
      req.user!.role,
      dealershipId,
      'document',
      doc._id.toString(),
      'share',
      doc.sensitiveFlag
    );

    if (!hasPermission) throw new ForbiddenError('No permission to share this document');

    const updated = await documentService.shareDocument(req.params.id, {
      targetUserId: req.body.targetUserId,
      actions: req.body.actions || ['read', 'download'],
    });

    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'document.share',
      resourceType: 'document',
      resourceId: req.params.id,
      after: { sharedWith: req.body.targetUserId, actions: req.body.actions },
      requestId: (req as any).requestId,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function submitDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();

    const hasPermission = await checkPermission(
      req.user!.id,
      req.user!.role,
      dealershipId,
      'document',
      doc._id.toString(),
      'submit',
      doc.sensitiveFlag
    );

    if (!hasPermission) throw new ForbiddenError('No permission to submit this document');

    const updated = await documentService.transitionDocumentStatus(req.params.id, 'submitted', req.user!.id);

    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'document.submit',
      resourceType: 'document',
      resourceId: req.params.id,
      after: { status: 'submitted' },
      requestId: (req as any).requestId,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function approveDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();

    const hasPermission = await checkPermission(
      req.user!.id,
      req.user!.role,
      dealershipId,
      'document',
      doc._id.toString(),
      'approve',
      doc.sensitiveFlag
    );

    if (!hasPermission) throw new ForbiddenError('No permission to approve this document');

    const updated = await documentService.transitionDocumentStatus(req.params.id, 'approved', req.user!.id);

    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'document.approve',
      resourceType: 'document',
      resourceId: req.params.id,
      after: { status: 'approved', comment: req.body.comment },
      requestId: (req as any).requestId,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}
