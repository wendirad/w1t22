import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import { authenticate } from '../middleware/auth';
import { dealershipScope } from '../middleware/dealership-scope';

const router = Router();

router.use(authenticate, dealershipScope);

router.get('/', cartController.getCart);
router.post('/items', cartController.addToCart);
router.delete('/items/:vehicleId', cartController.removeFromCart);
router.get('/addons', cartController.getAddOns);

export default router;
