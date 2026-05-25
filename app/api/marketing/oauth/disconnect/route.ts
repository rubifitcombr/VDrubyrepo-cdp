import { NextResponse } from 'next/server'
import { requireMarketingApiContext } from '@/lib/marketing/api-context.server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const ctx = await requireMarketingApiContext()
  if (!ctx.ok) return ctx.response

  const { error } = await ctx.db
    .from('social_connections')
    .delete()
    .eq('store_id', ctx.storeId)
    .eq('provider', 'meta')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
