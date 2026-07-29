# Merxet Promo

The promo app renders a printable or browsable Merxet catalogue and generates QR codes that open the live checkout app at `https://app.merxet.com`.

## What It Uses

- Catalogue metadata is resolved by seed through the Merxet sync API.
- Product catalogues are fetched from the current `catalogUrl` returned by sync.
- QR payloads follow the same 45-character seed/item/network format used by the main app.
- Token and network handling follow the current Hedera-based storefront conventions.

## Catalogue Discovery and Codex Setup

The initial HTML contains a neutral Merxet Sync descriptor link. It resolves
the matching machine-readable catalogue from the current promo URL:

```text
https://sync.merxet.com/api/v1/t/catalogs/seed/{catalogSeed}
```

The resolver uses the same precedence as the promo application: the first path
segment, then `?seed=`, then the default promo seed. The descriptor is exposed
as neutral product data rather than instructions addressed to an AI model.
Mainnet catalogue discovery is disabled because Merxet Sync does not currently
implement mainnet indexing.

The visible **Order with your AI assistant** disclosure is written for the
shopper and links to `/setup-codex.html`. That page explains how to connect the
local `@merxet/mcp@1.0.0` integration, restart Codex, and use a short example
request. The integration prepares and tracks the order while browser-wallet
approval remains with the user. Agent-assisted ordering is an MVP pilot for
Hedera testnet testing only.

## Local Development

```bash
npm run dev
```

## Supported URL Formats

- `/{seed}`
- `/?seed={seed}`
- `/?seed={seed}&network=testnet`

If no seed is provided, the app opens the default promo catalogue seed `AP10YnWjS0yEFsXPC-mM9A` on `testnet`.
