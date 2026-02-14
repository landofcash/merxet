import {ArrowLeft, Trash2, Store, QrCode, ShoppingCart, AlertTriangle} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardSlim, CardTitle} from '@/components/ui/card'
import {Link, useLocation, useNavigate} from 'react-router-dom'
import {useEffect, useMemo, useState} from 'react'
import {type CartItem, getCartItems, clearCart, saveCartItems} from '@/lib/cartStorage'
import {priceToDisplayString, getSupportedTokens} from '@/lib/tokenUtils'
import TokenIcon from '@/components/TokenIcon'
import AddressDisplay from '@/components/AddressDisplay'
import ApprovedShopBadge from '@/components/ApprovedShopBadge'
import {useOrder} from '@/context/OrderContext'
import {useWallet} from '@/context/WalletContext'

type LocationState = {
  highlightedItemId?: string
} | null

type CartItemWithNetwork = CartItem

type GroupedCartItems = {
  [shopWallet: string]: CartItemWithNetwork[]
}

function CartPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {setOrder} = useOrder()
  const {network} = useWallet()
  const state = location.state as LocationState
  const [cartItems, setCartItems] = useState<CartItemWithNetwork[]>([])
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const [removedUnsupportedCount, setRemovedUnsupportedCount] = useState<number>(0)

  useEffect(() => {
    const loaded = getCartItems() as CartItemWithNetwork[]

    // Build a set of supported coin types
    const supported = new Set(getSupportedTokens().map(t => t.tokenId))

    // Remove any cart item that uses an unsupported token
    const cleaned = loaded.filter(it => supported.has(it.priceToken))
    const removed = loaded.length - cleaned.length
    if (removed > 0) {
      setRemovedUnsupportedCount(removed)
      // Persist the cleaned cart so future visits remain stable
      saveCartItems(cleaned as CartItem[])
    }

    setCartItems(cleaned)

    // Set the highlighted item if provided in the navigation state
    if (state?.highlightedItemId) {
      setHighlightedItemId(state.highlightedItemId)
    }
  }, [state?.highlightedItemId, network])

  const visibleItems = useMemo(
    () => cartItems.filter(item => item.network === network),
    [cartItems, network]
  )

  // Clear highlight after 3 seconds
  useEffect(() => {
    if (!highlightedItemId) return

    const timeout = setTimeout(() => {
      setHighlightedItemId(null)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [highlightedItemId])

  const handleClearCart = () => {
    clearCart()
    setCartItems([])
  }

  const handleUpdateQuantity = (itemId: string, itemNetwork: string | undefined, newQuantity: number) => {
    if (newQuantity < 1) return

    const targetNetwork = itemNetwork ?? network
    const updatedItems = cartItems.map(item =>
      item.id === itemId && item.network === targetNetwork
        ? {...item, quantity: newQuantity}
        : item
    )

    setCartItems(updatedItems)
    saveCartItems(updatedItems as CartItem[])
  }

  const handleRemoveItem = (itemId: string, itemNetwork: string | undefined) => {
    const targetNetwork = itemNetwork ?? network
    const updatedItems = cartItems.filter(
      item => !(item.id === itemId && item.network === targetNetwork)
    )
    setCartItems(updatedItems)
    saveCartItems(updatedItems as CartItem[])
  }

  const handleOrderFromShop = (items: CartItem[]) => {
    // Calculate token totals for this specific shop
    const shopTokenTotals = items.reduce((totals, item) => {
      const tokenType = item.priceToken
      const itemTotal = item.price * BigInt(item.quantity)
      totals[tokenType] = (totals[tokenType] || 0n) + itemTotal
      return totals
    }, {} as Record<string, bigint>)

    // Create default delivery info
    const defaultDeliveryInfo = {
      fullName: '',
      address: '',
      city: '',
      postalCode: '',
      country: '',
      phone: '',
      email: '',
      deliveryComments: '',
      noPhysicalDelivery: false
    }

    // Set order in context with shop-specific items
    setOrder({
      cartItems: items,
      deliveryInfo: defaultDeliveryInfo,
      tokenTotals: shopTokenTotals
    })

    // Navigate to the order page
    navigate('/order')
  }

  // Group cart items by shop wallet
  const groupedItems: GroupedCartItems = useMemo(() => {
    return visibleItems.reduce((groups, item) => {
      const shopWallet = item.shopWallet
      if (!groups[shopWallet]) {
        groups[shopWallet] = []
      }
      groups[shopWallet].push(item)
      return groups
    }, {} as GroupedCartItems)
  }, [visibleItems])

  // Calculate total by token type for all items (for display purposes)
  const globalTokenTotals = useMemo(() => {
    return visibleItems.reduce((totals, item) => {
      const tokenType = item.priceToken
      const itemTotal = item.price * BigInt(item.quantity)
      totals[tokenType] = (totals[tokenType] || 0n) + itemTotal
      return totals
    }, {} as Record<string, bigint>)
  }, [visibleItems])

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-4 py-8 sm:py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">Your Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {removedUnsupportedCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
              <div className="text-sm">
                {removedUnsupportedCount} item{removedUnsupportedCount > 1 ? 's' : ''} in your cart use unsupported tokens and were removed.
              </div>
            </div>
          )}
          {visibleItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Your cart is empty </div>
          ) : (
            <>
              <div className="space-y-6">
                {Object.entries(groupedItems).map(([shopWallet, items]) => {
                  // Calculate token totals for this specific shop
                  const shopTokenTotals = items.reduce((totals, item) => {
                    const tokenType = item.priceToken
                    const itemTotal = item.price * BigInt(item.quantity)
                    totals[tokenType] = (totals[tokenType] || 0n) + itemTotal
                    return totals
                  }, {} as Record<string, bigint>)

                  return (
                    <CardSlim key={shopWallet}>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Store className="h-5 w-5 text-primary"/>
                          <AddressDisplay value={shopWallet} length={20}/>
                          <ApprovedShopBadge walletAddress={shopWallet}/>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-0 space-y-0">
                        {/* Items for this shop */}
                        <div className="space-y-3 mb-6">
                          {items.map(item => {
                            const itemNetwork = item.network
                            return (
                              <div key={item.id} className={`flex items-start gap-4 transition-all duration-1000 ${
                                highlightedItemId === item.id
                                  ? 'animate-pulse bg-primary/10 shadow-lg scale-105'
                                  : 'bg-muted/30'
                              }`}>
                                {/* Product Image - Now a clickable link */}
                                <Link to="/product-details" state={{
                                  productSeed: item.seed,
                                  itemId: item.id,
                                  network: itemNetwork
                                }} className="flex-shrink-0">
                                  <img src={item.image} alt={item.name}
                                       className="w-16 h-16 object-cover rounded-md hover:opacity-80 transition-opacity cursor-pointer"/>
                                </Link>

                                <div className="flex-1 flex flex-col">
                                  <h3 className="font-medium line-clamp-2">{item.name}</h3>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <TokenIcon assetId={item.priceToken} size={16}/>
                                      <span>
                                        {priceToDisplayString(item.priceToken, item.price, false)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" size="icon"
                                              onClick={() => handleUpdateQuantity(item.id, itemNetwork, item.quantity - 1)}>
                                        -
                                      </Button>
                                      <span className="w-8 text-center">{item.quantity}</span>
                                      <Button variant="outline" size="icon"
                                              onClick={() => handleUpdateQuantity(item.id, itemNetwork, item.quantity + 1)}>
                                        +
                                      </Button>
                                      <Button variant="ghost" size="icon" className="text-destructive"
                                              onClick={() => handleRemoveItem(item.id, itemNetwork)}>
                                        <Trash2 className="h-4 w-4"/>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Shop Total and Order Button */}
                        <div className="pt-3 border-t space-y-3">
                          <div className="space-y-2">
                            {Object.entries(shopTokenTotals).map(([tokenType, total], index) => (
                              <div key={tokenType} className="flex items-center justify-between">
                                <span className="font-medium">
                                  {index === 0 ? 'Shop Total:' : ''}
                                </span>
                                <div className="flex items-center gap-2">
                                  <TokenIcon assetId={tokenType} size={20}/>
                                  <span className="font-bold">
                                    {priceToDisplayString(tokenType, total)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Order Button for this shop */}
                          <Button size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => handleOrderFromShop(items)}>
                            <ShoppingCart className="mr-2 h-5 w-5"/>
                            Order from <AddressDisplay value={shopWallet} length={8} className="ml-1"/>
                            <ApprovedShopBadge walletAddress={shopWallet} className="ml-1"/>
                          </Button>
                        </div>
                      </CardContent>
                    </CardSlim>
                  )
                })}
              </div>

              {/* Global Actions */}
              <div className="pt-4 border-t space-y-4">
                {/* Global Total (for reference) */}
                <div className="space-y-2">
                  {Object.entries(globalTokenTotals).map(([tokenType, total], index) => (
                    <div key={tokenType} className="flex items-center justify-between">
                      <span className="font-medium">
                        {index === 0 ? 'Grand Total:' : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        <TokenIcon assetId={tokenType} size={20}/>
                        <span className="font-bold">
                          {priceToDisplayString(tokenType, total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buttons Row - Clear Cart (1/4 width, left) and Scan Another Code (3/4 width, right) */}
                <div className="flex items-start gap-4">
                  {/* Clear Cart Button - 1/4 width, same height as the scan button */}
                  <Button variant="destructive" size="sm" onClick={handleClearCart}
                          className="w-1/4 h-20 flex flex-col items-center justify-center">
                    <Trash2 className="h-4 w-4 mb-1"/>
                    <span className="text-xs">Clear Cart</span>
                  </Button>

                  {/* Scan Another Code Button - 3/4 width, 2 rows height */}
                  <Link to="/scan" className="block w-3/4">
                    <Button className="w-full h-20" size="lg">
                      <QrCode className="mr-2 h-5 w-5"/>
                      Scan Another Code
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default CartPage
