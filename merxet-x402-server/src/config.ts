import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3402),
  NODE_ENV: z.string().default("development"),
  MERXET_SYNC_ORIGIN: z.string().url(),
  MERXET_RESOURCE_ORIGIN: z.string().url(),
  MERXET_CATALOG_ORIGINS: z.string().min(1),
  MERXET_QUOTE_SIGNING_KID: z.string().min(1),
  MERXET_QUOTE_SIGNING_KEY_PKCS8: z.string().min(1),
  MERXET_QUOTE_PUBLIC_KEY: z.string().min(1),
  MERXET_QUOTE_PUBLIC_KEYS: z.string().optional(),
  MERXET_REDIS_URL: z.string().default("memory://"),
  MERXET_CORS_ORIGINS: z.string().default(""),
  MERXET_CATALOG_MAX_BYTES: z.coerce.number().int().positive().default(1_048_576),
  MERXET_RECOVERY_SECONDS: z.coerce.number().int().positive().default(86_400),
  MERXET_SYNC_RETRY_SECONDS: z.coerce.number().int().positive().default(5),
}).passthrough();

export type ServerConfig = {
  port: number;
  syncOrigin: string;
  resourceOrigin: string;
  catalogOrigins: Set<string>;
  signingKid: string;
  signingKeyPkcs8: string;
  quotePublicKey: string;
  quotePublicKeys: Map<string, string>;
  redisUrl: string;
  corsOrigins: Set<string>;
  catalogMaxBytes: number;
  recoverySeconds: number;
  retrySeconds: number;
  now: () => number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const value = schema.parse(env);
  const bareOrigin = (input: string) => {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("Configured origins must use HTTPS");
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Expected bare origin");
    return url.origin;
  };
  const configuredKeyring = value.MERXET_QUOTE_PUBLIC_KEYS
    ? z.record(z.string(), z.string().min(1)).parse(JSON.parse(value.MERXET_QUOTE_PUBLIC_KEYS))
    : {};
  configuredKeyring[value.MERXET_QUOTE_SIGNING_KID] = value.MERXET_QUOTE_PUBLIC_KEY;
  if (value.NODE_ENV === "production" && value.MERXET_REDIS_URL === "memory://") {
    throw new Error("Production x402 deployments require MERXET_REDIS_URL");
  }
  return {
    port: value.PORT,
    syncOrigin: bareOrigin(value.MERXET_SYNC_ORIGIN),
    resourceOrigin: bareOrigin(value.MERXET_RESOURCE_ORIGIN),
    catalogOrigins: new Set(value.MERXET_CATALOG_ORIGINS.split(",").map(origin => bareOrigin(origin.trim()))),
    signingKid: value.MERXET_QUOTE_SIGNING_KID,
    signingKeyPkcs8: value.MERXET_QUOTE_SIGNING_KEY_PKCS8.replace(/\\n/g, "\n"),
    quotePublicKey: value.MERXET_QUOTE_PUBLIC_KEY,
    quotePublicKeys: new Map(Object.entries(configuredKeyring)),
    redisUrl: value.MERXET_REDIS_URL,
    corsOrigins: new Set(value.MERXET_CORS_ORIGINS.split(",").filter(Boolean).map(origin => bareOrigin(origin.trim()))),
    catalogMaxBytes: value.MERXET_CATALOG_MAX_BYTES,
    recoverySeconds: value.MERXET_RECOVERY_SECONDS,
    retrySeconds: value.MERXET_SYNC_RETRY_SECONDS,
    now: () => Math.floor(Date.now() / 1000),
  };
}
