'use client'

import { PublicSlugPathPill } from '@/app/_components/PublicSlugPathPill'
import { useCart } from '@/app/context/CartContext'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

function IconChevronRight({ className }: { className?: string }) {
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
      <path d="m9 18 6-6-6-6" />
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

function IconOrders({ className }: { className?: string }) {
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
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
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

function ProductThumbPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'P'

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f0f2f5] text-lg font-bold text-neutral-500">
      <span aria-hidden>{initial}</span>
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

/** URL público do cardápio do logista (sem query/hash). */
function getStorefrontPublicUrl(slug: string) {
  if (typeof window === 'undefined') return ''
  const path = `/${slug.replace(/^\/+|\/+$/g, '')}`
  return `${window.location.origin}${path}`
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
  subtitle,
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
}: {
  storeName: string
  storeSlug: string
  storePlan: string | null | undefined
  phone?: string | null
  subtitle?: string | null
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
}) {
  const { items, itemCount, subtotal, removeItem, setQuantity } = useCart()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [cartOpen, setCartOpen] = useState(false)
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
    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false)
      )
    }
    return out
  }, [products, selectedCategory, query])

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
  const heroSub =
    subtitle?.trim() ||
    'Os melhores pratos da região, com praticidade e sabor.'

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
    const url = getStorefrontPublicUrl(storeSlug)
    if (!url) return
    void shareStoreLink({
      url,
      title: storeName.trim() || 'Cardápio',
      text: `Cardápio online — ${storeName.trim() || 'loja'}`,
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
  const hasBanner = Boolean(banner)

  function categoryHasPromo(cat: string) {
    if (cat === 'Todos') return false
    return products.some((p) => p.category === cat && p.popular)
  }

  return (
    <div
      className="min-h-dvh bg-neutral-100 pb-[calc(9.5rem+env(safe-area-inset-bottom))]"
      style={
        {
          ['--store-primary' as string]: theme.primary,
          ['--store-secondary' as string]: theme.secondary,
        } as CSSProperties
      }
    >
      <div className="mx-auto max-w-3xl overflow-visible bg-neutral-100">
        {/* Só o bloco da imagem usa overflow-hidden + cantos — a logo fica fora para não ser cortada */}
        <div className="relative z-0 overflow-hidden rounded-t-3xl">
          <div
            className={
              hasBanner
                ? 'relative aspect-[5/3] min-h-[188px] w-full sm:min-h-[210px]'
                : 'relative h-12 w-full sm:h-14'
            }
          >
            {banner ? (
              <Image
                src={banner}
                alt={`Capa do cardápio — ${storeName}`}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 48rem"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                }}
              />
            )}
            {hasBanner ? (
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-black/15"
                aria-hidden
              />
            ) : null}
            {hasPromoDay ? (
              <span
                className={`absolute inline-flex w-fit items-center gap-1.5 rounded-full font-bold uppercase tracking-wide text-white shadow-md ${
                  hasBanner
                    ? 'left-4 top-4 px-3 py-1 text-[11px]'
                    : 'left-2 top-1.5 px-2 py-0.5 text-[9px] sm:left-3 sm:top-2 sm:text-[10px]'
                }`}
                style={{ backgroundColor: theme.primary }}
              >
                <IconFlame className="h-3.5 w-3.5 opacity-95" />
                Promo do dia
              </span>
            ) : null}
          </div>
        </div>

        {/* Logo centrada na junção banner/cartão: margem negativa = metade da altura (fluxo, sem clip) */}
        <div
          className={`relative z-30 flex justify-center ${
            hasBanner ? '-mt-[48px] sm:-mt-[50px]' : '-mt-[40px] sm:-mt-[44px]'
          }`}
        >
          <div className="relative h-[96px] w-[96px] shrink-0 overflow-hidden rounded-full border-[5px] border-white bg-white shadow-[0_8px_30px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.06] sm:h-[100px] sm:w-[100px]">
            {logoUrl?.trim() ? (
              <Image
                src={logoUrl.trim()}
                alt={storeName.trim() ? `Logo ${storeName}` : 'Logo'}
                fill
                className="object-cover"
                sizes="100px"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-2xl font-bold text-white sm:text-[26px]"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                }}
              >
                {storeName.trim().charAt(0).toUpperCase() || 'L'}
              </div>
            )}
          </div>
        </div>

        <div
          className={`relative z-20 rounded-t-3xl bg-white px-4 pb-5 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] sm:px-6 ${
            hasBanner
              ? '-mt-[68px] pt-16 sm:-mt-[72px] sm:pt-[3.5rem]'
              : '-mt-[56px] pt-14 sm:-mt-[60px] sm:pt-[3.25rem]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-extrabold uppercase leading-snug tracking-wide text-neutral-900 sm:text-base">
                {storeName}
              </h2>
              <div className="mt-2 flex items-center gap-2 text-[13px] font-medium text-neutral-800">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    storeOpen ? 'bg-emerald-500' : 'bg-neutral-400'
                  }`}
                  aria-hidden
                />
                <span>{storeStatusLine}</span>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-semibold text-neutral-600">
                {offersDelivery ? (
                  <span className="inline-flex items-center gap-2">
                    <IconTruck className="shrink-0 text-neutral-500" />
                    Entrega
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-2">
                  <IconStorePickup className="shrink-0 text-neutral-500" />
                  Retirada
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
                {heroSub}
              </p>
            </div>
            <div className="shrink-0 pt-0.5 text-neutral-300" aria-hidden>
              <IconChevronRight className="h-5 w-5" />
            </div>
          </div>
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

      <header className="sticky top-0 z-20 border-b border-neutral-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-bold leading-tight text-neutral-900">
              {storeName}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => searchRef.current?.focus()}
              className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100"
              aria-label="Buscar no cardápio"
            >
              <IconSearch className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleShareClick}
              className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100"
              aria-label="Partilhar link do cardápio desta loja"
            >
              <IconShare className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-3 sm:px-6">
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 text-neutral-400">
              <IconSearch className="h-[18px] w-[18px]" />
            </span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no cardápio…"
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition-shadow focus:border-neutral-300 focus:bg-white focus:shadow-sm"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="border-t border-neutral-100 bg-white">
          <div className="flex gap-1 overflow-x-auto px-4 pb-0 pt-1 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((cat) => {
              const active = selectedCategory === cat
              const promoTab = categoryHasPromo(cat)
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`relative inline-flex shrink-0 items-center gap-1 px-3 pb-2.5 pt-1 text-[13px] font-semibold transition-colors ${
                    active
                      ? ''
                      : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                  style={active ? { color: theme.primary } : undefined}
                >
                  {promoTab ? (
                    <IconFlame
                      className="h-3.5 w-3.5 shrink-0 opacity-90"
                      style={{ color: active ? theme.primary : '#9ca3af' }}
                    />
                  ) : null}
                  <span className="whitespace-nowrap uppercase tracking-wide">
                    {cat === 'Todos' ? 'Todos' : cat}
                  </span>
                  {active ? (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-[3px] rounded-full"
                      style={{ backgroundColor: theme.primary }}
                      aria-hidden
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
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
          <div className="space-y-8">
            {sectionBlocks.map((block) => (
              <section key={block.title} className="scroll-mt-28">
                <h2
                  className="mb-3 text-lg font-bold tracking-tight sm:text-xl"
                  style={{ color: theme.primary }}
                >
                  {block.title}
                </h2>
                <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
                  {block.items.map((p) => {
                    const pct =
                      p.originalPrice != null
                        ? discountPercent(p.originalPrice, p.price)
                        : 0
                    return (
                      <li key={p.id} className="first:pt-0">
                        <button
                          type="button"
                          onClick={() => setDetailProduct(p)}
                          className="flex w-full gap-3 py-4 text-left first:pt-3 transition-opacity active:opacity-90"
                        >
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[15px] font-bold leading-snug text-neutral-900">
                              {p.name}
                            </h3>
                            {p.description ? (
                              <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-neutral-500">
                                {p.description}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {p.originalPrice != null ? (
                                <span className="text-[13px] tabular-nums text-neutral-400 line-through">
                                  {money.format(p.originalPrice)}
                                </span>
                              ) : null}
                              <span
                                className="text-base font-bold tabular-nums"
                                style={{ color: theme.primary }}
                              >
                                {money.format(p.price)}
                              </span>
                              {pct > 0 ? (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
                                  style={{ backgroundColor: theme.primary }}
                                >
                                  {pct}%
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="relative h-[88px] w-[88px] shrink-0">
                            <div className="relative h-full w-full overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200/80">
                              {p.popular ? (
                                <span className="absolute left-1 top-1 z-[1] rounded bg-red-500 px-1 py-0.5 text-[9px] font-bold uppercase leading-none text-white">
                                  Hot
                                </span>
                              ) : null}
                              {p.imageUrl ? (
                                <Image
                                  src={p.imageUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="88px"
                                />
                              ) : (
                                <ProductThumbPlaceholder name={p.name} />
                              )}
                            </div>
                            <span
                              className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full text-xl font-light leading-none text-white shadow-lg ring-2 ring-white"
                              style={{
                                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                              }}
                              aria-hidden
                            >
                              +
                            </span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {locationEnabled ? (
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

        <div className="mt-12 flex justify-center pb-2">
          <PublicSlugPathPill
            slug={storeSlug}
            className="max-w-[min(100%,18rem)] shadow-sm"
          />
        </div>
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
                    className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
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
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(line.id)}
                            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
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
                              className="px-3 py-1.5 text-sm font-bold text-neutral-700"
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
                              className="px-3 py-1.5 text-sm font-bold text-neutral-700"
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
                  <button
                    type="button"
                    onClick={() => {
                      setCartOpen(false)
                      scrollToCheckout()
                    }}
                    disabled={items.length === 0}
                    className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50 sm:w-auto"
                    style={{ backgroundColor: theme.primary }}
                  >
                    Ir para finalizar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
          />
        </div>
        <nav
          className="mx-auto grid max-w-lg grid-cols-3 border-t border-neutral-100 px-2 pb-1 pt-0.5"
          aria-label="Navegação principal"
        >
          <button
            type="button"
            onClick={scrollToTop}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors"
            style={{ color: theme.primary }}
          >
            <IconHome className="h-6 w-6" style={{ color: theme.primary }} />
            Início
          </button>
          <button
            type="button"
            onClick={() => {
              scrollToCheckout()
            }}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-neutral-400 transition-colors hover:text-neutral-600"
          >
            <IconOrders className="h-6 w-6" />
            Pedidos
          </button>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-neutral-400 transition-colors hover:text-neutral-600"
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
    </div>
  )
}
