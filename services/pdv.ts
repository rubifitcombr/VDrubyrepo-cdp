'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'

export type PdvPaymentMethod = 'cash' | 'pix' | 'card'

export type PdvCloseMode = 'cashier' | 'immediate'

export type PdvImmediatePaymentMethod = 'cash' | 'pix' | 'card'

export type PdvSaleLine = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
}

export async function submitPdvSale(params: {
  /** Mantido por compatibilidade; o servidor usa a loja da sessão. */
  storeId: string
  customerName: string | null
  items: PdvSaleLine[]
  discountBrl?: number
  internalNotes?: string | null
  closeMode?: PdvCloseMode
  /** Obrigatório quando `closeMode === 'immediate'`. */
  immediatePaymentMethod?: PdvImmediatePaymentMethod | null
}): Promise<
  | { ok: true; orderId: string; closedImmediately: boolean }
  | { ok: false; message: string }
> {
  const {
    items,
    customerName,
    discountBrl = 0,
    internalNotes,
    closeMode = 'cashier',
    immediatePaymentMethod,
  } = params

  if (!items.length) {
    return { ok: false, message: 'Adiciona pelo menos um produto.' }
  }

  if (closeMode === 'immediate' && !immediatePaymentMethod) {
    return { ok: false, message: 'Escolhe o método de pagamento para receber agora.' }
  }

  const res = await dashboardFetch('/api/pdv/sale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      closeMode,
      paymentMethod:
        closeMode === 'immediate' ? immediatePaymentMethod : undefined,
      customerName: customerName?.trim() || undefined,
      internalNotes: internalNotes?.trim() || undefined,
      discountBrl,
      items: items.map((l) => ({
        product_id: l.productId,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        name: l.name,
      })),
    }),
  })

  let body: { error?: unknown; ok?: unknown; orderId?: unknown; closedImmediately?: unknown }
  try {
    body = (await res.json()) as typeof body
  } catch {
    body = {}
  }

  if (!res.ok) {
    const err =
      typeof body.error === 'string' && body.error.trim()
        ? body.error.trim()
        : 'Não foi possível lançar o pedido.'
    return { ok: false, message: err }
  }

  const orderId = String(body.orderId ?? '').trim()
  if (!orderId) {
    return { ok: false, message: 'Resposta inválida do servidor.' }
  }

  return {
    ok: true,
    orderId,
    closedImmediately: Boolean(body.closedImmediately),
  }
}
