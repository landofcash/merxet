import {BASE_APP_URL} from '@/config';
import type {NetworkId} from '@/context/wallet/types';
import {concatenateIDs} from '@/lib/qrCodeUtils';

export function getBuyerProductUrl(catalogSeed: string, productId: string, network: NetworkId): string {
  return `${BASE_APP_URL}/#${concatenateIDs(catalogSeed, productId, network)}`;
}
