import { config } from './config';
import { appDb } from './cache';
import type { HederaNetworkConfig } from './hederaConfig';
import { fetchLogs, getMerxetContract, getMerxetInterface, getProvider } from './hedera';
import { bytes32ToSeedString } from './seed';
import { bytes32ToHex } from './encoding';
import { mapCatalogRowToCacheEntry, mapOrderRowToCacheEntry } from './merxetRowMapping';
import type { CatalogCacheEntry, OrderCacheEntry } from './types/types';

let hederaSyncRunning = false;
let lastRunTime: Date | null = null;

export function initializeHederaSyncService(): void {
  console.log(`Hedera sync service started. Monitoring all configured networks. Interval: ${config.syncInterval} sec`);
  syncTick().catch(err => console.error('Initial Hedera sync tick failed:', err));
  setInterval(() => {
    syncTick().catch(err => console.error('Hedera sync tick failed:', err));
  }, config.syncInterval);
}

export function getHederaLastRunTime(): Date | null {
  return lastRunTime;
}

export async function triggerHederaSyncTick(): Promise<void> {
  await syncTick();
}

async function syncTick(): Promise<void> {
  if (hederaSyncRunning) return;
  hederaSyncRunning = true;
  try {
    console.log(`Hedera sync tick triggered. Last run: ${lastRunTime ? lastRunTime.toISOString() : 'never'}.`);
    const nets = config.getAllConfigs();
    for (const net of nets.values()) {
      if (!net.contractAddress || net.contractAddress === '0x') continue;
      await syncNetwork(net);
    }
    lastRunTime = new Date();
  } finally {
    hederaSyncRunning = false;
  }
}

async function syncNetwork(net: HederaNetworkConfig): Promise<void> {
  const cursorKey = `${net.network}:${net.contractAddress.toLowerCase()}`;
  const cur = (await appDb.getChainCursor(cursorKey)) || { blockNumber: net.startBlock, logIndex: -1 };

  const provider = getProvider(net);
  const latest = await provider.getBlockNumber();
  if (cur.blockNumber > latest) return;

  let fromBlock = cur.blockNumber;
  while (fromBlock <= latest) {
    const toBlock = Math.min(fromBlock + net.blockBatchSize - 1, latest);
    const logs = await fetchLogs(net, fromBlock, toBlock);

    for (const log of logs) {
      const logIndex = Number((log as any).index ?? (log as any).logIndex ?? 0);
      if (log.blockNumber === cur.blockNumber && logIndex <= cur.logIndex) continue;

      await handleLog(net, log);

      cur.blockNumber = log.blockNumber;
      cur.logIndex = logIndex;
      await appDb.setChainCursor(cursorKey, { blockNumber: cur.blockNumber, logIndex: cur.logIndex });
    }

    fromBlock = toBlock + 1;
  }
}

async function handleLog(net: HederaNetworkConfig, log: any): Promise<void> {
  const iface = getMerxetInterface();
  let parsed: any;
  try {
    parsed = iface.parseLog(log);
  } catch {
    return; // ignore unknown logs
  }

  const eventName: string = parsed?.name;
  const args: any = parsed?.args || {};
  const seedBytes32: string | undefined = args.seed;
  if (!eventName || !seedBytes32) return;

  if (eventName.startsWith('Catalog')) {
    const seed = bytes32ToSeedString(seedBytes32);
    if (eventName === 'CatalogDeleted') {
      await deleteCatalogFromCache(net.network, seed);
      return;
    }

    const catalog = await loadCatalogBySeed(net, seedBytes32);
    if (!catalog) return;
    await appDb.upsertCatalogs(catalog.sellerWallet, net.network, [catalog]);
    return;
  }

  if (eventName.startsWith('Order')) {
    const seed = bytes32ToSeedString(seedBytes32);
    if (eventName === 'OrderDeleted') {
      await deleteOrderFromCache(net.network, seed);
      return;
    }

    const order = await loadOrderBySeed(net, seedBytes32);
    if (!order) return;
    await appDb.upsertOrders(order.buyerWallet, net.network, [order]);
    return;
  }
}

async function loadCatalogBySeed(net: HederaNetworkConfig, seedBytes32: string): Promise<CatalogCacheEntry | null> {
  const contract = getMerxetContract(net);
  const row: any = await contract.catalogs(bytes32ToHex(seedBytes32));
  return mapCatalogRowToCacheEntry(seedBytes32, row);
}

async function loadOrderBySeed(net: HederaNetworkConfig, seedBytes32: string): Promise<OrderCacheEntry | null> {
  const contract = getMerxetContract(net);
  const row: any = await contract.orders(bytes32ToHex(seedBytes32));
  return mapOrderRowToCacheEntry(seedBytes32, row);
}

async function deleteCatalogFromCache(network: string, seed: string): Promise<void> {
  const stores = await appDb.getAllCatalogs(network);
  for (const store of stores) {
    const updated = store.catalogs.filter(c => c.seed !== seed);
    if (updated.length !== store.catalogs.length) {
      await appDb.upsertCatalogs(store.sellerWallet, network, updated, true);
    }
  }
}

async function deleteOrderFromCache(network: string, seed: string): Promise<void> {
  const stores = await appDb.getAllOrders(network);
  for (const store of stores) {
    const updated = store.orders.filter(o => o.seed !== seed);
    if (updated.length !== store.orders.length) {
      await appDb.upsertOrders(store.buyerWallet, network, updated, true);
    }
  }
}
