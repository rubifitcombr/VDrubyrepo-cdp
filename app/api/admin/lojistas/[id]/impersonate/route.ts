import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { getVyriaAdminPanelUserId } from '@/lib/admin-panel-user'
import { createClient } from '@/lib/supabase/server'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'
import {
  IMPERSONATION_ACTIVE_COOKIE,
  IMPERSONATION_RESTORE_COOKIE,
} from '@/lib/impersonation'
import { sealImpersonationContext } from '@/lib/impersonation-sign.server'
import {
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'

/** Janela curta: cookie de restauro só precisa durar a sessão de configuração. */
const RESTORE_MAX_AGE = 60 * 60 * 12

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
  const storeName = String(row.name ?? '').trim().slice(0, 120) || 'lojista'

  if (!ownerId) {
    return NextResponse.json(
      { error: 'Esta loja não tem titular (owner_id).' },
      { status: 400 }
    )
  }

  const adminId = getVyriaAdminPanelUserId()

  if (adminId && ownerId === adminId) {
    return NextResponse.json(
      { error: 'Não é possível aceder como a própria conta de administração.' },
      { status: 400 }
    )
  }

  // Email do titular (necessário para gerar o link de sessão).
  const { data: ownerUser, error: ownerErr } =
    await ctx.svc.auth.admin.getUserById(ownerId)
  const ownerEmail = ownerUser?.user?.email?.trim() ?? ''
  if (ownerErr || !ownerEmail) {
    return NextResponse.json(
      { error: 'Titular sem email válido no Supabase Auth.' },
      { status: 400 }
    )
  }

  // Cliente ligado aos cookies da sessão atual (admin).
  const supabase = await createClient()

  // 1) Guardar a sessão do admin para poder voltar depois.
  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession()
  const adminRefreshToken = adminSession?.refresh_token ?? ''
  if (!adminRefreshToken) {
    return NextResponse.json(
      { error: 'Sessão de admin não encontrada. Faz login novamente.' },
      { status: 401 }
    )
  }

  // 2) Gerar um token de sessão de uso único para o titular (não envia email).
  const { data: linkData, error: linkErr } =
    await ctx.svc.auth.admin.generateLink({
      type: 'magiclink',
      email: ownerEmail,
    })
  const tokenHash = linkData?.properties?.hashed_token ?? ''
  if (linkErr || !tokenHash) {
    return NextResponse.json(
      { error: linkErr?.message || 'Não foi possível gerar a sessão do lojista.' },
      { status: 400 }
    )
  }

  // 3) Trocar o token pela sessão do lojista — sobrescreve os cookies de auth.
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (verifyErr) {
    return NextResponse.json(
      { error: verifyErr.message || 'Falha ao iniciar a sessão do lojista.' },
      { status: 400 }
    )
  }

  // 4) Persistir contexto de impersonation + sessão de restauro do admin.
  const cookieStore = await cookies()
  const secure = process.env.NODE_ENV === 'production'
  const baseCookie = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: RESTORE_MAX_AGE,
  }
  cookieStore.set(IMPERSONATION_RESTORE_COOKIE, adminRefreshToken, baseCookie)
  cookieStore.set(
    IMPERSONATION_ACTIVE_COOKIE,
    sealImpersonationContext({ storeId, storeName }),
    baseCookie
  )
  // O lojista não é a conta admin: garantir regras normais de lojista.
  cookieStore.set(VYRIA_PANEL_MODE_COOKIE, 'lojista', {
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: RESTORE_MAX_AGE,
  })

  try {
    await insertAdminLogFromRequest(ctx.svc, req, {
      adminId: ctx.user.id,
      lojistaId: storeId,
      acao: 'acessou_como_lojista',
      detalhes: `Sessão de acesso assumida · loja: ${storeName}`,
    })
  } catch {
    /* log opcional */
  }

  return NextResponse.json({ ok: true, redirectTo: '/dashboard' })
}
