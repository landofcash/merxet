# Merxet x402 Project Change Map

## Revised Project Summary

| Project | Status | Responsibility |
| --- | --- | --- |
| `merxet-order-protocol` | New | Normative envelopes, schemas, canonicalization, HCS codec, ABI fragments |
| `merxet-x402-server` | New | Signed quote authority, separate quote/confirmation endpoints, and sync-backed verification |
| `merxet-mcp` | New | Codex-facing tools, frontend approval handoff, sync polling, and paid confirmation |
| `merxet-sync` | Expanded change | Public order/transaction evidence API plus HCS v2 decoding |
| `merxet-frontend` | Expanded change | Existing browser wallet plus agent-order approval and Hedera settlement |
| `merxet-seller` | Compatibility validation | Confirm existing HFS decryption compatibility only |
| `merxet-smartcontract` | No change | Existing catalog, escrow, and order state |
| `merxet-promo` | No change | Outside the order-payment path |

There is no `merxet-agent-wallet` project in version 1.

## Why the Endpoint Is Not in `merxet-seller`

`merxet-seller` is a Vite/React browser application. It has no trusted server
runtime in which to hold the quote-signing key, perform SSRF-safe catalog
fetching, or expose an x402 resource endpoint.

Therefore:

- Keep the seller UI independently deployable.
- Put the endpoint in `merxet-x402-server`.
- Route the public POST path to that service at the API gateway.
- Continue routing public read/index traffic to `merxet-sync`.

## New Project: `merxet-order-protocol`

### Purpose

Side-effect-free shared protocol types and validation. It prevents wire-format
drift without placing all x402 behavior in one runtime.

### Planned modules

```text
merxet-order-protocol/
  package.json
  package-lock.json
  tsconfig.json
  src/
    constants.ts
    schemas/
      orderRequest.ts
      deliveryDetails.ts
      encryptedDelivery.ts
      quote.ts
      quoteReference.ts
      paymentRequired.ts
      paymentPayload.ts
      settlementResponse.ts
      approvalHandoff.ts
      trustedProfile.ts
      publicOrderEvidence.ts
    canonical/
      json.ts
      hashing.ts
    jws/
      quoteJws.ts
    hedera/
      ids.ts
      hcsEnvelope.ts
      transactionProof.ts
    abi/
      merxet.ts
      htsApprove.ts
    fixtures/
      quote/
      x402/
      encryption/
      hcs/
      hedera/
```

### Runtime dependencies

```text
@x402/core
canonicalize
jose
zod
```

- `@x402/core` supplies the standard x402 v2 envelopes and HTTP header
  encoding/decoding; `merxet-order` remains a custom scheme implemented here.
- `canonicalize` is the only RFC 8785 implementation used across Node and the
  browser.
- `jose` supplies Ed25519 JWS primitives. `quoteJws.ts` owns the exact detached
  compact wrapper and validates the restricted `alg`, `typ`, `kid`, and `crit`
  profile.
- Zod schemas validate every untrusted wire object before canonicalization or
  hashing.

TypeScript and Vitest are development dependencies. Native Web Crypto supplies
SHA-256, AES-256-GCM, and secure randomness; no additional crypto or hashing
package is planned.

### Included

- Full x402 v2 `PaymentRequired`, `PaymentPayload`, and
  `SettlementResponse`.
- `merxet-order` quote, proof, and handoff schemas.
- Discriminated HBAR/HTS payment quote variants (`tokenEvmAddress = null` for
  HBAR).
- `MerxetDeliveryDetailsV1`.
- Normative UTF-8 field limits, 1-100 items, quantity limits, 64 KiB decoded
  delivery ciphertext, and 128 KiB decoded quote-request limit.
- `MerxetEncryptedDeliveryV1`, per-order handoff-key encoding, and canonical
  AES-256-GCM AAD.
- RFC 8785 canonicalization and hashes.
- Detached Ed25519 quote JWS contracts.
- Trusted frontend quote-key keyring indexed by `kid`, including rotation
  overlap and old-key retention rules.
- Canonical seller identity encodings: Hedera account ID, lowercase Solidity
  address, and standard Base64 compressed secp256k1 encryption key.
- Canonical Hedera account, token, and transaction proof formats.
- HCS v1 decoder and HCS v2 encoder/decoder.
- Merxet and HTS ABI fragments.
- Fixed cross-project compatibility fixtures.

### Excluded

- HTTP servers and routes.
- MCP transport.
- Browser storage and UI.
- Wallet secrets or signing.
- Catalog network fetching.
- Mirror Node/RPC clients.
- Transaction submission.

## New Project: `merxet-x402-server`

### Purpose

Public resource server, quote authority, and read-only settlement verifier.

### Planned modules

```text
merxet-x402-server/
  package.json
  package-lock.json
  tsconfig.json
  src/
    server.ts
    config.ts
    middleware/
      cors.ts
      errors.ts
    routes/
      orders.ts
      quotes.ts
    quotes/
      quoteBuilder.ts
      quoteStore.ts
      redisQuoteStore.ts
      inMemoryQuoteStore.ts
      quoteSigner.ts
    delivery/
      deliveryEnvelope.ts
      deliveryDecryptor.ts
      pilotDelivery.ts
    catalogs/
      catalogClient.ts
      catalogValidator.ts
      priceCalculator.ts
    x402/
      paymentRequired.ts
      paymentPayload.ts
      verifier.ts
      settlementResponse.ts
    clients/
      merxetSyncClient.ts
    __tests__/
```

### Responsibilities

- Expose `POST /api/v1/testnet/order-quotes` for initial quote creation.
- Expose keyless
  `POST /api/v1/testnet/orders/:orderSeed/confirm` for x402 confirmation.
- Accept MCP-generated `orderSeed`, catalog/item selection, an AES-GCM
  encrypted delivery envelope, and a transient per-order delivery key.
- Validate and decrypt delivery details only to validate the shared schema and
  assign the fixed pilot delivery option with amount `0`.
- Fetch and validate the catalog through configured HTTPS origins.
- Reject mixed assets and unsupported tokens.
- Calculate exact canonical amounts.
- Validate the MCP-generated random 22-character `orderSeed`.
- Treat `orderSeed` as the quote identifier.
- Store immutable quotes by `(network, orderSeed)` in Redis with atomic
  create-only semantics and bounded TTL.
- Sign quote digests using a maintained JOSE library, the configured Ed25519
  key, and the normative detached-JWS signing input.
- Expose `POST /api/v1/testnet/order-quotes/resolve`.
- Return the complete immutable `PaymentRequired`, signed quote, and encrypted
  delivery envelope by `orderSeed`, without returning the delivery key or
  plaintext.
- Return complete x402 v2 `PAYMENT-REQUIRED`.
- Validate paid confirmations without accepting `deliveryKey` or the original
  commerce request body.
- Use `merxet-sync` as the sole successful order and outer-batch evidence
  source; missing association returns `503 proof_pending`.
- Fail with `503` and `Retry-After` when `merxet-sync` is unavailable during
  initial seed collision checking or paid confirmation.
- Return the current public order state while that order and retained quote
  remain available.

### Runtime dependencies

```text
express
cors
redis
@merxet/order-protocol
```

The server uses the official `redis` Node.js client, native Node 22 `fetch`,
and Web Crypto. It does not initially add `@x402/express`, facilitator
middleware, an x402 Hedera `exact` package, a relational database driver,
SQLite binding, ORM, RedisJSON module, or file-backed persistence library.
The in-memory implementation is limited to unit tests and explicitly selected
local development; deployed environments use `RedisQuoteStore`.

### Security

- No buyer private key or generic signing API.
- No server-funded Hedera operator.
- Quote-signing key loaded only from server secret configuration.
- HTTPS-only, allowlisted, SSRF-safe catalog fetching.
- Immutable Redis seed-keyed quote store with collision and overwrite
  rejection through atomic `SET NX`.
- Mainnet rejected in version 1.
- Plaintext delivery details and raw delivery keys are transient and never
  cached, logged, echoed, or returned.
- Do not claim physical secure erasure in JavaScript; release references after
  quote construction and overwrite mutable buffers where practical.
- Redis keys use
  `merxet:x402:quote:<network>:<orderSeed>` and contain only the immutable
  signed quote, `PaymentRequired`, verification fields, and authenticated
  encrypted delivery envelope.
- Redis MUST NOT contain the delivery key, plaintext delivery details, wallet
  secrets, or quote-signing private key.
- The signed quote binds the fixed zero-cost pilot delivery option, canonical
  plaintext delivery hash, and complete encrypted-envelope hash.
- Each quote receives a TTL covering its remaining quote lifetime plus the
  bounded 24-hour post-expiry recovery window, normally 87,000 seconds at
  creation. No permanent tombstone is added.
- Redis is used for quote availability only. It is not authoritative order
  storage and does not introduce a durable `payment-identifier` idempotency
  ledger.
- Version 1 does not retain permanent deleted-order or seed tombstones and
  does not guarantee confirmation after deletion, quote-recovery expiry, or
  later seed reuse.
- Redis connection credentials are secret configuration and production
  connections use the security settings supplied by the managed Redis service.
- Redis failure returns `503` with `Retry-After`; deployed instances do not
  fall back to independent memory caches. An absent/expired key returns `404`.
- CORS allows `Content-Type, PAYMENT-SIGNATURE` and exposes
  `PAYMENT-REQUIRED, PAYMENT-RESPONSE`.

### Tests

- HBAR and HTS quote fixtures.
- Catalog validation, mixed assets, prices, totals, and timeout.
- Quote canonicalization, digest, JWS, trusted `kid`, and expiry.
- AES-GCM envelope/key/AAD validation, fixed zero-cost pilot delivery,
  authentication failure, transient key disposal, and retrieval redaction.
- Redis/on-chain seed collision, `SET NX` behavior, immutable retrieval, TTL,
  expiry/eviction, connection loss, and cross-instance access.
- Complete envelope/header encoding and HTTP outcomes.
- Separate quote/confirmation routing, key prohibited on confirmation, exact
  confirmation resource binding, and no quote-request retry.
- Sync pending, missing order, mismatched buyer/asset/amount/catalog, and
  successful confirmation.
- Read-only proof replay while the retained quote and current order exist;
  deletion and post-retention replay are not guaranteed.
- CORS, configured origins, and mainnet rejection.

## New Project: `merxet-mcp`

### Purpose

A local STDIO MCP server for Codex. It coordinates the x402 resource server
and the existing browser wallet without holding keys or exposing signing.

Publish as a versioned npm package:

```text
@merxet/mcp
```

### Runtime dependencies

```text
@modelcontextprotocol/sdk
zod
@merxet/order-protocol
qrcode (optional)
```

Use the stable MCP SDK v1 line and `StdioServerTransport`. The optional
`qrcode` dependency generates an MCP image content block locally; the tool
always returns the approval URL as the required fallback. The MCP uses native
Node 22 Web Crypto and does not require another AES, hashing, Base64URL, HTTP,
or wallet library.

Codex installation:

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

### Planned modules

```text
merxet-mcp/
  package.json
  package-lock.json
  tsconfig.json
  src/
    config.ts
    server.ts
    tools/
      createMerxetOrder.ts
      getMerxetOrderStatus.ts
    handoff/
      approvalHandoff.ts
      approvalUrl.ts
      deliveryEncryption.ts
      qrCode.ts
    clients/
      x402ServerClient.ts
      merxetSyncClient.ts
    orchestration/
      orderFlow.ts
      pendingIntentStore.ts
      paymentProof.ts
    __tests__/
```

### MCP tools

`create_merxet_order` accepts:

- Catalog seed.
- Public item selection.
- Structured plaintext delivery details matching
  `MerxetDeliveryDetailsV1`.

It returns:

```ts
{ status: "approval_required", intentId, orderSeed, approvalUrl, expiresAt }
{ status: "confirmed", order }
{ status: "failed", code, message }
```

The URL is mandatory. The tool MAY also attach a QR-code image content block
encoding the exact URL; clients that do not render MCP images use the URL.

`get_merxet_order_status` accepts an MCP intent ID and returns:

```ts
{
  status:
    | "awaiting_settlement"
    | "proof_pending"
    | "confirmed"
    | "expired"
    | "failed";
  orderSeed: string;
  order?: PublicMerxetOrder;
}
```

Without a browser callback, MCP does not distinguish an unopened approval from
an in-progress frontend transaction. Both are `awaiting_settlement` until
public evidence appears.

### Responsibilities

- Validate delivery details without silently rewriting values.
- Generate a new random `orderSeed`, 32-byte delivery key, and 12-byte nonce.
- Encrypt RFC 8785 canonical delivery JSON with AES-256-GCM and AAD bound to
  version, network, and `orderSeed`.
- Send selection, encrypted delivery, and transient key to the x402 server
  over HTTPS.
- Validate the expected server, scheme, version, network, and resource.
- Build a minimal `MerxetFrontendApprovalHandoffV1` containing version,
  network, `orderSeed`, and `deliveryKey`.
- Encode it in the fragment under the configured official frontend approval
  route and optionally render a QR code for the exact same URL.
- Return the approval URL without opening or approving it.
- Persist only the request commitment, selected requirements, quote reference,
  encrypted envelope, order seed, and confirmation status. Do not persist the
  raw delivery key; after restart MCP can confirm settlement while Redis
  retains the quote, but it cannot regenerate a lost approval URL.
- Discard its separate plaintext delivery-details object immediately after
  encryption.
- Poll `merxet-sync` for authoritative order and transaction evidence.
- Construct `PaymentPayload` from the originally selected requirements and
  indexed public buyer/outer-batch evidence.
- Call the exact keyless confirmation resource with `PAYMENT-SIGNATURE`.
- Return confirmed public order data.

The returned approval URL/QR contains only the network, `orderSeed`, and
per-order delivery key. The agent already saw the plaintext as tool input, but
the quote cache and retrieval response contain only ciphertext. MCP MUST NOT
send plaintext or the key to sync, analytics, logs, or unrelated tool results.

### Prohibited capabilities

- Raw message or transaction signing.
- Arbitrary transaction submission.
- Browser wallet unlock.
- Wallet-password forwarding.
- Private-key, mnemonic, seed-signature, plaintext seller-facing order
  payload, wallet AES-key, or encrypted seller-key reads. The per-order
  delivery handoff key is the sole permitted non-wallet key.
- Direct access to the frontend wallet adapter.
- Trusted-profile mutation.

### Tests

- Full initial `402` orchestration.
- Seed/key/nonce generation, AES-GCM/AAD fixtures, minimal URL/QR handoff,
  invalid key/seed fragments, and configured frontend origin.
- Delivery/key validation and log/result redaction.
- Approval-required, sync pending, restart/resume, and expiry.
- Redis outage and missing/expired quote behavior; an already-created order
  remains discoverable through sync even if its quote is no longer retained.
- Public evidence to `PaymentPayload` construction.
- Paid confirmation and proof replay.
- MCP schema snapshots proving no generic signer or wallet secret is exposed.

## Changed Project: `merxet-frontend`

### Purpose

The existing frontend becomes the browser signing and human-approval boundary
for agent-created orders. It continues to own its built-in wallet; no separate
wallet application is created.

Detailed design:

- `MERXET_FRONTEND_WALLET_INTEGRATION.md`

### Planned modules

```text
merxet-frontend/src/
  pages/
    AgentOrderApprovalPage.tsx
    AgentOrderResultPage.tsx
  lib/
    agentOrders/
      approvalHandoff.ts
      quoteClient.ts
      quoteValidator.ts
      quoteJws.ts
      deliveryEnvelope.ts
      agentOrderExecutor.ts
      agentOrderStore.ts
```

### Responsibilities

- Add `/agent-orders/approve`.
- Parse and validate the minimal seed/key fragment handoff.
- Hold the validated browser intent/key in volatile session state and clear
  the fragment with `history.replaceState` before requesting wallet unlock.
  Persist the key only inside the encrypted execution record if post-approval
  recovery requires it.
- Require configured official frontend, quote, and resource origins.
- Fetch the full quote and encrypted delivery envelope from the fixed
  configured-origin resolution endpoint using `orderSeed`.
- Verify quote digest, detached Ed25519 JWS, trusted `kid`, request hash,
  resource, network, contract, topic, asset, amount, and expiry.
- Verify the signed encrypted-envelope hash, decrypt using the fragment key,
  validate the delivery schema, and verify the signed plaintext hash.
- Reuse the existing encrypted IndexedDB wallet.
- Reuse wallet create/import, unlock, funding, balances, and account
  discovery.
- Display the exact decrypted delivery details. A correction starts a new
  quote and approval.
- Display the signed payment amount, zero-cost pilot delivery, and estimated
  network fees before explicit approval.
- Reuse the existing seed-derived encryption, HFS upload, HCS v2 envelope,
  HTS approval, and `createOrderPaid` batch.
- Preserve the existing batch construction exactly: active buyer public key as
  `batchKey`, SDK `batchify()` for every inner transaction, and active buyer
  as every inner and outer payer/signer. Do not introduce another batch key.
- Use the verified quote's `orderSeed`; never generate a replacement.
- Record the outer transaction ID after submission for settlement
  confirmation.
- Display settlement progress and final public order state.
- Treat Cancel as local abandonment only; no quote-revocation endpoint is
  added and the handoff remains usable until expiry.

### Security boundary

- Wallet secrets remain in the existing browser wallet.
- Wallet passwords, private keys, mnemonics, signatures, and vault keys never
  enter the handoff or MCP. The per-order delivery key is explicitly allowed
  and cannot authorize wallet signing.
- Generic wallet-adapter operations remain private frontend implementation
  details.
- The approval page executes only a verified, explicitly approved Merxet
  order through the existing wallet flow.
- The handoff is not trusted; signed quote verification is authoritative.
- Version 1 does not claim protection from a malicious same-user process or a
  compromised client OS.
- Canonical typed execution plans, exact fee caps, frozen-transaction
  conformance checks, and complete crash-safe submission recovery are
  post-pilot wallet hardening.

### Tests

- Existing wallet lifecycle regression.
- Fragment parsing, invalid seed/key, unknown fields, and expiry.
- Quote/JWS/origin/request/requirements mutation rejection.
- Exact decrypted delivery display and new-quote behavior after correction.
- Exact quote display and reapproval after protected quote or delivery changes.
- HBAR and HTS construction.
- Fixed encryption/HFS/HCS/ABI compatibility with existing checkout.
- Seller retrieval and decryption of an agent-created order.

## Changed Project: `merxet-sync`

### Production changes

- Add dependency on `merxet-order-protocol`.
- Replace the current v1-only HCS decoder with the shared v1/v2 decoder.
- Continue accepting v1 messages.
- Index frontend v2 buyer-initial-order references.
- Preserve the order event/contract-call transaction reference.
- Internally correlate that inner record to its outer atomic batch through
  `parentConsensusTimestamp`.
- Resolve and store the authoritative outer transaction ID, optional hash,
  consensus timestamp, result, network, contract, payer, and buyer.
- Enrich cached orders without exposing private delivery data.
- Add a seed-based evidence route:

```http
GET /api/v1/:network/orders/:orderSeed/x402-evidence
```

Response includes:

```ts
interface MerxetOrderEvidenceV1 {
  orderSeed: string;
  network: string;
  contractId: string;
  order: PublicMerxetOrder;
  outerTransactionId: string;
  outerTransactionHash?: string;
  paymentConsensusTimestamp: string;
  payerAccountId: string;
  outerTransactionType: "ATOMICBATCH";
  outerResult: "SUCCESS";
}
```

- Inner transaction evidence remains internal to sync and is not part of the
  public x402 response.
- Return `404` when not indexed and distinguish it from malformed,
  wrong-network, and inconsistent evidence.
- Return only public order and transaction fields.

### Explicitly not added

- Buyer private-key access.
- Transaction signing or submission.
- Quote creation/signing.
- x402 header parsing.
- HFS byte retrieval for x402 confirmation.
- Delivery-payload validation.

### Tests

- Existing sync suite.
- HCS v1 regression and fixed v2 fixture.
- Buyer-initial-order filtering.
- Order event -> inner record -> outer batch correlation.
- Outer transaction ID and payment consensus timestamp.
- HBAR and HTS evidence.
- Current status with immutable creation fields.
- Not-indexed, malformed seed, wrong-network, and wrong-contract cases.

## Existing Project: `merxet-seller`

### Production changes

None required for x402.

The seller PWA continues to retrieve/decrypt HFS data, validate the existing
HFS commitment, display order data, and operate its existing fulfillment
flow. New product, price, payment-term, and delivery-policy validation is
post-pilot work and is not attested by a successful x402 response.

Validation:

- Build/test without server additions.
- Confirm it can see and decrypt an order created through frontend agent
  approval.
- Confirm invalid or unavailable HFS data is not treated as fulfillable.

## Existing Project: `merxet-smartcontract`

No contract or deployment changes.

Reuse current catalogs, seller key binding, `createOrderPaid`, HBAR/HTS
escrow, events, `orders(seed)`, and cancellation/refund behavior. Run existing
contract tests and copy only ABI fragments into the protocol package.

## Existing Project: `merxet-promo`

No changes beyond an optional regression build.

## Repository Root

Keep new projects independently installable for the pilot. Do not convert the
repository to an npm workspace yet.

Root planning documents:

- `MERXET_FRONTEND_WALLET_INTEGRATION.md`
- `MERXET_ORDER_X402_PLAN.md`
- `MERXET_ORDER_X402_PROJECT_CHANGES.md`
- `MERXET_ORDER_X402_SCHEME.md`

## Implementation Order

1. Finalize `MERXET_ORDER_X402_SCHEME.md`.
2. Create `merxet-order-protocol` and fixed fixtures.
3. Extend `merxet-sync` with HCS v2 and seed-based transaction evidence.
4. Create `merxet-x402-server`.
5. Add frontend approval handoff parsing and quote/JWS validation.
6. Reuse the existing frontend order execution with only the refactoring
   strictly required by the new approval route.
7. Create and publish `@merxet/mcp`.
8. Add MCP handoff generation, sync polling, proof construction, and
   confirmation.
9. Run unit and existing regression suites.
10. Run funded HBAR and HTS testnet integration.
11. Validate seller decryption compatibility.

## Definition of Done

- No separate agent-wallet project or executable is introduced.
- Codex uses the versioned `@merxet/mcp` STDIO package.
- Quote creation and paid confirmation are separate operations; confirmation
  never receives the delivery key or original commerce body.
- MCP has no wallet keys, wallet unlock, or generic signing capability; its
  only key material is the short-lived per-order delivery handoff key.
- Frontend uses the verified quote seed, authenticates and decrypts the cached
  delivery envelope, and displays the exact details, signed order amount,
  zero-cost pilot delivery, and estimated fees.
- Frontend signs only after explicit browser approval.
- Delivery details reach the frontend only by decrypting the quote envelope
  with the explicit handoff key. The x402 server sees plaintext only
  transiently for schema validation and zero-cost pilot delivery; sync,
  analytics, and logs do
  not receive plaintext or the key.
- Frontend continues to use the existing seller-compatible encryption path;
  funded seller decryption validation remains pending.
- The frontend records the submitted outer transaction identifier for normal
  completion and MCP confirmation.
- `merxet-sync` exposes authoritative public order/transaction evidence.
- MCP constructs the public proof and completes the paid confirmation.
- Required before deployment: funded HBAR and configured HTS testnet orders
  pass end to end (deferred in the repository-only validation).
- Existing frontend, seller, sync, and contract tests pass.
- No server-funded Hedera operator key is introduced.
- Proof replay remains read-only while the retained quote and current order
  are available.

## Implemented Layout and Operations

The concrete implementation keeps the planned ownership but consolidates
small modules where a separate abstraction added no boundary:

- Protocol: `constants.ts`, `schemas.ts`, `binary.ts`, `canonical.ts`,
  `delivery.ts`, `jws.ts`, `http.ts`, `hcs.ts`, and `abi.ts`.
- x402 server: `config.ts`, `clients.ts`, `quoteStore.ts`, `app.ts`, and
  `server.ts`.
- MCP: `config.ts`, `intentStore.ts`, `orderFlow.ts`, and `server.ts`.
- Frontend: `AgentOrderApprovalPage.tsx` and
  `lib/agentOrders/{trustedProfile,approvalHandoff,quoteClient,agentOrderExecutor}.ts`.

Final x402-server runtime dependencies are `express`, `cors`, `redis`, `jose`,
`zod`, and `@merxet/order-protocol`. Configuration:

```text
PORT
NODE_ENV
MERXET_SYNC_ORIGIN
MERXET_RESOURCE_ORIGIN
MERXET_CATALOG_ORIGINS
MERXET_QUOTE_SIGNING_KID
MERXET_QUOTE_SIGNING_KEY_PKCS8
MERXET_QUOTE_PUBLIC_KEY
MERXET_QUOTE_PUBLIC_KEYS
MERXET_REDIS_URL
MERXET_CORS_ORIGINS
MERXET_CATALOG_MAX_BYTES
MERXET_RECOVERY_SECONDS
MERXET_SYNC_RETRY_SECONDS
```

Generate an Ed25519 keypair with
`npm run generate-quote-key --prefix merxet-x402-server`. Deploy the new public
key in the frontend `trustedQuoteKeys` keyring before changing the active
server `kid`/private key. Start the built server with
`npm start --prefix merxet-x402-server`.

`MERXET_QUOTE_PUBLIC_KEYS` is an optional JSON object keyed by `kid` used to
retain verification keys during rotation. `MERXET_QUOTE_PUBLIC_KEY` is the
active key and is always added under `MERXET_QUOTE_SIGNING_KID`.

Final MCP runtime dependencies are `@modelcontextprotocol/sdk`,
`@merxet/order-protocol`, `zod`, and `qrcode`; `qrcode` is included rather
than optional so every invocation can return the same approval URL as a PNG.
Its configuration is `MERXET_X402_ORIGIN`, `MERXET_SYNC_ORIGIN`,
`MERXET_FRONTEND_ORIGIN`, and optional `MERXET_MCP_DATA_DIR`.

`merxet-sync` adds `@merxet/order-protocol` and
`HEDERA_TESTNET_CONTRACT_ID` (default `0.0.7565091`). The public evidence
response contains the current public order and authoritative outer-batch
fields only; direct inner transaction identifiers remain cached internal
correlation data.

Concrete sync reads are:

```http
GET /api/v1/:network/catalogs/seed/:catalogSeed
GET /api/v1/:network/orders/:orderSeed
GET /api/v1/:network/orders/:orderSeed/x402-evidence
```

Responses retain the existing `{ "success": true, "data": ... }` sync
envelope. The evidence endpoint returns `404` until both the current order and
successful outer `ATOMICBATCH` association are indexed.

### Validation Status

Completed locally: protocol, server, MCP and sync automated tests; frontend
production build; unchanged smart-contract source and seller production
source. Deferred: funded Codex-to-Hedera HBAR/HTS runs, deployed Redis
cross-instance testing, and seller decryption of a funded agent-created order.
Those require deployed testnet services and wallet funds and are not claimed
as completed by the repository-only pilot.
