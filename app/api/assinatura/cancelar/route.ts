import { NextResponse } from 'next/server'
import {
  estimateContractPenalty,
  readStoreContract,
  todayIsoLocal,
} from '@/lib/contract-pricing'
import { requireLojistaCancelamentoApi } from '@/lib/require-lojista-ativo-api.server'
import { notificarAdminSolicitacaoCancelamentoAssinatura } from '@/services/notificar-admin.server'
import { createClient } from '@/lib/supabase/server'
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

  const gate = await requireLojistaCancelamentoApi(user.id)
  if (!gate.ok) return gate.response

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

  const row = gate.ctx.store
  const storeId = gate.ctx.storeId
  const nomeLoja = typeof row.name === 'string' ? row.name : 'Loja'
  const contract = readStoreContract(row)
  const penalty = estimateContractPenalty(contract, todayIsoLocal())

  const supabase = await createClient()
  const { error } = await supabase.from('assinatura_cancelamentos').insert({
    store_id: storeId,
    motivo: `${key}:${MOTIVOS[key]}`,
    multa_estimada_brl: penalty?.multaBrl ?? null,
    meses_restantes: penalty?.mesesRestantes ?? null,
  })

  if (error) {
    console.error('[assinatura/cancelar]', error)
    return NextResponse.json(
      {
        error:
          error.message?.includes('relation') || error.code === '42P01'
            ? 'Executa as migrations de assinatura no Supabase.'
            : error.message || 'Erro ao registar pedido',
      },
      { status: 500 }
    )
  }

  if (Object.prototype.hasOwnProperty.call(row, 'cancelamento_solicitado')) {
    await supabase
      .from('stores')
      .update({ cancelamento_solicitado: true })
      .eq('id', storeId)
  }

  await notificarAdminSolicitacaoCancelamentoAssinatura({
    nomeLoja,
    emailLojista: user.email ?? null,
    motivoLabel: MOTIVOS[key]!,
    multaEstimadaBrl: penalty?.multaBrl ?? null,
    mesesRestantes: penalty?.mesesRestantes ?? null,
    contratoAnual: contract.billingCycle === 'annual',
  })

  return NextResponse.json({
    ok: true,
    multaEstimadaBrl: penalty?.multaBrl ?? 0,
    mesesRestantes: penalty?.mesesRestantes ?? 0,
    valorRestanteBrl: penalty?.valorRestanteBrl ?? 0,
  })
}
