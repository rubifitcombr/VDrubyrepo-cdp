import Link from 'next/link'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { getPdvProductsForStore } from '@/services/pdv.server'
import { getStoreByUser } from '@/services/store.server'
import { PdvClient } from './_components/PdvClient'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { hasScaleIntegration } from '@/lib/scale/gate'
import { parsePdvScaleContext } from '@/lib/store-scale'

export default async function PdvPage() {
  const user = await getUser()

  if (!user) return null

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
  const row = store as Record<string, unknown>
  const plan = effectiveDashboardPlan(user.email, readStorePlano(row))
  const cashierPanelEnabled = hasFeature(plan, 'cashier')
  const operationMode = parseOperationModeFromStore(row)
  const scaleIntegrationEnabled = hasScaleIntegration(plan, operationMode)
  const scaleConfig = parsePdvScaleContext(row)
  const [initialProducts, turnoAberto] = await Promise.all([
    getPdvProductsForStore(storeId),
    cashierPanelEnabled
      ? getOpenCaixaTurno(await createClient(), storeId)
      : Promise.resolve(null),
  ])

  return (
    <PdvClient
      storeId={storeId}
      initialProducts={initialProducts}
      cashierPanelEnabled={cashierPanelEnabled}
      initialCaixaTurnoOpen={Boolean(turnoAberto)}
      scaleIntegrationEnabled={scaleIntegrationEnabled}
      scaleConfig={scaleConfig}
    />
  )
}
