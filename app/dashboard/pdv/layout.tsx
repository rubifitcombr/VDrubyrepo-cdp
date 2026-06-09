import { redirect } from 'next/navigation'
import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function PdvLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  const storeRow =
    store && typeof store === 'object' ? (store as Record<string, unknown>) : null
  const rawPlan = storeRow ? readStorePlano(storeRow) : undefined
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  const operationMode = parseOperationModeFromStore(storeRow)

  if (!menuKeysForMerchant(plan, operationMode).has('pdv')) {
    redirect('/dashboard/upgrade?feature=pdv')
  }

  return children
}
