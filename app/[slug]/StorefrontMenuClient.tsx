'use client'

import { PublicSlugPathPill } from '@/app/_components/PublicSlugPathPill'
import { MenuImage } from '@/app/_components/MenuImage'
import { useCart } from '@/app/context/CartContext'
import type { CSSProperties } from 'react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ProductDetailModal } from './ProductDetailModal'
import type { StorefrontMenuProduct } from './storefront-menu-types'
import { WhatsAppCheckoutButton } from './WhatsAppCheckoutButton'

export type { StorefrontMenuProduct } from './storefront-menu-types'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

type ThemeProps = {
  primary: string
  secondary: string
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function IconFlame({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 23a7.5 7.5 0 0 0 7.5-7.5c0-2.5-1.5-4.5-3-6.5-1.5 2-3.5 3.5-6 4.5.5-3 0-5.5-2.5-8C6 8 4 12 4 15.5A7.5 7.5 0 0 0 12 23Z" />
    </svg>
  )
}

function IconShare({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  )
}

function IconMapPin({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

function IconExternalArrow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

function IconTruck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  )
}

function IconStorePickup({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconHome({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconCartNav({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  )
}

function IconArmchair({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <path d="M5 11h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2Z" />
      <path d="M5 17v3" />
      <path d="M19 17v3" />
    </svg>
  )
}

function IconAlertTriangle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function IconPhoto({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  )
}

function IconShoppingCart({ className }: { className?: string }) {
  return <IconCartNav className={className} />
}

function ProductThumbPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-neutral-400">
      <IconPhoto className="h-7 w-7" />
    </div>
  )
}

function categorySortKey(a: string, b: string) {
  if (a === 'Sem categoria') return 1
  if (b === 'Sem categoria') return -1
  return a.localeCompare(b, 'pt')
}

function discountPercent(original: number, current: number) {
  if (!Number.isFinite(original) || original <= 0) return 0
  const pct = Math.round((1 - current / original) * 100)
  return pct > 0 ? pct : 0
}

/** URL público do cardápio do logista. */
function getStorefrontPublicUrl(slug: string, auto = false) {
  if (typeof window === 'undefined') return ''
  const path = `/${slug.replace(/^\/+|\/+$/g, '')}`
  const base = `${window.location.origin}${path}`
  return auto ? `${base}?auto=1` : base
}

async function shareStoreLink({
  url,
  title,
  text,
}: {
  url: string
  title: string
  text: string
}) {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text, url })
      return
    }
    await navigator.clipboard.writeText(url)
  } catch {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* ignore */
    }
  }
}

export function StorefrontMenuClient({
  storeName,
  storeSlug,
  storePlan,
  phone,
  logoUrl,
  bannerUrl,
  theme,
  storeOpen,
  hoursMode,
  closingTimeToday,
  products,
  deliveryFee,
  deliveryFreeAbove,
  deliveryMaxKm,
  locationEnabled,
  locationLat,
  locationLng,
  locationAddress,
  locationLabel,
  selfServiceFromQr = false,
  salaoAutoUnavailable = false,
  merchantPixConfigured = false,
}: {
  storeName: string
  storeSlug: string
  storePlan: string | null | undefined
  phone?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  theme: ThemeProps
  storeOpen: boolean
  hoursMode: 'always' | 'scheduled' | 'manual'
  closingTimeToday?: string | null
  products: StorefrontMenuProduct[]
  deliveryFee?: number | null
  deliveryFreeAbove?: number | null
  deliveryMaxKm?: number | null
  locationEnabled?: boolean
  locationLat?: number | null
  locationLng?: number | null
  locationAddress?: string | null
  locationLabel?: string | null
  /** Cardápio com `?auto=1` e loja a aceitar pedidos de mesa. */
  selfServiceFromQr?: boolean
  /** `?auto=1` mas a loja não aceita (ex.: Pro em modo garçom). */
  salaoAutoUnavailable?: boolean
  merchantPixConfigured?: boolean
}) {
  const { items, itemCount, subtotal, addItem, removeItem, setQuantity } = useCart()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpenSignal, setCheckoutOpenSignal] = useState(0)
  const [autoContextDismissed, setAutoContextDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.sessionStorage.getItem(`vyria:auto-chip:${storeSlug}`) === '1'
    } catch {
      return false
    }
  })
  const [slugContextDismissed, setSlugContextDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.sessionStorage.getItem(`vyria:slug-chip:${storeSlug}`) === '1'
    } catch {
      return false
    }
  })
  const [detailProduct, setDetailProduct] =
    useState<StorefrontMenuProduct | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) set.add(p.category)
    const rest = [...set].sort(categorySortKey)
    return ['Todos', ...rest]
  }, [products])

  const filtered = useMemo(() => {
    let out = products
    if (selectedCategory !== 'Todos') {
      out = out.filter((p) => p.category === selectedCategory)
    }
    const q = deferredQuery.trim().toLowerCase()
    if (q) {
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false)
      )
    }
    return out
  }, [products, selectedCategory, deferredQuery])

  const sectionBlocks = useMemo(() => {
    if (selectedCategory !== 'Todos') {
      return [{ title: selectedCategory, items: filtered }]
    }
    const map = new Map<string, StorefrontMenuProduct[]>()
    for (const p of filtered) {
      const c = p.category
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(p)
    }
    return [...map.entries()]
      .sort((a, b) => categorySortKey(a[0], b[0]))
      .map(([title, items]) => ({ title, items }))
  }, [filtered, selectedCategory])

  const hasPromoDay = products.some((p) => p.popular)
  const autoMode = selfServiceFromQr

  const storeStatusLine = useMemo(() => {
    if (!storeOpen) {
      if (hoursMode === 'scheduled') return 'Fechado agora'
      return 'Fechado'
    }
    if (hoursMode === 'scheduled' && closingTimeToday) {
      return `Aberto até às ${closingTimeToday}`
    }
    return 'Aberto agora'
  }, [storeOpen, hoursMode, closingTimeToday])

  const offersDelivery =
    deliveryFee !== undefined &&
    deliveryFee !== null &&
    Number.isFinite(Number(deliveryFee))
  const hasCoords =
    Number.isFinite(Number(locationLat)) && Number.isFinite(Number(locationLng))
  const mapsHref = useMemo(() => {
    if (!locationEnabled) return null
    const text = locationAddress?.trim() || ''
    if (text && /^https?:\/\//i.test(text)) return text
    if (hasCoords) {
      return `https://maps.google.com/?q=${locationLat},${locationLng}`
    }
    if (text) {
      return `https://maps.google.com/?q=${encodeURIComponent(text)}`
    }
    return null
  }, [hasCoords, locationAddress, locationEnabled, locationLat, locationLng])
  const locationTitle = locationLabel?.trim() || 'Nossa localização'
  const locationDescription =
    locationAddress?.trim() && !/^https?:\/\//i.test(locationAddress.trim())
      ? locationAddress.trim()
      : 'Toque no botão para abrir o mapa.'
  const mapEmbedSrc =
    locationEnabled && hasCoords
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(locationLng) - 0.01},${Number(locationLat) - 0.01},${Number(locationLng) + 0.01},${Number(locationLat) + 0.01}&layer=mapnik&marker=${Number(locationLat)},${Number(locationLng)}`
      : null

  function scrollToCheckout() {
    document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' })
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleShareClick() {
    if (typeof window === 'undefined') return
    const url = getStorefrontPublicUrl(storeSlug, selfServiceFromQr)
    if (!url) return
    void shareStoreLink({
      url,
      title: storeName.trim() || 'Cardápio',
      text: `Cardápio online — ${storeName.trim() || 'loja'}`,
    })
  }

  function handleDismissSlugContext() {
    setSlugContextDismissed(true)
    try {
      window.sessionStorage.setItem(`vyria:slug-chip:${storeSlug}`, '1')
    } catch {
      /* ignore */
    }
  }

  function handleDismissAutoContext() {
    setAutoContextDismissed(true)
    try {
      window.sessionStorage.setItem(`vyria:auto-chip:${storeSlug}`, '1')
    } catch {
      /* ignore */
    }
  }

  function productQuantity(productId: string) {
    return items
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + line.quantity, 0)
  }

  function decrementProduct(productId: string) {
    const line = items.find((item) => item.productId === productId)
    if (!line) return
    setQuantity(line.id, line.quantity - 1)
  }

  function incrementProduct(product: StorefrontMenuProduct) {
    const existing = items.find(
      (item) => item.productId === product.id && !item.addons?.length
    )
    if (existing) {
      setQuantity(existing.id, existing.quantity + 1)
      return
    }
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
    })
  }

  useEffect(() => {
    if (!cartOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [cartOpen])

  const banner = bannerUrl?.trim() || null

  function categoryHasPromo(cat: string) {
    if (cat === 'Todos') return false
    return products.some((p) => p.category === cat && p.popular)
  }

  const autoFrameClass =
    'mx-auto max-w-sm overflow-hidden bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)] ring-1 ring-black/10 sm:my-4 sm:rounded-[1.4rem]'

  const slugDeliveryChipLabel = offersDelivery
    ? 'Entrega e retirada no local'
    : 'Retirada no local'

  return (
    <div
      className={`min-h-dvh ${
        autoMode
          ? 'bg-[#f6f3ea] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:py-3'
          : 'bg-neutral-100 pb-[calc(9.5rem+env(safe-area-inset-bottom))]'
      }`}
      style={
        {
          ['--store-primary' as string]: theme.primary,
          ['--store-secondary' as string]: theme.secondary,
        } as CSSProperties
      }
    >
      <div className={autoFrameClass}>
            <div className="relative z-0 overflow-hidden bg-neutral-200">
              <div
                className="relative h-[112px] w-full"
                style={
                  banner
                    ? undefined
                    : {
                        background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                      }
                }
              >
                {banner ? (
              <MenuImage
                    src={banner}
                    alt={`Capa do cardápio — ${storeName}`}
                    fill
                    priority
                    className="object-cover object-[center_46%]"
                    sizes="(max-width: 768px) 100vw, 48rem"
                fallback={
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                    }}
                  />
                }
                  />
                ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/80">
                    <IconPhoto className="h-8 w-8 opacity-75" />
                  </div>
                )}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent"
                  aria-hidden
                />
                <div
                  className="absolute inset-x-0 bottom-0 h-2"
                  style={{
                    background: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                  }}
                  aria-hidden
                />
                {hasPromoDay ? (
                  <span
                    className="absolute left-3 top-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <IconFlame className="h-3.5 w-3.5 opacity-95" />
                    Promo do dia
                  </span>
                ) : null}
              </div>
            </div>

            <div className="relative z-20 bg-white px-2.5 pb-2 pt-2">
              <button
                type="button"
                onClick={scrollToTop}
                className="flex w-full items-center gap-2 text-left"
              >
                <span
                  className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-extrabold text-white shadow-sm"
                  style={{ backgroundColor: theme.primary }}
                >
                  {logoUrl?.trim() ? (
                <MenuImage
                      src={logoUrl.trim()}
                      alt={storeName.trim() ? `Logo ${storeName}` : 'Logo'}
                      fill
                      className="object-cover"
                      sizes="36px"
                  fallback={
                    <span className="flex h-full w-full items-center justify-center text-xs font-extrabold">
                      {storeName.trim().slice(0, 2).toUpperCase() || 'LO'}
                    </span>
                  }
                    />
                  ) : (
                    storeName.trim().slice(0, 2).toUpperCase() || 'LO'
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-extrabold leading-tight text-neutral-950">
                    {storeName}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold text-neutral-600">
                    {storeStatusLine}
                  </span>
                </span>
              </button>

                  {salaoAutoUnavailable ? (
            <div className="mt-2 flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-900">
                    <IconAlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Autoatendimento indisponível — chame o garçom
              </span>
            </div>
          ) : null}

          {autoMode && !autoContextDismissed ? (
            <div className="mt-2 flex items-center gap-1.5 rounded-full border border-[#EBD19A] bg-[#FAEEDA] px-2 py-1.5 text-[10px] font-bold text-[#633806]">
                    <IconArmchair className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                Pedido na mesa · Autoatendimento
                  </span>
                  <button
                    type="button"
                    onClick={handleDismissAutoContext}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs leading-none active:bg-black/10"
                    aria-label="Fechar aviso"
                  >
                    ×
                  </button>
                </div>
              ) : null}

          {!autoMode && !slugContextDismissed ? (
            <div className="mt-2 flex items-center gap-1.5 rounded-full border border-[#EBD19A] bg-[#FAEEDA] px-2 py-1.5 text-[10px] font-bold text-[#633806]">
              {offersDelivery ? (
                <IconTruck className="h-4 w-4 shrink-0" />
              ) : (
                <IconStorePickup className="h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{slugDeliveryChipLabel}</span>
              <button
                type="button"
                onClick={handleDismissSlugContext}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs leading-none active:bg-black/10"
                aria-label="Fechar aviso"
              >
                ×
              </button>
                  </div>
                    ) : null}
                  </div>
      </div>

      {hoursMode === 'manual' && !storeOpen ? (
        <div className="border-b border-amber-200/80 bg-[#FFF8E7] px-4 py-2.5 text-center text-[13px] font-medium text-amber-950 sm:px-6">
          Loja fechada no painel — o logista pode reabrir quando quiser.
        </div>
      ) : null}
      {hoursMode === 'scheduled' && !storeOpen ? (
        <div className="border-b border-amber-200/80 bg-[#FFF8E7] px-4 py-2.5 text-center text-[13px] font-medium text-amber-950 sm:px-6">
          Fora do horário — ainda podes ver o cardápio; o envio fica ao critério da loja.
        </div>
      ) : null}

      <header
        className={
          autoMode
            ? 'mx-auto max-w-sm border-b border-neutral-200/80 bg-white shadow-sm sm:-mt-4'
            : 'sticky top-0 z-20 border-b border-neutral-200/90 bg-white/95 backdrop-blur-md'
        }
      >
        <div
          className={
            autoMode
              ? 'mx-auto flex max-w-sm items-center justify-between gap-2 px-2.5 py-1.5'
              : 'mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6'
          }
        >
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={scrollToTop}
              className="block max-w-full text-left"
            >
              <h1
                className={
                  autoMode
                    ? 'sr-only'
                    : 'truncate text-[17px] font-bold leading-tight text-neutral-900'
                }
              >
              {storeName}
              </h1>
            </button>
          </div>
          <div className={autoMode ? 'flex shrink-0 items-center gap-0.5' : 'flex shrink-0 items-center gap-1'}>
            <button
              type="button"
              onClick={() => searchRef.current?.focus()}
              className={
                autoMode
                  ? 'flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 transition-colors active:bg-neutral-100'
                  : 'flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100 active:bg-neutral-200'
              }
              aria-label="Buscar no cardápio"
            >
              <IconSearch className={autoMode ? 'h-4 w-4' : 'h-5 w-5'} />
            </button>
            <button
              type="button"
              onClick={handleShareClick}
              className={
                autoMode
                  ? 'flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 transition-colors active:bg-neutral-100'
                  : 'flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100 active:bg-neutral-200'
              }
              aria-label="Partilhar link do cardápio desta loja"
            >
              <IconShare className={autoMode ? 'h-4 w-4' : 'h-5 w-5'} />
            </button>
          </div>
        </div>

        <div className={autoMode ? 'mx-auto max-w-sm px-2.5 pb-1.5' : 'mx-auto max-w-3xl px-4 pb-3 sm:px-6'}>
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 text-neutral-400">
              <IconSearch className={autoMode ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
            </span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no cardápio…"
              className={
                autoMode
                  ? 'w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-8 pr-2 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none transition-shadow focus:border-neutral-300 focus:bg-white focus:shadow-sm'
                  : 'w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition-shadow focus:border-neutral-300 focus:bg-white focus:shadow-sm'
              }
              autoComplete="off"
            />
          </label>
        </div>

        <div
          className={
            autoMode
              ? 'sticky top-0 z-10 border-t border-neutral-100 bg-white shadow-sm'
              : 'border-t border-neutral-100 bg-white'
          }
        >
          <div className="pointer-events-none absolute right-0 top-0 z-[1] flex h-full w-8 items-center justify-end bg-gradient-to-l from-white via-white/85 to-transparent pr-1.5 text-xs font-bold text-neutral-400">
            →
          </div>
          <div className={autoMode ? 'flex snap-x snap-mandatory gap-1.5 overflow-x-auto whitespace-nowrap px-2.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'flex snap-x snap-mandatory gap-2 overflow-x-auto whitespace-nowrap px-4 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}>
            {categories.map((cat) => {
              const active = selectedCategory === cat
              const promoTab = categoryHasPromo(cat)
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`relative inline-flex shrink-0 snap-start items-center gap-1 rounded-full font-semibold transition-colors active:bg-neutral-200/90 ${
                    autoMode ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-2 text-[13px]'
                  } ${
                    active
                      ? 'text-white shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                  style={active ? { backgroundColor: theme.primary } : undefined}
                >
                  {promoTab ? (
                    <IconFlame
                      className="h-3.5 w-3.5 shrink-0 opacity-90"
                      style={{ color: active ? '#ffffff' : '#9ca3af' }}
                    />
                  ) : null}
                  <span className="whitespace-nowrap uppercase tracking-wide">
                    {cat === 'Todos' ? 'Todos' : cat}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main className={autoMode ? 'mx-auto max-w-sm bg-white px-2.5 py-2.5' : 'mx-auto max-w-3xl px-4 py-5 sm:px-6'}>
        {products.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-16 text-center">
            <p className="text-sm font-medium text-neutral-800">
              Cardápio em atualização
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Volta em breve para ver os pratos disponíveis.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-6 text-center text-sm text-neutral-500">
            Nenhum item encontrado. Tenta outra busca ou categoria.
          </p>
        ) : (
          <div className={autoMode ? 'space-y-4' : 'space-y-8'}>
            {sectionBlocks.map((block) => (
              <section key={block.title} className={autoMode ? 'scroll-mt-20' : 'scroll-mt-28'}>
                <h2
                  className={
                    autoMode
                      ? 'mb-1.5 text-[11px] font-extrabold tracking-tight'
                      : 'mb-3 text-lg font-bold tracking-tight sm:text-xl'
                  }
                  style={{ color: theme.primary }}
                >
                  {block.title}
                </h2>
                <ul className={autoMode ? 'divide-y divide-neutral-100' : 'divide-y divide-neutral-200 border-t border-neutral-200'}>
                  {block.items.map((p) => {
                    const pct =
                      p.originalPrice != null
                        ? discountPercent(p.originalPrice, p.price)
                        : 0
                    const qtyInCart = productQuantity(p.id)
                    return (
                      <li key={p.id} className="first:pt-0">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetailProduct(p)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setDetailProduct(p)
                            }
                          }}
                          className={
                            autoMode
                              ? 'grid w-full grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5 text-left transition-colors active:bg-neutral-50'
                              : 'flex w-full gap-3 py-4 text-left first:pt-3 transition-colors active:bg-neutral-100'
                          }
                        >
                          <div className={autoMode ? 'order-2 min-w-0 flex-1' : 'min-w-0 flex-1'}>
                            <h3 className={autoMode ? 'text-xs font-bold leading-snug text-neutral-950' : 'text-[15px] font-bold leading-snug text-neutral-900'}>
                              {p.name}
                            </h3>
                            {p.description ? (
                              <p className={autoMode ? 'mt-0.5 line-clamp-1 text-[10px] leading-snug text-neutral-600' : 'mt-1 line-clamp-3 text-[13px] leading-relaxed text-neutral-500'}>
                                {p.description}
                              </p>
                            ) : null}
                            <div className={autoMode ? 'mt-1.5 flex flex-wrap items-center gap-1.5' : 'mt-2 flex flex-wrap items-center gap-2'}>
                              {p.originalPrice != null ? (
                                <span className={autoMode ? 'text-[10px] tabular-nums text-neutral-400 line-through' : 'text-[13px] tabular-nums text-neutral-400 line-through'}>
                                  {money.format(p.originalPrice)}
                                </span>
                              ) : null}
                              <span
                                className={autoMode ? 'text-xs font-extrabold tabular-nums' : 'text-base font-bold tabular-nums'}
                                style={{ color: theme.primary }}
                              >
                                {money.format(p.price)}
                              </span>
                              {pct > 0 ? (
                                <span
                                  className={autoMode ? 'rounded px-1 py-0.5 text-[10px] font-bold text-white' : 'rounded px-1.5 py-0.5 text-[11px] font-bold text-white'}
                                  style={{ backgroundColor: theme.primary }}
                                >
                                  {pct}%
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className={autoMode ? 'order-1 relative h-[60px] w-[60px] shrink-0' : 'relative h-[88px] w-[88px] shrink-0'}>
                            <div className="relative h-full w-full overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200/80">
                              {p.popular ? (
                                <span className="absolute left-1 top-1 z-[1] rounded bg-red-500 px-1 py-0.5 text-[9px] font-bold uppercase leading-none text-white">
                                  Hot
                                </span>
                              ) : null}
                              {p.imageUrl ? (
                                <MenuImage
                                  src={p.imageUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes={autoMode ? '60px' : '88px'}
                                  loading="lazy"
                                  fallback={<ProductThumbPlaceholder />}
                                />
                              ) : (
                                <ProductThumbPlaceholder />
                              )}
                            </div>
                            {!autoMode && qtyInCart > 0 ? (
                              <span
                                className={autoMode ? 'absolute -bottom-1 -right-1 inline-flex min-h-7 items-center rounded-full bg-white p-0.5 shadow ring-1 ring-neutral-200' : 'absolute -bottom-2 -right-2 inline-flex min-h-10 items-center rounded-full bg-white p-1 shadow-lg ring-2 ring-white'}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    decrementProduct(p.id)
                                  }}
                                  className={autoMode ? 'flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-neutral-700 active:bg-neutral-100' : 'flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-neutral-700 active:bg-neutral-100'}
                                  aria-label={`Remover uma unidade de ${p.name}`}
                                >
                                  −
                                </button>
                                <span className={autoMode ? 'min-w-5 text-center text-[10px] font-extrabold tabular-nums text-neutral-900' : 'min-w-7 text-center text-sm font-extrabold tabular-nums text-neutral-900'}>
                                  {qtyInCart}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    incrementProduct(p)
                                  }}
                                  className={autoMode ? 'flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white active:brightness-90' : 'flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-white active:brightness-90'}
                                  style={{ backgroundColor: theme.primary }}
                                  aria-label={`Adicionar mais uma unidade de ${p.name}`}
                                >
                                  +
                                </button>
                              </span>
                            ) : !autoMode ? (
                              <span
                                className={autoMode ? 'absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white text-sm font-bold leading-none shadow-sm' : 'absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full text-xl font-light leading-none text-white shadow-lg ring-2 ring-white'}
                                style={autoMode ? { color: theme.primary } : { backgroundColor: theme.primary }}
                                aria-hidden
                              >
                                +
                              </span>
                            ) : null}
                          </div>
                          {autoMode ? (
                            <div
                              className="order-3 flex min-w-[2rem] justify-end"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {qtyInCart > 0 ? (
                                <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      decrementProduct(p.id)
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-neutral-700 active:bg-neutral-100"
                                    aria-label={`Remover uma unidade de ${p.name}`}
                                  >
                                    −
                                  </button>
                                  <span className="min-w-5 text-center text-[10px] font-extrabold tabular-nums text-neutral-900">
                                    {qtyInCart}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      incrementProduct(p)
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white active:brightness-90"
                                    style={{ backgroundColor: theme.primary }}
                                    aria-label={`Adicionar mais uma unidade de ${p.name}`}
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    incrementProduct(p)
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-base font-bold shadow-sm active:bg-neutral-100"
                                  style={{ color: theme.primary }}
                                  aria-label={`Adicionar ${p.name}`}
                                >
                                  +
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {!autoMode && locationEnabled ? (
          <section className="mt-10 rounded-2xl border border-neutral-200 bg-[#f8fafc] p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <IconMapPin className="h-5 w-5 text-neutral-700" />
              <h3 className="text-base font-bold text-neutral-900">{locationTitle}</h3>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
              {locationDescription}
            </p>
            {mapEmbedSrc ? (
              <iframe
                src={mapEmbedSrc}
                width="100%"
                height="200"
                style={{ border: 'none', borderRadius: 12 }}
                loading="lazy"
                className="mt-3"
                referrerPolicy="no-referrer-when-downgrade"
                title="Mapa da loja"
              />
            ) : null}
            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Ver no Google Maps
                <IconExternalArrow className="h-4 w-4" />
              </a>
            ) : null}
          </section>
        ) : null}

        {!autoMode ? (
        <div className="mt-12 flex justify-center pb-2">
          <PublicSlugPathPill
            slug={storeSlug}
            className="max-w-[min(100%,18rem)] shadow-sm"
          />
        </div>
        ) : null}
      </main>

      {detailProduct ? (
        <ProductDetailModal
          product={detailProduct}
          theme={theme}
          onClose={() => setDetailProduct(null)}
        />
      ) : null}

      {cartOpen ? (
        <div
          className="fixed inset-0 z-[95] bg-black/50"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCartOpen(false)
          }}
        >
          <div className="flex min-h-dvh items-end justify-center p-0 sm:items-center sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cart-modal-title"
              className="w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-neutral-200 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3
                      id="cart-modal-title"
                      className="text-lg font-bold tracking-tight text-neutral-900"
                    >
                      Pedido
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                      {itemCount} item(ns) no carrinho
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCartOpen(false)}
                    className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 active:bg-neutral-200"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              <div className="max-h-[60dvh] overflow-y-auto px-4 py-4 sm:px-6">
                {items.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
                    O carrinho está vazio.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {items.map((line) => (
                      <li
                        key={line.id}
                        className="rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug text-neutral-900">
                              {line.name}
                            </p>
                            <p className="mt-1 text-sm font-medium text-neutral-500">
                              {money.format(line.price)} cada
                            </p>
                            {line.addons && line.addons.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {(() => {
                                  const grouped = new Map<
                                    string,
                                    { itemName: string; price: number; quantity: number }
                                  >()
                                  for (const addon of line.addons) {
                                    const unitQty =
                                      Number.isFinite(addon.quantity) &&
                                      addon.quantity > 0
                                        ? addon.quantity
                                        : 1
                                    const key = `${addon.groupName}__${addon.itemName}__${addon.price}`
                                    const cur = grouped.get(key)
                                    if (cur) {
                                      cur.quantity += unitQty
                                    } else {
                                      grouped.set(key, {
                                        itemName: addon.itemName,
                                        price: addon.price,
                                        quantity: unitQty,
                                      })
                                    }
                                  }
                                  return [...grouped.values()].map((addon, idx) => {
                                    const addonTotal = addon.price * addon.quantity
                                    return (
                                      <li
                                        key={`${line.id}-addon-${idx}`}
                                        className="flex items-center justify-between gap-2 text-xs text-neutral-600"
                                      >
                                        <span className="min-w-0 truncate">
                                          + {addon.itemName}
                                          {addon.quantity > 1 ? ` x${addon.quantity}` : ''}
                                        </span>
                                        <span className="shrink-0 tabular-nums">
                                          {money.format(addonTotal)}
                                        </span>
                                      </li>
                                    )
                                  })
                                })()}
                              </ul>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(line.id)}
                            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
                          >
                            Remover
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="inline-flex items-center rounded-full border border-neutral-200">
                            <button
                              type="button"
                              onClick={() =>
                                setQuantity(line.id, line.quantity - 1)
                              }
                              className="rounded-l-full px-3 py-1.5 text-sm font-bold text-neutral-700 transition-colors active:bg-neutral-200"
                            >
                              -
                            </button>
                            <span className="min-w-8 text-center text-sm font-semibold text-neutral-800">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setQuantity(line.id, line.quantity + 1)
                              }
                              className="rounded-r-full px-3 py-1.5 text-sm font-bold text-neutral-700 transition-colors active:bg-neutral-200"
                            >
                              +
                            </button>
                          </div>
                          <p className="text-sm font-bold text-neutral-900">
                            {money.format(line.price * line.quantity)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-neutral-800">
                    Subtotal: {money.format(subtotal)}
                  </p>
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setCartOpen(false)}
                      className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                    >
                      Continuar comprando
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCartOpen(false)
                        scrollToCheckout()
                        setCheckoutOpenSignal((v) => v + 1)
                      }}
                      disabled={items.length === 0}
                      className="rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-[filter] disabled:opacity-50 enabled:active:brightness-[0.88]"
                      style={{ backgroundColor: theme.primary }}
                    >
                      Ir para finalizar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {autoMode ? (
        <>
          <WhatsAppCheckoutButton
            storeName={storeName}
            storeSlug={storeSlug}
            storePlan={storePlan}
            phone={phone}
            deliveryFee={deliveryFee ?? null}
            deliveryFreeAbove={deliveryFreeAbove ?? null}
            deliveryMaxKm={deliveryMaxKm ?? null}
            locationEnabled={locationEnabled}
            locationLat={locationLat ?? null}
            locationLng={locationLng ?? null}
            locationAddress={locationAddress ?? null}
            locationLabel={locationLabel ?? null}
            openSignal={checkoutOpenSignal}
            dineInSelfService={selfServiceFromQr}
            merchantPixConfigured={merchantPixConfigured}
            primaryColor={theme.primary}
            hideTrigger
          />
          {itemCount > 0 && selfServiceFromQr ? (
            <div
              id="checkout"
              className="sticky bottom-0 z-30 border-t border-neutral-300 bg-white pb-[env(safe-area-inset-bottom)]"
            >
              <div className="mx-auto grid h-14 max-w-sm grid-cols-[1fr_auto_auto] items-center gap-2 px-2.5">
                <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold leading-tight text-neutral-950">
                  <IconShoppingCart className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block">{itemCount}</span>
                    <span className="block">{itemCount === 1 ? 'item' : 'itens'}</span>
                  </span>
                </div>
                <div className="text-[10px] font-extrabold leading-tight text-neutral-950">
                  <span className="block">R$</span>
                  <span className="block tabular-nums">{money.format(subtotal).replace('R$', '').trim()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckoutOpenSignal((v) => v + 1)}
                  className="h-11 min-w-[86px] shrink-0 rounded-lg border border-neutral-900 bg-white px-3 text-[12px] font-extrabold leading-tight text-neutral-950 active:bg-neutral-100"
                >
                  Finalizar<br />→
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div
          id="checkout"
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
        >
          <div className="mx-auto max-w-lg px-3 pt-3">
            <WhatsAppCheckoutButton
              storeName={storeName}
              storeSlug={storeSlug}
              storePlan={storePlan}
              phone={phone}
              deliveryFee={deliveryFee ?? null}
              deliveryFreeAbove={deliveryFreeAbove ?? null}
              deliveryMaxKm={deliveryMaxKm ?? null}
              locationEnabled={locationEnabled}
              locationLat={locationLat ?? null}
              locationLng={locationLng ?? null}
              locationAddress={locationAddress ?? null}
              locationLabel={locationLabel ?? null}
              openSignal={checkoutOpenSignal}
              dineInSelfService={selfServiceFromQr}
              merchantPixConfigured={merchantPixConfigured}
              primaryColor={theme.primary}
            />
          </div>
          <nav
            className="mx-auto grid max-w-lg grid-cols-2 border-t border-neutral-100 px-2 pb-1 pt-0.5"
            aria-label="Navegação principal"
          >
            <button
              type="button"
              onClick={scrollToTop}
              className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition-colors active:bg-neutral-200/90"
              style={{ color: theme.primary }}
            >
              <IconHome className="h-6 w-6" style={{ color: theme.primary }} />
              Início
            </button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold text-neutral-400 transition-colors hover:text-neutral-600 active:bg-neutral-200/90 active:text-neutral-600"
            >
              <span className="relative inline-flex">
                <IconCartNav className="h-6 w-6" />
                {itemCount > 0 ? (
                  <span
                    className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                ) : null}
              </span>
              Carrinho
            </button>
          </nav>
        </div>
      )}
    </div>
  )
}
