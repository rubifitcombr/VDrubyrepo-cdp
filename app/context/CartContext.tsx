'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

export type CartAddonPick = {
  groupName: string
  itemName: string
  price: number
}

export type CartLine = {
  /** Identificador único da linha no carrinho */
  id: string
  productId: string
  /** Nome já formatado para exibição / WhatsApp (inclui adicionais e obs. quando aplicável) */
  name: string
  /** Preço unitário (base + adicionais) */
  price: number
  quantity: number
  notes?: string | null
  addons?: CartAddonPick[]
}

type CartContextValue = {
  items: CartLine[]
  addItem: (
    item: Omit<CartLine, 'id' | 'quantity'> & {
      id?: string
      quantity?: number
    }
  ) => void
  removeItem: (lineId: string) => void
  setQuantity: (lineId: string, quantity: number) => void
  clearCart: () => void
  itemCount: number
  subtotal: number
}

const CartContext = createContext<CartContextValue | null>(null)

function newLineId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `l_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([])

  const addItem = useCallback(
    (item: Omit<CartLine, 'id' | 'quantity'> & { id?: string; quantity?: number }) => {
      const qty = item.quantity ?? 1
      if (qty < 1) return

      const id = item.id ?? newLineId()
      const line: CartLine = {
        id,
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: qty,
        notes: item.notes,
        addons: item.addons,
      }

      setItems((prev) => [...prev, line])
    },
    []
  )

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((l) => l.id !== lineId))
  }, [])

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((l) => l.id !== lineId))
      return
    }
    setItems((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, quantity } : l))
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((n, l) => n + l.quantity, 0)
    const subtotal = items.reduce(
      (sum, l) => sum + l.price * l.quantity,
      0
    )
    return {
      items,
      addItem,
      removeItem,
      setQuantity,
      clearCart,
      itemCount,
      subtotal,
    }
  }, [items, addItem, removeItem, setQuantity, clearCart])

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart deve ser usado dentro de CartProvider')
  }
  return ctx
}
