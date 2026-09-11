# Merxet Storefronts: Implementation Plan

Updated September 10, 2026. Phases 1–6 and the standalone template extraction are implemented. The seller workspace provides internal-wallet sign-in, shop creation, a floating Design panel, generation/revision history and private iframe previews. The seller reported the Phase 5 local flow working. Phase 6 adds durable publication, public delivery and rollback with seller controls; backend fault tests and isolated browser acceptance validate the implementation. Local setup and the live manual check are in [PUBLISHING.md](./merxet-storefront-builder/PUBLISHING.md). Phase 7 deployment, DNS and live delivery checks are complete; hosted acceptance remains open. Phase 4's three live draft builds and VM cleanup remain recorded separately. See [builder evidence](./merxet-storefront-builder/EVIDENCE.md), [worker operations](./merxet-storefront-builder/WORKER.md) and [Phase 2 evidence](./tools/storefront-harness/EVIDENCE.md). This document implements the agreed [architecture overview](./MERXET_STOREFRONTS_IMPLEMENTATION_OVERVIEW.md) and [template specification](./MERXET_STOREFRONT_TEMPLATE_SPEC.md).

The outcome is a merchant-owned shop generated from an existing catalog and a design brief. The merchant can preview it, request design changes, publish a selected revision, and restore a previous revision. Products open in the existing buyer application, which continues to handle quantity, cart, checkout, wallet approval, and orders.

**Agreed implementation boundaries**

| Area | Decision |
| --- | --- |
| Storefront application | Maintain the complete starter in `merxet-storefront-template`, extracted from Phase 1. Preserve `merxet-promo` as the existing catalog application. |
| Template selection | Start with one complete neutral template under `merxet-storefront-template/src/storefront/`. The AI changes its pages, sections, and styles. Additional design presets can follow after this works. |
| Builder | `merxet-storefront-builder` is the independently runnable Node.js/TypeScript management backend. Phase 4 includes its generation worker. |
| Merchant interface | Add storefront management to `merxet-seller`. |
| Seller authentication | Use the operational internal wallet for signed login challenges and builder sessions. HashPack and other external-wallet integrations are deferred. |
| Build execution | One disposable Railway VM sandbox per build attempt. Live builds and cleanup are validated in the dedicated `storefront-builds` environment. |
| Durable storage | JSON metadata, source archives, logs, and artifacts in Bunny Storage. No SQL database in the initial implementation. |
| Coordination | One active coordinator owns metadata writes and schedules concurrent sandbox attempts. |
| Hosting | Approved static output on Bunny Storage/CDN, with a shared resolver for stable shop addresses and revision selection. |
| Purchase flow | Reuse existing product links and QR codes into `merxet-frontend`. |
| Downloads | Static website and source downloads are outside the implementation scope. |
| Deferred features | Backups and retention management, World Selfie Check, ENS, marketplace discovery, automated custom domains, multiple starter templates, variants, inventory reservations, and new MCP functionality. |

A merchant shop is a stored identity plus a series of generated revisions. It does not become a separately maintained repository or a permanent Node.js application. The template source and builder are maintained projects; merchant source copies and compiled websites are stored artifacts.

**Implementation sequence**

| Phase | Deliverable | Depends on | Completion gate |
| --- | --- | --- | --- |
| 1 | Working storefront inside the promo project | Existing catalog and buyer-link behavior | One branded shop with live products and working buyer links; existing promo still works. |
| 2 | Standalone template extraction, then sandbox, generation, and hosting feasibility | Phase 1 | Two distinct generated designs build in separate VMs; collected output works after VM destruction; hosted direct routes work. |
| 3 | Builder API, ownership, and durable records | Contracts established in phases 1–2 | An authenticated merchant can create a shop; metadata survives restart; another merchant cannot access its management records. |
| 4 | Durable generation queue and recovery | Phases 2–3 | Configurable parallel builds, bounded retries, cancellation, and restart recovery work without accepting stale results. |
| 5 | Seller generation and preview interface | Phases 3–4 | A merchant can generate, preview, revise, and inspect previous drafts from the seller portal. |
| 6 | Publication and rollback | Phase 5 and hosting prototype | An approved revision is publicly reachable; publication recovery and rollback work. |
| 7 | Deployment and end-to-end acceptance | Phases 1–6 | Two independently owned shops pass the complete flow, including entry into the existing buyer app. |

Finish the first storefront before building the full management interface. Use a small development harness for the feasibility trial, then move the proven integration into the builder. The harness runs locally; its small resolver module is deployed separately to prove public delivery and will move into the builder codebase.

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

- [x] Extract the completed starter into `merxet-storefront-template` with its own source, public assets, lockfile, build tooling, generation contract, and browser checks. Serve it at `/`; remove the storefront entry and build mode from promo. Preserve promo seed/query routes and validate both applications independently.
- [x] Select a dedicated Railway execution environment and record sandbox ownership conventions. Pin the SDK version and prepare a clean template/checkpoint containing a compatible Node.js toolchain, lockfile-installed dependencies, and browser-check tooling.
- [x] Implement a small sandbox adapter: create, connect, transfer files, execute a fixed command, inspect its result, collect output, and destroy. Scope every operation to the attempt's explicit sandbox ID.
- [x] Build the unchanged starter first. Collect source, `dist/`, and validation logs, verify the collected files, then destroy the sandbox. Prove the collected website remains usable.
- [x] Add the generation adapter. Keep model requests and credentials in the trusted coordinator/harness; execute file edits and build tools in the VM. Send the public catalog snapshot, merchant brief, supplied assets, selected source, and template instructions. The adapter is implemented; live model calls are covered by the next acceptance gate.
- [x] Constrain editing to the template contract. Check changed files, imports, dependency manifests, and build configuration before accepting the source. Keep catalog identity, pricing, buyer-link logic, and validation tooling maintained by the platform.
- [x] Generate two visibly different designs from two catalogs in separate sandboxes. Run type/lint/build checks and browser acceptance checks for each. Permit a bounded repair attempt using actual validation feedback. Both `gpt-5.6-luna` designs passed on the first attempt; the repair path was not needed.
- [x] Measure provisioning, model, build, validation, collection, and cleanup time, plus artifact size. Use these results to choose the model and configure time, output, and retry budgets. Retain `gpt-5.6-luna`, 240 seconds / 16000 output tokens per model request, at most one repair, 600 seconds per command and 1800 seconds per attempt for the pilot; detailed observations are recorded in the harness evidence.
- [x] Prototype authenticated Bunny upload/download, checksums, JSON overwrite visibility, interrupted writes, and recovery from an incomplete upload. Keep management files private and approved website files in a separate public zone. Both zones passed live probes, including a real interrupted TLS upload and verified retry; the public Pull Zone serves the public probe while the private-only probe returns 404.
- [x] Upload sample approved builds and prove the proposed shop route, product-page refresh, asset paths, configuration loading, and revision switching against the actual hosting setup. The shared resolver is deployed in `storefront-builds`. Both shops passed public HTTP and desktop/mobile checks; pantry also passed with its live catalog and no network mocks. Publishing, rollback, incomplete-revision rejection, retained old assets and isolation of the other shop passed on the live host.

Current evidence: two actual AI designs each passed type/lint/build and 7 generic browser checks, followed by local desktop/mobile checks after VM destruction. Their total attempts took 123–128 seconds, with 35–40 seconds for model generation; all ten historical trial VMs are destroyed. SDK `3.11.0`, the clean checkpoint and project-token authentication are recorded in the harness. Both Bunny zones passed live upload/read/checksum/overwrite and actual interrupted-upload recovery checks. Both designs have private source/build records and public compiled files in Bunny; all twelve compiled files passed public CDN hash and MIME checks. The shared resolver deployment reached `SUCCESS` and serves the [live pantry shop](https://storefront-resolver-storefront-builds.up.railway.app/s/merxet-demo/). Live HTTP, desktop/mobile browser and revision-switching checks passed. Studio uses a deterministic catalog fixture; pantry also passed with current Merxet Sync data and no mocks. The resolver remains running in the dedicated environment. Harness type checking and all 17 focused tests pass.

The proven delivery contract reads the selected revision from authenticated primary storage on every page request, serves unchanged revision HTML with embedded configuration, and verifies compiled bytes fetched from Bunny CDN. Pages and configuration use `no-store`; immutable asset references retain old bytes across switches and permit a one-year browser cache. Changed branding assets must also use new filenames. Publication rejects asset-name collisions before changing the selected revision. See the [resolver implementation](./tools/storefront-harness/resolver/README.md).

Railway command results expose exit status, timeout, and truncation; an execution call returning successfully is not proof that the command passed. Use `ISOLATED` networking, which still permits public outbound access. Keep provider idle timeout separate from command and attempt deadlines, and handle the documented need for interaction during long jobs. Do not assume a running process keeps the VM alive. Sandbox previews must use collected artifacts because the sandbox has no public website endpoint. These provider details must be covered by the adapter trial. [Railway Sandboxes documentation](https://docs.railway.com/sandboxes).

Bunny documents uploading Vite's `dist/` files into Storage and serving them through a Pull Zone. Storage requests use the storage-zone credential; the sandbox and generated website must never receive it. A single root SPA fallback does not by itself select the correct HTML for multiple shops and revisions. The hosting prototype must verify that selection explicitly. Configure cache behavior at the delivery layer; do not assume a `Cache-Control` header on a Storage upload configures CDN caching. [Bunny Vite hosting](https://bunny.net/docs/storage/static-site-hosting/vite), [Bunny HTTP storage API](https://bunny.net/docs/storage/http).

**Acceptance:** two designs pass the same maintained checks; each attempt has separate files and outputs; both VMs are confirmed destroyed; saved previews still work. Hosted direct product links resolve the right shop, and a missing asset returns an error rather than another shop's HTML. Record the chosen SDK/model versions, clean environment identifier, measured budgets, and hosting configuration before automating the workflow.

**Phase 3 — Add the builder and durable management records**

Implemented `merxet-storefront-builder` as one independently runnable backend within the monorepo, with Node.js/TypeScript, Express 5, validated request/record schemas, EIP-191 verification and a private Bunny HTTP client. The existing Railway/model adapters will join its worker in Phase 4. The storefront browser bundle remains free of backend dependencies. Deployment files are prepared; the management API has not been deployed.

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
    publishing/           publication operations, rollback
    config/               environment validation and operating limits
  tests/                  focused state, storage, adapter, and API checks
```

- [x] Define schemas for `Shop`, `GenerationJob`, `BuildAttempt`, `RevisionManifest`, `PublicationOperation`, and `PublicStorefrontConfig`. Include schema versions, IDs, timestamps, and record versions where updates occur. The public configuration schema is generated from the template contract with a drift check.
- [x] Bind a shop to a stable ID, one catalog, owner account, and network. Keep the selected draft, job state, and published revision separate. Scope product references by network, catalog, and product ID.
- [x] Add wallet-authenticated management using the operational internal wallet's signing capability through [WalletContext.tsx](./merxet-seller/src/context/WalletContext.tsx). Single-use challenges bind account, network and origin; EIP-191 signatures are checked against the current Mirror Node account key. Opaque sessions persist only token hashes. The seller's exact viem signing contract passes an integration test; UI wiring remains Phase 5. HashPack and other external wallets are deferred.
- [x] Verify catalog ownership server-side before creation and mutations. Management endpoints require the authenticated owner; other owners receive 404. Preview, source, logs and publication endpoints remain unexposed until their later phases.
- [x] Implement shop creation/listing, configuration editing, revision listing, and job submission/status endpoints. Stable UUID request IDs preserve the original mutation result across retries and restart; stale configuration versions return a conflict.
- [x] Implement private JSON and artifact storage through one coordinator. Persist accepted jobs before acknowledging them. Preserve validated record versions for recovery and verify writes through authenticated primary-endpoint reads.
- [x] Add startup scanning of persisted records and a rebuildable listing cache. The immutable operation history, completion markers and original request receipts are durable; the in-memory maps are derived.

Implemented private storage layout:

```text
builder-v1/
  operations/<sequence>-<operationId>/
    operation.json          complete record versions, request receipt and result
    commit.json             verified completion marker and operation hash
  <network>/<ownerAccount>/shops/<shopId>/revisions/<revisionId>/
    catalog-snapshot.json
    source.tar.gz
    dist/
    logs/
```

Attempt records include job ID, attempt number, selected base revision, sandbox ID, command/session references, deadlines, cancellation state, and cleanup state. Revision manifests include parent revision, template/environment/model versions, validated public configuration, artifact paths, file hashes, and validation results. Private inputs retain the merchant brief and generation context. The public configuration excludes prompts, ownership proofs, jobs, logs, and credentials.

All metadata records, including jobs, attempts, publication operations, challenges and sessions, live as complete versions inside the immutable operation history. This replaces mutable per-record files and a separately updated listing index. Artifact upload and verification precede the operation that makes a revision ready. Paths are server-derived, writes are serialized, and a completion marker is verified before acknowledgment. An uncertain write stops further work until startup reconciliation. Exactly one coordinator may use the prefix; stop and drain it before starting a replacement. A replica-count setting alone is not a distributed lock.

**Acceptance:** records and accepted jobs survive a process restart; partial uploads never become complete revisions; duplicate requests return the existing result; another owner cannot read or mutate private shop data. Internal-wallet authentication succeeds for the verified owner and rejects invalid signatures, account/network mismatches, and expired or replayed challenges.

**Phase 3 evidence:** thirteen automated checks cover HTTP management, real test-key signatures using the seller's viem signing contract, owner isolation, session/challenge boundaries, version conflicts, retries and interrupted-write recovery. Live Bunny checks recovered a private shop, queued job and retry receipt in a fresh Node process. Read-only live Sync/Mirror Node checks validated the demo seller's catalog ownership and current ECDSA key. No user wallet signature or management deployment is claimed. See the [builder evidence](./merxet-storefront-builder/EVIDENCE.md).

**Phase 4 — Automate generation, scheduling, and recovery**

Implemented startup settings:

```dotenv
MAX_CONCURRENT_BUILDS=2
MAX_CONCURRENT_BUILDS_PER_SHOP=1
```

`MAX_CONCURRENT_BUILDS` limits active attempts across all merchants handled by the coordinator. Two is the initial default, not a fixed system maximum. Increasing it to five allows up to five attempts, subject to provider capacity and operating budgets. The per-shop setting separately limits attempts for one shop; the effective capacity also respects the global limit. Validate both as positive integers.

Read these settings at startup and document the controlled restart procedure for changing them. Initially, no administration UI or live configuration reload is needed. Count provisioning through cleanup against the limit. If recovered cleanup/staged work exceeds a newly reduced limit, finish it and admit no new work until capacity is available. Incomplete generation/build commands are terminated and may use the remaining bounded retry in a fresh VM. Raising the per-shop limit requires preserving independent base revisions and explicit publication selection; it must never make the last completed draft automatically replace the live shop.

- [x] Implement `queued → provisioning → generating → building → validating → uploading → ready`, with `failed` and `canceled` terminal outcomes. Track cleanup independently so terminal jobs can still have pending resource cleanup.
- [x] Schedule the oldest eligible persisted job, skipping temporarily blocked shops. Reserve capacity before provisioning and release it only when its sandbox is confirmed stopped/destroyed or absent.
- [x] Pin each job's catalog input, prompt, source/base revision, and template version. Start a revision request from the merchant-selected draft rather than whichever build finishes last.
- [x] Give each retry a new attempt ID and VM. Accept completion only from the current authorized attempt. Keep automatic retries and model repair bounded; do not retry indefinitely on invalid output.
- [x] Enforce command deadlines, an overall attempt deadline, file/archive/output limits, and cancellation checks throughout the workflow. Record the configured values selected in phase 2.
- [x] Collect and inspect bounded source/build artifacts without executing generated code in the coordinator. Validate paths, symlinks, sizes, protected-file integrity, and required outputs before storing a ready revision.
- [x] Attempt sandbox destruction after every success, failure, cancellation, or timeout. Persist cleanup failures and retry cleanup separately from generation.
- [x] On startup, reconcile incomplete jobs with provider state before admitting replacements. Reconnect only to current attempts; terminate obsolete ones and reject late results.
- [x] Handle creation succeeding before the sandbox ID is saved, using the proven ownership convention or dedicated environment from phase 2. Cleanup must only target builder-owned resources.
- [x] Add structured status and metrics keyed by shop/job/attempt: queue wait, stage durations, active VMs, retries, output size, and pending cleanup. Keep raw private logs owner-restricted.

Run one active writer during normal operation and deployment. Configure replacement so the old coordinator stops scheduling and writing before the new coordinator resumes persisted work; overlapping replicas would violate the JSON coordination model. A second API instance that also mutates records is not a supported scaling shortcut.

**Acceptance:** with default settings, two different shops build while a third waits and same-shop requests serialize. Changing the global setting changes admitted concurrency. Inject build failure, upload failure, timeout, cancellation, duplicate submission, coordinator restart, and delayed completion; none may publish output, lose accepted work, overwrite a newer draft, or silently abandon a VM.

**Completed September 9:** 28 automated tests cover scheduling, capacity changes, cancellation, artifact/metadata failures, source/base integrity and restart fencing. The live worker produced three private ready revisions, observed two concurrent attempts plus a waiting job, repaired one browser failure in a new VM, reopened the journal to recover all results and confirmed all four VMs destroyed. The builder API was not deployed; the existing public demo was not changed. Detailed settings and operating boundaries are in [WORKER.md](./merxet-storefront-builder/WORKER.md).

**Phase 5 — Add seller management and private previews**

**Implemented September 10:** a compact fixed header above a large interactive iframe preview, with a movable, collapsible Design panel floating over the preview. The workspace is inside `merxet-seller`; no additional frontend project is needed. See [setup and preview authorization](./merxet-storefront-builder/SELLER_WORKSPACE.md) and [isolated browser checks](./tools/storefront-ui-smoke/README.md).

- [x] Add a Storefront area to [seller routing](./merxet-seller/src/main.tsx) and [navigation](./merxet-seller/src/components/Layout.tsx), with entry from the relevant catalog list/editor.
- [x] Build shop creation from an owned catalog, initial branding inputs, and a design-brief field. Reuse the seller's internal-wallet flow and add builder authentication. Require a fresh login when the wallet account or network changes.
- [x] Add the workspace header: Back to Storefronts, shop name, selected revision/draft selector, Desktop/Mobile controls, Open preview in new tab, and a Design panel toggle. Preserve access to seller navigation/account controls without stacking two tall toolbars. Clearly distinguish draft and published revisions when applicable.
- [x] Place the Design panel near the lower-left initially. Include request/revision history, current job progress, the prompt textarea and generation action. Allow dragging only from its title bar, keep it inside the visible preview workspace, and preserve normal text selection and form interaction.
- [x] Collapse the panel to a compact Design button that still indicates an active generation. Support restoring it from the header, resetting its position, and remembering position/collapse preferences locally in the browser. Clamp its position after viewport changes and keep show/collapse/reset controls keyboard accessible.
- [x] Implement dragging with native Pointer Events and pointer capture. Temporarily shield the iframe from pointer interaction during a drag, then release capture and the shield on completion or cancellation. Moving or collapsing the panel must not remount the iframe, reset its route/scroll, discard prompt text, or interrupt progress tracking.
- [x] On mobile, use a collapsible bottom sheet for the Design panel. Desktop/Mobile preview controls should change the iframe viewport width so the storefront's responsive layout can be checked; they do not emulate mobile hardware.
- [x] Before the first generation, show the selected catalog, design brief and **Generate storefront** action beside a preview placeholder. Once a draft is ready, display the compiled website with working navigation, search and product links.
- [x] Show queued/running/ready/failed/canceled status with understandable stages, elapsed time, and cancel/retry actions. Map real job progress to labels such as Waiting to start, Creating design, Checking pages and Preparing preview; avoid invented percentages or raw provider/toolchain details. Use bounded polling initially and restore durable job identity/history after reload.
- [x] Make revision requests explicitly show **Based on Draft N** and use **Generate revision**. Allow selecting an older draft as the base. Keep the current usable preview visible while the new revision builds; add a **Draft N ready — View** history entry on completion. Show failures inline with Retry while retaining the previous preview.
- [x] Render the header and Design panel as seller components outside the iframe. Load the selected revision's compiled static files through authenticated private preview delivery from Bunny artifacts. Preview availability must not depend on a live build VM or Vite server.
- [x] Serve previews on a dedicated listener/origin with iframe and response-level sandbox policies. Use an unguessable, short-lived bearer preview grant scoped to one owned ready revision and bounded by the management session's lifetime/revocation. No cookies or management credentials are given to generated code. Every artifact is checked against the manifest; expired or restarted grants can be refreshed from the workspace.
- [x] Keep HTML, configuration, routing and assets tied to the same immutable revision. Enforce preview authorization for dependent files and direct page navigation as well as the initial HTML, and exclude private responses from shared public caching.
- [x] Provide a full preview in a separate tab with the same authorization and origin isolation. Verify delivery security independently of the parent iframe's sandbox attributes.

**Acceptance:** a merchant completes create → generate → preview → request changes using the seller UI, including requesting a revision from an older draft. Generation and failure leave the previous preview usable. Dragging, collapsing and restoring the panel preserve preview route/scroll, prompt text and job progress; resizing keeps controls reachable, and the mobile bottom sheet works. Refreshing or reopening restores durable progress/history after wallet sign-in and restores local panel preferences. Desktop/Mobile sizing and protected new-tab previews work. Private artifacts, including direct routes and dependent assets, remain available after sandbox cleanup. An unrelated merchant cannot obtain a preview grant or read the artifacts without one. A current preview URL itself grants temporary read access to that revision.

Publishing and rollback are implemented in Phase 6. World and ENS integrations follow later.

**Validation:** 32 builder tests, eight existing seller tests, both TypeScript checks, the seller production build and generated-contract/build-asset checks pass. All changed seller files pass ESLint; the full seller lint run has 12 pre-existing errors in untouched files. Isolated browser checks cover the complete UI flow, active-job reload, idempotent retries, pointer/collapse state preservation, mobile behavior and wallet/preview isolation. Live generation still uses the independently verified Phase 4 worker; run the [manual testnet check](./merxet-storefront-builder/SELLER_WORKSPACE.md#validation-and-manual-acceptance) with your own catalog before treating the deployed experience as accepted.

**Phase 6 — Publish and roll back**

Use a stable public shop path such as `/s/{shopId}/` on a dedicated storefront origin; the hostname is a deployment setting. Keep approved files under immutable revision paths in the public storage zone. Implement the shared resolver in the builder codebase: it selects the published revision and returns its HTML for shop page routes. Versioned assets and public configuration are served from Bunny with paths tied to that revision. This adds a shared delivery component, not a server per merchant; the resolver remains part of live delivery even when no builds are running.

Reuse the Phase 2 prototype's verified CDN/origin configuration, router basename, build asset base and immutable asset references. Keep compiled HTML and its embedded configuration together so an open page cannot accidentally load another revision's files. Generated builds must also support the private preview path. The selected revision is read from primary storage; do not introduce a cached pointer without a corresponding invalidation strategy.

- [x] Add a merchant-triggered publish action accepting a specific ready revision. Revalidate ownership and completeness; generated code and build completion cannot invoke publication.
- [x] Record each publication operation, its previous revision, requested revision, and progress before applying changes. Copy only approved public output, verify it, and make retries safe for the same operation.
- [x] Update the resolver selection and verify public HTML, assets, configuration, and a direct product URL before reporting successful publication. Selection reads use authenticated primary storage; HTML/configuration use no-store and assets keep immutable references, so no cached pointer or pointer purge is introduced.
- [x] Preserve the previous complete revision and routing selection. If switching fails, retain or restore that selection and reconcile the operation. A failed restoration stays durable and blocks conflicting publication until recovered. Do not promise an instantaneous atomic change across every CDN cache.
- [x] Implement rollback using the same publication operation applied to a previous complete revision; reuse verified public files without rebuilding.
- [x] Add seller controls for publishing the selected ready draft, confirmation/cancellation, publication progress, the published revision label, opening the live shop, and rolling back to a previous published revision.

Static website and source downloads are outside this scope. Backups and retention management will be added later. Keep completed revisions available for publication and rollback; this milestone adds no artifact retention cleanup. Existing build sandbox cleanup remains required.

**Acceptance:** publish revision A, prepare B, confirm A remains live during generation, publish B, and roll back to A. Check the root, a direct product route, configuration, and assets after each operation. A failed upload or route switch leaves a complete working revision available.

**Implementation evidence:** 39 builder tests and eight existing seller tests pass, together with builder/seller TypeScript checks, seller production build, changed-file ESLint and generated-contract/build-asset checks. The isolated browser flow passed confirm/cancel, lost accepted-response retry with identical input/key, A → B → A publication, public product-page reload, buyer links, restored publication state and mobile controls. Tests use fixture identity/storage and the compiled template; no live Bunny publication or new model/VM build was performed. Existing public Bunny settings were reused in the builder's ignored `.env.local`, and local configuration loads successfully. Public delivery defaults to port 4184. See [PUBLISHING.md](./merxet-storefront-builder/PUBLISHING.md) for the real-provider manual check and deployment boundary.

**Phase 7 — Deployment and complete acceptance**

**Deployment implemented September 10:** the builder and isolated seller frontend are live in `Merxet/storefront-builds`; both exact deployments reached `SUCCESS` and live API/seller checks pass. The user confirmed local Bunny publication before starting this phase. Hosted records use a separate `builder-hosted-v1` prefix. See [deployment, DNS records and acceptance ledger](./merxet-storefront-builder/DEPLOYMENT.md). DNS and live HTTPS delivery checks pass. Full hosted merchant/buyer acceptance remains open.

- [x] Configure the builder service, dedicated sandbox environment, private/public storage zones, allowed application origins, credentials and pilot limits. Keep credentials in server configuration and out of template assets and VM inputs.
- [x] Activate the configured private-preview/public-shop custom domains and verify live HTTPS delivery after DNS setup. Both health endpoints returned 200 and the unknown public shop returned 404.
- [x] Add a health/readiness check, startup reconciliation, controlled shutdown, and a deployment procedure that prevents simultaneous coordinators. Verify the exact Railway deployment reaches success and then check live HTTP behavior. The mounted Railway volume and startup guard enforce exclusive replacement for this service; unrelated coordinators must still use different prefixes.
- [x] Run focused unit/integration checks for schemas, price precision, buyer-link encoding, ownership, queue limits, state transitions, idempotency, artifact completion, publication recovery, and cleanup recovery. All 41 builder tests and generated-contract/build-asset checks pass.
- [x] Run maintained-template browser checks: loading/errors, search/collections, direct routes and refresh, removed products, buyer links/QR, keyboard navigation and the top mobile menu at 390x844. All 17 applicable checks pass, including the compiled deployment path; one desktop-only mobile-menu case is intentionally skipped.
- [ ] Complete the same browser acceptance against real generated output on the hosted preview and public origins.
- [ ] Exercise two independently owned shops with distinct catalogs and designs. Confirm independent records, sandboxes, previews, published routes, and rollback history.
- [ ] Complete a selected-product flow through the existing buyer app's cart, payment approval, and order process in the supported test environment. Record the result without treating untested networks as supported.
- [x] Record the Continuity baseline and the new work separately: pre-existing catalog/MCP/buyer/order capabilities versus new storefront template, AI customization, sandbox builder, revision storage, and publication. See [Continuity implementation record](./MERXET_STOREFRONTS_CONTINUITY.md). Keep World and ENS out of this delivery milestone; submission commit/date evidence remains to be attached when preparing the entry.

**Definition of done:** a merchant can generate and revise a real shop from an owned catalog, preview it after the build VM has been destroyed, publish a selected revision, and restore a previously published revision. Another merchant can do the same concurrently within configurable limits. Current catalog data and existing buyer links work, and failures preserve the last usable shop and durable job history.

**Phase 1 implementation evidence (before extraction):** [template README](./merxet-storefront-template/README.md), [generation guide](./merxet-storefront-template/template/generation-guide.md), [template manifest](./merxet-storefront-template/template/template-manifest.json), and [browser checks](./merxet-storefront-template/tests/storefront.spec.ts). The promo build and lint pass. The automated suite passed 17 applicable checks on desktop, at 390x844, and against a dedicated compiled shop under `/s/template/`; its desktop-only skip is the mobile-menu case, which passes in the mobile project. A separate browser check loaded the public demo catalog and current prices, then followed the olive-oil product link into the existing buyer app, which displayed the matching product and 3.5 HBAR price. No Railway sandbox or public deployment was created in this phase.

**Standalone extraction evidence (September 9, 2026):** `merxet-storefront-template` installs from its own lockfile and builds without sibling imports. Both projects pass production builds (including TypeScript checking) and lint. The relocated storefront suite passed 17 applicable checks, including mobile and compiled deployment-subpath coverage; the desktop mobile-menu case remains intentionally skipped. The separate promo suite passed both desktop and mobile URL regression checks. The existing dependency versions were preserved, the template manifest is now version 1.1.0 with its refreshed lockfile hash, and the storefront pages and generation contract exist only in the new project.

**Remaining Phase 7 work:** complete hosted acceptance with independently owned shops, and finish a Testnet purchase in the existing buyer app. The builder and isolated seller deployments and their live API/seller checks are complete. Follow [DEPLOYMENT.md](./merxet-storefront-builder/DEPLOYMENT.md). Downloads are outside scope; backups and retention management are deferred.
