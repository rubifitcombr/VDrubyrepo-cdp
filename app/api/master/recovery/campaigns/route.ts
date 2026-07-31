import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import {
  createRecoveryCampaign,
  getOrCreateRecoveryConfig,
} from '@/services/recovery.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
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

  const name = String(body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Informe o nome da campanha.' }, { status: 400 })
  }

  const db = await createClient()
  const defaults = await getOrCreateRecoveryConfig(db, gate.ctx.storeId)
  const inactive_days =
    body.inactive_days != null
      ? Math.min(365, Math.max(7, Math.floor(Number(body.inactive_days))))
      : defaults.default_inactive_days
  const message_template =
    String(body.message_template || '').trim() || defaults.default_message_template

  const promotion_id =
    body.promotion_id !== undefined
      ? body.promotion_id == null || body.promotion_id === ''
        ? null
        : String(body.promotion_id)
      : defaults.promotion_id
  const offer_title =
    body.offer_title !== undefined
      ? body.offer_title == null
        ? null
        : String(body.offer_title).trim() || null
      : defaults.offer_title
  const offer_description =
    body.offer_description !== undefined
      ? body.offer_description == null
        ? null
        : String(body.offer_description).trim() || null
      : defaults.offer_description

  try {
    const campaign = await createRecoveryCampaign(db, gate.ctx.storeId, {
      name,
      message_template,
      inactive_days,
      promotion_id,
      offer_title,
      offer_description,
    })
    return NextResponse.json({ campaign })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao criar campanha.' },
      { status: 400 }
    )
  }
}
