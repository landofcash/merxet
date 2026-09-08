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

Phase 1 adds one customizable merchant shop alongside the existing promo layouts. Run `npm run dev` and open `/storefront`, or run `npm run dev:storefront` to serve the shop at `/`. The demo configuration uses the existing public testnet catalog. Shop pages include `/products`, `/collections/:collectionId`, `/products/:productId`, and `/about` beneath the selected entry path.

Edit `public/storefront.json` for the catalog binding, branding, collections, featured product IDs, and supplied public links. Put local merchant assets in `public/shop-assets/` and reference them as `shop-assets/filename.svg`. Configuration is validated; a dedicated build fails on invalid configuration. See [the generation guide](./template/generation-guide.md) and [versioned manifest](./template/template-manifest.json) for the permitted presentation files and protected behavior.

Storefront products and prices load from the current catalog. Requests are shared across sections and refreshed after 60 seconds on navigation, focus, or a visible-page interval, plus an explicit Refresh action. Failed refreshes show an error rather than stale prices. The selected network comes from shop configuration; query strings and another tab's local-storage setting cannot change its buyer links or prices. Public browsing requires no seller login.

```bash
npm ci
npm run build:storefront
# Or build for a deployment path:
npm run build:storefront -- --base=/s/my-shop/
npm run preview -- --base=/s/my-shop/
```

Both build scripts write `dist/`, so each build replaces that local output directory. Dedicated builds put the validated public config, title, description, favicon, social metadata, and catalog descriptor in initial HTML. This pins configuration to the same revision as the HTML and assets; changing branding requires rebuilding. Product changes continue to come from the live catalog. The host must serve the same shop HTML on direct product/collection routes. No public site has been deployed by this phase.

```bash
npx playwright install chromium
npm test
```

The test runner starts its own development server on port 4173 and builds/previews a dedicated shop under `/s/template/` on port 4174. It covers desktop and 390x844 mobile views, buyer links/QR, catalog failures and updates, two fixture catalogs, existing promo URLs, exact amounts, and deployed-path routing. Windows developers can set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge. Screenshots are saved under the repository's `output/playwright/` folder.

The builder, Railway sandbox automation, authenticated seller management, publication/rollback, World, and ENS belong to later phases. Initial seller authentication will use the operational internal wallet.
