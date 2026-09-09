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
local `@merxet/mcp@1.0.1` integration, restart Codex, and use a short example
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

## Storefront template

The completed storefront has moved to the independent [merxet-storefront-template](../merxet-storefront-template/README.md) project. Its shop opens at `/` in its own development server. This promo app retains its catalog seed/query URLs and flipbook/swipe layouts; it no longer serves `/storefront` or provides storefront build scripts.

## Validation

Run `npm run build`, `npm run lint`, and `npm test` here. The promo browser checks use their own server on port 4175 and cover catalog URLs and disclosure behavior on desktop and 390x844 mobile. Install the browser with `npx playwright install chromium`, or set `PLAYWRIGHT_CHANNEL=msedge` on Windows. Screenshots are saved locally in `output/playwright/`.
