import {computeAddress} from 'ethers';
import {z} from 'zod';
import type {Config, Network} from '../config.ts';
import {AccountId, Address} from '../domain/records.ts';
import {ApiError} from '../domain/errors.ts';

export interface AccountIdentity {accountId: string; signerAddress: string;}
export interface IdentityProvider {
  catalogOwner(network: Network, catalogSeed: string): Promise<{accountId: string; evmAddress: string}>;
  account(network: Network, accountId: string): Promise<AccountIdentity>;
  assertCatalogOwner(network: Network, catalogSeed: string, ownerAccountId: string): Promise<void>;
}
export class MerxetIdentity implements IdentityProvider {
  #config: Config;
  #fetch: typeof fetch;
  constructor(config: Config, transport: typeof fetch = fetch) { this.#config = config; this.#fetch = transport; }
  async #json(url: string): Promise<unknown> {
    let response: Response;
    try { response = await this.#fetch(url, {redirect: 'error', signal: AbortSignal.timeout(10000), headers: {Accept: 'application/json'}}); }
    catch { throw new ApiError(503, 'identity_provider_unavailable'); }
    if (!response.ok) { await response.body?.cancel(); throw new ApiError(response.status === 404 ? 404 : 503, response.status === 404 ? 'identity_not_found' : 'identity_provider_unavailable'); }
    const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > 128 * 1024) throw new Error('Identity response too large'); chunks.push(value); }
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch { throw new ApiError(503, 'identity_provider_invalid_response'); }
    finally { await reader.cancel(); }
  }
  async account(network: Network, accountId: string): Promise<AccountIdentity> {
    AccountId.parse(accountId);
    const body = await this.#json(`${this.#config.mirrorOrigins[network]}/api/v1/accounts/${accountId}?transactions=false`);
    const parsed = z.object({account: AccountId, deleted: z.boolean(), key: z.object({_type: z.literal('ECDSA_SECP256K1'), key: z.string().regex(/^(?:02|03)[a-fA-F0-9]{64}$|^04[a-fA-F0-9]{128}$/)})}).safeParse(body);
    // Check the current account key, never merely its original EVM alias. Key lists,
    // contract keys and ED25519 wallets are outside the operational internal-wallet flow.
    if (!parsed.success || parsed.data.deleted || parsed.data.account !== accountId) throw new ApiError(403, 'unsupported_or_inactive_account');
    try { return {accountId, signerAddress: Address.parse(computeAddress(`0x${parsed.data.key.key}`).toLowerCase())}; }
    catch { throw new ApiError(503, 'identity_provider_invalid_key'); }
  }
  async assertCatalogOwner(network: Network, catalogSeed: string, ownerAccountId: string) {
    const body = await this.#json(`${this.#config.syncOrigin}/api/v1/${network}/catalogs/seed/${encodeURIComponent(catalogSeed)}`);
    const parsed = z.object({success: z.literal(true), data: z.object({catalogSeed: z.string(), sellerAccountId: AccountId})}).safeParse(body);
    if (!parsed.success || parsed.data.data.catalogSeed !== catalogSeed) throw new ApiError(503, 'catalog_identity_invalid');
    if (parsed.data.data.sellerAccountId !== ownerAccountId) throw new ApiError(403, 'catalog_not_owned');
  }
  async catalogOwner(network: Network, catalogSeed: string) {
    const body = await this.#json(`${this.#config.syncOrigin}/api/v1/${network}/catalogs/seed/${encodeURIComponent(catalogSeed)}`);
    const parsed = z.object({success: z.literal(true), data: z.object({catalogSeed: z.string(), sellerAccountId: AccountId,
      sellerEvmAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)})}).safeParse(body);
    if (!parsed.success || parsed.data.data.catalogSeed !== catalogSeed) throw new ApiError(503, 'catalog_identity_invalid');
    return {accountId: parsed.data.data.sellerAccountId, evmAddress: parsed.data.data.sellerEvmAddress.toLowerCase()};
  }
}
