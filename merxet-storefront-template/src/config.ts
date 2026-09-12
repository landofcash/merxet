/// <reference types="vite/client" />
import type {NetworkId} from "./context/wallet/types.ts";

declare const __APP_VERSION__: string;
/** Optional World integration. Empty/invalid URL disables all World UI and requests. */
export const worldConfig = (() => {
  const disabled = {enabled: false, url: ''};
  if (import.meta.env?.VITE_WORLD_ENABLED !== 'true') return disabled;
  try {
    const raw = (import.meta.env.VITE_WORLD_API_URL || '').trim().replace(/\/+$/, '');
    const url = new URL(raw);
    if (url.origin !== raw || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return disabled;
    return {enabled: true, url: raw};
  } catch {return disabled;}
})();

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development';
export const APP_NAME = "Merxet";
export const BASE_URL = "https://merxet.com";
export const BASE_APP_URL = "https://app.merxet.com";
export const APP_KEY_PREFIX = "MerxetPromo";
export const DEFAULT_NETWORK: NetworkId = "testnet";
export const DEFAULT_CATALOG_SEED = "AP10YnWjS0yEFsXPC-mM9A";

export interface TokenConfig {
  id: number;
  name: string;
  decimals: number;
  img: string | null;
  tokenId: string;
}

export interface HederaEndpoints {
  mirrorNodeUrl: string;
  rpcUrl: string;
  faucetUrl?: string;
}

export interface NetworkConfig {
  cdnBasePath: string;
  name: NetworkId;
  apiUrl: string;
  fileApiUrl: string;
  hedera: HederaEndpoints;
  approvedShopWallets: string[];
  supportedTokens: TokenConfig[];
}

const configs: Record<string, NetworkConfig> = {
  testnet: {
    name: "testnet",
    apiUrl: "https://sync.merxet.com/api/v1/t",
    fileApiUrl: "https://sync.merxet.com/api/cdn",
    cdnBasePath: "https://merxet.b-cdn.net",
    hedera: {
      mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
      rpcUrl: "https://testnet.hashio.io/api",
      faucetUrl: "https://portal.hedera.com/faucet",
    },
    approvedShopWallets: [
      "0.0.8305575",
      "0.0.8321009",
    ],
    supportedTokens: [
      {id: 0, name: "HBAR", decimals: 8, img: null, tokenId: "0.0.0"},
      {id: 1, name: "USDC", decimals: 6, img: null, tokenId: "0.0.429274"},
    ],
  },
  mainnet: {
    name: "mainnet",
    apiUrl: "https://sync.merxet.com/api/m",
    fileApiUrl: "https://sync.merxet.com/api/cdn",
    cdnBasePath: "https://merxet.b-cdn.net",
    hedera: {
      mirrorNodeUrl: "https://mainnet.mirrornode.hedera.com",
      rpcUrl: "https://mainnet.hashio.io/api",
      faucetUrl: "",
    },
    approvedShopWallets: [
      "0.0.123456",
    ],
    supportedTokens: [
      {id: 0, name: "HBAR", decimals: 8, img: null, tokenId: "0.0.0"},
    ],
  },
};

export const getAvailableNetworkIds = (): NetworkId[] => Object.keys(configs) as NetworkId[];

export function isNetworkId(value: string | null | undefined): value is NetworkId {
  if (!value) {
    return false;
  }

  return getAvailableNetworkIds().includes(value as NetworkId);
}

export const getConfig = (network: NetworkId): NetworkConfig => {
  const config = configs[network];
  if (!config) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return config;
};

export const getCurrentConfig = (): NetworkConfig => {
  const raw = localStorage.getItem(`${APP_KEY_PREFIX}-network`);
  return getConfig(isNetworkId(raw) ? raw : DEFAULT_NETWORK);
};

export const setCurrentNetwork = (network: NetworkId): void => {
  localStorage.setItem(`${APP_KEY_PREFIX}-network`, network);
};

export const getNetworkIdFromQRCode = (value: string): NetworkId => {
  if (value === "1") return "mainnet";
  return "testnet";
};

export const getNetworkIdForQRCode = (value: NetworkId): string => {
  if (value === "mainnet") return "1";
  return "2";
};
