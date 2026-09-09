import {z} from 'zod';

export const CatalogIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'Expected a 22-character Merxet ID');
const text = z.string().trim().min(1).max(500);
const httpsUrl = z.string().url().refine(value => value.startsWith('https://'), 'Use an HTTPS URL');
const asset = z.union([
  httpsUrl,
  z.string().regex(/^shop-assets\/[A-Za-z0-9_./-]+$/).refine(value => !value.split('/').includes('..')),
]);

export const StorefrontConfigSchema = z.object({
  schemaVersion: z.literal(1),
  shopId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  network: z.enum(['testnet', 'mainnet']),
  catalogSeed: CatalogIdSchema,
  branding: z.object({
    name: text,
    description: text,
    eyebrow: text.optional(),
    headline: text,
    story: z.string().trim().max(4000).optional(),
    logo: asset.optional(),
    favicon: asset.optional(),
    shareImage: httpsUrl.optional(),
  }),
  collections: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    name: text,
    description: text.optional(),
    productIds: z.array(CatalogIdSchema).max(1000),
  })).max(30).default([]).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Collection IDs must be unique'),
  featuredProductIds: z.array(CatalogIdSchema).max(24).default([]),
  links: z.array(z.object({label: text, url: httpsUrl})).max(12).default([]),
});

export type StorefrontConfig = z.infer<typeof StorefrontConfigSchema>;
