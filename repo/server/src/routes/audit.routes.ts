import { Router } from 'express';
import * as auditController from '../controllers/audit.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { dealershipScope } from '../middleware/dealership-scope';
import { Role } from '../types/enums';

const router = Router();

router.use(authenticate, dealershipScope, requireRole(Role.ADMIN, Role.FINANCE_REVIEWER));

router.get('/', auditController.getAuditLogs);

export default router;
