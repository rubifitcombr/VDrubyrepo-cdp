import { redirect } from 'next/navigation'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { resolveStoreTheme } from '@/lib/store-theme'
import { AppearanceThemeClient } from './_components/AppearanceThemeClient'

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
  const preset =
    typeof row.theme_preset === 'string' ? row.theme_preset : undefined
  const resolved = resolveStoreTheme(preset)
  const initialBanner =
    typeof row.storefront_banner_url === 'string'
      ? row.storefront_banner_url.trim() || null
      : null

  const initialSlug =
    typeof row.slug === 'string' && row.slug.trim() ? row.slug.trim() : ''

  return (
    <AppearanceThemeClient
      storeId={String(row.id)}
      storeName={typeof row.name === 'string' ? row.name : 'Meu estabelecimento'}
      initialPreset={resolved.id}
      initialBannerUrl={initialBanner}
      initialSlug={initialSlug}
    />
  )
}
