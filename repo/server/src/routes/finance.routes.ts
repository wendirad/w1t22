import { Router } from 'express';
import * as financeController from '../controllers/finance.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { dealershipScope } from '../middleware/dealership-scope';
import { validate } from '../middleware/validate';
import { Role } from '../types/enums';
import { processPaymentSchema, orderIdParam, mongoIdParam } from '../lib/validation-schemas';

const router = Router();

router.use(authenticate, dealershipScope);

router.get('/invoices/:orderId/preview', validate(orderIdParam, 'params'), financeController.getInvoicePreview);
router.post('/invoices/:orderId', validate(orderIdParam, 'params'), financeController.createInvoice);
router.get('/invoices/detail/:id', validate(mongoIdParam, 'params'), financeController.getInvoice);
router.post('/payments', validate(processPaymentSchema), financeController.processPayment);
router.get('/payments/:orderId', validate(orderIdParam, 'params'), financeController.getPaymentsByOrder);
router.get('/wallet/balance', financeController.getWalletBalance);
router.get('/wallet/history', financeController.getWalletHistory);
router.post(
  '/reconciliation',
  requireRole(Role.ADMIN),
  financeController.runReconciliation
);

// Discrepancy ticket review workflow
router.get('/discrepancies', requireRole(Role.ADMIN, Role.FINANCE_REVIEWER), financeController.listDiscrepancyTickets);
router.get('/discrepancies/:id', requireRole(Role.ADMIN, Role.FINANCE_REVIEWER), validate(mongoIdParam, 'params'), financeController.getDiscrepancyTicket);
router.patch('/discrepancies/:id', requireRole(Role.ADMIN, Role.FINANCE_REVIEWER), validate(mongoIdParam, 'params'), financeController.updateDiscrepancyTicket);

export default router;
