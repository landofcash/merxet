import {ZeroAddress} from 'ethers';
import {EnsRpc} from './chain.ts';
import type {EnsConfig} from './config.ts';
import {DEPLOYMENTS as D, registryAbi, factoryAbi, registryAdminRoles, roles, id} from './contracts.ts';

export type SetupStep = {id: string; title: string; complete: boolean; transaction: {from: string; to: string; data: string; value: string; chainId: string}};
export async function setupPlan(config: EnsConfig, rememberedRegistry?: string) {
  const rpc = new EnsRpc(config.rpcUrl), label = config.parentName.split('.')[0], block = await rpc.block();
  if (![config.admin, config.operator].every(value => /^0x[a-f0-9]{40}$/.test(value) && value !== ZeroAddress) || config.admin === config.operator) throw new Error('Configure distinct ENS admin and operator addresses');
  const [root] = await rpc.read(D.rootRegistry, registryAbi, 'getSubregistry', ['eth'], block);
  if (root.toLowerCase() !== D.ethRegistry) throw new Error('ENS deployment changed');
  const [state] = await rpc.read(D.ethRegistry, registryAbi, 'getState', [id(label)], block);
  if (state.status !== 2n) throw new Error('ENS parent is not registered');
  const [owner] = await rpc.read(D.ethRegistry, registryAbi, 'ownerOf', [state.tokenId], block);
  if (owner.toLowerCase() !== config.admin) throw new Error('Configured admin does not own the parent');
  const [linked] = await rpc.read(D.ethRegistry, registryAbi, 'getSubregistry', [label], block);
  const deployData = factoryAbi.encodeFunctionData('deployProxy', [D.registryImpl, BigInt(id(`merxet-namespace-v1/${config.parentName}`)),
    registryAbi.encodeFunctionData('initialize', [config.admin, registryAdminRoles])]);
  let registry = config.registry || rememberedRegistry || (linked !== ZeroAddress ? linked.toLowerCase() : '');
  if (!registry) {
    const result = await rpc.request<string>('eth_call', [{from: config.admin, to: D.factory, data: deployData}, block]);
    registry = String(factoryAbi.decodeFunctionResult('deployProxy', result)[0]).toLowerCase();
  }
  if (!/^0x[a-f0-9]{40}$/.test(registry)) throw new Error('Invalid registry address');
  if (linked !== ZeroAddress && linked.toLowerCase() !== registry) throw new Error('Parent already points to a different registry; review it manually');
  const deployed = await rpc.request<string>('eth_getCode', [registry, block]) !== '0x';
  if (!deployed) {
    const prediction = await rpc.read(D.factory, factoryAbi, 'deployProxy', [D.registryImpl, BigInt(id(`merxet-namespace-v1/${config.parentName}`)),
      registryAbi.encodeFunctionData('initialize', [config.admin, registryAdminRoles])], block, config.admin);
    if (prediction[0].toLowerCase() !== registry) throw new Error('Configured undeployed registry differs from the factory prediction');
  }
  let hasParent = false, delegated = false;
  if (deployed) {
    const [implementation] = await rpc.read(D.factory, factoryAbi, 'verifyContract', [registry], block);
    const [admin] = await rpc.read(registry, registryAbi, 'hasRootRoles', [registryAdminRoles, config.admin], block);
    if (implementation.toLowerCase() !== D.registryImpl || !admin) throw new Error('Registry implementation or admin roles do not match');
    const parent = await rpc.read(registry, registryAbi, 'getParent', [], block);
    if (parent[0] !== ZeroAddress && (parent[0].toLowerCase() !== D.ethRegistry || parent[1] !== label)) throw new Error('Registry has a different parent');
    hasParent = parent[0].toLowerCase() === D.ethRegistry && parent[1] === label;
    const [operatorRoles] = await rpc.read(registry, registryAbi, 'roles', [0, config.operator], block);
    if (operatorRoles !== 0n && operatorRoles !== roles.registrar) throw new Error('Operator has broader registry permissions; review before continuing');
    delegated = operatorRoles === roles.registrar;
  }
  const step = (id: string, title: string, complete: boolean, to: string, data: string): SetupStep => ({id, title, complete,
    transaction: {from: config.admin, to, data, value: '0x0', chainId: '0xaa36a7'}});
  return {chainId: 11155111, admin: config.admin, operator: config.operator, parentName: config.parentName, registry,
    expiry: new Date(Number(state.expiry) * 1000).toISOString(),
    steps: [
      step('deploy', 'Deploy the standard ENSv2 registry, owned by the administrator', deployed, D.factory, deployData),
      step('parent', `Set the registry parent to ${config.parentName}`, hasParent, registry, registryAbi.encodeFunctionData('setParent', [D.ethRegistry, label])),
      step('operator', 'Grant the backend permission to register subnames only', delegated, registry, registryAbi.encodeFunctionData('grantRootRoles', [roles.registrar, config.operator])),
      step('link', `Link ${config.parentName} to this registry`, linked.toLowerCase() === registry, D.ethRegistry, registryAbi.encodeFunctionData('setSubregistry', [id(label), registry])),
    ],
    variables: {ENS_SUBNAME_REGISTRY_ADDRESS: registry, ENS_ENABLED: 'true'},
  };
}
