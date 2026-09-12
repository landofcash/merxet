import {BookOpen, Info} from 'lucide-react'
import CopyableField from '@/components/CopyableField'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {useCatalogEns} from '@/lib/useCatalogEns'
import WorldVerificationBadge from '@/components/WorldVerificationBadge'

export default function CatalogIdentity({seed, network, sellerWallet}: {seed: string; network: string; sellerWallet: string}) {
  const ens = useCatalogEns(network, seed, sellerWallet)
  return <div className="flex flex-wrap items-center gap-2 min-w-0 font-semibold" aria-label="Catalog">
    <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-label="Catalog"/>
    {ens ? <>
      <a href={ens.shortUrl} target="_blank" rel="noopener noreferrer" title={`Visit ${ens.name}`}
        className="max-w-[15rem] truncate text-sm hover:underline">{ens.name}</a>
      <Popover>
        <PopoverTrigger asChild><button type="button" aria-label="Shop name and catalog details" className="shrink-0 text-muted-foreground"><Info className="h-4 w-4"/></button></PopoverTrigger>
        <PopoverContent className="max-w-[calc(100vw-2rem)] space-y-2 text-sm">
          <p className="break-all font-medium">{ens.name}</p>
          <p className="text-xs text-muted-foreground">ENS &middot; Ethereum Sepolia</p>
          <CopyableField label="Catalog ID" value={seed}/>
          <a href={ens.shortUrl} target="_blank" rel="noopener noreferrer" className="underline">Visit shop</a>
        </PopoverContent>
      </Popover>
    </> : <CopyableField value={seed} length={20} mdLength={17}/>}
    <WorldVerificationBadge network={network} accountId={sellerWallet}/>
  </div>
}
