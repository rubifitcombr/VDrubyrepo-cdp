import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import {
  findInactiveCustomers,
  getOrCreateRecoveryConfig,
  getRecoveryReport,
  listRecoveryCampaigns,
  listRecoverySends,
  updateRecoveryConfig,
} from '@/services/recovery.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'recovery')
  if (deny) return deny

  const url = new URL(req.url)
  const previewDays = Number(url.searchParams.get('preview_days') || '0')

  const db = await createClient()
  const config = await getOrCreateRecoveryConfig(db, gate.ctx.storeId)
  const report = await getRecoveryReport(db, gate.ctx.storeId)
  const campaigns = await listRecoveryCampaigns(db, gate.ctx.storeId)
  const sends = await listRecoverySends(db, gate.ctx.storeId, undefined, 50)

  let inactivePreview = null
  if (previewDays >= 7) {
    inactivePreview = await findInactiveCustomers(
      db,
      gate.ctx.storeId,
      Math.min(365, Math.floor(previewDays))
    )
  }

  return NextResponse.json({
    config,
    report,
    campaigns,
    sends,
    inactivePreview,
  })
}

export async function PATCH(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'recovery')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (body.default_inactive_days != null) {
    patch.default_inactive_days = Math.min(
      365,
      Math.max(7, Math.floor(Number(body.default_inactive_days)))
    )
  }
  if (body.default_message_template != null) {
    patch.default_message_template = String(body.default_message_template).trim()
  }

  const db = await createClient()
  const config = await updateRecoveryConfig(db, gate.ctx.storeId, patch)
  return NextResponse.json({ config })
}
