import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { importQuotePrivateKey } from "@merxet/order-protocol";
import {
  MERXET_NETWORK,
  MerxetOrderEvidenceV1Schema,
  MerxetOrderQuoteRequestV1Schema,
  OrderSeedSchema,
  PaymentPayloadSchema,
  QuoteResolutionSchema,
  canonicalEqual,
  canonicalHash,
  decryptDelivery,
  importQuotePublicKey,
  normalizeSolidityAddress,
  signQuoteDigest,
  verifyQuoteDigestJws,
  type MerxetOrderQuoteV1,
  type PaymentRequired,
  type SettlementResponse,
} from "@merxet/order-protocol";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@merxet/order-protocol/http";
import type { ServerConfig } from "./config.js";
import { fetchCatalog, SyncClient } from "./clients.js";
import { QuoteRecordSchema, type QuoteStore } from "./quoteStore.js";

type Dependencies = {
  config: ServerConfig;
  store: QuoteStore;
  sync?: SyncClient;
  fetchCatalog?: typeof fetchCatalog;
};

class HttpError extends Error {
  constructor(public status: number, public code: string, message = code, public retryAfter?: number) { super(message); }
}

const tokenMetadata: Record<string, { symbol: string; name: string; decimals: number }> = {
  "0.0.0": { symbol: "HBAR", name: "HBAR", decimals: 8 },
  "0.0.429274": { symbol: "USDC", name: "USD Coin", decimals: 6 },
};

function tokenEvmAddress(tokenId: string): `0x${string}` {
  const [shard, realm, num] = tokenId.split(".").map(BigInt);
  return `0x${shard.toString(16).padStart(8, "0")}${realm.toString(16).padStart(16, "0")}${num.toString(16).padStart(16, "0")}`;
}

export async function createApp(dependencies: Dependencies) {
  const { config, store } = dependencies;
  const sync = dependencies.sync ?? new SyncClient(config.syncOrigin);
  const catalogFetcher = dependencies.fetchCatalog ?? fetchCatalog;
  const signingKey = await importQuotePrivateKey(config.signingKeyPkcs8);
  const verificationKeys = new Map();
  for (const [kid, publicKey] of config.quotePublicKeys) {
    verificationKeys.set(kid, await importQuotePublicKey(publicKey));
  }
  const app = express();
  const loadRecord = async (seed: string) => {
    try { return await store.get("testnet", seed); }
    catch { throw new HttpError(503, "redis_unavailable", undefined, config.retrySeconds); }
  };
  app.disable("x-powered-by");
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || config.corsOrigins.size === 0 || config.corsOrigins.has(origin));
    },
    allowedHeaders: ["Content-Type", "PAYMENT-SIGNATURE"],
    exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
  }));
  app.use(express.json({ limit: 131_072, strict: true }));

  app.post("/api/v1/testnet/order-quotes", asyncRoute(async (req, res) => {
    const request = MerxetOrderQuoteRequestV1Schema.parse(req.body);
    let existingOrder: unknown;
    try { existingOrder = await sync.order(request.orderSeed); } catch { throw new HttpError(503, "sync_unavailable", undefined, config.retrySeconds); }
    if (existingOrder || await loadRecord(request.orderSeed)) throw new HttpError(409, "seed_conflict");

    const rawKey = Uint8Array.from(Buffer.from(request.deliveryKey, "base64url"));
    let delivery;
    try { delivery = await decryptDelivery(request.encryptedDelivery, request.orderSeed, rawKey); }
    finally { rawKey.fill(0); delete (req.body as Record<string, unknown>).deliveryKey; }

    let metadata;
    try { metadata = await sync.catalog(request.catalogSeed); } catch { throw new HttpError(503, "sync_unavailable", undefined, config.retrySeconds); }
    if (!metadata) throw new HttpError(404, "catalog_not_found");
    const catalog = await catalogFetcher(metadata.catalogUrl, config);
    const selected = request.items.map(input => {
      const product = catalog.find(item => item.ProductId === input.productId);
      if (!product) throw new HttpError(422, "product_not_found");
      return { product, quantity: input.quantity };
    });
    const assets = new Set(selected.map(item => item.product.PriceToken));
    if (assets.size !== 1) throw new HttpError(422, "mixed_assets");
    const asset = [...assets][0];
    const token = tokenMetadata[asset];
    if (!token) throw new HttpError(422, "unsupported_asset");
    const items = selected.map(({ product, quantity }) => ({
      productId: product.ProductId, name: product.Name, unitAmount: product.Price, quantity,
      lineAmount: (BigInt(product.Price) * BigInt(quantity)).toString(),
    }));
    const amount = items.reduce((sum, item) => sum + BigInt(item.lineAmount), 0n).toString();
    const issuedAt = config.now(), expiresAt = issuedAt + 600;
    const requestHash = await canonicalHash({
      orderSeed: request.orderSeed, catalogSeed: request.catalogSeed, items: request.items,
      encryptedDelivery: request.encryptedDelivery,
    });
    const quote: MerxetOrderQuoteV1 = {
      version: 1, orderSeed: request.orderSeed, requestHash, network: MERXET_NETWORK,
      x402: { protocolVersion: 2, scheme: "merxet-order", schemeVersion: 1, resourceMethod: "POST",
        resourcePath: `/api/v1/testnet/orders/${request.orderSeed}/confirm`, maxTimeoutSeconds: 600 },
      catalog: { seed: request.catalogSeed, sellerAccountId: metadata.sellerAccountId,
        sellerEvmAddress: metadata.sellerEvmAddress, sellerPublicKey: metadata.sellerPublicKey },
      items,
      delivery: { required: !delivery.noPhysicalDelivery, optionId: "pilot-seller-arranged",
        optionName: "Seller-arranged delivery", amount: "0",
        deliveryDetailsHash: await canonicalHash(delivery),
        encryptedDeliveryHash: await canonicalHash(request.encryptedDelivery) },
      payment: asset === "0.0.0"
        ? { symbol: token.symbol, name: token.name, amount, payTo: metadata.contractId,
          assetType: "hbar", asset: "0.0.0", tokenEvmAddress: null, decimals: 8 }
        : { symbol: token.symbol, name: token.name, amount, payTo: metadata.contractId,
          assetType: "hts", asset, tokenEvmAddress: tokenEvmAddress(asset), decimals: token.decimals },
      merxet: { contractId: metadata.contractId, contractEvmAddress: metadata.contractEvmAddress,
        hcsTopicId: metadata.hcsTopicId },
      issuedAt, expiresAt,
    };
    const quoteDigest = await canonicalHash(quote);
    const quoteJws = await signQuoteDigest(quoteDigest, config.signingKid, signingKey);
    const resource = {
      url: `${config.resourceOrigin}${quote.x402.resourcePath}`,
      description: "Create and pay for a Merxet order", mimeType: "application/json" as const, serviceName: "Merxet" as const,
    };
    const requirements = {
      scheme: "merxet-order" as const, network: MERXET_NETWORK, amount, asset, payTo: metadata.contractId,
      maxTimeoutSeconds: 600,
      extra: { schemeVersion: 1 as const, orderSeed: request.orderSeed, quoteDigest,
        quotePath: "/api/v1/testnet/order-quotes/resolve" as const, quoteJws },
    };
    const paymentRequired: PaymentRequired = {
      x402Version: 2, error: "PAYMENT-SIGNATURE header is required", resource,
      accepts: [requirements], extensions: {},
    };
    const recoverUntil = expiresAt + config.recoverySeconds;
    const record = QuoteRecordSchema.parse({
      version: 1, quote, quoteDigest, quoteJws, paymentRequired, requestHash,
      encryptedDelivery: request.encryptedDelivery, createdAt: issuedAt, expiresAt, recoverUntil,
      verification: { signingKid: config.signingKid },
    });
    let created;
    try { created = await store.create("testnet", request.orderSeed, record, recoverUntil - issuedAt); }
    catch { throw new HttpError(503, "redis_unavailable", undefined, config.retrySeconds); }
    if (!created) throw new HttpError(409, "seed_conflict");
    res.set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
    res.status(402).json({ error: paymentRequired.error, paymentRequired });
  }));

  app.post("/api/v1/testnet/order-quotes/resolve", asyncRoute(async (req, res) => {
    const seed = OrderSeedSchema.parse(req.body?.orderSeed);
    const record = await loadRecord(seed);
    if (!record || record.expiresAt <= config.now()) throw new HttpError(404, "quote_not_found");
    res.set("Cache-Control", "private, no-store").json(QuoteResolutionSchema.parse({
      paymentRequired: record.paymentRequired, quote: record.quote, quoteDigest: record.quoteDigest,
      quoteJws: record.quoteJws, encryptedDelivery: record.encryptedDelivery,
      recoverUntil: record.recoverUntil,
    }));
  }));

  app.post("/api/v1/testnet/orders/:orderSeed/confirm", asyncRoute(async (req, res) => {
    const seed = OrderSeedSchema.parse(req.params.orderSeed);
    if (req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0) {
      throw new HttpError(400, "confirmation_body_not_allowed");
    }
    const record = await loadRecord(seed);
    if (!record || record.recoverUntil <= config.now()) throw new HttpError(404, "quote_not_found");
    const signature = req.get("PAYMENT-SIGNATURE");
    if (!signature) {
      res.set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(record.paymentRequired));
      return res.status(402).json({ error: record.paymentRequired.error });
    }
    let payload;
    try { payload = PaymentPayloadSchema.parse(decodePaymentSignatureHeader(signature)); }
    catch { throw new HttpError(400, "malformed_payment_signature"); }
    if (!canonicalEqual(payload.accepted, record.paymentRequired.accepts[0]) ||
        !canonicalEqual(payload.resource, record.paymentRequired.resource)) {
      throw new HttpError(402, "invalid_payment");
    }
    if (await canonicalHash(record.quote) !== record.quoteDigest) throw new HttpError(402, "invalid_payment");
    try { await verifyQuoteDigestJws(record.quoteJws, record.quoteDigest, verificationKeys); }
    catch { throw new HttpError(402, "invalid_payment"); }
    let evidenceValue;
    try { evidenceValue = await sync.evidence(seed); } catch { throw new HttpError(503, "sync_unavailable", undefined, config.retrySeconds); }
    if (!evidenceValue) throw new HttpError(503, "proof_pending", undefined, config.retrySeconds);
    const evidenceResult = MerxetOrderEvidenceV1Schema.safeParse(evidenceValue);
    if (!evidenceResult.success) throw new HttpError(503, "proof_pending", undefined, config.retrySeconds);
    const evidence = evidenceResult.data;
    const order = evidence.order as Record<string, unknown>;
    const consensus = Number(evidence.paymentConsensusTimestamp.split(".")[0]);
    const valid = evidence.outerTransactionId === payload.payload.transactionId &&
      evidence.payerAccountId === payload.payload.buyerAccountId &&
      evidence.contractId === record.quote.merxet.contractId &&
      consensus >= record.quote.issuedAt && consensus <= record.quote.expiresAt &&
      order.seed === seed && order.catalogSeed === record.quote.catalog.seed &&
      String(order.amount ?? order.price) === record.quote.payment.amount &&
      normalizeSolidityAddress(String(order.priceToken)) === (record.quote.payment.asset === "0.0.0"
        ? "0x0000000000000000000000000000000000000000" : record.quote.payment.tokenEvmAddress) &&
      String(order.seller).toLowerCase() === record.quote.catalog.sellerEvmAddress &&
      String(order.sellerPubKey) === record.quote.catalog.sellerPublicKey &&
      String(order.buyer) === String(order.payer) && String(order.payer) !== "";
    if (!valid) {
      res.set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(record.paymentRequired));
      throw new HttpError(402, "invalid_payment");
    }
    const settlement: SettlementResponse = {
      success: true, payer: evidence.payerAccountId, transaction: evidence.outerTransactionId,
      network: MERXET_NETWORK, amount: record.quote.payment.amount, extensions: {},
    };
    res.set("PAYMENT-RESPONSE", encodePaymentResponseHeader(settlement));
    res.json({ orderSeed: seed, transactionId: evidence.outerTransactionId,
      transactionHash: evidence.outerTransactionHash, status: order.status, order });
  }));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const http = error instanceof HttpError ? error : new HttpError(400, "malformed_request");
    if (http.retryAfter) res.set("Retry-After", String(http.retryAfter));
    res.status(http.status).json({ error: http.code, message: http.message });
  });
  return app;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };
}
