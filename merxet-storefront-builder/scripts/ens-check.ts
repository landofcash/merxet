import {randomUUID} from 'node:crypto';
import {Wallet, ZeroAddress} from 'ethers';
import {loadEnsConfig} from '../src/ens/config.ts';
import {EnsRpc, SepoliaEns, resolverInitialization, RpcFailure} from '../src/ens/chain.ts';
import {DEPLOYMENTS as D, registryAbi, resolverAbi, factoryAbi, universalAbi, TEXT_KEYS, id, namehash, dnsEncode} from '../src/ens/contracts.ts';
import {EnsNameSchema} from '../src/domain/records.ts';
import {normalizeLabel} from '../src/ens/labels.ts';

async function main() {
  const config = loadEnsConfig({...process.env, ENS_ENABLED: 'false'}), rpc = new EnsRpc(config.rpcUrl), block = await rpc.block();
  const operator = new Wallet(config.privateKey).address.toLowerCase();
  if (operator !== config.operator) throw Error('Operator address does not match its key');
  const [state] = await rpc.read(D.ethRegistry, registryAbi, 'getState', [id(config.parentName.split('.')[0])], block);
  const [owner] = await rpc.read(D.ethRegistry, registryAbi, 'ownerOf', [state.tokenId], block);
  const [linked] = await rpc.read(D.ethRegistry, registryAbi, 'getSubregistry', [config.parentName.split('.')[0]], block);
  if (state.status !== 2n || owner.toLowerCase() !== config.admin) throw Error('Configured administrator does not own an active parent name');
  const balance = await rpc.request<string>('eth_getBalance', [operator, block]);
  const [parentResult, parentResolver] = await rpc.read(D.universalResolver, universalAbi, 'resolve', [dnsEncode(config.parentName),
    resolverAbi.encodeFunctionData('multicall', [[resolverAbi.encodeFunctionData('text', [namehash(config.parentName), 'url'])]])], block);
  resolverAbi.decodeFunctionResult('multicall', parentResult);
  console.log(JSON.stringify({chainId: 11155111, block: Number(BigInt(block)), parentName: config.parentName, owner: owner.toLowerCase(), operator,
    operatorBalanceWei: BigInt(balance).toString(), expiry: new Date(Number(state.expiry) * 1000).toISOString(), linkedRegistry: linked.toLowerCase(), universalResolverRead: true, parentResolver: parentResolver.toLowerCase()}));
  // eth_call executes the full factory deployment + initialization, then discards all state. No transactions are sent.
  const uuid = randomUUID(), now = new Date().toISOString();
  const value = EnsNameSchema.parse({kind: 'ens-name', schemaVersion: 1, id: uuid, recordVersion: 1, createdAt: now, updatedAt: now,
    chainId: 11155111, parentName: config.parentName, label: 'setup-check', name: `setup-check.${config.parentName}`, registry: config.registry || D.ethRegistry,
    admin: config.admin, operator, signerAddress: operator, network: 'testnet', ownerAccountId: '0.0.1', shopId: uuid,
    catalogSeed: 'AAAAAAAAAAAAAAAAAAAAAA', url: `https://shops.merxet.com/s/${uuid}/`, description: 'Read-only ENS initializer check',
    resolver: null, expiry: null, state: 'requested', transactions: [], errorCode: null, verifiedAt: null});
  await rpc.read(D.factory, factoryAbi, 'deployProxy', [D.resolverImpl, BigInt(id(uuid)), resolverInitialization(value)], block, operator);
  console.log('Resolver factory deployment, initial records and permission handoff simulation passed (eth_call only).');
  if (!config.registry || linked === ZeroAddress) { console.log('Namespace setup is still needed: npm run ens:setup'); return; }
  await new SepoliaEns(config, rpc).ready(); console.log('Namespace links, administrator and registrar-only operator permissions verified.');
  const argument = process.argv.indexOf('--name'); if (argument === -1) return;
  const label = normalizeLabel((process.argv[argument + 1] ?? '').replace(`.${config.parentName}`, '')), name = `${label}.${config.parentName}`, node = namehash(name);
  const calls = TEXT_KEYS.map(key => resolverAbi.encodeFunctionData('text', [node, key]));
  const [result, resolver] = await rpc.read(D.universalResolver, universalAbi, 'resolve', [dnsEncode(name), resolverAbi.encodeFunctionData('multicall', [calls])], block);
  const [results] = resolverAbi.decodeFunctionResult('multicall', result);
  const records = Object.fromEntries(TEXT_KEYS.map((key, i) => [key, String(resolverAbi.decodeFunctionResult('text', results[i])[0])]));
  const [registration] = await rpc.read(config.registry, registryAbi, 'getState', [id(label)], block);
  if (registration.status !== 2n || registration.latestOwner.toLowerCase() !== config.admin || !records.url || !records['com.merxet.shopId']) throw Error('Shop registration or records are incomplete');
  await rpc.read(resolver, resolverAbi, 'setText', [node, 'url', records.url], block, operator);
  let denied = false;
  try { await rpc.read(resolver, resolverAbi, 'setText', [node, 'com.merxet.account', records['com.merxet.account']], block, operator); }
  catch (error) { if (error instanceof RpcFailure && error.reverted) denied = true; else throw error; }
  if (!denied) throw Error('Operator can modify identity records; permissions need review');
  console.log(JSON.stringify({name, resolver, records, allowedUrlUpdate: true, deniedIdentityUpdate: true, method: 'eth_call', transactionsSent: 0}, null, 2));
}
main().catch(() => { console.error('ENS verification failed. Check the namespace, operator configuration and RPC connection. No transaction was sent.'); process.exitCode = 1; });
