import {getConfig, getCurrentConfig} from "@/config.ts";
import type {NetworkId} from "@/context/wallet/types.ts";

export interface ProductData {
  seed: string;
  shopWallet: string;
  productsUrl: string;
  sellerPubKey: string;
}

interface CatalogMetadata {
  catalogSeed: string;
  catalogUrl: string;
  sellerAccountId: string;
  sellerPublicKey: string;
}

interface CatalogResponse {
  success: boolean;
  data?: CatalogMetadata;
  error?: string;
}

export function getCatalogMetadataUrl(seed: string, network?: NetworkId): string {
  const config = network ? getConfig(network) : getCurrentConfig();
  return `${config.apiUrl}/catalogs/seed/${encodeURIComponent(seed)}`;
}

export async function fetchProductBySeed(seed: string, network?: NetworkId): Promise<ProductData | null> {
  const response = await fetch(getCatalogMetadataUrl(seed, network));

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.json() as CatalogResponse;
  if (!responseData.success || !responseData.data) {
    throw new Error(responseData.error || "API returned an invalid catalog response");
  }

  const catalog = responseData.data;
  if (catalog.catalogSeed !== seed) {
    throw new Error("API returned a catalog for a different seed");
  }

  return {
    seed: catalog.catalogSeed,
    shopWallet: catalog.sellerAccountId,
    productsUrl: catalog.catalogUrl,
    sellerPubKey: catalog.sellerPublicKey,
  };
}
