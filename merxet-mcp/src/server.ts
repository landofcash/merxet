#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MerxetDeliveryDetailsV1Schema, OrderSeedSchema } from "@merxet/order-protocol";
import { loadConfig } from "./config.js";
import { PendingIntentStore } from "./intentStore.js";
import { MerxetOrderFlow } from "./orderFlow.js";

const config = loadConfig();
const flow = new MerxetOrderFlow(config, new PendingIntentStore(config.dataDir));
const server = new McpServer({ name: "merxet", version: "1.0.0" });

server.registerTool("create_merxet_order", {
  description: "Create a testnet Merxet quote and return a browser-wallet approval URL. This tool cannot sign or submit transactions.",
  inputSchema: {
    catalogSeed: OrderSeedSchema,
    items: z.array(z.object({
      productId: z.string().min(1).max(512),
      quantity: z.number().int().min(1).max(1_000_000),
    }).strict()).min(1).max(100),
    delivery: MerxetDeliveryDetailsV1Schema,
  },
}, async input => {
  try {
    const created = await flow.create(input);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(created.result) },
        { type: "image" as const, data: created.qrBase64, mimeType: "image/png" },
      ],
      structuredContent: created.result,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({
        status: "failed", code: "quote_failed",
        message: error instanceof Error ? error.message : "Quote creation failed.",
      }) }],
    };
  }
});

server.registerTool("get_merxet_order_status", {
  description: "Perform one public settlement-evidence check for an existing Merxet intent and confirm it when ready.",
  inputSchema: { intentId: OrderSeedSchema },
}, async ({ intentId }) => {
  const status = await flow.status(intentId);
  return { content: [{ type: "text" as const, text: JSON.stringify(status) }], structuredContent: status };
});

await server.connect(new StdioServerTransport());
