import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { currentYearMonthUtc } from '@/lib/menu-import-quota'

/** Contagem atual no mês (0 se tabela ainda não existir). */
export async function getMenuImportCountForMonth(
  supabase: SupabaseClient,
  storeId: string,
  yearMonth: string = currentYearMonthUtc()
): Promise<number> {
  const { data, error } = await supabase
    .from('store_menu_import_usage')
    .select('count')
    .eq('store_id', storeId)
    .eq('year_month', yearMonth)
    .maybeSingle()

  if (error) {
    if (
      error.message?.includes('store_menu_import_usage') ||
      error.code === '42P01'
    ) {
      console.warn(
        '[menu-import-usage] Tabela em falta. Executa supabase/phase1.sql'
      )
      return 0
    }
    console.error('[menu-import-usage]', error.message)
    return 0
  }

  const n = data?.count
  return typeof n === 'number' ? n : 0
}

/** Incrementa após import bem-sucedido; devolve o novo total do mês. */
export async function incrementMenuImportUsage(
  supabase: SupabaseClient,
  storeId: string,
  yearMonth: string = currentYearMonthUtc()
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('increment_store_menu_import_usage', {
    p_store_id: storeId,
    p_ym: yearMonth,
  })

  if (error) {
    if (
      error.message?.includes('increment_store_menu_import_usage') ||
      error.message?.includes('function') ||
      error.code === '42883'
    ) {
      return {
        ok: false,
        error:
          'Quota de importação: executa o script SQL em supabase/phase1.sql no Supabase.',
      }
    }
    if (
      error.message?.includes('store_menu_import_usage') ||
      error.code === '42P01'
    ) {
      return {
        ok: false,
        error:
          'Tabela de quota em falta. Executa supabase/phase1.sql no painel Supabase.',
      }
    }
    return { ok: false, error: error.message }
  }

  const count = typeof data === 'number' ? data : Number(data)
  if (!Number.isFinite(count)) {
    return { ok: false, error: 'Resposta inválida ao registar importação.' }
  }
  return { ok: true, count }
}
