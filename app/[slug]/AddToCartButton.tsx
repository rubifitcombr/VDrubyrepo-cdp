'use client'

import { useCart } from '@/app/context/CartContext'

export function AddToCartButton({
  productId,
  name,
  price,
  accentFrom,
  accentTo,
}: {
  productId: string
  name: string
  price: number
  accentFrom?: string
  accentTo?: string
}) {
  const { addItem } = useCart()
  const themed =
    accentFrom &&
    accentTo &&
    `linear-gradient(135deg, ${accentFrom} 0%, ${accentTo} 100%)`

  return (
    <button
      type="button"
      onClick={() =>
        addItem({
          productId,
          name,
          price,
        })
      }
      style={themed ? { background: themed } : undefined}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-xl font-light leading-none text-white ring-2 ring-white transition-transform hover:scale-105 active:scale-95 ${
        themed ? 'shadow-lg' : 'btn-vyria-gradient'
      }`}
      aria-label={`Adicionar ${name}`}
    >
      +
    </button>
  )
}
