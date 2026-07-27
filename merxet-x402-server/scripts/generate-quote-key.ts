import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const { privateKey, publicKey } = await generateKeyPair("Ed25519", { extractable: true });
const [pkcs8, jwk] = await Promise.all([exportPKCS8(privateKey), exportJWK(publicKey)]);
console.log(JSON.stringify({
  MERXET_QUOTE_SIGNING_KID: `merxet-testnet-${new Date().toISOString().slice(0, 10)}`,
  MERXET_QUOTE_SIGNING_KEY_PKCS8: pkcs8,
  MERXET_QUOTE_PUBLIC_KEY: jwk.x,
}, null, 2));
