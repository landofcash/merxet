import {z} from 'zod';
import {hashSignal} from '@worldcoin/idkit-core/hashing';
import type {Config} from './config.ts';
import type {ProviderObservation, RequestContext} from '../shared/contracts.ts';

export class FlowError extends Error {
  status: number;
  code: string;
  observation: ProviderObservation | null;
  constructor(status: number, code: string, message: string, observation: ProviderObservation | null = null) {
    super(message); this.status = status; this.code = code; this.observation = observation;
  }
}

// Compare 256-bit values losslessly, including decimal responses from the verifier.
export const Uint256 = z.string().max(78).regex(/^(?:0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/)
  .refine(value => {try {return BigInt(value) < (1n << 256n);} catch {return false;}});
const ProofSchema = z.object({
  protocol_version: z.literal('3.0'), nonce: Uint256, action: z.string().max(100), environment: z.string().max(40),
  responses: z.array(z.object({
    identifier: z.literal('face'), signal_hash: Uint256, nullifier: Uint256, merkle_root: Uint256,
    proof: z.string().regex(/^0x(?:[a-fA-F0-9]{2})+$/).max(32768),
  }).passthrough()).length(1),
}).passthrough();
const ProviderSchema = z.object({
  success: z.literal(true), action: z.string(), environment: z.string(),
  results: z.array(z.object({identifier: z.string(), success: z.boolean(), nullifier: Uint256.optional()})).min(1).max(8),
});
const sameInteger = (left: string, right: string) => BigInt(left) === BigInt(right);

export function validateProof(input: unknown, context: RequestContext) {
  const parsed = ProofSchema.safeParse(input);
  if (!parsed.success) throw new FlowError(400, 'unexpected_proof', 'Expected one legacy Selfie Check (face) proof with a bound signal.');
  const proof = parsed.data;
  if (proof.action !== context.action || proof.environment !== context.environment ||
      !sameInteger(proof.nonce, context.rpContext.nonce) || !sameInteger(proof.responses[0].signal_hash, hashSignal(context.signal))) {
    throw new FlowError(400, 'request_mismatch', 'The proof does not match this request, action, or environment.');
  }
  return proof;
}

function safeLabel(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
}
function observe(body: unknown, httpStatus: number): ProviderObservation {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  return {httpStatus, environment: safeLabel(value.environment), code: safeLabel(value.code),
    identifiers: Array.isArray(value.results) ? value.results.slice(0, 8).map(item => safeLabel(item?.identifier)).filter((item): item is string => item !== null) : []};
}
export async function boundedJson(response: Response) {
  if (!response.body) throw new Error('Empty response');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.length; if (size > 65536) throw new Error('Response too large'); chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { await reader.cancel(); }
}

export class WorldVerifier {
  config: Config;
  transport: typeof fetch;
  constructor(config: Config, transport: typeof fetch = fetch) { this.config = config; this.transport = transport; }
  async verify(input: unknown, context: RequestContext): Promise<ProviderObservation> {
    const proof = validateProof(input, context);
    let response: Response, body: unknown;
    try {
      response = await this.transport(`https://developer.world.org/api/v4/verify/${this.config.rpId}`, {
        method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        // Preserve the entire IDKit result, including integrity data. Do not remap identifiers.
        body: JSON.stringify(proof), redirect: 'error', signal: AbortSignal.timeout(this.config.providerTimeout),
      });
      body = await boundedJson(response);
    } catch {
      throw new FlowError(503, 'provider_unavailable', 'World did not return a usable response. This check was not accepted; start a fresh check.');
    }
    const observation = observe(body, response.status);
    if (!response.ok) throw new FlowError(response.status >= 500 || response.status === 429 ? 503 : 422,
      'provider_rejected', 'World did not accept this proof. Check app access and action settings before starting a fresh check.', observation);
    const result = ProviderSchema.safeParse(body);
    if (!result.success || result.data.action !== context.action || result.data.environment !== context.environment ||
        result.data.results.length !== 1 || result.data.results[0].identifier !== 'face' || !result.data.results[0].success ||
        !result.data.results[0].nullifier || !sameInteger(result.data.results[0].nullifier, proof.responses[0].nullifier)) {
      throw new FlowError(422, 'provider_contract_mismatch',
        'World responded, but its verified credential, action, environment, or nullifier did not match. Review the safe response details; no result was accepted.', observation);
    }
    return observation;
  }
}
