import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { cancelarNfce } from '@/services/fiscal'

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  const invoiceId =
    typeof body.invoiceId === 'string' ? body.invoiceId.trim() : ''
  if (!orderId && !invoiceId) {
    return NextResponse.json(
      { error: 'Informe orderId ou invoiceId.' },
      { status: 400 }
    )
  }

  const justificativa =
    typeof body.justificativa === 'string' ? body.justificativa.trim() : ''
  if (!justificativa) {
    return NextResponse.json(
      { error: 'Justificativa é obrigatória (mínimo 15 caracteres).' },
      { status: 400 }
    )
  }

  const svc = createServiceRoleClient()
  const storeId = gate.ctx.storeId

  if (invoiceId) {
    const { data: inv } = await svc
      .from('fiscal_invoices')
      .select('store_id')
      .eq('id', invoiceId)
      .maybeSingle()
    if (!inv) {
      return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 })
    }
    if (String(inv.store_id) !== storeId) {
      return NextResponse.json({ error: 'Acesso negado à nota.' }, { status: 403 })
    }
  } else {
    const { data: order } = await svc
      .from('orders')
      .select('store_id')
      .eq('id', orderId)
      .maybeSingle()
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
    }
    if (String(order.store_id) !== storeId) {
      return NextResponse.json({ error: 'Acesso negado ao pedido.' }, { status: 403 })
    }
  }

  const result = await cancelarNfce(
    { orderId: orderId || undefined, invoiceId: invoiceId || undefined },
    { justificativa }
  )

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.motivo || 'Falha ao cancelar NFC-e.',
        status: result.status,
        invoiceId: result.invoiceId,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({
    ok: true,
    invoiceId: result.invoiceId,
    status: result.status,
    protocoloCancelamento: result.protocoloCancelamento,
    motivo: result.motivo,
  })
}
