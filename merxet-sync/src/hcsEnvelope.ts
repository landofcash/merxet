const HCS_ENVELOPE_VERSION = 1;
const HCS_SEED_LENGTH = 22;

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
  encryptedPayload: Buffer;
};

export function decodeHcsEnvelope(rawMessage: Buffer): HcsEnvelope | null {
  if (rawMessage.length < 1 + HCS_SEED_LENGTH + 2) {
    return null;
  }

  const version = rawMessage[0];
  if (version !== HCS_ENVELOPE_VERSION) {
    return null;
  }

  const seed = rawMessage.subarray(1, 1 + HCS_SEED_LENGTH).toString('utf8');
  if (Buffer.byteLength(seed, 'utf8') !== HCS_SEED_LENGTH) {
    return null;
  }

  return {
    version,
    seed,
    role: rawMessage[1 + HCS_SEED_LENGTH],
    type: rawMessage[1 + HCS_SEED_LENGTH + 1],
    encryptedPayload: rawMessage.subarray(1 + HCS_SEED_LENGTH + 2),
  };
}
