/**
 * Utility functions for QR code generation and UUID handling
 */
import type {NetworkId} from "@/context/wallet/types.ts";
import {getNetworkIdForQRCode} from "@/config.ts";

export function concatenateIDs(box22charsName: string, uuid2: string, network:NetworkId): string {
  const res =  box22charsName + uuid2 + getNetworkIdForQRCode(network);
  if(res.length!=45) throw new Error(`QR code length mush be exactly 45 characters it was ${res.length}. ${res}`);
  return res;
}
