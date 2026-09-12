import {loadConfig} from '../src/config.ts';
import {BunnyStorage} from '../src/storage/bunny.ts';
import {Journal} from '../src/storage/journal.ts';
import {MerxetIdentity} from '../src/auth/identity.ts';
import {AuthService} from '../src/auth/service.ts';
import {ShopService} from '../src/domain/shops.ts';
import {EnsService} from '../src/ens/service.ts';
import {SepoliaEns} from '../src/ens/chain.ts';
import {PublicDelivery} from '../src/publishing/delivery.ts';
import type {EnsName} from '../src/domain/records.ts';

// Read-only: no coordinator, worker, registration ticks, or storage writes are started.
async function main() {
  const config = loadConfig(process.env);
  const storage = new BunnyStorage(config.storage);
  const journal = await Journal.open(storage, config.prefix);
  const candidate = journal.list<EnsName>('ens-name', value => value.state === 'active').sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!candidate) throw new Error('No active ENS shop is recorded');
  const identity = new MerxetIdentity(config), auth = new AuthService(journal, identity, config);
  const delivery = new PublicDelivery(storage, config, config.prefix, async () => null);
  const service = new EnsService(auth, new ShopService(auth), new SepoliaEns(config.ens), delivery);
  const result = await service.publicCatalog(candidate.network, candidate.catalogSeed, candidate.ownerAccountId);
  if (!result.name) throw new Error('No verified public name');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => {console.error('Read-only public ENS check failed. Check configuration, provider availability and the registered shop. No writes or transactions were performed.'); process.exitCode = 1;});
