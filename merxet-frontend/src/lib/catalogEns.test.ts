import {describe, expect, it, vi} from 'vitest'
import {createCatalogEnsClient} from './catalogEns'

const identity = {network: 'testnet', seed: 'A'.repeat(22), sellerWallet: `0x${'ab'.repeat(20)}`}
const name = {shopId: '11111111-1111-4111-8111-111111111111', name: 'coffee.merxet.eth', shortUrl: 'https://shops.merxet.com/coffee', chainId: 11155111}
const body = (until: number) => ({success: true, data: {enabled: true, network: identity.network, catalogSeed: identity.seed,
  sellerAccountId: '0.0.123', name, validUntil: new Date(until).toISOString()}})

describe('optional catalog ENS lookup', () => {
  it('makes no requests when configuration is missing', async () => {
    const fetcher = vi.fn()
    expect(await createCatalogEnsClient('', fetcher)(identity)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('deduplicates identities, omits credentials and caches only until verification expires', async () => {
    let now = 100000
    const fetcher = vi.fn(async () => Response.json(body(110000)))
    const lookup = createCatalogEnsClient('https://builder.example', fetcher, () => now)
    const results = await Promise.all([lookup(identity), lookup({...identity, sellerWallet: identity.sellerWallet.toUpperCase()})])
    expect(results[0]?.name).toBe(name.name)
    expect(results[1]).toEqual(results[0])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/public/catalogs/'), expect.objectContaining({credentials: 'omit', cache: 'no-store', redirect: 'error'}))
    now = 110001
    fetcher.mockImplementation(async () => {throw new Error('outage')})
    expect(await lookup(identity)).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('limits a verification result to ten minutes', async () => {
    const now = 100000
    const result = await createCatalogEnsClient('https://builder.example', async () => Response.json(body(now + 3600000)), () => now)(identity)
    expect(result?.validUntil).toBe(now + 10 * 60 * 1000)
  })
  it.each(['wrong network', 'wrong catalog', 'expired', 'unsafe URL', 'missing owner', 'disabled', 'unnamed'])('falls back on %s', async reason => {
    const data = body(110000).data
    if (reason === 'wrong network') data.network = 'mainnet'
    if (reason === 'wrong catalog') data.catalogSeed = 'B'.repeat(22)
    if (reason === 'expired') data.validUntil = new Date(90000).toISOString()
    if (reason === 'unsafe URL') data.name = {...name, shortUrl: 'javascript:alert(1)'}
    if (reason === 'disabled') data.enabled = false
    const response = {...data, ...(reason === 'missing owner' ? {sellerAccountId: null} : {}), ...(reason === 'unnamed' ? {name: null, validUntil: null} : {})}
    expect(await createCatalogEnsClient('https://builder.example', async () => Response.json({success: true, data: response}), () => 100000)(identity)).toBeNull()
  })
  it('keeps simultaneous catalogs isolated even when replies arrive out of order', async () => {
    let finish!: (value: Response) => void
    const fetcher = vi.fn((url: RequestInfo | URL) => String(url).includes('BBBB')
      ? Promise.resolve(Response.json({...body(110000), data: {...body(110000).data, catalogSeed: 'B'.repeat(22), name: {...name, name: 'second.merxet.eth'}}}))
      : new Promise<Response>(resolve => {finish = resolve}))
    const lookup = createCatalogEnsClient('https://builder.example', fetcher, () => 100000)
    const first = lookup(identity)
    expect((await lookup({...identity, seed: 'B'.repeat(22)}))?.name).toBe('second.merxet.eth')
    finish(Response.json(body(110000)))
    expect((await first)?.name).toBe(name.name)
  })
})
