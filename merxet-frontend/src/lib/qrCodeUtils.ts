import type {NetworkId} from "@/context/wallet/types.ts";
import {getNetworkIdFromQRCode} from "@/config.ts";


export function decodeConcatenatedIDs(data: string): [string, string, NetworkId] {
  const catalogueId = data.slice(0, 22)
  const productId = data.slice(22, 44)
  const network = data.length>44?data.slice(44, 45):"1"
  return [catalogueId, productId, getNetworkIdFromQRCode(network)]
}
