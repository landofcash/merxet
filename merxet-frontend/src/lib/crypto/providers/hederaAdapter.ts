import type {ChainAdapter} from "@/lib/crypto/types/ChainAdapter";
import type {ContractFunctionPayload, NetworkId, WalletAdapter, TransactionPayload} from "@/context/wallet/types.ts";
import {getCurrentConfig} from "@/config";
import type {ProductData} from "@/lib/syncService.ts";
import type {GetStorageResult} from "@/lib/crypto/types/GetStorageResult.ts";
import type {CartItem} from "@/lib/cartStorage.ts";
import {hexToBytes, sha256, b64FromBytes, b64ToBytes} from "@/utils/encoding.ts";
import type {InternalAccount} from "@/lib/crypto/types/InternalAccount.ts";
// @ts-ignore
import {Client, AccountId, PrivateKey, AccountCreateTransaction, Hbar} from "@hiero-ledger/sdk";
import {ethers} from "ethers";
// @ts-ignore
import MerxetAbi from "@/contracts/Merxet.json";

// Helper to convert string seed to bytes32 (Uint8Array of 32 bytes)
async function seedToBytes32(seed: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return await sha256(encoder.encode(seed));
}

// Helper to convert string to bytes (Uint8Array)
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export const hederaAdapter: ChainAdapter = {
  name: "hedera",

  async generateAccount() {
    const privateKey = PrivateKey.generateECDSA();
    const publicKey = privateKey.publicKey;
    return {
      addr: "", // Address is unknown until the account is created on Hedera
      pubKey: b64FromBytes(publicKey.toBytes()),
      sk: privateKey.toBytes(),
      mnemonic: "" // Hedera SDK doesn't return mnemonic directly for generated keys
    };
  },

  async accountFromMnemonic(_mnemonic: string) {
    // This would require Mnemonic.fromString(mnemonic)
    throw new Error("Mnemonic recovery not implemented for Hedera yet");
  },

  accountToMnemonic(_internal: InternalAccount) {
    return undefined;
  },

  async signMessageInternal(internal: InternalAccount, message: string) {
    const privateKey = PrivateKey.fromBytes(internal.sk);
    return privateKey.sign(new TextEncoder().encode(message));
  },

  async getAccountCoinAmount(address: string, coinType: string): Promise<bigint> {
    const config = getCurrentConfig();
    try {
      const response = await fetch(`${config.hedera.mirrorNodeUrl}/api/v1/accounts/${address}`);
      const data = await response.json();
      if (coinType === "HBAR") {
        return BigInt(data.balance.balance);
      } else {
        // Fetch token balance
        const tokenResponse = await fetch(`${config.hedera.mirrorNodeUrl}/api/v1/accounts/${address}/tokens?tokenid=${coinType}`);
        const tokenData = await tokenResponse.json();
        if (tokenData.tokens && tokenData.tokens.length > 0) {
          return BigInt(tokenData.tokens[0].balance);
        }
      }
    } catch (e) {
      console.error("Error fetching balance:", e);
    }
    return 0n;
  },

  formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
    const amt = typeof amount === "bigint" ? Number(amount) : amount;
    const factor = Math.pow(10, decimals);
    return (amt / factor).toLocaleString(undefined, {
      maximumFractionDigits,
      minimumFractionDigits: 0
    });
  },

  async requestDevnetFaucet(accountAddress: string, amountOctas: number): Promise<void> {
    console.log("Faucet requested for", accountAddress, amountOctas);
    // On Hedera, you usually use the Hedera Portal for testnet HBAR
  },

  async uploadCatalogueUrlToBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    sellerPubKey: string,
    catalogueUrl: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const seedBytes = await seedToBytes32(seed);

    const payload: ContractFunctionPayload = {
      contractId: config.contractAddress,
      function: "createCatalogue",
      arguments: [
        seedBytes,
        stringToBytes(sellerPubKey),
        catalogueUrl
      ]
    };

    const result = await walletAdapter.executeContract(payload);
    return result.hash;
  },

  async deleteProductBoxOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const seedBytes = await seedToBytes32(seed);

    const payload: ContractFunctionPayload = {
      contractId: config.contractAddress,
      function: "deleteCatalogue",
      arguments: [seedBytes]
    };

    const result = await walletAdapter.executeContract(payload);
    return result.hash;
  },

  async createOrderInitialOnBlockchain(
    walletAdapter: WalletAdapter,
    tokenTotals: Record<string, bigint>,
    cartItems: CartItem[],
    orderSeed: string,
    buyerPubKey: string,
    encryptedSymKeyBuyer: string,
    encryptedSymKeySeller: string,
    symKeyHash: string,
    payloadHash: string,
    encryptedData: string
  ): Promise<string> {
    const config = getCurrentConfig();
    if (!cartItems?.length) throw new Error("Cart is empty");
    const first = cartItems[0];

    const tokenIds = Object.keys(tokenTotals || {});
    const tokenId = tokenIds[0] || "HBAR";
    const amount = tokenTotals[tokenId] ?? 0n;
    const tokenAddress = tokenId === "HBAR" ? "0x0000000000000000000000000000000000000000" : tokenId; // Should be EVM address of token

    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId: config.hcsTopicId,
          message: encryptedData
        }
      },
      {
        type: 'contract',
        data: {
          contractId: config.contractAddress,
          function: "createOrderInitial",
          arguments: [
            await seedToBytes32(orderSeed),
            await seedToBytes32(first.seed),
            amount,
            tokenAddress,
            stringToBytes(buyerPubKey),
            stringToBytes(encryptedSymKeyBuyer),
            stringToBytes(encryptedSymKeySeller),
            await seedToBytes32(symKeyHash),
            await seedToBytes32(payloadHash)
          ]
        }
      }
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async createOrderPaidOnBlockchain(
    walletAdapter: WalletAdapter,
    tokenTotals: Record<string, bigint>,
    cartItems: CartItem[],
    orderSeed: string,
    buyerPubKey: string,
    encryptedSymKeyBuyer: string,
    encryptedSymKeySeller: string,
    symKeyHash: string,
    payloadHash: string,
    encryptedData: string
  ): Promise<string> {
    const config = getCurrentConfig();
    if (!cartItems?.length) throw new Error("Cart is empty");
    const first = cartItems[0];

    const tokenIds = Object.keys(tokenTotals || {});
    const tokenId = tokenIds[0] || "HBAR";
    const amount = tokenTotals[tokenId] ?? 0n;
    const tokenAddress = tokenId === "HBAR" ? "0x0000000000000000000000000000000000000000" : tokenId;

    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId: config.hcsTopicId,
          message: encryptedData
        }
      },
      {
        type: 'contract',
        data: {
          contractId: config.contractAddress,
          function: "createOrderPaid",
          arguments: [
            await seedToBytes32(orderSeed),
            await seedToBytes32(first.seed),
            amount,
            tokenAddress,
            stringToBytes(buyerPubKey),
            stringToBytes(encryptedSymKeyBuyer),
            stringToBytes(encryptedSymKeySeller),
            await seedToBytes32(symKeyHash),
            await seedToBytes32(payloadHash)
          ],
          amount: tokenId === "HBAR" ? amount : 0n
        }
      }
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async refuseOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    encryptedDeliveryCommentData: string,
    _senderAddress: string,
    _tokenTypes: string[],
    _payerAddress: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId: config.hcsTopicId,
          message: encryptedDeliveryCommentData
        }
      },
      {
        type: 'contract',
        data: {
          contractId: config.contractAddress,
          function: "refuseOrder",
          arguments: [
            await seedToBytes32(seed),
            await seedToBytes32(payloadHashSeller)
          ]
        }
      }
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async startDeliveringOrderOnBlockchain(
    walletAdapter: WalletAdapter,
    seed: string,
    payloadHashSeller: string,
    encryptedDeliveryCommentData: string,
    _senderAddress: string
  ): Promise<string> {
    const config = getCurrentConfig();
    const batch: TransactionPayload[] = [
      {
        type: 'hcs',
        data: {
          topicId: config.hcsTopicId,
          message: encryptedDeliveryCommentData
        }
      },
      {
        type: 'contract',
        data: {
          contractId: config.contractAddress,
          function: "startDelivering",
          arguments: [
            await seedToBytes32(seed),
            await seedToBytes32(payloadHashSeller)
          ]
        }
      }
    ];

    const result = await walletAdapter.executeBatch(batch);
    return result.hash;
  },

  async viewProductOnBlockchain(seed: string): Promise<ProductData> {
    const config = getCurrentConfig();
    const seedBytes = await seedToBytes32(seed);

    try {
      const provider = new ethers.JsonRpcProvider(config.hedera.rpcUrl);
      const contract = new ethers.Contract(config.contractAddress, MerxetAbi.abi, provider);
      const catalogue = await contract.catalogues(seedBytes);

      if (catalogue.shop === ethers.ZeroAddress) {
        throw new Error("Catalogue not found");
      }

      return {
        version: Number(catalogue.version),
        seed: seed,
        shopWallet: catalogue.shop,
        sellerPubKey: b64FromBytes(hexToBytes(catalogue.sellerPubKey)),
        productsUrl: catalogue.catalogueUrl
      };
    } catch (error) {
      console.error("Error viewing product:", error);
      throw error;
    }
  },

  async viewBuyerData(seed: string): Promise<GetStorageResult> {
    return viewDataFromHCS(seed, true);
  },

  async viewSellerData(seed: string): Promise<GetStorageResult> {
    return viewDataFromHCS(seed, false);
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
    if (n.includes('preview')) return 'previewnet';
    if (n.includes('local')) return 'local';
    return name as NetworkId;
  },

};

async function viewOrder(seed: string): Promise<any> {
  const config = getCurrentConfig();
  const seedBytes = await seedToBytes32(seed);
  const provider = new ethers.JsonRpcProvider(config.hedera.rpcUrl);
  const contract = new ethers.Contract(config.contractAddress, MerxetAbi.abi, provider);
  return await contract.orders(seedBytes);
}

async function viewDataFromHCS(seed: string, isBuyer: boolean): Promise<GetStorageResult> {
  const config = getCurrentConfig();
  try {
    const orderData = await viewOrder(seed);
    const hashHex = isBuyer ? orderData.payloadHashBuyer : orderData.payloadHashSeller;

    if (!hashHex || hashHex === ethers.ZeroHash) {
      return {isFound: false, data: ""};
    }

    const startTime = orderData.createdTs.toString();
    const response = await fetch(`${config.hedera.mirrorNodeUrl}/api/v1/topics/${config.hcsTopicId}/messages?timestamp=gte:${startTime}`);
    const data = await response.json();

    if (!data.messages) return {isFound: false, data: ""};

    for (const msg of data.messages) {
      const messageBytes = b64ToBytes(msg.message);
      const messageHash = await sha256(messageBytes);
      const messageHashHex = "0x" + Buffer.from(messageHash).toString('hex');

      if (messageHashHex === hashHex) {
        return {isFound: true, data: msg.message}; // return base64
      }
    }
  } catch (e) {
    console.error("Error viewing data from HCS:", e);
  }

  return {isFound: false, data: ""};
}
