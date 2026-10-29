// Cart = a draft of the shop's next order, kept on the phone so a dropped network or a closed tab loses nothing.
import { useCallback, useEffect, useState } from 'react'

export type Cart = Record<string, number> // variant_id -> cases

const KEY = (shopId: string) => `cart:${shopId}`
export const MAX_QTY = 999

export function loadCart(shopId: string): Cart {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(shopId)) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(raw).filter(([, q]) => Number.isInteger(q) && (q as number) > 0 && (q as number) <= MAX_QTY)) as Cart
  } catch { return {} }
}

export function setQty(cart: Cart, variantId: string, qty: number): Cart {
  const next = { ...cart }
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(qty)))
  if (q === 0) delete next[variantId]; else next[variantId] = q
  return next
}

export const cartCases = (c: Cart) => Object.values(c).reduce((s, q) => s + q, 0)

export function useCart(shopId: string) {
  const [cart, setCart] = useState<Cart>(() => loadCart(shopId))
  useEffect(() => { localStorage.setItem(KEY(shopId), JSON.stringify(cart)) }, [shopId, cart])
  const set = useCallback((variantId: string, qty: number) => setCart((c) => setQty(c, variantId, qty)), [])
  const replace = useCallback((c: Cart) => setCart(c), [])
  const clear = useCallback(() => setCart({}), [])
  return { cart, set, replace, clear }
}
