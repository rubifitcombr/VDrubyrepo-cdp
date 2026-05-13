import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { gerarCupomPedido } from '@/lib/escpos'
import {
  parseStoreThermalRow,
  sendThermalCupomForOrder,
} from '@/services/thermal-print.server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const storeId = gate.ctx.storeId

  let body: {
    order_id?: unknown
    store_id?: unknown
    test?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const bodyStoreId =
    typeof body.store_id === 'string' ? body.store_id.trim() : ''
  if (bodyStoreId && bodyStoreId !== storeId) {
    return NextResponse.json({ error: 'Loja inválida.' }, { status: 403 })
  }

  const { data: storeRow, error: stErr } = await supabase
    .from('stores')
    .select(
      'name, print_agent_url, print_agent_token, print_printer_ip, print_printer_port, print_auto_delivery, print_auto_autoatendimento, print_auto_pdv, print_auto_garcom'
    )
    .eq('id', storeId)
    .single()

  if (stErr || !storeRow) {
    return NextResponse.json(
      { error: stErr?.message || 'Loja não encontrada.' },
      { status: 404 }
    )
  }

  const store = parseStoreThermalRow(storeRow as Record<string, unknown>)
  if (!store.print_agent_url) {
    return NextResponse.json(
      { error: 'agente não configurado' },
      { status: 400 }
    )
  }

  if (body.test === true) {
    if (!store.print_printer_ip) {
      return NextResponse.json(
        { error: 'Indica o IP da impressora nas definições.' },
        { status: 400 }
      )
    }
    const now = new Date().toISOString()
    const escposData = gerarCupomPedido({
      id: '00000000-0000-0000-0000-000000000099',
      store_name: store.name || 'Vyria',
      customer_name: 'Cliente teste',
      total: 1.0,
      items: [{ name: 'Item de teste', quantity: 1, unit_price: 1.0 }],
      source: 'pdv',
      created_at: now,
      notes: 'Cupom de teste — impressao Wi-Fi.',
    })
    const base = store.print_agent_url.replace(/\/+$/, '')
    const token = store.print_agent_token?.trim() || 'vyria-agent-2026'
    try {
      const agentRes = await fetch(`${base}/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-token': token,
        },
        body: JSON.stringify({
          printerIp: store.print_printer_ip,
          printerPort: store.print_printer_port || 9100,
          data: escposData,
        }),
        signal: AbortSignal.timeout(8000),
      })
      const result = (await agentRes.json().catch(() => ({}))) as {
        error?: string
      }
      if (!agentRes.ok) {
        throw new Error(result.error || `HTTP ${agentRes.status}`)
      }
      return NextResponse.json({ ok: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: `Falha ao imprimir: ${msg}` },
        { status: 500 }
      )
    }
  }

  const orderId =
    typeof body.order_id === 'string' ? body.order_id.trim() : ''
  if (!orderId) {
    return NextResponse.json({ error: 'order_id em falta.' }, { status: 400 })
  }

  const printRes = await sendThermalCupomForOrder(
    supabase,
    storeId,
    orderId,
    store
  )
  if (!printRes.ok) {
    return NextResponse.json(
      { error: `Falha ao imprimir: ${printRes.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
