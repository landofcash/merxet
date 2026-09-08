# Merxet Storefronts: Implementation Plan

Updated September 8, 2026. Phase 1 is implemented and locally validated; phases 2–7 remain planned. This document turns the agreed [architecture overview](./MERXET_STOREFRONTS_IMPLEMENTATION_OVERVIEW.md) and [template specification](./MERXET_STOREFRONT_TEMPLATE_SPEC.md) into implementation work and acceptance criteria.

The outcome is a merchant-owned shop generated from an existing catalog and a design brief. The merchant can preview it, request design changes, publish a selected revision, and restore a previous revision. Products open in the existing buyer application, which continues to handle quantity, cart, checkout, wallet approval, and orders.

**Agreed implementation boundaries**

| Area | Decision |
| --- | --- |
| Storefront application | Extend `merxet-promo`, preserving its existing catalog URLs and flipbook/swipe presentation. |
| Template selection | Start with one complete neutral template under `src/storefront/`. The AI changes its pages, sections, and styles. Additional design presets can follow after this works. |
| Builder | Add one new Node.js/TypeScript project, `merxet-storefront-builder`, in this repository. |
| Merchant interface | Add storefront management to `merxet-seller`. |
| Seller authentication | Use the operational internal wallet for signed login challenges and builder sessions. HashPack and other external-wallet integrations are deferred. |
| Build execution | One disposable Railway VM sandbox per build attempt. Access is user-confirmed enabled; the integration still needs a live feasibility check. |
| Durable storage | JSON metadata, source archives, logs, and artifacts in Bunny Storage. No SQL database in the initial implementation. |
| Coordination | One active coordinator owns metadata writes and schedules concurrent sandbox attempts. |
| Hosting | Approved static output on Bunny Storage/CDN, with a shared resolver for stable shop addresses and revision selection. |
| Purchase flow | Reuse existing product links and QR codes into `merxet-frontend`. |
| Deferred features | World Selfie Check, ENS, marketplace discovery, automated custom domains, multiple starter templates, variants, inventory reservations, and new MCP functionality. |

A merchant shop is a stored identity plus a series of generated revisions. It does not become a separately maintained repository or a permanent Node.js application. The template source and builder are maintained projects; merchant source copies and compiled websites are stored artifacts.

**Implementation sequence**

| Phase | Deliverable | Depends on | Completion gate |
| --- | --- | --- | --- |
| 1 | Working storefront inside the promo project | Existing catalog and buyer-link behavior | One branded shop with live products and working buyer links; existing promo still works. |
| 2 | Sandbox, generation, and hosting feasibility | Phase 1 | Two distinct generated designs build in separate VMs; collected output works after VM destruction; hosted direct routes work. |
| 3 | Builder API, ownership, and durable records | Contracts established in phases 1–2 | An authenticated merchant can create a shop; metadata survives restart; another merchant cannot access its management records. |
| 4 | Durable generation queue and recovery | Phases 2–3 | Configurable parallel builds, bounded retries, cancellation, and restart recovery work without accepting stale results. |
| 5 | Seller generation and preview interface | Phases 3–4 | A merchant can generate, preview, revise, and inspect previous drafts from the seller portal. |
| 6 | Publication, rollback, and export | Phase 5 and hosting prototype | An approved revision is publicly reachable; rollback works; source and static exports are available. |
| 7 | Deployment and end-to-end acceptance | Phases 1–6 | Two independently owned shops pass the complete flow, including entry into the existing buyer app. |

Finish the first storefront before building the full management interface. Use a small development harness for the feasibility trial, then move the proven integration into the builder. The harness is temporary tooling within this repository, not another deployed application.

**Phase 1 — Prepare the existing promo application**

- [x] Extract catalog resolution, download, validation, and product lookup from [HomePage.tsx](./merxet-promo/src/pages/HomePage.tsx) into shared maintained helpers and a catalog provider. Reuse [syncService.ts](./merxet-promo/src/lib/syncService.ts).
- [x] Introduce a validated public shop configuration containing `schemaVersion`, `shopId`, network, catalog seed, branding, collections, featured product IDs, and merchant-provided public links.
- [x] Make storefront mode use that configuration explicitly. Keep current seed/query URLs working in promo mode, including the existing network selection behavior there.
- [x] Pass network explicitly into storefront catalog, price, and buyer-link helpers. Another browser tab's network setting must not change a shop's identity or links.
- [x] Extract maintained `ProductPrice`, `BuyerAppLink`, and `ProductQr` components. Preserve the URL format in [qrCodeUtils.ts](./merxet-promo/src/lib/qrCodeUtils.ts) and compatibility with the [buyer receiver](./merxet-frontend/src/components/UrlParserAndRedirector.tsx).
- [x] Keep prices exact in base units; serialize large integers as decimal strings. Review the existing formatter's conversion to `Number` and add focused checks for amounts that exceed safe integer precision.
- [x] Build the neutral storefront: header, hero, featured products, all-products grid, search, collections, product page, shop information, and footer. Include loading, retry, empty, unavailable-product, and missing-image states.
- [x] Add responsive navigation with a top hamburger menu. Scope the existing promo-specific global styles so they do not constrain the storefront layout.
- [x] Keep the current React/TypeScript/Vite/Tailwind stack and lockfile. Add only the UI primitives and browser tooling described in the template specification; maintain dependency changes separately from generation.
- [x] Adapt the HTML catalog descriptor and shop share metadata. Generated product routes must not be interpreted as catalog seeds by the current first-path-segment logic in `index.html`.
- [x] Add `template/generation-guide.md`, `template/template-manifest.json`, and two contrasting catalog fixtures. Record template version, editable paths, protected files, supported helpers, fixed validation commands, and required build environment.

Use the folder organization in the template specification. Initially, `src/storefront/pages/`, `src/storefront/sections/`, and `src/storefront/theme.css` contain one design. The agent receives a copy and can change its structure as well as colors and text. Avoid creating a `templates/` collection before there is a demonstrated need for multiple maintained starting points.

Current products remain the source for names, descriptions, images, prices, and buyer links. The generation snapshot is design input. Define catalog refresh and request deduplication; newly added products appear in the all-products listing, removed products become unavailable, and missing featured references are omitted. Do not generate unsupported reviews, discounts, availability, delivery, or verification claims.

**Acceptance:** the starter shop works with an existing catalog on desktop and at 390x844; product links and QR codes resolve the correct catalog/product/network; changing catalog data does not require rebuilding the design. Type checking, lint, production build, and focused browser checks pass. Existing promo navigation and links still work.

**Phase 2 — Prove the sandbox and hosting workflow**

- [ ] Select a dedicated Railway execution environment and record sandbox ownership conventions. Pin the SDK version and prepare a clean template/checkpoint containing a compatible Node.js toolchain, lockfile-installed dependencies, and browser-check tooling.
- [ ] Implement a small sandbox adapter: create, connect, transfer files, execute a fixed command, inspect its result, collect output, and destroy. Scope every operation to the attempt's explicit sandbox ID.
- [ ] Build the unchanged starter first. Collect source, `dist/`, and validation logs, verify the collected files, then destroy the sandbox. Prove the collected website remains usable.
- [ ] Add the generation adapter. Keep model requests and credentials in the trusted coordinator/harness; execute file edits and build tools in the VM. Send the public catalog snapshot, merchant brief, supplied assets, selected source, and template instructions.
- [ ] Constrain editing to the template contract. Check changed files, imports, dependency manifests, and build configuration before accepting the source. Keep catalog identity, pricing, buyer-link logic, and validation tooling maintained by the platform.
- [ ] Generate two visibly different designs from two catalogs in separate sandboxes. Run type/lint/build checks and browser acceptance checks for each. Permit a bounded repair attempt using actual validation feedback.
- [ ] Measure provisioning, model, build, validation, collection, and cleanup time, plus artifact size. Use these results to choose the model and configure time, output, and retry budgets.
- [ ] Prototype authenticated Bunny upload/download, checksums, JSON overwrite visibility, interrupted writes, and recovery from an incomplete upload. Keep management files private and approved website files in a separate public zone.
- [ ] Upload sample approved builds and prove the proposed shop route, product-page refresh, asset paths, configuration loading, and revision switching against the actual hosting setup.

Railway command results expose exit status, timeout, and truncation; an execution call returning successfully is not proof that the command passed. Use `ISOLATED` networking, which still permits public outbound access. Keep provider idle timeout separate from command and attempt deadlines, and handle the documented need for interaction during long jobs. Do not assume a running process keeps the VM alive. Sandbox previews must use collected artifacts because the sandbox has no public website endpoint. These provider details must be covered by the adapter trial. [Railway Sandboxes documentation](https://docs.railway.com/sandboxes).

Bunny documents uploading Vite's `dist/` files into Storage and serving them through a Pull Zone. Storage requests use the storage-zone credential; the sandbox and generated website must never receive it. A single root SPA fallback does not by itself select the correct HTML for multiple shops and revisions. The hosting prototype must verify that selection explicitly. Configure cache behavior at the delivery layer; do not assume a `Cache-Control` header on a Storage upload configures CDN caching. [Bunny Vite hosting](https://bunny.net/docs/storage/static-site-hosting/vite), [Bunny HTTP storage API](https://bunny.net/docs/storage/http).

**Acceptance:** two designs pass the same maintained checks; each attempt has separate files and outputs; both VMs are confirmed destroyed; saved previews still work. Hosted direct product links resolve the right shop, and a missing asset returns an error rather than another shop's HTML. Record the chosen SDK/model versions, clean environment identifier, measured budgets, and hosting configuration before automating the workflow.

**Phase 3 — Add the builder and durable management records**

Create `merxet-storefront-builder` as one independently deployable backend within the monorepo. Use Node.js/TypeScript, repository-compatible HTTP conventions, validated request/record schemas, the Railway SDK behind an adapter, and a small Bunny HTTP client. Add the selected model integration after the feasibility trial. Keep the storefront browser bundle free of these backend dependencies.

```text
merxet-storefront-builder/
  src/
    api/                  authentication, shops, jobs, revisions, publication
    auth/                 wallet challenges, sessions, ownership checks
    domain/               schemas, identities, job and publication transitions
    storage/              Bunny client, JSON records, artifacts, recovery
    jobs/                 scheduler, attempts, cancellation, reconciliation
    generation/           model adapter, input preparation, editing contract
    sandbox/              Railway adapter, commands, collection, cleanup
    validation/           source checks, artifact checks, validation results
    delivery/             private preview and public revision resolver
    publishing/           publication operations, rollback, export
    config/               environment validation and operating limits
  tests/                  focused state, storage, adapter, and API checks
```

- [ ] Define schemas for `Shop`, `GenerationJob`, `BuildAttempt`, `RevisionManifest`, `PublicationOperation`, and `PublicStorefrontConfig`. Include schema versions, IDs, timestamps, and record versions where updates occur.
- [ ] Bind a shop to a stable ID, one catalog, owner account, and network. Keep the selected draft, job state, and published revision separate. Scope product references by network, catalog, and product ID.
- [ ] Add wallet-authenticated management using the operational internal wallet's signing capability through [WalletContext.tsx](./merxet-seller/src/context/WalletContext.tsx). Use a single-use expiring challenge bound to account, network, and intended application origin. Verify the internal-wallet signature server-side, bind the verified signer to the owning account, and establish a builder session. HashPack and other external-wallet authentication are outside this milestone.
- [ ] Verify catalog ownership server-side before creation and mutations. A connected-wallet address supplied by the browser is insufficient proof. Restrict previews, source exports, logs, and management actions to the authenticated owner.
- [ ] Implement shop creation/listing, configuration editing, revision listing, and job submission/status endpoints. Reuse stable request IDs for retry-safe mutations.
- [ ] Implement private JSON and artifact storage through one coordinator. Persist accepted jobs before acknowledging them. Preserve validated record versions for recovery and verify writes through authenticated primary-endpoint reads.
- [ ] Add startup scanning of persisted records and a rebuildable listing cache. Do not make an in-memory queue or cache the only copy of accepted work.

Proposed private storage layout:

```text
<network>/<ownerAccount>/shops/<shopId>/
  shop.json
  jobs/<jobId>.json
  attempts/<attemptId>/attempt.json
  attempts/<attemptId>/input.json
  attempts/<attemptId>/logs/
  revisions/<revisionId>/revision.json
  revisions/<revisionId>/catalog-snapshot.json
  revisions/<revisionId>/source.tar.gz
  revisions/<revisionId>/dist/
  publications/<publicationId>.json
  record-history/...
```

Attempt records include job ID, attempt number, selected base revision, sandbox ID, command/session references, deadlines, cancellation state, and cleanup state. Revision manifests include parent revision, template/environment/model versions, validated public configuration, artifact paths, file hashes, and validation results. Private inputs retain the merchant brief and generation context. The public configuration excludes prompts, ownership proofs, jobs, logs, and credentials.

Upload and verify artifacts before writing a completed immutable revision manifest. Keep owner/network path components server-derived and validate identifiers. Serialize updates to each shop and its records. Bunny file storage is not a transactional database: multiple-file changes need recorded operations and restart reconciliation, and a record-version field alone does not coordinate multiple writers.

**Acceptance:** records and accepted jobs survive a process restart; partial uploads never become complete revisions; duplicate requests return the existing result; another owner cannot read or mutate private shop data. Internal-wallet authentication succeeds for the verified owner and rejects invalid signatures, account/network mismatches, and expired or replayed challenges.

**Phase 4 — Automate generation, scheduling, and recovery**

Make the following proposed environment settings explicit and configurable:

```dotenv
MAX_CONCURRENT_BUILDS=2
MAX_CONCURRENT_BUILDS_PER_SHOP=1
```

`MAX_CONCURRENT_BUILDS` limits active attempts across all merchants handled by the coordinator. Two is the initial default, not a fixed system maximum. Increasing it to five allows up to five attempts, subject to provider capacity and operating budgets. The per-shop setting separately limits attempts for one shop; the effective capacity also respects the global limit. Validate both as positive integers.

Read these settings at startup and document the controlled restart procedure for changing them. Initially, no administration UI or live configuration reload is needed. Count provisioning through cleanup against the limit. If a recovered workload exceeds a newly reduced limit, let it finish and admit no new work until capacity is available. Raising the per-shop limit requires preserving independent base revisions and explicit publication selection; it must never make the last completed draft automatically replace the live shop.

- [ ] Implement `queued → provisioning → generating → building → validating → uploading → ready`, with `failed` and `canceled` terminal outcomes. Track cleanup independently so terminal jobs can still have pending resource cleanup.
- [ ] Schedule the oldest eligible persisted job, skipping temporarily blocked shops. Reserve capacity before provisioning and release it only when its sandbox is confirmed stopped/destroyed or absent.
- [ ] Pin each job's catalog input, prompt, source/base revision, and template version. Start a revision request from the merchant-selected draft rather than whichever build finishes last.
- [ ] Give each retry a new attempt ID and VM. Accept completion only from the current authorized attempt. Keep automatic retries and model repair bounded; do not retry indefinitely on invalid output.
- [ ] Enforce command deadlines, an overall attempt deadline, file/archive/output limits, and cancellation checks throughout the workflow. Record the configured values selected in phase 2.
- [ ] Collect and inspect bounded source/build artifacts without executing generated code in the coordinator. Validate paths, symlinks, sizes, protected-file integrity, and required outputs before storing a ready revision.
- [ ] Attempt sandbox destruction after every success, failure, cancellation, or timeout. Persist cleanup failures and retry cleanup separately from generation.
- [ ] On startup, reconcile incomplete jobs with provider state before admitting replacements. Reconnect only to current attempts; terminate obsolete ones and reject late results.
- [ ] Handle creation succeeding before the sandbox ID is saved, using the proven ownership convention or dedicated environment from phase 2. Cleanup must only target builder-owned resources.
- [ ] Add structured status and metrics keyed by shop/job/attempt: queue wait, stage durations, active VMs, retries, output size, and pending cleanup. Keep raw private logs owner-restricted.

Run one active writer during normal operation and deployment. Configure replacement so the old coordinator stops scheduling and writing before the new coordinator resumes persisted work; overlapping replicas would violate the JSON coordination model. A second API instance that also mutates records is not a supported scaling shortcut.

**Acceptance:** with default settings, two different shops build while a third waits and same-shop requests serialize. Changing the global setting changes admitted concurrency. Inject build failure, upload failure, timeout, cancellation, duplicate submission, coordinator restart, and delayed completion; none may publish output, lose accepted work, overwrite a newer draft, or silently abandon a VM.

**Phase 5 — Add seller management and private previews**

- [ ] Add a Storefront area to [seller routing](./merxet-seller/src/main.tsx) and [navigation](./merxet-seller/src/components/Layout.tsx), with entry from the relevant catalog list/editor.
- [ ] Build shop creation from an owned catalog, initial branding inputs, and a design-brief field. Reuse the seller's internal-wallet flow and add builder authentication. Require a fresh login when the wallet account or network changes.
- [ ] Show queued/running/ready/failed/canceled status, useful progress, cancel/retry actions, and understandable error messages. Use bounded polling initially; preserve job identity across reloads.
- [ ] Add draft preview, feedback for another revision, revision history, and clear draft versus published selection. A failed generation should leave the previous usable preview accessible.
- [ ] Serve private preview artifacts through an authenticated delivery flow on an origin separate from seller/buyer applications. Scope preview access to the selected shop/revision and avoid exposing management credentials to generated JavaScript.
- [ ] Ensure preview routing, configuration, and asset loading refer to the same immutable revision. Make preview authorization work for dependent files as well as the initial HTML, with private responses excluded from shared public caching.
- [ ] Provide a full preview in a separate tab and a mobile-size preview option. Neither should depend on the sandbox remaining alive.

**Acceptance:** a merchant completes create → generate → preview → request changes using the seller UI. Refreshing or reopening the seller page restores progress/history. Private previews remain available after sandbox cleanup, and an unrelated merchant cannot open them.

**Phase 6 — Publish, roll back, and export**

Use a stable public shop path such as `/s/{shopId}/` on a dedicated storefront origin; the hostname is a deployment setting. Keep approved files under immutable revision paths in the public storage zone. Implement the shared resolver in the builder codebase: it selects the published revision and returns its HTML for shop page routes. Versioned assets and public configuration are served from Bunny with paths tied to that revision. This adds a shared delivery component, not a server per merchant; the resolver remains part of live delivery even when no builds are running.

The phase 2 prototype must establish the exact CDN/origin configuration, router basename, and build asset base for this arrangement. Use the same revision for HTML, configuration, and assets so a cached page cannot accidentally load another revision's files. Generated builds must also support the private preview path. A change to `publishedRevisionId` alone does not configure CDN behavior.

- [ ] Add a merchant-triggered publish action accepting a specific ready revision. Revalidate ownership and completeness; generated code and build completion cannot invoke publication.
- [ ] Record each publication operation, its previous revision, requested revision, and progress before applying changes. Copy only approved public output, verify it, and make retries safe for the same operation.
- [ ] Update the resolver selection and refresh the relevant caches. Verify public HTML, assets, configuration, and a direct product URL before reporting successful publication.
- [ ] Preserve the previous complete revision and routing selection. If switching fails, retain or restore that selection and reconcile the operation. Do not promise an instantaneous atomic change across every CDN cache.
- [ ] Implement rollback using the same publication operation applied to a previous complete revision; do not rebuild it.
- [ ] Add owner-authorized static and source exports. Include the template/version manifest, lockfile, public configuration, build instructions, and deployment-path requirements. Exclude private logs, prompts, tokens, and credentials from the website export.
- [ ] Define retention and backups for JSON records, source archives, and artifacts. Preserve live revisions, pending operations, and offered rollback history. Prove restoration from a backup before enabling destructive retention cleanup.

**Acceptance:** publish revision A, prepare B, confirm A remains live during generation, publish B, and roll back to A. Check the root, a direct product route, configuration, and assets after each operation. A failed upload or route switch leaves a complete working revision available. Exported source rebuilds using its recorded environment, with base-path changes documented for alternative hosting.

**Phase 7 — Deployment and complete acceptance**

- [ ] Configure the builder service, dedicated sandbox environment, private/public storage zones, delivery origins, allowed application origins, credentials, and measured limits. Keep credentials in server configuration and out of template assets and VM inputs.
- [ ] Add a health/readiness check, startup reconciliation, controlled shutdown, and a deployment procedure that prevents simultaneous coordinators. Verify the exact Railway deployment reaches success and then check live HTTP behavior.
- [ ] Run focused unit/integration checks for schemas, price precision, buyer-link encoding, ownership, queue limits, state transitions, idempotency, artifact completion, publication recovery, and cleanup recovery.
- [ ] Run browser acceptance for the maintained template and generated output: loading/errors, search/collections, direct routes and refresh, removed products, buyer links/QR, keyboard navigation, and the top mobile menu at 390x844.
- [ ] Exercise two independently owned shops with distinct catalogs and designs. Confirm independent records, sandboxes, previews, published routes, and rollback history.
- [ ] Complete a selected-product flow through the existing buyer app's cart, payment approval, and order process in the supported test environment. Record the result without treating untested networks as supported.
- [ ] Record the Continuity baseline and the new work separately: pre-existing catalog/MCP/buyer/order capabilities versus new storefront template, AI customization, sandbox builder, revision storage, and publication. Keep World and ENS out of this delivery milestone.

**Definition of done:** a merchant can generate and revise a real shop from an owned catalog, preview it after the build VM has been destroyed, publish a selected revision, recover a previous revision, and export it. Another merchant can do the same concurrently within configurable limits. Current catalog data and existing buyer links work, and failures preserve the last usable shop and durable job history.

**Phase 1 implementation evidence:** [promo README](./merxet-promo/README.md), [generation guide](./merxet-promo/template/generation-guide.md), [template manifest](./merxet-promo/template/template-manifest.json), and [browser checks](./merxet-promo/tests/storefront.spec.ts). The promo build and lint pass. The automated suite passed 17 applicable checks on desktop, at 390x844, and against a dedicated compiled shop under `/s/template/`; its desktop-only skip is the mobile-menu case, which passes in the mobile project. A separate browser check loaded the public demo catalog and current prices, then followed the olive-oil product link into the existing buyer app, which displayed the matching product and 3.5 HBAR price. No Railway sandbox or public deployment was created in this phase.

**Next milestone:** use this working source for the Phase 2 sandbox, generation, and hosting feasibility trial.
