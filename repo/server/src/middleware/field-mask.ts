import { Request, Response, NextFunction } from 'express';
import { Role } from '../types/enums';

interface MaskRule {
  field: string;
  visibleChars: number;
  allowedRoles: Role[];
}

const MASK_RULES: MaskRule[] = [
  {
    field: 'driversLicense',
    visibleChars: 4,
    allowedRoles: [Role.ADMIN, Role.FINANCE_REVIEWER],
  },
  {
    field: 'ssn',
    visibleChars: 4,
    allowedRoles: [Role.ADMIN, Role.FINANCE_REVIEWER],
  },
  {
    field: 'phone',
    visibleChars: 4,
    allowedRoles: [Role.ADMIN, Role.DEALERSHIP_STAFF, Role.FINANCE_REVIEWER],
  },
];

function maskValue(value: string, visibleChars: number): string {
  if (value.length <= visibleChars) return value;
  const visible = value.slice(-visibleChars);
  const masked = '*'.repeat(value.length - visibleChars);
  return masked + visible;
}

function applyMask(obj: any, role: Role): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => applyMask(item, role));
  }

  for (const rule of MASK_RULES) {
    if (obj[rule.field] && typeof obj[rule.field] === 'string' && !rule.allowedRoles.includes(role)) {
      obj[rule.field] = maskValue(obj[rule.field], rule.visibleChars);
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key]) && !(obj[key] instanceof Date)) {
      applyMask(obj[key], role);
    }
  }

  return obj;
}

export function fieldMask(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    if (req.user && body) {
      const serialized = JSON.parse(JSON.stringify(body));
      return originalJson(applyMask(serialized, req.user.role as Role));
    }
    return originalJson(body);
  };

  next();
}
