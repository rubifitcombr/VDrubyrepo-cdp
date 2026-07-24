import { NextRequest, NextResponse } from 'next/server'
import { requiresAnnualContractAcceptance } from '@/lib/annual-contract-acceptance'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { withTimeout } from '@/lib/supabase/fetch-with-timeout'
import { SUPABASE_SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/client-options'
import { verificarLojistaGates } from '@/middleware/verificarLojistaGates'

export const dynamic = 'force-dynamic'

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  if (raw === '/dashboard/contrato' || raw.startsWith('/dashboard/contrato/')) {
    return '/dashboard/contrato'
  }
  if (raw === '/dashboard' || raw.startsWith('/dashboard/')) return '/dashboard'
  return raw
}

/** Define para onde enviar o lojista logo após login (contrato, gates, hub). */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, redirectTo: '/login' }, { status: 401 })
  }

  const svc = tryCreateServiceRoleClient()
  if (svc) {
    await svc.from('usuarios').upsert(
      { id: user.id, email: user.email ?? null },
      { onConflict: 'id' }
    )
  }

  const next = safeNextPath(req.nextUrl.searchParams.get('next'))

  let store: Record<string, unknown> | null = null
  try {
    const storeResult = await withTimeout(
      (async () =>
        supabase
          .from('stores')
          .select(
            'billing_cycle, contrato_aceite_em, contrato_termos_versao, contrato_documento_hash'
          )
          .eq('owner_id', user.id)
          .maybeSingle())(),
      SUPABASE_SERVER_FETCH_TIMEOUT_MS,
      'post-login store'
    )
    store = (storeResult.data as Record<string, unknown> | null) ?? null
  } catch (e) {
    console.error('[post-login-redirect] store timeout', e)
    return NextResponse.json({ ok: true, redirectTo: next })
  }

  if (store && requiresAnnualContractAcceptance(store)) {
    return NextResponse.json({ ok: true, redirectTo: '/dashboard/contrato' })
  }

  try {
    const gate = await withTimeout(
      verificarLojistaGates(user.id, next, supabase),
      SUPABASE_SERVER_FETCH_TIMEOUT_MS,
      'post-login gates'
    )
    if (!gate.ok) {
      return NextResponse.json({ ok: true, redirectTo: gate.path })
    }
  } catch (e) {
    console.error('[post-login-redirect] gates timeout', e)
  }

  return NextResponse.json({ ok: true, redirectTo: next })
}
