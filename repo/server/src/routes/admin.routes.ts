import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { Role } from '../types/enums';

const router = Router();

router.use(authenticate);

router.get('/synonyms', adminController.listSynonyms);
router.post('/synonyms', requireRole(Role.ADMIN), adminController.createSynonym);
router.put('/synonyms/:id', requireRole(Role.ADMIN), adminController.updateSynonym);
router.delete('/synonyms/:id', requireRole(Role.ADMIN), adminController.deleteSynonym);

router.get('/tax-rates', adminController.listTaxRates);
router.post('/tax-rates', requireRole(Role.ADMIN), adminController.createTaxRate);
router.put('/tax-rates/:id', requireRole(Role.ADMIN), adminController.updateTaxRate);
router.delete('/tax-rates/:id', requireRole(Role.ADMIN), adminController.deleteTaxRate);

router.get('/users', requireRole(Role.ADMIN), adminController.listUsers);
router.patch('/users/:id/role', requireRole(Role.ADMIN), adminController.updateUserRole);

router.get('/dealerships', adminController.listDealerships);
router.post('/dealerships', requireRole(Role.ADMIN), adminController.createDealership);

router.get('/experiments', requireRole(Role.ADMIN), adminController.listExperiments);
router.get('/experiments/:id', requireRole(Role.ADMIN), adminController.getExperiment);
router.post('/experiments', requireRole(Role.ADMIN), adminController.createExperiment);
router.patch('/experiments/:id', requireRole(Role.ADMIN), adminController.updateExperiment);

router.get('/filter-presets', adminController.listFilterPresets);
router.post('/filter-presets', adminController.saveFilterPreset);
router.delete('/filter-presets/:id', adminController.deleteFilterPreset);

export default router;
