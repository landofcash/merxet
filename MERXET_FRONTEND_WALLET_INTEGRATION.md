# Merxet Frontend Wallet Integration

## Decision

Version 1 uses the built-in wallet already implemented in `merxet-frontend`.
There is no separate `merxet-agent-wallet` project, wallet daemon, local wallet
API, native installer, VPS wallet, or 2FA implementation.

The implementation strategy is:

> Add an agent-order approval flow to `merxet-frontend` and reuse its existing
> wallet, encryption, HFS/HCS, and Hedera order-execution code.

`merxet-mcp` remains a local STDIO process with no key material. It is
installed in Codex through npm/npx. The browser frontend is the signing and
human-approval boundary.

## Existing Implementation to Reuse

### Wallet management

`merxet-frontend/src/pages/WalletPage.tsx` already provides:

- Wallet creation from a generated Hedera mnemonic.
- Import from a mnemonic or raw ECDSA private key.
- Password-protected browser storage.
- Lock, unlock, password change, backup reveal, and deletion.
- Public key, EVM alias, and Hedera account ID.
- Alias funding and automatic account-ID discovery.
- HBAR and supported HTS balances.
- HTS token association.
- Multiple saved wallets.

The existing lifecycle remains:

```text
local_only
  -> funded_or_alias_created
  -> ready
```

### Vault

The browser wallet already uses:

- Argon2id password derivation.
- Random per-record salt.
- AES-GCM authenticated encryption.
- Random IV.
- Versioned encrypted secret metadata.
- IndexedDB persistence.
- A sliding in-memory unlock session.

The agent-order flow uses the same vault. Private keys, mnemonic material,
passwords, seed signatures, AES keys, and decrypted delivery payloads never
enter MCP tools or MCP process memory.

### Merxet order encryption

Reuse:

- `merxet-frontend/src/pages/PayWithCryptoPage.tsx`
- `merxet-frontend/src/utils/keygen.ts`
- `merxet-frontend/src/utils/encryption.ts`
- `merxet-frontend/src/lib/payWithUtils.ts`

The compatible sequence is:

```text
verified quote orderSeed
  -> sign UTF8("merxet-" + orderSeed)
  -> SHA-256(signature bytes)
  -> deterministic secp256k1 buyer encryption pair
  -> random AES-256-GCM key
  -> encrypted Merxet OrderData
  -> buyer and seller ECIES-wrapped AES keys
```

Unlike the existing checkout, the agent-order route does not generate a new
seed. It uses the `orderSeed` from the verified signed quote.

### Hedera execution

Reuse:

- `merxet-frontend/src/lib/hedera/hfsStorage.ts`
- `merxet-frontend/src/lib/hedera/hcsEnvelope.ts`
- `merxet-frontend/src/lib/crypto/providers/hederaAdapter.ts`
- `createOrderPaidOnBlockchain`

The existing execution remains:

1. Upload encrypted order data to HFS.
2. Create the HCS v2 buyer-initial-order reference.
3. Add HTS `approve` for token orders.
4. Add Merxet `createOrderPaid`.
5. Submit the atomic batch as the buyer.

The new approval flow adds signed-quote verification, exact order display,
estimated network fees, and explicit browser approval. It otherwise reuses
the current transaction execution.

### Trusted quote keyring

The frontend profile contains a list of trusted Ed25519 public keys indexed by
JWS `kid`, not one replaceable key. A new public key is shipped before the
x402 server starts signing with it. Previous public keys remain in the list
until their last signed quote has passed the maximum Redis TTL (normally
87,000 seconds) plus the configured frontend deployment overlap. Keeping an
old verification key does not extend quote expiry or permit a new payment
after `expiresAt`.

The quote exposes the catalog seller using canonical forms:

- canonical Hedera `sellerAccountId`;
- the exact lowercase 20-byte Solidity `sellerEvmAddress`;
- standard padded Base64 of the normalized 33-byte compressed secp256k1
  `sellerPublicKey`.

## Codex and MCP Installation

Publish the MCP as a versioned npm package:

```text
@merxet/mcp
```

The Codex user registers it as a local STDIO server:

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

There is no Merxet executable installer. `merxet-frontend` remains the normal
HTTPS web application and MAY be installed as a PWA by the browser.

The x402 server keeps quotes in a shared Redis store with a TTL covering the
quote lifetime and bounded recovery window. This allows the wallet handoff to
survive x402 server restarts and work across server instances. If Redis is
temporarily unavailable, the frontend shows a retryable service error. If the
quote has expired or is absent, it shows that the approval is no longer
available and the MCP must create a new quote when no order was submitted.
This does not affect public lookup of an already-created, nondeleted order
through `merxet-sync`. Confirmation after deletion or quote-recovery expiry is
not guaranteed in the pilot.

## Approval Handoff

After receiving `402 PAYMENT-REQUIRED`, MCP constructs:

```ts
interface MerxetFrontendApprovalHandoffV1 {
  version: 1;
  network: "hedera:testnet";
  orderSeed: string;
  deliveryKey: string; // unpadded Base64URL, exactly 32 decoded bytes
}
```

It returns the same handoff as a clickable URL and, when supported by the MCP
client surface, a QR code:

```text
https://app.merxet.example/agent-orders/approve#v=1&network=testnet&orderSeed=<seed>&deliveryKey=<base64url-key>
```

The URL is always returned as the fallback. A desktop browser can open it
directly; a phone can scan the QR and use the Merxet wallet stored in that
mobile browser/PWA. No phone-to-MCP callback is required because MCP observes
settlement through `merxet-sync`.

The handoff is intentionally not a security authority:

- The agent already supplied the delivery details.
- MCP encrypted the delivery details with the per-order key before requesting
  the quote.
- The frontend constructs the fixed quote-resolution endpoint from its
  installed profile and fetches the complete `PaymentRequired`, full quote,
  and encrypted delivery.
- The frontend verifies quote digest and Ed25519 JWS.
- The signed quote binds the request, payment requirements, fixed zero-cost
  pilot delivery,
  canonical plaintext delivery hash, and encrypted-envelope hash.
- The frontend decrypts and validates the delivery details before the user
  reviews them.

The URL fragment is not included in the HTTP request to the frontend host.
The browser application can read it locally. After successful parsing, the
frontend MUST hold the validated browser intent and delivery key in volatile
session state and immediately remove the fragment from the visible URL with
`history.replaceState` before fetching the quote or asking for a wallet
password. A reload before approval may require reopening the URL/QR. The
volatile handoff and in-flight resolution MUST survive React StrictMode's
development effect replay so the replay does not parse the already-cleared
fragment. The handoff MUST NOT contain the full quote,
`PaymentRequired`, plaintext delivery details, ciphertext, wallet private key,
signature, vault key, or transaction bytes.

The complete URL/QR is a short-lived bearer capability: possession permits
decryption of the cached delivery envelope, but never wallet signing. The
delivery key MUST be redacted from analytics, application logs, error reports,
and UI diagnostics. Because the agent originally received the plaintext
delivery details, this encryption protects the server-side cache and public
quote retrieval—not the Codex transcript itself.

## Frontend Approval Route

Add:

```text
/agent-orders/approve
```

The page:

1. Parses and schema-validates the network, seed, and 32-byte key.
2. Holds the validated browser intent/key in volatile session state and clears
   the URL fragment.
3. Requires the configured official resource and quote origins.
4. Calls `POST /api/v1/testnet/order-quotes/resolve` at the configured origin
   with `orderSeed`.
5. Verifies `orderSeed`, quote digest, detached Ed25519 JWS, request hash,
   exact configured confirmation method/path, network, contract, topic, asset,
   amount, and expiry.
6. Verifies the signed encrypted-envelope hash.
7. Decrypts the envelope with AES-256-GCM and AAD bound to version, network,
   and `orderSeed`.
8. Validates the decrypted delivery schema and verifies the signed canonical
   plaintext hash.
9. Loads the active built-in wallet and current balances.
10. Displays the exact decrypted delivery details. A correction starts a new
    quote.
11. Displays the signed order amount, zero-cost pilot delivery option, and
    estimated network fees.
12. Requires wallet unlock and explicit Approve or Cancel.
13. Executes the approved Merxet order through the existing wallet flow.

The existing generic wallet-adapter primitives remain private frontend
implementation details. No generic signer is exposed to MCP or the agent.

Cancel is local in version 1. It abandons this browser approval/execution
record but does not revoke the cached quote or bearer handoff, which remain
usable until quote expiry.

## Approval UI

Display:

- Seller and catalog.
- Products, quantities, line amounts, asset, and total.
- Current Hedera account and balances.
- Network, Merxet contract, HCS topic, and token where applicable.
- Exact delivery details decrypted from the authenticated quote record.
- Fixed seller-arranged pilot delivery with amount `0`.
- Quote expiry.
- Estimated HFS and batch fees.
- Warning that HFS creation is not atomic with the later batch.

Any protected quote or delivery change requires a new quote and approval.

## Browser Execution State

Store non-secret agent-order state in IndexedDB:

```text
RECEIVED
  -> VERIFIED
  -> APPROVED
  -> HFS_SUBMITTING
  -> HFS_CONFIRMED
  -> BATCH_SUBMITTING
  -> BATCH_CONFIRMED
  -> COMPLETE
```

The pilot MAY persist normal progress information:

- Intent ID and order seed.
- Encrypted delivery envelope and, only when still required for
  post-approval recovery, the handoff key inside the encrypted wallet
  execution record.
- Quote digest.
- Approved delivery-details hash.
- Encryption artifacts needed for deterministic recovery.
- HFS file ID and append progress.
- Atomic-batch transaction ID/hash.
- Consensus result.

The wallet MUST record the outer transaction ID once submitted so the MCP can
confirm settlement. Complete crash-safe HFS/batch resubmission and exact
serialized-transaction recovery are post-pilot hardening; version 1 does not
claim recovery from every interruption between HFS creation and batch
consensus.

Atomic-batch construction MUST reuse the current frontend behavior without
introducing another key: the active buyer public key is `batchKey`, every
inner transaction is prepared with the Hedera SDK `batchify()` flow, and the
active buyer is every inner and outer payer and signs the outer batch.

The handoff delivery key is separate from the browser wallet vault key and
from the later seller-facing order encryption keys. It MUST be deleted after
completion, cancellation, or quote expiry.

## Returning Completion to MCP

The browser does not receive a privileged callback channel to MCP.

After Hedera consensus:

1. `merxet-sync` indexes the authoritative order and internally correlates the
   order-producing inner record to its outer atomic batch.
2. MCP polls the seed-based public evidence route.
3. MCP obtains the public buyer account, outer transaction ID, optional
   authoritative hash, and payment consensus timestamp.
4. MCP constructs the complete `PaymentPayload` using the original selected
   `PaymentRequirements` plus indexed public evidence.
5. MCP calls the exact keyless `/orders/:orderSeed/confirm` resource from the
   signed quote with `PAYMENT-SIGNATURE`; it does not retry quote creation and
   does not send `deliveryKey`.
6. The x402 server confirms the order and returns the public order response.

The frontend MAY show success as soon as consensus is confirmed. MCP recovery
continues independently using `orderSeed`. MCP persists the quote server's
authoritative `recoverUntil`, keeps post-expiry missing evidence in
`proof_pending`, and stops only when confirmation succeeds or that recovery
deadline is reached.

## Planned Frontend Modules

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

Refactor shared logic out of `PayWithCryptoPage.tsx` where necessary so both
normal checkout and agent approval use the same tested encryption and Hedera
builders.

## Security Statement

The wallet is:

- Noncustodial.
- Encrypted at rest in browser IndexedDB.
- Unlocked only in the Merxet frontend.
- Not exposed through MCP signing tools.
- Protected against accidental or ordinary agent access.

It is not a hard isolation boundary against a fully malicious process running
with the same OS-user privileges. A same-user process may be able to manipulate
browser state, inspect an unlocked browser, or capture user input.

Version 1 therefore does not claim resistance to a compromised client
operating system or malicious same-user process. Stronger isolation may later
use a signed browser extension, hardware wallet, OS keystore, or separate
device.

## Cross-Project Compatibility

Fixed fixtures MUST prove:

- Existing frontend checkout and agent approval derive the same buyer
  encryption pair for the same signature.
- AES-GCM and ECIES formats remain compatible.
- HFS ciphertext/hash and HCS v2 references match.
- HBAR and HTS `createOrderPaid` ABI arguments match.
- `merxet-seller` can retrieve and decrypt agent-created orders.
- `merxet-sync` indexes their public transaction evidence.

## Resulting Project Scope

New:

- `merxet-order-protocol`
- `merxet-x402-server`
- `merxet-mcp`

Modified:

- `merxet-frontend`
- `merxet-sync`

Compatibility validation:

- `merxet-seller`

Unchanged:

- `merxet-smartcontract`
- `merxet-promo`

## Implemented Frontend Integration

The testnet `NetworkConfig` now includes `trustedMerxetProfile` with
`quoteOrigin`, `resourceOrigin`, fixed confirmation/resolution paths,
contract ID/address, HCS topic, and an Ed25519 `trustedQuoteKeys` keyring.
Deployments supply `VITE_MERXET_QUOTE_ORIGIN`,
`VITE_MERXET_RESOURCE_ORIGIN`, `VITE_MERXET_HCS_TOPIC_ID`,
`VITE_MERXET_QUOTE_KEY_ID`, and `VITE_MERXET_QUOTE_PUBLIC_KEY`.

Concrete components:

- `/agent-orders/approve` -> `AgentOrderApprovalPage.tsx`
- fragment consumption -> `lib/agentOrders/approvalHandoff.ts`
- fixed-origin resolution and complete verification ->
  `lib/agentOrders/quoteClient.ts`
- quote-specific reuse of buyer encryption/HFS/HCS/batch execution ->
  `lib/agentOrders/agentOrderExecutor.ts`
- unlock-gated profile editing, key fingerprints, and pending-approval
  invalidation -> `lib/agentOrders/trustedProfile.ts` and `SettingsPage.tsx`

The route displays seller, items, exact smallest-unit amount, zero delivery,
network, contract, topic, wallet, balances, expiry, and fee-estimate handoff
before the explicit `Approve and pay` action. It reports the returned outer
transaction ID and Hashscan link. A profile revision change invalidates an
open approval.

Codex uses Node 22+ and:

```powershell
codex mcp add merxet -- npx -y @merxet/mcp@1.0.0
```

The MCP package exposes only `create_merxet_order` and
`get_merxet_order_status`. Configuration is `MERXET_X402_ORIGIN`,
`MERXET_SYNC_ORIGIN`, `MERXET_FRONTEND_ORIGIN`, and optional
`MERXET_MCP_DATA_DIR`.

Funded HBAR/HTS screenshots are not included because deployment, configured
public quote keys, and funded testnet execution are still pending. The
implemented UI follows the wireframe in this document without a material
layout change.
