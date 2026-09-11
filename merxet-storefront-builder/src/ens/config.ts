import {z} from 'zod';
import {Wallet} from 'ethers';

export function loadEnsConfig(env: NodeJS.ProcessEnv) {
  const enabled = z.enum(['true', 'false']).parse(env.ENS_ENABLED ?? 'false') === 'true';
  const config = {
    enabled, chainId: z.coerce.number().pipe(z.literal(11155111)).parse(env.ENS_CHAIN_ID ?? 11155111),
    parentName: env.ENS_PARENT_NAME || 'merxet.eth', rpcUrl: env.ENS_RPC_URL || '',
    admin: (env.ENS_NAMESPACE_ADMIN_ADDRESS || '').toLowerCase(), operator: (env.ENS_OPERATOR_ADDRESS || '').toLowerCase(),
    privateKey: env.ENS_OPERATOR_PRIVATE_KEY || '', registry: (env.ENS_SUBNAME_REGISTRY_ADDRESS || '').toLowerCase(),
    cacheMs: z.coerce.number().int().min(0).max(300).parse(env.ENS_RESOLUTION_CACHE_TTL_SECONDS ?? 30) * 1000,
  };
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.eth$/.test(config.parentName)) throw new Error('ENS parent must be a normalized second-level .eth name');
  if (enabled) {
    for (const address of [config.admin, config.operator, config.registry]) if (!/^0x[a-f0-9]{40}$/.test(address) || /^0x0+$/.test(address)) throw new Error('ENS addresses are incomplete');
    if (config.admin === config.operator) throw new Error('Use separate ENS administrator and operator accounts');
    const url = new URL(config.rpcUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('ENS RPC must use HTTPS');
    try { if (new Wallet(config.privateKey).address.toLowerCase() !== config.operator) throw new Error(); }
    catch { throw new Error('ENS operator key does not match its configured address'); }
  }
  return config;
}
export type EnsConfig = ReturnType<typeof loadEnsConfig>;
