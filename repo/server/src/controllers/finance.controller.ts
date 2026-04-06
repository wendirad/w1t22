import { Request, Response, NextFunction } from 'express';
import * as invoiceService from '../services/finance/invoice.service';
import * as paymentService from '../services/finance/payment.service';
import * as walletService from '../services/finance/wallet-ledger.service';
import * as reconciliationService from '../services/finance/reconciliation.service';
import { DiscrepancyTicket } from '../models/discrepancy-ticket.model';
import { logAuditEvent } from '../services/audit.service';
import { parsePaginationParams, buildPaginatedResult } from '../lib/pagination';
import { NotFoundError, ForbiddenError } from '../lib/errors';
import * as orderService from '../services/order/order.service';
import { resolveAdapter } from '../services/finance/payment-adapter';

function assertFinanceAccess(order: any, req: Request) {
  if (req.user!.role === 'admin') return;
  if (req.user!.role === 'finance_reviewer') {
    const userDealership = req.user!.dealershipId || req.scope?.dealershipId;
    if (userDealership && order.dealershipId?.toString() === userDealership) return;
  }
  const userDealership = req.user!.dealershipId || req.scope?.dealershipId;
  if (userDealership && order.dealershipId?.toString() === userDealership) {
    if (order.buyerId?.toString() === req.user!.id || (order.buyerId as any)?._id?.toString() === req.user!.id) return;
    if (req.user!.role === 'dealership_staff') return;
  }
  throw new ForbiddenError('You do not have access to this financial record');
}

export async function getInvoicePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.getOrder(req.params.orderId);
    assertFinanceAccess(order, req);
    const preview = await invoiceService.generateInvoicePreview(req.params.orderId);
    res.json(preview);
  } catch (error) {
    next(error);
  }
}

export async function createInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.getOrder(req.params.orderId);
    assertFinanceAccess(order, req);
    const invoice = await invoiceService.createInvoice(req.params.orderId);
    await logAuditEvent({
      dealershipId: invoice.dealershipId?.toString(),
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'invoice.create',
      resourceType: 'invoice',
      resourceId: invoice._id?.toString() || '',
      after: { invoiceNumber: invoice.invoiceNumber, total: invoice.total, status: invoice.status },
      requestId: (req as any).requestId,
    });
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
}

export async function getInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id);
    if (invoice.orderId) {
      const order = await orderService.getOrder(invoice.orderId.toString());
      assertFinanceAccess(order, req);
    }
    res.json(invoice);
  } catch (error) {
    next(error);
  }
}

export async function processPayment(req: Request, res: Response, next: NextFunction) {
  try {
    // Validate payment method first — reject disabled online methods before any DB lookups
    resolveAdapter(req.body.method);

    const dealershipId = req.user!.role === 'admin'
      ? req.scope?.dealershipId
      : (req.user!.dealershipId || req.scope?.dealershipId);
    // Validate order belongs to the user's dealership scope
    const order = await orderService.getOrder(req.body.orderId);
    assertFinanceAccess(order, req);
    const payment = await paymentService.processPayment({
      orderId: req.body.orderId,
      invoiceId: req.body.invoiceId,
      dealershipId,
      method: req.body.method,
      amount: req.body.amount,
      idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'] as string,
      metadata: { userId: req.user!.id, ...req.body.metadata },
    });
    await logAuditEvent({
      dealershipId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'payment.process',
      resourceType: 'payment',
      resourceId: payment._id?.toString() || '',
      after: { amount: payment.amount, method: payment.method, status: payment.status, adapterUsed: payment.adapterUsed },
      requestId: (req as any).requestId,
    });
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
}

function resolveAccountId(req: Request): string {
  const role = req.user!.role;
  // Admins can query specific accounts via X-Dealership-Id header scope
  if (role === 'admin' && req.scope?.dealershipId) {
    return `dealership:${req.scope.dealershipId}`;
  }
  if (role === 'buyer') return `buyer:${req.user!.id}`;
  const dealershipId = req.user!.dealershipId || req.scope?.dealershipId;
  if (dealershipId && (role === 'dealership_staff' || role === 'finance_reviewer')) {
    return `dealership:${dealershipId}`;
  }
  return `user:${req.user!.id}`;
}

export async function getWalletBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const accountId = resolveAccountId(req);
    const balance = await walletService.getBalance(accountId);
    res.json({ accountId, balance, currency: 'USD' });
  } catch (error) {
    next(error);
  }
}

export async function getWalletHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const accountId = resolveAccountId(req);
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await walletService.getTransactionHistory(accountId, limit);
    res.json({ accountId, transactions: history });
  } catch (error) {
    next(error);
  }
}

export async function runReconciliation(req: Request, res: Response, next: NextFunction) {
  try {
    const results = await reconciliationService.runReconciliation();
    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'reconciliation.run',
      resourceType: 'reconciliation',
      resourceId: 'batch',
      after: { runCount: results.length },
      requestId: (req as any).requestId,
    });
    res.json({ results });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentsByOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.getOrder(req.params.orderId);
    assertFinanceAccess(order, req);
    const payments = await paymentService.getPaymentsByOrder(req.params.orderId);
    res.json(payments);
  } catch (error) {
    next(error);
  }
}

// Discrepancy ticket endpoints
export async function listDiscrepancyTickets(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    const query: any = {};
    // Non-admin users must be scoped to their dealership
    if (req.user!.role !== 'admin') {
      query.dealershipId = req.user!.dealershipId || req.scope?.dealershipId;
    } else {
      if (req.query.dealershipId) query.dealershipId = req.query.dealershipId;
      else if (req.scope?.dealershipId) query.dealershipId = req.scope.dealershipId;
    }
    if (req.query.status) query.status = req.query.status;
    if (req.query.type) query.type = req.query.type;
    if (req.query.assignedTo) query.assignedTo = req.query.assignedTo;

    const skip = (pagination.page - 1) * pagination.limit;
    const [data, total] = await Promise.all([
      DiscrepancyTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(pagination.limit),
      DiscrepancyTicket.countDocuments(query),
    ]);
    res.json(buildPaginatedResult(data, total, pagination));
  } catch (error) {
    next(error);
  }
}

export async function getDiscrepancyTicket(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await DiscrepancyTicket.findById(req.params.id);
    if (!ticket) throw new NotFoundError('Discrepancy ticket not found');
    // Enforce dealership scope for non-admin users
    if (req.user!.role !== 'admin') {
      const userDealership = req.user!.dealershipId || req.scope?.dealershipId;
      if (ticket.dealershipId?.toString() !== userDealership) {
        throw new ForbiddenError('You do not have access to this discrepancy ticket');
      }
    }
    res.json(ticket);
  } catch (error) {
    next(error);
  }
}

export async function updateDiscrepancyTicket(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await DiscrepancyTicket.findById(req.params.id);
    if (!ticket) throw new NotFoundError('Discrepancy ticket not found');

    // Enforce dealership scope for non-admin users
    if (req.user!.role !== 'admin') {
      const userDealership = req.user!.dealershipId || req.scope?.dealershipId;
      if (ticket.dealershipId?.toString() !== userDealership) {
        throw new ForbiddenError('You do not have access to this discrepancy ticket');
      }
    }

    const before = { status: ticket.status, assignedTo: ticket.assignedTo };

    if (req.body.status) ticket.status = req.body.status;
    if (req.body.assignedTo !== undefined) ticket.assignedTo = req.body.assignedTo;
    if (req.body.resolution) {
      ticket.resolution = req.body.resolution;
      ticket.resolvedBy = req.user!.id as any;
      ticket.resolvedAt = new Date();
    }

    await ticket.save();

    await logAuditEvent({
      dealershipId: ticket.dealershipId?.toString(),
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip || '',
      action: 'discrepancy_ticket.update',
      resourceType: 'discrepancy_ticket',
      resourceId: req.params.id,
      before,
      after: { status: ticket.status, assignedTo: ticket.assignedTo, resolution: ticket.resolution },
      requestId: (req as any).requestId,
    });

    res.json(ticket);
  } catch (error) {
    next(error);
  }
}
