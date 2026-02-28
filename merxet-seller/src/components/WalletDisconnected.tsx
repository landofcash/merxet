import React, { useEffect, useState } from "react";
import { Wallet as WalletIcon, RefreshCcw} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
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
import petraLogo from "@/assets/petra-logo.svg";
import pontemLogo from "@/assets/pontem-logo.svg";
import genericWalletLogo from "@/assets/wallet.svg";
import { getAvailableNetworkIds } from "@/config";

const WalletDisconnected: React.FC = () => {
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportAddr, setExportAddr] = useState<string | null>(null);
  const [exportMnemonic, setExportMnemonic] = useState<string | null>(null);
  const [confirmDeleteAddr, setConfirmDeleteAddr] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) void refreshInternalAddresses();
  }, [open, refreshInternalAddresses]);

  const handleActivate = async (addr: string) => {
    await activateInternalAddress(addr);
    setOpen(false);
  };

  const handleCreate = async () => {
    await connect({ kind: "internal", silent: false });
    await refreshInternalAddresses();
  };

  const handleExport = async (addr: string) => {
    try {
      setBusy(true);
      setExportAddr(addr);
      const acc = await loadInternalWalletByAddress(addr);
      if (!acc) {
        console.error("Internal wallet not found for export");
        return;
      }
      const mnemonic = exportInternalWallet(acc);
      setExportMnemonic(mnemonic);
      setExportOpen(true);
    } catch (e) {
      console.error("Failed to export internal wallet:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (addr: string) => {
    setConfirmDeleteAddr(addr);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteAddr) return;
    try {
      setBusy(true);
      await removeInternalWallet(confirmDeleteAddr);
      await refreshInternalAddresses();

      if (walletKind === "internal" && walletAddress === confirmDeleteAddr) {
        const updated = await loadAllInternalWallets();
        if (updated.length > 0) {
          await activateInternalAddress(updated[0].addr);
        } else {
          await disconnect();
        }
      }
    } catch (e) {
      console.error("Failed to delete internal wallet:", e);
    } finally {
      setConfirmDeleteAddr(null);
      setBusy(false);
    }
  };

  const handleImportSubmit = async (mnemonic: string) => {
    try {
      setBusy(true);
      const acc = await importInternalWallet(mnemonic);
      await refreshInternalAddresses();
      await activateInternalAddress(acc.addr);
      setImportOpen(false);
      setOpen(false);
    } catch (e) {
      console.error("Failed to import internal wallet:", e);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  // Map provider ids to logo assets
  const providerLogos: Record<string, string> = {
    petra: petraLogo,
    pontem: pontemLogo,
  };

  if (walletAddress) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          onClick={() => connect({ kind: "external", chain: "hedera" })}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="px-3 py-1 text-sm bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
        >
          <WalletIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Connect Crypto Wallet</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-60 p-4 text-sm shadow-lg"
      >
        <div className="mb-3">
          <div className="text-xs text-muted-foreground mb-2">Choose a wallet</div>
          <ul className="space-y-2">
            {availableExternalProviders.map((p) => (
              <li key={p.id}>
                <Button
                  onClick={async () => {
                    if (p.installed) {
                      setExternalProviderId(p.id);
                      await connect({ kind: "external", chain: "hedera", providerId: p.id });
                    }
                    setOpen(false);
                  }}
                  className="w-full justify-start text-sm"
                >
                  <img
                    src={providerLogos[p.id] ?? genericWalletLogo}
                    alt=""
                    className="w-4 h-4 mr-2"
                    aria-hidden="true"
                  />
                  {p.name}
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <InternalWalletList
              addresses={internalAddresses}
              activeAddress={walletKind === "internal" ? walletAddress : null}
              isInternalActive={walletKind === "internal"}
              onActivate={handleActivate}
              onCreate={handleCreate}
              onImport={() => setImportOpen(true)}
              onExport={handleExport}
              onDelete={handleDelete}
              compact
            />
          </div>
        </div>
        <div className="items-center justify-between text-xs text-muted-foreground">
          <span>
            You are on <strong className="text-foreground">{network}</strong>.
          </span>
          {getAvailableNetworkIds().filter((n:string) => n !== network).map((n) => (
              <div key={n}>
                <button
                  onClick={() => {
                    switchNetwork(n);
                    setOpen(false);
                  }}
                  className="flex items-center text-blue-500 hover:underline ml-2 text-xs bg-transparent border-none outline-none p-0 cursor-pointer"
                >
                  <RefreshCcw className="w-3 h-3 mr-1" />
                  {`Switch to ${n.toUpperCase()}`}
                </button>
              </div>
            ))}
        </div>
        {/* Modals */}
        <ConfirmModal
          open={!!confirmDeleteAddr}
          title="Delete Internal Wallet"
          message={
            <div>
              Are you sure you want to delete this internal wallet?
              <br />
              <CopyableField value={confirmDeleteAddr ?? ""} length={22} />
            </div>
          }
          confirmLabel={busy ? "Deleting…" : "Delete"}
          confirmVariant="destructive"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteAddr(null)}
        />
        <ExportModal open={exportOpen} address={exportAddr} mnemonic={exportMnemonic} onClose={() => setExportOpen(false)} />
        <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImportSubmit} />
      </PopoverContent>
    </Popover>
  );
};

export default WalletDisconnected;
