import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export async function insertAdminLog(
  svc: SupabaseClient,
  params: {
    adminId: string
    lojistaId: string
    acao: string
    detalhes: string
    ip?: string | null
    userAgent?: string | null
  }
) {
  await svc.from('admin_logs').insert({
    admin_id: params.adminId,
    lojista_id: params.lojistaId,
    acao: params.acao,
    detalhes: params.detalhes,
    ip: params.ip ?? null,
    user_agent: params.userAgent ?? null,
  })
}

export function adminLogRequestMeta(req: Request): {
  ip: string | null
  userAgent: string | null
} {
  const fwd = req.headers.get('x-forwarded-for')
  const ip =
    (fwd ? fwd.split(',')[0]?.trim() : null) ||
    req.headers.get('x-real-ip')?.trim() ||
    null
  const userAgent = req.headers.get('user-agent')?.trim().slice(0, 512) || null
  return { ip, userAgent }
}

type AdminLogParams = {
  adminId: string
  lojistaId: string
  acao: string
  detalhes: string
  ip?: string | null
  userAgent?: string | null
}

/** Regista acção admin com IP e user-agent extraídos do pedido HTTP. */
export async function insertAdminLogFromRequest(
  svc: SupabaseClient,
  req: Request,
  params: Omit<AdminLogParams, 'ip' | 'userAgent'>
) {
  const meta = adminLogRequestMeta(req)
  await insertAdminLog(svc, {
    ...params,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
}
