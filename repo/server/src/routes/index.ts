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

export default router;
