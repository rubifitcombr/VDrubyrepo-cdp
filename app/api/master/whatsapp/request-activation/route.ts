import { NextResponse } from 'next/server'
import { gateMerchantMasterFeature } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import { requestWhatsAppActivation } from '@/services/whatsapp-onboarding.server'
import { getUser } from '@/services/auth.server'

export const dynamic = 'force-dynamic'

/** Lojista solicita activação manual do WhatsApp (Vyria configura na Meta). */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const deny = gateMerchantMasterFeature(gate.ctx.store, user.email, 'whatsapp_ai')
  if (deny) return deny

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const db = await createClient()
  const result = await requestWhatsAppActivation(db, gate.ctx.storeId, {
    contact_phone: body.contact_phone != null ? String(body.contact_phone) : undefined,
    notes: body.notes != null ? String(body.notes) : undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
