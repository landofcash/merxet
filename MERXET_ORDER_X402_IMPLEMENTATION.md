# Merxet x402 Branch Implementation

## Status

This document describes the functionality implemented on the `x402` branch.
It replaces the pre-implementation plan, project-change plan, and standalone
frontend-wallet integration plan.

The implementation is a testnet pilot of the custom x402 v2
`merxet-order` scheme. It is client-settled:

- the browser wallet creates and submits the Hedera transactions;
- the x402 server holds no Hedera payer or operator key;
- `merxet-sync` supplies public order and atomic-batch evidence;
- the x402 confirmation endpoint validates an already-created paid order.

The normative protocol definition remains in
[`MERXET_ORDER_X402_SCHEME.md`](./MERXET_ORDER_X402_SCHEME.md). Shared
schema-to-module traceability remains in
[`merxet-order-protocol/TRACEABILITY.md`](./merxet-order-protocol/TRACEABILITY.md).

Repository implementation is complete for the pilot. Production deployment,
funded end-to-end testnet execution, npm publication, and seller-side
fulfillment validation remain separate operational steps.

## Implemented Architecture

```text
Codex / agent
    |
    | MCP tools over local STDIO
    v
merxet-mcp
    |\
    | \-- quote creation and confirmation --> merxet-x402-server
    |                                        |        |
    |                                        |        +--> Redis quote cache
    |                                        |
    |                                        +------------> merxet-sync
    |
    +---- approval URL / QR ----> merxet-frontend browser wallet
                                      |
                                      | signs and submits
                                      v
                                   Hedera
                                      |
                                      v
                                  merxet-sync
```

The implementation adds three projects and extends two existing projects:

| Project | Branch implementation |
| --- | --- |
| `merxet-order-protocol` | Shared x402 schemas, canonicalization, crypto helpers, HTTP codecs, HCS codecs, ABI fragments, and fixtures |
| `merxet-x402-server` | Quote creation, Redis-backed retrieval, Ed25519 quote signing, and sync-backed paid confirmation |
| `merxet-mcp` | Two Codex-facing commerce tools, delivery encryption, browser handoff, local intent recovery, and proof confirmation |
| `merxet-sync` | Seed-based catalog/order routes and authoritative outer atomic-batch evidence |
| `merxet-frontend` | Trusted-profile validation, agent-order approval UI, and reuse of the existing browser wallet order flow |

The branch does not change `merxet-smartcontract` or `merxet-seller`.

## End-to-End Flow

### 1. Agent creates an order intent

Codex calls:

```ts
create_merxet_order({
  catalogSeed,
  items: [{ productId, quantity }],
  delivery: {
    fullName,
    address,
    city,
    postalCode,
    country,
    phone,
    email,
    deliveryComments?,
    noPhysicalDelivery
  }
})
```

`merxet-mcp` validates the structured request with the shared protocol
schemas. It generates:

- a random 16-byte, 22-character Base64URL `orderSeed`;
- a random 32-byte AES-256-GCM delivery key;
- a random 12-byte AES-GCM nonce.

It encrypts canonical delivery JSON using AAD bound to the scheme version,
network, and `orderSeed`.

### 2. x402 server creates the quote

MCP sends the public selection, encrypted delivery envelope, and transient
delivery key to:

```http
POST /api/v1/testnet/order-quotes
```

The x402 server:

1. validates the request;
2. checks through `merxet-sync` that the seed does not already identify an
   order;
3. checks Redis for a retained quote collision;
4. decrypts delivery data temporarily for validation and quote commitments;
5. obtains the authoritative catalog identity from `merxet-sync`;
6. fetches catalog JSON only from configured HTTPS origins with private-IP,
   redirect, size, and schema checks;
7. supports HBAR (`0.0.0`) and testnet USDC (`0.0.429274`);
8. calculates exact smallest-unit line totals and order amount;
9. assigns the pilot seller-arranged delivery option with amount `0`;
10. creates a ten-minute signed quote;
11. stores the immutable quote record with Redis create-only `SET NX`
    semantics;
12. returns x402 v2 `402 PAYMENT-REQUIRED`.

The quote digest is signed with an Ed25519 detached JWS identified by `kid`.
The delivery key and decrypted delivery data are not stored.

### 3. MCP creates the browser handoff

MCP resolves the newly created quote from:

```http
POST /api/v1/testnet/order-quotes/resolve

{ "orderSeed": "..." }
```

The response includes:

- the complete `PaymentRequired`;
- the full signed quote;
- quote digest and detached JWS;
- the encrypted delivery envelope;
- the authoritative `recoverUntil` deadline.

It does not include the delivery key or plaintext delivery.

MCP verifies the expected resource, scheme, network, seed, and request
commitment. It persists a versioned local intent containing only the public
requirements, quote reference, ciphertext, deadlines, and confirmation state.
The delivery key and plaintext delivery are not persisted.

MCP returns:

- a clickable `https://merxet.com/agent-orders/approve#...` URL;
- a PNG QR code encoding the same URL;
- the intent ID and quote expiry.

The fragment contains only the version, testnet selector, `orderSeed`, and
per-order delivery key.

### 4. Browser verifies and displays the order

`AgentOrderApprovalPage.tsx`:

1. parses the URL fragment into volatile component memory;
2. clears the fragment with `history.replaceState`;
3. reuses the same in-memory handoff and resolution promise during React
   StrictMode effect replay;
4. resolves the quote only from the configured trusted HTTPS origin/path;
5. verifies the quote digest and Ed25519 JWS against the installed `kid`
   keyring;
6. verifies the network, contract, topic, resource, asset, amount, request
   hash, and encrypted-delivery commitments;
7. decrypts and validates the delivery details;
8. displays the seller, items, amount, delivery, wallet, balance, network,
   topic, and expiry;
9. requires explicit user approval.

The browser stops normal execution 60 seconds before quote expiry. Expiry is
checked when approval starts, before and after wallet signing, and immediately
before blockchain submission.

The trusted profile is preconfigured in `merxet-frontend/src/config.ts`. It
contains the allowed origins, contract, HCS topic, and Ed25519 quote-key
keyring. Profile changes require the internal wallet to be connected and
unlocked, and they invalidate pending approvals.

### 5. Existing browser wallet submits the order

After approval, the frontend reuses the existing Merxet wallet and order
implementation. It:

1. signs `merxet-<orderSeed>` through the current wallet;
2. derives the buyer encryption key pair;
3. creates and encrypts the seller-facing order payload;
4. wraps the symmetric key for buyer and seller;
5. stores encrypted payload data through the existing HFS flow;
6. publishes the HCS reference;
7. prepares HBAR or HTS payment operations;
8. calls `createOrderPaid` through the existing HIP-551 atomic-batch flow;
9. submits the outer batch with the buyer as payer;
10. displays the outer transaction ID.

MCP has no browser callback and never receives wallet authorization, keys,
passwords, signed transaction bytes, or generic signing access.

### 6. Sync indexes settlement evidence

`merxet-sync` exposes:

```http
GET /api/v1/testnet/catalogs/seed/:catalogSeed
GET /api/v1/testnet/orders/:orderSeed
GET /api/v1/testnet/orders/:orderSeed/x402-evidence
```

The sync service correlates the order-producing contract result to its direct
inner transaction and then to the successful outer `ATOMICBATCH`. The public
evidence contains:

- order seed and current public order;
- contract ID/address;
- outer transaction ID and optional hash;
- outer consensus timestamp;
- outer payer account;
- `ATOMICBATCH` type and `SUCCESS` result.

Inner transaction records remain an internal correlation detail.

### 7. MCP confirms the paid order

Codex polls:

```ts
get_merxet_order_status({ intentId })
```

Possible states are:

```text
awaiting_settlement
proof_pending
confirmed
expired
failed
```

When evidence becomes available, MCP validates the retained seed, catalog,
contract, amount, canonical asset, buyer/payer, and outer transaction. It then
constructs a complete x402 v2 `PaymentPayload` and calls:

```http
POST /api/v1/testnet/orders/:orderSeed/confirm
PAYMENT-SIGNATURE: <encoded PaymentPayload>
```

The request has no commerce body and no delivery key.

If order/evidence indexing is still missing after quote expiry, MCP retains
`proof_pending` until the server-provided `recoverUntil`. It marks the intent
expired only when that recovery deadline is reached. Existing intents created
before `recoverUntil` was persisted use the pilot's 24-hour compatibility
fallback.

### 8. x402 server verifies and returns the order

The x402 server loads the retained Redis quote and validates:

- the complete x402 envelope;
- canonical equality with the original requirements and resource;
- the stored quote digest and JWS;
- order seed, catalog, contract, amount, asset, seller, and seller public key;
- buyer/payer equality;
- authoritative outer transaction ID, payer, type, and success result;
- an outer consensus timestamp that does not predate `quote.issuedAt`.

The server accepts an exact matching paid-order proof during the recovery
window even when consensus is after `quote.expiresAt`. The browser expiry guard
prevents normal new execution after expiry; confirmation recognizes funds
already escrowed and does not mean the seller accepted the order.

Successful confirmation returns standard `PAYMENT-RESPONSE` plus the current
public order in the resource body. Verification is read-only and does not
broadcast another transaction or trigger fulfillment.

## HTTP Behavior

Implemented outcomes include:

| Condition | Result |
| --- | --- |
| Missing payment proof | `402` with `PAYMENT-REQUIRED` |
| Malformed seed, request, or x402 envelope | `400` |
| Seed already used by a quote or indexed order | `409` |
| Unsupported product, destination policy, asset, or mixed assets | `422` |
| Quote absent, expired for retrieval, or past recovery for confirmation | `404` |
| Complete but invalid payment proof | `402` |
| Sync evidence not indexed | `503 proof_pending` with `Retry-After` |
| Redis or sync temporarily unavailable | `503` with `Retry-After` |
| Matching paid order | `200` with `PAYMENT-RESPONSE` |

The server allows configured CORS origins, accepts
`Content-Type, PAYMENT-SIGNATURE`, and exposes
`PAYMENT-REQUIRED, PAYMENT-RESPONSE`.

## Persistence and Recovery

### x402 Redis record

Redis keys use:

```text
merxet:x402:quote:<network>:<orderSeed>
```

The normal TTL is the ten-minute quote lifetime plus the configured 24-hour
recovery period, normally 87,000 seconds at creation.

Redis stores the immutable signed quote, x402 requirements, request
commitment, encrypted delivery envelope, verification metadata, expiry, and
recovery deadline. It does not store plaintext delivery, the delivery key,
wallet secrets, or the quote-signing private key.

Production mode rejects `memory://`; development and tests may use the
in-memory implementation.

### MCP local intent

MCP writes one validated JSON intent per order using an atomic temporary-file
rename. The default location is:

- Windows: `%LOCALAPPDATA%\Merxet\mcp`
- Linux/macOS-style environments: `$XDG_DATA_HOME/merxet/mcp` or
  `~/.local/share/merxet/mcp`

The directory can be overridden with `MERXET_MCP_DATA_DIR`.

The persisted intent is enough to resume public evidence polling and paid
confirmation after MCP restart. It cannot reconstruct a lost approval URL
because the delivery key is deliberately not stored.

## Security Boundaries

- The browser wallet is the only signing boundary.
- MCP exposes only order creation and order-status tools.
- No raw message signing, transaction signing, transaction submission, wallet
  unlock, private-key, or mnemonic MCP tool exists.
- The frontend verifies quotes with an installed Ed25519 public-key keyring.
- MCP cannot choose the frontend trust profile.
- Quote and resource origins are fixed HTTPS origins.
- Catalog fetching uses configured origins and SSRF protections.
- The URL fragment is removed before quote retrieval or wallet unlock.
- The delivery key stays in volatile browser state; it is not written to
  localStorage, sessionStorage, IndexedDB, Redis, sync, or MCP intent files.
- Plaintext delivery is visible to the agent and MCP because it is the tool
  input. The envelope protects cached/retrieved delivery data after the seed
  becomes known; it does not protect against the local agent that supplied it.
- The x402 server temporarily sees the delivery key and plaintext to validate
  and quote the request, but it does not persist, return, or log them.
- `merxet-sync` receives only public order and transaction evidence.
- x402 confirmation proves a matching paid public order, not correctness of
  HFS ciphertext, seller fulfillment, delivery acceptance, or final payout.

## Configuration

### x402 server

Required deployment settings:

```text
MERXET_SYNC_ORIGIN
MERXET_RESOURCE_ORIGIN
MERXET_CATALOG_ORIGINS
MERXET_QUOTE_SIGNING_KID
MERXET_QUOTE_SIGNING_KEY_PKCS8
MERXET_QUOTE_PUBLIC_KEY
MERXET_REDIS_URL
```

Optional settings:

```text
PORT
NODE_ENV
MERXET_QUOTE_PUBLIC_KEYS
MERXET_CORS_ORIGINS
MERXET_CATALOG_MAX_BYTES
MERXET_RECOVERY_SECONDS
MERXET_SYNC_RETRY_SECONDS
```

`MERXET_QUOTE_PUBLIC_KEYS` retains previous `kid` values during quote-key
rotation. The new frontend public key must be deployed before the server starts
signing new quotes with that key.

Generate an Ed25519 quote key with:

```powershell
cd merxet-x402-server
npm run generate-quote-key
```

### MCP

MCP settings:

```text
MERXET_X402_ORIGIN
MERXET_SYNC_ORIGIN
MERXET_FRONTEND_ORIGIN
MERXET_MCP_DATA_DIR
```

Origins must be bare HTTPS origins.

Install the published package in Codex with:

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

No `.exe`, native wallet application, browser extension, VPS wallet, or 2FA
component is part of this implementation.

### Frontend

Deployment must replace the pilot placeholders through:

```text
VITE_MERXET_QUOTE_ORIGIN
VITE_MERXET_RESOURCE_ORIGIN
VITE_MERXET_HCS_TOPIC_ID
VITE_MERXET_QUOTE_KEY_ID
VITE_MERXET_QUOTE_PUBLIC_KEY
```

The checked-in fallback quote key and HCS topic are placeholders and are not
production-ready trust values.

## Automated Validation

Implemented automated coverage includes:

- shared schemas, AES-GCM/AAD, JWS helpers, canonical comparison, HCS codecs,
  HTTP codecs, seller-key encoding, and Hedera address normalization;
- quote creation, retrieval redaction, Redis collision behavior,
  `proof_pending`, HBAR confirmation, and checksummed HTS confirmation;
- MCP URL/QR generation, secret-redacted persistence, restart confirmation,
  recovery-window polling, and recovery-deadline expiry;
- StrictMode-safe fragment parsing/clearing and quote execution deadlines;
- sync row mapping, seed lookup, wallet identity, HCS compatibility, and
  atomic-batch evidence correlation.

Relevant validation commands:

```powershell
cd merxet-order-protocol
npm test
npm run build

cd ../merxet-sync
npm test

cd ../merxet-x402-server
npm test
npm run build

cd ../merxet-mcp
npm test
npm run build

cd ../merxet-frontend
npm test -- --run
npm run build
npm run lint
```

## Remaining Pilot Limitations

- Only `hedera:testnet` is supported.
- HBAR and testnet USDC are the only server-configured payment assets.
- Delivery price is fixed to `0`.
- Physical-delivery string fields currently have maximum-size validation but
  still permit empty strings.
- Production Redis, domains, CORS, quote keys, frontend trust values, and npm
  publication have not been validated by repository tests.
- Funded HBAR and HTS browser transactions have not been executed as part of
  repository-only validation.
- Seller retrieval/decryption and fulfillment of an agent-created order still
  require a deployed end-to-end test.
- Exact typed fee caps, serialized-batch persistence, and complete crash-safe
  HFS/batch resubmission remain outside the pilot.
- The x402 server does not retrieve HFS file contents or attest that encrypted
  delivery data is fulfillable.
- There is no durable `payment-identifier` ledger. Confirmation is read-only
  and replay returns current public order data while the quote record remains.
- Confirmation after quote-recovery expiry or after order deletion is not
  guaranteed.

