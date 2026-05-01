import Link from 'next/link'
import { getUser } from '@/services/auth.server'
import { getProductStocksForStore } from '@/services/inventory.server'
import { getMenuProductsForStore } from '@/services/menu.server'
import { getStoreByUser } from '@/services/store.server'
import { getStoreTablesForStore } from '@/services/waiter-tables.server'
import { getWaiterOpenOrdersForStore } from '@/services/waiter.server'
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
  const tableSectors = Array.isArray(s.table_sectors)
    ? (s.table_sectors as unknown[])
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
    : ['Salão', 'Varanda']
  const waiterExitPin =
    typeof s.waiter_exit_pin === 'string' ? s.waiter_exit_pin.trim() : ''

  return (
    <WaiterClient
      initialProducts={products.filter((p) => p.active !== false)}
      initialOpenOrders={openOrders}
      initialSectors={tableSectors}
      initialTables={configuredTables.map((t) => ({
        id: t.id,
        name: t.name,
        ambiente: t.ambiente,
        sort_order: t.sort_order,
        active: t.active,
      }))}
      stockQuantityByProductId={stockQuantityByProductId}
      waiterExitPin={waiterExitPin}
    />
  )
}

