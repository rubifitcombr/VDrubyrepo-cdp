import Link from 'next/link'
import { AssinaturaClient } from '@/app/dashboard/assinatura/assinatura-client'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { getAssinaturaPageModel } from '@/services/billing.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function AssinaturaPage() {
  const user = await getUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Sessão necessária
        </h1>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-[var(--dash-primary)] px-6 py-3 text-sm font-semibold text-white"
        >
          Entrar
        </Link>
      </div>
    )
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object') {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--dash-primary)]">
          Voltar ao painel
        </Link>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const rawPlan = readStorePlano(row)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  const model = getAssinaturaPageModel(row, plan)

  return <AssinaturaClient model={model} />
}
