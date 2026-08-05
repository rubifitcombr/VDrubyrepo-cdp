import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  fetchOpenSubscriptionInvoice,
  reconcileInvoiceWithMp,
} from '@/services/subscription-billing.server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id, { skipSubscriptionGate: true })
  if (!gate.ok) return gate.response

  const svc = tryCreateServiceRoleClient() ?? supabase
  let invoice = await fetchOpenSubscriptionInvoice(svc, gate.ctx.storeId)
  if (!invoice) {
    return NextResponse.json({ ok: true, confirmed: true, status: 'none' })
  }

  if (invoice.mp_payment_id) {
    invoice = await reconcileInvoiceWithMp(svc, invoice)
  }

  const confirmed = invoice.status === 'paid'
  return NextResponse.json({
    ok: true,
    confirmed,
    status: invoice.status,
    invoiceId: invoice.id,
  })
}
