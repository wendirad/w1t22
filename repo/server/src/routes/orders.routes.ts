import { Router } from 'express';
import * as ordersController from '../controllers/orders.controller';
import { authenticate } from '../middleware/auth';
import { dealershipScope } from '../middleware/dealership-scope';

const router = Router();

router.use(authenticate, dealershipScope);

router.post('/', ordersController.createOrder);
router.get('/', ordersController.listOrders);
router.get('/:id', ordersController.getOrder);
router.post('/:id/transition', ordersController.transitionOrder);
router.get('/:id/events', ordersController.getOrderEvents);

export default router;
