import {argon2id} from "hash-wasm";
import {bytesToHex} from "viem";
import type {InternalWalletEncryptedSecret, InternalWalletSecretMaterial} from "@/lib/internalWallet/types.ts";
import {b64FromBytes, b64ToBytes, hexToBytes} from "@/utils/encoding.ts";

type Argon2Params = {
  iterations: number;
  parallelism: number;
  memorySize: number;
  hashLength: number;
};

const ARGON2_DEFAULTS: Argon2Params = {
  iterations: 3,
  parallelism: 1,
  memorySize: 19_456,
  hashLength: 32,
};

function assertBrowserCrypto() {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Secure browser cryptography is not available in this environment.");
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array, params: Argon2Params = ARGON2_DEFAULTS): Promise<CryptoKey> {
  assertBrowserCrypto();

  const keyBytes = await argon2id({
    password: passphrase,
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: "binary",
  });

  return await crypto.subtle.importKey("raw", new Uint8Array(keyBytes), {name: "AES-GCM"}, false, ["encrypt", "decrypt"]);
}

export async function encryptSecretMaterial(
  passphrase: string,
  secretMaterial: InternalWalletSecretMaterial,
): Promise<InternalWalletEncryptedSecret> {
  assertBrowserCrypto();

  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));
  const salt = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt);
  const payload = new TextEncoder().encode(JSON.stringify(secretMaterial));
  const cipherBuffer = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, payload);

  return {
    version: 1,
    ivBase64: b64FromBytes(iv),
    saltBase64: b64FromBytes(salt),
    cipherTextBase64: b64FromBytes(new Uint8Array(cipherBuffer)),
    kdf: {
      algorithm: "argon2id",
      iterations: ARGON2_DEFAULTS.iterations,
      parallelism: ARGON2_DEFAULTS.parallelism,
      memorySize: ARGON2_DEFAULTS.memorySize,
      hashLength: ARGON2_DEFAULTS.hashLength,
    },
  };
}

export async function decryptSecretMaterial(
  encryptedSecret: InternalWalletEncryptedSecret,
  passphrase: string,
): Promise<InternalWalletSecretMaterial> {
  assertBrowserCrypto();

  const salt = new Uint8Array(b64ToBytes(encryptedSecret.saltBase64));
  const iv = new Uint8Array(b64ToBytes(encryptedSecret.ivBase64));
  const cipherText = new Uint8Array(b64ToBytes(encryptedSecret.cipherTextBase64));
  const key = await deriveKey(passphrase, salt, encryptedSecret.kdf);

  try {
    const plainBuffer = await crypto.subtle.decrypt({name: "AES-GCM", iv}, key, cipherText);
    return JSON.parse(new TextDecoder().decode(plainBuffer)) as InternalWalletSecretMaterial;
  } catch {
    throw new Error("Incorrect passphrase.");
  }
}

export function normalizePrivateKeyHex(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;

  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Private key must be a 32-byte hex string.");
  }

  return normalized.toLowerCase();
}

export function privateKeyHexToBytes(privateKeyHex: string): Uint8Array {
  return hexToBytes(normalizePrivateKeyHex(privateKeyHex));
}

export function privateKeyBytesToHex(privateKeyBytes: Uint8Array): string {
  return bytesToHex(privateKeyBytes).replace(/^0x/, "");
}
