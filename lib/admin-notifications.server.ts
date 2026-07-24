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

function mapAdminNotificationRow(raw: Record<string, unknown>): AdminNotificationRow {
  const tipo =
    String(raw.tipo ?? raw.titulo ?? '').trim() || 'info'
  const mensagem =
    String(raw.mensagem ?? raw.corpo ?? '').trim() ||
    String(raw.titulo ?? '').trim()

  return {
    id: String(raw.id ?? ''),
    tipo,
    mensagem,
    store_id:
      typeof raw.store_id === 'string' && raw.store_id ? raw.store_id : null,
    lida: raw.lida === true || raw.lida === 'true',
    criado_em:
      typeof raw.criado_em === 'string' ? raw.criado_em : new Date().toISOString(),
  }
}

export async function fetchAdminNotifications(
  svc: SupabaseClient,
  limit = 40
): Promise<AdminNotificationRow[]> {
  const modern = await svc
    .from('admin_notifications')
    .select('id, tipo, mensagem, store_id, lida, criado_em')
    .order('criado_em', { ascending: false })
    .limit(limit)

  if (!modern.error) {
    return (modern.data ?? []).map((raw) =>
      mapAdminNotificationRow(raw as Record<string, unknown>)
    )
  }

  if (
    String(modern.error.message || '').includes('relation') ||
    String(modern.error.code || '') === '42P01'
  ) {
    return []
  }

  const legacy = await svc
    .from('admin_notifications')
    .select('id, titulo, corpo, lida, criado_em')
    .order('criado_em', { ascending: false })
    .limit(limit)

  if (legacy.error) {
    if (
      String(legacy.error.message || '').includes('relation') ||
      String(legacy.error.code || '') === '42P01'
    ) {
      return []
    }
    throw new Error(legacy.error.message)
  }

  return (legacy.data ?? []).map((raw) =>
    mapAdminNotificationRow(raw as Record<string, unknown>)
  )
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
