import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { runAutomaticRecoveryForStore } from '@/services/recovery.server'

export async function runRecoveryDispatchJob(): Promise<{
  processed: number
  sent: number
  failed: number
  skipped: number
}> {
  const db = createServiceRoleClient()
  const publicUrl =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    'https://vyria.com.br'

  const { data: configs, error } = await db
    .from('store_recovery_config')
    .select('store_id, enabled, auto_send_enabled')
    .eq('enabled', true)
    .eq('auto_send_enabled', true)

  if (error) throw new Error(error.message)

  let processed = 0
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const row of configs || []) {
    const storeId = String((row as { store_id: string }).store_id)
    const { data: store } = await db
      .from('stores')
      .select('name, slug')
      .eq('id', storeId)
      .maybeSingle()

    if (!store) {
      skipped++
      continue
    }

    const result = await runAutomaticRecoveryForStore(db, storeId, {
      name: String((store as { name?: string }).name || 'sua loja'),
      slug: (store as { slug?: string | null }).slug ?? null,
      publicUrl,
    })

    processed++
    if (result.skipped) {
      skipped++
    } else {
      sent += result.sent ?? 0
      failed += result.failed ?? 0
    }
  }

  return { processed, sent, failed, skipped }
}
