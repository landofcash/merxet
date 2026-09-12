import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {computeAddress, verifyMessage} from 'ethers';
import {z} from 'zod';
import type {Config} from './config.ts';
import type {SelfieFlow, DemoSession} from './flow.ts';
import {boundedJson, FlowError} from './world.ts';
import type {AccountVerification, Environment} from '../shared/contracts.ts';

export const Account = z.object({network: z.enum(['testnet', 'mainnet']), accountId: z.string().regex(/^0\.0\.[1-9][0-9]{0,18}$/)}).strict();
export const StatusAccount = Account.extend({accountId: z.union([Account.shape.accountId, z.string().regex(/^0x[a-fA-F0-9]{40}$/)])});
export type AccountRef = z.infer<typeof Account>;
export type BoundAccount = AccountRef & {signer: string};
type Record = BoundAccount & {environment: Environment; verifiedAt: string; expiresAt: string; requestId: string; nullifier: string};
const key = (a: AccountRef) => `${a.network}:${a.accountId}`;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const invalid = () => new FlowError(401, 'invalid_challenge', 'The wallet challenge expired, was used, or did not match. Start again.');

export class AccountStore {
  db: DatabaseSync;
  presets: Set<string>;
  constructor(path: string, presets: unknown = JSON.parse(readFileSync(new URL('../data/preset-accounts.json', import.meta.url), 'utf8'))) {
    this.presets = new Set(z.array(Account).max(1000).parse(presets).map(key));
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS verifications (
        network TEXT NOT NULL, accountId TEXT NOT NULL, signer TEXT NOT NULL,
        environment TEXT NOT NULL, verifiedAt TEXT NOT NULL, expiresAt TEXT NOT NULL,
        requestId TEXT NOT NULL UNIQUE, nullifier TEXT NOT NULL,
        PRIMARY KEY(network, accountId)
      ) STRICT;`);
  }
  get(a: AccountRef): Record | undefined {
    return this.db.prepare('SELECT * FROM verifications WHERE network=? AND accountId=?').get(a.network, a.accountId) as Record | undefined;
  }
  save(record: Record) {
    this.db.prepare(`INSERT INTO verifications VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(network,accountId) DO UPDATE SET signer=excluded.signer, environment=excluded.environment,
      verifiedAt=excluded.verifiedAt, expiresAt=excluded.expiresAt, requestId=excluded.requestId, nullifier=excluded.nullifier
      WHERE verifications.requestId != excluded.requestId AND verifications.verifiedAt <= excluded.verifiedAt`)
      .run(record.network, record.accountId, record.signer, record.environment, record.verifiedAt, record.expiresAt, record.requestId, record.nullifier);
  }
  close() {this.db.close();}
}

async function mirrorAccount(a: AccountRef): Promise<unknown> {
  const host = a.network === 'testnet' ? 'testnet.mirrornode.hedera.com' : 'mainnet-public.mirrornode.hedera.com';
  let body: unknown;
  try {
    const response = await fetch(`https://${host}/api/v1/accounts/${a.accountId}?transactions=false`, {signal: AbortSignal.timeout(8000), redirect: 'error'});
    if (!response.ok) throw new Error();
    body = await boundedJson(response);
  } catch {throw new FlowError(503, 'identity_unavailable', 'Could not confirm the current wallet identity. Try again.');}
  return body;
}
export async function resolveAccount(a: AccountRef): Promise<AccountRef> {
  const result = z.object({account: Account.shape.accountId, deleted: z.literal(false), evm_address: z.string().nullable()}).safeParse(await mirrorAccount(a));
  if (!result.success) throw new FlowError(503, 'identity_unavailable', 'Could not resolve the seller account.');
  const address = a.accountId.toLowerCase(), numericAddress = '0x' + BigInt(result.data.account.slice(4)).toString(16).padStart(40, '0');
  if (result.data.evm_address?.toLowerCase() !== address && numericAddress !== address) throw new FlowError(503, 'identity_unavailable', 'The seller address did not match the account.');
  return {...a, accountId: result.data.account};
}
export async function currentSigner(a: AccountRef): Promise<string> {
  const result = z.object({account: z.literal(a.accountId), deleted: z.literal(false),
    key: z.object({_type: z.literal('ECDSA_SECP256K1'), key: z.string().regex(/^(?:02|03)[a-fA-F0-9]{64}$|^04[a-fA-F0-9]{128}$/)})}).safeParse(await mirrorAccount(a));
  if (!result.success) throw new FlowError(422, 'unsupported_wallet', 'Selfie Check currently supports active Hedera accounts with a single ECDSA key.');
  return computeAddress(`0x${result.data.key.key}`).toLowerCase();
}

type Challenge = BoundAccount & {challengeId: string; origin: string; message: string; expiresAt: string};
export class Accounts {
  config: Config;
  store: AccountStore;
  signer: typeof currentSigner;
  resolve = resolveAccount;
  now: () => number;
  challenges = new Map<string, Challenge>();
  handoffs = new Map<string, {token: string; session: DemoSession; expiresAt: string; origin: string; claimed?: boolean}>();
  constructor(config: Config, store: AccountStore, signer = currentSigner, now = Date.now) {
    this.config = config; this.store = store; this.signer = signer; this.now = now;
  }
  enabled() {
    if (!this.config.enabled) throw new FlowError(503, 'world_disabled', 'Selfie Check is currently disabled.');
  }
  cleanup() {
    for (const map of [this.challenges, this.handoffs]) for (const [id, value] of map) if (Date.parse(value.expiresAt) <= this.now()) map.delete(id);
  }
  async status(a: AccountRef): Promise<AccountVerification> {
    const result: AccountVerification = {...a, enabled: this.config.enabled, verified: false, source: null, environment: null, verifiedAt: null, expiresAt: null};
    if (!this.config.enabled) return result;
    if (a.accountId.startsWith('0x')) {
      const canonical = Account.parse(await this.resolve(a));
      if (canonical.network !== a.network) throw new FlowError(503, 'identity_unavailable', 'The seller network did not match.');
      return {...await this.status(canonical), accountId: a.accountId};
    }
    if (this.store.presets.has(key(a))) return {...result, verified: true, source: 'preset'};
    const stored = this.store.get(a);
    if (!stored || Date.parse(stored.expiresAt) <= this.now() || stored.environment !== this.config.environment) return result;
    const signer = await this.signer(a).catch(() => null);
    if (!this.config.enabled) return {...result, enabled: false};
    if (signer !== stored.signer || Date.parse(stored.expiresAt) <= this.now()) return result;
    return {...result, verified: true, source: 'world', environment: stored.environment, verifiedAt: stored.verifiedAt, expiresAt: stored.expiresAt};
  }
  async challenge(a: AccountRef, origin: string) {
    this.enabled(); this.cleanup();
    if (!this.config.sellerOrigins.has(origin)) throw new FlowError(403, 'origin_not_allowed', 'Open the configured seller app.');
    if (this.challenges.size >= 200) throw new FlowError(429, 'busy', 'Try again in a minute.');
    const signer = await this.signer(a); this.enabled();
    const challengeId = randomUUID(), expiresAt = new Date(this.now() + 300000).toISOString();
    const message = `Merxet World verification\nSign to link a Selfie Check to this account. This does not authorize a transaction.\nOrigin: ${origin}\nAccount: ${a.accountId}\nNetwork: ${a.network}\nChallenge: ${challengeId}\nExpires At: ${expiresAt}`;
    this.challenges.set(challengeId, {...a, signer, challengeId, origin, message, expiresAt});
    return {...a, challengeId, origin, message, expiresAt};
  }
  async start(challengeId: string, signature: string, origin: string, flow: SelfieFlow) {
    this.enabled(); this.cleanup();
    const c = this.challenges.get(challengeId);
    if (!c || c.origin !== origin) throw invalid();
    let signer: string;
    try {signer = verifyMessage(c.message, signature).toLowerCase();} catch {throw invalid();}
    if (signer !== c.signer) throw invalid();
    const current = await this.signer(c); this.enabled();
    if (current !== c.signer || this.challenges.get(challengeId) !== c || Date.parse(c.expiresAt) <= this.now()) throw invalid();
    this.challenges.delete(challengeId);
    const {session, token} = flow.session(undefined, true);
    session.account = {network: c.network, accountId: c.accountId, signer};
    const context = flow.start(session, randomUUID()), handoff = randomBytes(32).toString('base64url');
    this.handoffs.set(digest(handoff), {session, token: token!, expiresAt: context.expiresAt, origin});
    return {requestId: context.id, expiresAt: context.expiresAt, handoffUrl: `${this.config.origin}/#handoff=${handoff}`};
  }
  claim(token: string) {
    this.enabled(); this.cleanup();
    const hash = digest(token), value = this.handoffs.get(hash);
    if (!value || value.claimed || value.session.request?.state !== 'waiting') throw new FlowError(401, 'handoff_expired', 'This handoff expired or was already opened. Return to the seller app and start again.');
    value.claimed = true; return value;
  }
  cancel(token: string, origin: string, flow: SelfieFlow) {
    this.cleanup();
    const value = this.handoffs.get(digest(token));
    if (!value || value.origin !== origin) throw invalid();
    flow.cancel(value.session, value.session.request!.context.id);
    this.handoffs.delete(digest(token));
  }
  async prepareSave(a: BoundAccount, requestId: string, environment: Environment, nullifier: string) {
    this.enabled();
    if (await this.signer(a) !== a.signer) throw invalid();
    return () => {
      this.enabled();
      const verifiedAt = new Date(this.now()).toISOString(), expiresAt = new Date(this.now() + 30 * 86400000).toISOString();
      this.store.save({...a, requestId, environment, nullifier: BigInt(nullifier).toString(), verifiedAt, expiresAt});
    };
  }
}
