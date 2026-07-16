import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  FISCAL_INVOICE_STATUS_LABEL,
  fiscalInvoiceSefazMessage,
  fiscalInvoiceTone,
  parseFiscalInvoiceStatus,
} from '@/lib/fiscal'

function arquivoPath(invoiceId: string, tipo: 'xml' | 'danfe'): string {
  return `/api/store/fiscal/arquivo?invoiceId=${encodeURIComponent(invoiceId)}&tipo=${tipo}`
}

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')?.trim() || ''
  if (!storeId) {
    return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
  }

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response
  if (storeId !== gate.ctx.storeId) {
    return NextResponse.json({ error: 'Acesso negado à loja.' }, { status: 403 })
  }

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
    : 50
  const statusFilter = req.nextUrl.searchParams.get('status')?.trim().toLowerCase() || ''

  const svc = createServiceRoleClient()
  let query = svc
    .from('fiscal_invoices')
    .select(
      'id, order_id, status, ambiente, chave_acesso, protocolo, motivo_rejeicao, motivo_cancelamento, valor_total, emitida_em, cancelada_em, created_at, nfe_url, xml_url, qr_code_url, xml_storage_path, danfe_storage_path, raw'
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (
    statusFilter &&
    ['autorizada', 'rejeitada', 'cancelada', 'pendente', 'erro'].includes(statusFilter)
  ) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const orderIds = [
    ...new Set(
      rows
        .map((r) => String(r.order_id ?? '').trim())
        .filter(Boolean)
    ),
  ]

  const orderMeta = new Map<string, { customerName: string | null; total: number | null }>()
  if (orderIds.length) {
    const { data: orders } = await svc
      .from('orders')
      .select('id, customer_name, total')
      .eq('store_id', storeId)
      .in('id', orderIds)
    for (const o of orders ?? []) {
      const id = String((o as { id?: string }).id ?? '')
      if (!id) continue
      orderMeta.set(id, {
        customerName: ((o as { customer_name?: string | null }).customer_name as string | null) ?? null,
        total:
          typeof (o as { total?: number }).total === 'number'
            ? ((o as { total: number }).total)
            : Number((o as { total?: unknown }).total) || null,
      })
    }
  }

  const invoices = rows.map((r) => {
    const id = String(r.id ?? '')
    const status = parseFiscalInvoiceStatus(r.status)
    const tone = fiscalInvoiceTone(status)
    const hasDanfe = Boolean(r.danfe_storage_path || r.nfe_url)
    const hasXml = Boolean(r.xml_storage_path || r.xml_url)
    const orderId = r.order_id ? String(r.order_id) : null
    const meta = orderId ? orderMeta.get(orderId) : undefined

    // Não devolve `raw` completo ao browser — só a mensagem já resolvida.
    return {
      id,
      orderId,
      customerName: meta?.customerName ?? null,
      status,
      statusLabel: FISCAL_INVOICE_STATUS_LABEL[status],
      tone,
      sefazMessage: fiscalInvoiceSefazMessage({
        status,
        motivo_rejeicao: (r.motivo_rejeicao as string | null) ?? null,
        motivo_cancelamento: (r.motivo_cancelamento as string | null) ?? null,
        raw: r.raw,
      }),
      ambiente: r.ambiente ? String(r.ambiente) : null,
      chaveAcesso: r.chave_acesso ? String(r.chave_acesso) : null,
      protocolo: r.protocolo ? String(r.protocolo) : null,
      valorTotal:
        r.valor_total != null
          ? Number(r.valor_total)
          : meta?.total ?? null,
      emitidaEm: r.emitida_em ? String(r.emitida_em) : null,
      canceladaEm: r.cancelada_em ? String(r.cancelada_em) : null,
      createdAt: r.created_at ? String(r.created_at) : null,
      nfeUrl: hasDanfe ? String(r.nfe_url || arquivoPath(id, 'danfe')) : null,
      xmlUrl: hasXml ? String(r.xml_url || arquivoPath(id, 'xml')) : null,
      qrCodeUrl: r.qr_code_url ? String(r.qr_code_url) : null,
    }
  })

  return NextResponse.json({ ok: true, invoices })
}
