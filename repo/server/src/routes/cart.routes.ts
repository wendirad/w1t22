import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import { authenticate } from '../middleware/auth';
import { dealershipScope } from '../middleware/dealership-scope';
import { validate } from '../middleware/validate';
import { addToCartSchema, vehicleIdParam } from '../lib/validation-schemas';

const router = Router();

router.use(authenticate, dealershipScope);

router.get('/', cartController.getCart);
router.post('/items', validate(addToCartSchema), cartController.addToCart);
router.delete('/items/:vehicleId', validate(vehicleIdParam, 'params'), cartController.removeFromCart);
router.get('/addons', cartController.getAddOns);

export default router;
