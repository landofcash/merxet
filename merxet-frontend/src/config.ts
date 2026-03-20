import type {NetworkId} from "@/context/wallet/types.ts";
import isMobile from 'ismobilejs';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__
export const APP_NAME='Merxet'
export const BASE_URL='https://merxet.com'

// Sign prefix for encryption seed generation
export const signPrefix = "merxet-";
export const APP_KEY_PREFIX = 'Merxet';
const HEDERA_EXPLORER_BASE = 'https://hashscan.io';

// Keep TokenConfig backward-compatible (numeric id) for current UI/helpers
export interface TokenConfig {
  id: number; // synthetic numeric id for UI (0 reserved for HBAR)
  name: string;
  decimals: number;
  img: string | null;
  // Hedera token ID (e.g., "0.0.123456")
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
  contractAddress: string;
  apiUrl: string;
  fileApiUrl:string;
  hedera: HederaEndpoints;
  explorerBaseUrl: string;
  approvedShopWallets: string[];
  supportedTokens: TokenConfig[];
}

const configs: Record<NetworkId, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    contractAddress: '0.0.7565091',
    apiUrl: 'http://localhost:3000/api/v1/t',
    fileApiUrl: 'http://localhost:3000/api/cdn',
    cdnBasePath: 'https://merxet.b-cdn.net',
    hedera: {
      mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
      rpcUrl: 'https://testnet.hashio.io/api',
      faucetUrl: 'https://portal.hedera.com/faucet',
    },
    explorerBaseUrl: HEDERA_EXPLORER_BASE,
    approvedShopWallets: [
      '0.0.123456', // Placeholder
    ],
    supportedTokens: [
      { id: 0, name: 'HBAR', decimals: 8, img:null, tokenId: '0.0.0' },
      { id: 1, name: 'USDC', decimals: 6, img:null, tokenId: '0.0.429274' }
    ],
  },

  mainnet: {
    name: 'mainnet',
    contractAddress: '0x0000000000000000000000000000000000000000', // TODO: Update
    apiUrl: 'https://sync.merxet.com/api/m',
    fileApiUrl: 'https://sync.merxet.com/api/cdn',
    cdnBasePath: 'https://merxet.b-cdn.net',
    hedera: {
      mirrorNodeUrl: 'https://mainnet.mirrornode.hedera.com',
      rpcUrl: 'https://mainnet.hashio.io/api',
      faucetUrl: '',
    },
    explorerBaseUrl: HEDERA_EXPLORER_BASE,
    approvedShopWallets: [
      '0.0.123456',
    ],
    supportedTokens: [
      { id: 0, name: 'HBAR', decimals: 8, img:null, tokenId: '0.0.0' }
    ],
  }
};

export const getConfig = (network: NetworkId): NetworkConfig => configs[network];

// Returns all available network IDs from the configuration
export const getAvailableNetworkIds = (): NetworkId[] => Object.keys(configs) as NetworkId[];

export const getCurrentConfig = (): NetworkConfig => {
  const raw = (localStorage.getItem(`${APP_KEY_PREFIX}-network`) as NetworkId) || 'testnet';
  const available = getAvailableNetworkIds();
  const network: NetworkId = available.includes(raw) ? raw : (available[0] ?? 'testnet');
  return getConfig(network);
};

export const getNetworkIdFromQRCode = (value:string):NetworkId => {
  if(value==="1")return "mainnet";
  if(value==="2")return "testnet";
  return "mainnet";
}

// Hedera Explorer helpers
export function explorerTxUrl(txHash: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  return `${cfg.explorerBaseUrl}/${n}/transaction/${txHash}`;
}

export function explorerAccountUrl(address: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  return `${cfg.explorerBaseUrl}/${n}/account/${address}`;
}

export function explorerObjectUrl(objectAddress: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  return `${cfg.explorerBaseUrl}/${n}/contract/${objectAddress}`;
}

export function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const { any } = isMobile(navigator.userAgent || '');
  return any;
}

