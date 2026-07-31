import { redirect } from 'next/navigation'
import { MasterModuleHeader } from '@/app/dashboard/master/_components/MasterModuleHeader'
import { MarketingMasterClient } from './_components/MarketingMasterClient'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function MasterMarketingPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center">
        <p className="text-sm text-vyria-navy-muted">Loja não encontrada.</p>
      </div>
    )
  }

  const plan = effectiveDashboardPlan(user.email, readStorePlano(store as Record<string, unknown>))
  if (!hasFeature(plan, 'marketing')) {
    redirect('/dashboard/upgrade?feature=marketing')
  }

  const storeId = String((store as { id: string }).id)

  return (
    <div className="mx-auto w-full max-w-4xl">
      <MasterModuleHeader
        moduleLabel="Marketing"
        title="Marketing WhatsApp"
        description="Campanhas agendadas com imagem e texto para os contactos salvos (máx. 50 por campanha)."
      />
      <div className="mt-8">
        <MarketingMasterClient storeId={storeId} />
      </div>
    </div>
  )
}
