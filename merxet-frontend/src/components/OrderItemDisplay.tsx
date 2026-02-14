import React, {type JSX, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {AlertCircle, ChevronDown, ChevronUp, Eye, Loader2, Unlock} from 'lucide-react'
import {useWallet} from '@/context/WalletContext'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {decryptAES, decryptWithECIES} from '@/utils/encryption'
import {b64FromBytes, sha256} from '@/utils/encoding'
import ExpandableData from '@/components/ExpandableData'
import CopyableField from '@/components/CopyableField'
import TokenIcon from '@/components/TokenIcon'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import ApprovedShopBadge from '@/components/ApprovedShopBadge'
import AddressDisplay from '@/components/AddressDisplay'
import {formatUtcDate} from '@/lib/dateUtils'
import { safePriceToDisplayString as priceToDisplayString } from '@/lib/tokenUtils'
import {signPrefix} from '@/config'
import {formatCryptoError} from "@/lib/cryptoFormat.ts";
import {getChainAdapter} from "@/lib/crypto/cryptoUtils.ts";

interface Order {
  version: string
  productSeed: string
  status: string
  price: string
  priceToken: string
  seller: string
  buyer: string
  payer: string
  buyerPubKey: string
  sellerPubKey: string
  encryptedSymKeyBuyer: string
  encryptedSymKeySeller: string
  symKeyHash: string
  payloadHashBuyer: string
  payloadHashSeller: string
  createdDate: string
  updatedDate: string
  seed: string
  buyerWallet: string
  sellerWallet: string
  amount: string
  boxName: string
}

interface OrderItemDisplayProps {
  order: Order
}

type DecryptionStatus = 'idle' | 'loading' | 'success' | 'error'

interface DecryptedBoxResult {
  decryptedText: string | null
  error: string | null
  payloadHash: string
  encryptedData: string
  notFound: boolean
}

const OrderItemDisplay: React.FC<OrderItemDisplayProps> = ({order}) => {
  const {walletAddress, signMessage} = useWallet()
  const [decryptionStatus, setDecryptionStatus] = useState<DecryptionStatus>('idle')
  const [error, setError] = useState<string>('')
  const [buyerDecryptionResult, setBuyerDecryptionResult] = useState<DecryptedBoxResult | null>(null)
  const [sellerDecryptionResult, setSellerDecryptionResult] = useState<DecryptedBoxResult | null>(null)
  const [debugExpanded, setDebugExpanded] = useState(false)

  // Common decryption state (shared between both boxes)
  const [signedSeed, setSignedSeed] = useState<string>('')
  const [keyPair, setKeyPair] = useState<{ publicKey: string; privateKey: string } | null>(null)
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null)

  // Generic function to decrypt a specific order box using the provided AES key
  const decryptOrderData = async (
    encryptedData: string,
    decryptedAESKey: CryptoKey
  ): Promise<DecryptedBoxResult> => {
    const result: DecryptedBoxResult = {
      decryptedText: null,
      error: null,
      payloadHash: '',
      encryptedData: '',
      notFound: true,
    }
    try {
      const decryptedText = await decryptAES(decryptedAESKey, encryptedData)
      result.encryptedData = encryptedData
      result.decryptedText = decryptedText
      result.notFound = false
      result.payloadHash = b64FromBytes(await sha256(new TextEncoder().encode(decryptedText)))
      return result
    } catch (err) {
      console.error(`Decryption error:`, err)
      result.error = formatCryptoError(err)
      return result
    }
  }

  const handleDecryptPayload = async () => {
    if (!walletAddress) {
      setError('Please connect your wallet to decrypt order data')
      return
    }

    setDecryptionStatus('loading')
    setError('')

    try {
      // Step 1: Sign the order seed with the connected wallet
      const messageToSign = signPrefix + order.seed
      let signedBase64: string

      const signed = await signMessage(
        messageToSign,
        "Sign order seed to decrypt order data"
      )
      signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signed)))
      setSignedSeed(signedBase64)

      // Step 2: Generate the key pair from signed seed
      const generatedKeyPair = await generateKeyPairFromB64(signedBase64)
      setKeyPair(generatedKeyPair)

      // Step 3: Decrypt the symmetric key using the buyer's encrypted key
      // (This is the buyer's view, so we always use encryptedSymKeyBuyer)
      const decryptedAESKey = await decryptWithECIES(generatedKeyPair.privateKey, order.encryptedSymKeyBuyer)
      setAesKey(decryptedAESKey)

      // Step 4: Decrypt both buyer and seller boxes using the same AES key
      const chainAdapter = getChainAdapter()
      const encryptedBuyerData = await chainAdapter.viewBuyerData(order.seed)

      let buyerResult: DecryptedBoxResult = {
        decryptedText: null,
        error: null,
        payloadHash: '',
        encryptedData: '',
        notFound: true
      }
      if (encryptedBuyerData.isFound && encryptedBuyerData.data) {
        buyerResult = await decryptOrderData(encryptedBuyerData.data, decryptedAESKey)
      }
      setBuyerDecryptionResult(buyerResult)

      const encryptedSellerData = await chainAdapter.viewSellerData(order.seed)
      let sellerResult: DecryptedBoxResult = {
        decryptedText: null,
        error: null,
        payloadHash: '',
        encryptedData: '',
        notFound: true
      }
      if (encryptedSellerData.isFound && encryptedSellerData.data) {
        sellerResult = await decryptOrderData(encryptedSellerData.data, decryptedAESKey)
      }
      setSellerDecryptionResult(sellerResult)

      // Check if there were any critical errors (not including "box not found")
      if (buyerResult.error || (sellerResult.error && !sellerResult.notFound)) {
        setError(buyerResult.error || sellerResult.error || 'Decryption failed')
        setDecryptionStatus('error')
        return
      }

      setDecryptionStatus('success')

    } catch (err) {
      console.error('Overall decryption error:', err)
      setError(formatCryptoError(err))
      setDecryptionStatus('error')
    }
  }

  // Helper function to render JSON as name:value pairs
  const renderJsonAsKeyValue = (jsonString: string) => {
    try {
      const parsedData = JSON.parse(jsonString)
      return renderObjectAsKeyValue(parsedData)
    } catch (err) {
      return (
        <div className="text-xs text-destructive">
          Failed to parse JSON: {err instanceof Error ? err.message : 'Unknown error'}
        </div>
      )
    }
  }

  // Recursive function to render an object as key-value pairs
  const renderObjectAsKeyValue = (obj: object, prefix = ''): JSX.Element => {
    return (
      <div className="space-y-1">
        {Object.entries(obj).map(([key, value]) => {
          const fullKey = prefix ? `${prefix}.${key}` : key

          if (value === null || value === undefined) {
            return (
              <div key={fullKey} className="text-xs">
                <span className="font-medium">{key}:</span> <span className="text-muted-foreground">null</span>
              </div>
            )
          }

          if (typeof value === 'object' && !Array.isArray(value)) {
            return (
              <div key={fullKey} className="text-xs">
                <div className="font-medium mb-1">{key}:</div>
                <div className="ml-4 border-l-2 border-muted pl-2">
                  {renderObjectAsKeyValue(value, fullKey)}
                </div>
              </div>
            )
          }

          if (Array.isArray(value)) {
            return (
              <div key={fullKey} className="text-xs">
                <div className="font-medium mb-1">{key}: [{value.length} items]</div>
                <div className="ml-4 border-l-2 border-muted pl-2 space-y-1">
                  {value.map((item, index) => (
                    <div key={`${fullKey}[${index}]`}>
                      <div className="font-medium text-muted-foreground">[{index}]:</div>
                      <div className="ml-2">
                        {typeof item === 'object' ?
                          renderObjectAsKeyValue(item, `${fullKey}[${index}]`) :
                          <span>{String(item)}</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div key={fullKey} className="text-xs">
              <span className="font-medium">{key}:</span> <span>{String(value)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const price = BigInt(order.price)
  const priceToken = order.priceToken
  const canDecrypt = order.status !== '1' // Not initial status

  return (
    <Card className="border-2">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">Order:</span>
              <CopyableField value={order.seed} length={12} small/>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatUtcDate(Number(order.createdDate))}
            </p>
          </div>
          <OrderStatusBadge status={order.status}/>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span>Total:</span>
            <div className="flex items-center gap-2 font-medium">
              <TokenIcon assetId={priceToken} size={16}/>
              <span>{priceToDisplayString(priceToken, price)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm">
            <span>Seller:</span>
            <div className="flex items-center gap-2">
              <AddressDisplay value={order.sellerWallet} length={16} small/>
              <ApprovedShopBadge walletAddress={order.sellerWallet}/>
            </div>
          </div>

          {order.updatedDate !== order.createdDate && (
            <div className="text-xs text-muted-foreground">
              Updated: {formatUtcDate(Number(order.updatedDate))}
            </div>
          )}
        </div>

        {/* Decrypt Payload Section */}
        {canDecrypt && (
          <div className="pt-4 border-t space-y-3">
            {decryptionStatus === 'idle' && (
              <Button variant="outline" size="sm" onClick={handleDecryptPayload} className="w-full">
                <Unlock className="mr-2 h-4 w-4"/>
                Decrypt Order Details
              </Button>
            )}

            {decryptionStatus === 'loading' && (
              <div className="text-center space-y-2">
                <Loader2 className="h-6 w-6 animate-spin mx-auto"/>
                <p className="text-sm text-muted-foreground">Decrypting order data...</p>
              </div>
            )}

            {decryptionStatus === 'error' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4"/>
                  <span className="text-sm font-medium">Decryption failed</span>
                </div>
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded text-left whitespace-pre-wrap">
                    {error}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={handleDecryptPayload} className="w-full">
                  Try Again
                </Button>
              </div>
            )}

            {decryptionStatus === 'success' && (buyerDecryptionResult || sellerDecryptionResult) && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <Eye className="h-4 w-4"/>
                  <span className="text-sm font-medium">Order Details Decrypted</span>
                </div>

                {/* Buyer Data Section */}
                {buyerDecryptionResult && (
                  <div className="bg-muted/50 p-3 rounded-md space-y-2">
                    <h4 className="font-medium text-sm text-blue-600">Buyer Order Data:</h4>
                    {buyerDecryptionResult.notFound ? (
                      <p className="text-xs text-muted-foreground">
                        Buyer data box not found. This might indicate an issue with the order. </p>
                    ) : buyerDecryptionResult.error ? (
                      <p className="text-xs text-destructive">
                        Error decrypting buyer data: {buyerDecryptionResult.error}
                      </p>
                    ) : buyerDecryptionResult.decryptedText ? (
                      renderJsonAsKeyValue(buyerDecryptionResult.decryptedText)
                    ) : (
                      <p className="text-xs text-muted-foreground">No buyer data available</p>
                    )}
                  </div>
                )}

                {/* Seller Data Section */}
                {sellerDecryptionResult && (
                  <div className="bg-muted/50 p-3 rounded-md space-y-2">
                    <h4 className="font-medium text-sm text-purple-600">Seller Order Data:</h4>
                    {sellerDecryptionResult.notFound ? (
                      <p className="text-xs text-muted-foreground">
                        Seller data box not found. It might not be available yet (normal before delivery). </p>
                    ) : sellerDecryptionResult.error ? (
                      <p className="text-xs text-destructive">
                        Error decrypting seller data: {sellerDecryptionResult.error}
                      </p>
                    ) : sellerDecryptionResult.decryptedText ? (
                      renderJsonAsKeyValue(sellerDecryptionResult.decryptedText)
                    ) : (
                      <p className="text-xs text-muted-foreground">No seller data available</p>
                    )}
                  </div>
                )}

                {/* Debug Information Toggle */}
                {signedSeed && (
                  <div className="border-t pt-3">
                    <Button variant="ghost" size="sm" onClick={() => setDebugExpanded(!debugExpanded)}
                            className="w-full flex items-center justify-center gap-2">
                      {debugExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4"/>
                          Hide Debug Info </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4"/>
                          Show Debug Info </>
                      )}
                    </Button>

                    {debugExpanded && (
                      <div className="space-y-3 mt-3">
                        {/* Common Debug Information */}
                        <div className="space-y-3">
                          <h5 className="font-medium text-sm text-green-600">Common Decryption Information:</h5>

                          {/* Signed Seed */}
                          <div className="p-3 bg-muted rounded-md">
                            <h3 className="font-semibold text-yellow-600 mb-2 text-sm">Signed Seed (base64)</h3>
                            <ExpandableData value={signedSeed}/>
                          </div>

                          {/* Key Pair */}
                          {keyPair && (
                            <div className="p-3 bg-muted rounded-md space-y-2">
                              <div>
                                <p className="text-sm font-medium">🔓 Public Key:</p>
                                <p className="text-xs font-mono break-all">{keyPair.publicKey}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium">🔐 Private Key:</p>
                                <ExpandableData value={keyPair.privateKey}/>
                              </div>
                            </div>
                          )}

                          {/* AES Key */}
                          {aesKey && (
                            <div className="p-3 bg-muted rounded-md">
                              <h3 className="font-semibold text-blue-600 mb-2 text-sm">Decrypted AES Key</h3>
                              <ExpandableData value={aesKey}/>
                            </div>
                          )}
                        </div>

                        {/* Buyer-specific Debug Information */}
                        {buyerDecryptionResult && !buyerDecryptionResult.notFound && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-sm text-blue-600">Buyer Debug Information:</h5>

                            {/* Payload Hash */}
                            {buyerDecryptionResult.payloadHash && (
                              <div className="p-3 bg-muted rounded-md">
                                <p className="text-sm font-medium">📦 Buyer Payload Hash:</p>
                                <p className="text-xs font-mono break-all">{buyerDecryptionResult.payloadHash}</p>
                              </div>
                            )}

                            {/* Encrypted Data */}
                            {buyerDecryptionResult.encryptedData && (
                              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <h3 className="font-semibold text-blue-700 mb-2 text-sm">Encrypted Buyer Data</h3>
                                <ExpandableData value={buyerDecryptionResult.encryptedData}/>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Seller-specific Debug Information */}
                        {sellerDecryptionResult && !sellerDecryptionResult.notFound && (
                          <div className="space-y-3">
                            <h5 className="font-medium text-sm text-purple-600">Seller Debug Information:</h5>

                            {/* Payload Hash */}
                            {sellerDecryptionResult.payloadHash && (
                              <div className="p-3 bg-muted rounded-md">
                                <p className="text-sm font-medium">📦 Seller Payload Hash:</p>
                                <p className="text-xs font-mono break-all">{sellerDecryptionResult.payloadHash}</p>
                              </div>
                            )}

                            {/* Encrypted Data */}
                            {sellerDecryptionResult.encryptedData && (
                              <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
                                <h3 className="font-semibold text-purple-700 mb-2 text-sm">Encrypted Seller Data</h3>
                                <ExpandableData value={sellerDecryptionResult.encryptedData}/>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default OrderItemDisplay
