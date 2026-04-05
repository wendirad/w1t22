import { User } from '../../models/user.model';
import { Order } from '../../models/order.model';
import { DocumentModel } from '../../models/document.model';
import { Payment } from '../../models/payment.model';
import { Consent } from '../../models/consent.model';
import { AuditLog } from '../../models/audit-log.model';
import { NotFoundError } from '../../lib/errors';
import logger from '../../lib/logger';

export async function exportUserData(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User not found');

  const [orders, documents, payments, consents, auditLogs] = await Promise.all([
    Order.find({ buyerId: userId }),
    DocumentModel.find({ uploadedBy: userId }),
    Payment.find({ 'metadata.userId': userId }),
    Consent.find({ userId }),
    AuditLog.find({ 'actor.userId': userId }).limit(1000),
  ]);

  const exportData = {
    exportDate: new Date().toISOString(),
    user: {
      email: user.email,
      role: user.role,
      profile: user.profile,
      createdAt: user.createdAt,
    },
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      totals: o.totals,
      createdAt: o.createdAt,
    })),
    documents: documents.map((d) => ({
      filename: d.originalFilename,
      type: d.type,
      createdAt: d.createdAt,
    })),
    payments: payments.map((p) => ({
      amount: p.amount,
      method: p.method,
      status: p.status,
      createdAt: p.createdAt,
    })),
    consents,
    auditLogCount: auditLogs.length,
  };

  logger.info({ userId }, 'User data exported');

  return exportData;
}
