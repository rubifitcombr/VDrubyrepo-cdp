import { APP_RESERVED_FIRST_SEGMENTS } from '@/lib/app-reserved-routes'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  fetchStoreByPublicSlug,
  normalizePublicSlugSegment,
} from '@/lib/store-public-slug.server'
import { readStorePlano } from '@/lib/store-columns'
import { parsePlan, planTier } from '@/lib/plan'
import { getStoreOpenState, getTodayClosingDisplayHM } from '@/lib/business-hours'
import { effectiveProductPrice, hasActivePromotion } from '@/lib/product-pricing'
import { MENU_PRODUCT_SELECT } from '@/lib/menu-product'
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
  location_enabled?: boolean | null
  location_lat?: number | null
  location_lng?: number | null
  location_address?: string | null
  location_label?: string | null
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

const STORE_PUBLIC_SELECT = [
  'id',
  'name',
  'slug',
  'plan',
  'plano',
  'phone',
  'subtitle',
  'business_hours',
  'manual_closed',
  'theme_preset',
  'storefront_banner_url',
  'logo_url',
  'delivery_fee',
  'delivery_free_above',
  'delivery_max_km',
  'location_enabled',
  'location_lat',
  'location_lng',
  'location_address',
  'location_label',
].join(',')

/** Evita 404 em cache (CDN/PWA) para rotas dinâmicas por loja. */
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function StorefrontPage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slugSegment =
    typeof rawSlug === 'string' ? normalizePublicSlugSegment(rawSlug) : ''
  if (!slugSegment) {
    notFound()
  }

  const slugLower = slugSegment.toLowerCase()
  if (APP_RESERVED_FIRST_SEGMENTS.has(slugLower)) {
    if (slugSegment !== slugLower) {
      redirect('/' + slugLower)
    }
    const firstPartyPath: Record<string, string> = {
      blog: '/blog',
      login: '/login',
      register: '/register',
      admin: '/admin',
      dashboard: '/dashboard',
      'acesso-suspenso': '/acesso-suspenso',
      planos: '/planos',
    }
    const reservedDest = firstPartyPath[slugLower]
    if (reservedDest) {
      redirect(reservedDest)
    }
  }

  /** Preferir service role: leitura pública fiável sem depender de cookies/RLS para `anon` (mobile). */
  const supabase =
    tryCreateServiceRoleClient() ?? (await createClient())
  const { data: store, error: storeError } = await fetchStoreByPublicSlug(
    supabase,
    slugSegment,
    STORE_PUBLIC_SELECT
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
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', s.id)
    .eq('active', true)

  const ordered = await productsQuery
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  let list: ProductRow[] = (ordered.data as ProductRow[] | null) ?? []
  if (ordered.error) {
    const fallback = await supabase
      .from('products')
      .select(MENU_PRODUCT_SELECT)
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
  const storePlan = parsePlan(readStorePlano(s as Record<string, unknown>))
  const canShowLocation = planTier(storePlan) >= planTier('GROWTH')
  const rawLat = s.location_lat != null ? Number(s.location_lat) : null
  const rawLng = s.location_lng != null ? Number(s.location_lng) : null
  const locationLat = rawLat != null && Number.isFinite(rawLat) ? rawLat : null
  const locationLng = rawLng != null && Number.isFinite(rawLng) ? rawLng : null
  const locationAddress =
    typeof s.location_address === 'string' ? s.location_address.trim() || null : null
  const locationLabel =
    typeof s.location_label === 'string' ? s.location_label.trim() || null : null

  return (
    <StorefrontMenuClient
      storeName={s.name}
      storeSlug={s.slug}
      storePlan={storePlan}
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
      locationEnabled={canShowLocation && Boolean(s.location_enabled)}
      locationLat={locationLat}
      locationLng={locationLng}
      locationAddress={locationAddress}
      locationLabel={locationLabel}
    />
  )
}
