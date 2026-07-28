# `merxet-order` x402 Scheme Specification

## 1. Status and Conformance

This document normatively defines version 1 of the custom x402 scheme
`merxet-order` for Hedera testnet.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** are to be interpreted as described by RFC 2119 and RFC 8174.

An implementation conforms to this specification only when it implements the
complete x402 v2 envelopes and all applicable validation requirements below.

## 2. Scheme Identity

```text
x402 protocol version: 2
scheme:                merxet-order
scheme version:        1
network:               hedera:testnet
settlement model:      client-settled
```

`merxet-order` is not Hedera's standard `exact` scheme.

Hedera `exact` uses a direct partially signed `TransferTransaction`, normally
assigns network fees to a facilitator, transmits serialized transaction bytes,
and asks the facilitator to broadcast during settlement.

`merxet-order` instead:

- Makes the buyer the Hedera fee payer.
- Creates encrypted Merxet order data in HFS.
- Submits HCS and Merxet contract operations in an atomic batch.
- Lets the client sign and broadcast all transactions.
- Sends an already-settled transaction proof in `PaymentPayload`.
- Defines `settle()` as confirmation that a matching Merxet order is visible
  through the configured Merxet read service.

Clients, resource servers, and facilitators MUST explicitly register support
for the pair `("merxet-order", "hedera:testnet")`.

### 2.1 Existing Merxet compatibility

Version 1 preserves the existing Merxet buyer/seller encryption and on-chain
order formats. A conforming wallet MUST reproduce the established seed
challenge, deterministic buyer encryption-key derivation, AES-GCM payload
format, ECIES wrapped-key format, HFS payload, HCS v2 reference, and
`createOrderPaid` ABI arguments.

The existing browser checkout generates an order seed locally. Under this
scheme, the wallet MUST instead use the `orderSeed` in the verified signed
quote and MUST NOT generate or substitute another seed.

Existing generic wallet primitives such as message signing, contract
execution, batch execution, or arbitrary transaction submission MUST NOT be
exposed to MCP or the agent. They MAY exist only as private functions used
after signed-quote validation, wallet unlock, and explicit approval of the
displayed Merxet order.

## 3. Supported Assets and Amounts

The `asset` field MUST use a canonical Hedera entity ID:

- HBAR MUST be `"0.0.0"`.
- An HTS fungible token MUST use its canonical `shard.realm.num` token ID.

Symbols such as `HBAR` or `USDC` are display metadata and MUST NOT be used as
protocol asset identifiers.

Amounts MUST be unsigned decimal integer strings:

- HBAR amounts are expressed in tinybars.
- HTS amounts are expressed in the token's smallest unit.

The token EVM address MAY be included in the quote as execution
metadata. The server and wallet MUST derive or independently validate it
against the canonical token ID.

`payTo` MUST be the configured Merxet contract entity ID.

## 4. Order Quote Request

Quote creation uses:

```http
POST /api/v1/testnet/order-quotes
Content-Type: application/json
```

```json
{
  "orderSeed": "22-character-seed",
  "catalogSeed": "22-character-seed",
  "items": [
    {
      "productId": "product-id",
      "quantity": 1
    }
  ],
  "encryptedDelivery": {
    "version": 1,
    "algorithm": "A256GCM",
    "nonce": "base64url-12-bytes",
    "ciphertext": "base64url-ciphertext",
    "tag": "base64url-16-bytes"
  },
  "deliveryKey": "base64url-32-bytes"
}
```

`deliveryKey` is transient request material. It MUST NOT be copied into the
quote, `PaymentRequired`, quote cache, logs, telemetry, error details, or any
response.

Quote creation and paid confirmation are deliberately separate operations.
The quote request contains the transient delivery key and returns the initial
`402 PAYMENT-REQUIRED`. After the wallet settles on Hedera, MCP does not retry
this request. It calls the keyless confirmation resource identified by the
signed quote:

```http
POST /api/v1/testnet/orders/:orderSeed/confirm
PAYMENT-SIGNATURE: <base64 PaymentPayload>
```

The confirmation request has no commerce request body and MUST NOT contain
`deliveryKey` or plaintext/ciphertext delivery data. If the confirmation
resource is called without `PAYMENT-SIGNATURE`, it MAY return the cached
`402 PAYMENT-REQUIRED` for that seed. This two-operation flow is normative for
the custom client-settled `merxet-order` scheme; byte-for-byte retry of the
quote-creation request is not required.

The server MUST canonicalize a request commitment containing `orderSeed`,
`catalogSeed`, `items`, and `encryptedDelivery`, but excluding `deliveryKey`,
using RFC 8785 JSON Canonicalization Scheme and calculate:

```text
requestHash = BASE64URL(SHA-256(canonical request UTF-8 bytes))
```

The request MUST NOT accept client-provided prices, totals, seller keys,
wallet information, transaction arguments, or seller-encryption material.

### 4.1 Delivery-details encryption

Plaintext delivery details are supplied by the agent to
`create_merxet_order` and therefore are visible to the agent and MCP process.
They MUST be encrypted before the MCP sends the order quote request.

```ts
interface MerxetDeliveryDetailsV1 {
  fullName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  deliveryComments?: string;
  noPhysicalDelivery: boolean;
}
```

Limits are measured in UTF-8 bytes after JSON string decoding:

| Field | Maximum |
| --- | ---: |
| `fullName` | 512 bytes |
| `address` | 2,048 bytes |
| `city` | 512 bytes |
| `postalCode` | 128 bytes |
| `country` | 256 bytes |
| `phone` | 128 bytes |
| `email` | 512 bytes |
| `deliveryComments` | 16,384 bytes |

The quote request MUST contain between 1 and 100 items. Each `productId` MUST
be between 1 and 512 UTF-8 bytes, and `quantity` MUST be an integer from 1
through 1,000,000. The decoded AES-GCM ciphertext MUST NOT exceed 65,536
bytes, and the complete decoded JSON request body MUST NOT exceed 131,072
bytes. Implementations MAY impose smaller deployment limits only when those
limits are published to the MCP client and do not change an already issued
quote.

MCP MUST:

- Validate the delivery object against `MerxetDeliveryDetailsV1`, reject
  unknown fields and invalid types, and omit `deliveryComments` when it is not
  supplied.
- Preserve the supplied field values. MCP MUST NOT silently rewrite names,
  addresses, postal codes, phone numbers, email addresses, or comments.
- Generate a new cryptographically random 32-byte delivery key and a new
  cryptographically random 12-byte nonce for every `orderSeed`.
- Encrypt the RFC 8785 canonical UTF-8 delivery object with AES-256-GCM.
- Authenticate the canonical AAD object defined below.
- Send the encrypted envelope and transient key to the x402 resource server
  over HTTPS.
- Retain the key only long enough to construct and return the approval
  URL/QR. Paid confirmation does not need it. MCP restart recovery can poll
  and confirm by `orderSeed`, but cannot regenerate a lost approval URL.
- Avoid logging plaintext delivery details, the delivery key, or decrypted
  data, and never send them to `merxet-sync`, analytics, or unrelated tool
  results.
- Discard its separate plaintext delivery object after encryption.

The authenticated additional data is:

```json
{
  "version": 1,
  "purpose": "merxet-order-delivery",
  "network": "hedera:testnet",
  "orderSeed": "22-character-seed"
}
```

All binary encryption fields use unpadded Base64URL. The server MUST reject an
incorrect key length, nonce length, authentication tag, AAD, ciphertext size,
schema, or canonical plaintext encoding.

For the pilot MVP, the x402 server decrypts the delivery object only to
validate its schema and construct the signed delivery commitments. It does
not calculate destination-dependent delivery pricing. Every quote MUST use:

```text
delivery.optionId = "pilot-seller-arranged"
delivery.optionName = "Seller-arranged delivery"
delivery.amount = "0"
```

`delivery.required` MUST equal `!noPhysicalDelivery`. The payment amount is
therefore the item subtotal. A later delivery-pricing version requires an
explicit authoritative seller/catalog delivery-policy source and a new
scheme version or compatible capability flag; it MUST NOT silently introduce
a fee into version 1.

Both server and frontend wallet MUST independently validate the decrypted
object against the same schema without cleaning or rewriting its field
values. They MUST calculate:

```text
deliveryDetailsHash =
  BASE64URL(SHA-256(RFC8785(validated delivery details) UTF-8 bytes))
```

RFC 8785 canonicalization is used only to make hashing deterministic; it is not
business-data normalization. The frontend MUST display the exact validated
values in the approval UI. A delivery change requires a new server quote,
because it changes the signed delivery commitment. Only delivery details
covered by the active signed quote may be used to construct the encrypted HFS
order payload.

The server MUST NOT persist, cache, log, return, or retain references to the
transient plaintext or raw delivery key after quote construction. Mutable
temporary buffers SHOULD be overwritten where practical. It MUST cache only
the encrypted delivery envelope and its signed commitments. If a future
implementation needs later server-side decryption, it MUST store a separately
wrapped copy of the delivery key under a server/KMS key; the raw key MUST NOT
be stored beside the ciphertext or returned by quote retrieval.

## 5. Quote

### 5.1 Quote object

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
    symbol: string;
    name: string;
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

`sellerAccountId` is the canonical Hedera `shard.realm.num` account ID
resolved for the catalog seller. `sellerEvmAddress` is the exact 20-byte
Solidity address returned by `catalogs(catalogSeed).seller`, encoded as
lowercase `0x` followed by 40 hexadecimal characters; the scheme does not
reinterpret it as either an alias or a long-zero address. `sellerPublicKey`
is standard padded Base64 of exactly 33 decoded bytes containing the
normalized compressed secp256k1 catalog encryption public key. Nested Base64,
hex, uncompressed keys, and noncanonical encodings MUST be normalized by the
quote server before signing and MUST NOT appear in a quote.

`issuedAt` and `expiresAt` are Unix seconds. Version 1 quotes have a maximum
600-second lifetime.

`orderSeed` is also the quote identifier. It MUST be newly generated with
cryptographically secure randomness by MCP for every quote and encoded using
the existing unpadded 22-character base64url UUID representation.

The quote MUST satisfy:

```text
itemSubtotal = sum(items[].lineAmount)
payment.amount = itemSubtotal + delivery.amount
deliveryDetailsHash = SHA-256(canonical decrypted delivery JSON)
encryptedDeliveryHash = SHA-256(canonical encrypted-delivery envelope JSON)
expiresAt > issuedAt
expiresAt - issuedAt <= 600
```

The server MUST:

- Accept the MCP-generated `orderSeed` only when it has the required
  22-character representation and is not already bound to another request.
- Store the immutable quote under `(network, orderSeed)`.
- Require MCP to generate a new random seed for every quote. The server MUST
  reject collisions with retained quotes and existing on-chain orders; it is
  not required to retain every expired unused seed forever.
- Require MCP to submit a new seed when replacing, refreshing, or repricing a
  quote.
- Reject any attempt to overwrite different quote contents under an existing
  seed.

### 5.2 Trusted frontend wallet profile

The deployed frontend wallet MUST include a default trusted Merxet profile:

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

The default profile is built into the frontend wallet configuration and is
independent of agent, MCP, `PaymentRequired`, and quote data. MCP MAY read the
active public profile identifier but MUST NOT create, edit, select, or delete
trusted profiles.

A user MAY change the profile only through the frontend wallet settings UI.
The change MUST require wallet unlock, display origin, network, contract,
topic, and key fingerprints, show a high-risk warning, and invalidate pending
browser approvals created under the previous profile.

For version 1, trusted quote-key additions and rotations SHOULD be distributed
with a frontend release. A remotely downloaded key MUST NOT become trusted
merely because it is returned by the quote endpoint.

`trustedQuoteKeys` is a keyring, not a single current key. The server signs
new quotes with one active private key and `kid`, while the frontend retains
the public keys for older `kid` values. Rotation MUST follow this order:

1. ship the new public key in the frontend keyring;
2. allow the frontend release to propagate;
3. switch the server's active signing key;
4. retain each previous public key until the last quote it signed has passed
   the maximum Redis quote TTL plus the planned frontend deployment overlap.

With the pilot's normal 87,000-second Redis TTL, a previous key MUST remain
trusted for at least that remaining TTL after its final signed quote, plus a
deployment overlap configured by Merxet operations. Retaining a verification
key does not extend `expiresAt`: an expired quote can be verified for recovery
but MUST NOT authorize a new transaction.

### 5.3 Digest and JWS

The server MUST canonicalize the quote using RFC 8785 and calculate:

```text
quoteDigest = BASE64URL(SHA-256(canonical quote UTF-8 bytes))
```

The server MUST create an Ed25519 detached compact JWS whose payload is the
UTF-8 bytes of `quoteDigest`. Its protected header MUST contain:

```json
{
  "alg": "EdDSA",
  "kid": "merxet-quote-key-id",
  "typ": "merxet-order-quote+jws"
}
```

The JWS construction is:

```text
protected64 = BASE64URL(UTF8(protected header JSON))
payload64 = BASE64URL(UTF8(quoteDigest))
signingInput = ASCII(protected64 + "." + payload64)
signature = Ed25519(signingInput)
detachedCompact = protected64 + ".." + BASE64URL(signature)
```

Implementations MUST use a maintained JOSE library. Fixed fixtures define the
protected-header serialization and expected detached compact value; custom
JWS implementations are out of scope.

The frontend wallet MUST verify the JWS using the matching `kid` from its
active trusted Merxet profile. It MUST reject unsupported algorithms/types,
unknown keys, invalid signatures, digest mismatches, and unknown
protected-header fields.
The protected header MUST contain only `alg`, `kid`, and `typ`; unprotected
headers, `crit`, and `b64: false` are forbidden. The configured Ed25519 public
key MUST decode to 32 bytes and the signature MUST decode to 64 bytes.

The JWS authenticates the quote contents and issuer. The configured HTTPS
origin is a safe retrieval boundary that prevents agent-controlled arbitrary
URL fetching; it is not the cryptographic authority for the quote.

### 5.4 Quote retrieval

The full quote and encrypted delivery envelope are retrieved from:

```http
POST /api/v1/testnet/order-quotes/resolve
Content-Type: application/json

{ "orderSeed": "22-character-seed" }
```

Response:

```json
{
  "paymentRequired": {},
  "quote": {},
  "quoteDigest": "base64url-sha256",
  "quoteJws": "protected..signature",
  "recoverUntil": 1700087000,
  "encryptedDelivery": {
    "version": 1,
    "algorithm": "A256GCM",
    "nonce": "base64url-12-bytes",
    "ciphertext": "base64url-ciphertext",
    "tag": "base64url-16-bytes"
  }
}
```

`recoverUntil` is the server's Unix-seconds deadline for submitting proof of an
exact matching paid order. It MUST be later than `quote.expiresAt`. MCP MUST
persist this returned value with the intent rather than independently
duplicating the server recovery configuration.

The response MUST NOT contain `deliveryKey` or plaintext delivery fields. The
quote response MUST be immutable and use:

```http
Cache-Control: private, no-store
```

The frontend wallet MUST:

- Start from the HTTPS Merxet origin in the active frontend wallet profile.
- Call only the `quoteResolutionPath` installed in that profile.
- Reject userinfo, origin changes, and cross-origin redirects.
- Require the returned `orderSeed`, digest, and JWS to equal the reference.
- Recalculate the digest from the canonical returned quote.
- Verify the JWS using the active trusted profile.
- Verify the complete returned `PaymentRequired`, selected requirements,
  request hash, resource method/path, and every payment term duplicated in the
  signed quote.
- Require the protected resource URL/path to equal the installed confirmation
  template instantiated with the same `orderSeed`.
- Require `PaymentRequirements.extra.quotePath` to equal the installed
  `quoteResolutionPath`; it is confirmation metadata, not a pre-fetch routing
  authority.
- Hash the returned encrypted envelope and compare it to the signed
  `encryptedDeliveryHash`.
- Decrypt it using the fragment key and the specified AAD.
- Validate the decrypted schema and compare its canonical hash to the signed
  `deliveryDetailsHash`.

MCP MUST NOT select the trusted origin, quote key, network, contract, or topic
for the frontend wallet.

An expired quote MUST NOT authorize a new execution. The version 1 server
implementation uses Redis as a shared, TTL-bounded quote store. The canonical
key format is:

```text
merxet:x402:quote:<network>:<orderSeed>
```

The server MUST create a quote atomically with create-only semantics equivalent
to Redis `SET NX`. It MUST set a TTL covering the remaining quote lifetime plus
the bounded 24-hour recovery period; for a newly issued ten-minute quote this
is normally 87,000 seconds. The stored JSON MUST pass the shared quote-record
schema when written and read.

Redis MUST contain only the immutable signed quote, `PaymentRequired`, quote
digest/JWS, request commitment, expiry, verification metadata, and
authenticated encrypted delivery envelope. It MUST NOT contain the delivery
key, decrypted delivery details, buyer wallet secrets, or quote-signing
private key. Redis is not the authoritative order store and is not a durable
`payment-identifier` idempotency ledger.

Quote retrieval MUST remain available until `expiresAt` while Redis is
available and retains the key. A proof MAY arrive during the recovery period
when `merxet-sync` proves that the successful outer batch created the exact
paid order committed by the signed quote. Confirmation recognizes escrowed
payment; it does not mean that the seller accepted the order. Proofs received
after the recovery period are rejected. A missing or expired quote returns the
missing-quote outcome. A Redis outage returns the temporary-unavailability
outcome and MUST NOT fall back to an independent process-local cache in a
deployed environment.

If the quote is missing and no order was submitted, the client creates a new
quote with a new `orderSeed`. If the order was already submitted, its public
on-chain state remains recoverable through `merxet-sync`, even though the lost
x402 challenge cannot be reconstructed. No relational database, SQLite,
file-backed store, ORM, RedisJSON module, or permanent quote tombstone is
required in version 1.

## 6. `PaymentRequired`

The resource server MUST encode this x402 v2 object in the
`PAYMENT-REQUIRED` response header:

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.merxet.example/api/v1/testnet/orders/22-character-seed/confirm",
    "description": "Create and pay for a Merxet order",
    "mimeType": "application/json",
    "serviceName": "Merxet"
  },
  "accepts": [
    {
      "scheme": "merxet-order",
      "network": "hedera:testnet",
      "amount": "100000000",
      "asset": "0.0.0",
      "payTo": "0.0.7565091",
      "maxTimeoutSeconds": 600,
      "extra": {
        "schemeVersion": 1,
        "orderSeed": "22-character-seed",
        "quoteDigest": "base64url-sha256",
        "quotePath": "/api/v1/testnet/order-quotes/resolve",
        "quoteJws": "protected..signature"
      }
    }
  ],
  "extensions": {}
}
```

The full quote MUST NOT be embedded in `PaymentRequirements.extra`.
`PAYMENT-REQUIRED` MUST still contain all x402 core fields, including amount,
asset, `payTo`, and timeout.

The server MAY also return the decoded `PaymentRequired` in the JSON response
body. The header is the canonical HTTP representation.

No `payment-identifier` extension is required or declared in version 1.

### 6.1 Frontend approval handoff

The Codex client implementation uses:

```ts
interface MerxetFrontendApprovalHandoffV1 {
  version: 1;
  network: "hedera:testnet";
  orderSeed: string;
  deliveryKey: string;
}
```

MCP MUST schema-validate the object and append its unpadded Base64URL fields
as the fragment of the configured official frontend route:

```text
https://app.merxet.example/agent-orders/approve#v=1&network=testnet&orderSeed=<seed>&deliveryKey=<base64url-key>
```

The handoff MUST NOT contain the full quote, `PaymentRequired`, plaintext
delivery details, ciphertext, wallet password, wallet private key, mnemonic,
signature, or transaction bytes. `deliveryKey` is the only secret in the
handoff and is used only to decrypt this order's cached delivery envelope.

The handoff is a short-lived bearer capability, not a signing authority. The
frontend MUST construct the fixed quote-resolution endpoint from its installed
trusted profile, fetch the quote and encrypted delivery by `orderSeed`, verify
the quote digest/JWS, decrypt the delivery envelope, and verify all signed
commitments and payment requirements before displaying approval.

The URL fragment is not sent in the HTTP request to the frontend host. Because
the approval URL is returned to the agent, the key is not confidential from
the agent or MCP; the agent already received the plaintext delivery details as
tool input. The encryption protects the quote cache and retrieval response
after `orderSeed` becomes public, not the local agent transcript.

After successful parsing, the frontend MUST hold the validated intent and
delivery key in volatile browser-session state, then remove the fragment from
the visible URL before quote retrieval or wallet unlock. Before approval, a
reload MAY require reopening the URL/QR. If crash recovery after approval
still requires the handoff key, it MUST be moved into the encrypted wallet
execution record; it MUST NOT be persisted as plaintext in IndexedDB or local
storage.

Development-mode effect replay MUST reuse the same volatile parsed handoff.
The frontend MUST retain the parsed handoff in component memory before
clearing the fragment and MUST NOT attempt to parse the already-cleared URL
during a React StrictMode effect replay.

Cancel is local in version 1. It abandons the browser approval/execution
record but does not revoke the server quote or bearer handoff; they remain
usable until quote expiry. No quote-revocation endpoint is defined.

## 7. Frontend Wallet Approval

Before execution, the frontend wallet MUST verify the signed quote and
trusted profile, decrypt and validate the committed delivery details, unlock
the wallet, and display the seller, catalog, items, zero-cost pilot delivery
option, payment asset, exact order amount, network, contract, topic, quote
expiry, and estimated network fees. The user MUST explicitly approve this
Merxet order.

The pilot reuses the existing frontend HFS/HCS/atomic-batch execution flow
after approval. Exact per-transaction fee caps, a canonical typed execution
plan, frozen-transaction conformance checks, and complete crash-safe
submission recovery are post-pilot wallet hardening and are not requirements
of `merxet-order` version 1.

Any change to the signed quote, payment amount, asset, seller, catalog,
delivery details, trusted profile, or expiry requires a new quote and a new
explicit approval. Generic signing or transaction tools remain unavailable
to MCP and the agent.

## 8. Client Transaction

After approval, the frontend wallet:

1. Independently revalidates the delivery details and checks their RFC 8785
   canonical hash against `deliveryDetailsHash`.
2. Signs `merxet-${orderSeed}`.
3. Derives the existing Merxet buyer ECIES keypair.
4. Builds and AES-GCM encrypts the existing order payload.
5. Encrypts the symmetric key for buyer and seller.
6. Computes plaintext, ciphertext, and symmetric-key hashes.
7. Creates/appends the HFS file as the buyer.
8. Builds the HCS v2 buyer-initial-order reference.
9. Builds the atomic batch.
10. Signs and submits using the existing buyer wallet flow.
11. Waits for consensus and records the public transaction identifier before
    reporting completion.

HBAR batch:

```text
CONSENSUSSUBMITMESSAGE
CONTRACTCALL createOrderPaid
```

HTS batch:

```text
CONSENSUSSUBMITMESSAGE
CONTRACTCALL approve
CONTRACTCALL createOrderPaid
```

The existing frontend batch construction is normative:

- `batchKey` MUST be the active buyer account public key.
- The buyer MUST be the outer and every inner payer.
- Every inner transaction MUST be prepared with the supported Hedera SDK
  `batchify(client, buyerPublicKey)` flow.
- Every inner transaction MUST have a unique transaction ID,
  `nodeAccountID = 0.0.0`, `scheduled = false`, `nonce = 0`, the buyer batch
  key, and all required payer/operation signatures before insertion.
- No inner transaction may itself be an atomic batch.
- The outer transaction MUST have no `batchKey`, contain the approved inner
  transactions in approved order, use the buyer as payer, and be signed by the
  buyer key, which also satisfies the common inner batch-key signature.

Version 1 MUST NOT introduce a random per-order batch key or change the
existing buyer-key `batchify()` order flow.

## 9. `PaymentPayload`

After `merxet-sync` indexes the settled order, MCP MUST construct the complete
x402 v2 payload from:

- The exact selected `PaymentRequirements` retained from the initial `402`.
- The public buyer account and authoritative outer atomic-batch transaction ID
  returned by the configured seed-based evidence route.

Before constructing the payload, MCP MUST require the indexed evidence to
match the retained order seed, network, contract, catalog, canonical asset,
amount, nonzero payer, and successful outer atomic batch internally correlated
to the order by `merxet-sync`.

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.merxet.example/api/v1/testnet/orders/22-character-seed/confirm",
    "description": "Create and pay for a Merxet order",
    "mimeType": "application/json",
    "serviceName": "Merxet"
  },
  "accepted": {
    "scheme": "merxet-order",
    "network": "hedera:testnet",
    "amount": "100000000",
    "asset": "0.0.0",
    "payTo": "0.0.7565091",
    "maxTimeoutSeconds": 600,
    "extra": {
        "schemeVersion": 1,
        "orderSeed": "22-character-seed",
        "quoteDigest": "base64url-sha256",
        "quotePath": "/api/v1/testnet/order-quotes/resolve",
        "quoteJws": "protected..signature"
      }
  },
  "payload": {
    "transactionId": "0.0.1234@1700000000.000000000",
    "buyerAccountId": "0.0.1234"
  },
  "extensions": {}
}
```

The RFC 8785 canonical JSON bytes of `PaymentPayload.accepted` MUST byte-equal
the RFC 8785 canonical JSON bytes of the selected `PaymentRequirements`
object retained with the quote. Unknown, added, removed, or differently typed
fields therefore cause rejection. MCP MUST copy the selected object without
reconstructing or modifying it from frontend state or current server
defaults.

MCP MUST encode the completed payload as the base64-encoded
`PAYMENT-SIGNATURE` header and call the signed quote's exact keyless
confirmation resource. It MUST NOT retry the quote-creation request.

## 10. Verification

The verifier MUST:

1. Validate the complete x402 envelope and scheme version.
2. Load the quote retained in Redis,
   recalculate its digest, verify its JWS with the configured trusted key, and
   verify the original quote-request commitment, protected confirmation
   resource, and duplicated payment requirements. If the quote is no longer in
   Redis, return the missing-quote outcome below rather than
   attempting partial verification from the supplied proof.
3. Query the configured `merxet-sync` service by `orderSeed`.
4. If the order or outer-batch association is not indexed yet, optionally
   request a sync refresh and return `proof_pending`.
5. Require that the sync order exists on the configured network and Merxet
   contract.
6. Require the supplied transaction ID to equal the authoritative outer
   atomic-batch transaction ID internally correlated by `merxet-sync`.
7. Require the outer transaction type to be `ATOMICBATCH` and result to be
   `SUCCESS`.
8. Require the order buyer and payer to equal `buyerAccountId`.
9. Require the canonical order asset and amount to equal
   `PaymentPayload.accepted`.
10. Require a nonzero payer and a state produced by payment or a later
   post-payment transition. `None`, `Initial`, and any canceled order with a
   zero payer are not payment.
11. Require the order catalog seed to equal the retained quote catalog seed.
12. Require:

```text
quote.issuedAt <= outerBatch.consensusTimestamp
```

`quote.expiresAt` prevents the normal wallet flow from initiating a new
execution. It does not cause confirmation to deny an exact matching order
whose funds are already escrowed on-chain; the seller still decides whether
to process or refuse that paid order.

13. Require the public order seller address and normalized seller encryption
    public key to equal the signed quote.
14. Return the current public order state. The current status is not required
    to remain `Paid`.

The pilot wallet is not required to re-read mutable catalog state immediately
before submission. The signed quote remains the wallet's authorization input,
and the x402 endpoint performs the authoritative post-settlement comparison
above. If the contract catalog changes between quote issuance and execution,
the endpoint rejects the mismatch even though the transaction may already
have placed funds in Merxet escrow. The buyer then uses the existing
cancellation/refund path. This race is an accepted pilot limitation; a wallet
preflight catalog check may be added later as defense in depth.

The x402 server does not reconstruct the atomic batch and does not separately
validate HCS messages, HFS contents, HTS approval calls, contract child
records, or Merxet events. The pilot wallet reuses the existing transaction
construction after signed-quote approval. Detailed seller-side commercial
validation is outside the x402 pilot; the x402 response does not attest that
the encrypted seller payload is complete, correct, or fulfillable.

`merxet-sync` MUST internally correlate the order event/contract call to its
outer atomic batch using Hedera batch records. Its public evidence route needs
to expose only the authoritative outer transaction ID, optional authoritative
hash, outer consensus timestamp, `ATOMICBATCH` type, `SUCCESS` result, payer,
and cached public order. Inner transaction records remain an internal sync
implementation detail. If this association has not yet been indexed,
verification is `proof_pending`, not invalid. A direct contract-state or
Mirror Node fallback is not used for successful verification in the x402
server.

## 11. Verification and Settlement Semantics

`verify()` performs no blockchain execution. It confirms that a matching paid
Merxet order and its outer atomic batch are available through `merxet-sync`
and returns:

```json
{
  "isValid": true,
  "payer": "0.0.1234"
}
```

`settle()` MUST NOT broadcast. It rechecks the current public order and returns
the standard x402 settlement shape:

```json
{
  "success": true,
  "payer": "0.0.1234",
  "transaction": "0.0.1234@1700000000.000000000",
  "network": "hedera:testnet",
  "amount": "100000000",
  "extensions": {}
}
```

The base64-encoded JSON is returned in `PAYMENT-RESPONSE`. `orderSeed`,
authoritative transaction hash, current status, and public order fields are
returned only in the separate resource JSON body.

## 12. HTTP Encoding and Errors

All three x402 headers use UTF-8 JSON encoded as RFC 4648 base64 without line
breaks:

```text
PAYMENT-REQUIRED  = BASE64(UTF8(JSON PaymentRequired))
PAYMENT-SIGNATURE = BASE64(UTF8(JSON PaymentPayload))
PAYMENT-RESPONSE  = BASE64(UTF8(JSON SettlementResponse))
```

Implementations SHOULD use official x402 encoder/decoder functions.

Required HTTP outcomes:

| Condition | Status | x402 header |
| --- | ---: | --- |
| Malformed seed, delivery key/envelope, failed AES-GCM authentication, or invalid decrypted delivery schema | 400 | none |
| Malformed Base64, UTF-8, JSON, `PAYMENT-SIGNATURE`, or x402 envelope | 400 | none |
| Quote is absent or expired in Redis | 404 | none |
| Destination unavailable or address correction required | 422 | none |
| Payment absent | 402 | `PAYMENT-REQUIRED` |
| Complete invalid proof | 402 | `PAYMENT-REQUIRED` |
| Order or transaction evidence not fully indexed | 503 | none; include `Retry-After` |
| `merxet-sync` unavailable during seed collision checking or paid confirmation | 503 | none; include `Retry-After` |
| Redis unavailable | 503 | none; include `Retry-After` |
| Same valid proof replayed while quote and current order remain available | 200 | `PAYMENT-RESPONSE` |
| Valid newly observed proof | 200 | `PAYMENT-RESPONSE` |

The server MUST NOT initiate another transaction or off-chain side effect when
the same valid proof is replayed.

Browser-facing deployments MUST allow `Content-Type` and
`PAYMENT-SIGNATURE`, and expose `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE`:

```http
Access-Control-Allow-Headers: Content-Type, PAYMENT-SIGNATURE
Access-Control-Expose-Headers: PAYMENT-REQUIRED, PAYMENT-RESPONSE
```

## 13. Replay and Idempotency

Order creation is authoritative on-chain and the Merxet contract rejects an
order seed while an order with that seed exists. Server processing after
payment is read-only.

Therefore:

- A valid proof MAY be submitted multiple times while the retained quote and
  current order remain available.
- The server MUST return the current public order information when that order
  still exists.
- No durable server payment-identifier store is required.
- `payment-identifier` MUST NOT be declared required in scheme version 1.
- The frontend wallet SHOULD retain the submitted outer transaction ID for
  normal UI progress. Complete interruption recovery is outside the pilot.
- MCP MUST recover the same public proof from `merxet-sync` and call the
  keyless confirmation resource with the originally selected requirements
  instead of initiating another approval.
- If both public order and evidence lookups are still missing after
  `quote.expiresAt`, MCP MUST retain `proof_pending` and continue checking
  until the server-provided `recoverUntil`. It marks the intent `expired` only
  at that recovery deadline.

Version 1 does not promise confirmation or replay after the order has been
deleted, after its quote/recovery record has expired, or after the seed has
later been reused. A deleted order may return `404`. Merxet does not retain a
permanent seed tombstone for this pilot.

The confirmation is not buyer authentication. If a future resource response
contains private data or bearer capabilities, that resource MUST introduce
separate wallet authentication.

## 14. Delivery Data Boundary

The agent and MCP process receive plaintext delivery details because they are
inputs to the commerce tool. MCP encrypts them under a fresh per-order
delivery key before calling the x402 server. The x402 server decrypts them
transiently to validate the schema and create the signed delivery
commitments; pilot delivery cost is always zero. It then caches only the
encrypted envelope. The URL/QR contains only `network`,
`orderSeed`, and the delivery key; the wallet retrieves and decrypts the
authoritative signed quote data before approval.

The delivery key MUST never be returned by quote retrieval, included in
`PaymentRequired`, stored in the quote record, or exposed by `merxet-sync`.
Possession of the complete URL/QR allows decryption of the cached delivery
details until expiry, so it MUST be treated as a short-lived bearer secret.

HCS messages and HFS contents are outside the x402 confirmation boundary. The
x402 endpoint confirms and returns public order information; it does not attest
that encrypted delivery data is present, complete, correct, or decryptable.

The wallet remains responsible for constructing the approved HCS and HFS
operations. Seller and buyer clients retain HFS retrieval, decryption, hash
validation, fulfillment, refusal, cancellation, and refund behavior.

Cross-project compatibility fixtures MUST prove that `merxet-seller` can
retrieve and decrypt an order produced by the scheme wallet and that the
buyer-side encrypted key and payload remain compatible with
`merxet-frontend`.

## 15. Compatibility Fixtures

`merxet-order-protocol` MUST provide fixed fixtures for:

- HBAR `PaymentRequired`.
- HTS `PaymentRequired`.
- HBAR and HTS `PaymentPayload`.
- Successful and failed `SettlementResponse`.
- UTF-8 JSON and expected base64 header values.
- Trusted wallet profile, quote canonical JSON, digest, detached JWS,
  HTTPS origin/path validation, and expiry.
- Fixed handoff AES-256-GCM key, nonce, AAD, canonical delivery plaintext,
  ciphertext/tag, plaintext hash, encrypted-envelope hash, and minimal
  URL-fragment encoding.
- Rejection fixtures for incorrect key, nonce, tag, AAD, order seed,
  plaintext hash, ciphertext hash, and attempts to return the key from quote
  retrieval.
- Existing `merxet-` seed challenge and deterministic buyer encryption-key
  derivation.
- AES-GCM payload and buyer/seller ECIES wrapped-key encodings with expected
  plaintext, ciphertext, and symmetric-key hashes.
- HFS ciphertext bytes/hash and matching HCS v2 reference.
- HBAR and HTS `createOrderPaid` ABI arguments matching the existing frontend.
- HCS v1 decoding.
- HCS v2 HBAR (`token = "0.0.0"`) encoding.
- HCS v2 HTS token-ID encoding.
- Unknown protocol/scheme version rejection.
- Modified `accepted`, quote digest, JWS, origin/path, trusted profile, and
  proof rejection.

Fixture JSON MUST contain no production URLs, accounts, keys, or secrets.

## 16. Implementation Traceability

The pilot implementation maps this specification to
`merxet-order-protocol/TRACEABILITY.md` and the expanded conformance table in
`MERXET_ORDER_X402_PLAN.md`. Machine-readable normative examples live under
`merxet-order-protocol/fixtures/`; automated protocol, sync, server, frontend,
and MCP validation consumes the same exported schemas and codecs rather than
maintaining application-local wire definitions.
