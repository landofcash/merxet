import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import {
  MerxetDeliveryDetailsV1Schema,
  MerxetOrderEvidenceV1Schema,
  PaymentRequiredSchema,
  QuoteResolutionSchema,
  canonicalHash,
  encryptDelivery,
  type MerxetDeliveryDetailsV1,
  type PaymentPayload,
  solidityEntityAddressToId,
} from "@merxet/order-protocol";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@merxet/order-protocol/http";
import type { McpConfig } from "./config.js";
import { PendingIntentStore, type PendingIntent } from "./intentStore.js";

const LEGACY_INTENT_RECOVERY_SECONDS = 86_400;

export type CreateOrderInput = {
  catalogSeed: string;
  items: Array<{ productId: string; quantity: number }>;
  delivery: MerxetDeliveryDetailsV1;
};

export class MerxetOrderFlow {
  constructor(
    private config: McpConfig,
    private store: PendingIntentStore,
    private fetcher: typeof fetch = fetch,
    private now = () => Math.floor(Date.now() / 1000),
  ) {}

  async create(input: CreateOrderInput) {
    const delivery = MerxetDeliveryDetailsV1Schema.parse(input.delivery);
    const orderSeed = randomBytes(16).toString("base64url");
    const deliveryKey = randomBytes(32), nonce = randomBytes(12);
    const encryptedDelivery = await encryptDelivery(delivery, orderSeed, deliveryKey, nonce);
    const quoteRequest = {
      orderSeed, catalogSeed: input.catalogSeed, items: input.items,
      encryptedDelivery, deliveryKey: deliveryKey.toString("base64url"),
    };
    let response;
    try {
      response = await this.fetcher(`${this.config.x402Origin}/api/v1/testnet/order-quotes`, {
        method: "POST", redirect: "error", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteRequest), signal: AbortSignal.timeout(10_000),
      });
    } finally {
      deliveryKey.fill(0); nonce.fill(0);
    }
    if (response.status !== 402) throw new Error(`quote_creation_${response.status}`);
    const header = response.headers.get("PAYMENT-REQUIRED");
    if (!header) throw new Error("missing_payment_required");
    const required = PaymentRequiredSchema.parse(decodePaymentRequiredHeader(header));
    if (required.accepts.length !== 1 || required.accepts[0].scheme !== "merxet-order" ||
        required.accepts[0].network !== "hedera:testnet" || required.accepts[0].extra.orderSeed !== orderSeed ||
        required.resource.url !== `${this.config.x402Origin}/api/v1/testnet/orders/${orderSeed}/confirm`) {
      throw new Error("invalid_payment_required");
    }
    const resolvedResponse = await this.fetcher(`${this.config.x402Origin}/api/v1/testnet/order-quotes/resolve`, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderSeed }), signal: AbortSignal.timeout(10_000),
    });
    if (!resolvedResponse.ok) throw new Error("quote_resolution_failed");
    const resolved = QuoteResolutionSchema.parse(await resolvedResponse.json());
    if (resolved.quoteDigest !== required.accepts[0].extra.quoteDigest ||
        resolved.quoteJws !== required.accepts[0].extra.quoteJws ||
        resolved.quote.requestHash !== await canonicalHash({
          orderSeed, catalogSeed: input.catalogSeed, items: input.items, encryptedDelivery,
        })) throw new Error("quote_commitment_mismatch");

    const keyForUrl = quoteRequest.deliveryKey;
    const approvalUrl = new URL("/agent-orders/approve", this.config.frontendOrigin);
    approvalUrl.hash = new URLSearchParams({ v: "1", network: "testnet", orderSeed, deliveryKey: keyForUrl }).toString();
    const intent: PendingIntent = {
      version: 1, intentId: orderSeed, orderSeed, catalogSeed: input.catalogSeed,
      requestHash: resolved.quote.requestHash,
      requirements: required.accepts[0], resource: required.resource, confirmationUrl: required.resource.url,
      quoteDigest: resolved.quoteDigest, quoteJws: resolved.quoteJws, encryptedDelivery,
      expiresAt: resolved.quote.expiresAt, recoverUntil: resolved.recoverUntil,
      createdAt: this.now(), status: "awaiting_settlement",
    };
    await this.store.save(intent);
    const qrDataUrl = await QRCode.toDataURL(approvalUrl.toString(), { errorCorrectionLevel: "M", margin: 1 });
    return {
      result: { status: "approval_required" as const, intentId: orderSeed, orderSeed,
        approvalUrl: approvalUrl.toString(), expiresAt: intent.expiresAt },
      qrBase64: qrDataUrl.slice(qrDataUrl.indexOf(",") + 1),
    };
  }

  async status(intentId: string) {
    const intent = await this.store.load(intentId);
    if (!intent) return { status: "failed" as const, orderSeed: intentId, code: "intent_not_found", message: "Intent not found." };
    if (intent.status === "confirmed") return { status: "confirmed" as const, orderSeed: intent.orderSeed, order: intent.order };
    if (intent.status === "failed" || intent.status === "expired") return { status: intent.status, orderSeed: intent.orderSeed, ...intent.failure };
    const recoverUntil = intent.recoverUntil ?? intent.expiresAt + LEGACY_INTENT_RECOVERY_SECONDS;
    if (this.now() >= recoverUntil) {
      intent.status = "expired"; await this.store.save(intent);
      return { status: "expired" as const, orderSeed: intent.orderSeed };
    }

    const evidenceResponse = await this.fetcher(
      `${this.config.syncOrigin}/api/v1/testnet/orders/${encodeURIComponent(intent.orderSeed)}/x402-evidence`,
      { redirect: "error", signal: AbortSignal.timeout(8_000) },
    );
    if (evidenceResponse.status === 404) {
      const orderResponse = await this.fetcher(
        `${this.config.syncOrigin}/api/v1/testnet/orders/${encodeURIComponent(intent.orderSeed)}`,
        { redirect: "error", signal: AbortSignal.timeout(8_000) },
      );
      if (orderResponse.ok) {
        intent.status = "proof_pending"; await this.store.save(intent);
        return { status: "proof_pending" as const, orderSeed: intent.orderSeed };
      }
      if (orderResponse.status !== 404) {
        intent.status = "proof_pending"; await this.store.save(intent);
        return { status: "proof_pending" as const, orderSeed: intent.orderSeed };
      }
      if (this.now() >= intent.expiresAt) {
        intent.status = "proof_pending"; await this.store.save(intent);
        return { status: "proof_pending" as const, orderSeed: intent.orderSeed };
      }
      return { status: "awaiting_settlement" as const, orderSeed: intent.orderSeed };
    }
    if (!evidenceResponse.ok) return { status: "proof_pending" as const, orderSeed: intent.orderSeed };
    const wrapper = await evidenceResponse.json() as { success?: boolean; data?: unknown };
    if (!wrapper.success || !wrapper.data) return { status: "proof_pending" as const, orderSeed: intent.orderSeed };
    const evidence = MerxetOrderEvidenceV1Schema.parse(wrapper.data);
    const order = evidence.order as Record<string, unknown>;
    const priceToken = String(order.priceToken ?? "");
    const asset = priceToken === "0x0000000000000000000000000000000000000000"
      ? "0.0.0"
      : solidityEntityAddressToId(priceToken);
    if (evidence.orderSeed !== intent.orderSeed || evidence.contractId !== intent.requirements.payTo ||
        order.catalogSeed !== intent.catalogSeed || String(order.amount ?? order.price) !== intent.requirements.amount ||
        asset !== intent.requirements.asset || !order.payer || String(order.buyer) !== String(order.payer)) {
      intent.status = "failed";
      intent.failure = { code: "evidence_mismatch", message: "Public order evidence does not match the retained quote." };
      await this.store.save(intent);
      return { status: "failed" as const, orderSeed: intent.orderSeed, ...intent.failure };
    }
    const payload: PaymentPayload = {
      x402Version: 2, resource: intent.resource, accepted: structuredClone(intent.requirements),
      payload: {
        transactionId: evidence.outerTransactionId,
        buyerAccountId: evidence.payerAccountId,
      },
      extensions: {},
    };
    const confirmation = await this.fetcher(intent.confirmationUrl, {
      method: "POST", redirect: "error",
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
      signal: AbortSignal.timeout(10_000),
    });
    if (confirmation.status === 503) {
      intent.status = "proof_pending"; await this.store.save(intent);
      return { status: "proof_pending" as const, orderSeed: intent.orderSeed };
    }
    if (!confirmation.ok) {
      intent.status = confirmation.status === 404 ? "expired" : "failed";
      intent.failure = { code: `confirmation_${confirmation.status}`, message: "Merxet confirmation rejected the public proof." };
      await this.store.save(intent);
      return { status: intent.status, orderSeed: intent.orderSeed, ...intent.failure };
    }
    const result = await confirmation.json() as { order?: Record<string, unknown> };
    intent.status = "confirmed"; intent.order = result.order; await this.store.save(intent);
    return { status: "confirmed" as const, orderSeed: intent.orderSeed, order: intent.order };
  }
}
