import type {NetworkId} from "@/context/wallet/types.ts";
import {getNetworkIdForQRCode, getNetworkIdFromQRCode} from "@/config.ts";


export function decodeConcatenatedIDs(data: string): [string, string, NetworkId] {
  const catalogueId = data.slice(0, 22)
  const productId = data.slice(22, 44)
  const network = data.length>44?data.slice(44, 45):"1"
  return [catalogueId, productId, getNetworkIdFromQRCode(network)]
}
export function concatenateIDs(box22charsName: string, uuid2: string, network:NetworkId): string {
  const res =  box22charsName + uuid2 + getNetworkIdForQRCode(network);
  if(res.length!=45) throw new Error(`QR code length mush be exactly 45 characters it was ${res.length}. ${res}`);
  return res;
}
