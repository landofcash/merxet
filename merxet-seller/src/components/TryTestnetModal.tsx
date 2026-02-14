import React, { useEffect, useState } from 'react'
import { X, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/context/WalletContext'
import InternalWalletList from '@/components/wallet/InternalWalletList'
import ConfirmModal from '@/components/wallet/ConfirmModal'
import ExportModal from '@/components/wallet/ExportModal'
import ImportModal from '@/components/wallet/ImportModal'
import {
  loadAllInternalWallets,
  loadInternalWalletByAddress,
  exportInternalWallet,
  removeInternalWallet,
  importInternalWallet,
  createInternalWallet,
} from '@/lib/crypto/internalWallet'
import petraLogo from '@/assets/petra-logo.svg'
import pontemLogo from '@/assets/pontem-logo.svg'
import genericWalletLogo from '@/assets/wallet.svg'
interface TryTestnetModalProps {
  open: boolean
  onClose: () => void
}

const TryTestnetModal: React.FC<TryTestnetModalProps> = ({ open, onClose }) => {
  const {
    walletAddress,
    walletKind,
    connect,
    switchNetwork,
    network,
    availableExternalProviders,
    setExternalProviderId,
    internalAddresses,
    refreshInternalAddresses,
    activateInternalAddress,
    disconnect,
  } = useWallet()

  const [busy, setBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportAddr, setExportAddr] = useState<string | null>(null)
  const [exportMnemonic, setExportMnemonic] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDeleteAddr, setConfirmDeleteAddr] = useState<string | null>(null)
  const [newCreatedAddr, setNewCreatedAddr] = useState<string | null>(null)


  useEffect(() => {
    if (open) void refreshInternalAddresses()
  }, [open, refreshInternalAddresses])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open])

  const providerLogos: Record<string, string> = {
    petra: petraLogo,
    pontem: pontemLogo,
  }
  // Show the external wallets section only if at least one provider is installed
  const hasInstalledExternal = availableExternalProviders?.some((p) => p.installed) ?? false;

  const handleActivate = async (addr: string) => {
    await activateInternalAddress(addr)
  }

  const handleCreate = async () => {
    try {
      setBusy(true)
      setNewCreatedAddr(null)
      if (network !== 'testnet') {
        await switchNetwork('testnet')
      }

      // Create an internal wallet first (without connecting yet)
      const newAccount = await createInternalWallet()
      await refreshInternalAddresses()

      const newAddr = newAccount?.addr
      if (newAddr) {
        setNewCreatedAddr(newAddr)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (addr: string) => {
    try {
      setBusy(true)
      setExportAddr(addr)
      const acc = await loadInternalWalletByAddress(addr)
      if (!acc) return
      const mnemonic = exportInternalWallet(acc)
      setExportMnemonic(mnemonic)
      setExportOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = (addr: string) => setConfirmDeleteAddr(addr)

  const confirmDelete = async () => {
    if (!confirmDeleteAddr) return
    try {
      setBusy(true)
      await removeInternalWallet(confirmDeleteAddr)
      await refreshInternalAddresses()

      // If user deleted active internal wallet, try fallback
      if (walletKind === 'internal' && walletAddress === confirmDeleteAddr) {
        const updated = await loadAllInternalWallets()
        if (updated.length > 0) {
          await activateInternalAddress(updated[0].addr)
        } else {
          await disconnect()
        }
      }
    } finally {
      setConfirmDeleteAddr(null)
      setBusy(false)
    }
  }

  const handleImportSubmit = async (mnemonic: string) => {
    try {
      setBusy(true)
      const acc = await importInternalWallet(mnemonic)
      await refreshInternalAddresses()
      await activateInternalAddress(acc.addr)
      setImportOpen(false)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const goTestnet = async () => {
    if (network !== 'testnet') await switchNetwork('testnet')
  }

 return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl mx-4 bg-card border rounded-2xl shadow-lg max-h-[75vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header image (keep inline with WalletInstallModal style) */}
        <div className="relative">
          <img src="/aptos-banner.jpg" alt="Aptos banner" className="w-full h-22 object-cover" />
          <button onClick={onClose} className="absolute top-3 right-3 text-white/90 hover:text-white" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div>
            <h3 className="text-xl font-semibold">Try Aptoosh on Aptos Testnet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Quick start: create a built-in wallet in seconds or connect an existing one. Then (optionally) add free test APT via the faucet to try payments safely.
            </p>
          </div>

          {/* Network quick switch */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">
              You are on <strong className="text-foreground">{network}</strong>.
            </div>
            {network !== 'testnet' && (
              <Button onClick={goTestnet} className="text-sm inline-flex items-center gap-2">
                <RefreshCcw className="w-4 h-4" />
                Switch to TESTNET
              </Button>
            )}
          </div>

          {/* External providers (only if you have some installed) */}
          {hasInstalledExternal && (
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground mb-2">Installed Wallets</div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableExternalProviders.filter((p) => p.installed).map((p) => (
                  <li key={p.id}>
                    <Button
                      onClick={async () => {
                        setExternalProviderId(p.id)
                        await connect({ kind: 'external', chain: 'aptos', providerId: p.id })
                        onClose()
                      }}
                      className="w-full justify-start text-sm"
                    >
                      <img
                        src={(providerLogos)[p.id] ?? genericWalletLogo}
                        alt=""
                        className="w-4 h-4 mr-2"
                        aria-hidden="true"
                      />
                      {p.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Internal wallets */}
          <div className="rounded-lg border p-3">
            <InternalWalletList
              addresses={internalAddresses}
              activeAddress={walletKind === 'internal' ? walletAddress : null}
              isInternalActive={walletKind === 'internal'}
              onActivate={handleActivate}
              onCreate={handleCreate}
              onImport={() => setImportOpen(true)}
              onExport={handleExport}
              onDelete={handleDelete}
            />

            <p className="mt-3 text-xs text-muted-foreground">
              On TESTNET, use the faucet to fund your wallet with free test APT.
            </p>
          </div>

          {newCreatedAddr && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <a
                href='https://aptos.dev/network/faucet'
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-sm"
              >
                Open Faucet
              </a>
            </div>
          )}
        </div>

        {/* Shared modals used by InternalWalletList actions */}
        <ConfirmModal
          open={!!confirmDeleteAddr}
          title="Delete Internal Wallet"
          message={<div>Are you sure you want to delete this internal wallet?</div>}
          confirmLabel={busy ? 'Deleting…' : 'Delete'}
          confirmVariant="destructive"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteAddr(null)}
        />
        <ExportModal open={exportOpen} address={exportAddr} mnemonic={exportMnemonic} onClose={() => setExportOpen(false)} />
        <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImportSubmit} />
      </div>
    </div>
  )
}

export default TryTestnetModal
