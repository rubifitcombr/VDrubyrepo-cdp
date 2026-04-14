import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { currentYearMonthUtc } from '@/lib/menu-import-quota'
import type { MarketingAiKind } from '@/lib/marketing-ai-quota'

export async function getMarketingAiCounts(
  supabase: SupabaseClient,
  storeId: string,
  yearMonth: string = currentYearMonthUtc()
): Promise<{ description: number; image: number }> {
  const { data, error } = await supabase
    .from('store_marketing_ai_usage')
    .select('description_count, image_count')
    .eq('store_id', storeId)
    .eq('year_month', yearMonth)
    .maybeSingle()

  if (error) {
    if (
      error.message?.includes('store_marketing_ai_usage') ||
      error.code === '42P01'
    ) {
      return { description: 0, image: 0 }
    }
    console.error('[marketing-ai-usage]', error.message)
    return { description: 0, image: 0 }
  }

  const row = data as {
    description_count?: number
    image_count?: number
  } | null
  return {
    description:
      typeof row?.description_count === 'number' ? row.description_count : 0,
    image: typeof row?.image_count === 'number' ? row.image_count : 0,
  }
}

export async function incrementMarketingAiUsage(
  supabase: SupabaseClient,
  storeId: string,
  kind: MarketingAiKind,
  yearMonth: string = currentYearMonthUtc()
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('increment_store_marketing_ai_usage', {
    p_store_id: storeId,
    p_ym: yearMonth,
    p_kind: kind,
  })

  if (error) {
    if (
      error.message?.includes('increment_store_marketing_ai_usage') ||
      error.code === '42883'
    ) {
      return {
        ok: false,
        error:
          'Executa supabase/phase2.sql no Supabase para registar uso de IA.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
