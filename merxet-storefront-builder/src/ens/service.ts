import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AuthService} from '../auth/service.ts';
import type {ShopService} from '../domain/shops.ts';
import {EnsNameSchema, type EnsName, type Session, type Shop} from '../domain/records.ts';
import {ApiError} from '../domain/errors.ts';
import {receipt} from '../storage/journal.ts';
import type {PublicDelivery} from '../publishing/delivery.ts';
import {recordsFor, type EnsChain, type ResolvedName} from './chain.ts';
import {normalizeLabel, aliasSuffix} from './labels.ts';

export const EnsNameResponseSchema = EnsNameSchema.omit({transactions: true, signerAddress: true}).extend({
  transactions: z.array(z.object({hash: z.string(), phase: z.enum(['resolver', 'register']), state: z.enum(['prepared', 'confirmed', 'reverted'])})),
});
export const EnsStatusSchema = z.object({enabled: z.boolean(), parentName: z.string(), chainId: z.literal(11155111), name: EnsNameResponseSchema.nullable(), shortUrl: z.string().nullable()});
export const EnsAvailabilitySchema = z.object({label: z.string(), name: z.string(), available: z.boolean()});
export const nameResponse = (value: EnsName) => {
  const {signerAddress: _signer, transactions, ...rest} = value;
  return EnsNameResponseSchema.parse({...rest, transactions: transactions.map(({hash, phase, state}) => ({hash, phase, state}))});
};
export class EnsService {
  readonly auth: AuthService;
  readonly shops: ShopService;
  readonly chain: EnsChain;
  readonly delivery: PublicDelivery;
  #timer?: ReturnType<typeof setTimeout>;
  #running?: Promise<void>;
  #stopping = false;
  #cache = new Map<string, {until: number; value: ResolvedName | null}>();
  constructor(auth: AuthService, shops: ShopService, chain: EnsChain, delivery: PublicDelivery) {
    this.auth = auth; this.shops = shops; this.chain = chain; this.delivery = delivery;
  }
  #list() { return this.auth.journal.list<EnsName>('ens-name', () => true); }
  #configured(value: EnsName) {
    const c = this.auth.config.ens;
    return value.chainId === c.chainId && value.parentName === c.parentName && value.registry === c.registry && value.admin === c.admin && value.operator === c.operator;
  }
  status(session: Session, shopId: string) {
    this.shops.get(session, shopId);
    const value = this.#list().find(item => item.network === session.network && item.ownerAccountId === session.ownerAccountId && item.shopId === shopId && item.state !== 'abandoned');
    return EnsStatusSchema.parse({enabled: true, chainId: 11155111, parentName: this.auth.config.ens.parentName, name: value ? nameResponse(value) : null,
      shortUrl: value?.state === 'active' && this.#configured(value) ? `${this.auth.config.publicOrigin}/${value.label}` : null});
  }
  async availability(session: Session, shopId: string, input: string) {
    this.shops.get(session, shopId);
    const label = normalizeLabel(input), c = this.auth.config.ens;
    const reserved = this.#list().some(item => item.parentName === c.parentName && item.label === label && item.state !== 'abandoned');
    return {label, name: `${label}.${c.parentName}`, available: !reserved && await this.chain.available(label)};
  }
  async submit(session: Session, shopId: string, requestId: string, input: {label: string}) {
    const label = normalizeLabel(input.label), auth = this.auth;
    return auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, `ens-claim/${shopId}`, {label}), async () => {
      const shop = this.shops.get(session, shopId), c = auth.config.ens;
      if (!shop.publishedRevisionId) throw new ApiError(409, 'ens_publish_first');
      const previous = this.#list().find(item => item.shopId === shopId && item.network === shop.network && item.state !== 'abandoned');
      if (previous && (previous.state !== 'failed' || previous.label === label || previous.transactions.some(tx => tx.state === 'prepared' || (tx.phase === 'register' && tx.state === 'confirmed')))) throw new ApiError(409, 'ens_shop_already_named');
      if (this.#list().some(item => item.parentName === c.parentName && item.label === label && item.state !== 'abandoned')) throw new ApiError(409, 'ens_name_unavailable');
      if (this.#list().filter(item => !['active', 'failed', 'abandoned'].includes(item.state)).length >= 20) throw new ApiError(429, 'ens_queue_full');
      await auth.identity.assertCatalogOwner(shop.network, shop.catalogSeed, shop.ownerAccountId);
      const identity = await auth.identity.account(shop.network, shop.ownerAccountId);
      if (identity.signerAddress !== session.signerAddress) throw new ApiError(401, 'account_key_changed');
      // Reserve locally under the journal's single writer. On-chain availability is checked again before registration.
      const time = new Date(auth.now()).toISOString();
      const value = EnsNameSchema.parse({schemaVersion: 1, kind: 'ens-name', id: randomUUID(), recordVersion: 1, createdAt: time, updatedAt: time,
        network: shop.network, ownerAccountId: shop.ownerAccountId, shopId, chainId: 11155111, parentName: c.parentName, label, name: `${label}.${c.parentName}`,
        registry: c.registry, admin: c.admin, operator: c.operator, signerAddress: session.signerAddress, catalogSeed: shop.catalogSeed,
        url: this.delivery.url(shopId), description: shop.config.branding.description.slice(0, 1000), resolver: null, expiry: null,
        state: 'requested', transactions: [], errorCode: null, verifiedAt: null});
      return {changes: [value, ...(previous ? [{...previous, state: 'abandoned' as const, recordVersion: previous.recordVersion + 1, updatedAt: time}] : [])], result: {status: 202, data: nameResponse(value)}};
    }, () => { this.shops.get(session, shopId); });
  }
  async retry(session: Session, shopId: string, requestId: string) {
    return this.auth.journal.transact(receipt(`${session.network}/${session.ownerAccountId}`, requestId, `ens-retry/${shopId}`, {}), async () => {
      this.shops.get(session, shopId);
      const value = this.#list().find(item => item.shopId === shopId && item.network === session.network && item.state !== 'abandoned');
      if (!value || value.state !== 'failed' || value.transactions.some(tx => tx.state === 'prepared') || value.transactions.length >= 8) throw new ApiError(409, 'ens_retry_unavailable');
      await this.auth.identity.assertCatalogOwner(session.network, value.catalogSeed, session.ownerAccountId);
      const identity = await this.auth.identity.account(session.network, session.ownerAccountId);
      if (identity.signerAddress !== session.signerAddress) throw new ApiError(401, 'account_key_changed');
      const next = {...value, signerAddress: session.signerAddress, recordVersion: value.recordVersion + 1, updatedAt: new Date(this.auth.now()).toISOString(), state: 'requested' as const, errorCode: null};
      return {changes: [next], result: {status: 202, data: nameResponse(next)}};
    }, () => { this.shops.get(session, shopId); });
  }
  async #save(value: EnsName, change: Partial<EnsName>) {
    await this.auth.journal.transact(null, async () => {
      const current = this.auth.journal.get<EnsName>('ens-name', value.network, value.ownerAccountId, value.id)!;
      if (current.recordVersion !== value.recordVersion) throw new ApiError(409, 'record_version_conflict');
      const next = EnsNameSchema.parse({...value, ...change, recordVersion: value.recordVersion + 1, updatedAt: new Date(this.auth.now()).toISOString()});
      return {changes: [next], result: {status: 200, data: {}}};
    });
  }
  async #process() {
    // One operator nonce stream, including uncertainty/reconciliation, across every seller and shop.
    const value = this.#list().find(item => !['active', 'failed', 'abandoned'].includes(item.state));
    if (!value) return;
    try {
      if (!this.#configured(value)) throw new ApiError(503, 'ens_configuration_changed');
      const pending = value.transactions.find(tx => tx.state === 'prepared');
      if (pending) {
        const status = await this.chain.settle(pending);
        if (status.state === 'unknown') {
          if (value.state !== 'reconciliation') await this.#save(value, {state: 'reconciliation', errorCode: 'ens_nonce_reconciliation'});
          return;
        }
        if (status.state === 'pending') {
          // Only ever rebroadcast the exact, already journaled signed bytes. No new nonce/replacement.
          try { await this.chain.broadcast(pending); } catch { /* Response may be lost or transaction already known. Receipt is authoritative. */ }
          return;
        }
        const transactions = value.transactions.map(tx => tx.hash === pending.hash ? {...tx, state: status.state as 'confirmed' | 'reverted', blockNumber: status.blockNumber} : tx);
        await this.#save(value, {transactions, state: status.state === 'reverted' ? 'failed' : pending.phase === 'resolver' ? 'registering' : 'confirming', errorCode: status.state === 'reverted' ? 'ens_transaction_reverted' : null});
        return;
      }
      if (value.transactions.some(tx => tx.phase === 'register' && tx.state === 'confirmed')) {
        const resolved = await this.chain.resolve(value);
        if (!resolved || !this.#matches(value, resolved)) throw new ApiError(409, 'ens_records_mismatch');
        await this.#save(value, {state: 'active', verifiedAt: new Date(this.auth.now()).toISOString(), errorCode: null});
        this.#cache.delete(value.name); return;
      }
      const shop = this.auth.journal.get<Shop>('shop', value.network, value.ownerAccountId, value.shopId);
      if (!shop?.publishedRevisionId || shop.catalogSeed !== value.catalogSeed) throw new ApiError(409, 'ens_publish_first');
      await this.auth.identity.assertCatalogOwner(value.network, value.catalogSeed, value.ownerAccountId);
      const identity = await this.auth.identity.account(value.network, value.ownerAccountId);
      if (identity.signerAddress !== value.signerAddress) throw new ApiError(409, 'account_key_changed');
      if (value.transactions.length >= 8) throw new ApiError(409, 'ens_retry_unavailable');
      const prepared = await this.chain.prepare(value);
      // This commit MUST succeed before the first network broadcast. A lost storage acknowledgement halts the journal.
      await this.#save(value, {transactions: [...value.transactions, prepared.transaction], resolver: prepared.resolver, expiry: prepared.expiry,
        state: prepared.transaction.phase === 'resolver' ? 'configuring' : 'registering', errorCode: null});
      try { await this.chain.broadcast(prepared.transaction); } catch { /* Reconcile by the persisted hash on the next tick. */ }
    } catch (error) {
      if (!this.auth.journal.healthy) return;
      const code = error instanceof ApiError ? error.code : 'ens_rpc_unavailable';
      const current = this.auth.journal.get<EnsName>('ens-name', value.network, value.ownerAccountId, value.id);
      if (!current || current.recordVersion !== value.recordVersion) return;
      const state = error instanceof ApiError && error.status < 500 ? 'failed' : value.state;
      if (value.errorCode !== code || value.state !== state) await this.#save(value, {errorCode: code, state});
    }
  }
  tick() {
    if (!this.#running) this.#running = this.#process().finally(() => { this.#running = undefined; });
    return this.#running;
  }
  start() {
    this.#stopping = false;
    const run = async () => { try { await this.tick(); } catch { /* Journal readiness reports storage faults. */ }
      finally { if (!this.#stopping) { this.#timer = setTimeout(() => void run(), 5000); this.#timer.unref(); } } };
    void run();
  }
  async stop() { this.#stopping = true; clearTimeout(this.#timer); await this.#running; }
  #matches(value: EnsName, resolved: ResolvedName) {
    const expected = recordsFor(value);
    return resolved.resolver === value.resolver && resolved.expiry > Math.floor(this.auth.now() / 1000) &&
      Object.entries(expected).filter(([key]) => key !== 'description').every(([key, item]) => resolved.records[key] === item);
  }
  async redirect(labelInput: string, file: string) {
    let label: string;
    try { label = normalizeLabel(labelInput); } catch { throw new ApiError(404, 'shop_not_found'); }
    if (label !== labelInput) throw new ApiError(404, 'shop_not_found');
    const suffix = aliasSuffix(file), value = this.#list().find(item => item.label === label && item.state === 'active' && this.#configured(item));
    if (!value) throw new ApiError(404, 'shop_not_found');
    const shop = this.auth.journal.get<Shop>('shop', value.network, value.ownerAccountId, value.shopId);
    if (!shop?.publishedRevisionId || shop.catalogSeed !== value.catalogSeed || value.url !== this.delivery.url(shop.id)) throw new ApiError(404, 'shop_not_found');
    const cached = this.#cache.get(value.name);
    const resolved = cached && cached.until > this.auth.now() ? cached.value : await this.chain.resolve(value);
    if (!cached || cached.until <= this.auth.now()) {
      if (this.#cache.size >= 500) this.#cache.delete(this.#cache.keys().next().value!);
      this.#cache.set(value.name, {until: this.auth.now() + this.auth.config.ens.cacheMs, value: resolved});
    }
    if (!resolved || !this.#matches(value, resolved)) throw new ApiError(404, 'shop_not_found');
    if (await this.delivery.selection(shop.id) !== shop.publishedRevisionId) throw new ApiError(503, 'public_selection_mismatch');
    // The ENS URL has been checked for exact equality. Construct locally, never redirect arbitrary record content.
    return `/s/${shop.id}/${suffix}`;
  }
}
