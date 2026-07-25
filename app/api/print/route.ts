import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
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

  const denyPrint = gateMerchantMenuKey(gate.ctx.store, user.email, 'impressao')
  if (denyPrint) return denyPrint

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
      'name, print_agent_url, print_agent_token, print_printer_ip, print_printer_port, print_paper_mm, print_include_customer_details, print_delivery_copy, print_auto_delivery, print_auto_autoatendimento, print_auto_pdv, print_auto_garcom'
    )
    .eq('id', storeId)
    .single()

  if (stErr || !storeRow) {
    const msg = stErr?.message || 'Loja não encontrada.'
    const missingSchema =
      /print_|column|schema cache|does not exist/i.test(msg)
    return NextResponse.json(
      {
        error: missingSchema
          ? 'Schema de impressão em falta. Aplica supabase/migrations/20260725190014_impressao_schema.sql no Supabase.'
          : msg,
      },
      { status: missingSchema ? 500 : 404 }
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
      paper_mm: store.print_paper_mm,
      variant: 'balcao',
      printing: {
        print_include_customer_details: store.print_include_customer_details,
        print_delivery_copy: store.print_delivery_copy,
        print_paper_mm: store.print_paper_mm,
      },
    })
    const base = store.print_agent_url.replace(/\/+$/, '')
    const token = store.print_agent_token?.trim()
    if (!token) {
      return NextResponse.json(
        { error: 'Token do agente não configurado.' },
        { status: 400 }
      )
    }
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
        code?: string
        detail?: string
      }
      if (!agentRes.ok) {
        return NextResponse.json(
          {
            error: result.error || `Falha ao imprimir teste (HTTP ${agentRes.status}).`,
            code: result.code,
            detail: result.detail,
          },
          { status: agentRes.status }
        )
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
      {
        error: `Falha ao imprimir: ${printRes.message}`,
        code: printRes.code,
        detail: printRes.detail,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
