import Link from 'next/link'
import { PromotionsManagerClient } from './_components/PromotionsManagerClient'
import { getUser } from '@/services/auth.server'
import { getMenuProductsForStore } from '@/services/menu.server'
import { getPromotionSuggestionsForStore } from '@/services/promo-suggestions.server'
import { getStorePromotionsPageData } from '@/services/promotions.server'
import { getStoreByUser } from '@/services/store.server'

export default async function PromotionsPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Precisas de uma loja associada à tua conta.
        </p>
        <Link
          href="/dashboard/settings"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Configurações
        </Link>
      </div>
    )
  }

  const storeId = store.id as string
  const [{ promotions: initial, missingTable: initialMissingTable }, products, suggestion] =
    await Promise.all([
      getStorePromotionsPageData(storeId),
      getMenuProductsForStore(storeId),
      getPromotionSuggestionsForStore(storeId),
    ])

  return (
    <PromotionsManagerClient
      storeId={storeId}
      initialPromotions={initial}
      initialMissingTable={initialMissingTable}
      initialProducts={products}
      initialSuggestion={suggestion}
    />
  )
}
