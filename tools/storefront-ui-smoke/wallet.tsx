// Browser smoke fixture only. Never imported by the production seller build.
import {useEffect, useState, type ReactNode} from 'react';
import {signMessage as internalSignMessage} from '../../merxet-seller/src/lib/hedera/hederaUtils';

let account = '0.0.1001', network = 'testnet';
const listeners = new Set<() => void>();
export function WalletProvider({children}: {children: ReactNode}) { return children; }
export function useWallet() {
  const [, update] = useState(0);
  // Fixture updates are driven by existing account/network controls.
  useEffect(() => { const listener = () => update(value => value + 1); listeners.add(listener); return () => { listeners.delete(listener); }; }, []);
  const noop = async () => {};
  return {walletAddress: account, network, chain: 'hedera', walletKind: 'internal', activeInternalWalletId: account,
    walletIdentity: {address: account}, walletLifecycleState: 'ready', walletLocked: false, walletCanTransact: true,
    walletBalances: [], internalWallets: [], walletBootstrapTitle: null, walletBootstrapMessage: null, walletActionPending: false,
    refreshActiveInternalWallet: noop, changeInternalWalletPassphrase: noop, lockInternalWallet: noop, removeInternalWallet: noop, associateInternalToken: noop,
    revealInternalWalletBackup: async () => [], disconnect: async () => { account = '0.0.1002'; for (const listener of listeners) listener(); },
    switchNetwork: async (value: string) => { network = value; for (const listener of listeners) listener(); },
    // The operational seller signing function, with a public deterministic TEST key.
    signMessage: (message: string) => internalSignMessage({addr: account, sk: new Uint8Array(32).fill(account === '0.0.1001' ? 0x11 : 0x22)}, message),
  };
}
