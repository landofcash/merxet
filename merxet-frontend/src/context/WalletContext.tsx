import {createContext, useContext, useState, useCallback, type ReactNode, useEffect, useMemo} from 'react'
import {APP_KEY_PREFIX, getCurrentConfig, getAvailableNetworkIds} from '@/config'
import {getActiveInternalWallet, loadAllInternalWallets, setActiveInternalWallet} from "@/lib/crypto/internalWallet.ts"
import {setChainAdapter} from '@/lib/crypto/cryptoUtils.ts'
import {hederaAdapter} from '@/lib/crypto/providers/hederaAdapter.ts'
import type {ChainId, NetworkId, WalletKind, WalletAdapter} from './wallet/types'
import {hashpackWalletAdapter} from './wallet/adapters/hashpackWalletAdapter.ts'
import {internalWalletAdapter} from './wallet/adapters/internalWalletAdapter'

function createAdaptersForChain(chain: ChainId): WalletAdapter[] {
  if (chain !== 'hedera') return []
  return [hashpackWalletAdapter]
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
  const [chain, setChain] = useState<ChainId>(() => (localStorage.getItem(`${APP_KEY_PREFIX}-chain`) as ChainId) || 'hedera')
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
    // If internal is selected, that is the active adapter
    if (walletKind === 'internal') return internalWalletAdapter

    // Otherwise, choose an external adapter
    if (!adapters?.length) return null
    if (externalProviderId) {
      return adapters.find(a => a.id === externalProviderId) ?? adapters[0]
    }
    // Prefer an installed adapter, else first available
    return adapters.find(a => a.isInstalled?.()) ?? adapters[0]
  }, [walletKind, adapters, externalProviderId])

  const availableExternalProviders = useMemo(() => {
    return (adapters || []).map(a => ({id: a.id, name: a.name, installed: a.isInstalled ? a.isInstalled() : true}))
      .filter(a => a.installed)
  }, [adapters])

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

  // Attempt silent reconnect on the load or when chain/provider changes
  useEffect(() => {
    const attemptReconnect = async () => {
      try {
        const legacyType = localStorage.getItem(`${APP_KEY_PREFIX}-walletType`) as string | null
        const preferredKind = (localStorage.getItem(`${APP_KEY_PREFIX}-walletKind`) as WalletKind | null)
          ?? (legacyType ? (legacyType === 'internal' ? 'internal' : 'external') : null)

        if (preferredKind === 'internal') {
          const internal = await getActiveInternalWallet()
          if (internal) {
            setWalletAddress(internal.addr.toString())
            setWalletKind('internal')
            return
          }
        }

        if (preferredKind === 'external') {
          // Try the selected provider silently; if it fails, fall back to others silently
          const candidates = adapters ? [
            externalProviderId ? adapters.find(a => a.id === externalProviderId) : undefined,
            ...adapters
          ].filter(Boolean) as WalletAdapter[] : []

          for (const a of candidates) {
            try {
              // 1) Try to read an address without initiating a connect prompt
              const addrFromProvider = await a.getAddress?.()
              if (addrFromProvider) {
                setWalletAddress(addrFromProvider)
                setWalletKind('external')
                setExternalProviderIdState(a.id)
                return
              }

              // 2) Fallback to truly silent connect (onlyIfTrusted for Petra)
              const addr = await a.connect({ silent: true })
              if (addr) {
                setWalletAddress(addr)
                setWalletKind('external')
                setExternalProviderIdState(a.id)
                return
              }
            } catch {
              // Ignore errors
            }
          }
        }

        // Fallback: No wallet found
        setWalletAddress(null)
        setWalletKind(null)
      } catch (e) {
        console.error('Wallet reconnect failed:', e)
        setWalletAddress(null)
        setWalletKind(null)
      }
    }

    void attemptReconnect()
  }, [chain, adapters, externalProviderId])

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

  // Subscribe to account/network changes of active adapter
  useEffect(() => {
    if (!activeAdapter || walletKind !== 'external') return
    const offAcc = activeAdapter.onAccountChange?.((addr) => {
      setWalletAddress(addr)
    })
    const offNet = activeAdapter.onNetworkChange?.((n) => {
      if (n) {
        switchNetwork(n)
      }
    })

    return () => {
      offAcc?.()
      offNet?.()
    }
  }, [activeAdapter, walletKind, switchNetwork])

  const connect = useCallback(async (opts?: {
    kind?: WalletKind;
    chain?: ChainId;
    providerId?: string;
    silent?: boolean
  }) => {
    try {
      const storedKind = localStorage.getItem(`${APP_KEY_PREFIX}-walletKind`) as WalletKind | null
      const targetKind = opts?.kind ?? storedKind ?? 'external'
      const targetChain = opts?.chain ?? chain
      const desiredProviderId = opts?.providerId ?? externalProviderId ?? undefined

      if (targetKind === 'internal') {
        const addr = await internalWalletAdapter.connect({silent: !!opts?.silent})
        if (addr) {
          setWalletAddress(addr)
          setWalletKind('internal')
          await refreshInternalAddresses()
        }
        return
      }

      // external
      const targetAdapters = walletAdapters[targetChain] ?? []
      let adapter = desiredProviderId ? targetAdapters.find(a => a.id === desiredProviderId) : undefined
      if (!adapter) {
        // choose the first installed adapter, else first available
        adapter = targetAdapters.find(a => a.isInstalled?.()) ?? targetAdapters[0]
      }
      if (!adapter) {
        throw new Error('No wallet adapters available for chain: ' + targetChain)
      }

      const address = await adapter.connect({silent: !!opts?.silent})
      if (address) {
        setWalletAddress(address)
        setWalletKind('external')
        setExternalProviderIdState(adapter.id)
        if (targetChain !== chain) setChain(targetChain)
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      throw error
    }
  }, [chain, externalProviderId, refreshInternalAddresses])

  const disconnect = useCallback(async () => {
    try {
      if (walletKind === 'external' && activeAdapter) {
        await activeAdapter.disconnect()
      } else if (walletKind === 'internal') {
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
  }, [walletKind, activeAdapter])



  const setExternalProviderId = useCallback((id: string | null) => {
    setExternalProviderIdState(id)
  }, [])

  const signMessage = useCallback(async (dataToSign: string, message: string): Promise<Uint8Array> => {
    if (!walletKind) {
      throw new Error('No wallet connected')
    }

    if (walletKind === 'internal') {
      if (!internalWalletAdapter.signMessage) throw new Error('Internal wallet cannot sign messages');
      return await internalWalletAdapter.signMessage(dataToSign, message)
    }

    // External wallet
    const adapter = activeAdapter
    if (!adapter) throw new Error('No active external wallet adapter')
    if (!adapter.signMessage) {
      throw new Error(`The selected wallet adapter (${adapter.name}) does not support message signing`)
    }
    return await adapter.signMessage(dataToSign, message)
  }, [walletKind, activeAdapter])


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
