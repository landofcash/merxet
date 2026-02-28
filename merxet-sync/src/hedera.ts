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
  const provider = getProvider(net);
  const address = net.contractAddress;
  return provider.getLogs({ address, fromBlock, toBlock });
}
