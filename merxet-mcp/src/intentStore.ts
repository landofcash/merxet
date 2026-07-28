import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  MerxetEncryptedDeliveryV1Schema,
  OrderSeedSchema,
  PaymentRequirementsSchema,
  ResourceInfoSchema,
} from "@merxet/order-protocol";

export const PendingIntentSchema = z.object({
  version: z.literal(1),
  intentId: OrderSeedSchema,
  orderSeed: OrderSeedSchema,
  catalogSeed: OrderSeedSchema,
  requestHash: z.string(),
  requirements: PaymentRequirementsSchema,
  resource: ResourceInfoSchema,
  confirmationUrl: z.string().url(),
  quoteDigest: z.string(),
  quoteJws: z.string(),
  encryptedDelivery: MerxetEncryptedDeliveryV1Schema,
  expiresAt: z.number().int(),
  recoverUntil: z.number().int().optional(),
  createdAt: z.number().int(),
  status: z.enum(["awaiting_settlement", "proof_pending", "confirmed", "expired", "failed"]),
  order: z.record(z.string(), z.unknown()).optional(),
  failure: z.object({ code: z.string(), message: z.string() }).optional(),
}).strict().superRefine((intent, context) => {
  if (intent.recoverUntil !== undefined && intent.recoverUntil <= intent.expiresAt) {
    context.addIssue({ code: "custom", message: "recovery deadline must be after quote expiry" });
  }
});
export type PendingIntent = z.infer<typeof PendingIntentSchema>;

export class PendingIntentStore {
  constructor(private directory: string) {}
  private filename(id: string) { return path.join(this.directory, `${OrderSeedSchema.parse(id)}.json`); }
  async save(intent: PendingIntent) {
    const parsed = PendingIntentSchema.parse(intent);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const finalName = this.filename(parsed.intentId);
    const tempName = `${finalName}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tempName, JSON.stringify(parsed), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(tempName, finalName);
  }
  async load(id: string) {
    try { return PendingIntentSchema.parse(JSON.parse(await fs.readFile(this.filename(id), "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
