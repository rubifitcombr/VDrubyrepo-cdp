import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoreLoyaltyConfig } from '@/lib/loyalty/types'

export function normalizeLoyaltyConfigRow(row: Record<string, unknown>): StoreLoyaltyConfig {
  return {
    store_id: String(row.store_id),
    enabled: row.enabled === true,
    points_per_real: Number(row.points_per_real ?? 1),
    min_redeem_points: Number(row.min_redeem_points ?? 100),
    redeem_cents_per_point: Number(row.redeem_cents_per_point ?? 1),
    welcome_bonus_points: Number(row.welcome_bonus_points ?? 0),
    whatsapp_balance_enabled: row.whatsapp_balance_enabled !== false,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

export async function getOrCreateLoyaltyConfig(
  db: SupabaseClient,
  storeId: string
): Promise<StoreLoyaltyConfig> {
  const { data } = await db
    .from('store_loyalty_config')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()

  if (data) return normalizeLoyaltyConfigRow(data as Record<string, unknown>)

  const { data: inserted, error } = await db
    .from('store_loyalty_config')
    .insert({ store_id: storeId })
    .select('*')
    .single()

  if (error || !inserted) {
    throw new Error(error?.message || 'Falha ao criar configuração de fidelidade.')
  }
  return normalizeLoyaltyConfigRow(inserted as Record<string, unknown>)
}
