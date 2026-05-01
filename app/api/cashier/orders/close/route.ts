import { NextResponse } from 'next/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { getOpenCaixaTurno } from '@/services/caixa-turnos.server'

type PaymentMethod = 'cash' | 'pix' | 'card' | 'credit'

function normalizePayment(v: unknown): PaymentMethod | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'cash' || t === 'pix' || t === 'card' || t === 'credit') return t
  if (t === 'credito' || t === 'crédito' || t === 'fiado') return 'credit'
  return null
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const rawPlan = readStorePlano(gate.ctx.store)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  if (!hasFeature(plan, 'cashier')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas no plano Pro.' },
      { status: 403 }
    )
  }

  let body: { orderId?: string; paymentMethod?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = String(body.orderId ?? '').trim()
  const paymentMethod = normalizePayment(body.paymentMethod)
  if (!orderId || !paymentMethod) {
    return NextResponse.json(
      { error: 'Dados de fechamento inválidos.' },
      { status: 400 }
    )
  }

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
    .select('id, source, status, notes, payment_method')
    .eq('store_id', storeId)
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  const src = String(order.source ?? '').trim().toLowerCase()
  if (src !== 'pdv' && src !== 'waiter') {
    return NextResponse.json(
      { error: 'Somente comandas de PDV/Garçom podem ser fechadas aqui.' },
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

  const noteBase = String(order.notes ?? '').trim()
  const closeLine = `[Caixa] Fechado em ${new Date().toISOString()} (${paymentMethod})`
  const notes = noteBase ? `${noteBase}\n${closeLine}` : closeLine

  const updatePayload: Record<string, unknown> = {
    status: 'delivered',
    payment_method: paymentMethod,
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
            'Coluna caixa_turno_id em orders em falta. Aplica a migração SQL do caixa no Supabase.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: msg || 'Não foi possível fechar a comanda.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: String(updated.id),
      status: String(updated.status ?? 'delivered'),
      payment_method: String(updated.payment_method ?? paymentMethod),
      notes: String(updated.notes ?? ''),
      caixa_turno_id: String((updated as { caixa_turno_id?: string }).caixa_turno_id ?? turnoAberto.id),
    },
  })
}

