import React from "react";
import {createPortal} from "react-dom";
import {ExternalLink} from "lucide-react";
import {Button} from "@/components/ui/button";
import {faucetAccountUrl} from "@/config";
import type {NetworkId} from "@/context/wallet/types.ts";
import type {InternalWalletIdentity} from "@/lib/internalWallet/types.ts";
import CopyableField from "@/components/CopyableField";

interface InternalWalletBootstrapModalProps {
  open: boolean;
  network: NetworkId;
  faucetUrl?: string;
  title: string | null;
  message: string | null;
  identity: InternalWalletIdentity | null;
  onClose: () => void;
}

const InternalWalletBootstrapModal: React.FC<InternalWalletBootstrapModalProps> = ({
  open,
  network,
  faucetUrl,
  title,
  message,
  identity,
  onClose,
}) => {
  if (!open) {
    return null;
  }

  const faucetTargetUrl = faucetUrl
    ? faucetAccountUrl(faucetUrl, identity?.evmAddress ?? identity?.address ?? identity?.accountId ?? null)
    : null;

  const modal = (
    <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border bg-background p-6 shadow-xl space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{title ?? "Wallet bootstrap"}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          {identity?.accountId ? (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Account ID</div>
              <CopyableField value={identity.accountId} length={24} mdLength={24}/>
            </div>
          ) : null}

          <div>
            <div className="text-xs text-muted-foreground mb-1">Alias / EVM address</div>
            <CopyableField value={identity?.evmAddress ?? ""} length={24} mdLength={24}/>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Network</div>
            <div className="text-sm font-medium uppercase">{network}</div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Fund the alias/EVM address above. After the transfer settles, reopen the wallet panel or refresh the wallet status.
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {network === "testnet" && faucetTargetUrl ? (
            <Button asChild>
              <a href={faucetTargetUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4"/>
                Open faucet
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};

export default InternalWalletBootstrapModal;
