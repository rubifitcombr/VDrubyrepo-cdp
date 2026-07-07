import { ContratoAnualClient } from '@/app/dashboard/contrato/_components/ContratoAnualClient'
import {
  contractAcceptanceFromStore,
  requiresAnnualContractAcceptance,
} from '@/lib/annual-contract-acceptance'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { readStorePlano } from '@/lib/store-columns'
import { getVyriaLegalEntity } from '@/lib/vyria-legal-entity'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ContratoAnualPage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/dashboard/contrato')

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object') redirect('/acesso-suspenso?error=pendente')

  const row = store as Record<string, unknown>
  if (!requiresAnnualContractAcceptance(row)) {
    redirect('/dashboard')
  }

  const storeName =
    typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Minha loja'
  const plan = effectiveDashboardPlan(user.email ?? null, readStorePlano(row))
  const operationMode = parseOperationModeFromStore(row)
  const vyria = getVyriaLegalEntity()
  const { document } = contractAcceptanceFromStore(
    row,
    storeName,
    plan,
    operationMode,
    vyria
  )

  return <ContratoAnualClient document={document} storeName={storeName} userEmail={user.email ?? ''} />
}
