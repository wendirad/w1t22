import { Router, Request, Response, NextFunction } from 'express';
import * as searchController from '../controllers/search.controller';
import { optionalAuth } from '../middleware/auth';
import { hmacVerify } from '../middleware/hmac-verify';
import { dealershipScope } from '../middleware/dealership-scope';

const router = Router();

// Enforce HMAC only for authenticated users — unauthenticated public access bypasses HMAC
function conditionalHmacVerify(req: Request, res: Response, next: NextFunction) {
  if (req.user) {
    return hmacVerify(req, res, next);
  }
  next();
}

router.get('/', optionalAuth, conditionalHmacVerify, dealershipScope, searchController.search);
router.get('/trending', searchController.trending);

export default router;
