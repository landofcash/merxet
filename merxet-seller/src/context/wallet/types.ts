export type ChainId = 'hedera' | string;
export type NetworkId = 'mainnet' | 'testnet' | string;
export type WalletKind = 'external' | 'internal';

export type EntryFunctionPayload = {
  function: string;
  type_arguments?: string[];
  arguments: (string | number)[];
};

export interface WalletAdapter {
  readonly chain: ChainId;
  readonly name: string;
  readonly id: string;

  isInstalled?(): boolean;

  getAddress(): Promise<string | null>;
  getNetwork?(): Promise<NetworkId | null>;

  connect(opts?: { silent?: boolean }): Promise<string | null>;
  disconnect(): Promise<void>;

  onAccountChange?(cb: (address: string | null) => void): () => void;
  onNetworkChange?(cb: (network: NetworkId | null) => void): () => void;

  signMessage(dataToSign: string, message?: string): Promise<Uint8Array>;
  signAndSubmit(transaction: object): Promise<{ hash: string, txId?: string }>;
}
