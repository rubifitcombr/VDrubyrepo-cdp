'use client'

import { useCart } from '@/app/context/CartContext'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

/** Limpa o carrinho ao mudar de loja ou canal (?auto=1). */
export function CartScopeGuard() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { clearCart } = useCart()
  const scopeRef = useRef<string | null>(null)

  useEffect(() => {
    const auto = searchParams.get('auto') === '1' ? 'auto' : 'slug'
    const scope = `${pathname}|${auto}`
    if (scopeRef.current && scopeRef.current !== scope) {
      clearCart()
    }
    scopeRef.current = scope
  }, [pathname, searchParams, clearCart])

  return null
}
