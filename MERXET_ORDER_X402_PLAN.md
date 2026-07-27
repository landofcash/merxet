# Merxet Client-Settled x402 Implementation Plan

## Status

This is the implementation baseline for the `merxet-order` testnet pilot. The
design deliberately separates the public resource server, agent transport,
browser wallet approval boundary, and shared wire contracts.

Pilot implementation is checked in as of 2026-07-27. Unit/build validation is
complete for the protocol, sync, x402 server, frontend, and MCP packages.
Deployment and funded HBAR/HTS testnet execution remain pending because this
workspace has no deployed Redis/signing-key configuration or funded approval
wallet.

### Implementation status

| Area | Status | Concrete implementation |
| --- | --- | --- |
| Protocol | Implemented | `merxet-order-protocol/src/{schemas,canonical,delivery,jws,http,hcs,abi}.ts` |
| Sync | Implemented | seed catalog/order/evidence routes and Mirror Node parent-batch correlation |
| x402 server | Implemented | `merxet-x402-server/src/app.ts`, Redis/in-memory quote stores, quote-key script |
| Frontend | Implemented | `AgentOrderApprovalPage`, `lib/agentOrders/*`, trusted profile settings |
| MCP | Implemented | `@merxet/mcp@1.0.0`, two STDIO tools, atomic intent JSON |
| Funded testnet | Pending | requires deployed origins, Redis, quote keyring, topic, and funded wallet |

The implementation uses Node 22. Local sibling consumers use
`file:../merxet-order-protocol`; deployable packages refer to the published
`@merxet/order-protocol@1.0.0` contract.

## Project Boundaries

The implementation adds three new projects and changes the existing frontend:

| Project | Trust boundary |
| --- | --- |
| `merxet-order-protocol` | Pure schemas, canonicalization, HCS codecs, and ABI definitions |
| `merxet-x402-server` | Public x402 order endpoint, quote authority, and settlement verifier |
| `merxet-mcp` | Thin agent-facing MCP orchestration with no keys |
| `merxet-frontend` | Existing built-in wallet plus agent-order approval and Hedera settlement |

`merxet-seller` remains a browser application. It must not contain the public
x402 endpoint because it has no trusted server runtime and should not own
public quote/catalog resolution or x402 response responsibilities.

## End-to-End Flow

```text
Agent
  |
  | MCP: create_merxet_order(catalogSeed, items, deliveryDetails)
  v
merxet-mcp
  |
  | generate orderSeed + delivery key
  | AES-GCM encrypt delivery details
  | POST /order-quotes with selection + encrypted delivery + transient key
  v
merxet-x402-server
  |
  | decrypt transiently, validate delivery schema, set pilot delivery to zero
  | cache signed quote + encrypted delivery; discard raw key
  | 402 + signed quote reference
  v
merxet-mcp
  |
  | approval URL/QR with network + orderSeed + delivery key
  v
merxet-frontend /agent-orders/approve
  |
  | fetches full quote + encrypted delivery from configured Merxet origin
  | verifies quote digest/JWS with installed trusted profile
  | decrypts delivery and verifies signed plaintext/ciphertext commitments
  | verifies request, resource, payment terms, and destinations
  | unlock + review delivery details + approve
  | encrypt -> HFS -> atomic batch -> consensus
  v
merxet-sync
  |
  | indexes public order and transaction evidence
  v
merxet-mcp
  |
  | constructs PaymentPayload from original requirements + public evidence
  | POST /orders/:orderSeed/confirm with PAYMENT-SIGNATURE
  v
merxet-x402-server
  |
  | merxet-sync order and transaction lookup
  v
Agent receives confirmed Merxet order
```

Plaintext delivery details are supplied by the agent and are visible to the
local MCP. MCP encrypts them under a fresh per-order key before calling the
x402 server. The server decrypts them transiently to validate the destination
and validate its schema, sets pilot delivery cost to zero, caches only
ciphertext, and never returns the
key. The approval URL/QR contains only `network`, `orderSeed`, and that
delivery key. `merxet-sync` never receives it.

Wallet private keys, seed signatures, plaintext order payloads, and the
seller-facing encryption keys remain inside the frontend's built-in browser
wallet. The handoff delivery key is a separate short-lived bearer secret used
only to decrypt the cached quote delivery envelope.

## Public x402 Server

### Endpoint

`merxet-x402-server` exposes:

```http
POST /api/v1/testnet/order-quotes
Content-Type: application/json
```

This quote-creation operation accepts the transient delivery key and returns
the initial `402 PAYMENT-REQUIRED`. It is never retried after payment.

Paid confirmation is a separate keyless operation:

```http
POST /api/v1/testnet/orders/:orderSeed/confirm
PAYMENT-SIGNATURE: <base64 PaymentPayload>
```

The confirmation request has no commerce body or delivery key. Calling it
without `PAYMENT-SIGNATURE` MAY return the cached challenge for that seed.

It also exposes immutable short-lived quote retrieval:

```http
POST /api/v1/testnet/order-quotes/resolve
Content-Type: application/json

{ "orderSeed": "<22-character-seed>" }
```

The quote endpoint returns the complete immutable `PaymentRequired`, full
quote, its SHA-256 digest, detached Ed25519 JWS, and encrypted delivery
envelope. It never returns the delivery key or plaintext delivery fields. The
random `orderSeed` is also the quote identifier. Responses use
`Cache-Control: private, no-store`. The wallet verifies the JWS with a trusted
public key installed in its active Merxet profile, verifies the complete
requirements and ciphertext commitment, and decrypts with the fragment key.

Version 1 uses Redis as a shared, TTL-bounded quote store. It does not add a
relational database, SQLite, file-backed store, or ORM. Quotes are stored as
validated serialized JSON under:

```text
merxet:x402:quote:<network>:<orderSeed>
```

Creation uses atomic `SET` with `NX` and an expiry covering the ten-minute
quote lifetime plus the 24-hour proof-recovery window (normally 87,000
seconds). `NX` enforces collision and overwrite rejection across server
instances. A quote remains available across x402 server restarts and
redeployments as long as Redis retains the key.

The Redis value contains the immutable signed quote, `PaymentRequired`, quote
digest/JWS, request commitment, expiry, and authenticated encrypted delivery
envelope. It MUST NOT contain the delivery key, decrypted delivery details,
wallet secrets, or quote-signing private key. Redis is an availability store,
not the authoritative order database or a payment-idempotency ledger.
Authoritative submitted-order state remains on-chain and is exposed through
`merxet-sync`.

If Redis is unavailable, quote creation and confirmation fail closed with
`503` and `Retry-After`; the deployed server does not silently fall back to a
process-local cache. If a quote key is missing because it expired, was evicted,
or Redis lost data, the server returns `404`. The client starts a new quote
only when no order was submitted; an already-submitted order remains
recoverable by `orderSeed` through `merxet-sync`.

Request:

```ts
interface MerxetOrderRequest {
  orderSeed: string;
  catalogSeed: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  encryptedDelivery: MerxetEncryptedDeliveryV1;
  deliveryKey: string; // transient; never cached, logged, or returned
}
```

Rules:

- MCP generates `orderSeed` using the existing cryptographically random
  22-character Merxet seed representation.
- Reject a seed already bound to another request.
- Reject duplicate products and non-positive integer quantities.
- Validate the encrypted envelope, transient 32-byte key, AES-GCM AAD,
  plaintext delivery schema, and ciphertext size.
- Decrypt delivery details only to validate the shared schema. For the pilot,
  select the fixed `pilot-seller-arranged` option with amount `0`;
  destination-dependent delivery pricing is deferred.
- Resolve product names, prices, seller, asset, contract, and topic
  authoritatively.
- Reject missing products, inactive catalogs, mixed assets, invalid prices,
  and assets outside the server allowlist.
- Calculate totals with `bigint` in the asset's smallest unit.
- Never accept client-provided prices, totals, seller keys, transaction
  arguments, or seller-facing encryption material.
- Never persist, echo, or log `deliveryKey` or plaintext delivery details.

Responses:

- `400`: malformed selection, invalid delivery key/envelope, authentication
  failure, or invalid decrypted delivery schema.
- `404`: catalog or product not found.
- `422`: invalid catalog data, unsupported asset, mixed asset, unavailable
  destination, or an address that requires user correction.
- `402`: payment required or a complete but invalid payment proof.
- `503` with `Retry-After`: `merxet-sync` is unavailable or has not indexed
  the submitted order or its transaction evidence. Quote creation also fails
  with `503` when sync is unavailable for the existing-seed check.
- `200`: a matching order exists and its current public state is returned by
  the confirmation operation.

The initial response includes the x402 response body and `PAYMENT-REQUIRED`.
Success includes `PAYMENT-RESPONSE`. Both headers are exposed through CORS.
Browser-facing CORS allows `Content-Type, PAYMENT-SIGNATURE` and exposes
`PAYMENT-REQUIRED, PAYMENT-RESPONSE`.

The service supports testnet only. A future API gateway may route quote
creation and order confirmation paths to this service while continuing to
route order GET requests to `merxet-sync`.

### Signed quote

```ts
interface MerxetOrderQuoteV1 {
  version: 1;
  orderSeed: string;
  requestHash: string;
  network: "hedera:testnet";

  x402: {
    protocolVersion: 2;
    scheme: "merxet-order";
    schemeVersion: 1;
    resourceMethod: "POST";
    resourcePath: string; // exact /api/v1/testnet/orders/:orderSeed/confirm
    maxTimeoutSeconds: 600;
  };

  catalog: {
    seed: string;
    sellerAccountId: string;
    sellerEvmAddress: string;
    sellerPublicKey: string;
  };

  items: Array<{
    productId: string;
    name: string;
    unitAmount: string;
    quantity: number;
    lineAmount: string;
  }>;

  delivery: {
    required: boolean;
    optionId: string;
    optionName: string;
    amount: string;
    deliveryDetailsHash: string;
    encryptedDeliveryHash: string;
  };

  payment: {
    symbol: string; // display metadata only
    name: string; // display metadata only
    amount: string;
    payTo: string;
  } & (
    | {
        assetType: "hbar";
        asset: "0.0.0";
        tokenEvmAddress: null;
        decimals: 8;
      }
    | {
        assetType: "hts";
        asset: string;
        tokenEvmAddress: string;
        decimals: number;
      }
  );

  merxet: {
    contractId: string;
    contractEvmAddress: string;
    hcsTopicId: string;
  };

  issuedAt: number;
  expiresAt: number;
}
```

`sellerAccountId` is canonical `shard.realm.num`.
`sellerEvmAddress` is the exact lowercase 20-byte Solidity address returned by
the Merxet catalog (`0x` plus 40 hexadecimal characters), without classifying
it as an alias or long-zero address. `sellerPublicKey` is standard padded
Base64 of the normalized 33-byte compressed secp256k1 catalog encryption key.

Quote creation:

- Validate the MCP-generated unpadded 22-character base64url `orderSeed`.
- Store SHA-256 of the canonical request commitment, excluding the transient
  delivery key.
- Bind the fixed zero-cost pilot delivery option, canonical plaintext delivery
  hash, and complete encrypted-envelope hash.
- Use a ten-minute lifetime.
- Store the immutable full quote under `(network, orderSeed)`.
- Require MCP to generate a new random seed for every quote and reject
  collisions with retained quotes or existing on-chain orders; do not retain
  expired unused seeds forever.
- Generate a new seed for every refreshed, replacement, or repriced quote.
- Reject overwriting different quote contents under an existing seed.
- Calculate SHA-256 over the canonical quote.
- Create the detached Ed25519 JWS over the standard JOSE signing input for the
  UTF-8 quote digest using a maintained JOSE library and stable `kid`.
- Fail server startup when the feature is enabled without valid quote
  storage or quote-signing-key configuration.

x402 requirements:

```ts
{
  scheme: "merxet-order",
  network: "hedera:testnet",
  asset: "0.0.0" | "<canonical HTS token ID>",
  amount: "<smallest-unit integer>",
  payTo: "<Merxet contract ID>",
  maxTimeoutSeconds: 600,
  extra: {
    schemeVersion: 1,
    orderSeed: "<22-character-seed>",
    quoteDigest: "<base64url SHA-256>",
    quotePath: "/api/v1/testnet/order-quotes/resolve",
    quoteJws: "<detached compact Ed25519 JWS>"
  }
}
```

The core requirements remain in `PAYMENT-REQUIRED`; only the large Merxet
quote moves to the retrieval endpoint. The wallet calls the fixed
`quoteResolutionPath` in its installed trusted Merxet profile, follows no
cross-origin redirect, and verifies that the returned requirement's
`quotePath` equals that installed value. It verifies order seed, digest, JWS,
request hash, resource method/path, network, asset, amount, delivery price and
commitments, contract, topic, and expiry independently of MCP.

The keyless confirmation call must match the signed quote and original
quote-request commitment retained in Redis. The outer batch must reach
consensus between `issuedAt` and `expiresAt`. The proof may arrive during the
bounded 24-hour Redis recovery period after expiry, but expiry must never
authorize or construct another execution. No permanent quote tombstone is
required.

### Client-settled proof

`PAYMENT-SIGNATURE` contains a normal x402 v2 payload whose scheme payload is:

```ts
interface MerxetOrderProof {
  transactionId: string;
  buyerAccountId: string;
}
```

- `transactionId` is the outer Hedera atomic-batch transaction ID.
- No signed transaction bytes are transmitted.
- No ciphertext, delivery data, wallet signature, or encryption secret is
  transmitted in `PAYMENT-SIGNATURE`.

Success returns the quote/order identifiers, authoritative outer transaction
ID/hash, current status, and public order fields. Replaying the same proof is
read-only while the quote/recovery record and current order still exist.

No `payment-identifier` extension or durable payment-idempotency store is
required for V1. Verification is read-only after the wallet has created the
on-chain order. The pilot does not guarantee confirmation after an order is
deleted, after quote recovery expires, or after a deleted seed is later
reused.

### Complete x402 envelopes

The complete `PaymentRequired`, `PaymentPayload`, `SettlementResponse`, HTTP
header encoding, extensions, version rules, and fixtures are normative in
`MERXET_ORDER_X402_SCHEME.md`. The custom proof above is only the
scheme-specific `PaymentPayload.payload`, not the entire x402 message.

### Server verification

The server is its own x402 verifier/facilitator but has no Hedera signer.
Custom `settle()` semantics confirm a transaction already submitted by the
client; they do not broadcast it.

Verification:

1. Validate the complete x402 envelope and active quote/request binding.
2. Query `merxet-sync` for the order and authoritative outer atomic-batch
   association.
3. If the order or outer association has not been indexed, optionally request
   a sync refresh and return `503 proof_pending`.
4. Require the configured network and Merxet contract.
5. Require the order to exist.
6. Match the supplied transaction ID to the authoritative outer atomic-batch
   transaction ID returned by sync.
7. Require outer transaction type `ATOMICBATCH` and result `SUCCESS`.
8. Require buyer and payer to equal the proof account.
9. Require canonical asset and amount to match the selected x402 requirements.
10. Require a nonzero payer and reject `None`, `Initial`, or an unpaid canceled
   order.
11. Require the catalog seed to match the retained quote.
12. Require the outer batch consensus timestamp to be between quote
    `issuedAt` and `expiresAt`.
13. Require the order seller address and normalized seller encryption key to
    match the signed quote.
14. Return the current public order status and fields; do not require the order
    to remain `Paid`.

The pilot does not require the wallet to re-read mutable catalog state
immediately before submission. The x402 endpoint performs the authoritative
post-settlement comparison. A catalog change between quote and execution can
therefore produce an already-escrowed order that fails x402 confirmation; the
buyer uses the existing cancellation/refund flow. This is an accepted pilot
race, and a wallet preflight check is deferred defense in depth.

The x402 server does not reconstruct the atomic batch or independently verify
HCS messages, HFS contents, HTS approvals, child records, or contract events.
The wallet reuses the established Merxet transaction flow after explicit
approval. Detailed seller-side product, encrypted-data, and fulfillment
validation is deferred and is not attested by the x402 response.

`merxet-sync` internally identifies the order-producing inner contract call
from the outer batch records and `parentConsensusTimestamp`, but inner details
do not cross the public x402 boundary. Partial sync indexing returns retriable
`503`; contradictory indexed
order fields return invalid `402`. The x402 server does not need its own
Mirror Node client.

## Merxet MCP Bridge

`merxet-mcp` is the only component directly exposed to the agent.
Publish it as a versioned `@merxet/mcp` npm package and register it in Codex
as a local STDIO server:

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

No Merxet native executable or wallet application is installed.

### MCP tools

Expose commerce-specific tools:

```ts
create_merxet_order({
  catalogSeed,
  items,
  deliveryDetails: {
    fullName,
    address,
    city,
    postalCode,
    country,
    phone,
    email,
    deliveryComments,
    noPhysicalDelivery
  }
})
```

Returns one of:

```ts
{ status: "approval_required", intentId, orderSeed, approvalUrl, expiresAt }
{ status: "confirmed", order }
{ status: "failed", code, message }
```

For `approval_required`, the MCP tool MUST always return the URL as structured
text and MAY additionally return a QR-code image content block encoding that
exact URL. The URL remains the compatibility fallback when the Codex surface
does not render MCP image content.

And:

```ts
get_merxet_order_status({ intentId })
```

Returns:

```ts
{
  status:
    | "awaiting_settlement"
    | "proof_pending"
    | "confirmed"
    | "expired"
    | "failed";
  ...
}
```

Without a browser-to-MCP callback, MCP does not claim to distinguish “approval
page not opened” from “frontend transaction currently processing.” Both are
`awaiting_settlement` until public order evidence appears.

The MCP process:

- Validates delivery details against the shared schema, rejects unknown
  fields/types, applies the defined optional-field convention, and preserves
  the supplied values without silently rewriting them.
- Generates a new `orderSeed`, random 32-byte delivery key, and random
  12-byte AES-GCM nonce for every quote request.
- Encrypts canonical delivery JSON with AES-256-GCM using AAD bound to scheme
  version, network, and `orderSeed`.
- Sends `orderSeed`, selection, encrypted delivery, and the transient key to
  `POST /api/v1/testnet/order-quotes` over HTTPS.
- Validates that the returned requirements use `merxet-order` and the expected
  server/network.
- Builds a minimal `MerxetFrontendApprovalHandoffV1` containing only version,
  network, `orderSeed`, and `deliveryKey`.
- Encodes those values in the URL fragment under the configured official
  frontend approval route and MAY generate a QR code of the exact same URL.
- Returns that approval URL without opening or approving it for the user.
- Persists only the public request, selected requirements, order seed, quote
  reference, encrypted envelope, and intent status needed for
  confirmation/recovery.
  It does not persist the raw delivery key and therefore cannot regenerate a
  lost approval URL after restart. It discards its separate plaintext
  delivery-details object immediately after encryption.
- Polls `merxet-sync` by `orderSeed` after browser settlement.
- Constructs the complete `PaymentPayload` from the originally selected
  requirements, authoritative outer batch ID, and indexed public order.
- Encodes that payload as `PAYMENT-SIGNATURE` and calls the exact keyless
  `/orders/:orderSeed/confirm` resource from the signed quote. It never retries
  quote creation and never sends `deliveryKey` during confirmation.
- Returns the confirmed public order to the agent.

The MCP process must not:

- Receive a vault password, recovery phrase, private key, seed signature,
  plaintext seller-facing order payload, wallet AES key, or encrypted seller
  key. The per-order delivery handoff key is not a wallet key and is the only
  encryption key MCP generates or handles.
- Offer raw `sign_message`, `sign_transaction`, or `execute_transaction` tools.
- Be able to alter the signed quote or trusted profile used by the frontend.
- Reuse browser-wallet authorization for another quote.
- Send plaintext delivery details to `merxet-sync`, logs, telemetry, tool
  results, or unrelated intents. The x402 server receives them only by
  transient AES-GCM decryption for schema validation and zero-cost pilot
  delivery commitments.

## Frontend Browser Wallet

`merxet-frontend` is the signing and human-approval boundary. Version 1 adds no
separate wallet project, daemon, local wallet API, native installer, VPS
wallet, or 2FA implementation.

The frontend reuses its existing wallet lifecycle, encrypted IndexedDB vault,
seed-derived encryption, HFS/HCS handling, and `createOrderPaid` execution.
The detailed source mapping and browser handoff are defined in
`MERXET_FRONTEND_WALLET_INTEGRATION.md`.

### Installed trusted Merxet profile

The frontend ships with a default trusted Merxet profile containing:

```ts
interface TrustedMerxetProfileV1 {
  version: 1;
  profileId: string;
  quoteOrigin: string;
  quoteResolutionPath: "/api/v1/testnet/order-quotes/resolve";
  resourceOrigin: string;
  confirmationPathTemplate: "/api/v1/testnet/orders/{orderSeed}/confirm";
  network: "hedera:testnet";
  contractId: string;
  contractEvmAddress: string;
  hcsTopicId: string;
  trustedQuoteKeys: Array<{
    kid: string;
    algorithm: "EdDSA";
    publicKeyEncoding: "base64url-ed25519";
    publicKey: string;
  }>;
}
```

This installed profile is the wallet's authority for the Merxet server,
quote-signing keys, Hedera network, contract, and HCS topic. Agent, MCP,
`PaymentRequired`, and quote data cannot create, modify, or select trusted
profiles.

The user may manage custom profiles only through the authenticated wallet
settings UI. Adding, changing, selecting, or deleting a profile requires
wallet unlock, displays every destination and quote-key fingerprint, shows a
high-risk warning, and invalidates pending approvals made under the previous
profile.

For V1, trusted quote-key rotation is delivered with a frontend release. A
future signed key manifest may be added without making an arbitrary remotely
downloaded key trusted.

The installed `trustedQuoteKeys` array is a keyring indexed by `kid`. Ship a
new public key before the server starts signing with it. Retain every previous
public key until the final quote signed by that key has passed the maximum
Redis TTL (normally 87,000 seconds) plus the configured frontend deployment
overlap. Key retention permits verification and recovery only; it never
extends quote `expiresAt`.

### Wallet lifecycle

The existing frontend provides:

- Create a new encrypted vault.
- Generate a Hedera mnemonic and its standard ECDSA secp256k1 keypair.
- Display the public key/EVM alias and funding/activation instructions.
- Preserve the existing
  `local_only -> funded_or_alias_created -> ready` lifecycle.
- Resolve and persist the canonical Hedera account ID from the EVM alias after
  activation; manual account-ID attachment is not the normal flow.
- Import an existing mnemonic or raw ECDSA private key.
- Derive the imported key's identity and verify the discovered account against
  that identity.
- Lock, unlock, change password, and delete/export only through explicit user
  approval.
- Display balances and the active account to the approval UI.

Private keys are encrypted at rest using:

- Argon2id password derivation with per-vault salt and stored versioned
  parameters.
- An authenticated encryption format such as AES-256-GCM.
- Unique nonce per encryption operation.
- Versioned vault metadata for future migration.

The existing versioned Argon2id/AES-GCM vault remains in browser IndexedDB.
The derived vault key and decrypted Hedera key exist only in frontend memory
while unlocked. Vault passwords never enter MCP configuration, command
arguments, handoff data, or tool results.

### Approval route

MCP returns:

```text
https://app.merxet.example/agent-orders/approve#v=1&network=testnet&orderSeed=<seed>&deliveryKey=<base64url-key>
```

The fragment contains only the version, network, `orderSeed`, and per-order
delivery key. It contains no full quote, `PaymentRequired`, plaintext delivery
details, ciphertext, or wallet secret. The frontend clears the fragment with
`history.replaceState`, fetches the authoritative quote and encrypted
delivery from its configured origin, authenticates both, and decrypts locally
before displaying approval. Before approval the key remains only in volatile
session state, so a reload may require reopening the URL/QR. If post-approval
recovery still requires it, the wallet stores it only inside the encrypted
execution record.

The page displays:

- Seller and catalog.
- Items, quantities, line amounts, asset, and total.
- Hedera network and Merxet contract.
- Estimated HFS and atomic-batch fees.
- Fixed seller-arranged pilot delivery with amount `0`.
- Quote expiry.
- Current wallet account and balance.
- Exact validated delivery details decrypted from the signed quote record.
  Any correction requires a new quote because it changes the signed delivery
  commitment.
- Warning that HFS data can remain if the later batch fails.

Approval requires a successful vault unlock or existing valid unlock session
and explicit confirmation of the verified Merxet quote. Any change to the
quote, payment amount, asset, seller, catalog, delivery details, trusted
profile, or expiry requires a new quote and approval.

The pilot reuses the current wallet transaction builder. Canonical typed
execution plans, exact fee/debit caps, frozen-transaction conformance, and
complete crash-safe resubmission are explicitly deferred wallet hardening.

### Order execution

After approval, the wallet:

1. Rechecks the trusted profile, quote JWS, quote validity, and explicit
   approval state.
2. Verifies the encrypted-envelope hash, decrypts it with the handoff key,
   independently validates the delivery object, canonicalizes it only for
   hashing, and verifies `deliveryDetailsHash`.
3. Signs `merxet-${orderSeed}` internally.
4. Derives the existing ephemeral ECIES buyer pair.
5. Builds the existing Merxet `OrderData` from the approved delivery details.
6. Encrypts the payload with AES-GCM.
7. Encrypts the symmetric key for buyer and seller.
8. Calculates ciphertext, plaintext, and symmetric-key hashes.
9. Builds and submits the buyer-paid HFS transactions using the existing flow.
10. Builds the HCS v2 buyer-initial-order reference.
11. Builds the HBAR or HTS atomic batch.
12. Uses the existing wallet flow: the active buyer public key is the batch
    key, each inner transaction is prepared with `batchify()`, and the buyer is
    every inner and outer payer.
13. Signs the outer batch with the active buyer private key.
14. Submits and waits for consensus.
15. Records the public outer transaction ID/hash for normal completion UI.
16. Allows `merxet-sync` to index the authoritative order and internally
    correlate it to the outer atomic batch.

The seed challenge, deterministic buyer encryption-key derivation, AES-GCM and
ECIES formats, `OrderData`, HFS upload, HCS v2 reference, HTS approval, and
`createOrderPaid` ABI construction MUST remain compatible with the existing
frontend buyer flow and seller decryption flow. Unlike the existing checkout,
the wallet uses the `orderSeed` from the verified signed quote and never
generates a replacement seed locally.

The existing generic `signMessage`, `executeContract`, `executeBatch`, and
`signAndSubmit` capabilities remain private frontend implementation
functions. They MUST NOT appear in the MCP schema or approval-handoff schema.

No order execution starts before approval. If too little of the 600-second
quote window remains to execute safely, the wallet expires the approval and
instructs the user to ask Codex for a fresh quote.

Failed or canceled approvals cannot start execution. MCP independently
observes settlement from `merxet-sync` by `orderSeed`. Complete interruption
recovery inside the wallet is post-pilot hardening.

Cancel is local in V1: it abandons the browser approval/execution record but
does not revoke the quote or bearer handoff, which remain valid until expiry.

### Browser threat boundary

The built-in wallet is noncustodial and encrypted at rest, but it is not a
hard isolation boundary against a fully malicious process running with the
same OS-user privileges. Version 1 does not claim resistance to a compromised
client OS or malicious same-user process.

## Shared Protocol Package

`merxet-order-protocol` is deliberately small and side-effect free.

It contains:

- Zod schemas and TypeScript types for request, quote, proof, receipt, wallet
  approval handoff, trusted Merxet profile, quote reference,
  full x402 envelopes, and public status.
- Canonical JSON and hashing rules.
- Detached Ed25519 JWS, trusted-profile, configured-origin/path, and
  quote-digest validation contracts.
- HCS v1 decoder and v2 encoder/decoder.
- Merxet and HTS approval ABI fragments.
- Seed/account/token normalization helpers.
- Version constants and fixed compatibility fixtures.

It does not contain:

- HTTP servers or routes.
- MCP tools.
- Wallet storage or signing.
- Catalog network fetching.
- Mirror Node/RPC clients.
- Transaction submission.

This package prevents wire-format duplication without collecting all x402
behavior into one project.

### Implementation libraries

The initial TypeScript implementation uses:

- `@x402/core` for x402 v2 core types and HTTP header encoding/decoding.
- `zod` for runtime validation of all protocol inputs.
- `canonicalize` as the single RFC 8785 canonical JSON implementation.
- `jose` for Ed25519 JWS signing, verification, key import, and Base64URL
  helpers.

The package owns the small detached-JWS wrapper and fixed compatibility
fixtures so the Node server and browser wallet cannot produce different
signing inputs. It uses native Web Crypto for SHA-256 and does not introduce a
second hashing or symmetric-encryption library.

`merxet-mcp` uses the stable `@modelcontextprotocol/sdk` v1 line with Zod and
MAY use `qrcode` to return an image content block. The approval URL is always
returned even when QR generation is unavailable.

The implementation does not initially add `@x402/express`, a standard Hedera
`exact` scheme package, facilitator middleware, a relational database driver,
SQLite binding, or ORM. `merxet-x402-server` uses the official `redis` Node.js
client for the bounded quote store. The custom quote and confirmation routes
use Express directly and the existing frontend continues to use
`@hiero-ledger/sdk`, `idb-keyval`, and `qrcode.react`.

## Existing Projects

- `merxet-sync`: becomes the preferred public order and transaction-evidence
  source for x402 confirmation. It adopts the shared HCS v1/v2 decoder,
  enriches cached orders with creation-transaction references and source
  metadata, and exposes seed-based evidence lookup.
- `merxet-frontend`: adds the agent-order approval route and quote/JWS
  validation, and reuses the existing built-in wallet, encryption, HFS/HCS,
  and Hedera execution.
- `merxet-seller`: no production change; continues HFS retrieval, decryption,
  hash validation, and fulfillment, and supplies reusable wallet-management
  modal patterns.
- `merxet-smartcontract`: no contract or deployment change.
- `merxet-promo`: no change.

## Testing

### Protocol

- Complete x402 envelope fixtures, schemas, canonical JSON, quote JWS,
  trusted-profile and HTTPS origin/path handling,
  canonical assets, seed normalization, HCS v1/v2 fixtures, and ABI fixtures.

### x402 server

- Quote construction/retrieval/signing, unknown `kid`, JWS/digest/request
  mismatch, configured-origin/path substitution, expiry, catalog validation,
  seed-keyed immutability, Redis/on-chain collision rejection, Redis
  outage/expiry/eviction, SSRF protection,
  HBAR/HTS order-field verification, sync pending state, read-only replay,
  CORS, and mainnet rejection.
- Separate quote-creation and keyless-confirmation operations; confirmation
  never accepts `deliveryKey` and never requires the original request body.
- Delivery-key and envelope validation, AES-GCM authentication/AAD failure,
  fixed zero-cost pilot delivery, signed plaintext/ciphertext commitments,
  transient key disposal, and proof that quote retrieval never returns key or
  plaintext.

### MCP

- Initial `402` handling, expected-server validation, intent creation, approval
  handoff URL/status propagation, sync evidence polling, public proof
  construction, keyless confirmation, timeout, restart/resume, and proof
  replay.
- Per-order seed/key/nonce generation, AES-GCM envelope and AAD fixtures,
  minimal URL/QR handoff, configured frontend origin, and delivery/key log
  redaction.
- Tests proving no generic signing tool or private wallet field appears in MCP
  schemas/results.

### Frontend browser wallet

- Vault creation/import, wrong password, password change, corruption detection,
  auto-lock, unlock throttling, and migration versioning.
- Approval-fragment parsing, invalid seed/key rejection, expiry,
  cancellation, request mutation, and configured-origin enforcement.
- Local Cancel abandons browser state without revoking the server quote;
  reopening the handoff before expiry still requires a fresh explicit
  approval.
- Quote/ciphertext retrieval, AES-GCM authentication failure, frontend
  independent delivery validation, exact approval display, delivery-details
  hashing, and new-quote requirement after delivery changes.
- Installed-profile defaults, unknown quote key, invalid JWS, MCP profile
  mutation rejection, wallet-UI-only profile changes, fingerprint display,
  pending-approval invalidation, and frontend-release key rotation.
- Agent/MCP mutation of scheme, version, resource, network, asset, amount,
  `payTo`, timeout, quote reference, contract, or topic rejected against the
  signed quote and trusted profile.
- Outer batch ID/consensus-time confirmation, internal sync
  outer-to-inner correlation, missing association as `503`, and proof outside
  the quote consensus window rejected.
- Exact signed-quote display and reapproval after any protected quote or
  delivery change.
- Encryption compatibility with the built-in wallet.
- Cross-project fixtures for the seed challenge, deterministic encryption
  pair, AES-GCM/ECIES encodings, hashes, HFS/HCS reference, and
  `createOrderPaid` ABI arguments.
- Alias-funded account discovery and the
  `local_only -> funded_or_alias_created -> ready` lifecycle.
- Tests proving generic signing functions are private frontend implementation
  details and are absent from MCP and handoff schemas.
- HBAR and HTS transaction construction.
- Normal completion after batch submission and consensus; exhaustive
  interruption recovery is deferred.
- Tests proving quote retrieval never returns the delivery key or plaintext,
  and plaintext/key values are redacted from sync, analytics, logs, unrelated
  tool results, and public proof data.

### Integration

- Existing frontend, seller, sync, and smart-contract regression suites.
- Funded testnet HBAR and configured HTS orders through MCP -> frontend wallet
  -> x402 server.
- `merxet-sync` creation-transaction evidence and current-order lookup used by
  the x402 server.
- Seller retrieval/decryption of an order created through the new flow.

## Implementation Sequence

1. Finalize `MERXET_ORDER_X402_SCHEME.md`.
2. Create `merxet-order-protocol` and compatibility fixtures.
3. Extend `merxet-sync` with seed-based order/transaction evidence.
4. Create `merxet-x402-server` with quote/catalog logic and a `merxet-sync`
   verification client.
5. Add the agent-order approval handoff, quote/JWS verification, and explicit
   approval route to `merxet-frontend`.
6. Reuse the existing buyer encryption, HFS/HCS, and Hedera order execution
   with only the refactoring strictly required by the new route.
7. Create `merxet-mcp` and its two order tools, including handoff generation,
   sync polling, public proof construction, and paid confirmation.
8. Update `merxet-sync` to decode HCS v2 and expose transaction evidence
   through the protocol package.
9. Run all unit and regression suites.
10. Run funded HBAR and HTS testnet scenarios.

## Explicit Exclusions

- Mainnet support.
- A separate agent-wallet application, daemon, browser extension, native
  installer, VPS wallet, or 2FA.
- Smart-contract migration or deployment.
- Placing server secrets or x402 verification in the seller PWA.
- Giving the MCP process raw signing methods.
- Claiming the browser vault or delivery-handoff encryption protects against
  an agent with same-user shell access. Handoff encryption protects the quote
  cache and retrieval response, not plaintext already supplied to the agent.
- Strict server-side HFS-byte retrieval.
- Destination-dependent delivery pricing; pilot delivery amount is always
  zero.
- New seller commercial-validation behavior beyond compatibility with the
  existing encrypted order format.
- Canonical typed execution plans, exact fee caps, frozen-transaction
  conformance, and complete crash-safe wallet submission recovery.
- Confirmation or proof replay after order deletion, quote-recovery expiry,
  or later seed reuse.
- Durable server payment-idempotency storage; V1 replay is a read-only
  deterministic verification.
- Production deployment until the testnet flow and isolation model are
  validated.

## Conformance traceability

| Scheme section | Owning modules | Automated validation |
| --- | --- | --- |
| 1-3 conformance, identity, assets | protocol `constants.ts`, `schemas.ts` | protocol schema tests |
| 4 request and delivery encryption | protocol `delivery.ts`; MCP `orderFlow.ts`; server `app.ts` | AES/AAD/limit and redaction tests |
| 5 quote, profile, JWS, retrieval | protocol canonical/JWS schemas; server `app.ts`; frontend `quoteClient.ts` | protocol mutation tests and server route tests |
| 6 requirements and handoff | protocol `http.ts`; MCP `orderFlow.ts`; frontend `approvalHandoff.ts` | header, URL/QR, and fragment tests |
| 7-8 approval and client transaction | frontend approval page and executor | frontend production build; funded flow pending |
| 9 payload | MCP `orderFlow.ts` | restart-to-confirmation test |
| 10-13 verification, settlement, replay | sync correlation; server confirmation route | pending/success/replay-safe server tests |
| 14 delivery boundary | protocol, MCP, x402 server, frontend | persisted-record and response redaction tests |
| 15 compatibility fixtures | protocol `fixtures/`, HCS tests | protocol and sync fixture suites; seller funded compatibility pending |

### MCP package and tools

Install with Node 22 or newer:

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

Configuration is `MERXET_X402_ORIGIN`, `MERXET_SYNC_ORIGIN`,
`MERXET_FRONTEND_ORIGIN`, and optional `MERXET_MCP_DATA_DIR`.
`create_merxet_order` accepts `catalogSeed`, 1-100 item
`productId`/`quantity` pairs, and strict `MerxetDeliveryDetailsV1`.
`get_merxet_order_status` accepts only `intentId`. No signer, transaction,
wallet-secret, profile-mutation, or arbitrary-fetch tool is registered.
