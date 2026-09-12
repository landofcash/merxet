import express, {type NextFunction, type Request, type Response} from 'express';
import {z} from 'zod';
import {isIP} from 'node:net';
import {SelfieFlow, type DemoSession} from './flow.ts';
import {FlowError} from './world.ts';
import {Account, StatusAccount, type Accounts} from './accounts.ts';

const COOKIE = 'merxet_selfie_demo';
export function createApp(flow: SelfieFlow, accounts?: Accounts) {
  flow.accounts = accounts;
  const app = express(), origin = new URL(flow.config.origin);
  const windows = new Map<string, {at: number; count: number}>();
  app.disable('x-powered-by'); app.disable('etag');
  app.use((_req, res, next) => {
    res.set({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=()', 'X-Frame-Options': 'DENY'});
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ok: true, configured: flow.config.public.configured}));
  app.use('/api', (req, _res, next) => {
    if (req.get('Host') !== origin.host) throw new FlowError(403, 'host_not_allowed', 'Open the configured APP_ORIGIN.');
    const publicStatus = req.method === 'GET' && req.path.startsWith('/verifications/');
    const sellerWrite = ['/verification-challenges', '/verification-requests', '/verification-requests/cancel'].includes(req.path);
    const requestOrigin = req.get('Origin') || '';
    if (publicStatus) _res.set('Access-Control-Allow-Origin', '*');
    if (sellerWrite && flow.config.sellerOrigins.has(requestOrigin)) {
      _res.set({'Access-Control-Allow-Origin': requestOrigin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'});
      _res.vary('Origin');
      if (req.method === 'OPTIONS') { _res.sendStatus(204); return; }
    }
    if (!['GET', 'POST'].includes(req.method)) throw new FlowError(405, 'method_not_allowed', 'Unsupported method.');
    if (req.method === 'POST' && ((sellerWrite ? !flow.config.sellerOrigins.has(requestOrigin) : requestOrigin !== flow.config.origin) || !req.is('application/json'))) {
      throw new FlowError(403, 'origin_not_allowed', 'Send requests from the configured demo page.');
    }
    const now = flow.now();
    for (const [key, window] of windows) if (now - window.at >= 60000) windows.delete(key);
    // Railway's public edge supplies X-Real-IP. Local/direct deployments never
    // trust this header; otherwise all hosted users would share the proxy's quota.
    const edgeIp = flow.config.railway ? req.get('X-Real-IP') : undefined;
    const key = edgeIp && isIP(edgeIp) ? edgeIp : req.ip || 'unknown';
    if (!windows.has(key) && windows.size >= 500) throw new FlowError(429, 'rate_limited', 'The demo is busy. Try again in a minute.');
    const window = windows.get(key) || {at: now, count: 0}; window.count++; windows.set(key, window);
    if (window.count > 120) throw new FlowError(429, 'rate_limited', 'Too many requests. Try again in a minute.');
    next();
  });
  app.use('/api', express.json({limit: '64kb', inflate: false, strict: true}));
  const accountService = () => {if (!accounts) throw new FlowError(503, 'not_configured', 'Account verification is not configured.'); return accounts;};
  const cookie = (res: Response, value: string) => res.cookie(COOKIE, value, {httpOnly: true, sameSite: 'strict', secure: origin.protocol === 'https:', maxAge: 3600000, path: '/api'});
  app.get('/api/verifications/:network/:accountId', async (req, res) => {
    res.json(await accountService().status(StatusAccount.parse(req.params)));
  });
  app.post('/api/verification-challenges', async (req, res) => {
    res.json(await accountService().challenge(Account.parse(req.body), req.get('Origin')!));
  });
  app.post('/api/verification-requests', async (req, res) => {
    const data = z.object({challengeId: z.string().uuid(), signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/)}).strict().parse(req.body);
    res.status(201).json(await accountService().start(data.challengeId, data.signature, req.get('Origin')!, flow));
  });
  app.post('/api/handoff', (req, res) => {
    const {token} = z.object({token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(req.body);
    const value = accountService().claim(token);
    cookie(res, value.token);
    res.json({status: flow.status(value.session), context: value.session.request!.context});
  });
  app.post('/api/verification-requests/cancel', (req, res) => {
    const {token} = z.object({token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(req.body);
    accountService().cancel(token, req.get('Origin')!, flow); res.json({canceled: true});
  });
  const token = (req: Request) => req.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  app.post('/api/session', (req, res) => {
    z.object({}).strict().parse(req.body);
    const result = flow.session(token(req), true);
    if (result.token) res.cookie(COOKIE, result.token, {httpOnly: true, sameSite: 'strict', secure: origin.protocol === 'https:', maxAge: 3600000, path: '/api'});
    res.json(flow.status(result.session));
  });
  app.use('/api', (req, res, next) => { res.locals.session = flow.session(token(req)).session; next(); });
  const session = (res: Response) => res.locals.session as DemoSession;
  app.get('/api/session', (_req, res) => res.json(flow.status(session(res))));
  app.post('/api/requests', (req, res) => {
    const {id} = z.object({id: z.string().uuid()}).strict().parse(req.body);
    res.status(201).json(flow.start(session(res), id));
  });
  app.post('/api/requests/:id/verify', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json(await flow.verify(session(res), id, req.body));
  });
  app.post('/api/requests/:id/cancel', (req, res) => {
    z.object({}).strict().parse(req.body);
    res.json(flow.cancel(session(res), z.string().uuid().parse(req.params.id)));
  });
  app.use('/api', () => { throw new FlowError(404, 'not_found', 'API route not found.'); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Never log or echo raw proofs, cookies, provider bodies, or signing material.
    if (error instanceof FlowError) {
      if (error.status === 429) res.set('Retry-After', '60');
      res.status(error.status).json({error: error.code, message: error.message, observation: error.observation});
    } else if (error instanceof z.ZodError || (error as {type?: string})?.type === 'entity.parse.failed') {
      res.status(400).json({error: 'invalid_request', message: 'The request format was invalid.'});
    } else if ((error as {type?: string})?.type === 'entity.too.large') {
      res.status(413).json({error: 'request_too_large', message: 'The proof payload is too large.'});
    } else {
      res.status(500).json({error: 'internal_error', message: 'The demo could not complete this request. Refresh its status before trying again.'});
    }
  });
  return app;
}
