<div align="center">
  <img src="https://merxet.com/logo-64x64.png" alt="Merxet logo" />

# Merxet

**END-TO-END ENCRYPTED RETAIL PROTOCOL ON HEDERA**

**Sell products with just a QR code -- no POS, no apps, no merchant account.**

[Seller Portal](https://merxet.com) | [Promo Catalog](https://promo.merxet.com) | [Pitch Deck](https://merxet.com/merxet-pitch-deck-final.pdf) | [Demo Video](https://youtu.be/H70hg3E135g)

**Status:** Live hackathon MVP on **Hedera Testnet**
</div>


## How it works (TL;DR)

**Merxet turns any physical location, flyer, or product into an instant crypto checkout point.**

1. Seller creates a catalog → gets a QR code
2. Buyer scans → shops → pays in crypto
3. Funds are escrowed → seller fulfills → gets paid

> **No centralized storage for sensitive data - orders, payments, and messaging are handled via Hedera services with end-to-end encryption.**

## What is Merxet 
Merxet lets merchants sell products through a simple QR-code checkout -- while keeping payments, messaging, and order data secured on Hedera with end-to-end encryption.

Under the hood, it is a decentralized retail protocol built on Hedera that combines:

* a **seller portal** for publishing catalogs, generating checkout QR codes, and managing orders
* a **mobile buyer app** for scanning, shopping, and paying with HBAR or supported tokens
* a **smart-contract escrow layer** for order lifecycle and settlement
* an **end-to-end encrypted data flow** so only buyer and seller can read order details

## The Problem

* POS systems are expensive, fragmented, and hardware-dependent
* Crypto checkout is still too complex for everyday users
* Order and delivery data is typically centralized and exposed

**Merxet fixes this by combining checkout, escrow, and private messaging into one simple flow.**

---
<div align="center">
  <img src="https://merxet.com/merxet-order-flow.png" alt="Merxet protocol diagram" />
</div>

## What the MVP Already Does

### Commerce

* Seller portal to create catalogs, generate QR-based checkout, and handle order fulfillment
* Buyer app to scan QR codes, browse products, build a cart, and pay with HBAR or USDC
* Real checkout flows on testnet

### Privacy

* End-to-end encrypted order payloads
* Private delivery updates between buyer and seller
* Hedera's built-in encrypted browser wallet to simplify onboarding.

### Infrastructure

* Smart contract for escrow, lifecycle, refunds, and settlement
* Hedera File Service (HFS) for encrypted payload storage
* Hedera Consensus Service (HCS) for message coordination
* Mirror-node-backed sync API for fast UX

---

<div align="center">
  <img src="https://merxet.com/merxet-encryption-flow-creation-final.png" alt="Merxet encryption flow diagram" />
</div>

---

<div align="center">
  <img src="https://merxet.com/merxet-decryption-flow-final.png" alt="Merxet decryption flow diagram" />
</div>


## How It Works

1. **Seller publishes a catalog**

The seller creates a catalog in the seller portal. The smart contract stores the seller wallet, seller public key, and a catalog URL. Catalog JSON and media can be hosted on the seller's own infrastructure or a CDN, while trust-critical state lives on Hedera.

2. **Buyer scans and creates an order**

The buyer scans a QR code, opens the buyer app, reviews the cart, and proceeds to checkout. The app creates a random order seed, derives deterministic encryption keys from a wallet-signed message, encrypts the order payload client-side, uploads the ciphertext to Hedera File Service, posts an HCS reference envelope, and creates or pays the order through the Merxet smart contract.

3. **Funds are escrowed on Hedera**

The contract records the order, token, amount, buyer key material, seller key material, and payload hashes. Funds remain locked in escrow until the order is completed or refunded according to the protocol.

4. **Seller decrypts and fulfills**

The seller portal reads the order, regenerates the needed private key from the signed seed flow, decrypts the order payload, and fulfills the order. The seller can then post an encrypted delivery update or refusal response back through HFS + HCS and move the order to the next on-chain state.

5. **Buyer confirms and seller gets paid**

The buyer decrypts the seller's delivery update and confirms receipt. The smart contract releases escrow to the seller. If the flow breaks down, cancellation, refund request, admin refund, and timeout paths are already implemented in the contract.

## Hedera Integration

| Hedera capability | How Merxet uses it | Why it matters |
| --- | --- | --- |
| **Smart Contract Service** | Catalog registry, order lifecycle, escrow, cancel/refund logic, timeout logic, payout settlement | Hedera is not just a payment rail here; it is the source of truth for commerce state |
| **Consensus Service (HCS)** | Buyer and seller publish compact message envelopes per order | Gives Merxet a tamper-evident coordination layer without running its own messaging backend |
| **File Service (HFS)** | Stores encrypted order and delivery payloads, with hash-verified retrieval | Keeps private data off the contract while still using Hedera infrastructure |
| **Mirror Node + JSON-RPC** | Reads contract state, topic messages, balances, and event logs | Powers searchable history and responsive UX in the apps |
| **Wallet ecosystem** | HIP-551 & built-in encrypted wallet | Lowers onboarding complexity and makes Hedera more accessible to non-expert users. |

## Why This Is Innovative

- Merxet is not another generic storefront. It is an **end-to-end encrypted retail protocol** for physical-world checkout.
- It combines **escrow + encrypted private order data + seller fulfillment messaging** in one Hedera-native flow.
- It uses **HCS + HFS + smart contracts together**, rather than using Hedera only for payments.
- It reduces one of the biggest Web3 UX barriers by supporting a **built-in encrypted wallet**.
- It targets a real commerce wedge that can expand Hedera usage beyond traders and token holders into everyday merchant-buyer interactions.

## Key Design Decisions

- **Keep the checkout surface simple.** Merxet starts with the shortest path to purchase: scan a QR, review a catalog, pay.
- **Use HFS for ciphertext and HCS for references.** This keeps topic messages compact while preserving integrity through payload hashes.
- **Encrypt before writing.** Sensitive order data is never sent to the sync service in plaintext and is never stored in the contract.
- **Derive per-order keys from signed seeds.** The protocol avoids maintaining a private-key database for buyer/seller order decryption.
- **Separate protocol-critical data from convenience data.** Catalog content can live off-chain, but the trust-critical commerce state and private message references live on Hedera.
- **Prioritize onboarding.** The built-in wallet exists because real retail adoption will fail if every buyer must already be a power user.

## Try it in 2 minutes

### Buyer experience
1. Open [Promo Catalog](https://promo.merxet.com)
2. Scan a QR code
3. Create a wallet → pay with test HBAR


<div align="center">
  <img src="https://merxet.com/slides/slide-2.jpg" alt="Merxet encryption flow diagram" />
</div>

### Seller experience, full order flow

1. Open [Seller Portal](https://merxet.com)
2. Create a catalog → generate QR code
3. Complete a full order flow (buyer + seller sides)

<div align="center">
  <img src="https://merxet.com/slides/slide-3.jpg" alt="Merxet encryption flow diagram" />
</div>

## Go-To-Market And Validation Plan

- **First wedge:** small stores, food vendors, event merch tables, and printed promo campaigns where QR-first checkout is a better fit than full e-commerce infrastructure.
- **Why they care:** no dedicated POS hardware, lower setup overhead, instant crypto checkout, and better privacy for order details.
- **Feedback loop:** onboard small merchants, observe a real selling session, and measure setup time, scan-to-cart conversion, checkout completion rate, fulfillment time, and repeat purchases.
- **Near-term roadmap:** mainnet launch, stronger merchant analytics, better merchant verification, smoother buyer onboarding, and activation of the already-scaffolded card/fiat path where appropriate.

## Repository Structure

- `merxet-smartcontract` - Hardhat project for the Hedera-compatible `Merxet` smart contract
- `merxet-seller` - merchant-facing seller portal
- `merxet-frontend` - buyer-facing checkout mobile app
- `merxet-sync` - sync and caching API that indexes contract logs and HCS messages
- `merxet-promo` - promo/catalog presentation site
- `merxet-storefront-template` - standalone starter for generated merchant shops; see [development and build instructions](./merxet-storefront-template/README.md)

## Local Development

### 1. Smart contract

```bash
cd merxet-smartcontract
npm install
npm run compile
npm test
```

To deploy to Hedera testnet:

```bash
npm run deploy:testnet
```

### 2. Sync service

```bash
cd merxet-sync
cp .env.example .env
npm install
npm run dev
```

Required configuration lives in `merxet-sync/.env.example`. At minimum, set the Hedera contract address for the network you want to index. Bunny CDN keys are only needed for the optional CDN upload endpoints.

Run sync tests:

```bash
npm test
```

### 3. Seller portal

```bash
cd merxet-seller
npm install
npm run dev
```

### 4. Buyer app

```bash
cd merxet-frontend
npm install
npm run dev
```

### 5. Promo site

```bash
cd merxet-promo
npm install
npm run dev
```

## Why Merxet Matters For Hedera

Merxet shows that Hedera can power full retail flows -- not just payments.

It combines:

* payments
* messaging
* state
* privacy

…into a single real-world commerce protocol.

If crypto is going to reach everyday retail, checkout must be simpler, faster, and more private than today’s systems.

**That’s what Merxet is built to do.**

---

<div align="center"> 

[Seller Portal](https://merxet.com) | [Promo Catalog](https://promo.merxet.com) | [Pitch Deck](https://merxet.com/merxet-pitch-deck-final.pdf) | [Demo Video](https://youtu.be/H70hg3E135g)

**Status:** Live hackathon MVP on **Hedera Testnet**

**Built during Hedera hackathon • Fully functional end-to-end flow**
</div>
