import {getCurrentConfig} from '@/config';
import {Client} from "@hiero-ledger/sdk";
import {createPublicClient, http} from "viem";

export function getHederaClient() {
  const cfg = getCurrentConfig();
  let sdkClient;
  if(cfg.name=="testnet") {
    sdkClient = Client.forTestnet();}
  else if(cfg.name=="mainnet") {
    sdkClient = Client.forMainnet();}
  else {
    throw new Error(`Unsupported network ${cfg.name}`);
  }
  const publicClient = createPublicClient({
    transport: http(cfg.hedera.rpcUrl)
  });

  return {sdkClient, publicClient};
}
