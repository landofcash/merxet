// Minimal subset of the Aptos wallet standard we actually use
import type {EntryFunctionPayload} from "@/context/wallet/types.ts";

export type AptosNetworkName = 'Mainnet' | 'Testnet' | 'Devnet' | 'Local' | string;

export interface AptosAccount {
  address: string;
  publicKey?: string;
}

export interface AptosNetwork {
  name: AptosNetworkName;
}

export interface AptosConnectOptions {
  onlyIfTrusted?: boolean;
}

export interface AptosSignMessagePayload {
  message: string;
  nonce?: string;
}

export interface AptosSignMessageResponse {
  signature: string | Uint8Array;
}

export interface AptosSignAndSubmitResponse {
  hash: string;
}

export interface PontemWalletProvider {
  // identity
  name?: string;
  isPetra?: boolean;
  isPontem?: boolean;
  provider?: { name?: string };

  // lifecycle
  connect(opts?: AptosConnectOptions): Promise<void>;
  disconnect?(): Promise<void>;

  // state
  account(): Promise<string | null>;
  network?(): Promise<AptosNetwork | null>;

  // events
  onAccountChange?(cb: (account: string | null) => void): void;
  onNetworkChange?(cb: (network: AptosNetwork | null) => void): void;
  off?(event: 'accountChange' | 'networkChange'): void;

  // crypto
  signMessage?(payload: AptosSignMessagePayload): Promise<AptosSignMessageResponse>;
  signAndSubmit(payload: EntryFunctionPayload): Promise<{payload: EntryFunctionPayload, result: PendingTransaction}>;
}

export interface PetraWalletProvider {
  // identity
  name?: string;
  isPetra?: boolean;
  isPontem?: boolean;
  provider?: { name?: string };

  // lifecycle
  connect(opts?: AptosConnectOptions): Promise<void>;
  disconnect?(): Promise<void>;

  // state
  account(): Promise<AptosAccount | null>;
  network?(): Promise<AptosNetwork | null>;

  // events
  onAccountChange?(cb: (account: AptosAccount | null) => void): void;
  onNetworkChange?(cb: (network: AptosNetwork | null) => void): void;
  off?(event: 'accountChange' | 'networkChange'): void;

  // crypto
  signMessage?(payload: AptosSignMessagePayload): Promise<AptosSignMessageResponse>;
  signAndSubmitTransaction(payload: EntryFunctionPayload): Promise<AptosSignAndSubmitResponse>;
}

declare global {
  interface Window {
    aptos?: PetraWalletProvider;
    pontem?: PontemWalletProvider;
  }
}

export {};
