import { NextRequest, NextResponse } from 'next/server'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'

/**
 * Lista adicionais de um produto (cardápio público).
 * RLS: addon_* + products activos em loja activa.
 */
export async function GET(req: NextRequest) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(ip, 'product-addons', 80, 60_000)
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      rl.guard?.message,
      rl.guard?.status === 403 ? 403 : 429
    )
  }

  const productId = req.nextUrl.searchParams.get('productId')?.trim()
  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
    return NextResponse.json({ error: 'productId inválido.' }, { status: 400 })
  }

  const supabase = createPublicAnonClient()
  const { data: groups, error: gErr } = await supabase
    .from('addon_groups')
    .select('id, name, required, min_select, max_select, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })

  if (gErr) {
    return NextResponse.json({ groups: [] })
  }
  if (!groups?.length) {
    return NextResponse.json({ groups: [] })
  }

  const groupIds = groups.map((g: { id: string }) => g.id)
  const { data: items, error: iErr } = await supabase
    .from('addon_items')
    .select('group_id, name, price, sort_order')
    .in('group_id', groupIds)
    .order('sort_order', { ascending: true })

  if (iErr) {
    return NextResponse.json({ groups: [] })
  }

  const byGroup = new Map<string, { name: string; price: number }[]>()
  for (const row of items ?? []) {
    const r = row as {
      group_id: string
      name: string
      price: number | string
    }
    if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, [])
    byGroup.get(r.group_id)!.push({
      name: r.name,
      price: Number(r.price) || 0,
    })
  }

  const out = (
    groups as {
      id: string
      name: string
      required: boolean
      min_select?: number | null
      max_select?: number | null
    }[]
  )
    .map((g) => {
      const minSelect = Number(g.min_select)
      const maxSelect = Number(g.max_select)
      return {
        name: g.name,
        required: !!g.required,
        minSelect: Number.isFinite(minSelect) && minSelect >= 0 ? minSelect : 0,
        maxSelect:
          Number.isFinite(maxSelect) && maxSelect >= 1 ? maxSelect : 1,
        items: byGroup.get(g.id) ?? [],
      }
    })
    .filter((g) => g.items.length > 0 || !g.required)

  return NextResponse.json({ groups: out })
}
