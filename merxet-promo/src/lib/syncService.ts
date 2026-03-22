import {getConfig, getCurrentConfig} from "@/config.ts";
import type {NetworkId} from "@/context/wallet/types.ts";

export interface ProductData {
  version: number;
  seed: string;
  shopWallet: string;
  productsUrl: string;
  sellerPubKey: string;
}

interface CatalogStoreData {
  sellerWallet: string;
  networkName: string;
  catalogs: Array<{
    seed: string;
    version: number;
    sellerWallet: string;
    catalogUrl?: string;
    sellerPubKey?: string;
  }>;
}

interface CatalogListResponse {
  success: boolean;
  data: CatalogStoreData[];
}

export async function fetchProductBySeed(seed: string, network?: NetworkId): Promise<ProductData | null> {
  const config = network ? getConfig(network) : getCurrentConfig();
  const response = await fetch(`${config.apiUrl}/catalogs`);

  if (!response.ok) {
    throw new Error(`Failed to fetch catalogs: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as CatalogListResponse;
  if (!data.success) {
    throw new Error("API returned unsuccessful response");
  }

  for (const store of data.data) {
    const match = store.catalogs.find((catalog) => catalog.seed === seed && catalog.catalogUrl);
    if (match) {
      return {
        version: match.version,
        seed: match.seed,
        shopWallet: match.sellerWallet,
        productsUrl: match.catalogUrl ?? "",
        sellerPubKey: match.sellerPubKey ?? "",
      };
    }
  }

  return null;
}
