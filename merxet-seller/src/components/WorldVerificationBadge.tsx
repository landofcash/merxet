import worldLogo from '@/assets/worldcoinlogo.svg';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {useWorldVerification, worldLabel, type WorldStatus} from '@/lib/world/verification';

export function WorldStatusBadge({status}: {status: WorldStatus | null}) {
  if (!status?.enabled || !status.verified) return null;
  const label = worldLabel(status);
  return <Popover><PopoverTrigger asChild><button type="button" className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs" aria-label={label}>
    <img src={worldLogo} alt="" aria-hidden="true" className="h-5 w-7 shrink-0 object-contain"/><span>{label}</span>
  </button></PopoverTrigger><PopoverContent className="max-w-[calc(100vw-2rem)] space-y-2 text-sm">
    <p className="font-medium">{label}</p>
    <p>World Selfie Check provides a person-presence signal.</p>
    {status.verifiedAt && <p>Checked {new Date(status.verifiedAt).toLocaleDateString()}</p>}
    <p>This does not verify a business, products or fulfillment.</p>
  </PopoverContent></Popover>;
}
export default function WorldVerificationBadge({network, accountId}: {network: string; accountId: string}) {
  const {status} = useWorldVerification(network, accountId);
  return <WorldStatusBadge status={status}/>;
}
