import { Router } from 'express';
import multer from 'multer';
import * as documentsController from '../controllers/documents.controller';
import { authenticate } from '../middleware/auth';
import { dealershipScope } from '../middleware/dealership-scope';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate, dealershipScope);

router.post('/upload', upload.single('file'), documentsController.uploadDocument);
router.get('/', documentsController.listDocuments);
router.get('/:id', documentsController.getDocument);
router.get('/:id/download', documentsController.downloadDocument);
router.delete('/:id', documentsController.deleteDocument);

export default router;
