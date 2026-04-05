import { Router } from 'express';
import * as privacyController from '../controllers/privacy.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/consents', privacyController.getConsentHistory);
router.post('/consents', privacyController.recordConsent);
router.post('/export', privacyController.exportData);
router.post('/delete-account', privacyController.requestDeletion);

export default router;
