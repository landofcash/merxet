import { Request, Response } from 'express';
import { sendJson } from '../utils/respond';
import { appDb } from '../cache';

export async function getBuyerOrders(req: Request, res: Response) {
  const { wallet } = req.params as { wallet: string };
  const orders = await appDb.getOrdersByWallet(wallet, req.network!);
  if (!orders) {
    return sendJson(res, { success: false, error: `No orders found for wallet "${wallet}"` }, 404);
  }
  sendJson(res, { success: true, data: orders });
}

export async function getSellerOrders(req: Request, res: Response) {
  const { wallet } = req.params as { wallet: string };
  const allOrders = await appDb.getAllOrders(req.network!);
  const sellerOrders = allOrders
    .map(store => ({ ...store, orders: store.orders.filter(o => o.sellerWallet === wallet) }))
    .filter(store => store.orders.length > 0);
  if (sellerOrders.length === 0) {
    return sendJson(res, { success: false, error: `No orders found for seller wallet "${wallet}"` }, 404);
  }
  sendJson(res, { success: true, data: sellerOrders });
}
