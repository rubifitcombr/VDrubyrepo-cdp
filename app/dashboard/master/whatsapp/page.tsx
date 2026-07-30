import { redirect } from 'next/navigation'
import { MasterModuleHeader } from '@/app/dashboard/master/_components/MasterModuleHeader'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { WhatsAppMasterClient } from './_components/WhatsAppMasterClient'

export default async function MasterWhatsAppPage() {
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
  if (!hasFeature(plan, 'whatsapp_ai')) {
    redirect('/dashboard/upgrade?feature=whatsapp_ai')
  }

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
      <MasterModuleHeader
        moduleLabel="WhatsApp"
        title="WhatsApp oficial"
        description="Número da loja na Meta Cloud API — robô IA, notificações e fidelidade."
      />

      <div className="mt-8">
        <WhatsAppMasterClient />
      </div>
    </div>
  )
}
