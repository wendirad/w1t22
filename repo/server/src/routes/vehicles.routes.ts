import { Router } from 'express';
import * as vehiclesController from '../controllers/vehicles.controller';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { dealershipScope } from '../middleware/dealership-scope';
import { validate } from '../middleware/validate';
import { Role } from '../types/enums';
import {
  createVehicleSchema,
  updateVehicleSchema,
  mongoIdParam,
} from '../lib/validation-schemas';

const router = Router();

router.get('/', optionalAuth, dealershipScope, vehiclesController.listVehicles);
router.get('/:id', optionalAuth, validate(mongoIdParam, 'params'), vehiclesController.getVehicle);
router.post(
  '/',
  authenticate,
  dealershipScope,
  requireRole(Role.ADMIN, Role.DEALERSHIP_STAFF),
  validate(createVehicleSchema),
  vehiclesController.createVehicle
);
router.patch(
  '/:id',
  authenticate,
  dealershipScope,
  requireRole(Role.ADMIN, Role.DEALERSHIP_STAFF),
  validate(mongoIdParam, 'params'),
  validate(updateVehicleSchema),
  vehiclesController.updateVehicle
);

export default router;
