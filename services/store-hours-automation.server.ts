import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  hasConfiguredBusinessHours,
  isOpenFromWeeklyHours,
  parseWeeklyHours,
} from '@/lib/business-hours'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { readStorePlano } from '@/lib/store-columns'
import { hasOrderPipelineAutomations, parsePlan } from '@/lib/plan'

/**
 * Com «Fechar loja automaticamente» ativo (Pro), alinha `manual_closed` ao horário:
 * fora do período → fechado; dentro → aberto (cardápio disponível conforme horário).
 */
export async function syncAutoCloseOutsideHoursForStore(
  store: Record<string, unknown>,
  db: SupabaseClient
): Promise<boolean | null> {
  const plan = parsePlan(readStorePlano(store))
  if (!hasOrderPipelineAutomations(plan)) return null

  if (!parseAutomationsFromStore(store).auto_close_outside_hours) return null

  const bh = store.business_hours
  if (!hasConfiguredBusinessHours(bh)) return null

  const weekly = parseWeeklyHours(bh)
  const scheduledOpen = isOpenFromWeeklyHours(weekly)
  const targetManualClosed = !scheduledOpen

  const current = store.manual_closed === true
  const storeId = typeof store.id === 'string' ? store.id : ''
  if (!storeId) return null

  if (current === targetManualClosed) {
    return targetManualClosed
  }

  const { error } = await db
    .from('stores')
    .update({ manual_closed: targetManualClosed })
    .eq('id', storeId)

  if (error) {
    console.error('[syncAutoCloseOutsideHours]', error.message)
    return current
  }

  return targetManualClosed
}
