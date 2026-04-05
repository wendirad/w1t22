import { Router } from 'express';
import multer from 'multer';
import * as documentsController from '../controllers/documents.controller';
import { authenticate } from '../middleware/auth';
import { dealershipScope } from '../middleware/dealership-scope';
import { validate } from '../middleware/validate';
import { mongoIdParam, documentActionSchema } from '../lib/validation-schemas';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate, dealershipScope);

router.post('/upload', upload.single('file'), documentsController.uploadDocument);
router.get('/', documentsController.listDocuments);
router.get('/:id', validate(mongoIdParam, 'params'), documentsController.getDocument);
router.get('/:id/download', validate(mongoIdParam, 'params'), documentsController.downloadDocument);
router.delete('/:id', validate(mongoIdParam, 'params'), documentsController.deleteDocument);
router.patch('/:id', validate(mongoIdParam, 'params'), documentsController.editDocument);
router.post('/:id/share', validate(mongoIdParam, 'params'), validate(documentActionSchema), documentsController.shareDocument);
router.post('/:id/submit', validate(mongoIdParam, 'params'), documentsController.submitDocument);
router.post('/:id/approve', validate(mongoIdParam, 'params'), documentsController.approveDocument);

export default router;
