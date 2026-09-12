import {z} from 'zod';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import type {Environment, PublicConfig} from '../shared/contracts.ts';

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const railway = Boolean(env.RAILWAY_ENVIRONMENT_ID);
  const databasePath = env.WORLD_DB_PATH || 'data/verifications.sqlite';
  if (railway) {
    const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
    const within = mount && relative(resolve(mount), resolve(databasePath));
    if (!within || within === '..' || within.startsWith('..' + sep) || isAbsolute(within)) {
      throw new Error('Railway requires WORLD_DB_PATH inside its mounted persistent volume.');
    }
  }
  const enabled = z.enum(['true', 'false']).parse(env.WORLD_ENABLED ?? 'false') === 'true';
  const sellerOrigins = new Set((env.WORLD_SELLER_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://merxet.com').split(',').map(value => {
    const url = new URL(value);
    if (url.origin !== value || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Invalid seller origin');
    return value;
  }));
  const environment: Environment = z.enum(['sandbox', 'production']).parse(env.WORLD_ENVIRONMENT || 'sandbox');
  const port = z.coerce.number().int().min(1024).max(65535).parse(env.PORT || 4310);
  const origin = env.APP_ORIGIN || `http://localhost:${port}`;
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('APP_ORIGIN must be an exact HTTPS origin, or HTTP localhost origin, without a trailing slash.');
  }
  const missing = ['WORLD_APP_ID', 'WORLD_RP_ID', 'WORLD_RP_SIGNING_KEY'].filter(name => !env[name]?.trim());
  const appId = env.WORLD_APP_ID?.trim() || '';
  const rpId = env.WORLD_RP_ID?.trim() || '';
  const signingKey = env.WORLD_RP_SIGNING_KEY?.trim() || '';
  if (appId && !/^app_[a-zA-Z0-9]{1,100}$/.test(appId)) throw new Error('WORLD_APP_ID must start with app_.');
  if (rpId && !/^rp_[a-zA-Z0-9]{1,100}$/.test(rpId)) throw new Error('WORLD_RP_ID must start with rp_.');
  if (signingKey && !/^(?:0x)?[a-fA-F0-9]{64}$/.test(signingKey)) throw new Error('WORLD_RP_SIGNING_KEY must be a 32-byte hex key.');
  const action = z.string().trim().min(1).max(100).parse(env.WORLD_ACTION ?? 'selfie-check-demo');
  return {
    enabled, sellerOrigins, databasePath, railway,
    port, origin, host: env.HOST || '127.0.0.1', appId: appId as `app_${string}`, rpId, signingKey, action, environment,
    requestTtl: z.coerce.number().int().min(60).max(600).parse(env.WORLD_REQUEST_TTL_SECONDS || 300),
    providerTimeout: z.coerce.number().int().min(1000).max(30000).parse(env.WORLD_PROVIDER_TIMEOUT_MS || 15000),
    public: {enabled, configured: missing.length === 0, missing, environment} satisfies PublicConfig,
  };
}
export type Config = ReturnType<typeof loadConfig>;
