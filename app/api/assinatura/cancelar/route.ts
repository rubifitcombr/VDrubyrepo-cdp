import { NextResponse } from 'next/server'
import { notificarAdminSolicitacaoCancelamentoAssinatura } from '@/services/notificar-admin.server'
import { createClient } from '@/lib/supabase/server'
import { getStoreByUser } from '@/services/store.server'
import { getUser } from '@/services/auth.server'

const MOTIVOS: Record<string, string> = {
  preco_alto: 'Preço alto',
  nao_usando: 'Não estou usando',
  falta_funcionalidade: 'Falta de funcionalidade',
  outro: 'Outro',
}

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: { motivo?: string }
  try {
    body = (await req.json()) as { motivo?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const key = String(body.motivo || '').trim()
  if (!MOTIVOS[key]) {
    return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  const row = store as Record<string, unknown>
  const storeId = String(row.id)
  const nomeLoja = typeof row.name === 'string' ? row.name : 'Loja'

  const supabase = await createClient()
  const { error } = await supabase.from('assinatura_cancelamentos').insert({
    store_id: storeId,
    motivo: `${key}:${MOTIVOS[key]}`,
  })

  if (error) {
    console.error('[assinatura/cancelar]', error)
    return NextResponse.json(
      {
        error:
          error.message?.includes('relation') || error.code === '42P01'
            ? 'Executa o script SQL em supabase/faturas-assinatura.sql no Supabase.'
            : error.message || 'Erro ao registar pedido',
      },
      { status: 500 }
    )
  }

  await notificarAdminSolicitacaoCancelamentoAssinatura({
    nomeLoja,
    emailLojista: user.email ?? null,
    motivoLabel: MOTIVOS[key]!,
  })

  return NextResponse.json({ ok: true })
}
