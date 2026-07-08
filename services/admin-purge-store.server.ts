import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

function isMissingRelation(msg: string): boolean {
  return /42P01|does not exist|relation/i.test(msg)
}

async function tryDelete(
  label: string,
  run: () => PromiseLike<{ error: { message: string; code?: string } | null }>,
  soft?: boolean
): Promise<void> {
  const { error } = await run()
  if (!error) return
  if (isMissingRelation(error.message)) return
  if (soft) {
    console.warn(`[admin-purge] ${label}:`, error.message)
    return
  }
  throw new Error(`${label}: ${error.message}`)
}

/**
 * Remove loja e dados ligados em `public` (pedidos, produtos, caixa, etc.).
 * Se o owner não tiver mais lojas, remove `usuarios` e a conta Auth.
 */
export async function adminPurgeStoreById(
  svc: SupabaseClient,
  storeId: string
): Promise<{ ownerId: string | null; nome: string; deletedAuthUser: boolean }> {
  const { data: store, error: sErr } = await svc
    .from('stores')
    .select('id, name, owner_id')
    .eq('id', storeId)
    .maybeSingle()

  if (sErr) throw new Error(sErr.message)
  if (!store) throw new Error('Loja não encontrada')

  const row = store as Record<string, unknown>
  const ownerId =
    typeof row.owner_id === 'string' && row.owner_id.trim() ? row.owner_id.trim() : null
  const nome = typeof row.name === 'string' ? row.name.trim() : 'Loja'

  const { data: orderRows } = await svc.from('orders').select('id').eq('store_id', storeId)
  const orderIds = (orderRows ?? []).map((o) => String((o as { id?: string }).id ?? '')).filter(Boolean)

  if (orderIds.length > 0) {
    await tryDelete('order_items', () => svc.from('order_items').delete().in('order_id', orderIds), true)
  }

  await tryDelete('entregas(store)', () => svc.from('entregas').delete().eq('store_id', storeId), true)
  if (orderIds.length > 0) {
    await tryDelete('entregas(orders)', () => svc.from('entregas').delete().in('order_id', orderIds), true)
  }

  await tryDelete('orders', () => svc.from('orders').delete().eq('store_id', storeId))

  const { data: turnos } = await svc.from('caixas_turnos').select('id').eq('store_id', storeId)
  const turnoIds = (turnos ?? []).map((t) => String((t as { id?: string }).id ?? '')).filter(Boolean)
  if (turnoIds.length > 0) {
    await tryDelete(
      'caixa_movimentacoes',
      () => svc.from('caixa_movimentacoes').delete().in('turno_id', turnoIds),
      true
    )
  }
  await tryDelete('caixas_turnos', () => svc.from('caixas_turnos').delete().eq('store_id', storeId), true)

  await tryDelete('store_entregadores', () => svc.from('store_entregadores').delete().eq('store_id', storeId), true)
  await tryDelete('store_garcons', () => svc.from('store_garcons').delete().eq('store_id', storeId), true)
  await tryDelete('faturas', () => svc.from('faturas').delete().eq('store_id', storeId), true)
  await tryDelete('store_promotions', () => svc.from('store_promotions').delete().eq('store_id', storeId), true)
  await tryDelete('store_tables', () => svc.from('store_tables').delete().eq('store_id', storeId), true)
  await tryDelete(
    'store_push_subscriptions',
    () => svc.from('store_push_subscriptions').delete().eq('store_id', storeId),
    true
  )
  await tryDelete(
    'store_product_stock',
    () => svc.from('store_product_stock').delete().eq('store_id', storeId),
    true
  )
  await tryDelete(
    'store_menu_import_usage',
    () => svc.from('store_menu_import_usage').delete().eq('store_id', storeId),
    true
  )
  await tryDelete(
    'store_marketing_ai_usage',
    () => svc.from('store_marketing_ai_usage').delete().eq('store_id', storeId),
    true
  )
  await tryDelete(
    'assinatura_cancelamentos',
    () => svc.from('assinatura_cancelamentos').delete().eq('store_id', storeId),
    true
  )
  await tryDelete(
    'whatsapp_automations',
    () => svc.from('whatsapp_automations').delete().eq('store_id', storeId),
    true
  )
  await tryDelete(
    'whatsapp_auto_reply_cooldowns',
    () => svc.from('whatsapp_auto_reply_cooldowns').delete().eq('store_id', storeId),
    true
  )

  const { data: prodRows } = await svc.from('products').select('id').eq('store_id', storeId)
  const productIds = (prodRows ?? []).map((p) => String((p as { id?: string }).id ?? '')).filter(Boolean)
  if (productIds.length > 0) {
    const { data: groupRows } = await svc.from('addon_groups').select('id').in('product_id', productIds)
    const groupIds = (groupRows ?? []).map((g) => String((g as { id?: string }).id ?? '')).filter(Boolean)
    if (groupIds.length > 0) {
      await tryDelete('addon_items', () => svc.from('addon_items').delete().in('group_id', groupIds), true)
    }
    await tryDelete('addon_groups', () => svc.from('addon_groups').delete().in('product_id', productIds), true)
  }

  await tryDelete('products', () => svc.from('products').delete().eq('store_id', storeId))

  await tryDelete(
    'admin_notifications',
    () => svc.from('admin_notifications').delete().eq('store_id', storeId),
    true
  )

  const { error: stErr } = await svc.from('stores').delete().eq('id', storeId)
  if (stErr) throw new Error(stErr.message)

  let deletedAuthUser = false
  if (ownerId) {
    const { count, error: cErr } = await svc
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
    if (!cErr && (count ?? 0) === 0) {
      await tryDelete('usuarios', () => svc.from('usuarios').delete().eq('id', ownerId), true)
      const { error: authDel } = await svc.auth.admin.deleteUser(ownerId)
      if (!authDel) deletedAuthUser = true
      else if (!/not found|User not found/i.test(authDel.message)) {
        console.warn('[admin-purge] auth.deleteUser:', authDel.message)
      }
    }
  }

  return { ownerId, nome, deletedAuthUser }
}
