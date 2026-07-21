'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import type { OrderPaymentLine } from '@/lib/order-payments'

export type PdvPaymentMethod = 'cash' | 'pix' | 'card' | 'card_credit' | 'card_debit'

export type PdvCloseMode = 'cashier' | 'immediate'

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
  payments?: OrderPaymentLine[]
  /** CPF opcional na NFC-e (só emissão imediata). */
  cpf?: string | null
}): Promise<
  | {
      ok: true
      orderId: string
      closedImmediately: boolean
      fiscal?: {
        attempted: boolean
        skipped: boolean
        ok: boolean
        status?: string
        chaveAcesso?: string
        motivo?: string
      }
    }
  | { ok: false; message: string }
> {
  const {
    items,
    customerName,
    discountBrl = 0,
    internalNotes,
    closeMode = 'cashier',
    payments,
    cpf,
  } = params

  if (!items.length) {
    return { ok: false, message: 'Adiciona pelo menos um produto.' }
  }

  if (closeMode === 'immediate' && (!payments || payments.length === 0)) {
    return { ok: false, message: 'Lance ao menos um pagamento para receber agora.' }
  }

  const cpfDigits = String(cpf ?? '').replace(/\D/g, '')
  if (cpfDigits && cpfDigits.length !== 11) {
    return { ok: false, message: 'CPF inválido: use 11 dígitos ou deixe em branco.' }
  }

  const res = await dashboardFetch('/api/pdv/sale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      closeMode,
      payments: closeMode === 'immediate' ? payments : undefined,
      customerName: customerName?.trim() || undefined,
      internalNotes: internalNotes?.trim() || undefined,
      discountBrl,
      cpf: closeMode === 'immediate' && cpfDigits ? cpfDigits : undefined,
      items: items.map((l) => ({
        product_id: l.productId,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        name: l.name,
      })),
    }),
  })

  let body: {
    error?: unknown
    ok?: unknown
    orderId?: unknown
    closedImmediately?: unknown
    fiscal?: {
      attempted?: unknown
      skipped?: unknown
      ok?: unknown
      status?: unknown
      chaveAcesso?: unknown
      motivo?: unknown
    }
  }
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

  const fiscalRaw = body.fiscal
  const fiscal =
    fiscalRaw && typeof fiscalRaw === 'object'
      ? {
          attempted: Boolean(fiscalRaw.attempted),
          skipped: Boolean(fiscalRaw.skipped),
          ok: Boolean(fiscalRaw.ok),
          status:
            typeof fiscalRaw.status === 'string' ? fiscalRaw.status : undefined,
          chaveAcesso:
            typeof fiscalRaw.chaveAcesso === 'string'
              ? fiscalRaw.chaveAcesso
              : undefined,
          motivo:
            typeof fiscalRaw.motivo === 'string' ? fiscalRaw.motivo : undefined,
        }
      : undefined

  return {
    ok: true,
    orderId,
    closedImmediately: Boolean(body.closedImmediately),
    ...(fiscal ? { fiscal } : {}),
  }
}
