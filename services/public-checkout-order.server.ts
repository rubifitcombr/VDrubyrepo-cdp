import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isMissingLoyaltyOrderColumnsError,
  supabaseLoyaltyOrderColumnsSchemaHint,
} from '@/lib/supabase-schema-error'
import { isSupabaseRlsViolation } from '@/lib/supabase-rls-error'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'

const LOYALTY_ORDER_FIELDS = ['loyalty_redeem_points', 'loyalty_discount_brl'] as const

function stripLoyaltyOrderFields(
  orderInsert: PublicCheckoutOrderInsert
): PublicCheckoutOrderInsert {
  const next = { ...orderInsert }
  for (const field of LOYALTY_ORDER_FIELDS) {
    delete next[field]
  }
  return next
}

function loyaltyValuesFromInsert(orderInsert: PublicCheckoutOrderInsert): {
  points: number
  discountBrl: number
} {
  return {
    points: Math.max(0, Math.floor(Number(orderInsert.loyalty_redeem_points) || 0)),
    discountBrl: Math.max(0, Number(orderInsert.loyalty_discount_brl) || 0),
  }
}

export type PublicCheckoutOrderInsert = Record<string, unknown>

export type PublicCheckoutOrderItemInsert = {
  product_id: string
  quantity: number
  price: number
  unit_price: number
  name: string
}

/**
 * Grava pedido + itens do checkout público.
 * Preferência: service role (validação já feita na API). Anon só em dev sem service key.
 */
export async function insertPublicCheckoutOrder(
  _anon: SupabaseClient,
  orderInsert: PublicCheckoutOrderInsert,
  itemRows: PublicCheckoutOrderItemInsert[]
): Promise<
  | { ok: true; orderId: string }
  | { ok: false; error: string; missingOrderItemsTable?: boolean; orderId?: string }
> {
  const attempt = async (
    client: SupabaseClient,
    payload: PublicCheckoutOrderInsert = orderInsert
  ) => {
    const { data: order, error: orderErr } = await client
      .from('orders')
      .insert(payload)
      .select('id')
      .single()

    if (orderErr || !order?.id) {
      if (orderErr && isMissingLoyaltyOrderColumnsError(orderErr)) {
        const loyalty = loyaltyValuesFromInsert(orderInsert)
        if (loyalty.points > 0 || loyalty.discountBrl > 0) {
          return {
            orderErr: new Error(supabaseLoyaltyOrderColumnsSchemaHint()),
            orderId: null as string | null,
            itemsErr: null as Error | null,
          }
        }
        return attempt(client, stripLoyaltyOrderFields(orderInsert))
      }
      return { orderErr, orderId: null as string | null, itemsErr: null as Error | null }
    }

    const orderId = String(order.id)
    const rows = itemRows.map((row) => ({ ...row, order_id: orderId }))
    const { error: itemsErr } = await client.from('order_items').insert(rows)

    if (itemsErr) {
      const missingTable =
        itemsErr.message?.includes('order_items') ||
        itemsErr.message?.includes('does not exist')
      if (missingTable) {
        return {
          orderErr: itemsErr,
          orderId,
          itemsErr,
          missingOrderItemsTable: true,
        }
      }
      await client.from('orders').delete().eq('id', orderId)
      return { orderErr: itemsErr, orderId: null, itemsErr, missingOrderItemsTable: false }
    }

    return { orderErr: null, orderId, itemsErr: null, missingOrderItemsTable: false }
  }

  const svc = tryCreateServiceRoleClient()
  let result = svc ? await attempt(svc) : null

  if (!result) {
    result = await attempt(_anon)
  } else if (result.orderErr && isSupabaseRlsViolation(result.orderErr.message)) {
    result = await attempt(_anon)
  }

  if (result.missingOrderItemsTable && result.orderId) {
    return {
      ok: false,
      error: result.orderErr?.message ?? '',
      missingOrderItemsTable: true,
      orderId: result.orderId,
    }
  }

  if (result.orderErr || !result.orderId) {
    const msg = result.orderErr?.message ?? ''
    if (msg.includes('order_items') || msg.includes('does not exist')) {
      return { ok: false, error: msg, missingOrderItemsTable: true }
    }
    if (isSupabaseRlsViolation(msg)) {
      return {
        ok: false,
        error:
          'Checkout temporariamente indisponível (permissões da base de dados). Contacta o suporte Vyria.',
      }
    }
    return { ok: false, error: msg || 'Não foi possível criar o pedido.' }
  }

  return { ok: true, orderId: result.orderId }
}
