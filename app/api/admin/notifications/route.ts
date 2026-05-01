import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import {
  fetchAdminNotifications,
  markAdminNotificationsRead,
  markAllAdminNotificationsRead,
} from '@/lib/admin-notifications.server'

export async function GET() {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  try {
    const items = await fetchAdminNotifications(ctx.svc, 50)
    const unread = items.filter((n) => !n.lida).length
    return NextResponse.json({ ok: true, items, unread })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao listar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  let body: { markAll?: boolean; ids?: string[] }
  try {
    body = (await req.json()) as { markAll?: boolean; ids?: string[] }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
    if (body.markAll) {
      await markAllAdminNotificationsRead(ctx.svc)
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await markAdminNotificationsRead(ctx.svc, body.ids)
    } else {
      return NextResponse.json(
        { error: 'Indica markAll ou ids.' },
        { status: 400 }
      )
    }
    const items = await fetchAdminNotifications(ctx.svc, 50)
    const unread = items.filter((n) => !n.lida).length
    return NextResponse.json({ ok: true, items, unread })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao atualizar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
