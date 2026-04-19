import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { PlanosPageClient } from './planos-page-client'

function adminWhatsappHref(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_WHATSAPP?.trim() ||
    process.env.ADMIN_WHATSAPP?.trim() ||
    ''
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}`
}

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
      whatsappHref={adminWhatsappHref()}
    />
  )
}
