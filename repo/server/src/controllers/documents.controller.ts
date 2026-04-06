import { Request, Response, NextFunction } from 'express';
import * as documentService from '../services/document/document.service';
import { checkPermission, getPermittedSensitiveDocIds } from '../services/permission.service';
import { ForbiddenError, BadRequestError } from '../lib/errors';
import { parsePaginationParams } from '../lib/pagination';
import { logAuditEvent } from '../services/audit.service';
import { User } from '../models/user.model';

/**
 * Verify the requesting user's dealership matches the resource's dealership.
 * Admins bypass this check.
 */
function assertTenantOwnership(req: Request, resourceDealershipId: string): void {
  if (req.user!.role === 'admin') return;
  const userDealership = req.user!.dealershipId || req.scope?.dealershipId;
  if (!userDealership || userDealership !== resourceDealershipId) {
    throw new ForbiddenError('You do not have access to this resource');
  }
}

export async function uploadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ code: 400, msg: 'No file provided' });
      return;
    }

    const dealershipId = req.user!.role === 'admin'
      ? req.scope?.dealershipId
      : (req.user!.dealershipId || req.scope?.dealershipId);
    if (!dealershipId) {
      res.status(400).json({ code: 400, msg: 'Dealership context required' });
      return;
    }
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
      after: { documentId: doc._id?.toString(), type: doc.type, sensitiveFlag: doc.sensitiveFlag, quarantined: doc.quarantined },
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
    assertTenantOwnership(req, dealershipId);

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
    assertTenantOwnership(req, dealershipId);

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
    const role = req.user!.role;
    const dealershipId = role === 'admin'
      ? (req.scope?.dealershipId || req.query.dealershipId as string)
      : (req.user!.dealershipId || req.scope?.dealershipId);
    const filters: any = {
      dealershipId,
      orderId: req.query.orderId as string,
      uploadedBy: req.query.uploadedBy as string,
      type: req.query.type as string,
    };

    if (role !== 'admin' && role !== 'finance_reviewer' && dealershipId) {
      // Non-privileged users: find which sensitive doc IDs they have explicit
      // overrides for, then pass a combined filter to the DB query so that
      // pagination counts and offsets are computed against the real result set.
      const permittedIds = await getPermittedSensitiveDocIds(
        req.user!.id, role, dealershipId,
      );
      filters.sensitiveAccessFilter = { permittedSensitiveIds: permittedIds };
    }

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
    assertTenantOwnership(req, dealershipId);

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
      before: { documentId: req.params.id, type: doc.type },
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
    assertTenantOwnership(req, dealershipId);

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

// Safe actions that can be delegated through sharing — higher-privilege actions
// (approve, delete, share) require explicit admin override
const SAFE_SHARE_ACTIONS = new Set(['read', 'download']);
const ADMIN_SHARE_ACTIONS = new Set(['read', 'download', 'write', 'delete', 'share', 'submit', 'approve']);

export async function shareDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id);
    const dealershipId = doc.dealershipId.toString();
    assertTenantOwnership(req, dealershipId);

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

    // Validate target user belongs to the same dealership
    const targetUser = await User.findById(req.body.targetUserId);
    if (!targetUser) throw new BadRequestError('Target user not found');
    if (targetUser.dealershipId && targetUser.dealershipId.toString() !== dealershipId
        && targetUser.role !== 'admin') {
      throw new ForbiddenError('Cannot share document with user from a different dealership');
    }

    const requestedActions: string[] = req.body.actions || ['read', 'download'];

    // Enforce sharing constraints: non-admin users can only share safe actions
    const allowedActions = req.user!.role === 'admin' ? ADMIN_SHARE_ACTIONS : SAFE_SHARE_ACTIONS;
    const invalidActions = requestedActions.filter((a) => !allowedActions.has(a));
    if (invalidActions.length > 0) {
      throw new ForbiddenError(
        `Cannot share actions [${invalidActions.join(', ')}] — only [${[...allowedActions].join(', ')}] can be delegated`
      );
    }

    // Ensure the sharer cannot grant permissions they don't themselves have
    for (const action of requestedActions) {
      const sharerHasAction = await checkPermission(
        req.user!.id,
        req.user!.role,
        dealershipId,
        'document',
        doc._id.toString(),
        action,
        doc.sensitiveFlag
      );
      if (!sharerHasAction) {
        throw new ForbiddenError(`Cannot share "${action}" permission — you do not have it yourself`);
      }
    }

    const updated = await documentService.shareDocument(req.params.id, {
      targetUserId: req.body.targetUserId,
      actions: requestedActions,
    });

    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'document.share',
      resourceType: 'document',
      resourceId: req.params.id,
      after: { sharedWith: req.body.targetUserId, actions: requestedActions },
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
    assertTenantOwnership(req, dealershipId);

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
    assertTenantOwnership(req, dealershipId);

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
