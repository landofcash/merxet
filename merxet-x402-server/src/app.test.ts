import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import {
  encryptDelivery,
  type PaymentPayload,
} from "@merxet/order-protocol";
import { encodePaymentSignatureHeader } from "@merxet/order-protocol/http";
import { createApp } from "./app.js";
import { InMemoryQuoteStore } from "./quoteStore.js";
import type { ServerConfig } from "./config.js";

const orderSeed = "AAAAAAAAAAAAAAAAAAAAAA";
const catalogSeed = "AQEBAQEBAQEBAQEBAQEBAQ";
const sellerKey = Buffer.concat([Buffer.from([2]), Buffer.alloc(32, 3)]).toString("base64");
let config: ServerConfig;

beforeAll(async () => {
  const keys = await generateKeyPair("Ed25519", { extractable: true });
  config = {
    port: 3402, syncOrigin: "https://sync.example.test", resourceOrigin: "https://api.example.test",
    catalogOrigins: new Set(["https://catalog.example.test"]), signingKid: "test-key",
    signingKeyPkcs8: await exportPKCS8(keys.privateKey),
    quotePublicKey: (await exportJWK(keys.publicKey)).x!,
    quotePublicKeys: new Map([["test-key", (await exportJWK(keys.publicKey)).x!]]),
    redisUrl: "memory://", corsOrigins: new Set(["https://app.example.test"]),
    catalogMaxBytes: 1_048_576, recoverySeconds: 86_400, retrySeconds: 2, now: () => 1_700_000_000,
  };
});

async function quoteBody() {
  const key = Uint8Array.from({ length: 32 }, (_, index) => index);
  return {
    body: {
      orderSeed, catalogSeed, items: [{ productId: "sku-1", quantity: 2 }],
      encryptedDelivery: await encryptDelivery({
        fullName: "Ada", address: "Street", city: "Lisbon", postalCode: "1", country: "PT",
        phone: "1", email: "a@example.test", noPhysicalDelivery: false,
      }, orderSeed, key, Uint8Array.from({ length: 12 }, (_, index) => index + 32)),
      deliveryKey: Buffer.from(key).toString("base64url"),
    },
  };
}

function sync(evidence: unknown = null) {
  return {
    order: async () => null,
    catalog: async () => ({
      catalogSeed, catalogUrl: "https://catalog.example.test/products.json",
      sellerAccountId: "0.0.1001", sellerEvmAddress: "0x00000000000000000000000000000000000003e9",
      sellerPublicKey: sellerKey, contractId: "0.0.7565091",
      contractEvmAddress: "0x01b6d4a28bf0300ce1dbe039a762bf28278f199b", hcsTopicId: "0.0.7001",
    }),
    evidence: async () => evidence,
  };
}

const products = async () => [{
  ProductId: "sku-1", PriceToken: "0.0.0", Price: "50", Name: "Pilot item",
}];

const htsProducts = async () => [{
  ProductId: "sku-1", PriceToken: "0.0.429274", Price: "50", Name: "Pilot item",
}];

describe("x402 quote and confirmation", () => {
  it("creates immutable zero-delivery quote and resolves without secrets", async () => {
    const app = await createApp({ config, store: new InMemoryQuoteStore(config.now),
      sync: sync() as never, fetchCatalog: products as never });
    const created = await request(app).post("/api/v1/testnet/order-quotes").send((await quoteBody()).body);
    expect(created.status).toBe(402);
    expect(created.headers["payment-required"]).toBeTruthy();
    expect(created.body.paymentRequired.accepts[0].amount).toBe("100");

    const resolved = await request(app).post("/api/v1/testnet/order-quotes/resolve").send({ orderSeed });
    expect(resolved.status).toBe(200);
    expect(resolved.body.quote.delivery.amount).toBe("0");
    expect(resolved.body.recoverUntil).toBe(1_700_087_000);
    expect(JSON.stringify(resolved.body)).not.toContain("deliveryKey");
    expect(JSON.stringify(resolved.body)).not.toContain("fullName");

    const collision = await request(app).post("/api/v1/testnet/order-quotes").send((await quoteBody()).body);
    expect(collision.status).toBe(409);
  });

  it("returns proof_pending until sync has outer evidence", async () => {
    const store = new InMemoryQuoteStore(config.now);
    const app = await createApp({ config, store, sync: sync() as never, fetchCatalog: products as never });
    const created = await request(app).post("/api/v1/testnet/order-quotes").send((await quoteBody()).body);
    const required = created.body.paymentRequired;
    const payload: PaymentPayload = {
      x402Version: 2, resource: required.resource, accepted: required.accepts[0],
      payload: { transactionId: "0.0.1001@1700000001.000000000", buyerAccountId: "0.0.1001" },
      extensions: {},
    };
    const result = await request(app).post(`/api/v1/testnet/orders/${orderSeed}/confirm`)
      .set("PAYMENT-SIGNATURE", encodePaymentSignatureHeader(payload));
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("proof_pending");
  });

  it("settles read-only with matching authoritative evidence", async () => {
    const evidence = {
      orderSeed, network: "testnet", contractId: "0.0.7565091",
      contractEvmAddress: "0x01b6d4a28bf0300ce1dbe039a762bf28278f199b",
      order: {
        seed: orderSeed, catalogSeed, amount: "100",
        priceToken: "0x0000000000000000000000000000000000000000",
        seller: "0x00000000000000000000000000000000000003e9", sellerPubKey: sellerKey,
        buyer: "0x00000000000000000000000000000000000003e9",
        payer: "0x00000000000000000000000000000000000003e9", status: "2",
      },
      outerTransactionId: "0.0.1001@1700000001.000000000",
      paymentConsensusTimestamp: "1700000001.000000000", payerAccountId: "0.0.1001",
      outerTransactionType: "ATOMICBATCH", outerResult: "SUCCESS",
    };
    const store = new InMemoryQuoteStore(config.now);
    const app = await createApp({ config, store, sync: sync(evidence) as never, fetchCatalog: products as never });
    const created = await request(app).post("/api/v1/testnet/order-quotes").send((await quoteBody()).body);
    const required = created.body.paymentRequired;
    const payload: PaymentPayload = {
      x402Version: 2, resource: required.resource, accepted: required.accepts[0],
      payload: { transactionId: evidence.outerTransactionId, buyerAccountId: evidence.payerAccountId },
      extensions: {},
    };
    const result = await request(app).post(`/api/v1/testnet/orders/${orderSeed}/confirm`)
      .set("PAYMENT-SIGNATURE", encodePaymentSignatureHeader(payload));
    expect(result.status).toBe(200);
    expect(result.headers["payment-response"]).toBeTruthy();
    expect(result.body.orderSeed).toBe(orderSeed);
  });

  it("settles HTS evidence when ethers returns a checksummed token address", async () => {
    const evidence = {
      orderSeed, network: "testnet", contractId: "0.0.7565091",
      contractEvmAddress: "0x01b6d4a28bf0300ce1dbe039a762bf28278f199b",
      order: {
        seed: orderSeed, catalogSeed, amount: "100",
        priceToken: "0x0000000000000000000000000000000000068cDa",
        seller: "0x00000000000000000000000000000000000003e9", sellerPubKey: sellerKey,
        buyer: "0x00000000000000000000000000000000000003e9",
        payer: "0x00000000000000000000000000000000000003e9", status: "2",
      },
      outerTransactionId: "0.0.1001@1700000001.000000000",
      paymentConsensusTimestamp: "1700000001.000000000", payerAccountId: "0.0.1001",
      outerTransactionType: "ATOMICBATCH", outerResult: "SUCCESS",
    };
    const store = new InMemoryQuoteStore(config.now);
    const app = await createApp({ config, store, sync: sync(evidence) as never, fetchCatalog: htsProducts as never });
    const created = await request(app).post("/api/v1/testnet/order-quotes").send((await quoteBody()).body);
    expect(created.body.paymentRequired.accepts[0].asset).toBe("0.0.429274");

    const required = created.body.paymentRequired;
    const payload: PaymentPayload = {
      x402Version: 2, resource: required.resource, accepted: required.accepts[0],
      payload: { transactionId: evidence.outerTransactionId, buyerAccountId: evidence.payerAccountId },
      extensions: {},
    };
    const result = await request(app).post(`/api/v1/testnet/orders/${orderSeed}/confirm`)
      .set("PAYMENT-SIGNATURE", encodePaymentSignatureHeader(payload));
    expect(result.status).toBe(200);
    expect(result.headers["payment-response"]).toBeTruthy();
  });
});
