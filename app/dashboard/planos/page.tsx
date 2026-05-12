import { Suspense } from 'react'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { getAdminWhatsappHref } from '@/lib/admin-whatsapp-href.server'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { PlanosPageClient } from './planos-page-client'

function PlanosFallback() {
  return (
    <div className="mx-auto w-full max-w-[1280px] animate-pulse pb-8">
      <div className="mb-8 h-8 w-48 rounded-lg bg-[#e5e7eb]" />
      <div className="mb-6 h-10 w-full max-w-xl rounded-xl bg-[#e5e7eb]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-80 rounded-2xl bg-[#e5e7eb]" />
        <div className="h-80 rounded-2xl bg-[#e5e7eb]" />
        <div className="h-80 rounded-2xl bg-[#e5e7eb]" />
      </div>
    </div>
  )
}

export default async function PlanosPage() {
  const user = await getUser()
  const store = user ? await getStoreByUser(user.id) : null
  const rawPlan =
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
      : undefined
  const currentPlan = effectiveDashboardPlan(user?.email ?? null, rawPlan)
  const storeOperationMode =
    store && typeof store === 'object'
      ? parseOperationModeFromStore(store as Record<string, unknown>)
      : null

  return (
    <Suspense fallback={<PlanosFallback />}>
      <PlanosPageClient
        currentPlan={currentPlan}
        storeOperationMode={storeOperationMode}
        whatsappHref={getAdminWhatsappHref()}
      />
    </Suspense>
  )
}
