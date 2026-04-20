import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export async function insertAdminLog(
  svc: SupabaseClient,
  params: {
    adminId: string
    lojistaId: string
    acao: string
    detalhes: string
  }
) {
  await svc.from('admin_logs').insert({
    admin_id: params.adminId,
    lojista_id: params.lojistaId,
    acao: params.acao,
    detalhes: params.detalhes,
  })
}
