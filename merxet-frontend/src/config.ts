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

// Maximum size for order payload in bytes (2KB)
// while keeping transaction costs reasonable
export const MAX_ORDER_PAYLOAD_BYTES = 2048;

// Keep TokenConfig backward-compatible (numeric id) for current UI/helpers
export interface TokenConfig {
  id: number; // synthetic numeric id for UI (0 reserved for HBAR)
  name: string;
  decimals: number;
  img: string | null;
  // Hedera token ID (e.g., "0.0.123456") or "HBAR"
  tokenId: string;
}

export interface HederaEndpoints {
  mirrorNodeUrl: string;
  rpcUrl: string;
}

export interface NetworkConfig {
  cdnBasePath: string;
  name: NetworkId;
  contractAddress: string;
  hcsTopicId: string;
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
    contractAddress: '0x0000000000000000000000000000000000000000', // TODO: Update with deployed contract address
    hcsTopicId: '0.0.1234567', // TODO: Update
    apiUrl: 'https://sync.merxet.com/api/t',
    fileApiUrl: 'https://sync.merxet.com/api/cdn',
    cdnBasePath: 'https://merxet.b-cdn.net',
    hedera: {
      mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
      rpcUrl: 'https://testnet.hashio.io/api',
    },
    explorerBaseUrl: HEDERA_EXPLORER_BASE,
    approvedShopWallets: [
      '0.0.123456', // Placeholder
    ],
    supportedTokens: [
      { id: 0, name: 'HBAR', decimals: 8, img: null, tokenId: 'HBAR' }
    ],
  },

  devnet: {
    name: 'devnet',
    contractAddress: '0x0000000000000000000000000000000000000000', // TODO: Update
    hcsTopicId: '0.0.1234567', // TODO: Update
    apiUrl: 'https://sync.merxet.com/api/d',
    fileApiUrl: 'https://sync.merxet.com/api/cdn',
    cdnBasePath: 'https://merxet.b-cdn.net',
    hedera: {
      mirrorNodeUrl: 'https://previewnet.mirrornode.hedera.com',
      rpcUrl: 'https://previewnet.hashio.io/api',
    },
    explorerBaseUrl: HEDERA_EXPLORER_BASE,
    approvedShopWallets: [
      '0.0.123456',
    ],
    supportedTokens: [
      { id: 0, name: 'HBAR', decimals: 8, img:null, tokenId: 'HBAR' }      
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
  if(value==="2")return "testnet";
  if(value==="3")return "devnet";
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



