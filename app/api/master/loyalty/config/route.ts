import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import {
  getLoyaltySummary,
  getOrCreateLoyaltyConfig,
  listLoyaltyAccounts,
  listLoyaltyLedger,
  updateLoyaltyConfig,
} from '@/services/loyalty.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'loyalty')
  if (deny) return deny

  const db = await createClient()
  const config = await getOrCreateLoyaltyConfig(db, gate.ctx.storeId)
  const summary = await getLoyaltySummary(db, gate.ctx.storeId)
  const members = await listLoyaltyAccounts(db, gate.ctx.storeId)
  const ledger = await listLoyaltyLedger(db, gate.ctx.storeId)

  return NextResponse.json({ config, summary, members, ledger })
}

export async function PATCH(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'loyalty')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (body.points_per_real != null) patch.points_per_real = Number(body.points_per_real)
  if (body.min_redeem_points != null) {
    patch.min_redeem_points = Math.max(0, Math.floor(Number(body.min_redeem_points)))
  }
  if (body.redeem_cents_per_point != null) {
    patch.redeem_cents_per_point = Math.max(0, Math.floor(Number(body.redeem_cents_per_point)))
  }
  if (body.welcome_bonus_points != null) {
    patch.welcome_bonus_points = Math.max(0, Math.floor(Number(body.welcome_bonus_points)))
  }
  if (typeof body.whatsapp_balance_enabled === 'boolean') {
    patch.whatsapp_balance_enabled = body.whatsapp_balance_enabled
  }

  const db = await createClient()
  const config = await updateLoyaltyConfig(db, gate.ctx.storeId, patch)
  return NextResponse.json({ config })
}
