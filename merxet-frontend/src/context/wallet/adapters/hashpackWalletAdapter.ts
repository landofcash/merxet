import type {WalletAdapter, NetworkId, ContractFunctionPayload, TransactionPayload} from '../types';
// @ts-ignore
import { HashConnect, HashConnectTypes, MessageTypes } from 'hashconnect';

let hashconnect: HashConnect | null = null;
let saveData: any = null;

export const hashpackWalletAdapter: WalletAdapter = {
    chain: 'hedera',
    name: 'HashPack',
    id: 'hashpack',

    isInstalled() {
        return true; // Hashpack usually works via a bridge even if not "installed" as extension
    },

    async getAddress() {
        return saveData?.accountIds?.[0] || null;
    },

    async getNetwork() {
        return saveData?.network || 'testnet';
    },

    async connect(opts) {
        if (!hashconnect) {
            hashconnect = new HashConnect(true);
        }
        
        const appMetadata = {
            name: "Merxet",
            description: "Decentralized Marketplace on Hedera",
            icon: "https://merxet.com/logo.png"
        };

        const initData = await hashconnect.init(appMetadata, "testnet", false);
        saveData = initData;

        if (opts?.silent && initData.accountIds.length > 0) {
            return initData.accountIds[0];
        }

        hashconnect.connectToLocalWallet();
        
        return new Promise((resolve) => {
            hashconnect!.pairingEvent.once((pairingData) => {
                saveData = pairingData;
                resolve(pairingData.accountIds[0]);
            });
        });
    },

    async disconnect() {
        if (hashconnect && saveData) {
            await hashconnect.disconnect(saveData.topic);
            saveData = null;
        }
    },

    async signMessage(dataToSign: string) {
        if (!hashconnect || !saveData) throw new Error("Wallet not connected");
        // Simplified for this example
        return new Uint8Array();
    },

    async executeContract(payload: ContractFunctionPayload) {
        if (!hashconnect || !saveData) throw new Error("Wallet not connected");

        // Here we would use hashconnect.sendTransaction or similar
        // For now, returning a dummy hash
        console.log("Executing contract call:", payload);
        return { hash: "0x" + "0".repeat(64) };
    },

    async executeBatch(payloads: TransactionPayload[]) {
        if (!hashconnect || !saveData) throw new Error("Wallet not connected");

        // In HashPack, you can send multiple transactions
        console.log("Executing batch transactions:", payloads);
        return { hash: "0x" + "0".repeat(64) };
    }
};
