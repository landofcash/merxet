import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  encryptDelivery,
  type MerxetOrderQuoteV1,
  type PaymentRequired,
} from "@merxet/order-protocol";
import { encodePaymentRequiredHeader } from "@merxet/order-protocol/http";
import { PendingIntentStore, type PendingIntent } from "./intentStore.js";
import { MerxetOrderFlow } from "./orderFlow.js";
import type { McpConfig } from "./config.js";

const config: McpConfig = {
  x402Origin: "https://x402.example.test",
  syncOrigin: "https://sync.example.test",
  frontendOrigin: "https://app.example.test",
  dataDir: "",
};

const recoverySeed = "AgICAgICAgICAgICAgICAg";
const recoveryCatalogSeed = "AwMDAwMDAwMDAwMDAwMDAw";

function recoveryIntent(): PendingIntent {
  const resource = {
    url: `${config.x402Origin}/api/v1/testnet/orders/${recoverySeed}/confirm`,
    description: "Create and pay for a Merxet order" as const,
    mimeType: "application/json" as const,
    serviceName: "Merxet" as const,
  };
  return {
    version: 1,
    intentId: recoverySeed,
    orderSeed: recoverySeed,
    catalogSeed: recoveryCatalogSeed,
    requestHash: "request-hash",
    requirements: {
      scheme: "merxet-order",
      network: "hedera:testnet",
      amount: "10",
      asset: "0.0.0",
      payTo: "0.0.7565091",
      maxTimeoutSeconds: 600,
      extra: {
        schemeVersion: 1,
        orderSeed: recoverySeed,
        quoteDigest: "A".repeat(43),
        quotePath: "/api/v1/testnet/order-quotes/resolve",
        quoteJws: `eyJhbGciOiJFZERTQSJ9..${"A".repeat(86)}`,
      },
    },
    resource,
    confirmationUrl: resource.url,
    quoteDigest: "A".repeat(43),
    quoteJws: `eyJhbGciOiJFZERTQSJ9..${"A".repeat(86)}`,
    encryptedDelivery: {
      version: 1,
      algorithm: "A256GCM",
      nonce: "A".repeat(16),
      ciphertext: "AA",
      tag: "A".repeat(22),
    },
    expiresAt: 1_700_000_600,
    recoverUntil: 1_700_087_000,
    createdAt: 1_700_000_000,
    status: "awaiting_settlement",
  };
}

function input() {
  return {
    catalogSeed: "AQEBAQEBAQEBAQEBAQEBAQ",
    items: [{ productId: "sku", quantity: 1 }],
    delivery: {
      fullName: "Ada", address: "Street", city: "Lisbon", postalCode: "1", country: "PT",
      phone: "1", email: "ada@example.test", noPhysicalDelivery: false,
    },
  };
}

describe("Merxet MCP order flow", () => {
  it("returns URL/QR and confirms checksummed HTS evidence without persisting secrets", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "merxet-mcp-"));
    const store = new PendingIntentStore(directory);
    let seed = "";
    let required: PaymentRequired;
    let quote: MerxetOrderQuoteV1;
    let encryptedDelivery: Awaited<ReturnType<typeof encryptDelivery>>;
    const fetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const target = String(url);
      if (target.endsWith("/order-quotes")) {
        const body = JSON.parse(String(init?.body));
        seed = body.orderSeed;
        encryptedDelivery = body.encryptedDelivery;
        const digest = "A".repeat(43);
        const jws = "eyJhbGciOiJFZERTQSIsImtpZCI6InQiLCJ0eXAiOiJtZXJ4ZXQtb3JkZXItcXVvdGUrandzIn0.." + "A".repeat(86);
        required = {
          x402Version: 2, error: "PAYMENT-SIGNATURE header is required",
          resource: { url: `${config.x402Origin}/api/v1/testnet/orders/${seed}/confirm`,
            description: "Create and pay for a Merxet order", mimeType: "application/json", serviceName: "Merxet" },
          accepts: [{ scheme: "merxet-order", network: "hedera:testnet", amount: "10", asset: "0.0.429274",
            payTo: "0.0.7565091", maxTimeoutSeconds: 600,
            extra: { schemeVersion: 1, orderSeed: seed, quoteDigest: digest,
              quotePath: "/api/v1/testnet/order-quotes/resolve", quoteJws: jws } }],
          extensions: {},
        };
        return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required) } });
      }
      if (target.endsWith("/order-quotes/resolve")) {
        const requestHash = await canonicalHash({
          orderSeed: seed, catalogSeed: input().catalogSeed, items: input().items, encryptedDelivery,
        });
        quote = {
          version: 1, orderSeed: seed, requestHash, network: "hedera:testnet",
          x402: { protocolVersion: 2, scheme: "merxet-order", schemeVersion: 1, resourceMethod: "POST",
            resourcePath: `/api/v1/testnet/orders/${seed}/confirm`, maxTimeoutSeconds: 600 },
          catalog: { seed: input().catalogSeed, sellerAccountId: "0.0.1",
            sellerEvmAddress: "0x0000000000000000000000000000000000000001",
            sellerPublicKey: Buffer.concat([Buffer.from([2]), Buffer.alloc(32)]).toString("base64") },
          items: [{ productId: "sku", name: "Item", unitAmount: "10", quantity: 1, lineAmount: "10" }],
          delivery: { required: true, optionId: "pilot-seller-arranged", optionName: "Seller-arranged delivery",
            amount: "0", deliveryDetailsHash: "A".repeat(43), encryptedDeliveryHash: "A".repeat(43) },
          payment: { symbol: "USDC", name: "USD Coin", amount: "10", payTo: "0.0.7565091",
            assetType: "hts", asset: "0.0.429274",
            tokenEvmAddress: "0x0000000000000000000000000000000000068cda", decimals: 6 },
          merxet: { contractId: "0.0.7565091", contractEvmAddress: "0x01b6d4a28bf0300ce1dbe039a762bf28278f199b",
            hcsTopicId: "0.0.2" },
          issuedAt: 1_700_000_000, expiresAt: 1_700_000_600,
        };
        return Response.json({ paymentRequired: required!, quote, quoteDigest: required!.accepts[0].extra.quoteDigest,
          quoteJws: required!.accepts[0].extra.quoteJws, encryptedDelivery, recoverUntil: 1_700_087_000 });
      }
      if (target.includes("/x402-evidence")) return Response.json({ success: true, data: {
        orderSeed: seed, network: "testnet", contractId: "0.0.7565091",
        order: {
          seed, catalogSeed: input().catalogSeed, amount: "10",
          priceToken: "0x0000000000000000000000000000000000068cDa",
          buyer: "0x0000000000000000000000000000000000000001",
          payer: "0x0000000000000000000000000000000000000001",
        },
        outerTransactionId: "0.0.1@1700000001.000000000",
        paymentConsensusTimestamp: "1700000001.000000000", payerAccountId: "0.0.1",
        outerTransactionType: "ATOMICBATCH", outerResult: "SUCCESS",
      } });
      if (target.endsWith("/confirm")) return Response.json({ order: { seed, status: "2" } });
      throw new Error(`Unexpected URL ${target}`);
    };
    const flow = new MerxetOrderFlow({ ...config, dataDir: directory }, store, fetcher as typeof fetch, () => 1_700_000_000);
    const created = await flow.create(input());
    expect(created.result.status).toBe("approval_required");
    expect(created.result.approvalUrl).toContain("#v=1&network=testnet");
    expect(created.qrBase64.length).toBeGreaterThan(100);

    const raw = await fs.readFile(path.join(directory, `${created.result.intentId}.json`), "utf8");
    expect(raw).not.toContain("deliveryKey");
    expect(raw).not.toContain("Ada");
    const resumed = new MerxetOrderFlow({ ...config, dataDir: directory }, new PendingIntentStore(directory),
      fetcher as typeof fetch, () => 1_700_000_001);
    expect(await resumed.status(created.result.intentId)).toMatchObject({ status: "confirmed", orderSeed: seed });
  });

  it("keeps polling an expired quote until its recovery deadline", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "merxet-mcp-recovery-"));
    const store = new PendingIntentStore(directory);
    await store.save(recoveryIntent());
    let evidenceAvailable = false;
    const fetcher = async (url: string | URL | Request): Promise<Response> => {
      const target = String(url);
      if (target.endsWith("/x402-evidence")) {
        if (!evidenceAvailable) return new Response(null, { status: 404 });
        return Response.json({ success: true, data: {
          orderSeed: recoverySeed, network: "testnet", contractId: "0.0.7565091",
          order: {
            seed: recoverySeed, catalogSeed: recoveryCatalogSeed, amount: "10",
            priceToken: "0x0000000000000000000000000000000000000000",
            buyer: "0x0000000000000000000000000000000000000001",
            payer: "0x0000000000000000000000000000000000000001",
          },
          outerTransactionId: "0.0.1@1700000599.000000000",
          paymentConsensusTimestamp: "1700000599.000000000", payerAccountId: "0.0.1",
          outerTransactionType: "ATOMICBATCH", outerResult: "SUCCESS",
        } });
      }
      if (target === `${config.syncOrigin}/api/v1/testnet/orders/${recoverySeed}`) {
        return new Response(null, { status: 404 });
      }
      if (target.endsWith("/confirm")) return Response.json({ order: { seed: recoverySeed, status: "2" } });
      throw new Error(`Unexpected URL ${target}`);
    };
    const flow = new MerxetOrderFlow(
      { ...config, dataDir: directory },
      store,
      fetcher as typeof fetch,
      () => 1_700_000_601,
    );

    expect(await flow.status(recoverySeed)).toMatchObject({ status: "proof_pending" });
    expect((await store.load(recoverySeed))?.status).toBe("proof_pending");

    evidenceAvailable = true;
    expect(await flow.status(recoverySeed)).toMatchObject({ status: "confirmed", orderSeed: recoverySeed });
  });

  it("expires an unresolved intent at the recovery deadline", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "merxet-mcp-expired-"));
    const store = new PendingIntentStore(directory);
    await store.save(recoveryIntent());
    let fetchCalls = 0;
    const flow = new MerxetOrderFlow(
      { ...config, dataDir: directory },
      store,
      (async () => {
        fetchCalls += 1;
        throw new Error("Recovery-expired intents must not poll");
      }) as typeof fetch,
      () => 1_700_087_000,
    );

    expect(await flow.status(recoverySeed)).toMatchObject({ status: "expired" });
    expect(fetchCalls).toBe(0);
  });
});
