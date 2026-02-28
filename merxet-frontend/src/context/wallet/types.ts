export type ChainId = 'hedera' | string;
export type NetworkId = 'mainnet' | 'testnet' | 'previewnet' | 'local' | string;
export type WalletKind = 'external' | 'internal';
export type WalletProviderId = 'hashpack' | 'blade' | string;

export type ContractFunctionPayload = {
  contractId: string;
  function: string;
  arguments: any[];
  amount?: bigint; // amount of HBAR to send
};

export type HCSMessagePayload = {
  topicId: string;
  message: string | Uint8Array;
};

export type TransactionPayload = 
  | { type: 'contract', data: ContractFunctionPayload }
  | { type: 'hcs', data: HCSMessagePayload };

export interface WalletAdapter {
  readonly chain: ChainId;
  readonly name: string;
  readonly id: WalletProviderId;

  // Optional: detect if the adapter can be used on this device/session (e.g., window provider installed)
  isInstalled?(): boolean;

  getAddress(): Promise<string | null>;
  getNetwork?(): Promise<NetworkId | null>;

  connect(opts?: { silent?: boolean }): Promise<string | null>;
  disconnect(): Promise<void>;

  onAccountChange?(cb: (address: string | null) => void): () => void;
  onNetworkChange?(cb: (network: NetworkId | null) => void): () => void;

  signMessage(dataToSign: string, message?: string): Promise<Uint8Array>;
  executeContract(payload: ContractFunctionPayload): Promise<{ hash: string }>;
  executeBatch(payloads: TransactionPayload[]): Promise<{ hash: string }>;
}
