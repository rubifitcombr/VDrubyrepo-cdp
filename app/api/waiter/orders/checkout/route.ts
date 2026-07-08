import { NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { denyStaffWaiterPanelWrites } from '@/lib/waiter-staff-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import {
  WAITER_PENDING_CAIXA_MARKER,
  notesIndicateWaiterReleasedToCaixa,
} from '@/lib/waiter-order-notes'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'
import { resolveGarcomForOrder } from '@/services/store-garcons.server'

type PaymentMethod = 'cash' | 'pix' | 'card'

function normalizePayment(v: unknown): PaymentMethod | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'cash' || t === 'pix' || t === 'card') return t
  return null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
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

  let body: { orderId?: unknown; mode?: unknown; paymentMethod?: unknown; service_fee_brl?: unknown; garcom_id?: unknown }
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
    .select('id, source, status, notes, payment_method')
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
    const pref = normalizePayment(body.paymentMethod)
    const paymentPref = pref ?? normalizePayment(order.payment_method) ?? 'cash'

    const line = `${WAITER_PENDING_CAIXA_MARKER} (${new Date().toISOString()})`
    const notes = noteBase ? `${noteBase}\n${line}` : line

    const { error: upErr } = await supabase
      .from('orders')
      .update({
        notes,
        payment_method: paymentPref,
      })
      .eq('store_id', storeId)
      .eq('id', orderId)

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

  const paymentMethod = normalizePayment(body.paymentMethod)
  if (!paymentMethod) {
    return NextResponse.json(
      { error: 'Indica o método de pagamento para receber agora.' },
      { status: 400 }
    )
  }

  const turnoAberto = await getOpenCaixaTurno(supabase, storeId)
  if (!turnoAberto) {
    return NextResponse.json(
      { error: 'Abre um turno de caixa para receber pagamentos.' },
      { status: 400 }
    )
  }

  const closeLine = `[Garçom] Recebido em ${new Date().toISOString()} (${paymentMethod})`
  const notes = noteBase ? `${noteBase}\n${closeLine}` : closeLine

  const serviceFee = round2(Math.max(0, Number(body.service_fee_brl) || 0))
  const garcom = await resolveGarcomForOrder(
    supabase,
    storeId,
    typeof body.garcom_id === 'string' ? body.garcom_id : null
  )

  const updatePayload: Record<string, unknown> = {
    status: 'delivered',
    payment_method: paymentMethod,
    notes,
    caixa_turno_id: turnoAberto.id,
    service_fee_brl: serviceFee,
  }
  if (garcom.garcom_id) {
    updatePayload.garcom_id = garcom.garcom_id
    updatePayload.garcom_nome = garcom.garcom_nome
  }

  const { error: upErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('store_id', storeId)
    .eq('id', orderId)

  if (upErr) {
    const msg = upErr.message ?? ''
    if (/caixa_turno_id|column/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Coluna caixa_turno_id em orders em falta. Aplica a migração SQL do caixa no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: msg || 'Não foi possível registar o pagamento.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    mode: 'immediate',
    orderId,
  })
}
