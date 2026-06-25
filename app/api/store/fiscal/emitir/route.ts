import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { emitirNfce } from '@/services/fiscal'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId) {
    return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 })
  }

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  // O pedido precisa pertencer à loja do lojista autenticado.
  const svc = createServiceRoleClient()
  const { data: order } = await svc
    .from('orders')
    .select('store_id')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }
  if (String(order.store_id) !== gate.ctx.storeId) {
    return NextResponse.json({ error: 'Acesso negado ao pedido.' }, { status: 403 })
  }

  const result = await emitirNfce(orderId)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.motivo || 'Falha ao emitir NFC-e.', status: result.status },
      { status: 422 }
    )
  }
  return NextResponse.json({
    ok: true,
    invoiceId: result.invoiceId,
    status: result.status,
    chaveAcesso: result.chaveAcesso,
    protocolo: result.protocolo,
    nfeUrl: result.nfeUrl,
  })
}
