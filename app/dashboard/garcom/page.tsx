import Link from 'next/link'
import { headers } from 'next/headers'
import { getUser } from '@/services/auth.server'
import { getProductStocksForStore } from '@/services/inventory.server'
import { getMenuProductsForStore } from '@/services/menu.server'
import { getStoreByUser } from '@/services/store.server'
import { getStoreTablesForStore } from '@/services/waiter-tables.server'
import { getWaiterOpenOrdersForStore } from '@/services/waiter.server'
import { readStorePlano } from '@/lib/store-columns'
import { parsePlan, planTier, hasFeature } from '@/lib/plan'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { effectiveSalaoAttendanceMode } from '@/lib/salao-attendance'
import { WaiterClient } from './_components/WaiterClient'

export default async function GarcomPage() {
  const user = await getUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Sessão necessária
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Inicia sessão para usar o módulo Garçom.
        </p>
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

  const storeId = String(store.id)
  const [products, openOrders, configuredTables, stockMap] = await Promise.all([
    getMenuProductsForStore(storeId),
    getWaiterOpenOrdersForStore(storeId),
    getStoreTablesForStore(storeId),
    getProductStocksForStore(storeId),
  ])
  const stockQuantityByProductId: Record<string, number> = {}
  for (const [pid, row] of stockMap) {
    stockQuantityByProductId[pid] = row.quantity
  }
  const s = store as Record<string, unknown>
  const plan = parsePlan(readStorePlano(s))
  const printing = parsePrintingFromStore(s)
  if (planTier(plan) < planTier('GROWTH')) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--card-border)] bg-white p-8 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-[#1a1614]">Garçom e autoatendimento</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          O QR de autoatendimento no salão está disponível a partir do plano Growth. O mapa de
          garçom no painel e a alternância entre modos são do plano Pro.
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

  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? ''
  const proto = hdrs.get('x-forwarded-proto') ?? 'http'
  const origin = host ? `${proto}://${host}` : ''

  const supportsTableSectors = 'table_sectors' in s
  const tableSectors = Array.isArray(s.table_sectors)
    ? (s.table_sectors as unknown[])
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
    : ['Salão', 'Varanda']
  const waiterExitPin =
    typeof s.waiter_exit_pin === 'string' ? s.waiter_exit_pin.trim() : ''
  const storeSlug = typeof s.slug === 'string' ? s.slug.trim() : ''
  const salaoMode = effectiveSalaoAttendanceMode(plan, s.salao_attendance_mode)

  return (
    <WaiterClient
      storeId={storeId}
      storeSlug={storeSlug}
      origin={origin}
      plan={plan}
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
      waiterExitPin={waiterExitPin}
      printAgentUrl={printing.print_agent_url}
      showThermalPrint={hasFeature(plan, 'printing')}
    />
  )
}

