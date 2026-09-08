# Merxet Storefronts: Implementation Overview

Prepared September 8, 2026. This is a proposed architecture and delivery sequence. Existing catalog browsing and buyer-app links are already implemented; storefront customization and the builder described below are proposed additions.

Railway VM-based Sandboxes are the selected build environment. The user confirmed enabling access on September 8, 2026. The first integration milestone will validate the create/build/collect/destroy flow; no sandbox build has been run as part of this documentation update.

The product is an AI-assisted builder for individual merchant shops. A merchant selects an existing Merxet catalog, describes the desired shop, previews a generated design, requests changes, and publishes an approved revision. Shops provide branded product browsing and open selected products in the existing Merxet buyer app. The buyer app provides the cart, checkout, wallet approval, and order flow.

**Recommended project layout.** Evolve `merxet-promo` into the customizable storefront application and add one new sibling project, `merxet-storefront-builder`. Keep the merchant interface in the existing seller portal. The promo project already supplies catalog loading, product presentation, price display, and buyer-app links/QR codes. Its prepared source also serves as the template for generated shops. Keep those helpers in the promo project; extract a shared library only when reuse justifies it. The builder can have an independent build and release within the existing repository.

| Project | Responsibility | How it runs |
| --- | --- | --- |
| `merxet-promo` (extend existing) | Retain catalog loading, price display, and buyer-app links/QR codes. Add merchant branding, homepage sections, collection/product grids, product detail navigation, and a defined set of presentation files the agent may edit. Include sample catalog fixtures and generation instructions. | Continues as the catalog application and provides the versioned template source for each generated shop. Each published shop revision produces static website files. |
| `merxet-storefront-builder` (new) | Storefront ownership and metadata, generation requests, revision history, previews, publishing, exports, and public shop metadata. | One Node.js/TypeScript backend on Railway, with a single active API/coordinator and job queue. It creates a fresh Railway VM sandbox for each attempt, collects results, and controls Bunny writes and publication. |

A generated shop starts from a pinned snapshot of the prepared promo source. The agent customizes a copy in its attempt's sandbox workspace, and the builder stores the resulting source and build artifacts as a shop revision. Generation does not edit the maintained promo source or another merchant's shop. The build worker is temporary execution inside that sandbox, not another permanent app per merchant. A shop does not require a manually maintained repository or an always-running application server per merchant. A future export can give a merchant their own source repository.

**Relationship to existing projects.** Implement the storefront presentation in the existing promo project, separating catalog loading and buyer-link helpers from agent-editable pages and styles. Preserve the current catalog URL formats and keep the flipbook/swipe layout available while adding the storefront layout.

| Existing project | Planned involvement |
| --- | --- |
| `merxet-seller` | Add a Storefront area: choose a catalog, enter a design brief, generate, inspect progress, preview, revise, publish, and view revision history. |
| `merxet-promo` | Existing browsing application and the source template for AI-generated shops. Add customizable merchant presentation alongside the current flipbook/swipe layout. |
| `merxet-frontend` | Existing buyer application: open a product using its current link format, let the buyer add it to the cart, and handle checkout, wallet approval, encryption, and orders. No new cart receiver or checkout implementation is planned. |
| `merxet-sync` | Continue resolving Hedera catalog identity and catalog URLs. Add narrow read support only where the storefront requires it. |
| `merxet-order-protocol` | Reuse applicable identifiers and data definitions. The storefront does not introduce a new order or cart-handoff protocol. |
| `merxet-smartcontract` | Existing source of catalog ownership and order settlement. No contract migration is planned for the browsing and generation milestone. |
| `merxet-mcp`, `merxet-x402-server` | Existing capabilities outside the new generation workflow. Preserve compatibility with existing catalogs. |

The current promo app resolves a catalog from its seed and links individual products to the buyer app. Its QR format contains catalog, product, and network identifiers. The buyer app already decodes those identifiers and opens the matching product details page. Reuse this exact entry flow. Relevant source: [promo catalog client](./merxet-promo/src/lib/syncService.ts), [product links and QR display](./merxet-promo/src/components/ProductPageMobile.tsx), [product link format](./merxet-promo/src/lib/qrCodeUtils.ts), and [buyer link receiver](./merxet-frontend/src/components/UrlParserAndRedirector.tsx).

**Overall flow.** The builder generates and publishes a shop; public browsing and checkout continue working after the generation job has finished.

```mermaid
flowchart TD
    Seller[Merchant in seller portal] --> Builder[Node.js builder API and coordinator]
    Builder --> Records[Private Bunny JSON records and artifacts]
    Builder --> Queue[Queue: two concurrent attempts]
    Queue --> SandboxA[Railway VM sandbox: Shop A]
    Queue --> SandboxB[Railway VM sandbox: Shop B]
    Promo[Versioned promo source and clean build environment] --> SandboxA
    Promo --> SandboxB
    SandboxA --> Collect[Builder collects and validates results]
    SandboxB --> Collect
    Collect --> Records
    Collect --> Cleanup[Destroy attempt sandbox]
    Collect --> Preview[Preview from stored build files]
    Preview --> Review[Merchant review]
    Review --> Publish[Publish approved revision]
    Publish --> Shop[Hosted static storefront]
    Shop --> Sync[Merxet Sync and live catalog]
    Shop -->|Existing product link or QR| Buyer[Existing Merxet buyer app]
    Buyer --> Cart[Existing cart and checkout]
    Cart --> Hedera[Hedera orders and escrow]
```

**Storefront data and ownership.** Give each shop a stable ID, network, owner wallet, display name, catalog reference, and published revision. Keep storefront identity separate from its current generated design. The builder verifies wallet ownership for creation, editing, generation, and publication, including that the merchant controls the linked catalog.

Start with one existing catalog per shop. Collections can group products within that catalog. Scope storefront product references by network, catalog, and product ID so each link opens the intended product. Multiple catalogs can follow as a browsing extension; payment and cart rules belong to the buyer application.

Store each revision's parent revision, merchant prompt, public catalog snapshot reference, template version, source archive, build result, and preview location. Record generation jobs and publication selection separately from completed revisions so a failed or canceled attempt cannot replace the live shop. Use JSON documents in Bunny Storage for metadata, alongside stored source, images, logs, and built websites. The initial implementation does not require a SQL database.

**Metadata and artifact storage.** Keep management records, prompts, source archives, and build logs in a private Bunny storage zone. Publish only approved website files and public assets through a separate zone connected to a CDN Pull Zone. Access private previews through the builder's authenticated preview flow on a separate origin.

Use one `shop.json` per shop, one `jobs/{jobId}.json` per generation job, and one immutable `revisions/{revisionId}/revision.json` per completed revision. The shop record contains ownership, catalog binding, settings, and the published revision ID. Revision manifests reference their source archive, catalog snapshot, and built files. Include a schema version in JSON records. Organize shops under network and owner-wallet prefixes so the seller portal can list that owner's shops without maintaining a single global metadata file. Any search/listing cache is rebuildable from these records.

Run one active coordinator that serializes changes to each shop and its job records. Sandbox attempts report results through that coordinator instead of independently updating shop metadata. Persist an accepted job before acknowledging it. Persist attempt identity, sandbox ID, command session IDs where available, deadlines, and cleanup state as the attempt progresses. On restart, reconcile unfinished records with their known sandboxes before scheduling replacement work. Deployments must stop the previous coordinator before enabling writes in its replacement. A local lock cannot coordinate multiple active service replicas. Serializing metadata writes still permits different shops to build concurrently.

Use authenticated reads from the storage zone's primary endpoint for editing and publication decisions, rather than cached CDN responses. Bunny's HTTP documentation describes file upload, download, and directory listing, but does not establish conditional overwrite guarantees; do not assume database-style transactions or compare-and-swap writes. Validate overwrite visibility and interrupted-upload recovery in the storage prototype. If multiple independent coordinators become necessary, revisit the coordination mechanism or database choice. [Bunny HTTP storage documentation](https://bunny.net/docs/storage/http)

Upload and verify a revision's complete artifacts before writing its completed manifest or selecting it for publication. Preserve completed revisions, make publication retries safe for the same revision, and keep backups of metadata and source exports. Retention cleanup must preserve live revisions and those offered for rollback. Worker disk is temporary workspace; records and artifacts required after a restart belong in Bunny Storage.

**The template and agent contract.** Prepare the existing promo application for customization before automating generation. Keep its current toolchain and dependency lockfile for reproducible generated builds. Separate the catalog loading currently embedded in `HomePage` from its flipbook/swipe presentation so shop layouts can use the same data. Preserve existing price formatting, buyer-app buttons, QR codes, and loading/error behavior. Add merchant branding in place of fixed demo copy for storefronts, a shop header, homepage sections, collection/product grids, product detail navigation, and responsive shop navigation. Include shop titles and share metadata in published output; fuller search indexing can follow.

The [template specification](./MERXET_STOREFRONT_TEMPLATE_SPEC.md) describes package choices, page components, public configuration, editable source boundaries, hosting requirements, and validation.

Here, "template" means a prepared, versioned starting point within `merxet-promo`. It is a role of the existing project, with documented editable files and sample catalog fixtures. A separate template project is unnecessary for the initial implementation.

The agent receives the merchant's brief, public catalog data, supplied branding assets, template source, and instructions identifying editable presentation files. It can change layout code, styles, section composition, and shop copy grounded in the supplied information. The initial generation contract keeps dependency versions, build commands, catalog identity, and buyer-app link generation under platform control. Validate changed paths and dependency manifests before accepting an output.

Product cards bind to catalog IDs and load current names, descriptions, images, prices, and assets. A generation-time snapshot helps the agent design the shop; it is not the live pricing source. Price changes should appear without regenerating the design, subject to a defined cache refresh policy. Removed products must become unavailable, and new products appear through the shop's live catalog listing. Featured sections retain explicit product references.

**Buyer-app entry.** Each product offers an ordinary link to the existing buyer app and a QR representation of the same URL. Reuse the promo helper that combines the catalog seed, product ID, and network into the buyer app's supported URL fragment. The buyer application opens the product details page, where the customer chooses quantity, adds it to the existing cart, and completes checkout.

The storefront displays products and directs buyers to that flow. It does not maintain a second basket, transmit a cart payload, collect delivery details, connect a payment wallet, or create orders. No cart-handoff API, temporary cart storage, or new buyer-app route is required. Acceptance checks should confirm that generated links use the configured official buyer-app origin and resolve the correct product and network.

**Generation and preview.** Implement generation as a background job: queued, provisioning, generating, building, validating, uploading, ready, failed, or canceled. The seller portal should show progress, allow cancellation, and preserve the last usable revision when a job fails. A revision request should start from the selected draft, retaining its catalog binding and version history. Each retry gets a new attempt ID and sandbox; only the currently accepted attempt can produce the job's ready revision.

The agent/model remains selectable after the template-generation trial. Keep model requests and credentials in the trusted builder, and route workspace edits and code execution through a Railway sandbox adapter. Treat catalog descriptions as input data rather than agent instructions. Keep Railway management, Bunny, wallet, and deployment credentials out of generated source and sandboxes; the builder alone controls storage and publication. Serve generated previews and shops on origins that do not receive seller-portal or buyer-wallet credentials.

**Railway sandbox execution.** Integrate Railway's TypeScript SDK in the builder backend behind a small adapter for creating sandboxes, transferring files, running commands, inspecting results, and destroying sandboxes. Scope every operation to the configured Railway environment and the attempt's explicit sandbox ID. If the CLI is used for the prototype, always specify the sandbox ID rather than relying on its shared active-sandbox setting. [Railway Sandboxes](https://docs.railway.com/sandboxes), [Railway sandbox CLI](https://docs.railway.com/cli/sandbox).

Prepare a clean, versioned Railway template or checkpoint with Node.js, the promo dependency lockfile, installed dependencies, and browser-check tooling. Key the environment version to the toolchain and lockfile. Each attempt starts from that clean base and receives only its own source, public catalog snapshot, and supplied assets. Merchant workspaces must never become the shared base for subsequent jobs. The sandbox base is a build cache; durable shop source and results remain in Bunny.

Start with two active attempts globally and one active attempt per shop. Additional requests remain queued. The coordinator owns these limits, including provisioning, result collection, and cleanup; it does not release a slot for reuse while the old sandbox is still running. Use configurable command timeouts, an overall attempt deadline, output-size limits, and a bounded retry count. Establish concrete time and output budgets during the template trial, and check which VM resource controls the current Railway interface exposes before assigning CPU/memory settings.

Use Railway's `ISOLATED` network mode with no access to the project's private services. This mode still allows outbound internet traffic. The builder supplies inputs and retrieves outputs through the files API. Configure the provider idle timeout within the account's allowed range and maintain the required interaction during long jobs; a running process alone does not prevent idle destruction. Explicit command and attempt deadlines remain separate from that idle timeout. [Railway networking and timeout behavior](https://docs.railway.com/sandboxes#networking).

For each attempt, create the sandbox, record its identity, apply the source changes, run the fixed type/lint/build checks, then run browser validation inside the sandbox. Inspect command exit codes, timeout status, and output truncation explicitly. The build process creates `dist/`; the builder then retrieves bounded source/build archives and logs, validates their paths and sizes, uploads them to Bunny, and records the completed revision. A sandbox result cannot select the published revision.

Always attempt sandbox destruction after success, failure, timeout, or cancellation. Retain unfinished cleanup records and reconcile builder-owned orphan sandboxes after restarts, including the case where creation succeeded before its ID was saved. Track that ownership through provider metadata or a dedicated execution environment; never clean up unrelated Railway sandboxes. Reattach to a recorded command only when its attempt is still current; otherwise terminate it before retrying. Duplicate requests and late results must not create another accepted revision or overwrite newer work.

Before presenting a ready draft, run the build and focused browser checks for mobile layout, catalog rendering, product navigation, and buyer-app links/QR codes. Build success alone does not demonstrate a working shop. Preserve failure evidence and allow a bounded repair attempt or a fresh merchant revision.

Railway sandboxes do not provide a public website endpoint. The seller's preview therefore uses collected static artifacts from Bunny through the authenticated preview service. After collection, the sandbox can be destroyed while the merchant continues reviewing the draft. [Railway sandbox connectivity](https://docs.railway.com/sandboxes#reaching-a-port-in-a-sandbox).

**Hosting and publishing.** Initially publish static builds to shared Merxet hosting backed by Bunny Storage and CDN. Keep each validated build immutable and map a stable shop address to the selected published revision. A small resolver reads that selection from shop metadata and directs requests to the revision's files. Publication and rollback update the selection and refresh routing caches; changing JSON alone does not configure CDN routing. If routing propagation fails, retain the previous working route and retry the switch. A generation worker cannot publish its own output.

The template's asset paths and page routing must support its chosen deployment URL, including direct links to product pages. Vite provides static build output and configurable deployment paths; use a static host for public shops. Its preview server is intended for local build inspection. [Vite deployment documentation](https://vite.dev/guide/static-deploy.html)

After hosted publication works, provide a static website export and a reproducible source export with its manifest and lockfile. A later deployment to a merchant domain may require rebuilding for that base path. Custom-domain automation and self-hosting documentation follow the core milestone. Self-hosted storefronts use Merxet's public catalog data and link customers to the existing buyer app.

**Delivery sequence.** Extend the promo application into a customizable shop, prove agent customization of a source copy, then add the automated builder around it.

| Phase | Work | Completion evidence |
| --- | --- | --- |
| 1. Prepare promo for storefronts | Define shop metadata, separate promo catalog loading from presentation, and add merchant branding and a shop layout. Preserve price display and buyer-app links. | Responsive shop with live products; existing promo URLs still work; a link or QR opens the correct product in the existing buyer app. |
| 2. Sandbox and agent feasibility | Prepare the clean Railway build environment. Create a sandbox, customize the template for a catalog and brief, build and validate it, collect artifacts, and destroy the sandbox. Repeat for a second merchant. | Two distinct designs pass the same checks; files belong to the intended attempt; artifacts remain available after sandbox destruction. This determines the initial model choice and build budgets. |
| 3. Merchant builder | Add Bunny JSON job/attempt/revision records, the single coordinator and queue, Railway sandbox lifecycle integration, and the seller portal's prompt/preview/revise interface. | Two different shops can build concurrently; a third queues; same-shop requests serialize. Failure, cancellation, duplicate requests, restart recovery, and cleanup preserve previous work. |
| 4. Publication | Add stable hosted addresses, explicit revision publication, rollback, and basic artifact export. | An approved shop is reachable publicly; a failed revision leaves it intact; rollback restores a previous build. |
| 5. End-to-end validation | Check cross-merchant isolation, current catalog data, direct links, existing catalog/QR compatibility, and a purchase through the existing buyer app. Record the new work for Continuity. | Two separately owned, differently branded shops work on desktop and at 390x844. A selected product opens in the buyer app and follows its existing cart, payment, and order flow. |

The first code milestone should extend `merxet-promo` and demonstrate one merchant shop using an existing catalog. Then prove the agent can produce two different designs from copies of that source in Railway Sandboxes. After the feasibility trial, create `merxet-storefront-builder` to automate the queue, sandbox lifecycle, revision management, and publication. The initial plan needs one new project; a separate template project or core library can be considered only if a concrete maintenance or reuse need emerges.

**Scope boundary.** World Selfie Check, ENS, a shared marketplace, automated custom domains, fully independent backend hosting, product variants, inventory reservations, and new MCP functionality are later extensions. Keep a stable shop identity so future verification and naming integrations can attach to it. A storefront cart and replacement checkout are not part of this plan; purchases use the existing buyer application.

**Decisions to settle during the foundation phase.** Confirm the initial public shop URL format and wallet-authenticated shop management flow. When introducing the builder, configure private/public Bunny zones, metadata schemas, backup and retention rules, and the single-coordinator deployment flow. Railway Sandboxes are selected and access is user-confirmed enabled; configure the execution environment, clean template/checkpoint, adapter version, deadlines, and cleanup ownership during the feasibility trial. Select the agent/model after that trial. The buyer-app URL format already exists and can be reused as-is.
