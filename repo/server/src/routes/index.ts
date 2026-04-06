import { Router } from 'express';
import { Dealership } from '../models/dealership.model';
import authRoutes from './auth.routes';
import vehiclesRoutes from './vehicles.routes';
import searchRoutes from './search.routes';
import cartRoutes from './cart.routes';
import ordersRoutes from './orders.routes';
import documentsRoutes from './documents.routes';
import financeRoutes from './finance.routes';
import adminRoutes from './admin.routes';
import privacyRoutes from './privacy.routes';
import auditRoutes from './audit.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/dealerships', async (_req, res, next) => {
  try {
    const dealerships = await Dealership.find({ isActive: true }).select('name region');
    res.json(dealerships);
  } catch (error) {
    next(error);
  }
});

// HMAC verification is now applied within each route file after authenticate middleware,
// ensuring per-session signing keys are used (not a static shared secret).
router.use('/auth', authRoutes);
router.use('/vehicles', vehiclesRoutes);
router.use('/search', searchRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', ordersRoutes);
router.use('/documents', documentsRoutes);
router.use('/finance', financeRoutes);
router.use('/admin', adminRoutes);
router.use('/privacy', privacyRoutes);
router.use('/audit', auditRoutes);

// Experiment assignment endpoint — accessible to any user (public or authenticated).
// When the caller is authenticated, HMAC is enforced to maintain a consistent
// request-signing policy across all authenticated routes.
import { Request, Response, NextFunction } from 'express';
import { optionalAuth } from '../middleware/auth';
import { hmacVerify } from '../middleware/hmac-verify';
import * as experimentService from '../services/experiment.service';
import { Experiment } from '../models/experiment.model';

function conditionalHmacVerify(req: Request, _res: Response, next: NextFunction) {
  if (req.user) {
    return hmacVerify(req, _res, next);
  }
  next();
}

router.get('/experiments/assignment', optionalAuth, conditionalHmacVerify, async (req, res, next) => {
  try {
    const feature = req.query.feature as string;
    if (!feature) {
      res.json({ variant: 'control', config: {}, isDefault: true });
      return;
    }
    const experiment = await Experiment.findOne({ feature, status: 'active' });
    if (!experiment) {
      res.json({ variant: 'control', config: {}, isDefault: true });
      return;
    }
    const userId = req.user?.id || req.ip || 'anonymous';
    const result = await experimentService.getAssignment(experiment._id.toString(), userId);
    const variantConfig = experiment.variants.find((v) => v.key === result.variant)?.config || {};
    res.json({ variant: result.variant, config: variantConfig, isDefault: result.isDefault, experimentId: experiment._id });
  } catch (error) {
    next(error);
  }
});

export default router;
