import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/context/WalletContext'
import { fetchSellerOrders, type Order } from '@/lib/syncService'
import { ShoppingCart, Package, Eye, Calendar, User, DollarSign, Hash, Clock } from 'lucide-react'
import CopyableField from '@/components/CopyableField'
import TokenIcon from '@/components/TokenIcon'
import { priceToDisplayString } from '@/lib/tokenUtils'
import { formatUtcDate } from '@/lib/dateUtils'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import AddressWithName from "@/components/AddressWithName.tsx";

// Helper function to safely parse timestamp strings to numbers
function parseTimestamp(timestamp: string): number {
  try {
    const parsed = parseInt(timestamp, 10)
    return isNaN(parsed) ? 0 : parsed
  } catch (error) {
    console.error('Error parsing timestamp:', error)
    return 0
  }
}

function MyOrdersPage() {
  const { walletAddress } = useWallet()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = async () => {
    if (!walletAddress) return

    setIsLoading(true)
    setError(null)

    try {
      const sellerOrders = await fetchSellerOrders(walletAddress)
      setOrders(sellerOrders)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [walletAddress])

  const handleViewDetails = (order: Order) => {
    navigate('/order-details', { state: { order } })
  }

  if (!walletAddress) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              My Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Please connect your wallet to view your orders.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              My Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading orders...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" />
              My Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                When customers place orders for your products, they will appear here.
                You'll be able to track order status, manage fulfillment, and communicate with buyers.
              </p>
            </div>

            <div className="border-t pt-6">
              <h4 className="font-semibold mb-3">Features Available:</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• View incoming customer orders</li>
                <li>• Track order status and payment confirmations</li>
                <li>• Manage order fulfillment and shipping</li>
                <li>• Communicate with buyers</li>
                <li>• Export order data and analytics</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="px-4 py-8 sm:py-16">
      <Card className="w-full max-w-7xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            My Orders ({orders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {orders.map((order, index) => (
              <div
                key={`${order.seed}-${index}`}
                className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Column 1: Order ID & Status */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">Order ID:</span>
                      <CopyableField
                        value={order.seed}
                        length={8}
                        mdLength={12}
                        small={true}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Status:</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>

                  {/* Column 2: Customer & Amount */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Customer:</span>
                      <AddressWithName
                        value={order.buyerWallet}
                        length={6}
                        mdLength={8}
                        small={true}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Amount:</span>
                      <div className="flex items-center gap-1">
                        <TokenIcon assetId={order.priceToken} size={16} />
                        <span className="font-semibold text-green-600 text-sm">
                          {priceToDisplayString(order.priceToken, parseInt(order.amount))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Created & Updated */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Created:</span>
                      <span className="text-sm">
                        {formatUtcDate(parseTimestamp(order.createdDate))}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Updated:</span>
                      <span className="text-sm">
                        {formatUtcDate(parseTimestamp(order.updatedDate))}
                      </span>
                    </div>
                  </div>

                  {/* Column 4: Action Buttons */}
                  <div className="flex flex-col justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(order)}
                      className="h-8"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Details
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="text-sm text-destructive">{error}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default MyOrdersPage
