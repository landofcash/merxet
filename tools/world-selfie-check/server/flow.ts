import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {signRequest} from '@worldcoin/idkit-core/signing';
import type {Config} from './config.ts';
import {FlowError, validateProof, WorldVerifier} from './world.ts';
import type {RequestContext, RequestStatus, SessionStatus, Verification} from '../shared/contracts.ts';
import type {Accounts, BoundAccount} from './accounts.ts';

type ActiveRequest = {
  context: RequestContext; state: RequestStatus['state']; observation: RequestStatus['observation'];
  fingerprint?: string; pending?: Promise<SessionStatus>;
};
export interface DemoSession {id: string; expiresAt: number; request: ActiveRequest | null; verification: Verification | null; account?: BoundAccount;}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export class SelfieFlow {
  config: Config;
  verifier: Pick<WorldVerifier, 'verify'>;
  now: () => number;
  sessions = new Map<string, DemoSession>();
  accounts?: Accounts;
  constructor(config: Config, verifier: Pick<WorldVerifier, 'verify'> = new WorldVerifier(config), now = Date.now) {
    this.config = config; this.verifier = verifier; this.now = now;
  }
  session(token: string | undefined, create = false): {session: DemoSession; token?: string} {
    for (const [key, value] of this.sessions) if (value.expiresAt <= this.now()) this.sessions.delete(key);
    const existing = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? this.sessions.get(digest(token)) : undefined;
    if (existing) return {session: existing};
    if (!create) throw new FlowError(401, 'session_expired', 'This demo session expired or the server restarted. Reload to start again.');
    if (this.sessions.size >= 200) throw new FlowError(429, 'session_limit', 'The demo is busy. Try again later.');
    const next = randomBytes(32).toString('base64url');
    const session: DemoSession = {id: randomUUID(), expiresAt: this.now() + 3600000, request: null, verification: null};
    this.sessions.set(digest(next), session); return {session, token: next};
  }
  status(session: DemoSession): SessionStatus {
    const request = session.request;
    if (request && ['waiting', 'verifying'].includes(request.state) && Date.parse(request.context.expiresAt) <= this.now()) request.state = 'expired';
    return {account: session.account && {network: session.account.network, accountId: session.account.accountId},
      expiresAt: new Date(session.expiresAt).toISOString(), config: {...this.config.public, enabled: this.config.enabled}, verification: session.verification,
      request: request ? {id: request.context.id, state: request.state, expiresAt: request.context.expiresAt, observation: request.observation} : null};
  }
  start(session: DemoSession, id: string): RequestContext {
    if (!this.config.enabled) throw new FlowError(503, 'world_disabled', 'Selfie Check is currently disabled.');
    if (!this.config.public.configured) throw new FlowError(503, 'not_configured', 'Configure the World app credentials in .env.local, then restart the server.');
    const state = this.status(session).request?.state;
    if (session.request?.context.id === id) {
      if (state === 'waiting' || state === 'verifying') return session.request.context;
      throw new FlowError(409, 'request_finished', 'This request has finished. Start a fresh check.');
    }
    if (state === 'verifying') throw new FlowError(409, 'verification_in_progress', 'A proof is being checked. Wait for its result.');
    let signed: ReturnType<typeof signRequest>;
    try { signed = signRequest({signingKeyHex: this.config.signingKey, action: this.config.action, ttl: this.config.requestTtl}); }
    catch { throw new FlowError(503, 'signing_failed', 'The RP signing key could not sign a request. Check the server configuration.'); }
    const context: RequestContext = {
      id, appId: this.config.appId, action: this.config.action, environment: this.config.environment,
      signal: `merxet-selfie:${digest(JSON.stringify(session.account ?? {}))}:${session.id}:${id}:${randomBytes(16).toString('hex')}`,
      rpContext: {rp_id: this.config.rpId, nonce: signed.nonce, signature: signed.sig, created_at: signed.createdAt, expires_at: signed.expiresAt},
      expiresAt: new Date(signed.expiresAt * 1000).toISOString(),
    };
    session.request = {context, state: 'waiting', observation: null}; return context;
  }
  request(session: DemoSession, id: string) {
    this.status(session);
    if (session.request?.context.id !== id) throw new FlowError(404, 'request_not_found', 'This request does not belong to the active browser session.');
    return session.request;
  }
  cancel(session: DemoSession, id: string) {
    const request = this.request(session, id);
    if (['waiting', 'verifying'].includes(request.state)) request.state = 'canceled';
    return this.status(session);
  }
  async verify(session: DemoSession, id: string, input: unknown): Promise<SessionStatus> {
    if (!this.config.enabled) throw new FlowError(503, 'world_disabled', 'Selfie Check is currently disabled.');
    const request = this.request(session, id);
    const proof = validateProof(input, request.context), fingerprint = digest(canonical(proof));
    if (request.fingerprint && request.fingerprint !== fingerprint) throw new FlowError(409, 'proof_changed', 'A different proof was already submitted for this request.');
    if (request.state === 'verified') return this.status(session);
    if (request.state === 'verifying' && request.pending) return request.pending;
    if (request.state !== 'waiting') throw new FlowError(409, 'request_finished', `This request is ${request.state}. Start a fresh check.`);
    request.fingerprint = fingerprint; request.state = 'verifying';
    request.pending = (async () => {
      try {
        const observation = await this.verifier.verify(proof, request.context);
        const save = session.account ? await this.accounts!.prepareSave(session.account, id, request.context.environment, proof.responses[0].nullifier) : undefined;
        this.status(session);
        if (!this.config.enabled || session.request !== request || request.state !== 'verifying' || session.expiresAt <= this.now()) {
          throw new FlowError(409, 'request_finished', 'The request expired or was canceled before verification completed.');
        }
        save?.();
        request.state = 'verified'; request.observation = observation;
        session.verification = {requestId: id, completedAt: new Date(this.now()).toISOString(),
          environment: request.context.environment, credential: 'face', protocolVersion: '3.0'};
        return this.status(session);
      } catch (error) {
        if (request.state === 'verifying') {
          request.state = error instanceof FlowError && error.status < 500 ? 'rejected' : 'unavailable';
          request.observation = error instanceof FlowError ? error.observation : null;
        }
        throw error;
      } finally { request.pending = undefined; }
    })();
    return request.pending;
  }
}
