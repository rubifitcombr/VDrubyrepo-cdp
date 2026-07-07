import { requireAdminApi } from '@/lib/admin-auth.server'
import { buildSignedContractPdfResponse } from '@/services/annual-contract-document.server'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const { data: store, error } = await ctx.svc
    .from('stores')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !store) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  return buildSignedContractPdfResponse(store as Record<string, unknown>)
}
