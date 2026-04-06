import { Router } from 'express';
import * as vehiclesController from '../controllers/vehicles.controller';
import { Request, Response, NextFunction } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import { hmacVerify } from '../middleware/hmac-verify';
import { requireRole } from '../middleware/rbac';
import { dealershipScope } from '../middleware/dealership-scope';
import { validate } from '../middleware/validate';
import { Role } from '../types/enums';
import {
  createVehicleSchema,
  updateVehicleSchema,
  mongoIdParam,
} from '../lib/validation-schemas';

// Enforce HMAC only for authenticated users — unauthenticated public access bypasses HMAC
function conditionalHmacVerify(req: Request, res: Response, next: NextFunction) {
  if (req.user) {
    return hmacVerify(req, res, next);
  }
  next();
}

const router = Router();

// HMAC is verified conditionally: if the user is authenticated and has a signing key,
// the signature is validated. Unauthenticated (public) access still works without HMAC.
router.get('/', optionalAuth, conditionalHmacVerify, dealershipScope, vehiclesController.listVehicles);
router.get('/:id', optionalAuth, conditionalHmacVerify, validate(mongoIdParam, 'params'), vehiclesController.getVehicle);
router.post(
  '/',
  authenticate,
  hmacVerify,
  dealershipScope,
  requireRole(Role.ADMIN, Role.DEALERSHIP_STAFF),
  validate(createVehicleSchema),
  vehiclesController.createVehicle
);
router.patch(
  '/:id',
  authenticate,
  hmacVerify,
  dealershipScope,
  requireRole(Role.ADMIN, Role.DEALERSHIP_STAFF),
  validate(mongoIdParam, 'params'),
  validate(updateVehicleSchema),
  vehiclesController.updateVehicle
);

export default router;
