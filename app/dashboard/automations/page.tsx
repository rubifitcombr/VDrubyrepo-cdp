import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { AutomationsClient } from './_components/AutomationsClient'

export default async function AutomationsPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-vyria-navy/20 bg-white p-8 text-center">
        <p className="text-sm text-vyria-navy-muted">
          Cria primeiro a tua loja para configurar automações.
        </p>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const initial = parseAutomationsFromStore(row)
  const rawPlan = readStorePlano(row)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  const storeSlug = typeof row.slug === 'string' ? row.slug : ''
  const deliveryPipelineEnabled = isDeliveryPipelineEnabled(
    parseOperationModeFromStore(row)
  )

  const supabase = await createClient()
  const { data: whatsappRow } = await supabase
    .from('whatsapp_automations')
    .select('is_active, message_template')
    .eq('store_id', String(row.id))
    .maybeSingle()

  return (
    <AutomationsClient
      storeId={String(row.id)}
      storeSlug={storeSlug}
      storePlan={plan}
      initial={initial}
      initialWhatsappAutomation={{
        is_active: whatsappRow?.is_active ?? false,
        message_template:
          whatsappRow?.message_template || 'Olá 👋 faça seu pedido aqui: {link}',
      }}
      deliveryPipelineEnabled={deliveryPipelineEnabled}
    />
  )
}
