import * as bip39 from '@scure/bip39';
import {wordlist} from '@scure/bip39/wordlists/english.js';
import type {InternalAccount} from '@/lib/crypto/types/InternalAccount.ts';
import {bytesToHex, hexToBytes, type Address, type Hex,} from 'viem';
import {mnemonicToAccount, privateKeyToAccount} from 'viem/accounts';
import {getCurrentConfig} from "@/config.ts";
import {AccountId} from "@hiero-ledger/sdk";

/**
 * Hedera ECDSA wallet derivation path commonly used for HBAR.
 */
export const HEDERA_PATH = "m/44'/60'/0'/0/0";

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function getHederaAccountIdFromEvmAddress(evmAddress: string): Promise<AccountId> {
  const config = getCurrentConfig();
  const mirrorNodeUrl = config.hedera.mirrorNodeUrl;

  const response = await fetch(`${mirrorNodeUrl}/api/v1/accounts/${evmAddress}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch account info from mirror node: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.account) {
    throw new Error(`No Hedera account found for EVM address: ${evmAddress}`);
  }
  return AccountId.fromString(data.account);
}

/**
 * Signs the provided message bytes (raw) using ECDSA (secp256k1).
 *
 * Note: this produces a standard EIP-191 personal_sign signature.
 */
export async function signMessage(internalAccount: InternalAccount, message: string): Promise<Uint8Array> {
  const account = toAccount(internalAccount);
  const raw = bytesToHex(new TextEncoder().encode(message));
  const sigHex = await account.signMessage({message: {raw}});
  return hexToBytes(sigHex);
}

/**
 * Converts your InternalAccount to a viem LocalAccount.
 *
 * InternalAccount.sk is expected to be a 32-byte ECDSA private key.
 */
export function toAccount(internal: InternalAccount) {
  const pkHex = bytesToHex(internal.sk) as Hex;
  return privateKeyToAccount(pkHex);
}

export function fromAccount(address: Address, privateKeyHex: Hex, mnemonic?: string): InternalAccount {
  return {
    addr: address,
    sk: hexToBytes(privateKeyHex),
    mnemonic,
  };
}

export async function generateAccount(): Promise<InternalAccount> {
  return generateAccountWithMnemonic();
}

export async function accountFromMnemonic(mnemonic: string): Promise<InternalAccount> {
  const account = mnemonicToAccount(mnemonic, {path: HEDERA_PATH});
  const hdKey = account.getHdKey();
  if (!hdKey?.privateKey) {
    throw new Error('mnemonicToAccount did not expose a private key.');
  }
  const privateKeyHex = (bytesToHex(hdKey.privateKey) as Hex);
  return fromAccount(account.address, privateKeyHex, mnemonic);
}

export function accountToMnemonic(internalAccount: InternalAccount): string | undefined {
  return internalAccount.mnemonic;
}

async function generateAccountWithMnemonic(): Promise<InternalAccount> {
  const mnemonic = bip39.generateMnemonic(wordlist);
  return accountFromMnemonic(mnemonic);
}

export function formatCoinAmount(amount: bigint | number, decimals: number, maximumFractionDigits = 4): string {
  const num = typeof amount === 'bigint' ? Number(amount) : Number(amount);
  return (num / Math.pow(10, decimals)).toLocaleString(undefined, {maximumFractionDigits});
}

export async function getAccountCoinAmount(address: string, coinId: string): Promise<bigint> {
  const base = getCurrentConfig().hedera.mirrorNodeUrl;
  const res = await fetch(`${base}/api/v1/accounts/${address}`);
  if (!res.ok) {
    if (res.status === 404) {
      return 0n;
    }
    throw new Error(`Mirror node error ${res.status}`);
  }
  const data = await res.json();
  if (coinId === "0.0.0") {
    return BigInt(data.balance.balance);
  }
  const tokens = data.balance.tokens ?? [];
  const token = tokens.find((t: { token_id: string; }) => t.token_id === coinId);
  return token ? BigInt(token.balance) : 0n;
}

export function toMirrorTxId(txId: string): string {
  // Already mirror format: 0.0.x-sss-nnn
  if (txId.includes("-")) return txId;

  // Hashscan format: 0.0.x@sss.nnn
  const [account, time] = txId.split("@");
  if (!account || !time) return txId;

  const [seconds, nanos] = time.split(".");
  if (!seconds || !nanos) return txId;

  return `${account}-${seconds}-${nanos}`;
}

export async function getTopicIdFromTx(txId: string): Promise<string> {
  let retries = 5;
  const base = getCurrentConfig().hedera.mirrorNodeUrl;
  const mirrorTxId = toMirrorTxId(txId);

  while (retries-- > 0) {
    await sleep(3000);
    try {
      const res = await fetch(`${base}/api/v1/transactions/${mirrorTxId}`);
      if (!res.ok) {
        continue;
      }

      const entityId = (await res.json())?.transactions?.[0]?.entity_id;
      if (entityId) return entityId;
    } catch (err) {
      console.warn(
        `[mirror] attempt failed for tx ${mirrorTxId}, retries left=${retries}`,
        err instanceof Error ? err.message : err
      );
    }
  }
  throw new Error(`Topic ID not found for tx ${txId}`);
}