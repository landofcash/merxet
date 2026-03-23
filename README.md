<div align="center">
  <img src="https://merxet.com/logo-64x64.png" alt="Merxet logo" />

# Merxet

**END-TO-END ENCRYPTED RETAIL PROTOCOL ON HEDERA**

**A point-of-sale experience without traditional hardware, apps, or merchant accounts.**

[Seller Portal](https://merxet.com) | [Promo Catalog](https://promo.merxet.com) | [Pitch Deck](https://merxet.com/merxet-pitch-deck-final.pdf) | [Demo Video](https://youtu.be/H70hg3E135g)

**Status:** Live hackathon MVP on **Hedera Testnet**
</div>

## What is Merxet 
Merxet is a **decentralized, end-to-end encrypted retail protocol and checkout stack built on Hedera**. It lets merchants publish product catalogs, accept crypto payments, and manage fulfillment without traditional POS hardware, while buyers get a fast "scan, shop, pay" experience from a phone.



In practical terms, Merxet combines four things into one product:

- a **seller portal** for publishing catalogs and generating checkout QR codes and links
- a **mobile buyer app** for scanning, shopping, and paying with HBAR or supported Hedera tokens
- a **smart-contract escrow layer** that manages order state and settlement on Hedera
- an **end-to-end encrypted data flow** so private order details are only readable by buyer and seller



<div align="center">
  <img src="https://merxet.com/merxet-order-flow.png" alt="Merxet protocol diagram" />
</div>

## What The MVP Already Does

- Seller portal to create and update product catalogs, publish catalog URLs, and generate QR codes for real checkout entry points.
- Buyer web app to scan QR codes, browse products, build a cart, and pay with HBAR or USDC on Hedera testnet.
- Hedera smart contract for catalog registry, order lifecycle, escrow, cancellation, refund handling, timeout rules, and payout settlement.
- End-to-end encrypted order payloads so delivery details and seller responses stay private between buyer and seller.
- Hedera File Service storage for encrypted payloads and Hedera Consensus Service references for lightweight message transport.
- Mirror-node-backed sync API that indexes contract events and topic messages into a fast cache for responsive UX.
- Hedera built-in encrypted browser wallet to simplify onboarding.
- Public demo surfaces for merchant, buyer, and promo/catalog discovery flows.

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
| **Wallet ecosystem** | HashPack/WalletConnect and a built-in encrypted wallet | Lowers onboarding friction and makes Hedera usable for non-expert users |

## Why This Is Innovative

- Merxet is not another generic storefront. It is a **end-to-end encrypted retail protocol** for physical-world checkout.
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

## Try it now!

### Buyer experience
1. Open  [Promo Catalog](https://promo.merxet.com)  and scan QR-codes with your phone
2. Create a Hedera wallet right in the app, fill it with test hbar and checkout.
3. Check your order status in the app

<div align="center">
  <img src="https://merxet.com/slides/slide-2.jpg" alt="Merxet encryption flow diagram" />
</div>

### Seller experience, full order flow

1. Open the [Seller Portal](https://merxet.com) and create a Hedera wallet, fund it with test HBAR.
2. Publish a product catalog and generate a QR code.
3. As a buyer, scan the QR code with the phone, add items to cart, and check out with test HBAR or USDC (create another wallet in the app and fund it with test HBAR).
4. Return to the seller portal to view the order, decrypt the private payload, and mark delivery or refusal.
5. Confirm the order in the buyer app and watch escrow finalize on Hedera.

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

Merxet showcases Hedera as more than a settlement layer. It demonstrates how Hedera can power real-world commerce flows where payment, messaging, state, and sensitive data handling all matter at the same time. If crypto is going to reach everyday retail, it needs to be simpler, faster, and more privacy-aware than today's checkout stack. That is the problem Merxet is built to solve.

---

<div align="center"> 

[Seller Portal](https://merxet.com) | [Promo Catalog](https://promo.merxet.com) | [Pitch Deck](https://merxet.com/merxet-pitch-deck-final.pdf) | [Demo Video](https://youtu.be/H70hg3E135g)

**Status:** Live hackathon MVP on **Hedera Testnet**
</div>
