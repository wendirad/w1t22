import { Router } from 'express';
import * as ordersController from '../controllers/orders.controller';
import { authenticate } from '../middleware/auth';
import { hmacVerify } from '../middleware/hmac-verify';
import { dealershipScope } from '../middleware/dealership-scope';
import { validate } from '../middleware/validate';
import {
  createOrderSchema,
  transitionOrderSchema,
  mergeOrdersSchema,
  mongoIdParam,
} from '../lib/validation-schemas';

const router = Router();

router.use(authenticate, hmacVerify, dealershipScope);

router.post('/', validate(createOrderSchema), ordersController.createOrder);
router.get('/', ordersController.listOrders);
router.get('/:id', validate(mongoIdParam, 'params'), ordersController.getOrder);
router.post('/:id/transition', validate(mongoIdParam, 'params'), validate(transitionOrderSchema), ordersController.transitionOrder);
router.get('/:id/events', validate(mongoIdParam, 'params'), ordersController.getOrderEvents);
router.post('/merge', validate(mergeOrdersSchema), ordersController.mergeOrders);

export default router;
