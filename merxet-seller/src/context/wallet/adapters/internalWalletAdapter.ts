import type {WalletAdapter, NetworkId} from "../types";
import {getActiveInternalWallet, createInternalWallet, clearActiveInternalWallet} from "@/lib/crypto/internalWallet";
import {signMessageInternal} from "@/lib/crypto/cryptoUtils";
import {getCurrentConfig} from "@/config";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";
import {PrivateKey, Transaction} from "@hiero-ledger/sdk";
import {getHederaAccountIdFromEvmAddress} from "@/lib/hedera/hederaUtils.ts";


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

  async signAndSubmit(transaction:Transaction): Promise<{ hash: string, status: string }> {
    const acc = await getActiveInternalWallet();
    if (!acc) throw new Error('No active internal wallet');

    const {sdkClient} = getHederaClient();

    const OPERATOR_ID = await getHederaAccountIdFromEvmAddress(acc.addr);
    const OPERATOR_KEY = PrivateKey.fromBytesECDSA(acc.sk);
    sdkClient.setOperator(OPERATOR_ID, OPERATOR_KEY);
    
    const txResponse = await transaction.execute(sdkClient);
    const receipt = await txResponse.getReceipt(sdkClient);
    const transactionStatus = receipt.status;
    console.log("The transaction consensus status is " +transactionStatus);

    if (!txResponse?.transactionHash) throw new Error('Internal submit returned no transaction hash');
    return {hash: Buffer.from(txResponse.transactionHash).toString('hex'), status: transactionStatus.toString()};
  }
};
