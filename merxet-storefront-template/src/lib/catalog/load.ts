import type {NetworkId} from '@/context/wallet/types';
import {fetchProductBySeed} from '@/lib/syncService';
import {parseCatalog} from './parse';

export async function loadCatalog(seed: string, network: NetworkId, signal?: AbortSignal) {
  const metadata = await fetchProductBySeed(seed, network, signal);
  if (!metadata) throw new Error('Catalogue not found for the provided seed');
  const url = new URL(metadata.productsUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid catalog URL');
  const response = await fetch(url, {signal, cache: 'no-cache'});
  if (!response.ok) throw new Error(`Failed to fetch catalogue: ${response.status}`);
  return {metadata, products: parseCatalog(await response.json())};
}

export type LoadedCatalog = Awaited<ReturnType<typeof loadCatalog>>;
