import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Lista adicionais de um produto (cardápio público).
 * Usa o cliente servidor; requer políticas RLS de leitura em addon_*.
 */
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('productId')?.trim()
  if (!productId) {
    return NextResponse.json({ error: 'productId em falta.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: groups, error: gErr } = await supabase
    .from('addon_groups')
    .select('id, name, required, sort_order')
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
    groups as { id: string; name: string; required: boolean }[]
  ).map((g) => ({
    name: g.name,
    required: !!g.required,
    items: byGroup.get(g.id) ?? [],
  }))

  return NextResponse.json({ groups: out })
}
