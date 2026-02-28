import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendJson } from '../utils/respond';
import { formatUptime } from '../utils/uptime';
import { config } from '../config';
import { appDb } from '../cache';
import { getHederaLastRunTime, triggerHederaSyncTick } from '../hederaSync';

const startTime = new Date();
const router = express.Router();

// Health endpoint
router.get('/', asyncHandler(async (req, res) => {
  const { uptimeMs, uptimeString } = formatUptime(startTime);
  const lastRunTime = getHederaLastRunTime();

  const basic = {
    startTime: startTime.toISOString(),
    uptime: uptimeString,
    uptimeMs,
    lastRunTime: lastRunTime ? lastRunTime.toISOString() : null,
  };

  if (req.query.verbose !== 'true') {
    return sendJson(res, { success: true, data: basic });
  }

  // Verbose stats per network (heavier)
  const networks = config.getAllConfigs();
  const networkStats: Record<string, { stores: number; catalogs: number; orders: number }> = {};
  let totalStores = 0, totalCatalogs = 0, totalOrders = 0;

  for (const value of networks.values()) {
    const network = value.network;
    const catalogs = await appDb.getAllCatalogs(network);
    const orders = await appDb.getAllOrders(network);

    const storeCount = catalogs.length;
    const catalogCount = catalogs.reduce((sum, store) => sum + store.catalogs.length, 0);
    const orderCount = orders.reduce((sum, store) => sum + store.orders.length, 0);

    totalStores += storeCount;
    totalCatalogs += catalogCount;
    totalOrders += orderCount;

    networkStats[network] = { stores: storeCount, catalogs: catalogCount, orders: orderCount };
  }

  const data = { ...basic, totalStores, totalCatalogs, totalOrders, networkStats };
  sendJson(res, { success: true, data });
}));

// Force sync endpoint
router.post('/sync', asyncHandler(async (_req, res) => {
  await triggerHederaSyncTick();
  sendJson(res, { success: true, data: { message: 'Hedera sync tick completed successfully' } });
}));

export default router;
