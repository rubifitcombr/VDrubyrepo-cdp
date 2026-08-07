import Link from 'next/link'
import { getUser } from '@/services/auth.server'
import { getProductStocksForStore } from '@/services/inventory.server'
import { getMenuProductsForStore } from '@/services/menu.server'
import { getStoreByUser } from '@/services/store.server'
import { InventoryClient } from './_components/InventoryClient'

export default async function InventoryPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
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
  const [products, stockMap] = await Promise.all([
    getMenuProductsForStore(storeId),
    getProductStocksForStore(storeId),
  ])

  const initialRows = products.map((p) => {
    const s = stockMap.get(p.id)
    return {
      productId: p.id,
      name: p.name,
      category: p.category,
      active: p.active !== false,
      hasStockControl: s !== undefined,
      quantity: s?.quantity ?? 0,
      lowStockAlert: s?.lowStockAlert ?? null,
      updatedAt: s?.updatedAt ?? null,
    }
  })

  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav className="text-xs text-vyria-navy-muted">
        <Link href="/dashboard" className="hover:text-vyria-navy">
          Início
        </Link>
        <span className="mx-1">/</span>
        <span className="font-medium text-vyria-navy">Estoque</span>
      </nav>
      <InventoryClient initialRows={initialRows} />
    </div>
  )
}
