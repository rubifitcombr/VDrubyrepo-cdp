import { NextResponse } from 'next/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'

type BodyItem = {
  product_id: string
  quantity: number
  low_stock_alert?: number | null
}

export async function PUT(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const rawPlan = readStorePlano(gate.ctx.store)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  if (!hasFeature(plan, 'inventory')) {
    return NextResponse.json(
      { error: 'Recurso disponível apenas no plano Pro.' },
      { status: 403 }
    )
  }

  const storeId = gate.ctx.storeId
  let body: { items?: BodyItem[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const items = body.items
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: 'Lista de itens em falta.' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const productIds = items.map((i) => String(i.product_id ?? '')).filter(Boolean)
  const { data: prodOk, error: prodErr } = await supabase
    .from('products')
    .select('id')
    .eq('store_id', storeId)
    .in('id', productIds)

  if (prodErr) {
    console.error('[inventory] products check:', prodErr.message)
    return NextResponse.json(
      { error: 'Não foi possível validar os produtos.' },
      { status: 500 }
    )
  }

  const allowed = new Set((prodOk ?? []).map((p) => String(p.id)))
  const rows = items
    .filter((i) => allowed.has(String(i.product_id)))
    .map((i) => {
      const q = Math.max(0, Math.floor(Number(i.quantity) || 0))
      const low =
        i.low_stock_alert == null || Number.isNaN(Number(i.low_stock_alert))
          ? null
          : Math.max(0, Math.floor(Number(i.low_stock_alert)))
      return {
        store_id: storeId,
        product_id: i.product_id,
        quantity: q,
        low_stock_alert: low,
        updated_at: new Date().toISOString(),
      }
    })

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum produto válido para esta loja.' },
      { status: 400 }
    )
  }

  const { error: upErr } = await supabase
    .from('store_product_stock')
    .upsert(rows, { onConflict: 'store_id,product_id' })

  if (upErr) {
    if (
      upErr.message.includes('store_product_stock') ||
      upErr.message.includes('does not exist')
    ) {
      return NextResponse.json(
        {
          error:
            'Tabela de estoque em falta. Executa supabase/phase3.sql no Supabase.',
        },
        { status: 503 }
      )
    }
    console.error('[inventory] upsert:', upErr.message)
    return NextResponse.json(
      { error: upErr.message ?? 'Erro ao gravar estoque.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
