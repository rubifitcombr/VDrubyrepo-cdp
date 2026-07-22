import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { getVyriaAdminPanelUserId } from '@/lib/admin-panel-user'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'

const MIN_LEN = 6
const MAX_LEN = 128

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id: storeId } = await params
  if (!storeId?.trim()) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  }

  let body: { password?: unknown }
  try {
    body = (await req.json()) as { password?: unknown }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_LEN) {
    return NextResponse.json(
      { error: `A senha deve ter pelo menos ${MIN_LEN} caracteres.` },
      { status: 400 }
    )
  }
  if (password.length > MAX_LEN) {
    return NextResponse.json({ error: 'Senha demasiado longa.' }, { status: 400 })
  }

  const { data: store, error: storeErr } = await ctx.svc
    .from('stores')
    .select('id, owner_id, name')
    .eq('id', storeId)
    .maybeSingle()

  if (storeErr || !store) {
    return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
  }

  const row = store as { owner_id?: string | null; name?: string | null }
  const ownerId = String(row.owner_id ?? '').trim()
  if (!ownerId) {
    return NextResponse.json(
      { error: 'Esta loja não tem titular (owner_id).' },
      { status: 400 }
    )
  }

  const adminId = getVyriaAdminPanelUserId()

  if (adminId && ownerId === adminId) {
    return NextResponse.json(
      {
        error:
          'Não é possível alterar a senha da conta de administração Vyria por esta ação. Usa o Supabase ou outro fluxo seguro.',
      },
      { status: 403 }
    )
  }

  const { error: authErr } = await ctx.svc.auth.admin.updateUserById(ownerId, {
    password,
  })

  if (authErr) {
    return NextResponse.json(
      { error: authErr.message || 'Erro ao atualizar a senha no Supabase Auth.' },
      { status: 400 }
    )
  }

  const nomeLoja = String(row.name ?? '').trim().slice(0, 120)

  try {
    await insertAdminLogFromRequest(ctx.svc, req, {
      adminId: ctx.user.id,
      lojistaId: storeId,
      acao: 'redefiniu_senha_dono',
      detalhes: `Conta auth do titular · loja: ${nomeLoja || storeId}`,
    })
  } catch {
    /* log opcional */
  }

  return NextResponse.json({ ok: true })
}
