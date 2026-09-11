import fs from 'node:fs/promises';
import {loadConfig} from '../src/config.ts';
import {MerxetIdentity} from '../src/auth/identity.ts';
import {CatalogIdSchema} from '../src/domain/public-storefront.ts';
import {AccountId} from '../src/domain/records.ts';
async function main() {
  const accountId = AccountId.parse(process.argv[2]), catalogSeed = CatalogIdSchema.parse(process.argv[3]);
  const identity = new MerxetIdentity(loadConfig());
  const account = await identity.account('testnet', accountId);
  await identity.assertCatalogOwner('testnet', catalogSeed, accountId);
  const result = {checkedAt: new Date().toISOString(), network: 'testnet', accountId: account.accountId, catalogSeed,
    currentEcdsaAccountKey: true, catalogOwnership: true, scope: 'Live read-only identity lookup; no wallet signature or session created'};
  await fs.mkdir(new URL('../artifacts/', import.meta.url), {recursive: true});
  await fs.writeFile(new URL('../artifacts/identity-smoke.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error?.code || 'Identity smoke failed'); process.exitCode = 1; });
