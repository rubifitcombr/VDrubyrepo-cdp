import { NextResponse } from 'next/server'
import {
  caixaProDeliveryOnlyScope,
  isPdvWaiterComandaSource,
} from '@/lib/cashier-pro-delivery-scope'
import { orderPaymentRegisteredInCaixa } from '@/lib/cashier-comanda-close'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import {
  parseOrderPaymentLines,
  validatePaymentLines,
  type OrderPaymentLine,
} from '@/lib/order-payments'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { tryAutoEmitNfceForOrder } from '@/services/fiscal'
import { insertOrderPayments } from '@/services/order-payments.server'

type PaymentMethod = 'cash' | 'pix' | 'card' | 'card_credit' | 'card_debit' | 'split'

function normalizePayment(v: unknown): PaymentMethod | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (
    t === 'cash' ||
    t === 'pix' ||
    t === 'card' ||
    t === 'card_credit' ||
    t === 'card_debit' ||
    t === 'split'
  ) {
    return t
  }
  return null
}

function resolvePaymentLines(body: {
  paymentMethod?: unknown
  payments?: unknown
}): { lines: OrderPaymentLine[]; storedMethod: PaymentMethod } | { error: string } {
  const parsed = parseOrderPaymentLines(body.payments)
  if (parsed) {
    if (parsed.length === 1) {
      return { lines: parsed, storedMethod: parsed[0]!.method }
    }
    return { lines: parsed, storedMethod: 'split' }
  }

  const paymentMethod = normalizePayment(body.paymentMethod)
  if (!paymentMethod || paymentMethod === 'split') {
    return { error: 'Dados de fechamento inválidos.' }
  }
  return { lines: [], storedMethod: paymentMethod }
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'caixa')
  if (deny) return deny

  let body: { orderId?: string; paymentMethod?: string; payments?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = String(body.orderId ?? '').trim()
  const resolved = resolvePaymentLines(body)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }
  if (!orderId) {
    return NextResponse.json(
      { error: 'Dados de fechamento inválidos.' },
      { status: 400 }
    )
  }

  const { lines, storedMethod } = resolved
  const isSplit = storedMethod === 'split'

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const turnoAberto = await getOpenCaixaTurno(supabase, storeId)
  if (!turnoAberto) {
    return NextResponse.json(
      { error: 'Abra um turno para receber pagamentos.' },
      { status: 400 }
    )
  }

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, source, status, notes, payment_method, total')
    .eq('store_id', storeId)
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  const orderTotal = Number(order.total) || 0
  if (isSplit) {
    const validationError = validatePaymentLines(orderTotal, lines)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
  }

  const src = String(order.source ?? '').trim().toLowerCase()

  const plan = effectiveDashboardPlan(user.email ?? null, readStorePlano(gate.ctx.store))
  const operationMode = parseOperationModeFromStore(gate.ctx.store)
  if (caixaProDeliveryOnlyScope(plan, operationMode) && isPdvWaiterComandaSource(src)) {
    return NextResponse.json(
      {
        error:
          'No plano Pro em modo delivery o caixa não recebe comandas de balcão ou garçom. Usa Pedidos e entregadores.',
      },
      { status: 403 }
    )
  }

  if (src !== 'pdv' && src !== 'waiter' && src !== 'autoatendimento') {
    return NextResponse.json(
      { error: 'Somente comandas de PDV/Garçom/QR podem ser fechadas aqui.' },
      { status: 409 }
    )
  }

  const status = String(order.status ?? '').trim().toLowerCase()
  if (status === 'cancelled') {
    return NextResponse.json(
      { error: 'Comanda já encerrada.' },
      { status: 409 }
    )
  }
  if (orderPaymentRegisteredInCaixa(order.notes as string | null)) {
    return NextResponse.json(
      { error: 'Pagamento já registado para esta comanda.' },
      { status: 409 }
    )
  }

  const noteBase = String(order.notes ?? '').trim()
  const paymentNote = isSplit
    ? lines.map((l) => `${l.method}:${l.amount.toFixed(2)}`).join(', ')
    : storedMethod
  const closeLine = `[Caixa] Fechado em ${new Date().toISOString()} (${paymentNote})`
  const notes = noteBase ? `${noteBase}\n${closeLine}` : closeLine

  const updatePayload: Record<string, unknown> = {
    status: 'delivered',
    payment_method: storedMethod,
    notes,
    caixa_turno_id: turnoAberto.id,
  }

  const { data: updated, error: upErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('store_id', storeId)
    .eq('id', orderId)
    .select('id, status, payment_method, notes, caixa_turno_id')
    .single()

  if (upErr || !updated) {
    const msg = upErr?.message ?? ''
    if (/caixa_turno_id|column/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Coluna caixa_turno_id em orders em falta. Aplica supabase/migrations/20260725190007_caixa_schema.sql no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: msg || 'Não foi possível fechar a comanda.' },
      { status: 500 }
    )
  }

  if (isSplit) {
    const payResult = await insertOrderPayments(supabase, {
      storeId,
      orderId,
      turnoId: turnoAberto.id,
      lines,
    })
    if (!payResult.ok) {
      await supabase
        .from('orders')
        .update({
          status: order.status,
          payment_method: order.payment_method,
          notes: order.notes,
          caixa_turno_id: null,
        })
        .eq('store_id', storeId)
        .eq('id', orderId)
      return NextResponse.json({ error: payResult.error }, { status: 500 })
    }
  }

  const fiscal = await tryAutoEmitNfceForOrder(orderId)

  return NextResponse.json({
    ok: true,
    order: {
      id: String(updated.id),
      status: String(updated.status ?? 'delivered'),
      payment_method: String(updated.payment_method ?? storedMethod),
      notes: String(updated.notes ?? ''),
      caixa_turno_id: String(
        (updated as { caixa_turno_id?: string }).caixa_turno_id ?? turnoAberto.id
      ),
    },
    payments: isSplit
      ? lines.map((l) => ({ method: l.method, amount: l.amount }))
      : undefined,
    fiscal,
  })
}
