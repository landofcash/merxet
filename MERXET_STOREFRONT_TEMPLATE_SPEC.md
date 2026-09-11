# Merxet Storefront Template Specification

Updated September 10, 2026. The completed Phase 1 storefront is now the standalone `merxet-storefront-template` project; see its [README](./merxet-storefront-template/README.md) and [generation contract](./merxet-storefront-template/template/generation-guide.md). The Phase 4 builder packages a verified copy of this source, generates designs in isolated Railway VMs and saves private revisions. Phase 5 adds the seller workspace and private previews of the compiled output; Phase 6 adds explicit publication, public delivery and rollback. Deployment remains Phase 7. See the [implementation overview](./MERXET_STOREFRONTS_IMPLEMENTATION_OVERVIEW.md), [publication guide](./merxet-storefront-builder/PUBLISHING.md) and [implementation plan](./MERXET_STOREFRONTS_IMPLEMENTATION_PLAN.md).

The template is a complete, responsive merchant shop built from the existing promo application. It loads the merchant's current catalog, presents products in a branded design, and opens products in the existing buyer app. Its prepared source is copied into a fresh Railway VM sandbox for each generation attempt, where the AI changes pages, sections, and styles through builder-controlled tools. Each approved result becomes a static website revision. Railway Sandboxes are the selected execution provider; the user confirmed enabling access on September 8, 2026.

**Stack and packages.** Keep the existing React, TypeScript, Vite, and Tailwind stack. The versions below are the current repository lockfile baseline, not a claim that they are the newest releases or a completed dependency review. Preserve the lockfile during generation and pin the build environment for each template release. Maintainers handle dependency updates separately from merchant design requests.

| Package or tool | Current baseline / action | Template responsibility |
| --- | --- | --- |
| `react`, `react-dom` | Keep; locked to 19.2.0 | Pages, reusable sections, local UI state, and shared catalog context. |
| `typescript` | Keep; locked to 5.8.3 | Strict types for products, shop settings, component props, and the template interface. |
| `vite`, `@vitejs/plugin-react` | Keep; Vite locked to 7.1.8 | Development and static production builds. |
| `tailwindcss`, `@tailwindcss/postcss`, `postcss` | Keep current integration; Tailwind locked to 4.1.14 | Responsive layout, component styling, and theme variables. |
| `react-router-dom` | Keep; locked to 7.9.3 | Shop, collection, and product routes using the existing declarative routing approach. |
| `zod` | Keep; locked to 4.1.11 | Validate public shop configuration and downloaded catalog JSON before rendering. |
| `lucide-react` | Keep; locked to 0.524.0 | Search, navigation, external-link, and QR icons. |
| `qrcode.react` | Keep; locked to 4.2.0 | Render the same buyer-app URL as a QR code. |
| `clsx`, `tailwind-merge` | Keep | Existing class composition. The unused `class-variance-authority` dependency is excluded from the standalone template. |
| `tw-animate-css` | Keep where used | Small transitions for existing UI components. Respect reduced-motion preferences. |
| shadcn/ui component source | Keep the local component approach in `components/ui` | Maintained Button and Modal wrappers; native labeled inputs/selects and shared loading states. |
| `radix-ui` | Added and pinned to 1.6.7 | Dialog focus handling, keyboard interactions, and mobile navigation built through local wrappers. |
| ESLint and existing TypeScript/React plugins | Keep | Validate maintained and generated source. |
| `@playwright/test` | Added and pinned to 1.63.0 | Verify the maintained starter, mobile navigation, direct routes, and buyer-app links; adapt merchant inputs for generated checks in Phase 2. |

The existing shadcn setup already uses local component files and CSS variables. Extend that setup with the selected Radix-backed components and review their required imports; the generator should use the prepared components rather than install new ones. Radix recommends the `radix-ui` package and supports importing only the primitives used. [shadcn Vite documentation](https://ui.shadcn.com/docs/installation/vite), [Radix documentation](https://www.radix-ui.com/primitives/docs/overview/introduction).

Use native `fetch` and a shared catalog provider initially. Load the catalog once per shop context, expose loading/error/refresh states, and keep browsing state in React and URL query parameters. The current scope does not require an additional global state or data-fetching package. The `react-pageflip` and `swiper` dependencies remain only in `merxet-promo`; the standalone template excludes them.

**Pages and starter sections.** Start with one complete neutral design that the agent can transform for different merchants.

| Page or section | Initial behavior |
| --- | --- |
| Shop header | Merchant logo/name, collection navigation, search, and a top hamburger menu on mobile. |
| Homepage | Hero section, featured products, selected collections, and optional merchant-provided shop story. |
| Product listing | Responsive product grid, text search, collection filtering, and useful empty states. Price sorting must account for token differences. |
| Collection page | A named grouping of existing catalog product IDs with a description and product grid. |
| Product page | Current image, name, description, token price, buyer-app link, QR dialog, and breadcrumbs. Use only fields present in the catalog. |
| Shop information/footer | Merchant-provided contact and policy links, plus appropriate Merxet attribution. |
| Shared states | Loading, failed catalog request with retry, unavailable product, missing image, and unknown route. |

Do not generate reviews, discounts, stock claims, delivery promises, or verification claims without supporting data. Collections are storefront metadata and initially reference existing products; they do not require changing the catalog format. The buyer app continues handling quantity selection, cart, and checkout.

**Source organization and AI editing.** The complete buildable starter lives in `merxet-storefront-template`. It includes all required runtime, assets, dependencies, and tooling; copying only `src/storefront/` is insufficient. No source or package imports reach into sibling projects. The promo application retains its own presentation and regression checks.

```text
merxet-storefront-template/
  src/
    app/                    entry, routing, providers
    lib/
      catalog/              loading, validation, product lookup
      buyer/                buyer URLs and QR payload helpers
      shop/                 public configuration schema and loader
      pricing/              token lookup and amount formatting
    components/
      ui/                   maintained accessible UI primitives
      commerce/             ProductPrice, BuyerAppLink, ProductQr
    storefront/
      pages/                AI-editable shop pages
      sections/             AI-editable hero, grid, story, footer
      theme.css             AI-editable colors, typography, spacing
  public/
    storefront.json         public shop configuration in generated output
    shop-assets/            merchant branding and supplied assets
  template/
    generation-guide.md     permitted edits and available helpers
    template-manifest.json version, editable paths, validation rules
    fixtures/              sample public catalogs for validation
  tests/                   maintained browser acceptance checks
  tooling/                 static HTML/configuration build plugin
  package.json             independent scripts and dependencies
  package-lock.json        pinned dependency graph
  vite.config.ts           independent build configuration
```

The AI may rewrite page and section TSX, adjust layout composition, and change the theme. It receives catalog data and branding to guide those changes. This supports designs that differ in structure as well as colors.

Catalog/network identity, buyer-link generation, price formatting, dependency manifests, build configuration, and acceptance checks remain maintained template code. Expose these through small helpers and components. Validate the changed file paths and imports, then check actual rendered behavior; an editable-file list alone is not an isolation mechanism. Each attempt's Railway VM sandbox provides the separate environment for executing generated code.

**Railway build contract.** Prepare a clean Railway template/checkpoint containing a pinned Node.js toolchain, dependencies installed from the template lockfile, and the browser tooling required by the acceptance checks. A storefront template release records which clean build-environment version it expects. Copy the selected shop source and public configuration into each new sandbox; never reuse a previous merchant's writable workspace as another shop's base.

The [Phase 2 harness](./tools/storefront-harness/README.md) implements this contract and has validated unchanged builds plus two actual `gpt-5.6-luna` designs in disposable VMs. Its generic merchant browser checks run against compiled output at each shop's own base path, followed by saved desktop/mobile previews after VM destruction. Both generated revisions have verified private source records and public compiled files in Bunny. The deployed shared resolver passed public shop routing, direct product refresh, desktop/mobile browsing, revision switching and rollback. Pantry also passed with live catalog data and no network mocks; studio uses a synthetic catalog fixture. See [recorded evidence](./tools/storefront-harness/EVIDENCE.md) for measured results.

The builder runs model requests outside the generated-code environment and controls sandbox file/command operations through its backend adapter. All source execution, Vite builds, and generated-page browser checks run inside the attempt's sandbox. Use fixed build commands and collect `dist/`, the source archive with its lockfile, and validation logs as separate outputs. The builder validates and uploads these to Bunny, then destroys the sandbox. A non-zero exit, timeout, failed browser check, or failed artifact upload cannot produce a ready revision.

Railway management and Bunny credentials stay in the builder. Use isolated networking; the sandbox needs no connection to the project's private services. The Railway integration is a builder dependency and is not bundled into the storefront. Seller previews use the saved build artifacts through the preview service, so review does not depend on a live sandbox. [Railway Sandboxes documentation](https://docs.railway.com/sandboxes).

The builder uses configurable concurrency, initially `MAX_CONCURRENT_BUILDS=2` globally and `MAX_CONCURRENT_BUILDS_PER_SHOP=1`, while serializing Bunny metadata writes. These are proposed defaults, not fixed capacity limits. Job/attempt identity, timeouts, restart recovery, and cleanup are specified in the [implementation overview](./MERXET_STOREFRONTS_IMPLEMENTATION_OVERVIEW.md).

**Public data contract.** The builder emits a small `storefront.json` containing `schemaVersion`, `shopId`, catalog seed, network, public branding, collections, featured product IDs, and merchant-provided public links. It is a public projection of the private management records on Bunny. Prompts, jobs, logs, and storage credentials are never part of this file. The AI can propose branding and collection choices; the builder validates the result and preserves the selected catalog binding.

The app loads that configuration, resolves the catalog through Merxet Sync, validates it with Zod, and passes current products to the presentation. Keep catalog prices in their exact base-unit representation. JSON snapshots should encode large integer amounts as decimal strings and normalize them for runtime use. Review the existing formatter's conversion to JavaScript `Number` while extracting it so large values are not silently rounded. [Zod validation documentation](https://zod.dev/basics).

The generation snapshot guides design; current catalog data supplies displayed product facts and prices. Define refresh behavior at navigation, reload, and return to the page, with requests deduplicated in the catalog provider. Removed products become unavailable, invalid featured references are omitted, and an all-products listing can display newly added items. Do not embed the generation snapshot as the permanent live catalog.

Pass the selected network explicitly through catalog, token-formatting, and buyer-link helpers. The current promo helpers consult shared local-storage network state; a generated shop must not accidentally switch its pricing or links because another tab selected a different network.

**Styling.** Use semantic theme variables for colors, fonts, border radius, and spacing, with Tailwind classes for layout. The current global stylesheet includes page centering, fixed heading styles, gradients, and flipbook rules. Move those promo-specific rules under the promo layout so they do not constrain shop designs. Maintain a small base stylesheet and let each generated shop override its theme. [Tailwind theme documentation](https://tailwindcss.com/docs/theme).

Use supplied or bundled branding assets with deployment-aware paths, responsive image sizing, lazy loading below the first screen, readable contrast, and visible keyboard focus. Validate the main buyer action and top navigation at 390x844. Use the QR dialog and navigation primitives through maintained wrappers so visual changes preserve their accessible behavior.

**Routing, output, and hosting.** Use relative shop routes such as `/`, `/collections/:collectionId`, and `/products/:productId`. Align the router's `basename` with the visible deployment path and configure Vite asset paths for the selected hosting layout. The host/resolver must return the correct shop revision's HTML for direct page navigation while serving its actual assets normally. Test this against the intended hosting setup, including revision assets and rollback; local navigation alone is insufficient. [React Router documentation](https://reactrouter.com/api/declarative-routers/BrowserRouter), [Vite base-path documentation](https://v7.vite.dev/guide/build#public-base-path).

The validated hosting prototype preserves compiled HTML and its embedded public configuration. Pages and `storefront.json` are not cached; each static asset path is permanently pinned to approved bytes within its shop. Vite-generated hashes satisfy this for compiled bundles. Give changed branding assets new filenames too; publication rejects reuse of an existing asset path with different content. Retaining these references keeps older open pages working after publication or rollback.

Preserve existing promo seed/query URLs. The current `index.html` also derives catalog identity from the first URL path segment; generated shops must take that identity from their fixed configuration so a product route is not mistaken for a catalog seed. Adapt public catalog descriptor links and share metadata accordingly.

Produce static `dist/` files and a source archive with the dependency lockfile. Generate shop title, description, favicon, and share tags in the initial HTML. Distinct product share previews and fuller search indexing require per-route HTML generation later; changing metadata only after JavaScript loads does not solve that requirement. Vite builds static output; its preview server is only for inspection. [Vite static deployment documentation](https://v7.vite.dev/guide/static-deploy).

**Validation and first milestone.** The template release should pass type checking, lint, and a production build. Browser checks should cover catalog failures, missing products, navigation and reloads, mobile menu/QR behavior, and buyer links with the correct catalog/product/network. Include large-price formatting checks when extracting that helper. Playwright provides browser automation and assertions for these flows. [Playwright documentation](https://playwright.dev/docs/intro).

The working branded shop and buyer links from Phase 1 have been extracted into the standalone template. The next proof is two visibly different AI-generated designs built in separate Railway VM sandboxes and passing the same checks. Confirm that collected artifacts remain usable after sandbox destruction. The builder then automates this established workflow.
