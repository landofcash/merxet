import type {WalletAdapter, NetworkId, ContractFunctionPayload, TransactionPayload} from "../types";
import {getActiveInternalWallet, createInternalWallet, clearActiveInternalWallet} from "@/lib/crypto/internalWallet";
import {signMessageInternal} from "@/lib/crypto/cryptoUtils";
import {getCurrentConfig} from "@/config";
// @ts-ignore
import { Client, ContractExecuteTransaction, TopicMessageSubmitTransaction, PrivateKey, Hbar } from "@hashgraph/sdk";


export const internalWalletAdapter: WalletAdapter = {
  chain: 'hedera',
  name: 'Built-in (Internal)',
  id: 'internal',

  isInstalled() {
    return true;
  },

  async getAddress() {
    const acc = await getActiveInternalWallet();
    return acc?.addr ?? null;
  },

  async getNetwork(): Promise<NetworkId | null> {
    return (getCurrentConfig().name as NetworkId) ?? null;
  },

  async connect(opts?: { silent?: boolean }) {
    let acc = await getActiveInternalWallet();
    if (!acc && !opts?.silent) {
      acc = await createInternalWallet();
    }
    return acc?.addr ?? null;
  },

  async disconnect() {
    await clearActiveInternalWallet();
  },

  onAccountChange() {
    return () => {
    };
  },
  onNetworkChange() {
    return () => {
    };
  },

  async signMessage(dataToSign: string /*, message?: string */) {
    const acc = await getActiveInternalWallet();
    if (!acc) throw new Error('No active internal wallet');
    return await signMessageInternal(acc, dataToSign);
  },

  async executeContract(payload: ContractFunctionPayload): Promise<{ hash: string }> {
    const acc = await getActiveInternalWallet();
    if (!acc) throw new Error('No active internal wallet');

    const config = getCurrentConfig();
    const client = config.name === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    // Internal wallet might not have a Hedera Account ID yet if it was just generated
    // This is a known issue for Hedera internal wallets without a setup step
    if (!acc.addr) throw new Error("Internal Hedera account not fully set up (missing Account ID)");

    client.setOperator(acc.addr, PrivateKey.fromBytes(acc.sk));

    const tx = new ContractExecuteTransaction()
        .setContractId(payload.contractId)
        .setGas(1000000)
        .setFunction(payload.function, payload.arguments as any);

    if (payload.amount) {
        tx.setPayableAmount(Hbar.fromTinybars(payload.amount));
    }

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);

    return {hash: response.transactionId.toString()};
  },

  async executeBatch(payloads: TransactionPayload[]): Promise<{ hash: string }> {
    const acc = await getActiveInternalWallet();
    if (!acc) throw new Error('No active internal wallet');

    const config = getCurrentConfig();
    const client = config.name === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    
    if (!acc.addr) throw new Error("Internal Hedera account not fully set up (missing Account ID)");

    client.setOperator(acc.addr, PrivateKey.fromBytes(acc.sk));

    let lastHash = "";

    // Execute sequentially
    for (const payload of payloads) {
        if (payload.type === 'contract') {
            const tx = new ContractExecuteTransaction()
                .setContractId(payload.data.contractId)
                .setGas(1000000)
                .setFunction(payload.data.function, payload.data.arguments as any);

            if (payload.data.amount) {
                tx.setPayableAmount(Hbar.fromTinybars(payload.data.amount));
            }
            const response = await tx.execute(client);
            await response.getReceipt(client);
            lastHash = response.transactionId.toString();
        } else if (payload.type === 'hcs') {
            const tx = new TopicMessageSubmitTransaction()
                .setTopicId(payload.data.topicId)
                .setMessage(payload.data.message);
            
            const response = await tx.execute(client);
            await response.getReceipt(client);
            lastHash = response.transactionId.toString();
        }
    }

    return {hash: lastHash};
  }
};
