import { redirect } from 'next/navigation'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { PrintingClient } from './_components/PrintingClient'

function parseDeliveryFee(row: Record<string, unknown>): number {
  const raw = row.delivery_fee
  if (raw == null || raw === '') return 5.99
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 5.99
}

export default async function PrintingPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-vyria-navy/20 bg-white p-8 text-center">
        <p className="text-sm text-vyria-navy-muted">
          Cria primeiro a tua loja para configurar impressão.
        </p>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const initial = parsePrintingFromStore(row)
  const storeName =
    typeof row.name === 'string' ? row.name : 'Meu estabelecimento'
  const deliveryFee = parseDeliveryFee(row)

  return (
    <PrintingClient
      storeId={String(row.id)}
      storeName={storeName}
      deliveryFee={deliveryFee}
      initial={initial}
    />
  )
}
