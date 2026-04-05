import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateProfileSchema,
} from '../lib/validation-schemas';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getProfile);
router.patch('/me', authenticate, validate(updateProfileSchema), authController.updateProfile);

export default router;
