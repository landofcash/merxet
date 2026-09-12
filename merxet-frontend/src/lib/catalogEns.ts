import {z} from 'zod'
import {STOREFRONT_API_ORIGIN} from '@/config'

const MAX_VERIFICATION_AGE_MS = 10 * 60 * 1000

const NameSchema = z.object({shopId: z.string().uuid(), name: z.string().min(1).max(255), shortUrl: z.string().url(), chainId: z.literal(11155111)})
const ResponseSchema = z.object({success: z.literal(true), data: z.object({
  enabled: z.boolean(), network: z.string(), catalogSeed: z.string(), sellerAccountId: z.string().nullable(),
  name: NameSchema.nullable(), validUntil: z.string().datetime().nullable(),
})})
export type CatalogEnsName = z.infer<typeof NameSchema> & {validUntil: number}
export type CatalogEnsIdentity = {network: string; seed: string; sellerWallet: string}

export function createCatalogEnsClient(origin: string, transport: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, {until: number; value: CatalogEnsName | null}>()
  const pending = new Map<string, Promise<CatalogEnsName | null>>()
  return async (identity: CatalogEnsIdentity): Promise<CatalogEnsName | null> => {
    if (!origin || !identity.network || !identity.seed || !identity.sellerWallet) return null
    const key = JSON.stringify([identity.network, identity.seed, identity.sellerWallet.toLowerCase()])
    const cached = cache.get(key)
    if (cached && cached.until > now()) return cached.value
    if (pending.has(key)) return pending.get(key)!
    if (pending.size >= 32) return null
    const request = (async () => {
      let value: CatalogEnsName | null = null
      const started = now()
      try {
        const response = await transport(`${origin.replace(/\/$/, '')}/api/v1/${encodeURIComponent(identity.network)}/public/catalogs/${encodeURIComponent(identity.seed)}/ens?sellerWallet=${encodeURIComponent(identity.sellerWallet)}`,
          {credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)})
        if (!response.ok) throw new Error('ENS lookup unavailable')
        const data = ResponseSchema.parse(await response.json()).data
        if (data.network !== identity.network || data.catalogSeed !== identity.seed) throw new Error('ENS identity mismatch')
        if (data.enabled && data.name && data.sellerAccountId && data.validUntil) {
          const url = new URL(data.name.shortUrl)
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid shop URL')
          const validUntil = Math.min(Date.parse(data.validUntil), started + MAX_VERIFICATION_AGE_MS)
          if (validUntil > now()) value = {...data.name, validUntil}
        }
      } catch { /* ENS is optional. An outage never preserves an expired name. */ }
      if (cache.size >= 200) cache.delete(cache.keys().next().value!)
      cache.set(key, {until: value?.validUntil ?? now() + 5000, value})
      return value
    })().finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
}

export const lookupCatalogEns = createCatalogEnsClient(STOREFRONT_API_ORIGIN)
