# Merxet Promo

The promo app renders a printable or browsable Merxet catalogue and generates QR codes that open the live checkout app at `https://app.merxet.com`.

## What It Uses

- Catalogue metadata is resolved by seed through the Merxet sync API.
- Product catalogues are fetched from the current `catalogUrl` returned by sync.
- QR payloads follow the same 45-character seed/item/network format used by the main app.
- Token and network handling follow the current Hedera-based storefront conventions.

## AI Agent Discovery

The initial HTML contains the Merxet Sync descriptor URL pattern and resolves
the matching machine-readable catalogue link from the current promo URL:

```text
https://sync.merxet.com/api/v1/t/catalogs/seed/{catalogSeed}
```

The resolver uses the same precedence as the promo application: the first path
segment, then `?seed=`, then the default promo seed. The descriptor is linked
in the document metadata and in a visible **For AI agents** section. Agents
follow its `catalogUrl` to locate the registered catalogue JSON. Mainnet
catalogue discovery is disabled because Merxet Sync does not currently
implement mainnet indexing. The HTML also explains that agent order preparation
requires the `create_merxet_order` MCP tool and that ordinary **Open in app**
links are human storefront links, not signed x402 approvals. Agent-assisted
ordering is an MVP pilot for Hedera testnet testing only. The Merxet quote flow
remains authoritative for order pricing and payment details.

## Local Development

```bash
npm run dev
```

## Supported URL Formats

- `/{seed}`
- `/?seed={seed}`
- `/?seed={seed}&network=testnet`

If no seed is provided, the app opens the default promo catalogue seed `AP10YnWjS0yEFsXPC-mM9A` on `testnet`.
