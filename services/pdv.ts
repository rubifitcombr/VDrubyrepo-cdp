import { createClient } from '@/lib/supabase/client'

export type PdvPaymentMethod = 'cash' | 'pix' | 'card'

export type PdvSaleLine = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Mensagem legível quando o trigger de estoque (phase3b) bloqueia o insert. */
function friendlyStockError(raw: string | undefined): string {
  const m = raw?.trim() || ''
  if (/estoque insuficiente/i.test(m)) {
    const q = m.match(/Estoque insuficiente para "([^"]+)"/i)
    if (q?.[1]) {
      return `Stock insuficiente para «${q[1]}». Ajusta a quantidade ou o estoque.`
    }
    return 'Stock insuficiente para um dos produtos. Ajusta a quantidade ou o estoque.'
  }
  return m || 'Erro ao guardar os itens do pedido.'
}

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export async function submitPdvSale(params: {
  storeId: string
  customerName: string | null
  paymentMethod: PdvPaymentMethod
  items: PdvSaleLine[]
  /** Desconto em reais (não pode exceder o subtotal). */
  discountBrl?: number
  /** Notas internas para a equipa (gravadas em `orders.notes`). */
  internalNotes?: string | null
}): Promise<{ ok: true; orderId: string } | { ok: false; message: string }> {
  const {
    storeId,
    customerName,
    paymentMethod,
    items,
    discountBrl = 0,
    internalNotes,
  } = params
  if (!items.length) {
    return { ok: false, message: 'Adiciona pelo menos um produto.' }
  }

  const subtotal = round2(
    items.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  )
  const disc = round2(Math.min(Math.max(0, discountBrl), subtotal))
  const total = round2(subtotal - disc)

  const itemsSummary = items
    .map((l) => `${l.quantity}x ${l.name}`)
    .join(', ')

  const noteLines: string[] = []
  const internal = internalNotes?.trim()
  if (internal) {
    noteLines.push(`[Balcão — interno] ${internal}`)
  }
  if (disc > 0) {
    noteLines.push(`Desconto manual: ${brl.format(disc)} (subtotal ${brl.format(subtotal)})`)
  }
  const notes = noteLines.length ? noteLines.join('\n') : null

  const supabase = createClient()

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      store_id: storeId,
      customer_name: customerName?.trim() || null,
      total,
      status: 'pending',
      source: 'pdv',
      payment_method: paymentMethod,
      items_summary: itemsSummary,
      notes,
    })
    .select('id')
    .single()

  if (orderErr || !order?.id) {
    console.error('[pdv] order insert:', orderErr?.message)
    return {
      ok: false,
      message: orderErr?.message ?? 'Não foi possível criar o pedido.',
    }
  }

  const orderId = order.id as string

  const rows = items.map((l) => ({
    order_id: orderId,
    product_id: l.productId,
    quantity: l.quantity,
    price: l.unitPrice,
    unit_price: l.unitPrice,
    name: l.name,
  }))

  const { error: itemsErr } = await supabase.from('order_items').insert(rows)

  if (itemsErr) {
    console.error('[pdv] order_items insert:', itemsErr.message)
    await supabase.from('orders').delete().eq('id', orderId)
    return {
      ok: false,
      message: friendlyStockError(itemsErr.message),
    }
  }

  return { ok: true, orderId }
}
