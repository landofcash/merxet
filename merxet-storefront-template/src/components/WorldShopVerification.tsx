import {useCatalog} from '@/lib/catalog/useCatalog';
import {useShop} from '@/lib/shop/context';
import WorldVerificationBadge from './WorldVerificationBadge';
import {worldConfig} from '@/config';

export default function WorldShopVerification() {
  const {data} = useCatalog();
  const {config} = useShop();
  if (!worldConfig.enabled || !data) return null;
  return <div className="px-4" data-world-verification><WorldVerificationBadge network={config.network} accountId={data.metadata.shopWallet}/></div>;
}
