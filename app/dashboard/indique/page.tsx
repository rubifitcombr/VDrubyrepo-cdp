import Link from 'next/link'
import { Suspense } from 'react'
import { IndiqueGanheClient } from '@/app/dashboard/indique/_components/IndiqueGanheClient'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { planEligibleForReferralProgram } from '@/lib/referral/eligibility'
import { readStorePlano } from '@/lib/store-columns'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getReferralDashboardData } from '@/services/store-referral.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

function IndiqueLoading() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl animate-pulse space-y-4 px-1 py-2">
      <div className="h-4 w-28 rounded bg-[#e5e7eb]" />
      <div className="h-8 w-48 rounded bg-[#e5e7eb]" />
      <div className="h-40 rounded-2xl bg-[#f3f4f6]" />
    </div>
  )
}

async function IndiquePageContent() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object') {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">Loja não encontrada</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--dash-primary)]">
          Voltar ao painel
        </Link>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const plan = effectiveDashboardPlan(user.email ?? null, readStorePlano(row))
  if (!planEligibleForReferralProgram(plan)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--card-border)] bg-white p-8 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">Indique e ganhe</h1>
        <p className="mt-3 text-sm text-vyria-navy-muted">
          Este programa está disponível a partir do plano Growth.
        </p>
        <Link
          href="/dashboard/planos"
          className="mt-6 inline-flex rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Ver planos
        </Link>
      </div>
    )
  }

  const storeId = String(row.id)
  const svc = createServiceRoleClient()
  const data = await getReferralDashboardData(svc, storeId)

  return <IndiqueGanheClient data={data} />
}

export default function IndiquePage() {
  return (
    <Suspense fallback={<IndiqueLoading />}>
      <IndiquePageContent />
    </Suspense>
  )
}
