import {Aptos, AptosConfig, Network} from '@aptos-labs/ts-sdk';
import {getCurrentConfig} from '@/config';

/**
 * Returns a preconfigured Aptos client bound to the currently selected network.
 * Uses endpoints from config.ts (fullnode/indexer/faucet) and the network name.
 */
export function getAptosClient() {
  const cfg = getCurrentConfig().aptos;
  const net = getCurrentConfig().name as Network;
  return new Aptos(
    new AptosConfig({
      fullnode: cfg.nodeUrl,
      indexer: cfg.indexerGraphqlUrl,
      faucet: cfg.faucetUrl,
      network: net,
    })
  );
}
