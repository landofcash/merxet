import express from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireWalletParam } from '../../middleware/validators';
import { getBuyerOrders, getSellerOrders } from '../../controllers/orders.controller';

const router = express.Router({ mergeParams: true });

// GET /api/v1/:network/orders/buyer/:wallet
router.get('/buyer/:wallet', requireWalletParam, asyncHandler(getBuyerOrders));

// GET /api/v1/:network/orders/seller/:wallet
router.get('/seller/:wallet', requireWalletParam, asyncHandler(getSellerOrders));

export default router;
