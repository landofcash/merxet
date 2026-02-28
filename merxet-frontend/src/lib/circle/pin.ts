import {fetchPublicKey} from './api';

function requireWindow(method: 'atob' | 'btoa'): typeof window['atob'] {
  if (typeof window === 'undefined' || typeof window[method] !== 'function') {
    throw new Error('Browser base64 helpers are unavailable');
  }
  return window[method].bind(window);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleaned = base64.replace(/\s+/g, '');
  const atob = requireWindow('atob');
  const binaryString = atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const btoa = requireWindow('btoa');
  return btoa(binary);
}

async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  // Handle PEM formatted keys by stripping header/footer
  const pemMatch = publicKey.match(/-----BEGIN PUBLIC KEY-----(.*?)-----END PUBLIC KEY-----/s);
  const body = pemMatch ? pemMatch[1] ?? '' : publicKey;
  const derBuffer = base64ToArrayBuffer(body);
  return await crypto.subtle.importKey(
    'spki',
    derBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt'],
  );
}

export async function encryptPin(pin: string, providedKey?: string | null): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto?.subtle) {
    throw new Error('Web Crypto API not available to encrypt PIN');
  }
  const publicKey = providedKey ?? (await fetchPublicKey());
  if (!publicKey) throw new Error('Circle public key unavailable');
  const key = await importPublicKey(publicKey);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(pin);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, encoded);
  return arrayBufferToBase64(encrypted);
}
