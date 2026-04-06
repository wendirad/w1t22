import { Router } from 'express';
import * as privacyController from '../controllers/privacy.controller';
import { authenticate } from '../middleware/auth';
import { hmacVerify } from '../middleware/hmac-verify';
import { validate } from '../middleware/validate';
import { recordConsentSchema } from '../lib/validation-schemas';

const router = Router();

router.use(authenticate, hmacVerify);

router.get('/consents', privacyController.getConsentHistory);
router.post('/consents', validate(recordConsentSchema), privacyController.recordConsent);
router.post('/export', privacyController.exportData);
router.post('/delete-account', privacyController.requestDeletion);

export default router;
