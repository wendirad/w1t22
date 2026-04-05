import { Request, Response, NextFunction } from 'express';
import * as invoiceService from '../services/finance/invoice.service';
import * as paymentService from '../services/finance/payment.service';
import * as walletService from '../services/finance/wallet-ledger.service';
import * as reconciliationService from '../services/finance/reconciliation.service';

export async function getInvoicePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const preview = await invoiceService.generateInvoicePreview(req.params.orderId);
    res.json(preview);
  } catch (error) {
    next(error);
  }
}

export async function createInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.createInvoice(req.params.orderId);
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
}

export async function getInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id);
    res.json(invoice);
  } catch (error) {
    next(error);
  }
}

export async function processPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const dealershipId = req.body.dealershipId || req.scope?.dealershipId || req.user!.dealershipId;
    const payment = await paymentService.processPayment({
      orderId: req.body.orderId,
      invoiceId: req.body.invoiceId,
      dealershipId,
      method: req.body.method,
      amount: req.body.amount,
      idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'] as string,
      metadata: { userId: req.user!.id, ...req.body.metadata },
    });
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
}

function resolveAccountId(req: Request): string {
  if (req.query.accountId) return req.query.accountId as string;
  const role = req.user!.role;
  if (role === 'buyer') return `buyer:${req.user!.id}`;
  const dealershipId = req.scope?.dealershipId || req.user!.dealershipId;
  if (dealershipId && (role === 'dealership_staff' || role === 'finance_reviewer')) {
    return `dealership:${dealershipId}`;
  }
  if (role === 'admin' && req.scope?.dealershipId) {
    return `dealership:${req.scope.dealershipId}`;
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
    res.json({ results });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentsByOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const payments = await paymentService.getPaymentsByOrder(req.params.orderId);
    res.json(payments);
  } catch (error) {
    next(error);
  }
}
