import { Router } from 'express';
import * as searchController from '../controllers/search.controller';
import { optionalAuth } from '../middleware/auth';
import { dealershipScope } from '../middleware/dealership-scope';

const router = Router();

router.get('/', optionalAuth, dealershipScope, searchController.search);
router.get('/trending', searchController.trending);

export default router;
