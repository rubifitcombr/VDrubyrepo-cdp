import Link from 'next/link'
import { redirect } from 'next/navigation'
import { EntregadoresManagePanel } from '@/app/dashboard/entregadores/_components/EntregadoresManagePanel'
import { merchantEntregadoresEnabled } from '@/lib/plan'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function EntregadoresPage() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">Loja não encontrada</h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">Precisas de uma loja associada à tua conta.</p>
        <Link
          href="/dashboard/settings"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Configurações
        </Link>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const plan = effectiveDashboardPlan(user.email, readStorePlano(row))
  if (!merchantEntregadoresEnabled(plan)) {
    redirect('/dashboard/planos?planRestricted=1')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[#1a1614] sm:text-2xl">Entregadores</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Cadastro da equipa de entregas. Ao registar uma entrega nos{' '}
          <Link href="/dashboard/orders" className="font-semibold text-[var(--dash-primary)] hover:underline">
            Pedidos
          </Link>{' '}
          escolhes aqui quem vai à rua; no{' '}
          <Link href="/dashboard/caixa" className="font-semibold text-[var(--dash-primary)] hover:underline">
            Caixa
          </Link>{' '}
          usas os mesmos nomes para acertos.
        </p>
      </header>
      <EntregadoresManagePanel />
    </div>
  )
}
