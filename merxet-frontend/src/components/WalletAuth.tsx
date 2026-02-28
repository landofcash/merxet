import React, {useEffect, useState, useRef, useCallback} from "react";
import {LogOut, Wallet as WalletIcon, RefreshCcw, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useWallet} from "@/context/WalletContext";
import CopyableField from "@/components/CopyableField";
import InternalWalletList from "@/components/wallet/InternalWalletList";
import ConfirmModal from "@/components/wallet/ConfirmModal";
import ExportModal from "@/components/wallet/ExportModal";
import ImportModal from "@/components/wallet/ImportModal";
import {
  loadAllInternalWallets,
  loadInternalWalletByAddress,
  exportInternalWallet,
  removeInternalWallet,
  importInternalWallet,
} from "@/lib/crypto/internalWallet";
import {truncateString} from "@/lib/cryptoFormat.ts";
import petraLogo from "@/assets/petra-logo.svg";
import pontemLogo from "@/assets/pontem-logo.svg";
import genericWalletLogo from "@/assets/wallet.svg";

// Simple network switcher for Hedera
import { getAvailableNetworkIds } from "@/config";
import type { NetworkId } from "@/context/wallet/types";

function NetworkSwitcher({ current, onSwitch }: { current: string; onSwitch: (n: NetworkId) => void }) {
  const networks = getAvailableNetworkIds();
  return (
    <div className="space-y-2">
      {networks
        .filter((id) => id !== (current as NetworkId))
        .map((id) => (
          <Button
            key={id}
            onClick={() => onSwitch(id)}
            className="w-full justify-start text-sm bg-gray-500 hover:bg-gray-600 text-white cursor-pointer"
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            Switch to {id.toUpperCase()}
          </Button>
        ))}
      <div className="text-muted-foreground text-xs text-right">[{current}]</div>
    </div>
  );
}

const WalletAuth: React.FC = () => {
  const {
    walletAddress,
    walletKind,
    connect,
    disconnect,
    switchNetwork,
    network,
    availableExternalProviders,
    setExternalProviderId,
    internalAddresses,
    refreshInternalAddresses,
    activateInternalAddress,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportAddr, setExportAddr] = useState<string | null>(null);
  const [exportMnemonic, setExportMnemonic] = useState<string | null>(null);
  const [confirmDeleteAddr, setConfirmDeleteAddr] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close panels when clicking outside and on Escape
  useEffect(() => {
    if (!(open || openConnect)) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setOpenConnect(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setOpenConnect(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, openConnect]);

  useEffect(() => {
    if (open || openConnect) void refreshInternalAddresses();
  }, [open, openConnect, refreshInternalAddresses]);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const handleActivate = useCallback(async (addr: string) => {
    await activateInternalAddress(addr);
    setOpen(false);
  }, [activateInternalAddress]);

  const handleCreate = useCallback(() => withBusy(async () => {
    await connect({kind: 'internal', silent: false});
    await refreshInternalAddresses();
  }), [connect, refreshInternalAddresses, withBusy]);

  const handleExport = useCallback((addr: string) => withBusy(async () => {
    setExportAddr(addr);
    const acc = await loadInternalWalletByAddress(addr);
    if (!acc) {
      console.error('Internal wallet not found for export');
      return;
    }
    const mnemonic = exportInternalWallet(acc);
    setExportMnemonic(mnemonic);
    setExportOpen(true);
  }), [withBusy]);

  const handleDelete = useCallback((addr: string) => {
    setConfirmDeleteAddr(addr);
  }, []);

  const confirmDelete = useCallback(() => withBusy(async () => {
    const addr = confirmDeleteAddr;
    if (!addr) return;
    await removeInternalWallet(addr);
    await refreshInternalAddresses();

    if (walletKind === 'internal' && walletAddress === addr) {
      const updated = await loadAllInternalWallets();
      if (updated.length > 0) {
        await activateInternalAddress(updated[0].addr);
      } else {
        await disconnect();
      }
    }
    setConfirmDeleteAddr(null);
  }), [confirmDeleteAddr, walletKind, walletAddress, refreshInternalAddresses, activateInternalAddress, disconnect, withBusy]);

  const handleImportSubmit = useCallback((mnemonic: string) => withBusy(async () => {
    const acc = await importInternalWallet(mnemonic);
    await refreshInternalAddresses();
    await activateInternalAddress(acc.addr);
    setImportOpen(false);
    setOpen(false);
    setOpenConnect(false);
  }), [refreshInternalAddresses, activateInternalAddress, withBusy]);

  const handleConnectProvider = useCallback((id: string) => withBusy(async () => {
    try {
      setExternalProviderId(id);
      await connect({ kind: "external", chain: "hedera", providerId: id });
    } catch (e: any) {
      console.error('Failed to connect provider:', e);
      alert(`Wallet connect failed: ${e?.message ?? e}`);
      throw e;
    } finally {
      setOpenConnect(false);
    }
  }), [setExternalProviderId, connect, withBusy]);

  const providers = availableExternalProviders.filter((p) => p.installed);

  // Map provider ids to logo assets
  const providerLogos: Record<string, string> = {
    petra: petraLogo,
    pontem: pontemLogo
  };

  if (!walletAddress) {
    return (
      <div ref={containerRef} className="inline-block w-full max-w-full">
        <Button
          onClick={() => setOpenConnect((s) => !s)}
          className="w-full px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white cursor-pointer"
          aria-expanded={openConnect}
          aria-controls="wallet-connect-panel"
        >
          <WalletIcon className="w-4 h-4" />
          <span>Connect Wallet</span>
        </Button>

        {openConnect && (
          <div
            id="wallet-connect-panel"
            className="mt-2 w-full max-w-full border rounded shadow-lg p-4 text-sm bg-background"
            role="region"
            aria-label="Connect Wallet Panel"
          >
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2">External wallets</div>
              <ul className="space-y-2">
                {providers.map((p) => (
                  <li key={p.id}>
                    <Button
                      onClick={() => handleConnectProvider(p.id)}
                      className="w-full justify-start text-sm"
                      disabled={busy}
                    >
                      <img src={providerLogos[p.id] ?? genericWalletLogo} alt="" className="w-4 h-4 mr-2" aria-hidden="true" />
                      {p.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t pt-3">
              <InternalWalletList
                addresses={internalAddresses}
                activeAddress={walletKind === 'internal' ? walletAddress : null}
                isInternalActive={walletKind === 'internal'}
                onActivate={async (addr) => {
                  await handleActivate(addr);
                  setOpenConnect(false);
                }}
                onCreate={async () => {
                  await handleCreate();
                  setOpenConnect(false);
                }}
                onImport={() => setImportOpen(true)}
                onExport={handleExport}
                onDelete={handleDelete}
              />
            </div>

            {/* Modals for internal wallets */}
            <ConfirmModal
              open={!!confirmDeleteAddr}
              title="Delete Internal Wallet"
              message={
                <div>
                  Are you sure you want to delete this internal wallet?<br />
                  <CopyableField value={confirmDeleteAddr ?? ""} length={22} />
                </div>
              }
              confirmLabel={busy ? 'Deleting…' : 'Delete'}
              confirmVariant="destructive"
              onConfirm={confirmDelete}
              onCancel={() => setConfirmDeleteAddr(null)}
            />
            <ExportModal open={exportOpen} address={exportAddr} mnemonic={exportMnemonic}
                         onClose={() => { setExportOpen(false); setExportAddr(null); setExportMnemonic(null); }} />
            <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImportSubmit} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="inline-block">
      <Button
        variant="outline"
        aria-label="Wallet Menu"
        onClick={() => setOpen((s) => !s)}
        className="w-full items-center gap-1 px-2 py-1 text-sm sm:px-3 sm:gap-2 cursor-pointer bg-green-200 hover:bg-green-300"
        aria-expanded={open}
        aria-controls="wallet-menu-panel"
      >
        <WalletIcon className="w-4 h-4" />
        <span>
          {truncateString(walletAddress, 25)}
        </span>
      </Button>

      {open && (
        <div
          id="wallet-menu-panel"
          className="mt-2 w-full max-w-full border rounded shadow-lg p-6 space-y-3 text-sm bg-background"
          role="region"
          aria-label="Wallet Menu Panel"
        >
          <div className="flex justify-end sm:hidden -mt-2 -mr-2">
            <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close">
              <X className="w-5 h-5 text-gray-500" />
            </Button>
          </div>

          <div>
            <p className="text-muted-foreground text-xs mb-1">Connected Wallet</p>
            <div className="font-mono break-all text-foreground text-xs sm:text-sm">
              <CopyableField value={walletAddress} length={22} />
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={disconnect}
              className="w-full justify-start text-sm bg-red-500 hover:bg-red-600 text-white cursor-pointer"
              disabled={busy}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
            <NetworkSwitcher current={network} onSwitch={switchNetwork as (n: any) => void} />
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletAuth;
