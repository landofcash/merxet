import type {ChainId} from "@/context/wallet/types.ts";
import type {InternalWalletProvider} from "@/lib/internalWallet/provider.ts";
import {hederaInternalWalletProvider} from "@/lib/internalWallet/providers/hederaInternalWalletProvider.ts";

const providers: Record<string, InternalWalletProvider> = {
  hedera: hederaInternalWalletProvider,
};

export function getInternalWalletProvider(chain: ChainId): InternalWalletProvider | null {
  return providers[chain] ?? null;
}
