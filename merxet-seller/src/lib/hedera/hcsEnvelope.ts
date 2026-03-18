const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const HCS_ENVELOPE_VERSION = 1;
export const HCS_ENVELOPE_SEED_LENGTH = 22;

export const HCS_MESSAGE_ROLE = {
  buyer: 1,
  seller: 2,
  admin: 3,
} as const;

export const HCS_MESSAGE_TYPE = {
  buyerInitialOrder: 1,
  sellerDelivery: 2,
  sellerRefusal: 3,
} as const;

export type HcsEnvelope = {
  version: number;
  seed: string;
  role: number;
  type: number;
  encryptedPayload: string;
};

function requireSeedBytes(seed: string): Uint8Array {
  const seedBytes = textEncoder.encode(seed);
  if (seedBytes.length !== HCS_ENVELOPE_SEED_LENGTH) {
    throw new Error(`Seed must encode to exactly ${HCS_ENVELOPE_SEED_LENGTH} bytes.`);
  }
  return seedBytes;
}

export function encodeHcsEnvelope(seed: string, role: number, type: number, encryptedPayload: string): Uint8Array {
  const seedBytes = requireSeedBytes(seed);
  const payloadBytes = textEncoder.encode(encryptedPayload);
  const envelope = new Uint8Array(1 + HCS_ENVELOPE_SEED_LENGTH + 1 + 1 + payloadBytes.length);

  envelope[0] = HCS_ENVELOPE_VERSION;
  envelope.set(seedBytes, 1);
  envelope[1 + HCS_ENVELOPE_SEED_LENGTH] = role;
  envelope[1 + HCS_ENVELOPE_SEED_LENGTH + 1] = type;
  envelope.set(payloadBytes, 1 + HCS_ENVELOPE_SEED_LENGTH + 2);

  return envelope;
}

export function decodeHcsEnvelope(bytes: Uint8Array): HcsEnvelope | null {
  if (bytes.length < 1 + HCS_ENVELOPE_SEED_LENGTH + 2) {
    return null;
  }

  const version = bytes[0];
  if (version !== HCS_ENVELOPE_VERSION) {
    return null;
  }

  const seedBytes = bytes.slice(1, 1 + HCS_ENVELOPE_SEED_LENGTH);
  const seed = textDecoder.decode(seedBytes);
  if (textEncoder.encode(seed).length !== HCS_ENVELOPE_SEED_LENGTH) {
    return null;
  }

  return {
    version,
    seed,
    role: bytes[1 + HCS_ENVELOPE_SEED_LENGTH],
    type: bytes[1 + HCS_ENVELOPE_SEED_LENGTH + 1],
    encryptedPayload: textDecoder.decode(bytes.slice(1 + HCS_ENVELOPE_SEED_LENGTH + 2)),
  };
}
