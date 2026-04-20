import { APP_RESERVED_FIRST_SEGMENTS } from '@/lib/app-reserved-routes'
import { createClient } from '@/lib/supabase/server'
import { fetchStoreByPublicSlug } from '@/lib/store-public-slug.server'
import { readStorePlano } from '@/lib/store-columns'
import { getStoreOpenState, getTodayClosingDisplayHM } from '@/lib/business-hours'
import { effectiveProductPrice, hasActivePromotion } from '@/lib/product-pricing'
import { resolveStoreTheme } from '@/lib/store-theme'
import { notFound, redirect } from 'next/navigation'
import { StorefrontMenuClient } from './StorefrontMenuClient'
import type { StorefrontMenuProduct } from './storefront-menu-types'

type Props = {
  params: Promise<{ slug: string }>
}

type StoreRow = {
  id: string
  name: string
  slug: string
  plan?: string | null
  phone?: string | null
  subtitle?: string | null
  business_hours?: unknown
  manual_closed?: boolean | null
  theme_preset?: string | null
  storefront_banner_url?: string | null
  logo_url?: string | null
  delivery_fee?: number | null
  delivery_free_above?: number | null
  delivery_max_km?: number | null
}

type ProductRow = {
  id: string
  name: string
  price: number | string | null
  description?: string | null
  category?: string | null
  image_url?: string | null
  sort_order?: number | null
  promotional_price?: number | string | null
  promotion_active?: boolean | null
}

export default async function StorefrontPage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slugSegment = typeof rawSlug === 'string' ? rawSlug.trim() : ''
  if (!slugSegment) {
    notFound()
  }

  const slugLower = slugSegment.toLowerCase()
  if (
    APP_RESERVED_FIRST_SEGMENTS.has(slugLower) &&
    slugSegment !== slugLower
  ) {
    redirect('/' + slugLower)
  }

  const supabase = await createClient()
  const { data: store, error: storeError } = await fetchStoreByPublicSlug(
    supabase,
    slugSegment,
    '*'
  )

  if (storeError || !store) {
    notFound()
  }

  const s = store as StoreRow
  const canonicalSlug = typeof s.slug === 'string' ? s.slug.trim() : ''
  if (canonicalSlug && canonicalSlug !== slugSegment) {
    redirect(`/${canonicalSlug}`)
  }
  const theme = resolveStoreTheme(s.theme_preset)
  const { open: storeOpen, mode: hoursMode } = getStoreOpenState(
    s.business_hours,
    { manualClosed: s.manual_closed === true }
  )
  const closingTimeToday = getTodayClosingDisplayHM(s.business_hours)

  const productsQuery = supabase
    .from('products')
    .select('*')
    .eq('store_id', s.id)
    .eq('active', true)

  const ordered = await productsQuery
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  let list: ProductRow[] = (ordered.data as ProductRow[] | null) ?? []
  if (ordered.error) {
    const fallback = await supabase
      .from('products')
      .select('*')
      .eq('store_id', s.id)
      .eq('active', true)
      .order('name', { ascending: true })
    list = (fallback.data as ProductRow[] | null) ?? []
  }

  const menuProducts: StorefrontMenuProduct[] = list.map((p) => {
    const eff = effectiveProductPrice(p)
    const promo = hasActivePromotion(p)
    const base = Number(p.price)
    const originalPrice =
      promo && !Number.isNaN(base) ? base : null
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      category: (p.category || '').trim() || 'Sem categoria',
      imageUrl: p.image_url?.trim() || null,
      price: eff,
      originalPrice,
      popular: promo,
    }
  })

  const bannerUrl =
    typeof s.storefront_banner_url === 'string'
      ? s.storefront_banner_url.trim() || null
      : null

  const logoUrl =
    typeof s.logo_url === 'string' ? s.logo_url.trim() || null : null

  return (
    <StorefrontMenuClient
      storeName={s.name}
      storeSlug={s.slug}
      storePlan={String(readStorePlano(s as Record<string, unknown>) ?? '')}
      phone={s.phone}
      subtitle={s.subtitle}
      logoUrl={logoUrl}
      bannerUrl={bannerUrl}
      theme={{
        primary: theme.primary,
        secondary: theme.secondary,
      }}
      storeOpen={storeOpen}
      hoursMode={hoursMode}
      closingTimeToday={closingTimeToday}
      products={menuProducts}
      deliveryFee={s.delivery_fee != null ? Number(s.delivery_fee) : null}
      deliveryFreeAbove={
        s.delivery_free_above != null ? Number(s.delivery_free_above) : null
      }
      deliveryMaxKm={
        s.delivery_max_km != null ? Number(s.delivery_max_km) : null
      }
    />
  )
}
