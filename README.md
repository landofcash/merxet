<div align="center">
<img src=https://merxet.com/logo-64x64.png alt="Merxet banner"  />

# Merxet
**END-TO-ENDENCRYPTED RETAIL PROTOCOL ON HEDERA**

**A point-of-sale experience without traditional hardware, apps, or merchant accounts.**

---

[🔗 Seller Portal](https://merxet.com) • [🔗 Mobile App](https://app.merxet.com) •  [🔗 Promo Catalog](https://promo.merxet.com)

</div>

---

## 🌟 Overview

Merxet delivers a **scan, shop, and pay** experience for merchants and buyers on Aptos blockchain. Customers sign a short-lived order seed, encrypt their delivery details client-side, and escrow funds through Move smart contracts. Sellers regenerate the same deterministic keys to decrypt payloads and fulfill orders without ever exposing the plaintext to third parties.

You don’t need a seller terminal. You don’t need a cashier. You don’t even need a website -- just a QR code or link that launches the checkout flow. 

Product and order data is stored on-chain, sensitive data is end-to-end encrypted.

## ✨ Key Features

✅ **End-to-end encrypted checkout** – Orders use deterministic asymetric key pairs derived from user signatures so no long-term secrets are stored anywhere.

✅ **Dual-party key wrapping** – Symmetric payload keys are wrapped for both buyer and seller, enabling independent recovery of delivery data and order details.

✅ **Decentralized** – The protocol does not maintain or rely on any centralized database storage. Order data is encrypted and stored on HFS, events are also encrypted and stored on HCS

✅ **Privacy by design** – Each order payload is encrypted on the client side and can be decrypted by the buyer or the seller.

## 🔐 Merxet Encryption & Decryption Scheme

Merxet ensures private, end-to-end encrypted order communication between buyer and seller using **Curve25519 (ECIES)** and a **deterministic keypair derived from a signed seed (RFC 6979)**.  
Only the buyer and seller can decrypt their respective data stored on Hedera network.

There is no any database or other centralized storage.

---

### 1. Seller Initialization
- The seller creates a random **catalog seed**.  
- Encrypts it with their wallet and signs the seed.  
- Derives a **Curve25519 keypair** from the signature.  
- Stores the **catalog seed** and **seller’s public key** on Hedera ledger

### 2. Buyer Purchase Flow
- The buyer generates a random **order seed**.  
- Encrypts it with their wallet and signs it.  
- Derives a **Curve25519 keypair** from the signature.  
- Encrypts the **delivery info + order details** using the **seller’s public key**.  
- Submits on Hedera ledger:
  - The **encrypted** order payload (delivery info and order details)
  - The **buyer’s public key**

### 3. Seller Fulfillment
- The seller repeats Step 1 (signs catalog seed again) to deterministically regenerate their private key.  
- Decrypts the buyer’s encrypted payload.  
- Fulfills the order.  
- Encrypts the **delivery confirmation/info** using the **buyer’s public key** and publishes it on ledger.

### 4. Buyer Confirmation
- The buyer regenerates their private key from the order seed.  
- Decrypts the seller’s delivery info.  
- The order is complete -- all sensitive data remains visible only to the buyer and seller while stored fully on Hedera ledger.

---

## 🛡️ Key Principles

- **Deterministic key derivation:**  
  No need to store private keys -- they can be recreated from signed seeds at any time.

- **Zero-knowledge privacy:**  
  Neither the platform nor any third party can access order or delivery details.

- **Hybrid encryption:**  
  Combines **ECIES (Curve25519)** for asymmetric key exchange and **AES** for data encryption.

---


