import {z} from "zod"
import {APP_KEY_PREFIX} from "@/config.ts";

export const CartItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.bigint(), // base units
  priceToken: z.string(), // coinType string
  quantity: z.number().int().positive(),
  image: z.string().url(),
  shopWallet: z.string(),
  sellerPubKey: z.string(), // seller public key
  seed: z.string(), // seed from the product box
  network: z.string(), // required: the network this item belongs to
})

export type CartItem = z.infer<typeof CartItemSchema>

const CART_STORAGE_KEY = `${APP_KEY_PREFIX}-cart`

export function getCartItems(): CartItem[] {
  try {
    const items = localStorage.getItem(CART_STORAGE_KEY)
    if (!items) return []

    const parsedItems = JSON.parse(items, (key, value) => {
      // Convert price back to bigint when loading from localStorage
      if (key === 'price' && typeof value === 'string') {
        return BigInt(value)
      }
      return value
    })
    return CartItemSchema.array().parse(parsedItems)
  } catch (error) {
    console.error('Error loading cart items:', error)
    return []
  }
}

export function saveCartItems(items: CartItem[]): void {
  try {
    // Convert bigint to string for JSON serialization
    const serializedItems = JSON.stringify(items, (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }
      return value
    })
    localStorage.setItem(CART_STORAGE_KEY, serializedItems)
  } catch (error) {
    console.error('Error saving cart items:', error)
  }
}

export function clearCart(): void {
  try {
    localStorage.removeItem(CART_STORAGE_KEY)
  } catch (error) {
    console.error('Error clearing cart:', error)
  }
}

export function addItemToCart(item: CartItem): void {
  try {
    const currentItems = getCartItems()
    const existingItemIndex = currentItems.findIndex(i => i.id === item.id && i.network === item.network)

    if (existingItemIndex !== -1) {
      // Item exists on same network, update quantity
      currentItems[existingItemIndex].quantity += item.quantity
    } else {
      // New item, add to cart
      currentItems.push(item)
    }

    saveCartItems(currentItems)
  } catch (error) {
    console.error('Error adding item to cart:', error)
  }
}

export function removeItemsByShopWallet(shopWallet: string): void {
  try {
    const currentItems = getCartItems()
    // Filter out all items that belong to the specified shop wallet
    const remainingItems = currentItems.filter(item => item.shopWallet !== shopWallet)
    saveCartItems(remainingItems)
  } catch (error) {
    console.error('Error removing items by shop wallet:', error)
  }
}
