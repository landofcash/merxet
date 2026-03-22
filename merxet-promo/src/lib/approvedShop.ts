import {getConfig, getCurrentConfig, type NetworkConfig} from "@/config.ts";
import type {NetworkId} from "@/context/wallet/types.ts";

type MirrorAccountResponse = {
  account?: string | null;
  alias?: string | null;
  evm_address?: string | null;
};

const ACCOUNT_ID_PATTERN = /^\d+\.\d+\.\d+$/;
const EVM_ADDRESS_PATTERN = /^(0x)?[a-fA-F0-9]{40}$/;

function normalizeWalletAddress(walletAddress: string): string {
  const trimmed = walletAddress.trim();

  if (!trimmed) {
    return "";
  }

  if (ACCOUNT_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (EVM_ADDRESS_PATTERN.test(trimmed)) {
    return trimmed.startsWith("0x") ? trimmed.toLowerCase() : `0x${trimmed.toLowerCase()}`;
  }

  return trimmed.toLowerCase();
}

async function resolveWalletAliases(walletAddress: string, config: NetworkConfig): Promise<string[]> {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) {
    return [];
  }

  const aliases = new Set<string>([normalized]);
  if (!ACCOUNT_ID_PATTERN.test(normalized) && !normalized.startsWith("0x")) {
    return [...aliases];
  }

  try {
    const response = await fetch(`${config.hedera.mirrorNodeUrl}/api/v1/accounts/${normalized}`);
    if (!response.ok) {
      return [...aliases];
    }

    const data = await response.json() as MirrorAccountResponse;
    for (const candidate of [data.account, data.alias, data.evm_address]) {
      const normalizedCandidate = candidate ? normalizeWalletAddress(candidate) : "";
      if (normalizedCandidate) {
        aliases.add(normalizedCandidate);
      }
    }
  } catch {
    return [...aliases];
  }

  return [...aliases];
}

export async function isApprovedShopWallet(
  walletAddress: string,
  network?: NetworkId,
): Promise<boolean> {
  const config = network ? getConfig(network) : getCurrentConfig();
  const walletAliases = new Set(await resolveWalletAliases(walletAddress, config));

  if (walletAliases.size === 0) {
    return false;
  }

  for (const approvedWallet of config.approvedShopWallets) {
    const approvedAliases = await resolveWalletAliases(approvedWallet, config);
    if (approvedAliases.some(alias => walletAliases.has(alias))) {
      return true;
    }
  }

  return false;
}
