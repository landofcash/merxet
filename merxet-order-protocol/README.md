# @merxet/order-protocol

Shared schemas and codecs for the Merxet order and x402 flow.

## Contract byte encoding

Merxet contract `bytes` fields are interpreted according to their field:

- `sellerPubKey` and `buyerPubKey` contain the UTF-8 bytes of a canonical
  standard-Base64 compressed secp256k1 public key.
- `encSymKeyBuyer` and `encSymKeySeller` contain raw encrypted bytes. API
  responses encode those bytes once as standard Base64.
- Hash fields contain raw `bytes32` values.

Use `publicKeyBase64ToContractBytes` before writing a public key to the
contract and `publicKeyBase64FromContractBytes` after reading it. These
helpers validate that the Base64 value represents a 33-byte compressed
secp256k1 key and prevent accidental nested Base64 encoding.
