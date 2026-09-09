# Merxet Storefront Template

The canonical, self-contained starter for generated merchant shops. Extracted from the completed promo storefront in Phase 1, this project contains the presentation, protected catalog/commerce runtime, static build tooling, fixtures, and browser checks. It has no sibling-project or workspace-package dependency.

## Develop and build

Use Node.js 24.11.0 and npm 11.17.0, as recorded in [the template manifest](./template/template-manifest.json).

```bash
cd merxet-storefront-template
npm ci
npm run dev
```

Open the local URL printed by Vite. The shop starts at `/`; product browsing is at `/products`, collections at `/collections/:collectionId`, product details at `/products/:productId`, and shop information at `/about`.

```bash
npm run build
npm run preview
```

The build produces `dist/`, including the validated public configuration and shop metadata embedded in the initial HTML. Development reads `public/storefront.json` at runtime; production pins that configuration to the built revision. Changing branding requires rebuilding; current products and prices still come from the live catalog.

For hosting beneath a URL path, use the same base for build and local preview:

```bash
npm run build -- --base=/s/my-shop/
npm run preview -- --base=/s/my-shop/
```

The static host must serve this shop's HTML for direct product and collection routes. Bunny hosting and Railway sandbox execution are subsequent Phase 2 work.

## Customize the starter

- Edit [public/storefront.json](./public/storefront.json) for catalog identity, branding, collections, featured product IDs, and supplied public links.
- Put merchant assets in `public/shop-assets/`; reference them as `shop-assets/filename.svg`.
- AI-editable source is limited to `src/storefront/pages/`, `src/storefront/sections/`, and `src/storefront/theme.css`.
- Application setup, catalog identity, pricing, buyer-link helpers, build tooling, dependencies, and checks remain protected. See [the generation contract](./template/generation-guide.md).

Products and prices refresh from the current catalog. Failed refreshes show an error instead of stale prices. The shop's explicit network and catalog binding determine buyer links; query parameters and local-storage network settings cannot override them. Quantity, cart, checkout, and wallet interaction belong to the existing buyer app.

## Validate

```bash
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm test
```

Tests start a development server on port 4173 and a production preview under `/s/template/` on port 4174. They cover desktop and 390x844 mobile layouts, live catalog errors/updates, two fixture catalogs, exact amounts, buyer links/QR, navigation, and direct-route refreshes. Windows developers can set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge. Screenshots stay inside this project at `output/playwright/`.

## Source ownership and future sandbox input

Maintain one starter here. `merxet-promo` retains its existing catalog application and its own regression checks; it no longer includes a storefront entry or template copy. The small pre-existing protocol/runtime helpers required by both applications are included locally so each project remains independently buildable. Changes to that shared protocol behavior must remain compatible in both applications.

For a future sandbox attempt, copy this project at a recorded template version, excluding `node_modules/`, `dist*/`, test reports, local output, and Git metadata. Install from its lockfile in the recorded environment. Never include credentials or use another merchant's workspace as the clean starting template. Store each generated source copy and `dist/` separately as revision artifacts on Bunny through the future builder.

Template version 1.1.0 records this standalone extraction. The manifest's lockfile hash uses UTF-8 text normalized to LF. Maintainers update the version, lockfile, and hash together when changing the generation interface or dependencies.
