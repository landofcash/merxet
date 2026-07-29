# Merxet Promo

The promo app renders a printable or browsable Merxet catalogue and generates QR codes that open the live checkout app at `https://app.merxet.com`.

## What It Uses

- Catalogue metadata is resolved by seed through the Merxet sync API.
- Product catalogues are fetched from the current `catalogUrl` returned by sync.
- QR payloads follow the same 45-character seed/item/network format used by the main app.
- Token and network handling follow the current Hedera-based storefront conventions.

## AI Agent Discovery

The initial HTML for the default promo catalogue links directly to its
machine-readable Merxet Sync descriptor:

```text
https://sync.merxet.com/api/v1/testnet/catalogs/seed/AP10YnWjS0yEFsXPC-mM9A
```

The descriptor is linked in the document metadata and in a visible
**For AI agents** section. Agents follow its `catalogUrl` to locate the
registered catalogue JSON. The HTML also explains that agent order preparation
requires the `create_merxet_order` MCP tool and that ordinary **Open in app**
links are human storefront links, not signed x402 approvals. The Merxet quote
flow remains authoritative for order pricing and payment details.

## Local Development

```bash
npm run dev
```

## Supported URL Formats

- `/{seed}`
- `/?seed={seed}`
- `/?seed={seed}&network=testnet`

If no seed is provided, the app opens the default promo catalogue seed `AP10YnWjS0yEFsXPC-mM9A` on `testnet`.
