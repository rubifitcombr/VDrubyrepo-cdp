import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { insertAdminLog } from '@/services/admin-logs.server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { id: storeId } = await params

  let body: { descricao?: string; valor?: number | string; status?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const descricao = String(body.descricao || '').trim().slice(0, 200)
  if (!descricao) {
    return NextResponse.json({ error: 'Descrição em falta' }, { status: 400 })
  }

  const rawVal = body.valor
  const valor =
    typeof rawVal === 'number'
      ? rawVal
      : Number(String(rawVal ?? '').replace(',', '.'))
  if (!Number.isFinite(valor) || valor < 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
  }

  const st = String(body.status || '').toLowerCase()
  if (st !== 'pago' && st !== 'pendente' && st !== 'falhou') {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const { error } = await ctx.svc.from('faturas').insert({
    store_id: storeId,
    descricao,
    valor,
    status: st,
  })

  if (error) {
    console.error('[admin/faturas]', error)
    return NextResponse.json(
      {
        error:
          error.message?.includes('relation') || error.code === '42P01'
            ? 'Executa supabase/faturas-assinatura.sql no Supabase.'
            : error.message || 'Erro ao registar',
      },
      { status: 500 }
    )
  }

  const money = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  await insertAdminLog(ctx.svc, {
    adminId: ctx.user.id,
    lojistaId: storeId,
    acao: 'fatura_registrada',
    detalhes: `${descricao} · ${money.format(valor)} · ${st}`,
  })

  return NextResponse.json({ ok: true })
}
