import { NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'

type PushSubscriptionPayload = {
  endpoint?: string
  keys?: {
    p256dh?: string
    auth?: string
  }
}

function badReq(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

async function getStoreContext() {
  const user = await getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return { ok: false as const, response: gate.response }
  return { ok: true as const, userId: user.id, storeId: gate.ctx.storeId }
}

export async function POST(req: Request) {
  const ctx = await getStoreContext()
  if (!ctx.ok) return ctx.response

  let body: PushSubscriptionPayload
  try {
    body = (await req.json()) as PushSubscriptionPayload
  } catch {
    return badReq('JSON inválido')
  }

  const endpoint = String(body.endpoint || '').trim()
  const p256dh = String(body.keys?.p256dh || '').trim()
  const auth = String(body.keys?.auth || '').trim()
  if (!endpoint || !p256dh || !auth) {
    return badReq('Inscrição de push inválida')
  }

  const svc = createServiceRoleClient()
  const { error } = await svc.from('store_push_subscriptions').upsert(
    {
      store_id: ctx.storeId,
      user_id: ctx.userId,
      endpoint,
      p256dh,
      auth,
      user_agent:
        typeof req.headers.get('user-agent') === 'string'
          ? req.headers.get('user-agent')
          : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )

  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === '42P01'
            ? 'Tabela de push em falta. Executa o SQL de subscriptions no Supabase.'
            : error.message,
      },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const ctx = await getStoreContext()
  if (!ctx.ok) return ctx.response

  let body: { endpoint?: string }
  try {
    body = (await req.json()) as { endpoint?: string }
  } catch {
    return badReq('JSON inválido')
  }
  const endpoint = String(body.endpoint || '').trim()
  if (!endpoint) return badReq('Endpoint em falta')

  const svc = createServiceRoleClient()
  await svc
    .from('store_push_subscriptions')
    .delete()
    .eq('store_id', ctx.storeId)
    .eq('user_id', ctx.userId)
    .eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}

