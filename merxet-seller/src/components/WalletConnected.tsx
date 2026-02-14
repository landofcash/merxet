import React, {useCallback, useEffect, useMemo, useState} from "react";
import { LogOut, X, ExternalLink, HandCoins } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import CopyableField from "@/components/CopyableField";
import { formatCoinAmount, requestDevnetFaucet, getAccountCoinAmount } from "@/lib/crypto/cryptoUtils";
import { getCurrentConfig, explorerAccountUrl } from "@/config";
import walletSvg from "@/assets/wallet.svg";
import TokenIcon from "@/components/TokenIcon";

const WalletConnected: React.FC = () => {
  const { walletAddress, disconnect, network } = useWallet();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loadingBal, setLoadingBal] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);

  const aptToken = useMemo(() => {
    const cfg = getCurrentConfig();
    return (cfg.supportedTokens && cfg.supportedTokens.length > 0) ? cfg.supportedTokens[0] : undefined;
  }, [network]);

  const aptBalanceFormatted = useMemo(() => {
    if (balance == null || !aptToken) return null as string | null;
    return formatCoinAmount(balance, aptToken.decimals ?? 8);
  }, [balance, aptToken]);

  // Helper to refresh raw balance only; formatted is derived
  const refreshBalance = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!walletAddress || !aptToken) {
      setBalance(null);
      return;
    }
    try {
      setLoadingBal(true);
      const amount = await getAccountCoinAmount(walletAddress, aptToken.tokenId);
      if (signal?.cancelled) return;
      const raw = typeof amount === "bigint" ? amount : BigInt(amount);
      setBalance(raw);
    } catch (e) {
      if (!signal?.cancelled) {
        setBalance(null);
      }
      console.error("Failed to fetch balance", e);
    } finally {
      if (!signal?.cancelled) setLoadingBal(false);
    }
  }, [walletAddress, aptToken]);

  useEffect(() => {
    const state = { cancelled: false };
    void refreshBalance(state);
    return () => {
      state.cancelled = true;
    };
  }, [walletAddress, network, aptToken, refreshBalance]);

  const handleFaucet = async () => {
    const cfg = getCurrentConfig();
    if (!walletAddress) return;
    try {
      if (network === "testnet") {
        const url = cfg.hedera.faucetUrl;
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      if (network === "devnet") {
        setFaucetLoading(true);
        const amount = 100_000_000; // 1 APT in octas
        await requestDevnetFaucet(walletAddress, amount);
        // Refresh balance after a short delay
        setTimeout(() => {
          void refreshBalance();
        }, 800);
      }
    } catch (e) {
      console.error("Faucet action failed", e);
      alert("Failed to request faucet. Please try again.");
    } finally {
      setFaucetLoading(false);
    }
  };

  if (!walletAddress) return null;

  const showFaucet =
    (network === "testnet" || network === "devnet") &&
    !!aptToken &&
    balance !== null &&
    (balance < (3n * (10n ** BigInt(aptToken!.decimals ?? 8))));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label="Wallet Menu"
          className="flex items-center gap-2 pr-2 pl-1 py-1 text-sm sm:pl-2 sm:gap-3 cursor-pointer rounded-full border border-primary/30 bg-background hover:bg-accent/40"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 border border-primary/20">
            {/* prefer custom wallet svg for a branded touch */}
            <img src={walletSvg} alt="Wallet" className="w-3.5 h-3.5" />
          </span>
          <span className="hidden sm:flex items-center gap-2">
            <span className="font-mono">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
          </span>
          {/* On mobile, show only balance or address short */}
          <span className="sm:hidden font-medium">
            {loadingBal ? "…" : aptBalanceFormatted != null ? `${aptBalanceFormatted} ${aptToken?.name ?? ''}` : `${walletAddress.slice(0, 4)}...${walletAddress.slice(-3)}`}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-screen sm:w-72 sm:rounded-xl sm:border sm:shadow-lg sm:mt-1 m-0 p-6 space-y-4 text-sm"
      >
        {/* Mobile close button */}
        <div className="flex justify-end sm:hidden -mt-2 -mr-2">
          <button onClick={() => setOpen(false)} aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Wallet Info */}
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">Connected Wallet</p>
          <div className="rounded-lg border bg-accent/30 p-3 flex items-start gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 border border-primary/20 shrink-0">
              <img src={walletSvg} alt="Wallet" className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mt-1">
                <CopyableField value={walletAddress} length={22} mdLength={22} />
              </div>
              <div className="mt-1">
                <a
                  href={explorerAccountUrl(walletAddress, network)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  View on Explorer
                </a>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <span>{aptToken?.name ?? "Token"} Balance</span>
            </span>
            <span className="font-semibold text-sm">
              {loadingBal && (<span>Loading…</span>)}

              {aptToken && aptBalanceFormatted && !loadingBal && (
                <span>
                  <TokenIcon assetId={aptToken.tokenId} className="w-4 h-4 ml-1 mr-2 " alt={aptToken.name}/>
                  {aptBalanceFormatted} {aptToken?.name ?? ''}
                </span>
              )}
            </span>
          </div>
        </div>
        {/* Actions */}
        <div className="space-y-2">
          {showFaucet && (
            <Button
              onClick={handleFaucet}
              disabled={faucetLoading}
              className="w-full justify-start text-sm bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              {faucetLoading ? (
                <HandCoins className="w-4 h-4 mr-2 animate-spin" />
              ) : network === "testnet" ? (
                <ExternalLink className="w-4 h-4 mr-2" />
              ) : (
                <HandCoins className="w-4 h-4 mr-2" />
              )}
              {network === "testnet" ? "Open Faucet" : "Request 1 APT from Faucet"}
            </Button>
          )}
          <Button
            onClick={disconnect}
            className="w-full justify-start text-sm bg-red-500 hover:bg-red-600 text-white cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
          <div className="text-muted-foreground text-xs text-right">[{network}]</div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default WalletConnected;
