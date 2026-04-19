import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { getAdminWhatsappHref } from '@/lib/admin-whatsapp-href.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { PlanosPageClient } from './planos-page-client'

export default async function PlanosPage() {
  const user = await getUser()
  const store = user ? await getStoreByUser(user.id) : null
  const rawPlan =
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
      : undefined
  const currentPlan = effectiveDashboardPlan(user?.email ?? null, rawPlan)

  return (
    <PlanosPageClient
      currentPlan={currentPlan}
      whatsappHref={getAdminWhatsappHref()}
    />
  )
}
