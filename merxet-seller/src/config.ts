import type {NetworkId} from "@/context/wallet/types.ts";
import isMobile from 'ismobilejs';

declare const __APP_VERSION__: string;
/** Optional World integration. Empty/invalid URL disables all World UI and requests. */
export const worldConfig = (() => {
  const disabled = {enabled: false, url: ''};
  if (import.meta.env.VITE_WORLD_ENABLED !== 'true') return disabled;
  try {
    const raw = (import.meta.env.VITE_WORLD_API_URL || '').trim().replace(/\/+$/, '');
    const url = new URL(raw);
    if (url.origin !== raw || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return disabled;
    return {enabled: true, url: raw};
  } catch {return disabled;}
})();
export const APP_VERSION = __APP_VERSION__
export const APP_NAME='Merxet'
export const CRYPTO_NAME='Hedera'
export const CRYPTO_NAME_BLOCKCHAIN='ledger'
export const BASE_URL='https://merxet.com'
export const BASE_APP_URL='https://app.merxet.com'

// Sign prefix for encryption seed generation
export const signPrefix = "merxet-";
export const APP_KEY_PREFIX = 'Merxet';


// Keep TokenConfig backward-compatible (numeric id) for current UI/helpers
export interface TokenConfig {
  id: number; // synthetic numeric id for UI (0 reserved for APT)
  name: string;
  decimals: number;
  img: string | null;
  tokenId: string;
}

export interface HederaEndpoints {
  mirrorNodeUrl: string;
  rpcUrl: string;
  faucetUrl: string;
}

export interface NetworkConfig {
  cdnBasePath: string;
  name: NetworkId;
  account: string;

  adminWalletAddress: string;
  apiUrl: string;
  fileApiUrl:string;
  hedera: HederaEndpoints;
  explorerBaseUrl: string;
  approvedShopWallets: string[];
  supportedTokens: TokenConfig[];
  defaultGasUnitPrice?: number; // Octas per unit
  maxGasAmount?: number; // in gas units
}

const configs: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    name: 'mainnet',
    account: '0.0.7565091',
    adminWalletAddress: '0.0.7558265',
    apiUrl: 'https://sync.merxet.com/api/v1/m',
    fileApiUrl: 'https://sync.merxet.com/api/cdn',
    cdnBasePath: 'https://merxet.b-cdn.net',
    hedera: {
      mirrorNodeUrl: 'https://mainnet.mirrornode.hedera.com',
      rpcUrl: 'https://mainnet.hashio.io/api',
      faucetUrl: '',
    },
    explorerBaseUrl: 'https://hashscan.io',
    approvedShopWallets: [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    ],
    supportedTokens: [
      { id: 0, name: 'HBAR', decimals: 8, img:null, tokenId: '0.0.0' }
    ],
    defaultGasUnitPrice: 100,
    maxGasAmount: 200_000,
  },

  testnet: {
    name: 'testnet',
    account: '0.0.7565091',
    adminWalletAddress: '0.0.7558265',
    //apiUrl: 'http://localhost:3000/api/v1/t',
    //fileApiUrl: 'http://localhost:3000/api/cdn',
    apiUrl: 'https://sync.merxet.com/api/v1/t',
    fileApiUrl: 'https://sync.merxet.com/api/cdn',
    cdnBasePath: 'https://merxet.b-cdn.net',
    hedera: {
      mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
      rpcUrl: 'https://testnet.hashio.io/api',
      faucetUrl: 'https://portal.hedera.com/faucet',
    },
    explorerBaseUrl: 'https://hashscan.io',
    approvedShopWallets: [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    ],
    supportedTokens: [
      { id: 0, name: 'HBAR', decimals: 8, img:null, tokenId: '0.0.0' },
      { id: 1, name: 'USDC', decimals: 6, img:null, tokenId: '0.0.429274' }
    ],
    defaultGasUnitPrice: 100,
    maxGasAmount: 200_000,
  },
};

export function isAdminWalletAddress(walletAddress: string|null, network: NetworkId): boolean {
  if (!walletAddress) return false;
  const cfg = (configs as Record<string, NetworkConfig>)[network];
  if (!cfg?.adminWalletAddress) return false;
  return walletAddress.trim().toLowerCase() === cfg.adminWalletAddress.trim().toLowerCase();
}

export const getConfig = (network: NetworkId): NetworkConfig => {
  const cfg = (configs as Record<string, NetworkConfig>)[network];
  if (!cfg) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return cfg;
};

export const getAvailableNetworkIds = (): NetworkId[] => Object.keys(configs) as NetworkId[];

export const getCurrentConfig = (): NetworkConfig => {
  const raw = (localStorage.getItem(`${APP_KEY_PREFIX}-network`) as NetworkId) || 'testnet';
  const available = getAvailableNetworkIds();
  const network: NetworkId = available.includes(raw) ? raw : (available[0] ?? 'testnet');
  return getConfig(network);
};

export const getNetworkIdFromQRCode = (value:string):NetworkId => {
  if(value==="2")return "testnet";
  return "mainnet";
}

export const getNetworkIdForQRCode = (value:NetworkId):NetworkId => {
  if(value==="testnet")return "2";
  return "1";
}

export function explorerAccountUrl(address: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  return `${cfg.explorerBaseUrl}/${cfg.name}/account/${address}`
}

export function faucetAccountUrl(faucetUrl: string, address?: string | null): string {
  if (!address) {
    return faucetUrl;
  }

  const separator = faucetUrl.includes("?") ? "&" : "?";
  return `${faucetUrl}${separator}address=${encodeURIComponent(address)}`;
}

// Lightweight environment helper to detect mobile web
export function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const { any } = isMobile(navigator.userAgent || '');
  return any;
}

