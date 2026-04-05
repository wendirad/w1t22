import { Router } from 'express';
import * as vehiclesController from '../controllers/vehicles.controller';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { dealershipScope } from '../middleware/dealership-scope';
import { Role } from '../types/enums';

const router = Router();

router.get('/', optionalAuth, dealershipScope, vehiclesController.listVehicles);
router.get('/:id', optionalAuth, vehiclesController.getVehicle);
router.post(
  '/',
  authenticate,
  dealershipScope,
  requireRole(Role.ADMIN, Role.DEALERSHIP_STAFF),
  vehiclesController.createVehicle
);
router.patch(
  '/:id',
  authenticate,
  dealershipScope,
  requireRole(Role.ADMIN, Role.DEALERSHIP_STAFF),
  vehiclesController.updateVehicle
);

export default router;
