import { PermissionOverride } from '../models/permission-override.model';
import { Role, PermissionEffect } from '../types/enums';

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
    return !!override;
  }

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
