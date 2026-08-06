import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { denyStaffWaiterPanelWrites } from '@/lib/waiter-staff-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import {
  GARCOM_PAYMENT_CLOSE_MARKER,
  WAITER_PENDING_CAIXA_MARKER,
  notesIndicateWaiterReleasedToCaixa,
} from '@/lib/waiter-order-notes'
import {
  parseOrderPaymentLines,
  validatePaymentLines,
  type OrderPaymentLine,
} from '@/lib/order-payments'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { resolveGarcomForWaiterOrder } from '@/services/store-garcons.server'
import { insertOrderPayments } from '@/services/order-payments.server'
import { triggerLoyaltyEarnForDeliveredOrder } from '@/services/loyalty.server'

type PaymentMethod = 'cash' | 'pix' | 'card' | 'split'

function normalizePayment(v: unknown): PaymentMethod | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'cash' || t === 'pix' || t === 'card') return t
  return null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function resolveImmediatePayment(body: {
  paymentMethod?: unknown
  payments?: unknown
}):
  | { lines: OrderPaymentLine[]; storedMethod: PaymentMethod; isSplit: boolean }
  | { error: string } {
  const parsed = parseOrderPaymentLines(body.payments)
  if (parsed) {
    if (parsed.length === 1) {
      const method = parsed[0]!.method
      if (method === 'card_credit' || method === 'card_debit') {
        return { lines: parsed, storedMethod: 'card', isSplit: false }
      }
      if (method === 'cash' || method === 'pix' || method === 'card') {
        return { lines: parsed, storedMethod: method, isSplit: false }
      }
      return { lines: parsed, storedMethod: 'card', isSplit: false }
    }
    return { lines: parsed, storedMethod: 'split', isSplit: true }
  }

  const paymentMethod = normalizePayment(body.paymentMethod)
  if (!paymentMethod) {
    return { error: 'Indica o método de pagamento para receber agora.' }
  }
  return { lines: [], storedMethod: paymentMethod, isSplit: false }
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const denyGarcom = gateMerchantMenuKey(gate.ctx.store, user.email, 'garcom')
  if (denyGarcom) return denyGarcom

  const denyStaff = denyStaffWaiterPanelWrites(gate.ctx.store, user.email)
  if (denyStaff) return denyStaff

  let body: {
    orderId?: unknown
    mode?: unknown
    paymentMethod?: unknown
    payments?: unknown
    service_fee_brl?: unknown
    garcom_id?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = String(body.orderId ?? '').trim()
  const mode = body.mode === 'immediate' ? 'immediate' : 'cashier'
  if (!orderId) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const storeId = gate.ctx.storeId

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, source, status, notes, payment_method, total')
    .eq('store_id', storeId)
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  const src = String(order.source ?? '').trim().toLowerCase()
  if (src !== 'waiter' && src !== 'autoatendimento') {
    return NextResponse.json(
      { error: 'Apenas comandas do salão (garçom ou QR) podem ser fechadas aqui.' },
      { status: 409 }
    )
  }

  const status = String(order.status ?? '').trim().toLowerCase()
  if (status === 'cancelled' || status === 'delivered') {
    return NextResponse.json(
      { error: 'Comanda já encerrada.' },
      { status: 409 }
    )
  }

  if (notesIndicateWaiterReleasedToCaixa(order.notes as string | null)) {
    return NextResponse.json(
      { error: 'Esta comanda já foi encaminhada ao Caixa.' },
      { status: 409 }
    )
  }

  const noteBase = String(order.notes ?? '').trim()

  if (mode === 'cashier') {
    const line = `${WAITER_PENDING_CAIXA_MARKER} (${new Date().toISOString()})`
    const notes = noteBase ? `${noteBase}\n${line}` : line

    const { data: updated, error: upErr } = await supabase
      .from('orders')
      .update({ notes })
      .eq('store_id', storeId)
      .eq('id', orderId)
      .neq('status', 'cancelled')
      .neq('status', 'delivered')
      .not('notes', 'ilike', `%${WAITER_PENDING_CAIXA_MARKER}%`)
      .not('notes', 'ilike', `%${GARCOM_PAYMENT_CLOSE_MARKER}%`)
      .select('id')
      .maybeSingle()

    if (!upErr && !updated) {
      return NextResponse.json(
        { error: 'Esta comanda já foi encaminhada ao Caixa.' },
        { status: 409 }
      )
    }

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message || 'Não foi possível encaminhar ao Caixa.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      mode: 'cashier',
      orderId,
    })
  }

  const denyCaixa = gateMerchantMenuKey(gate.ctx.store, user.email, 'caixa')
  if (denyCaixa) {
    return NextResponse.json(
      {
        error:
          'Receber no salão exige permissão de Caixa. Encaminha ao Caixa ou inicia sessão com acesso ao Caixa.',
      },
      { status: 403 }
    )
  }

  const resolved = resolveImmediatePayment(body)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }

  const { lines, storedMethod, isSplit } = resolved
  const orderTotal = Number(order.total) || 0
  if (lines.length > 0) {
    const validationError = validatePaymentLines(orderTotal, lines)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
  }

  const turnoAberto = await getOpenCaixaTurno(supabase, storeId)
  if (!turnoAberto) {
    return NextResponse.json(
      { error: 'Abre um turno de caixa para receber pagamentos.' },
      { status: 400 }
    )
  }

  const paymentNote = isSplit
    ? lines.map((l) => `${l.method}:${l.amount.toFixed(2)}`).join(', ')
    : storedMethod
  const closeLine = `${GARCOM_PAYMENT_CLOSE_MARKER}${new Date().toISOString()} (${paymentNote})`
  const notes = noteBase ? `${noteBase}\n${closeLine}` : closeLine

  const serviceFee = round2(Math.max(0, Number(body.service_fee_brl) || 0))
  const garcom = await resolveGarcomForWaiterOrder(
    supabase,
    storeId,
    typeof body.garcom_id === 'string' ? body.garcom_id : null
  )
  if ('error' in garcom) {
    return NextResponse.json({ error: garcom.error }, { status: garcom.status })
  }

  const updatePayload: Record<string, unknown> = {
    status: 'delivered',
    payment_method: storedMethod,
    notes,
    caixa_turno_id: turnoAberto.id,
    service_fee_brl: serviceFee,
  }
  if (garcom.garcom_id) {
    updatePayload.garcom_id = garcom.garcom_id
    updatePayload.garcom_nome = garcom.garcom_nome
  }

  const { data: updated, error: upErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('store_id', storeId)
    .eq('id', orderId)
    .neq('status', 'cancelled')
    .neq('status', 'delivered')
    .not('notes', 'ilike', `%${GARCOM_PAYMENT_CLOSE_MARKER}%`)
    .select('id, status, payment_method, notes, caixa_turno_id')
    .maybeSingle()

  if (!upErr && !updated) {
    return NextResponse.json({
      ok: true,
      mode: 'immediate',
      orderId,
      alreadyPaid: true,
      payments:
        lines.length > 0
          ? lines.map((l) => ({ method: l.method, amount: l.amount }))
          : undefined,
    })
  }

  if (upErr || !updated) {
    const msg = upErr?.message ?? ''
    if (/caixa_turno_id|column/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Coluna caixa_turno_id em orders em falta. Aplica supabase/migrations/20260725190005_pdv_schema.sql no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: msg || 'Não foi possível registar o pagamento.' },
      { status: 500 }
    )
  }

  if (lines.length > 0) {
    const { count: existingPayCount } = await supabase
      .from('order_payments')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('order_id', orderId)

    if ((existingPayCount ?? 0) === 0) {
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
  }

  void triggerLoyaltyEarnForDeliveredOrder(supabase, storeId, orderId).catch((e) =>
    console.warn('[loyalty earn]', e)
  )

  return NextResponse.json({
    ok: true,
    mode: 'immediate',
    orderId,
    payments:
      lines.length > 0
        ? lines.map((l) => ({ method: l.method, amount: l.amount }))
        : undefined,
  })
}
