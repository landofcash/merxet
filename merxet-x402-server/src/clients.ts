import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import type { ServerConfig } from "./config.js";

const catalogMetadataSchema = z.object({
  catalogSeed: z.string(),
  catalogUrl: z.string().url(),
  sellerAccountId: z.string(),
  sellerEvmAddress: z.string(),
  sellerPublicKey: z.string(),
  contractId: z.string(),
  contractEvmAddress: z.string(),
  hcsTopicId: z.string(),
}).strict();

export type CatalogMetadata = z.infer<typeof catalogMetadataSchema>;

export class SyncClient {
  constructor(private origin: string, private fetcher: typeof fetch = fetch) {}
  private async get(path: string) {
    const response = await this.fetcher(`${this.origin}${path}`, { signal: AbortSignal.timeout(8_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`sync_${response.status}`);
    const body = await response.json() as { success?: boolean; data?: unknown };
    if (!body.success) throw new Error("sync_invalid_response");
    return body.data;
  }
  async catalog(seed: string) {
    const value = await this.get(`/api/v1/testnet/catalogs/seed/${encodeURIComponent(seed)}`);
    return value ? catalogMetadataSchema.parse(value) : null;
  }
  async order(seed: string) {
    return await this.get(`/api/v1/testnet/orders/${encodeURIComponent(seed)}`);
  }
  async evidence(seed: string) {
    return await this.get(`/api/v1/testnet/orders/${encodeURIComponent(seed)}/x402-evidence`);
  }
}

const productSchema = z.object({
  ProductId: z.string(),
  PriceToken: z.string(),
  Price: z.union([z.string().regex(/^(0|[1-9]\d*)$/), z.number().int().nonnegative()]).transform(String),
  Name: z.string().min(1),
}).passthrough();

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return address === "::1" || address === "::" || address.toLowerCase().startsWith("fc") ||
    address.toLowerCase().startsWith("fd") || address.toLowerCase().startsWith("fe80:");
}

async function assertSafeCatalogUrl(url: URL, allowedOrigins: Set<string>) {
  if (url.protocol !== "https:" || url.username || url.password || !allowedOrigins.has(url.origin)) {
    throw new Error("catalog_url_not_allowed");
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(value => isPrivateIp(value.address))) throw new Error("catalog_private_destination");
}

export async function fetchCatalog(
  input: string,
  config: Pick<ServerConfig, "catalogOrigins" | "catalogMaxBytes">,
  fetcher: typeof fetch = fetch,
) {
  let url = new URL(input);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertSafeCatalogUrl(url, config.catalogOrigins);
    const response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("catalog_unsafe_redirect");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`catalog_${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > config.catalogMaxBytes) throw new Error("catalog_too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > config.catalogMaxBytes) throw new Error("catalog_too_large");
    return z.array(productSchema).min(1).parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  }
  throw new Error("catalog_redirect_limit");
}
