import {ShieldCheck} from 'lucide-react';
import {useWorldVerification, worldLabel, type WorldStatus} from '@/lib/world/verification';

export function WorldStatusBadge({status}: {status: WorldStatus | null}) {
  if (!status?.enabled || !status.verified) return null;
  const label = worldLabel(status);
  return <details className="relative inline-block"><summary className="inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-xs" aria-label={label}>
    <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span>{label}</span>
  </summary><div className="absolute left-0 z-50 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-white p-3 text-sm text-black shadow-lg">
    <p className="font-medium">{label}</p>
    <p>{status.source === 'preset' ? 'Preset demo account. World has not verified this account through this demo.' : status.environment === 'sandbox' ? 'Completed using World Sandbox. This is a test credential.' : 'This seller account completed World Selfie Check.'}</p>
    {status.verifiedAt && <p>Checked {new Date(status.verifiedAt).toLocaleDateString()}</p>}
    <p>This does not verify a business, products or fulfillment.</p>
  </div></details>;
}
export default function WorldVerificationBadge({network, accountId}: {network: string; accountId: string}) {
  const {status} = useWorldVerification(network, accountId);
  return <WorldStatusBadge status={status}/>;
}
