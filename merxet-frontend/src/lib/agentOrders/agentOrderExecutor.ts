import type {MerxetDeliveryDetailsV1, MerxetOrderQuoteV1} from '@merxet/order-protocol'
import type {WalletAdapter} from '@/context/wallet/types'
import {getCurrentConfig, signPrefix} from '@/config'
import {getHcsTopicId} from '@/lib/hedera/hederaUtils'
import {getChainAdapter} from '@/lib/crypto/cryptoUtils'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {generateAESKey, encryptAES, encryptWithECIES} from '@/utils/encryption'
import {b64FromBytes, hashCryptoKeyToB64, sha256} from '@/utils/encoding'

export type AgentOrderExecutionInput = {
  quote: MerxetOrderQuoteV1
  delivery: MerxetDeliveryDetailsV1
  walletAdapter: WalletAdapter
  signMessage: (data: string, message: string) => Promise<Uint8Array>
}

export async function executeQuotedMerxetOrder(input: AgentOrderExecutionInput): Promise<string> {
  const {quote, delivery, walletAdapter, signMessage} = input
  const config = getCurrentConfig()
  const currentTopic = await getHcsTopicId('testnet')
  if (config.name !== 'testnet' || config.contractAddress !== quote.merxet.contractId ||
      config.contractEvmAddress !== quote.merxet.contractEvmAddress ||
      currentTopic.trim() !== quote.merxet.hcsTopicId) {
    throw new Error('The active wallet contract or topic no longer matches the approved quote.')
  }
  const signed = await signMessage(`${signPrefix}${quote.orderSeed}`, 'Approve this Merxet agent order')
  const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signed)))
  const keyPair = await generateKeyPairFromB64(signedBase64)
  const aesKey = await generateAESKey()
  const orderData = {
    deliveryInfo: delivery,
    cartItems: quote.items.map(item => ({
      id: item.productId, name: item.name, price: item.unitAmount,
      priceToken: quote.payment.asset, quantity: item.quantity,
    })),
  }
  const plaintext = JSON.stringify(orderData)
  const encryptedPayload = await encryptAES(aesKey, plaintext)
  const encryptedSymKeyBuyer = await encryptWithECIES(keyPair.publicKey, aesKey)
  const encryptedSymKeySeller = await encryptWithECIES(quote.catalog.sellerPublicKey, aesKey)
  const symKeyHash = await hashCryptoKeyToB64(aesKey)
  const payloadHash = b64FromBytes(await sha256(new TextEncoder().encode(plaintext)))
  const cartItems = quote.items.map(item => ({
    id: item.productId, name: item.name, price: BigInt(item.unitAmount), priceToken: quote.payment.asset,
    quantity: item.quantity, image: 'https://merxet.com/logo.svg', shopWallet: quote.catalog.sellerEvmAddress,
    sellerPubKey: quote.catalog.sellerPublicKey, seed: quote.catalog.seed, network: 'testnet',
  }))
  return getChainAdapter().createOrderPaidOnBlockchain(
    walletAdapter,
    {[quote.payment.asset]: BigInt(quote.payment.amount)},
    cartItems,
    quote.orderSeed,
    keyPair.publicKey,
    encryptedSymKeyBuyer,
    encryptedSymKeySeller,
    symKeyHash,
    payloadHash,
    encryptedPayload,
  )
}
