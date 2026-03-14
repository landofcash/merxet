import { Request, Response } from 'express';
import { sendJson } from '../utils/respond';
import { appDb } from '../cache';
import { config } from '../config';
import { resolveWalletAliases } from '../walletIdentity';

export async function getCatalogsByWallet(req: Request, res: Response) {
  const { wallet } = req.params as { wallet: string };
  const aliases = await resolveWalletAliases(config.hedera(req.network!), wallet);

  for (const alias of aliases) {
    const catalogs = await appDb.getCatalogsByWallet(alias, req.network!);
    if (catalogs) {
      return sendJson(res, { success: true, data: catalogs });
    }
  }

  sendJson(res, {
    success: true,
    data: {
      id: `${wallet.toLowerCase()}-${req.network!}`,
      sellerWallet: wallet,
      networkName: req.network!,
      catalogs: [],
    },
  });
}

export async function listAllCatalogs(req: Request, res: Response) {
  const catalogs = await appDb.getAllCatalogs(req.network!);
  sendJson(res, { success: true, data: catalogs });
}
