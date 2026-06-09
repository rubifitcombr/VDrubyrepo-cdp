import { redirect } from 'next/navigation'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { PrintingPreviewClient } from '../_components/PrintingPreviewClient'

function parseDeliveryFee(row: Record<string, unknown>): number {
  const raw = row.delivery_fee
  if (raw == null || raw === '') return 5.99
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 5.99
}

export default async function PrintingPreviewPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    redirect('/dashboard/printing')
  }

  const row = store as Record<string, unknown>
  const initial = parsePrintingFromStore(row)
  const storeName =
    typeof row.name === 'string' ? row.name : 'Meu estabelecimento'
  const deliveryFee = parseDeliveryFee(row)

  return (
    <PrintingPreviewClient
      storeName={storeName}
      deliveryFee={deliveryFee}
      initial={initial}
    />
  )
}
