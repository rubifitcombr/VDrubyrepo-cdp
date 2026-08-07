import { readFileSync } from 'fs'
import path from 'path'
import type { APIRequestContext, APIResponse } from '@playwright/test'
import { isOpenCaixaComanda } from '../../lib/cashier-comanda-close'
import { effectiveProductPrice } from '../../lib/product-pricing'
import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
} from '../../lib/menu-product'
import { E2E_STORE_SLUG } from '../fixtures/store'
import { getSupabaseAdmin } from '../helpers/supabase-admin'
import { E2E_STORE_ID } from '../fixtures/store'
import type { E2eTestData } from '../fixtures/store'

export { getSupabaseAdmin, E2E_STORE_ID }

export function readE2eTestData(): E2eTestData {
  const raw = readFileSync(
    path.resolve(process.cwd(), 'e2e/.auth/test-data.json'),
    'utf8'
  )
  return JSON.parse(raw) as E2eTestData
}

export async function ensureOpenCaixaTurno(
  request: APIRequestContext,
  data: E2eTestData
): Promise<string> {
  const sb = getSupabaseAdmin()
  const { data: open } = await sb
    .from('caixas_turnos')
    .select('id')
    .eq('store_id', E2E_STORE_ID)
    .eq('status', 'aberto')
    .maybeSingle()

  if (open?.id) return String(open.id)

  if (data.hubPinBalcaoEnabled && data.hubPinBalcao) {
    await request.post('/api/hub/pin/verify', {
      data: { storeId: E2E_STORE_ID, pin: data.hubPinBalcao },
    })
  }

  const res = await request.post('/api/cashier/turno/open', {
    data: { fundoInicial: 0 },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Abrir turno falhou (${res.status()}): ${body}`)
  }
  const json = (await res.json()) as { turno?: { id?: string } }
  const id = json.turno?.id
  if (!id) throw new Error('Turno aberto sem id na resposta')
  return id
}

export async function dismissOpenComandasBlockingCaixaClose(storeId: string): Promise<void> {
  const sb = getSupabaseAdmin()
  const { data: rows } = await sb
    .from('orders')
    .select('id, status, source, notes, caixa_turno_id')
    .eq('store_id', storeId)
    .in('source', ['pdv', 'waiter', 'autoatendimento'])
    .neq('status', 'cancelled')

  const openIds = (rows ?? [])
    .filter((row) =>
      isOpenCaixaComanda(
        row as {
          status?: string
          source?: string
          notes?: string
          caixa_turno_id?: string
        }
      )
    )
    .map((row) => String(row.id))

  if (openIds.length === 0) return

  await sb
    .from('orders')
    .update({ status: 'cancelled' })
    .in('id', openIds)
    .eq('store_id', storeId)
}

export async function closeOpenCaixaTurnoIfAny(): Promise<void> {
  const sb = getSupabaseAdmin()
  const { data: open } = await sb
    .from('caixas_turnos')
    .select('id')
    .eq('store_id', E2E_STORE_ID)
    .eq('status', 'aberto')
    .maybeSingle()
  if (!open?.id) return
  await sb
    .from('caixas_turnos')
    .update({ status: 'fechado', fechado_em: new Date().toISOString() })
    .eq('id', open.id)
}

export function countOkResponses(responses: APIResponse[]): number {
  return responses.filter((r) => r.ok()).length
}

export function countStatus(responses: APIResponse[], status: number): number {
  return responses.filter((r) => r.status() === status).length
}

export async function pickActiveCheckoutProduct(): Promise<{
  productId: string
  name: string
  unitPrice: number
}> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('products')
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', E2E_STORE_ID)
    .eq('active', true)
    .order('name')
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`Produto activo para checkout E2E não encontrado: ${error?.message}`)
  }

  const row = normalizeMenuProductRow(data as Record<string, unknown>, E2E_STORE_ID)
  return {
    productId: row.id,
    name: row.name,
    unitPrice: effectiveProductPrice(row, 'delivery'),
  }
}

export async function setProductStockQuantity(
  productId: string,
  quantity: number
): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('store_product_stock').upsert(
    {
      store_id: E2E_STORE_ID,
      product_id: productId,
      quantity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'store_id,product_id' }
  )
  if (error) throw new Error(`Falha ao definir stock: ${error.message}`)
}

export async function clearProductStock(productId: string): Promise<void> {
  const sb = getSupabaseAdmin()
  await sb
    .from('store_product_stock')
    .delete()
    .eq('store_id', E2E_STORE_ID)
    .eq('product_id', productId)
}

export async function readProductStockQuantity(
  productId: string
): Promise<number | null> {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('store_product_stock')
    .select('quantity')
    .eq('store_id', E2E_STORE_ID)
    .eq('product_id', productId)
    .maybeSingle()
  return data ? Number(data.quantity) : null
}

export function buildPublicCheckoutBody(input: {
  productId: string
  name: string
  unitPrice: number
  quantity?: number
}) {
  return {
    slug: E2E_STORE_SLUG,
    customerName: 'E2E Stock Concurrency',
    customerPhone: '629994856542',
    paymentMethod: 'cash',
    fulfillment: 'pickup',
    items: [
      {
        productId: input.productId,
        name: input.name,
        quantity: input.quantity ?? 1,
        unitPrice: input.unitPrice,
      },
    ],
  }
}

export async function postPublicCheckout(
  request: APIRequestContext,
  body: Record<string, unknown>
): Promise<APIResponse> {
  return request.post('/api/public/checkout', {
    data: body,
  })
}

export async function withStoreOperationMode(
  storeId: string,
  mode: string | null,
  fn: () => Promise<void>
): Promise<void> {
  const sb = getSupabaseAdmin()
  const { data: before } = await sb
    .from('stores')
    .select('operation_mode')
    .eq('id', storeId)
    .single()

  const previous = (before as { operation_mode?: string | null } | null)?.operation_mode ?? null
  const { error: upErr } = await sb
    .from('stores')
    .update({ operation_mode: mode })
    .eq('id', storeId)
  if (upErr) throw new Error(`Falha ao alterar operation_mode: ${upErr.message}`)

  try {
    await fn()
  } finally {
    await sb
      .from('stores')
      .update({ operation_mode: previous })
      .eq('id', storeId)
  }
}
