import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type AdminNotificationRow = {
  id: string
  tipo: string
  mensagem: string
  store_id: string | null
  lida: boolean
  criado_em: string
}

export async function fetchAdminNotifications(
  svc: SupabaseClient,
  limit = 40
): Promise<AdminNotificationRow[]> {
  const { data, error } = await svc
    .from('admin_notifications')
    .select('id, tipo, mensagem, store_id, lida, criado_em')
    .order('criado_em', { ascending: false })
    .limit(limit)

  if (error) {
    if (
      String(error.message || '').includes('relation') ||
      String(error.code || '') === '42P01'
    ) {
      return []
    }
    throw new Error(error.message)
  }

  const out: AdminNotificationRow[] = []
  for (const raw of data ?? []) {
    const r = raw as Record<string, unknown>
    out.push({
      id: String(r.id ?? ''),
      tipo: String(r.tipo ?? ''),
      mensagem: String(r.mensagem ?? ''),
      store_id:
        typeof r.store_id === 'string' && r.store_id ? r.store_id : null,
      lida: r.lida === true || r.lida === 'true',
      criado_em:
        typeof r.criado_em === 'string' ? r.criado_em : new Date().toISOString(),
    })
  }
  return out
}

export async function markAdminNotificationsRead(
  svc: SupabaseClient,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await svc
    .from('admin_notifications')
    .update({ lida: true })
    .in('id', ids)
  if (error) throw new Error(error.message)
}

export async function markAllAdminNotificationsRead(
  svc: SupabaseClient
): Promise<void> {
  const { error } = await svc
    .from('admin_notifications')
    .update({ lida: true })
    .eq('lida', false)
  if (error) throw new Error(error.message)
}
