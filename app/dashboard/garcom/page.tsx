import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { getUser } from '@/services/auth.server'
import { getProductStocksForStore } from '@/services/inventory.server'
import { getMenuProductsForStore } from '@/services/menu.server'
import { getStoreByUser } from '@/services/store.server'
import { getStoreTablesForStore } from '@/services/waiter-tables.server'
import { getWaiterOpenOrdersForStore } from '@/services/waiter.server'
import { loadGarconsPageData } from '@/services/garcons-page.server'
import { readStorePlano } from '@/lib/store-columns'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parsePlan, planTier, hasFeature } from '@/lib/plan'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { hasScaleIntegration } from '@/lib/scale/gate'
import { parsePdvScaleContext } from '@/lib/store-scale'
import { effectiveSalaoAttendanceMode } from '@/lib/salao-attendance'
import { WaiterClient } from './_components/WaiterClient'

export default async function GarcomPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getUser()
  if (!user) return null
  const params = searchParams ? await searchParams : {}
  const hubParam = typeof params.hub === 'string' ? params.hub : null
  const tablesOnlyView = hubParam === 'mesas'
  const forceWaiterView = hubParam === 'salao'

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

  const storeId = String(store.id)
  const s = store as Record<string, unknown>
  const rawPlan = readStorePlano(s)
  const planEffective = effectiveDashboardPlan(user.email ?? null, rawPlan)

  const [products, openOrders, configuredTables, stockMap, turnoAberto, garconsPage] =
    await Promise.all([
    getMenuProductsForStore(storeId),
    getWaiterOpenOrdersForStore(storeId),
    getStoreTablesForStore(storeId),
    hasFeature(planEffective, 'inventory')
      ? getProductStocksForStore(storeId)
      : Promise.resolve(
          new Map<
            string,
            { quantity: number; lowStockAlert: number | null; updatedAt: string | null }
          >()
        ),
    hasFeature(planEffective, 'cashier')
      ? getOpenCaixaTurno(await createClient(), storeId)
      : Promise.resolve(null),
    loadGarconsPageData(storeId),
  ])
  const stockQuantityByProductId: Record<string, number> = {}
  for (const [pid, row] of stockMap) {
    stockQuantityByProductId[pid] = row.quantity
  }
  const plan = parsePlan(rawPlan)
  const printing = parsePrintingFromStore(s)
  const operationMode = parseOperationModeFromStore(s)
  const scaleIntegrationEnabled = hasScaleIntegration(planEffective, operationMode)
  const scaleConfig = parsePdvScaleContext(s)
  if (planTier(planEffective) < planTier('GROWTH')) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--card-border)] bg-white p-8 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-[#1a1614]">Garçom e autoatendimento</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          O QR de mesa no salão está disponível a partir do plano Growth com operação{' '}
          <strong>presencial</strong> ou <strong>híbrida</strong>. O mapa de garçom no painel e a
          alternância entre modos são do plano Pro.
        </p>
        <Link
          href="/dashboard/planos"
          className="mt-6 inline-flex rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105"
        >
          Ver planos
        </Link>
      </div>
    )
  }

  const supportsTableSectors = 'table_sectors' in s
  const tableSectors = Array.isArray(s.table_sectors)
    ? (s.table_sectors as unknown[])
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
    : ['Salão', 'Varanda']
  const salaoMode = effectiveSalaoAttendanceMode(plan, s.salao_attendance_mode)

  const storeName =
    typeof s.name === 'string' && s.name.trim()
      ? s.name.trim()
      : 'Meu estabelecimento'
  const storeSlug =
    typeof s.slug === 'string' && s.slug.trim() ? s.slug.trim() : ''

  return (
    <WaiterClient
      storeId={storeId}
      storeName={storeName}
      storeSlug={storeSlug}
      plan={planEffective}
      initialSalaoAttendanceMode={salaoMode}
      initialProducts={products.filter((p) => p.active !== false)}
      initialOpenOrders={openOrders}
      initialSectors={tableSectors}
      supportsTableSectors={supportsTableSectors}
      initialTables={configuredTables.map((t) => ({
        id: t.id,
        name: t.name,
        ambiente: t.ambiente,
        sort_order: t.sort_order,
        active: t.active,
      }))}
      stockQuantityByProductId={stockQuantityByProductId}
      printAgentUrl={printing.print_agent_url}
      showThermalPrint={hasFeature(planEffective, 'printing')}
      printing={printing}
      tablesOnlyView={tablesOnlyView}
      forceWaiterView={forceWaiterView}
      initialCaixaTurnoOpen={Boolean(turnoAberto)}
      initialGarcons={garconsPage.garcons.filter((g) => g.ativo)}
      scaleIntegrationEnabled={scaleIntegrationEnabled}
      scaleConfig={scaleConfig}
    />
  )
}

