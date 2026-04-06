import { PermissionOverride } from '../models/permission-override.model';
import { DocumentModel } from '../models/document.model';
import { User } from '../models/user.model';
import { Role, PermissionEffect } from '../types/enums';
import { BadRequestError } from '../lib/errors';

const DEFAULT_PERMISSIONS: Record<string, Record<string, string[]>> = {
  document: {
    [Role.ADMIN]: ['read', 'write', 'delete', 'download', 'share', 'submit', 'approve'],
    [Role.DEALERSHIP_STAFF]: ['read', 'write', 'delete', 'download', 'share', 'submit'],
    [Role.FINANCE_REVIEWER]: ['read', 'download', 'submit', 'approve'],
    [Role.BUYER]: ['read', 'download'],
  },
  order: {
    [Role.ADMIN]: ['read', 'write', 'delete'],
    [Role.DEALERSHIP_STAFF]: ['read', 'write'],
    [Role.FINANCE_REVIEWER]: ['read'],
    [Role.BUYER]: ['read'],
  },
};

export async function checkPermission(
  userId: string,
  role: string,
  dealershipId: string,
  resource: string,
  resourceId: string | null,
  action: string,
  sensitiveFlag: boolean = false
): Promise<boolean> {
  if (role === Role.ADMIN) return true;

  if (sensitiveFlag && role !== Role.FINANCE_REVIEWER && role !== Role.ADMIN) {
    const override = await PermissionOverride.findOne({
      dealershipId,
      resource,
      resourceId,
      userId,
      actions: action,
      effect: PermissionEffect.ALLOW,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (override) return true;

    // Also check document-level overrides for document resources
    if (resource === 'document' && resourceId) {
      const hasDocOverride = await checkDocumentLevelOverride(resourceId, userId, action);
      if (hasDocOverride) return true;
    }

    return false;
  }

  // Check PermissionOverride model (admin-managed overrides)
  if (resourceId) {
    const userOverride = await PermissionOverride.findOne({
      dealershipId,
      resource,
      resourceId,
      userId,
      actions: action,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (userOverride) return userOverride.effect === PermissionEffect.ALLOW;

    const roleOverride = await PermissionOverride.findOne({
      dealershipId,
      resource,
      resourceId,
      role,
      userId: null,
      actions: action,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (roleOverride) return roleOverride.effect === PermissionEffect.ALLOW;
  }

  // Check document-level overrides (from share workflow)
  if (resource === 'document' && resourceId) {
    const hasDocOverride = await checkDocumentLevelOverride(resourceId, userId, action);
    if (hasDocOverride) return true;
  }

  const userDealershipOverride = await PermissionOverride.findOne({
    dealershipId,
    resource,
    resourceId: null,
    userId,
    actions: action,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  if (userDealershipOverride) return userDealershipOverride.effect === PermissionEffect.ALLOW;

  const roleDealershipOverride = await PermissionOverride.findOne({
    dealershipId,
    resource,
    resourceId: null,
    role,
    userId: null,
    actions: action,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  if (roleDealershipOverride) return roleDealershipOverride.effect === PermissionEffect.ALLOW;

  const resourceDefaults = DEFAULT_PERMISSIONS[resource];
  if (!resourceDefaults) return false;
  const roleDefaults = resourceDefaults[role];
  if (!roleDefaults) return false;
  return roleDefaults.includes(action);
}

/**
 * Returns the IDs of sensitive documents in the given dealership that the user
 * has explicit read access to (via PermissionOverride or document-level share).
 * Used by the document listing to build a correct DB query that includes
 * permitted sensitive docs without post-query filtering.
 */
export async function getPermittedSensitiveDocIds(
  userId: string,
  role: string,
  dealershipId: string,
): Promise<string[]> {
  // Find admin-managed overrides that grant read on any sensitive document
  const overrides = await PermissionOverride.find({
    dealershipId,
    resource: 'document',
    userId,
    actions: 'read',
    effect: PermissionEffect.ALLOW,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).select('resourceId');

  const overrideDocIds = overrides
    .filter((o) => o.resourceId)
    .map((o) => o.resourceId!.toString());

  // Find documents shared directly with this user via document-level overrides
  const sharedDocs = await DocumentModel.find({
    dealershipId,
    sensitiveFlag: true,
    'permissions.overrides': {
      $elemMatch: { userId, actions: 'read' },
    },
  }).select('_id');

  const sharedDocIds = sharedDocs.map((d) => d._id.toString());

  return [...new Set([...overrideDocIds, ...sharedDocIds])];
}

async function checkDocumentLevelOverride(
  documentId: string,
  userId: string,
  action: string
): Promise<boolean> {
  const doc = await DocumentModel.findById(documentId).select('permissions');
  if (!doc) return false;

  const override = doc.permissions.overrides.find(
    (o) => o.userId.toString() === userId && o.actions.includes(action)
  );
  return !!override;
}
