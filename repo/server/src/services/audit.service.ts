import { AuditLog } from '../models/audit-log.model';
import { PaginationParams, buildPaginatedResult } from '../lib/pagination';

export async function logAuditEvent(params: {
  dealershipId?: string;
  userId: string;
  role: string;
  ip: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  requestId?: string;
}) {
  return AuditLog.create({
    dealershipId: params.dealershipId || null,
    actor: {
      userId: params.userId,
      role: params.role,
      ip: params.ip,
    },
    action: params.action,
    resource: {
      type: params.resourceType,
      id: params.resourceId,
    },
    before: params.before || null,
    after: params.after || null,
    requestId: params.requestId || '',
  });
}

export async function getAuditLogs(
  filters: {
    dealershipId?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    action?: string;
  },
  pagination: PaginationParams
) {
  const query: any = {};
  if (filters.dealershipId) query.dealershipId = filters.dealershipId;
  if (filters.userId) query['actor.userId'] = filters.userId;
  if (filters.resourceType) query['resource.type'] = filters.resourceType;
  if (filters.resourceId) query['resource.id'] = filters.resourceId;
  if (filters.action) query.action = new RegExp(filters.action, 'i');

  const sort: any = { timestamp: -1 };
  const skip = (pagination.page - 1) * pagination.limit;

  const [data, total] = await Promise.all([
    AuditLog.find(query).sort(sort).skip(skip).limit(pagination.limit),
    AuditLog.countDocuments(query),
  ]);

  return buildPaginatedResult(data, total, pagination);
}
