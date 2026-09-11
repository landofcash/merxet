import {z} from 'zod';
import {ApiError} from '../domain/errors.ts';

const reserved = new Set(['s', 'p', 'api', 'healthz', 'verify', 'assets', 'admin', 'www', 'app', 'shops', 'storefronts', 'merxet', 'ens', 'world', 'support', 'help', 'login', 'auth', 'preview', 'status', 'static', 'favicon', 'robots']);
export const ClaimNameSchema = z.object({label: z.string().min(3).max(40)}).strict();
export function normalizeLabel(value: string) {
  const label = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(label) || label.includes('--') || reserved.has(label)) throw new ApiError(400, 'ens_invalid_label');
  return label;
}
export function aliasSuffix(file: string) {
  if (!file || /^(products(?:\/[A-Za-z0-9_-]{22})?|collections\/[a-z0-9-]{1,80}|about)$/.test(file)) return file;
  throw new ApiError(404, 'shop_not_found');
}
