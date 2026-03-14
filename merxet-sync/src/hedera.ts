import { Contract, Interface, JsonRpcProvider, type Log } from 'ethers';
import type { HederaNetworkConfig } from './hederaConfig';
import { MERXET_ABI } from './merxetAbi';

type ProviderEntry = { provider: JsonRpcProvider; rpcUrl: string };
const providerCache = new Map<string, ProviderEntry>();

type ContractEntry = { contract: Contract; rpcUrl: string; address: string };
const contractCache = new Map<string, ContractEntry>();

const merxetInterface = new Interface(MERXET_ABI);

export function getMerxetInterface(): Interface {
  return merxetInterface;
}

export function getProvider(net: HederaNetworkConfig): JsonRpcProvider {
  const key = net.network;
  const existing = providerCache.get(key);
  if (existing && existing.rpcUrl === net.rpcUrl) return existing.provider;
  const provider = new JsonRpcProvider(net.rpcUrl);
  providerCache.set(key, { provider, rpcUrl: net.rpcUrl });
  console.info(`[Hedera:${net.network}] Initialized JSON-RPC provider (${net.rpcUrl})`);
  return provider;
}

export function getMerxetContract(net: HederaNetworkConfig): Contract {
  const key = net.network;
  const addr = net.contractAddress;
  const existing = contractCache.get(key);
  if (existing && existing.rpcUrl === net.rpcUrl && existing.address.toLowerCase() === addr.toLowerCase()) {
    return existing.contract;
  }
  const provider = getProvider(net);
  const contract = new Contract(addr, MERXET_ABI, provider);
  contractCache.set(key, { contract, rpcUrl: net.rpcUrl, address: addr });
  console.info(`[Hedera:${net.network}] Initialized Merxet contract (${addr})`);
  return contract;
}

export async function fetchLogs(net: HederaNetworkConfig, fromBlock: number, toBlock: number): Promise<Log[]> {
  if (fromBlock > toBlock) {
    return [];
  }

  const fromTimestamp = await getBlockTimestamp(net, fromBlock);
  const baseUrl = net.mirrorNodeUrl.replace(/\/$/, '');
  let nextUrl = `${baseUrl}/api/v1/contracts/${net.contractAddress}/results/logs?timestamp=gte:${fromTimestamp}&order=asc&limit=100`;
  const logs: Log[] = [];

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`Mirror node logs request failed with status ${response.status}`);
    }

    const data = await response.json() as MirrorLogsResponse;
    let reachedUpperBlock = false;

    for (const log of data.logs ?? []) {
      const blockNumber = Number(log.block_number);
      const logIndex = Number(log.index ?? 0);
      if (blockNumber < fromBlock) {
        continue;
      }
      if (blockNumber > toBlock) {
        reachedUpperBlock = true;
        break;
      }

      logs.push({
        address: log.address,
        blockHash: log.block_hash,
        blockNumber,
        data: log.data,
        index: logIndex,
        logIndex,
        removed: false,
        topics: log.topics,
        transactionHash: log.transaction_hash,
        transactionIndex: Number(log.transaction_index ?? 0),
      } as unknown as Log);
    }

    if (reachedUpperBlock || !data.links?.next) {
      break;
    }

    nextUrl = new URL(data.links.next, baseUrl).toString();
  }

  return logs;
}

type MirrorLogEntry = {
  address: string;
  block_hash: string;
  block_number: number;
  data: string;
  index?: number;
  topics: string[];
  transaction_hash: string;
  transaction_index?: number;
};

type MirrorLogsResponse = {
  logs?: MirrorLogEntry[];
  links?: {
    next?: string | null;
  };
};

async function getBlockTimestamp(net: HederaNetworkConfig, blockNumber: number): Promise<string> {
  const provider = getProvider(net);
  const block = await provider.getBlock(blockNumber);
  if (!block) {
    throw new Error(`Unable to load block ${blockNumber} from ${net.network} RPC`);
  }

  return `${block.timestamp}.000000000`;
}
