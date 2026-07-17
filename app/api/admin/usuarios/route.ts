import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchAuthUsersForAdmin } from '@/lib/admin-auth-users.server'
import { createOrRelinkPendingStoreForAuthUser } from '@/lib/admin-create-pending-store.server'

export async function GET(req: NextRequest) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const q = req.nextUrl.searchParams.get('q') ?? ''

  try {
    const snapshot = await fetchAuthUsersForAdmin(ctx.svc, q)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao listar utilizadores Auth'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Cria (ou religa) loja pendente para um utilizador Auth sem loja.
 * Body: { userId: string, storeName?: string }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const storeName =
    typeof body.storeName === 'string' && body.storeName.trim()
      ? body.storeName.trim()
      : null

  if (!userId) {
    return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 })
  }

  const { data: authData, error: authErr } = await ctx.svc.auth.admin.getUserById(userId)
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Utilizador Auth não encontrado.' }, { status: 404 })
  }

  const user = authData.user
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const metaName =
    typeof meta.store_name === 'string' && meta.store_name.trim()
      ? meta.store_name.trim()
      : null

  try {
    // Espelha em public.usuarios se ainda não existir.
    let mirrorErr = (
      await ctx.svc.from('usuarios').upsert(
        { id: userId, email: user.email ?? `${userId}@orphan.local`, role: 'lojista' },
        { onConflict: 'id' }
      )
    ).error
    if (mirrorErr && /role|column|schema cache/i.test(mirrorErr.message)) {
      mirrorErr = (
        await ctx.svc
          .from('usuarios')
          .upsert(
            { id: userId, email: user.email ?? `${userId}@orphan.local` },
            { onConflict: 'id' }
          )
      ).error
    }
    if (mirrorErr) {
      return NextResponse.json(
        { error: `Erro ao espelhar utilizador: ${mirrorErr.message}` },
        { status: 500 }
      )
    }

    const result = await createOrRelinkPendingStoreForAuthUser(ctx.svc, {
      userId,
      email: user.email ?? null,
      storeName: storeName ?? metaName,
    })

    return NextResponse.json({
      ok: true,
      storeId: result.storeId,
      created: result.created,
      relinked: result.relinked,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar loja'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
