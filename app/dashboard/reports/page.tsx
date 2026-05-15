import Link from 'next/link'
import { ReportsDashboardClient } from './_components/ReportsDashboardClient'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { dashboardUsesSlugChannelOrdersOnly } from '@/lib/slug-channel-orders'
import {
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { getUser } from '@/services/auth.server'
import { getReportsDashboardData } from '@/services/reports.server'
import { getStoreByUser } from '@/services/store.server'

export default async function ReportsPage() {
  const user = await getUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Sessão necessária
        </h1>
        <Link
          href="/login"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Ir para login
        </Link>
      </div>
    )
  }

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
  const rawPlan =
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
      : undefined
  const storeRow = store as Record<string, unknown>
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  const reportsAdvanced = hasFeature(plan, 'reports_advanced')
  const canExportPdf = hasFeature(plan, 'reports')
  const slugChannelSourcesOnly = dashboardUsesSlugChannelOrdersOnly(
    plan,
    parseOperationModeFromStore(storeRow)
  )
  const data = await getReportsDashboardData(storeId, {
    advanced: reportsAdvanced,
    slugChannelSourcesOnly,
  })

  return (
    <div className="mx-auto w-full max-w-7xl">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Relatórios</span>
      </nav>
      <div className="mt-4">
        <ReportsDashboardClient
          data={data}
          reportsAdvanced={reportsAdvanced}
          canExportPdf={canExportPdf}
        />
      </div>
    </div>
  )
}
