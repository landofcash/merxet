import {createContext, useContext, useState, useCallback, type ReactNode, useEffect, useMemo} from 'react'
import {APP_KEY_PREFIX, getCurrentConfig, getAvailableNetworkIds} from '@/config'
import {getActiveInternalWallet, loadAllInternalWallets, setActiveInternalWallet} from "@/lib/crypto/internalWallet.ts"
import {setChainAdapter} from '@/lib/crypto/cryptoUtils.ts'
import {hederaAdapter} from '@/lib/crypto/providers/hederaAdapter.ts'
import type {ChainId, NetworkId, WalletKind, WalletAdapter} from './wallet/types'
import {internalWalletAdapter} from './wallet/adapters/internalWalletAdapter'

function createAdaptersForChain(chain: ChainId): WalletAdapter[] {
  if (chain !== 'hedera') return []
  return []
}

// Registry of external wallet adapters by chain
const walletAdapters: Record<ChainId, WalletAdapter[]> = {
  hedera: createAdaptersForChain('hedera'),
}

export interface WalletContextType {
  walletAddress: string | null
  walletAdapter: WalletAdapter | null
  network: NetworkId
  chain: ChainId
  walletKind: WalletKind | null

  // Which external provider is selected (e.g., 'petra')
  externalProviderId: string | null
  availableExternalProviders: { id: string; name: string; installed: boolean }[]

  // Internal wallet management
  internalAddresses: string[]
  refreshInternalAddresses: () => Promise<void>
  activateInternalAddress: (addr: string) => Promise<void>

  connect: (opts?: { kind?: WalletKind; chain?: ChainId; providerId?: string; silent?: boolean }) => Promise<void>
  disconnect: () => Promise<void>
  switchNetwork: (network: NetworkId) => void
  setWalletKind: (kind: WalletKind | null) => void
  setExternalProviderId: (id: string | null) => void

  signMessage: (dataToSign: string, message: string) => Promise<Uint8Array>
}

const WalletContext = createContext<WalletContextType | null>(null)

export function WalletProvider({children}: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletKind, setWalletKind] = useState<WalletKind | null>(() => {
    return (localStorage.getItem(`${APP_KEY_PREFIX}-walletKind`) as WalletKind | null) ?? null
  })
  const [chain] = useState<ChainId>(() => (localStorage.getItem(`${APP_KEY_PREFIX}-chain`) as ChainId) || 'hedera')
  const [network, setNetwork] = useState<NetworkId>(() => (getCurrentConfig().name as NetworkId) || 'testnet')
  const [externalProviderId, setExternalProviderIdState] = useState<string | null>(() => localStorage.getItem(`${APP_KEY_PREFIX}-externalProviderId`))
  const [internalAddresses, setInternalAddresses] = useState<string[]>([])

  // crypto layer adapter
  useEffect(() => {
    if (chain === 'hedera') setChainAdapter(hederaAdapter)
  }, [chain])

  // Persist walletKind (only write when non-null; don't remove on null to keep last known for reload)
  useEffect(() => {
    if (walletKind) {
      localStorage.setItem(`${APP_KEY_PREFIX}-walletKind`, walletKind)
    }
  }, [walletKind])

  // Persist external provider id (only write when non-null; don't remove on null to keep last known for reload)
  useEffect(() => {
    if (externalProviderId) {
      localStorage.setItem(`${APP_KEY_PREFIX}-externalProviderId`, externalProviderId)
    }
  }, [externalProviderId])

  const adapters = useMemo(() => walletAdapters[chain] ?? [], [chain])

  const activeAdapter: WalletAdapter | null = useMemo(() => {
    if (walletKind === 'internal') return internalWalletAdapter
    return null
  }, [walletKind, adapters, externalProviderId])

  const availableExternalProviders = useMemo(() => [], [])

  const refreshInternalAddresses = useCallback(async () => {
    try {
      const wallets = await loadAllInternalWallets()
      setInternalAddresses(wallets.map(w => w.addr))
    } catch (e) {
      console.error('Failed to load internal addresses:', e)
      setInternalAddresses([])
    }
  }, [])

  useEffect(() => {
    void refreshInternalAddresses()
  }, [refreshInternalAddresses])

  const activateInternalAddress = useCallback(async (addr: string) => {
    await setActiveInternalWallet(addr)
    setWalletAddress(addr)
    setWalletKind('internal')
  }, [])

  useEffect(() => {
    const attemptReconnect = async () => {
      try {
        const legacyType = localStorage.getItem(`${APP_KEY_PREFIX}-walletType`) as string | null
        const preferredKind = (localStorage.getItem(`${APP_KEY_PREFIX}-walletKind`) as WalletKind | null)
          ?? (legacyType ? (legacyType === 'internal' ? 'internal' : 'external') : null)

        if (preferredKind !== 'external') {
          const internal = await getActiveInternalWallet()
          if (internal) {
            setWalletAddress(internal.addr.toString())
            setWalletKind('internal')
            return
          }
        }

        setWalletAddress(null)
        setWalletKind(null)
      } catch (e) {
        console.error('Wallet reconnect failed:', e)
        setWalletAddress(null)
        setWalletKind(null)
      }
    }

    void attemptReconnect()
  }, [])

  const switchNetwork = useCallback((newNetwork: NetworkId) => {
    if (network === newNetwork) return;

    const supported = new Set(getAvailableNetworkIds());
    if (!supported.has(newNetwork)) {
      //toast.error(`Network ${newNetwork} is not supported by this app.`)
      console.error(`Network ${newNetwork} is not supported by this app.`)
      return;
    }
    setNetwork(newNetwork);
    localStorage.setItem(`${APP_KEY_PREFIX}-network`, newNetwork);
  }, [network])

  const connect = useCallback(async (opts?: {
    kind?: WalletKind;
    chain?: ChainId;
    providerId?: string;
    silent?: boolean
  }) => {
    try {
      const storedKind = localStorage.getItem(`${APP_KEY_PREFIX}-walletKind`) as WalletKind | null
      const targetKind = opts?.kind === 'external' ? 'internal' : (opts?.kind ?? storedKind ?? 'internal')

      if (targetKind === 'internal') {
        const addr = await internalWalletAdapter.connect({silent: !!opts?.silent})
        if (addr) {
          setWalletAddress(addr)
          setWalletKind('internal')
          await refreshInternalAddresses()
        }
        return
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      throw error
    }
  }, [refreshInternalAddresses])

  const disconnect = useCallback(async () => {
    try {
      if (walletKind === 'internal') {
        await internalWalletAdapter.disconnect()
      }

      setWalletAddress(null)
      setWalletKind(null)
      // Explicitly clear persisted selections only on user-driven disconnect
      localStorage.removeItem(`${APP_KEY_PREFIX}-walletKind`)
      localStorage.removeItem(`${APP_KEY_PREFIX}-externalProviderId`)
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    }
  }, [walletKind])



  const setExternalProviderId = useCallback((id: string | null) => {
    setExternalProviderIdState(id)
  }, [])

  const signMessage = useCallback(async (dataToSign: string, message: string): Promise<Uint8Array> => {
    if (walletKind !== 'internal') {
      throw new Error('No wallet connected')
    }

    if (!internalWalletAdapter.signMessage) throw new Error('Internal wallet cannot sign messages');
    return await internalWalletAdapter.signMessage(dataToSign, message)
  }, [walletKind])


  return (
    <WalletContext.Provider value={{
      walletAddress,
      walletAdapter: activeAdapter,
      network,
      chain,
      walletKind,
      externalProviderId,
      availableExternalProviders,
      internalAddresses,
      refreshInternalAddresses,
      activateInternalAddress,

      connect,
      disconnect,
      switchNetwork,
      setWalletKind,
      setExternalProviderId,

      signMessage
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within a WalletProvider')
  return context
}
