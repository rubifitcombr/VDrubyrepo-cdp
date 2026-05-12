import { redirect } from 'next/navigation'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { resolveStoreTheme } from '@/lib/store-theme'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { AppearanceThemeClient } from './_components/AppearanceThemeClient'

/** Sempre dados frescos da loja após guardar (evita cache de RSC). */
export const dynamic = 'force-dynamic'

export default async function AppearancePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-vyria-navy/20 bg-white p-8 text-center">
        <p className="text-sm text-vyria-navy-muted">
          Cria primeiro a tua loja para personalizar o tema.
        </p>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const rawPreset =
    typeof row.theme_preset === 'string' && row.theme_preset.trim()
      ? row.theme_preset.trim().toLowerCase()
      : ''
  const resolved = resolveStoreTheme(rawPreset || undefined)
  const initialBanner =
    typeof row.storefront_banner_url === 'string'
      ? row.storefront_banner_url.trim() || null
      : null

  const initialSlug =
    typeof row.slug === 'string' && row.slug.trim() ? row.slug.trim() : ''

  const hidePublicSlugFields = !isDeliveryPipelineEnabled(
    parseOperationModeFromStore(row)
  )

  return (
    <AppearanceThemeClient
      key={`appearance-${String(row.id)}-${rawPreset || 'none'}-${initialSlug}-${initialBanner ?? 'nobanner'}`}
      storeId={String(row.id)}
      storeName={typeof row.name === 'string' ? row.name : 'Meu estabelecimento'}
      initialPreset={resolved.id}
      initialBannerUrl={initialBanner}
      initialSlug={initialSlug}
      hidePublicSlugFields={hidePublicSlugFields}
    />
  )
}
