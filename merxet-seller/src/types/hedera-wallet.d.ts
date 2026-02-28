export interface HashpackWalletProvider {
  // identity
  name?: string;
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