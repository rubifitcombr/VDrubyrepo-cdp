import { Suspense } from 'react'
import { CartProvider } from '@/app/context/CartContext'
import { CartScopeGuard } from './_components/CartScopeGuard'

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CartProvider>
      <Suspense fallback={null}>
        <CartScopeGuard />
      </Suspense>
      {children}
    </CartProvider>
  )
}
