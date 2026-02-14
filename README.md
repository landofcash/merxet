<div align="center">
<img src="https://raw.githubusercontent.com/landofcash/aptoosh/refs/heads/main/aptoosh-seller/public/logo-64x64.png" alt="Aptoosh banner"  />

# Aptoosh

### Scan. Shop. Pay in a flash.

**A point-of-sale experience without traditional hardware, apps, or merchant accounts.**

---

**Aptos CTRL+Move 2025 Hackathon Project**

[🔗 Mobile App](https://aptoosh.com) • [🔗 Seller Portal](https://s.aptoosh.com) • [🔗 Promo Catalogue](https://promo.aptoosh.com)

</div>

---

## 🌟 Overview

Aptoosh delivers a **scan, shop, and pay** experience for merchants and buyers on Aptos blockchain. Customers sign a short-lived order seed, encrypt their delivery details client-side, and escrow funds through Move smart contracts. Sellers regenerate the same deterministic keys to decrypt payloads and fulfill orders without ever exposing the plaintext to third parties.

You don’t need a seller terminal. You don’t need a cashier. You don’t even need a website -- just a QR code or link that launches the checkout flow. 

Product and order data is stored on-chain, sensitive data is end-to-end encrypted.
<div align="center">

### Check Promo Catalogue

[<img src="https://i.gyazo.com/d9538a82b6217723bf3bc71364ab6675.png" alt="Promo Catalogue" />](https://promo.aptoosh.com)
</div>



## ✨ Key Features

✅ **End-to-end encrypted checkout** – Orders use deterministic ECIES key pairs derived from user signatures so no long-term secrets are stored anywhere.

✅ **Dual-party key wrapping** – Symmetric payload keys are wrapped for both buyer and seller, enabling independent recovery from the same blockchain record.

✅ **On-chain integrity anchors** – Hashes of the plaintext payload and AES key ship with every order, allowing either party to prove tamper-free fulfillment.

✅ **Composable Move modules** – Orders, catalogues, and escrows live in dedicated modules that can be deployed to any Aptos environment.

<div align="center">

### Check Seller Portal

[<img src="https://i.gyazo.com/f5aefc891a8ca06e50f822e22bd3ab65.png" alt="Promo Catalogue" />](https://s.aptoosh.com)
</div>

## 🔐 Aptoosh Encryption & Decryption Scheme

Aptoosh ensures private, end-to-end encrypted order communication between buyer and seller using **Curve25519 (ECIES)** and a **deterministic keypair derived from a signed seed**.  
Only the buyer and seller can decrypt their respective data stored on-chain.

Product and order data is stored on-chain. There is no any database storage.

---


### 1. Seller Initialization
- The seller creates a random **catalog seed**.  
- Encrypts it with their wallet and signs the seed.  
- Derives a **Curve25519 keypair** from the signature.  
- Stores the **catalog seed** and **seller’s public key** on-chain

### 2. Buyer Purchase Flow
- The buyer generates a random **order seed**.  
- Encrypts it with their wallet and signs it.  
- Derives a **Curve25519 keypair** from the signature.  
- Encrypts the **delivery info + order details** using the **seller’s public key**.  
- Submits on-chain:
  - The **encrypted** order payload (delivery info and order details)
  - The **buyer’s public key**

### 3. Seller Fulfillment
- The seller repeats Step 1 (signs catalog seed again) to deterministically regenerate their private key.  
- Decrypts the buyer’s encrypted payload.  
- Fulfills the order.  
- Encrypts the **delivery confirmation/info** using the **buyer’s public key** and publishes it on-chain.

### 4. Buyer Confirmation
- The buyer regenerates their private key from the order seed.  
- Decrypts the seller’s delivery info.  
- The order is complete -- all sensitive data remains visible only to the buyer and seller while stored fully on-chain.

---

## 🛡️ Key Principles

- **Deterministic key derivation:**  
  No need to store private keys -- they can be recreated from signed seeds at any time.

- **Zero-knowledge privacy:**  
  Neither the platform nor any third party can access order or delivery details.

- **Hybrid encryption:**  
  Combines **ECIES (Curve25519)** for asymmetric key exchange and **AES** for data encryption.

---


