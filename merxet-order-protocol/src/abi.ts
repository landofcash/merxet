export const MERXET_ABI = [
  "function createOrderPaid(bytes32 seed,bytes32 catalogSeed,uint256 price,address priceToken,bytes buyerPubKey,bytes sellerPubKey,bytes encryptedSymKeyBuyer,bytes encryptedSymKeySeller,bytes32 symKeyHash,bytes32 payloadHashBuyer)",
  "function catalogs(bytes32 seed) view returns (uint256 version,address seller,string catalogUrl,bytes sellerPubKey)",
  "function orders(bytes32 seed) view returns (uint256 version,address buyer,address seller,uint256 amount,uint8 status,bytes32 catalogSeed,uint256 price,address priceToken,address payer,bytes buyerPubKey,bytes sellerPubKey,bytes encryptedSymKeyBuyer,bytes encryptedSymKeySeller,bytes32 symKeyHash,bytes32 payloadHashBuyer,bytes32 payloadHashSeller,uint256 createdDate,uint256 updatedDate)",
] as const;

export const HTS_APPROVE_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
] as const;
