import { BalancaClient } from '@/app/dashboard/balanca/_components/BalancaClient'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parsePrintingFromStore } from '@/lib/store-printing'
import { readStorePlano } from '@/lib/store-columns'
import { parseScaleFromStore } from '@/lib/store-scale'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

export default async function BalancaPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-vyria-navy/20 bg-white p-8 text-center">
        <p className="text-sm text-vyria-navy-muted">
          Cria primeiro a tua loja para configurar a balança.
        </p>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const printing = parsePrintingFromStore(row)
  const scaleInitial = parseScaleFromStore(row)

  return (
    <BalancaClient
      storeId={String(row.id)}
      scaleInitial={scaleInitial}
      printAgentUrl={printing.print_agent_url}
      printAgentToken={printing.print_agent_token}
    />
  )
}
