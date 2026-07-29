# Merxet Promo

The promo app renders a printable or browsable Merxet catalogue and generates QR codes that open the live checkout app at `https://app.merxet.com`.

## What It Uses

- Catalogue metadata is resolved by seed through the Merxet sync API.
- Product catalogues are fetched from the current `catalogUrl` returned by sync.
- QR payloads follow the same 45-character seed/item/network format used by the main app.
- Token and network handling follow the current Hedera-based storefront conventions.

## AI Agent Discovery

Each loaded catalogue exposes a small **For AI agents** link to its machine-readable
Merxet Sync descriptor:

```text
https://sync.merxet.com/api/v1/{network}/catalogs/seed/{catalogSeed}
```

The same descriptor is linked from the document metadata with
`rel="alternate"` and `type="application/json"`. The page also publishes one
catalogue-level Schema.org `ItemList` containing the displayed products and
their Merxet identifiers. Agents use the descriptor to locate the registered
catalogue JSON; the Merxet quote flow remains authoritative for order pricing
and payment details.

## Local Development

```bash
npm run dev
```

## Supported URL Formats

- `/{seed}`
- `/?seed={seed}`
- `/?seed={seed}&network=testnet`

If no seed is provided, the app opens the default promo catalogue seed `AP10YnWjS0yEFsXPC-mM9A` on `testnet`.
