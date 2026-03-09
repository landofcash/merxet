import React, {useEffect, useMemo, useState} from "react";
import {X, HandCoins, ShieldAlert, Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useWallet} from "@/context/WalletContext";
import petraLogo from "@/assets/petra-logo.svg";
import pontemLogo from "@/assets/pontem-logo.svg";
import genericWalletLogo from "@/assets/wallet.svg";
import ConfirmModal from "@/components/wallet/ConfirmModal";
import InternalWalletCreateModal from "@/components/wallet/InternalWalletCreateModal";
import InternalWalletImportModal from "@/components/wallet/InternalWalletImportModal";
import InternalWalletSuccessModal from "@/components/wallet/InternalWalletSuccessModal";
import type {InternalWalletStatus} from "@/lib/internalWallet/types.ts";
import {getConfig} from "@/config";

interface TryTestnetModalProps {
  open: boolean;
  onClose: () => void;
}

const TryTestnetModal: React.FC<TryTestnetModalProps> = ({open, onClose}) => {
  const {
    network,
    switchNetwork,
    availableExternalProviders,
    setExternalProviderId,
    connect,
    internalWallets,
    refreshInternalWallets,
    connectInternalWallet,
    createInternalWallet,
    importInternalWallet,
    removeInternalWallet,
  } = useWallet();

  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdWallet, setCreatedWallet] = useState<InternalWalletStatus | null>(null);

  useEffect(() => {
    if (open) {
      void refreshInternalWallets();
    }
  }, [open, refreshInternalWallets]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const providerLogos = useMemo<Record<string, string>>(() => ({
    petra: petraLogo,
    pontem: pontemLogo,
  }), []);

  if (!open) {
    return null;
  }

  const deletingWallet = confirmDeleteWalletId
    ? internalWallets.find(wallet => wallet.id === confirmDeleteWalletId) ?? null
    : null;

  const handleCreate = async (input: { label?: string; passphrase: string }) => {
    try {
      setBusy(true);
      setFormError(null);
      if (network !== "testnet") {
        await switchNetwork("testnet");
      }
      const created = await createInternalWallet(input);
      setCreateOpen(false);
      setCreatedWallet(created);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create wallet.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (input: { label?: string; passphrase: string; mnemonic?: string; privateKey?: string }) => {
    try {
      setBusy(true);
      setFormError(null);
      if (network !== "testnet") {
        await switchNetwork("testnet");
      }
      await importInternalWallet(input);
      setImportOpen(false);
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to import wallet.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveWallet = async () => {
    if (!confirmDeleteWalletId) {
      return;
    }

    try {
      setBusy(true);
      await removeInternalWallet(confirmDeleteWalletId);
    } finally {
      setBusy(false);
      setConfirmDeleteWalletId(null);
    }
  };

  const faucetUrl = getConfig("testnet").hedera.faucetUrl;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          className="relative w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative h-28 bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 px-6 py-5 text-white">
            <button onClick={onClose} className="absolute right-4 top-4 text-white/90 hover:text-white" aria-label="Close">
              <X className="h-6 w-6"/>
            </button>
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold">Try Merxet on Hedera Testnet</h3>
              <p className="max-w-2xl text-sm text-emerald-50/90">
                Create an encrypted internal wallet in-browser or connect an external wallet. Fund it on Hedera testnet, then start testing marketplace transactions.
              </p>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Network</div>
                <div className="text-sm font-medium">{network.toUpperCase()}</div>
              </div>
              {network !== "testnet" ? (
                <Button onClick={() => void switchNetwork("testnet")}>Switch to testnet</Button>
              ) : (
                <Button asChild variant="outline">
                  <a href={faucetUrl} target="_blank" rel="noreferrer">
                    <HandCoins className="mr-2 h-4 w-4"/>
                    Open faucet
                  </a>
                </Button>
              )}
            </div>

            {availableExternalProviders.length > 0 ? (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">External wallets</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableExternalProviders.map((provider) => (
                    <Button
                      key={provider.id}
                      variant="outline"
                      className="justify-start"
                      onClick={async () => {
                        setExternalProviderId(provider.id);
                        await connect({kind: "external", chain: "hedera", providerId: provider.id});
                        onClose();
                      }}
                    >
                      <img
                        src={providerLogos[provider.id] ?? genericWalletLogo}
                        alt=""
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      {provider.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Internal wallet</div>
                  <div className="text-sm text-muted-foreground">
                    Saved wallets stay local to this browser and are encrypted with your passphrase.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setFormError(null);
                    setCreateOpen(true);
                  }}>
                    Create
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setFormError(null);
                    setImportOpen(true);
                  }}>
                    Import
                  </Button>
                </div>
              </div>

              {internalWallets.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No internal wallets saved locally yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {internalWallets.map((wallet) => (
                    <div key={wallet.id} className="rounded-xl border p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{wallet.label}</div>
                          <div className="font-mono text-xs text-muted-foreground break-all">
                            {wallet.identity.accountId ?? wallet.identity.evmAddress}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {wallet.requiresPassphraseUpgrade ? <ShieldAlert className="h-3.5 w-3.5 text-amber-600"/> : null}
                          {wallet.lifecycleState === "ready" ? "Ready" : wallet.lifecycleState === "funded_or_alias_created" ? "Needs HBAR" : "Local only"}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" onClick={async () => {
                          await connectInternalWallet(wallet.id);
                          onClose();
                        }}>
                          Connect
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteWalletId(wallet.id)}>
                          <Trash2 className="h-4 w-4"/>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <InternalWalletCreateModal
        open={createOpen}
        busy={busy}
        error={formError}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <InternalWalletImportModal
        open={importOpen}
        busy={busy}
        error={formError}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
      <InternalWalletSuccessModal
        open={createdWallet != null}
        walletLabel={createdWallet?.label ?? null}
        identity={createdWallet?.identity ?? null}
        onClose={() => {
          setCreatedWallet(null);
          onClose();
        }}
      />
      <ConfirmModal
        open={confirmDeleteWalletId != null}
        title="Remove local wallet"
        message={(
          <div className="space-y-3">
            <p>This removes only local browser access. It does not delete the Hedera account or any funds.</p>
            {deletingWallet ? (
              <div className="rounded-lg border px-3 py-2 font-mono text-xs break-all">
                {deletingWallet.label}
                <br/>
                {deletingWallet.identity.accountId ?? deletingWallet.identity.evmAddress}
              </div>
            ) : null}
          </div>
        )}
        confirmLabel={busy ? "Removing..." : "Remove wallet"}
        confirmVariant="destructive"
        onConfirm={handleRemoveWallet}
        onCancel={() => setConfirmDeleteWalletId(null)}
      />
    </>
  );
};

export default TryTestnetModal;
