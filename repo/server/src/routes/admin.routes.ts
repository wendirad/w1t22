import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth';
import { hmacVerify } from '../middleware/hmac-verify';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { Role } from '../types/enums';
import {
  createSynonymSchema,
  updateSynonymSchema,
  createTaxRateSchema,
  updateTaxRateSchema,
  updateUserRoleSchema,
  createDealershipSchema,
  createExperimentSchema,
  updateExperimentSchema,
  saveFilterPresetSchema,
  createPermissionOverrideSchema,
  updatePermissionOverrideSchema,
  mongoIdParam,
} from '../lib/validation-schemas';

const router = Router();

router.use(authenticate, hmacVerify);

// Synonyms
router.get('/synonyms', requireRole(Role.ADMIN), adminController.listSynonyms);
router.post('/synonyms', requireRole(Role.ADMIN), validate(createSynonymSchema), adminController.createSynonym);
router.put('/synonyms/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), validate(updateSynonymSchema), adminController.updateSynonym);
router.delete('/synonyms/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), adminController.deleteSynonym);

// Tax Rates
router.get('/tax-rates', requireRole(Role.ADMIN), adminController.listTaxRates);
router.post('/tax-rates', requireRole(Role.ADMIN), validate(createTaxRateSchema), adminController.createTaxRate);
router.put('/tax-rates/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), validate(updateTaxRateSchema), adminController.updateTaxRate);
router.delete('/tax-rates/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), adminController.deleteTaxRate);

// Users
router.get('/users', requireRole(Role.ADMIN), adminController.listUsers);
router.patch('/users/:id/role', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), validate(updateUserRoleSchema), adminController.updateUserRole);

// Dealerships
router.get('/dealerships', requireRole(Role.ADMIN), adminController.listDealerships);
router.post('/dealerships', requireRole(Role.ADMIN), validate(createDealershipSchema), adminController.createDealership);

// Experiments
router.get('/experiments', requireRole(Role.ADMIN), adminController.listExperiments);
router.get('/experiments/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), adminController.getExperiment);
router.post('/experiments', requireRole(Role.ADMIN), validate(createExperimentSchema), adminController.createExperiment);
router.patch('/experiments/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), validate(updateExperimentSchema), adminController.updateExperiment);

// Filter Presets
router.get('/filter-presets', adminController.listFilterPresets);
router.post('/filter-presets', validate(saveFilterPresetSchema), adminController.saveFilterPreset);
router.delete('/filter-presets/:id', validate(mongoIdParam, 'params'), adminController.deleteFilterPreset);

// Permission Overrides
router.get('/permission-overrides', requireRole(Role.ADMIN), adminController.listPermissionOverrides);
router.get('/permission-overrides/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), adminController.getPermissionOverride);
router.post('/permission-overrides', requireRole(Role.ADMIN), validate(createPermissionOverrideSchema), adminController.createPermissionOverride);
router.patch('/permission-overrides/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), validate(updatePermissionOverrideSchema), adminController.updatePermissionOverride);
router.delete('/permission-overrides/:id', requireRole(Role.ADMIN), validate(mongoIdParam, 'params'), adminController.deletePermissionOverride);

export default router;
