import express from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireWalletParam } from '../../middleware/validators';
import { getCatalogsByWallet } from '../../controllers/products.controller';

const router = express.Router({ mergeParams: true });

// GET /api/v1/:network/catalogs/:wallet
router.get('/:wallet', requireWalletParam, asyncHandler(getCatalogsByWallet));

export default router;
