// src/components/CoverPage.tsx
import {Card, CardContent} from "@/components/ui/card";
import { getCurrentConfig } from "@/config";

interface CoverPageProps {
  shopWallet?: string;
}

export default function CoverPage({ shopWallet }: CoverPageProps) {
  const config = getCurrentConfig();
  const isApprovedWallet = shopWallet && config.approvedShopWallets.includes(shopWallet);
  console.log("shopWallet", shopWallet);
  console.log("config.approvedShopWallets", config.approvedShopWallets);
  return (
    <Card className="h-full flex items-center justify-center bg-gradient-to-br from-white to-neutral-200 text-neutral-900 shadow-2xl border-neutral-100">
      <CardContent className="w-full h-full flex flex-col items-center justify-center text-center px-12 space-y-6">
        <img src="/logo-t-g-128x128.png" alt="Aptoosh logo" className="w-20 h-20 mb-2"/>
        <h1 className="text-5xl font-bold tracking-tight drop-shadow-sm mb-3 text-slate-900">Aptoosh</h1>
        <p className="text-base sm:text-2xl max-w-md text-fuchsia-700 font-medium">
          Scan. Shop. Pay in a flash.
        </p>
        <p className="text-sm text-slate-700 max-w-md">
          This catalogue was created to demonstrate how Aptoosh works. Just scan with your phone and step into the future of shopping.</p>
        <div className="mt-10 text-sm text-slate-600">
          Flip to explore our demo product collection →
        </div>
        <p className="block sm:hidden text-center text-xs text-red-700 mb-2">
          ⚠️ This catalogue is best viewed on a desktop or in print.
        </p>

        {/* Conditional message based on wallet approval status */}
        {isApprovedWallet ? (
          <div className="mt-10 text-xs text-slate-600">
            (Credit Cards are in demo mode and will not be charged, All crypto orders will be refunded.)
          </div>
        ) : (
          <div className="text-left mt-10 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 max-w-md">
            ⚠️ <strong>Warning:</strong> This is an unverified catalogue. This seller wallet is not under Aptoosh control.
            Transactions may be processed for real. Proceed with caution.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
