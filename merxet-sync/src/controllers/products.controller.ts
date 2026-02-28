import { Request, Response } from 'express';
import { sendJson } from '../utils/respond';
import { appDb } from '../cache';

export async function getCatalogsByWallet(req: Request, res: Response) {
  const { wallet } = req.params as { wallet: string };
  const catalogs = await appDb.getCatalogsByWallet(wallet, req.network!);
  if (!catalogs) {
    return sendJson(res, { success: false, error: `No catalogs found for wallet "${wallet}"` }, 404);
  }
  sendJson(res, { success: true, data: catalogs });
}
