import type {ChainAdapter} from "@/lib/crypto/types/ChainAdapter.ts";
import {getCurrentConfig} from "@/config";
import type {CatalogData} from "@/lib/syncService.ts";
import type {GetStorageResult} from "@/lib/crypto/types/GetStorageResult.ts";
import {hexToBytes} from "@/utils/encoding.ts";
import * as hederaUtils from "@/lib/hedera/hederaUtils.ts";
import type {NetworkId, WalletAdapter} from "@/context/wallet/types.ts";
import {toHex} from "viem";
import MerxetAbi from "@/contracts/Merxet.sol/Merxet.json";
import {getHederaClient} from "@/lib/hedera/hederaClient.ts";
import {
  BatchTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  TopicId, TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";


export const hederaAdapter: ChainAdapter = {
  name: "hedera",
  generateAccount: hederaUtils.generateAccount,
  accountFromMnemonic: hederaUtils.accountFromMnemonic,
  accountToMnemonic: hederaUtils.accountToMnemonic,
  signMessageInternal: hederaUtils.signMessage,

  async getAccountCoinAmount(address: string, coinType: string): Promise<bigint> {
    return await hederaUtils.getAccountCoinAmount(address, coinType);
  },

  formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
    return hederaUtils.formatCoinAmount(amount, decimals, maximumFractionDigits);
  },

  async requestDevnetFaucet(accountAddress: string, amountOctas: number): Promise<void> {
    throw new Error(`Faucet not implemented for Hedera accountAddress:${accountAddress} amountOctas:${amountOctas}`);
  },

  async uploadCatalogUrlToBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    sellerPubKey: string,
    catalogueUrl: string
  ): Promise<string> {
    console.log(`Create catalog: ${seed} wallet ${walletAdapter.name} sellerPubKey:${sellerPubKey} url:${catalogueUrl}`);
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    const config = getCurrentConfig();

    const seedBytes32 = toHex(new TextEncoder().encode(seed), {size: 32});
    const sellerPubKeyBytes = new TextEncoder().encode(sellerPubKey);

    const params = new ContractFunctionParameters()
      .addBytes32(hexToBytes(seedBytes32))
      .addBytes(sellerPubKeyBytes)
      .addString(catalogueUrl);

    const tx = new ContractExecuteTransaction()
      .setContractId(config.account)
      .setFunction("createCatalog", params)
      .setGas(300_000);

    const result = await walletAdapter.signAndSubmit(tx);
    return result.hash;
  },

  async deleteProductBoxOnBlockchain(walletAdapter: WalletAdapter,seed: string): Promise<string> {
    console.log(`Delete catalogue: ${seed} wallet ${walletAdapter.name}`);
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }
    const config = getCurrentConfig();
    const tx = new ContractExecuteTransaction()
      .setContractId(config.account)
      .setFunction("deleteCatalog", new ContractFunctionParameters().addString(seed))
      .setGas(300_000);

    const result = await walletAdapter.signAndSubmit(tx);
    return result.hash;
  },

  async refuseOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    payloadEncrypted: string,
  ): Promise<string> {
    console.log('Refuse order:', walletAdapter.name, seed, payloadHashSeller);

    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    const config = getCurrentConfig();

    const contractTx = new ContractExecuteTransaction()
      .setContractId(config.account)
      .setFunction("refuseOrder", new ContractFunctionParameters().addString(seed).addString(payloadEncrypted))
      .setGas(300_000);

    const hcsTx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(config.topicId))
      .setMessage(JSON.stringify(payloadEncrypted));

    const batch = new BatchTransaction()
      .addInnerTransaction(contractTx)
      .addInnerTransaction(hcsTx);

    const result = await walletAdapter.signAndSubmit(batch);
    return result.hash;
  },

  async startDeliveringOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    payloadEncrypted: string
  ): Promise<string> {
    console.log('Start delivering:', walletAdapter.name, seed, payloadHashSeller);
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    const config = getCurrentConfig();
    const sdkClient = getHederaClient().sdkClient;

    const contractTx = new ContractExecuteTransaction()
      .setContractId(config.account)
      .setFunction("startDelivering", new ContractFunctionParameters().addString(seed).addString(payloadHashSeller))
      .setGas(300_000);

    const hcsTx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(config.topicId))
      .setMessage(JSON.stringify(payloadEncrypted));

    const batch = new BatchTransaction()
      .addInnerTransaction(contractTx)
      .addInnerTransaction(hcsTx);

    batch.freezeWith(sdkClient);

    const result = await walletAdapter.signAndSubmit(batch);
    return result.hash;
  },

  async setOrderTimeout(walletAdapter: WalletAdapter, timeoutSeconds: number): Promise<string> {
    const ONE_DAY_SECONDS = 86_400n;
    if (timeoutSeconds < ONE_DAY_SECONDS) {
      throw new Error("Merxet: Timeout too short");
    }
    const config = getCurrentConfig();
    const params = new ContractFunctionParameters().addUint256(timeoutSeconds);
    const tx = new ContractExecuteTransaction()
      .setContractId(config.account)
      .setFunction("setOrderTimeout", params)
      .setGas(300_000);

    const result = await walletAdapter.signAndSubmit(tx);
    return result.hash;
  },

  async viewCatalogOnBlockchain(seed: string): Promise<CatalogData> {
    if (!seed || seed.length !== 22) {
      throw new Error("Seed must be a 22-character string");
    }

    try {
      const {publicClient} = getHederaClient();
      const seedBytes32 = toHex(new TextEncoder().encode(seed), {size: 32}) as `0x${string}`;
      const contractAddress = getCurrentConfig().account as `0x${string}`;
      const res = await publicClient.readContract({
        address: contractAddress,
        abi: MerxetAbi.abi,
        functionName: "catalogs",
        args: [seedBytes32],
      }) as readonly [bigint, `0x${string}`, `0x${string}`, string];

      const [versionRaw, shopWallet, sellerPubKeyHex, catalogUrl] = res;
      if (shopWallet.toLowerCase() === "0x0000000000000000000000000000000000000000") {
        throw new Error("Product not found");
      }

      const sellerPubKey = sellerPubKeyHex && sellerPubKeyHex !== "0x"
          ? String.fromCharCode(...hexToBytes(sellerPubKeyHex))
          : "";

      return {
        version: Number(versionRaw),
        seed,
        shopWallet,
        catalogUrl,
        sellerPubKey,
      } as CatalogData;
    } catch (error) {
      console.error("Error viewing product (hedera):", error);
      throw error;
    }
  },

  async viewBuyerData(seed: string): Promise<GetStorageResult> {
    try {
      const data = null //read from HCS
      if (!data) return {data: null, isFound: false}
      return {data: "", isFound: true}
    } catch (error) {
      console.error(`Error viewBuyerData seed:${seed}`, error);
      throw error;
    }
  },

  async viewSellerData(seed: string): Promise<GetStorageResult> {
    try {
      const data = null //read from HCS
      if (!data) return {data: null, isFound: false}
      return {data: "", isFound: true}
    } catch (error) {
      console.error(`Error viewSellerData seed:${seed}`, error);
      throw error;
    }
  },

  async resolveAddressToName(address: string): Promise<string | null> {
    return address;
  },

  async resolveNameToAddress(name: string): Promise<string | null> {
    return name;
  },

  mapNetworkName(name?: string): NetworkId {
    if (!name) throw new Error('Network name is required');
    const n = name.toLowerCase();
    if (n.includes('main')) return 'mainnet';
    if (n.includes('test')) return 'testnet';
    return name as NetworkId;
  },
};
