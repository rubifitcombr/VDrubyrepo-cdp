import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { consultarStatus } from '@/services/fiscal'
import {
  FISCAL_INVOICE_STATUS_LABEL,
  fiscalInvoiceSefazMessage,
  fiscalInvoiceTone,
  parseFiscalInvoiceStatus,
} from '@/lib/fiscal'

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const invoiceId =
    typeof body.invoiceId === 'string' ? body.invoiceId.trim() : ''
  const chaveAcesso =
    typeof body.chaveAcesso === 'string' ? body.chaveAcesso.trim() : ''
  if (!invoiceId && !chaveAcesso) {
    return NextResponse.json(
      { error: 'Informe invoiceId ou chaveAcesso.' },
      { status: 400 }
    )
  }

  const svc = createServiceRoleClient()
  let inv: Record<string, unknown> | null = null
  if (invoiceId) {
    const { data } = await svc
      .from('fiscal_invoices')
      .select(
        'id, store_id, status, chave_acesso, protocolo, motivo_rejeicao, motivo_cancelamento, raw'
      )
      .eq('id', invoiceId)
      .maybeSingle()
    inv = (data as Record<string, unknown> | null) ?? null
  } else {
    const chave = chaveAcesso.replace(/\D/g, '')
    const { data } = await svc
      .from('fiscal_invoices')
      .select(
        'id, store_id, status, chave_acesso, protocolo, motivo_rejeicao, motivo_cancelamento, raw'
      )
      .eq('store_id', gate.ctx.storeId)
      .eq('chave_acesso', chave)
      .maybeSingle()
    inv = (data as Record<string, unknown> | null) ?? null
  }

  if (!inv) {
    return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 })
  }
  if (String(inv.store_id) !== gate.ctx.storeId) {
    return NextResponse.json({ error: 'Acesso negado à nota.' }, { status: 403 })
  }

  const result = await consultarStatus(String(inv.id))
  const status = parseFiscalInvoiceStatus(result.status)
  const { data: refreshed } = await svc
    .from('fiscal_invoices')
    .select(
      'id, status, chave_acesso, protocolo, motivo_rejeicao, motivo_cancelamento, raw, nfe_url, xml_url, qr_code_url'
    )
    .eq('id', String(inv.id))
    .maybeSingle()

  const row = (refreshed ?? inv) as Record<string, unknown>
  return NextResponse.json({
    ok: result.success || status === 'cancelada' || status === 'autorizada',
    invoiceId: String(inv.id),
    status,
    statusLabel: FISCAL_INVOICE_STATUS_LABEL[status],
    tone: fiscalInvoiceTone(status),
    chaveAcesso: result.chaveAcesso ?? row.chave_acesso ?? null,
    protocolo: result.protocolo ?? row.protocolo ?? null,
    sefazMessage: fiscalInvoiceSefazMessage({
      status,
      motivo_rejeicao:
        (row.motivo_rejeicao as string | null) ?? result.motivo ?? null,
      motivo_cancelamento: (row.motivo_cancelamento as string | null) ?? null,
      raw: row.raw ?? result.raw,
    }),
    motivo: result.motivo,
    nfeUrl: row.nfe_url ? String(row.nfe_url) : null,
    xmlUrl: row.xml_url ? String(row.xml_url) : null,
    qrCodeUrl: row.qr_code_url ? String(row.qr_code_url) : null,
  })
}
