import type {NetworkId} from "@/context/wallet/types.ts";

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__
export const APP_NAME='Aptoosh'
export const BASE_URL='https://aptoosh.com'

// Sign prefix for encryption seed generation
export const signPrefix = "aptoosh-";
export const APP_KEY_PREFIX = 'AptooshPromo';
const APTOS_EXPLORER_BASE = 'https://explorer.aptoslabs.com';

export const CIRCLE_APP_ID: string = 'a8986a00-6cbf-51f9-82ca-9945055526f6';

// Maximum size for order payload in bytes (2KB)
// while keeping transaction costs reasonable
export const MAX_ORDER_PAYLOAD_BYTES = 2048;

// Keep TokenConfig backward-compatible (numeric id) for current UI/helpers
export interface TokenConfig {
  id: number; // synthetic numeric id for UI (0 reserved for APT)
  name: string;
  decimals: number;
  img: string | null;
  // Optional Aptos coin type string for future use
  coinType: string;
}

export interface AptosEndpoints {
  nodeUrl: string; // Full node REST base URL (v1)
  indexerGraphqlUrl: string; // Indexer GraphQL endpoint
  indexerRestUrl?: string; // Optional alternative is indexer REST
  faucetUrl?: string; // Dev/test/local only
}

export interface NetworkConfig {
  cdnBasePath: string;
  name: NetworkId;
  account: string;
  apiUrl: string;
  fileApiUrl:string;
  circleApiUrl?: string | null;
  aptos: AptosEndpoints;
  explorerBaseUrl: string;
  approvedShopWallets: string[];
  supportedTokens: TokenConfig[];
  defaultGasUnitPrice?: number; // Octas per unit
  maxGasAmount?: number; // in gas units
}

const configs: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    name: 'mainnet',
    account: '0x84171af48f266ba207890b75e78b503336c1cef911f693d65eb770da000f971f',
    apiUrl: 'https://sync.aptoosh.com/api/m',
    fileApiUrl: 'https://sync.aptoosh.com/api/cdn',
    circleApiUrl: 'https://sync.aptoosh.com/api/circle',
    cdnBasePath: 'https://aptoosh.b-cdn.net',
    aptos: {
      nodeUrl: 'https://fullnode.mainnet.aptoslabs.com/v1',
      indexerGraphqlUrl: 'https://indexer.mainnet.aptoslabs.com/v1/graphql',
      indexerRestUrl: 'https://indexer-mainnet.staging.gcp.aptosdev.com/v1',
    },
    explorerBaseUrl: APTOS_EXPLORER_BASE,
    approvedShopWallets: [
      '0x3a1445d9fa6b82011d0301b97050c59114f07499b0a1e40d00a56a87fd4c3bef',
      '0x179017d5a40740536702757576cd7253e510901cfb4d0a02f684b45430e5fa6d'
    ],
    supportedTokens: [
      { id: 0, name: 'APT', decimals: 8, img: null, coinType: '0x1::aptos_coin::AptosCoin' },
    ],
    defaultGasUnitPrice: 100,
    maxGasAmount: 200_000,
  },

  testnet: {
    name: 'testnet',
    account: '0x56397d22cd1f3ee037d59677e61ea72c6a11d73777705df4cd489a4dea83244d',
    apiUrl: 'https://sync.aptoosh.com/api/t',
    fileApiUrl: 'https://sync.aptoosh.com/api/cdn',
    circleApiUrl: 'https://sync.aptoosh.com/api/circle',
    cdnBasePath: 'https://aptoosh.b-cdn.net',
    aptos: {
      nodeUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
      indexerGraphqlUrl: 'https://indexer.testnet.aptoslabs.com/v1/graphql',
      indexerRestUrl: 'https://indexer-testnet.staging.gcp.aptosdev.com/v1',
      faucetUrl: 'https://faucet.testnet.aptoslabs.com',
    },
    explorerBaseUrl: APTOS_EXPLORER_BASE,
    approvedShopWallets: [
      '0x3a1445d9fa6b82011d0301b97050c59114f07499b0a1e40d00a56a87fd4c3bef',
      '0x179017d5a40740536702757576cd7253e510901cfb4d0a02f684b45430e5fa6d'
    ],
    supportedTokens: [
      { id: 0, name: 'APT', decimals: 8, img: null, coinType: '0x1::aptos_coin::AptosCoin' },
      { id: 1,
        name: 'USDC', decimals: 6, img:null,
        coinType: '0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T' },
    ],
    defaultGasUnitPrice: 100,
    maxGasAmount: 200_000,
  },

  devnet: {
    name: 'devnet',
    account: '0x84171af48f266ba207890b75e78b503336c1cef911f693d65eb770da000f971f',
    apiUrl: 'https://sync.aptoosh.com/api/d',
    fileApiUrl: 'https://sync.aptoosh.com/api/cdn',
    circleApiUrl: 'http://localhost:3000/api/circle',
    cdnBasePath: 'https://aptoosh.b-cdn.net',
    aptos: {
      nodeUrl: 'https://fullnode.devnet.aptoslabs.com/v1',
      indexerGraphqlUrl: 'https://indexer.devnet.aptoslabs.com/v1/graphql',
      faucetUrl: 'https://faucet.devnet.aptoslabs.com',
    },
    explorerBaseUrl: APTOS_EXPLORER_BASE,
    approvedShopWallets: [
      '0x3a1445d9fa6b82011d0301b97050c59114f07499b0a1e40d00a56a87fd4c3bef',
      '0x179017d5a40740536702757576cd7253e510901cfb4d0a02f684b45430e5fa6d'
    ],
    supportedTokens: [
      { id: 0, name: 'APT', decimals: 8, img:null, coinType: '0x1::aptos_coin::AptosCoin' },
      { id: 1,
        name: 'USDC', decimals: 6, img:null,
        coinType: '0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T' },
    ],
    defaultGasUnitPrice: 100,
    maxGasAmount: 200_000,
  }
};

export const getConfig = (network: NetworkId): NetworkConfig => configs[network];

export const getCurrentConfig = (): NetworkConfig => {
  const raw = (localStorage.getItem(`${APP_KEY_PREFIX}-network`) as NetworkId) || 'testnet';
  const network: NetworkId = ['mainnet', 'testnet', 'devnet'].includes(raw) ? raw : 'testnet';
  return getConfig(network);
};

export const getCircleApiBaseUrl = (): string | null => {
  try {
    const cfg = getCurrentConfig();
    return cfg.circleApiUrl ?? null;
  } catch {
    return null;
  }
};

export const getNetworkIdFromQRCode = (value:string):NetworkId => {
  if(value==="2")return "testnet";
  if(value==="3")return "devnet";
  return "mainnet";
}

export const getNetworkIdForQRCode = (value:NetworkId):NetworkId => {
  if(value==="testnet")return "2";
  if(value==="devnet")return "3";
  return "1";
}

// Aptos Explorer helpers
export function explorerTxUrl(txHash: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  const suffix = n === 'mainnet' ? '' : `?network=${n}`;
  return `${cfg.explorerBaseUrl}/txn/${txHash}${suffix}`;
}

export function explorerAccountUrl(address: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  const suffix = n === 'mainnet' ? '' : `?network=${n}`;
  return `${cfg.explorerBaseUrl}/account/${address}${suffix}`;
}

export function explorerObjectUrl(objectAddress: string, network?: NetworkId): string {
  const cfg = network ? getConfig(network) : getCurrentConfig();
  const n = cfg.name;
  const suffix = n === 'mainnet' ? '' : `?network=${n}`;
  return `${cfg.explorerBaseUrl}/object/${objectAddress}${suffix}`;
}
