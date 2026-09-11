import {Wallet, keccak256, ZeroAddress} from 'ethers';
import type {Interface} from 'ethers';
import {ApiError} from '../domain/errors.ts';
import type {EnsName, EnsTransaction} from '../domain/records.ts';
import type {EnsConfig} from './config.ts';
import {DEPLOYMENTS as D, factoryAbi, registryAbi, resolverAbi, universalAbi, roles, resolverAdminRoles, registryAdminRoles, nameAdminRoles, TEXT_KEYS, id, namehash, dnsEncode} from './contracts.ts';

export class RpcFailure extends ApiError {
  readonly reverted: boolean;
  constructor(reverted = false) { super(503, reverted ? 'ens_call_reverted' : 'ens_rpc_unavailable'); this.reverted = reverted; }
}
// Deliberately do not pass provider error messages or credential-bearing RPC URLs to logs/API responses.
export class EnsRpc {
  #url: string;
  constructor(url: string) { this.#url = url; }
  async request<T = any>(method: string, params: unknown[] = []): Promise<T> {
    try {
      const response = await fetch(this.#url, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new RpcFailure(); }
      const chunks: Uint8Array[] = []; let size = 0;
      const reader = response.body.getReader();
      try { for (;;) { const {done, value: chunk} = await reader.read(); if (done) break;
        size += chunk.length; if (size > 1024 * 1024) throw new RpcFailure(); chunks.push(chunk); } }
      finally { await reader.cancel(); }
      const value = JSON.parse(Buffer.concat(chunks).toString());
      if (value.error) throw new RpcFailure(value.error.code === 3 || /revert/i.test(value.error.message ?? ''));
      if (!('result' in value)) throw new RpcFailure();
      return value.result as T;
    } catch (error) { if (error instanceof RpcFailure) throw error; throw new RpcFailure(); }
  }
  async read(address: string, abi: Interface, method: string, args: unknown[] = [], block = 'latest', from?: string) {
    const result = await this.request<string>('eth_call', [{to: address, data: abi.encodeFunctionData(method, args), ...(from ? {from} : {})}, block]);
    try { return abi.decodeFunctionResult(method, result); } catch { throw new RpcFailure(); }
  }
  async block() {
    if (BigInt(await this.request<string>('eth_chainId')) !== 11155111n) throw new ApiError(503, 'ens_wrong_chain');
    return this.request<string>('eth_blockNumber');
  }
}
export type ResolvedName = {resolver: string; expiry: number; records: Record<string, string>};
export interface EnsChain {
  ready(): Promise<{expiry: number}>;
  available(label: string): Promise<boolean>;
  prepare(value: EnsName): Promise<{transaction: EnsTransaction; resolver: string; expiry: number}>;
  broadcast(transaction: EnsTransaction): Promise<void>;
  settle(transaction: EnsTransaction): Promise<{state: 'pending' | 'confirmed' | 'reverted' | 'unknown'; blockNumber: number | null}>;
  resolve(value: EnsName): Promise<ResolvedName | null>;
}
export function recordsFor(value: Pick<EnsName, 'url' | 'description' | 'shopId' | 'catalogSeed' | 'ownerAccountId' | 'network'>): Record<string, string> {
  return {url: value.url, description: value.description, 'com.merxet.shopId': value.shopId,
    'com.merxet.catalog': value.catalogSeed, 'com.merxet.account': value.ownerAccountId, 'com.merxet.network': value.network};
}
export function resolverInitialization(value: EnsName) {
  // The factory is a temporary administrator only within this atomic initializer.
  // It writes initial identity, grants the real admin and url-only operator, then loses ALL its roles.
  const setters = TEXT_KEYS.map(key => resolverAbi.encodeFunctionData('setText', [namehash(value.name), key, recordsFor(value)[key]]));
  setters.push(resolverAbi.encodeFunctionData('grantRootRoles', [resolverAdminRoles, value.admin]),
    resolverAbi.encodeFunctionData('authorizeTextRoles', [dnsEncode(value.name), 'url', value.operator, true]),
    resolverAbi.encodeFunctionData('revokeRootRoles', [resolverAdminRoles, D.factory]));
  return resolverAbi.encodeFunctionData('initialize', [D.factory, resolverAdminRoles, setters]);
}
export class SepoliaEns implements EnsChain {
  readonly config: EnsConfig;
  readonly rpc: EnsRpc;
  constructor(config: EnsConfig, rpc = new EnsRpc(config.rpcUrl)) { this.config = config; this.rpc = rpc; }
  async namespace(block: string) {
    const label = this.config.parentName.split('.')[0], rpc = this.rpc;
    const root = await rpc.read(D.rootRegistry, registryAbi, 'getSubregistry', ['eth'], block);
    if (root[0].toLowerCase() !== D.ethRegistry) throw new ApiError(503, 'ens_deployment_changed');
    const [state] = await rpc.read(D.ethRegistry, registryAbi, 'getState', [id(label)], block);
    if (state.status !== 2n) throw new ApiError(404, 'ens_parent_unavailable');
    const [owner, registry] = await Promise.all([
      rpc.read(D.ethRegistry, registryAbi, 'ownerOf', [state.tokenId], block), rpc.read(D.ethRegistry, registryAbi, 'getSubregistry', [label], block),
    ]);
    if (owner[0].toLowerCase() !== this.config.admin || registry[0].toLowerCase() !== this.config.registry) throw new ApiError(404, 'ens_namespace_changed');
    const parent = await rpc.read(this.config.registry, registryAbi, 'getParent', [], block);
    if (parent[0].toLowerCase() !== D.ethRegistry || parent[1] !== label) throw new ApiError(404, 'ens_namespace_changed');
    return {expiry: Number(state.expiry)};
  }
  async ready() {
    const block = await this.rpc.block(), result = await this.namespace(block);
    const [implementation, allowed, operatorRoles, adminRoles] = await Promise.all([
      this.rpc.read(D.factory, factoryAbi, 'verifyContract', [this.config.registry], block),
      this.rpc.read(this.config.registry, registryAbi, 'hasRootRoles', [roles.registrar, this.config.operator], block),
      this.rpc.read(this.config.registry, registryAbi, 'roles', [0, this.config.operator], block),
      this.rpc.read(this.config.registry, registryAbi, 'hasRootRoles', [registryAdminRoles, this.config.admin], block),
    ]);
    if (implementation[0].toLowerCase() !== D.registryImpl || !allowed[0] || operatorRoles[0] !== roles.registrar || !adminRoles[0]) throw new ApiError(503, 'ens_permissions_not_ready');
    return result;
  }
  async available(label: string) {
    const block = await this.rpc.block(); await this.namespace(block);
    const [state] = await this.rpc.read(this.config.registry, registryAbi, 'getState', [id(label)], block);
    return state.status === 0n;
  }
  async prepare(value: EnsName): ReturnType<EnsChain['prepare']> {
    const namespace = await this.ready(), phase = value.transactions.some(tx => tx.phase === 'resolver' && tx.state === 'confirmed') ? 'register' : 'resolver';
    const expiry = value.expiry ?? namespace.expiry;
    if (expiry > namespace.expiry || expiry <= Math.floor(Date.now() / 1000) + 3600) throw new ApiError(409, 'ens_parent_expiring');
    if (!await this.available(value.label)) throw new ApiError(409, 'ens_name_unavailable');
    let to: string, data: string, resolver = value.resolver;
    if (phase === 'resolver') {
      to = D.factory;
      data = factoryAbi.encodeFunctionData('deployProxy', [D.resolverImpl, BigInt(id(`merxet-resolver/${value.registry}/${value.id}`)), resolverInitialization(value)]);
      const result = await this.rpc.request<string>('eth_call', [{from: value.operator, to, data}, 'latest']);
      resolver = String(factoryAbi.decodeFunctionResult('deployProxy', result)[0]).toLowerCase();
    } else {
      if (!resolver) throw new ApiError(409, 'ens_records_mismatch');
      to = value.registry;
      // Name belongs to the namespace admin; the operator gets no token/administrative roles.
      data = registryAbi.encodeFunctionData('register', [value.label, value.admin, ZeroAddress, resolver, nameAdminRoles, expiry]);
    }
    const [latest, pending, block, priority] = await Promise.all([
      this.rpc.request<string>('eth_getTransactionCount', [value.operator, 'latest']), this.rpc.request<string>('eth_getTransactionCount', [value.operator, 'pending']),
      this.rpc.request<{baseFeePerGas: string}>('eth_getBlockByNumber', ['latest', false]), this.rpc.request<string>('eth_maxPriorityFeePerGas'),
    ]);
    if (latest !== pending) throw new ApiError(503, 'ens_operator_busy');
    const tip = BigInt(priority), maxFeePerGas = BigInt(block.baseFeePerGas) * 2n + tip;
    const estimate = BigInt(await this.rpc.request<string>('eth_estimateGas', [{from: value.operator, to, data}])), gasLimit = estimate * 12n / 10n;
    if (gasLimit * maxFeePerGas > 10n ** 16n) throw new ApiError(503, 'ens_fee_limit');
    const nonce = Number(BigInt(pending)), wallet = new Wallet(this.config.privateKey);
    const raw = await wallet.signTransaction({type: 2, chainId: 11155111, nonce, to, data, gasLimit, maxFeePerGas, maxPriorityFeePerGas: tip, value: 0});
    return {transaction: {phase, nonce, raw, hash: keccak256(raw), state: 'prepared' as const, blockNumber: null}, resolver: resolver!, expiry};
  }
  async broadcast(tx: EnsTransaction) {
    const hash = await this.rpc.request<string>('eth_sendRawTransaction', [tx.raw]);
    if (hash.toLowerCase() !== tx.hash) throw new ApiError(503, 'ens_transaction_mismatch');
  }
  async settle(tx: EnsTransaction) {
    const receipt = await this.rpc.request<{blockNumber: string; blockHash: string; status: string} | null>('eth_getTransactionReceipt', [tx.hash]);
    if (receipt) {
      const [head, block] = await Promise.all([this.rpc.request<string>('eth_blockNumber'), this.rpc.request<{hash: string} | null>('eth_getBlockByNumber', [receipt.blockNumber, false])]);
      if (!block || block.hash !== receipt.blockHash || BigInt(head) < BigInt(receipt.blockNumber) + 1n) return {state: 'pending' as const, blockNumber: null};
      return {state: receipt.status === '0x1' ? 'confirmed' as const : 'reverted' as const, blockNumber: Number(BigInt(receipt.blockNumber))};
    }
    const latest = await this.rpc.request<string>('eth_getTransactionCount', [this.config.operator, 'latest']);
    return {state: BigInt(latest) > BigInt(tx.nonce) ? 'unknown' as const : 'pending' as const, blockNumber: null};
  }
  async resolve(value: EnsName) {
    const block = await this.rpc.block(); await this.namespace(block);
    const [state] = await this.rpc.read(value.registry, registryAbi, 'getState', [id(value.label)], block);
    if (state.status !== 2n) return null;
    const [owner] = await this.rpc.read(value.registry, registryAbi, 'ownerOf', [state.tokenId], block);
    if (owner.toLowerCase() !== value.admin) return null;
    const node = namehash(value.name);
    const calls = TEXT_KEYS.map(key => resolverAbi.encodeFunctionData('text', [node, key]));
    const [result, address] = await this.rpc.read(D.universalResolver, universalAbi, 'resolve', [dnsEncode(value.name), resolverAbi.encodeFunctionData('multicall', [calls])], block);
    if (address.toLowerCase() !== value.resolver) return null;
    const [results] = resolverAbi.decodeFunctionResult('multicall', result);
    return {resolver: address.toLowerCase(), expiry: Number(state.expiry), records: Object.fromEntries(TEXT_KEYS.map((key, i) => [key, String(resolverAbi.decodeFunctionResult('text', results[i])[0])]))};
  }
}
