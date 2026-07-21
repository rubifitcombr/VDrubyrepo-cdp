import { APP_RESERVED_FIRST_SEGMENTS } from '@/lib/app-reserved-routes'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import {
  fetchStoreByPublicSlug,
  normalizePublicSlugSegment,
} from '@/lib/store-public-slug.server'
import { readStorePlano } from '@/lib/store-columns'
import { parsePlan, planTier } from '@/lib/plan'
import { publicDineInCheckoutAllowed } from '@/lib/salao-attendance'
import { getStoreOpenState, getTodayClosingDisplayHM } from '@/lib/business-hours'
import { syncAutoCloseOutsideHoursForStore } from '@/services/store-hours-automation.server'
import {
  baseProductPriceForChannel,
  effectiveProductPrice,
  hasActivePromotion,
  type ProductPriceChannel,
} from '@/lib/product-pricing'
import { resolveMenuImageUrl } from '@/lib/menu-image-url'
import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  type MenuProductRow,
} from '@/lib/menu-product'
import { resolveStoreTheme } from '@/lib/store-theme'
import { storePixCheckoutEnabled } from '@/lib/pix/key'
import { notFound, redirect } from 'next/navigation'
import { StorefrontMenuClient } from './StorefrontMenuClient'
import type { StorefrontMenuProduct } from './storefront-menu-types'

type Props = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
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
  'auto_close_outside_hours',
  'salao_attendance_mode',
  'operation_mode',
  'pix_enabled',
  'pix_key',
].join(',')

/** Evita 404 em cache (CDN/PWA) para rotas dinâmicas por loja. */
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function StorefrontPage({ params, searchParams }: Props) {
  const { slug: rawSlug } = await params
  const spResolved = searchParams ? await searchParams : {}
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

  const supabase = createPublicAnonClient()
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
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(spResolved)) {
      if (v == null) continue
      if (Array.isArray(v)) {
        for (const part of v) {
          if (part) q.append(k, part)
        }
      } else if (v) {
        q.set(k, v)
      }
    }
    const qs = q.toString()
    redirect(`/${canonicalSlug}${qs ? `?${qs}` : ''}`)
  }
  const theme = resolveStoreTheme(s.theme_preset)

  const manualClosedSync = await syncAutoCloseOutsideHoursForStore(
    s as Record<string, unknown>,
    supabase
  )
  const manualClosedEffective =
    manualClosedSync !== null ? manualClosedSync : s.manual_closed === true

  const { open: storeOpen, mode: hoursMode } = getStoreOpenState(
    s.business_hours,
    { manualClosed: manualClosedEffective }
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

  let list: MenuProductRow[] =
    ((ordered.data as Record<string, unknown>[] | null) ?? []).map((row) =>
      normalizeMenuProductRow(row, s.id)
    )
  if (ordered.error) {
    const fallback = await supabase
      .from('products')
      .select('*')
      .eq('store_id', s.id)
      .eq('active', true)
      .order('name', { ascending: true })
    list = ((fallback.data as Record<string, unknown>[] | null) ?? []).map(
      (row) => normalizeMenuProductRow(row, s.id)
    )
  }

  const bannerUrl = resolveMenuImageUrl(s.storefront_banner_url, s.id)

  const logoUrl = resolveMenuImageUrl(s.logo_url, s.id)
  const autoRaw = spResolved.auto
  const autoFlag = Array.isArray(autoRaw) ? autoRaw[0] : autoRaw
  const storePlan = parsePlan(readStorePlano(s as Record<string, unknown>))
  const selfServiceFromQr =
    autoFlag === '1' &&
    planTier(storePlan) >= planTier('GROWTH') &&
    publicDineInCheckoutAllowed(storePlan, s as Record<string, unknown>)
  const salaoAutoUnavailable =
    autoFlag === '1' && planTier(storePlan) >= planTier('GROWTH') && !selfServiceFromQr
  const priceChannel: ProductPriceChannel = selfServiceFromQr
    ? 'dine_in'
    : 'delivery'
  const menuProducts: StorefrontMenuProduct[] = list.map((p) => {
    const eff = effectiveProductPrice(p, priceChannel)
    const promo = hasActivePromotion(p, priceChannel)
    const base = baseProductPriceForChannel(p, priceChannel)
    const originalPrice = promo ? base : null
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      category: (p.category || '').trim() || 'Sem categoria',
      imageUrl: resolveMenuImageUrl(p.image_url, s.id),
      price: eff,
      originalPrice,
      popular: promo,
    }
  })
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
      selfServiceFromQr={selfServiceFromQr}
      salaoAutoUnavailable={salaoAutoUnavailable}
      merchantPixConfigured={storePixCheckoutEnabled(
        s as Record<string, unknown>
      )}
    />
  )
}
