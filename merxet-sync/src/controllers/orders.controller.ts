import { Request, Response } from 'express';
import { sendJson } from '../utils/respond';
import { appDb } from '../cache';
import { config } from '../config';
import { normalizeWalletId, resolveWalletAliases } from '../walletIdentity';

export async function getBuyerOrders(req: Request, res: Response) {
  const { wallet } = req.params as { wallet: string };
  const aliases = await resolveWalletAliases(config.hedera(req.network!), wallet);

  for (const alias of aliases) {
    const orders = await appDb.getOrdersByWallet(alias, req.network!);
    if (orders) {
      return sendJson(res, { success: true, data: orders });
    }
  }

  sendJson(res, {
    success: true,
    data: {
      id: `${wallet.toLowerCase()}-${req.network!}`,
      buyerWallet: wallet,
      networkName: req.network!,
      orders: [],
    },
  });
}

export async function getSellerOrders(req: Request, res: Response) {
  const { wallet } = req.params as { wallet: string };
  const aliases = new Set(await resolveWalletAliases(config.hedera(req.network!), wallet));
  const allOrders = await appDb.getAllOrders(req.network!);
  const sellerOrders = allOrders
    .map(store => ({
      ...store,
      orders: store.orders.filter(o => aliases.has(normalizeWalletId(o.sellerWallet))),
    }))
    .filter(store => store.orders.length > 0);
  if (sellerOrders.length === 0) {
    return sendJson(res, { success: true, data: [] });
  }
  sendJson(res, { success: true, data: sellerOrders });
}

export async function listAllOrders(req: Request, res: Response) {
  const orders = await appDb.getAllOrders(req.network!);
  sendJson(res, { success: true, data: orders });
}
