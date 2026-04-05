import { Router } from 'express';
import * as financeController from '../controllers/finance.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { dealershipScope } from '../middleware/dealership-scope';
import { Role } from '../types/enums';

const router = Router();

router.use(authenticate, dealershipScope);

router.get('/invoices/:orderId/preview', financeController.getInvoicePreview);
router.post('/invoices/:orderId', financeController.createInvoice);
router.get('/invoices/detail/:id', financeController.getInvoice);
router.post('/payments', financeController.processPayment);
router.get('/payments/:orderId', financeController.getPaymentsByOrder);
router.get('/wallet/balance', financeController.getWalletBalance);
router.get('/wallet/history', financeController.getWalletHistory);
router.post(
  '/reconciliation',
  requireRole(Role.ADMIN),
  financeController.runReconciliation
);

export default router;
