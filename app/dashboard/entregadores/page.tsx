import Link from 'next/link'
import { redirect } from 'next/navigation'
import { EntregadoresOpsClient } from '@/app/dashboard/entregadores/_components/EntregadoresOpsClient'
import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import { merchantEntregadoresEnabled } from '@/lib/plan'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function EntregadoresPage() {
  const user = await getUser()
  if (!user) return null

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
  const operationMode = parseOperationModeFromStore(row)
  if (
    !merchantEntregadoresEnabled(plan) ||
    !isDeliveryPipelineEnabled(operationMode) ||
    !menuKeysForMerchant(plan, operationMode).has('entregadores')
  ) {
    redirect('/dashboard')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[#1a1614] sm:text-2xl">
          Entregadores
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Centro operacional: quem está na rua, atrasos, saldos e acertos. Despacha pedidos em{' '}
          <Link href="/dashboard/orders" className="font-semibold text-[var(--dash-primary)] hover:underline">
            Pedidos
          </Link>{' '}
          com «Sair para entrega»; o acerto financeiro regista-se aqui e reflete no{' '}
          <Link href="/dashboard/caixa" className="font-semibold text-[var(--dash-primary)] hover:underline">
            Caixa
          </Link>
          .
        </p>
      </header>
      <EntregadoresOpsClient />
    </div>
  )
}
