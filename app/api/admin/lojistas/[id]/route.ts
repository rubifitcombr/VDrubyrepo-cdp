import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { fetchLojistaDetail } from '@/lib/admin-lojistas-query.server'
import { parseOperationModeInput } from '@/lib/merchant-operation-mode'
import { adminPurgeStoreById } from '@/services/admin-purge-store.server'
import { insertAdminLogFromRequest } from '@/services/admin-logs.server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  const detail = await fetchLojistaDetail(ctx.svc, id)
  if (!detail) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, ...detail })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: {
    name?: string
    phone?: string
    operation_mode?: string | null
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    patch.name = body.name.trim().slice(0, 200)
  }
  if (typeof body.phone === 'string') {
    patch.phone = body.phone.trim().slice(0, 80)
  }
  if ('operation_mode' in body) {
    const raw = body.operation_mode
    if (raw !== null && raw !== undefined && typeof raw !== 'string') {
      return NextResponse.json(
        { error: 'operation_mode inválido.' },
        { status: 400 }
      )
    }
    if (raw === null || raw === undefined) {
      patch.operation_mode = null
    } else if (typeof raw === 'string' && raw.trim() === '') {
      patch.operation_mode = null
    } else {
      const mode = parseOperationModeInput(String(raw).trim())
      if (!mode) {
        return NextResponse.json(
          {
            error:
              'Modo de operação inválido. Usa delivery, presencial, hibrido ou null.',
          },
          { status: 400 }
        )
      }
      patch.operation_mode = mode
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  const { error } = await ctx.svc.from('stores').update(patch).eq('id', id)
  if (error) {
    const msg = error.message || ''
    const missingCol =
      /operation_mode|column/i.test(msg) && /does not exist|schema cache/i.test(msg)
    return NextResponse.json(
      {
        error: missingCol
          ? 'Coluna operation_mode em falta. Executa scripts/supabase-store-operation-mode.sql no Supabase.'
          : msg,
      },
      { status: 500 }
    )
  }

  if ('operation_mode' in body) {
    try {
      await insertAdminLogFromRequest(ctx.svc, req, {
        adminId: ctx.user.id,
        lojistaId: id,
        acao: 'alterou_modo_operacao',
        detalhes: `operation_mode = ${String(patch.operation_mode ?? 'null')}`,
      })
    } catch {
      /* opcional */
    }
  }

  const detail = await fetchLojistaDetail(ctx.svc, id)
  return NextResponse.json({ ok: true, lojista: detail?.lojista })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id } = await params
  let body: { confirmName?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const confirmName =
    typeof body.confirmName === 'string' ? body.confirmName.trim() : ''

  const detail = await fetchLojistaDetail(ctx.svc, id)
  if (!detail) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }

  const nomeEsperado = detail.lojista.nome.trim()
  if (!confirmName || confirmName !== nomeEsperado) {
    return NextResponse.json(
      {
        error:
          'Confirmação inválida. Envia o nome exacto da loja no campo confirmName (JSON).',
      },
      { status: 400 }
    )
  }

  try {
    await insertAdminLogFromRequest(ctx.svc, req, {
      adminId: ctx.user.id,
      lojistaId: id,
      acao: 'eliminou_loja',
      detalhes: `Eliminação permanente da loja e dados associados · ${nomeEsperado}`,
    })
  } catch {
    /* continua mesmo se o log falhar */
  }

  try {
    const result = await adminPurgeStoreById(ctx.svc, id)
    return NextResponse.json({
      ok: true,
      deletedAuthUser: result.deletedAuthUser,
      message: result.deletedAuthUser
        ? 'Loja e conta do utilizador eliminadas.'
        : 'Loja eliminada. O utilizador mantém-se (ainda tem outras lojas ou não foi possível remover Auth).',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao eliminar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
