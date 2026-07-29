import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  isFiscalActive,
  isNfceCancelavel,
  isNfceCfopValido,
  indicadorPresencaForOrder,
  NFCE_CANCEL_JUSTIFICATIVA_MAX,
  NFCE_CANCEL_JUSTIFICATIVA_MIN,
  nfceCancelPrazoLabel,
  parseFiscalAmbiente,
  paymentMethodToNfceForma,
  type FiscalInvoiceStatus,
} from '@/lib/fiscal'
import {
  getFiscalService,
  getStoreFiscalConfig,
  regimeToCrt,
  type EmpresaInput,
  type FiscalStatusResult,
  type NfceProdutoInput,
  type StoreFiscalConfig,
} from '@/services/fiscal.server'
import {
  nfceLineTotalFromOrderItem,
  nfceQuantityFromOrderItem,
  nfceUnidadeFromOrderItem,
  nfceUnitPriceFromOrderItem,
} from '@/lib/fiscal/weighable-nfce'
import { persistNfceArtifacts } from '@/services/fiscal-artifacts.server'

/**
 * Camada de domínio do módulo fiscal (Vyria Fiscal).
 *
 * Orquestra o adapter de gateway (`services/fiscal.server.ts`) com o banco:
 * carrega pedido/itens/config, valida o add-on e registra o histórico em
 * `fiscal_invoices`. As rotas/UI só conversam com este facade.
 */

export type EmitirNfceResult = {
  ok: boolean
  invoiceId?: string
  status: FiscalInvoiceStatus
  chaveAcesso?: string
  protocolo?: string
  nfeUrl?: string
  xmlUrl?: string
  qrCodeUrl?: string
  motivo?: string
}

export type UploadCertificadoResult = {
  ok: boolean
  cn?: string
  validade?: string
  motivo?: string
}

type OrderItemRow = {
  quantity: number | string | null
  unit_price: number | string | null
  price: number | string | null
  name: string | null
  unit_type?: string | null
  weight_kg?: number | string | null
  price_per_kg_snapshot?: number | string | null
  products: {
    ncm: string | null
    cfop: string | null
    cest: string | null
    unidade: string | null
    origem: string | null
    cst_csosn: string | null
    sold_by_weight?: boolean | null
  } | null
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v.replace(',', '.')) || 0
  return 0
}

/** Motivos em que a emissão automática deve ser silenciosamente ignorada. */
function isFiscalNotConfiguredMotivo(motivo: string | undefined): boolean {
  if (!motivo) return false
  return (
    /não está ativo/i.test(motivo) ||
    /sem configuração fiscal/i.test(motivo) ||
    /configuração fiscal ausente/i.test(motivo) ||
    /token da brasil nfe/i.test(motivo) ||
    /certificado digital/i.test(motivo)
  )
}

/** Garante config + add-on ativo + token presentes antes de qualquer emissão. */
function assertEmissionReady(cfg: StoreFiscalConfig | null): string | null {
  if (!cfg) return 'Loja sem configuração fiscal.'
  if (!isFiscalActive(cfg.status)) return 'Módulo fiscal não está ativo para esta loja.'
  if (!cfg.brasilnfeToken) return 'Token da Brasil NFe não configurado.'
  if (cfg.certStatus !== 'valido') return 'Certificado digital ausente ou inválido.'
  return null
}

export type FiscalAutoEmitResult = {
  /** Tentou chamar o gateway / gravar nota. */
  attempted: boolean
  /** Fiscal inativo ou sem pré-requisitos — venda segue sem NFC-e. */
  skipped: boolean
  ok: boolean
  status?: FiscalInvoiceStatus
  chaveAcesso?: string
  motivo?: string
}

/**
 * Emite NFC-e após fecho de venda (PDV imediato / caixa). Nunca lança:
 * falha fiscal não deve bloquear o recebimento.
 */
export async function tryAutoEmitNfceForOrder(
  orderId: string,
  opts?: { cpf?: string }
): Promise<FiscalAutoEmitResult> {
  try {
    const result = await emitirNfce(orderId, opts)
    if (!result.ok && isFiscalNotConfiguredMotivo(result.motivo)) {
      return {
        attempted: false,
        skipped: true,
        ok: false,
        motivo: result.motivo,
      }
    }
    return {
      attempted: true,
      skipped: false,
      ok: result.ok,
      status: result.status,
      chaveAcesso: result.chaveAcesso,
      motivo: result.motivo,
    }
  } catch (err) {
    console.error('[fiscal] auto-emit failed', orderId, err)
    return {
      attempted: true,
      skipped: false,
      ok: false,
      status: 'erro',
      motivo: err instanceof Error ? err.message : 'Falha inesperada na emissão automática.',
    }
  }
}

/**
 * Emite a NFC-e de um pedido. Valida o add-on, monta os itens a partir de
 * `order_items` + dados fiscais do produto, chama o gateway e grava em
 * `fiscal_invoices` (idempotente por pedido: nota já autorizada não reemite).
 */
export async function emitirNfce(
  orderId: string,
  opts?: { cpf?: string }
): Promise<EmitirNfceResult> {
  if (!orderId?.trim()) {
    return { ok: false, status: 'erro', motivo: 'Pedido inválido.' }
  }
  const svc = createServiceRoleClient()

  const { data: order, error: orderErr } = await svc
    .from('orders')
    .select(
      'id, store_id, total, customer_name, payment_method, source, delivery_fee, service_fee_brl, delivery_address'
    )
    .eq('id', orderId)
    .maybeSingle()
  if (orderErr || !order) {
    return { ok: false, status: 'erro', motivo: 'Pedido não encontrado.' }
  }
  const storeId = String(order.store_id ?? '')
  const orderRow = order as {
    payment_method?: unknown
    source?: unknown
    delivery_fee?: unknown
    service_fee_brl?: unknown
    delivery_address?: unknown
    customer_name?: unknown
    total?: unknown
  }

  // Idempotência: se já existe nota autorizada para o pedido, não reemite.
  const { data: existing } = await svc
    .from('fiscal_invoices')
    .select('id, status, chave_acesso, protocolo, nfe_url, xml_url, qr_code_url')
    .eq('order_id', orderId)
    .eq('status', 'autorizada')
    .maybeSingle()
  if (existing) {
    return {
      ok: true,
      invoiceId: String(existing.id),
      status: 'autorizada',
      chaveAcesso: (existing.chave_acesso as string | null) ?? undefined,
      protocolo: (existing.protocolo as string | null) ?? undefined,
      nfeUrl: (existing.nfe_url as string | null) ?? undefined,
      xmlUrl: (existing.xml_url as string | null) ?? undefined,
      qrCodeUrl: (existing.qr_code_url as string | null) ?? undefined,
      motivo: 'Pedido já possui NFC-e autorizada.',
    }
  }

  const cfg = await getStoreFiscalConfig(svc, storeId)
  const guard = assertEmissionReady(cfg)
  if (guard || !cfg) {
    return { ok: false, status: 'erro', motivo: guard || 'Configuração fiscal ausente.' }
  }

  const { data: itemsRaw, error: itemsErr } = await svc
    .from('order_items')
    .select(
      'quantity, unit_price, price, name, unit_type, weight_kg, price_per_kg_snapshot, products(ncm, cfop, cest, unidade, origem, cst_csosn, sold_by_weight)'
    )
    .eq('order_id', orderId)
  if (itemsErr) {
    return { ok: false, status: 'erro', motivo: 'Falha ao ler itens do pedido.' }
  }
  const items = (itemsRaw ?? []) as unknown as OrderItemRow[]
  if (!items.length) {
    return { ok: false, status: 'erro', motivo: 'Pedido sem itens.' }
  }

  const produtos: NfceProdutoInput[] = []
  const semFiscal: string[] = []
  const cfopInvalidos: string[] = []
  for (const it of items) {
    const nome = (it.name || it.products?.ncm || 'Item').toString()
    const ncm = it.products?.ncm?.trim() || ''
    const cfop = it.products?.cfop?.trim() || ''
    if (!ncm || !cfop) {
      semFiscal.push(it.name || nome)
      continue
    }
    if (!isNfceCfopValido(cfop)) {
      cfopInvalidos.push(`${it.name || nome} (${cfop})`)
      continue
    }
    produtos.push({
      nome,
      ncm,
      cfop,
      quantidade: nfceQuantityFromOrderItem(it),
      valorUnitario: nfceUnitPriceFromOrderItem(it),
      unidade: nfceUnidadeFromOrderItem(it),
      origem: it.products?.origem?.trim() || '0',
      cstCsosn: it.products?.cst_csosn?.trim() || undefined,
      cest: it.products?.cest?.trim() || undefined,
    })
  }
  const invalidQty = produtos.filter((p) => !p.quantidade || p.quantidade <= 0)
  if (invalidQty.length) {
    return {
      ok: false,
      status: 'erro',
      motivo: 'Há itens com quantidade inválida para a NFC-e (verifique pesos no PDV).',
    }
  }
  if (semFiscal.length) {
    return {
      ok: false,
      status: 'erro',
      motivo: `Produtos sem NCM/CFOP: ${semFiscal.slice(0, 5).join(', ')}. Preencha os dados fiscais no cardápio.`,
    }
  }
  if (cfopInvalidos.length) {
    return {
      ok: false,
      status: 'erro',
      motivo: `CFOP inválido para NFC-e: ${cfopInvalidos.slice(0, 5).join(', ')}.`,
    }
  }

  const itemsSum = Number(
    items
      .reduce((acc, it) => acc + nfceLineTotalFromOrderItem(it), 0)
      .toFixed(2)
  )
  const valorFrete = Math.max(0, toNumber(orderRow.delivery_fee))
  const valorOutras = Math.max(0, toNumber(orderRow.service_fee_brl))
  const orderTotal = toNumber(orderRow.total)
  const computedTotal = Number((itemsSum + valorFrete + valorOutras).toFixed(2))
  const valorTotal =
    orderTotal > 0 && Math.abs(orderTotal - computedTotal) < 0.05
      ? orderTotal
      : computedTotal

  const cpf = (opts?.cpf || '').replace(/\D/g, '')
  const nome = orderRow.customer_name ? String(orderRow.customer_name) : undefined
  const cliente = cpf ? { cpf, nome } : nome ? { nome } : undefined
  const indicadorPresenca = indicadorPresencaForOrder({
    source: orderRow.source,
    deliveryAddress: orderRow.delivery_address,
    deliveryFee: orderRow.delivery_fee,
  })

  // Reserva linha "pendente" antes do gateway (reduz race de emissão dupla).
  const { data: reserved, error: reserveErr } = await svc
    .from('fiscal_invoices')
    .insert({
      store_id: storeId,
      order_id: orderId,
      status: 'pendente',
      ambiente: cfg.ambiente,
      modelo: 65,
      valor_total: valorTotal || null,
    })
    .select('id')
    .single()

  if (reserveErr || !reserved?.id) {
    const { data: raced } = await svc
      .from('fiscal_invoices')
      .select('id, status, chave_acesso, protocolo, nfe_url, xml_url, qr_code_url')
      .eq('order_id', orderId)
      .eq('status', 'autorizada')
      .maybeSingle()
    if (raced) {
      return {
        ok: true,
        invoiceId: String(raced.id),
        status: 'autorizada',
        chaveAcesso: (raced.chave_acesso as string | null) ?? undefined,
        protocolo: (raced.protocolo as string | null) ?? undefined,
        nfeUrl: (raced.nfe_url as string | null) ?? undefined,
        xmlUrl: (raced.xml_url as string | null) ?? undefined,
        qrCodeUrl: (raced.qr_code_url as string | null) ?? undefined,
        motivo: 'Pedido já possui NFC-e autorizada.',
      }
    }
    return {
      ok: false,
      status: 'erro',
      motivo: reserveErr?.message || 'Não foi possível iniciar a emissão.',
    }
  }

  const invoiceId = String(reserved.id)

  const result = await getFiscalService().emitirNfce({
    token: cfg.brasilnfeToken!,
    ambiente: cfg.ambiente,
    crt: regimeToCrt(cfg.regimeTributario),
    cliente,
    produtos,
    valorTotal: valorTotal || undefined,
    valorFrete: valorFrete > 0 ? valorFrete : undefined,
    valorOutrasDespesas: valorOutras > 0 ? valorOutras : undefined,
    indicadorPresenca,
    pagamentos: [
      {
        forma: paymentMethodToNfceForma(orderRow.payment_method),
        valor: valorTotal,
      },
    ],
    identificadorInterno: orderId,
  })

  await svc
    .from('fiscal_invoices')
    .update({
      status: result.status,
      chave_acesso: result.chaveAcesso ?? null,
      protocolo: result.protocolo ?? null,
      nfe_url: result.nfeUrl ?? null,
      motivo_rejeicao: result.success ? null : result.motivo ?? null,
      valor_total: valorTotal || null,
      raw: result.raw ?? null,
      emitida_em: result.success ? new Date().toISOString() : null,
    })
    .eq('id', invoiceId)

  let protocolo = result.protocolo
  if (result.success && result.chaveAcesso && !protocolo) {
    try {
      const consulted = await getFiscalService().consultarStatus(
        result.chaveAcesso,
        cfg.brasilnfeToken!
      )
      if (consulted.protocolo) {
        protocolo = consulted.protocolo
        await svc.from('fiscal_invoices').update({ protocolo }).eq('id', invoiceId)
      }
    } catch (err) {
      console.error('[fiscal] enrich protocolo failed', orderId, err)
    }
  }

  let nfeUrl = result.nfeUrl
  let xmlUrl: string | undefined
  let qrCodeUrl: string | undefined

  if (result.success && result.chaveAcesso) {
    try {
      const xmlBase64 = result.xmlBase64
      const danfeBase64 = result.danfeBase64
      let xmlBuffer: Buffer | null = null
      let danfeBuffer: Buffer | null = null

      const gateway = getFiscalService()
      if (!xmlBase64) {
        const fetched = await gateway.obterArquivoNfce({
          token: cfg.brasilnfeToken!,
          chaveAcesso: result.chaveAcesso,
          tipo: 'xml',
        })
        if (fetched.success && fetched.buffer) xmlBuffer = fetched.buffer
      }
      if (!danfeBase64) {
        const fetched = await gateway.obterArquivoNfce({
          token: cfg.brasilnfeToken!,
          chaveAcesso: result.chaveAcesso,
          tipo: 'danfe',
        })
        if (fetched.success && fetched.buffer) danfeBuffer = fetched.buffer
      }

      const artifacts = await persistNfceArtifacts({
        storeId,
        invoiceId,
        chaveAcesso: result.chaveAcesso,
        xmlBase64,
        danfeBase64,
        xmlBuffer,
        danfeBuffer,
      })

      nfeUrl = artifacts.nfeUrl ?? nfeUrl
      xmlUrl = artifacts.xmlUrl ?? undefined
      qrCodeUrl = artifacts.qrCodeUrl ?? undefined

      await svc
        .from('fiscal_invoices')
        .update({
          xml_storage_path: artifacts.xmlPath,
          danfe_storage_path: artifacts.danfePath,
          xml_url: artifacts.xmlUrl,
          nfe_url: artifacts.nfeUrl ?? result.nfeUrl ?? null,
          qr_code_url: artifacts.qrCodeUrl,
        })
        .eq('id', invoiceId)
    } catch (err) {
      console.error('[fiscal] persist artifacts failed', orderId, err)
    }
  }

  return {
    ok: result.success,
    invoiceId,
    status: result.status,
    chaveAcesso: result.chaveAcesso,
    protocolo,
    nfeUrl,
    xmlUrl,
    qrCodeUrl,
    motivo: result.success ? undefined : result.motivo,
  }
}

/**
 * Consulta o status de uma nota no gateway. Aceita o id interno da
 * `fiscal_invoices` ou a chave de acesso; resolve a loja/token e sincroniza
 * o status local quando a SEFAZ confirma.
 */
export async function consultarStatus(nfeId: string): Promise<FiscalStatusResult> {
  if (!nfeId?.trim()) {
    return { success: false, status: 'erro', motivo: 'Identificador da nota ausente.' }
  }
  const svc = createServiceRoleClient()

  const { data: invoice } = await svc
    .from('fiscal_invoices')
    .select('id, store_id, chave_acesso')
    .or(`id.eq.${nfeId},chave_acesso.eq.${nfeId}`)
    .maybeSingle()
  if (!invoice) {
    return { success: false, status: 'erro', motivo: 'Nota não encontrada.' }
  }

  const cfg = await getStoreFiscalConfig(svc, String(invoice.store_id))
  if (!cfg?.brasilnfeToken) {
    return { success: false, status: 'erro', motivo: 'Token da Brasil NFe não configurado.' }
  }

  const chave = (invoice.chave_acesso as string | null) || nfeId
  const result = await getFiscalService().consultarStatus(chave, cfg.brasilnfeToken)

  if (result.status === 'autorizada' || result.status === 'cancelada' || result.status === 'rejeitada') {
    await svc
      .from('fiscal_invoices')
      .update({
        status: result.status,
        chave_acesso: result.chaveAcesso ?? invoice.chave_acesso ?? null,
        ...(result.protocolo ? { protocolo: result.protocolo } : {}),
        ...(result.nfeUrl ? { nfe_url: result.nfeUrl } : {}),
        ...(result.status === 'cancelada'
          ? { cancelada_em: new Date().toISOString() }
          : {}),
      })
      .eq('id', invoice.id)
  }
  return result
}

export type CancelarNfceResult = {
  ok: boolean
  invoiceId?: string
  status: FiscalInvoiceStatus
  protocoloCancelamento?: string
  motivo?: string
}

const DEFAULT_CANCEL_JUSTIFICATIVA = 'Cancelamento do pedido pelo lojista.'

/**
 * Cancela NFC-e autorizada (manual ou automático). Idempotente se já cancelada.
 */
export async function cancelarNfce(
  ref: { orderId?: string; invoiceId?: string },
  opts: { justificativa: string }
): Promise<CancelarNfceResult> {
  const orderId = String(ref.orderId ?? '').trim()
  const invoiceId = String(ref.invoiceId ?? '').trim()
  if (!orderId && !invoiceId) {
    return { ok: false, status: 'erro', motivo: 'Informe orderId ou invoiceId.' }
  }

  const justificativa = String(opts.justificativa ?? '').trim()
  if (justificativa.length < NFCE_CANCEL_JUSTIFICATIVA_MIN) {
    return {
      ok: false,
      status: 'erro',
      motivo: `Justificativa deve ter no mínimo ${NFCE_CANCEL_JUSTIFICATIVA_MIN} caracteres.`,
    }
  }
  if (justificativa.length > NFCE_CANCEL_JUSTIFICATIVA_MAX) {
    return {
      ok: false,
      status: 'erro',
      motivo: `Justificativa deve ter no máximo ${NFCE_CANCEL_JUSTIFICATIVA_MAX} caracteres.`,
    }
  }

  const svc = createServiceRoleClient()

  type InvoiceCancelRow = {
    id: string
    store_id: string
    status: string
    chave_acesso: string | null
    protocolo: string | null
    emitida_em: string | null
    ambiente: string | null
  }

  let invoice: InvoiceCancelRow | null = null

  if (invoiceId) {
    const { data } = await svc
      .from('fiscal_invoices')
      .select('id, store_id, status, chave_acesso, protocolo, emitida_em, ambiente')
      .eq('id', invoiceId)
      .maybeSingle()
    invoice = (data as InvoiceCancelRow | null) ?? null
  } else {
    const { data: cancelled } = await svc
      .from('fiscal_invoices')
      .select('id, store_id, status, chave_acesso, protocolo, emitida_em, ambiente')
      .eq('order_id', orderId)
      .eq('status', 'cancelada')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cancelled) {
      invoice = cancelled as InvoiceCancelRow
    } else {
      const { data: authorized } = await svc
        .from('fiscal_invoices')
        .select('id, store_id, status, chave_acesso, protocolo, emitida_em, ambiente')
        .eq('order_id', orderId)
        .eq('status', 'autorizada')
        .maybeSingle()
      invoice = (authorized as InvoiceCancelRow | null) ?? null
    }
  }

  if (!invoice) {
    return { ok: false, status: 'erro', motivo: 'NFC-e autorizada não encontrada para este pedido.' }
  }

  const status = String(invoice.status ?? '').toLowerCase()
  if (status === 'cancelada') {
    return {
      ok: true,
      invoiceId: String(invoice.id),
      status: 'cancelada',
      motivo: 'NFC-e já cancelada.',
    }
  }
  if (status !== 'autorizada') {
    return {
      ok: false,
      status: status as FiscalInvoiceStatus,
      motivo: `NFC-e com status "${status}" não pode ser cancelada.`,
    }
  }

  const chave = String(invoice.chave_acesso ?? '').replace(/\D/g, '')
  if (chave.length !== 44) {
    return { ok: false, status: 'erro', motivo: 'Nota sem chave de acesso válida.' }
  }

  const pastWindow = !isNfceCancelavel({
    status: 'autorizada',
    emitida_em: invoice.emitida_em,
  })
  const prazoHint = pastWindow
    ? ` Atenção: ${nfceCancelPrazoLabel({ status: 'autorizada', emitida_em: invoice.emitida_em })}`
    : ''

  const cfg = await getStoreFiscalConfig(svc, String(invoice.store_id))
  const guard = assertEmissionReady(cfg)
  if (guard || !cfg) {
    return { ok: false, status: 'erro', motivo: guard || 'Configuração fiscal ausente.' }
  }

  let protocolo = (invoice.protocolo as string | null) || undefined
  // Se o protocolo gravado parece ser só o número da nota (curto), não envia —
  // Brasil NFe localiza automaticamente.
  if (protocolo && protocolo.replace(/\D/g, '').length < 10) {
    protocolo = undefined
  }
  if (!protocolo) {
    try {
      const consulted = await getFiscalService().consultarStatus(chave, cfg.brasilnfeToken!)
      if (consulted.status === 'cancelada') {
        await svc
          .from('fiscal_invoices')
          .update({
            status: 'cancelada',
            cancelada_em: new Date().toISOString(),
            motivo_cancelamento: justificativa,
            protocolo: consulted.protocolo ?? invoice.protocolo,
          })
          .eq('id', invoice.id)
        return {
          ok: true,
          invoiceId: String(invoice.id),
          status: 'cancelada',
          motivo: 'NFC-e já constava cancelada na SEFAZ.',
        }
      }
      if (consulted.protocolo) protocolo = consulted.protocolo
    } catch (err) {
      console.error('[fiscal] consult before cancel failed', invoice.id, err)
    }
  }

  const ambiente = parseFiscalAmbiente(invoice.ambiente ?? cfg.ambiente)
  const result = await getFiscalService().cancelarNfce({
    token: cfg.brasilnfeToken!,
    chaveAcesso: chave,
    protocoloAutorizacao: protocolo,
    justificativa,
    ambiente,
  })

  if (result.success) {
    await svc
      .from('fiscal_invoices')
      .update({
        status: 'cancelada',
        cancelada_em: new Date().toISOString(),
        motivo_cancelamento: justificativa,
        protocolo_cancelamento: result.protocoloCancelamento ?? null,
        raw: result.raw ?? null,
        ...(protocolo ? { protocolo } : {}),
      })
      .eq('id', invoice.id)

    return {
      ok: true,
      invoiceId: String(invoice.id),
      status: 'cancelada',
      protocoloCancelamento: result.protocoloCancelamento,
    }
  }

  // Persist motivo da falha sem mudar status (continua autorizada).
  await svc
    .from('fiscal_invoices')
    .update({
      motivo_rejeicao: result.motivo ?? 'Falha no cancelamento.',
      raw: result.raw ?? null,
    })
    .eq('id', invoice.id)

  return {
    ok: false,
    invoiceId: String(invoice.id),
    status: result.status === 'pendente' ? 'pendente' : 'erro',
    protocoloCancelamento: result.protocoloCancelamento,
    motivo: `${result.motivo || 'Falha ao cancelar a NFC-e.'}${prazoHint}`,
  }
}

export type FiscalAutoCancelResult = {
  attempted: boolean
  skipped: boolean
  ok: boolean
  status?: FiscalInvoiceStatus
  motivo?: string
}

/**
 * Cancela NFC-e após recusa do pedido. Nunca lança: falha fiscal não
 * deve bloquear o cancelamento do pedido.
 */
export async function tryAutoCancelNfceForOrder(
  orderId: string
): Promise<FiscalAutoCancelResult> {
  try {
    const svc = createServiceRoleClient()
    const { data: authorized } = await svc
      .from('fiscal_invoices')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'autorizada')
      .maybeSingle()

    if (!authorized) {
      return { attempted: false, skipped: true, ok: true, motivo: 'Sem NFC-e autorizada.' }
    }

    const result = await cancelarNfce(
      { orderId },
      { justificativa: DEFAULT_CANCEL_JUSTIFICATIVA }
    )

    if (!result.ok && isFiscalNotConfiguredMotivo(result.motivo)) {
      return {
        attempted: false,
        skipped: true,
        ok: false,
        motivo: result.motivo,
      }
    }

    return {
      attempted: true,
      skipped: false,
      ok: result.ok,
      status: result.status,
      motivo: result.motivo,
    }
  } catch (err) {
    console.error('[fiscal] auto-cancel failed', orderId, err)
    return {
      attempted: true,
      skipped: false,
      ok: false,
      status: 'erro',
      motivo:
        err instanceof Error ? err.message : 'Falha inesperada no cancelamento automático.',
    }
  }
}

/**
 * Fluxo Opção A: recebe o .pfx (base64) + senha, repassa ao gateway
 * (AlterarCertificado) e guarda só os METADADOS (CN/validade). O arquivo e a
 * senha nunca são persistidos.
 */
export async function uploadCertificado(params: {
  storeId: string
  base64: string
  senha: string
}): Promise<UploadCertificadoResult> {
  const { storeId, base64, senha } = params
  if (!storeId?.trim()) return { ok: false, motivo: 'Loja inválida.' }
  if (!base64?.trim() || !senha?.trim()) {
    return { ok: false, motivo: 'Arquivo (.pfx) e senha são obrigatórios.' }
  }

  const svc = createServiceRoleClient()
  const cfg = await getStoreFiscalConfig(svc, storeId)
  if (!cfg?.brasilnfeToken) {
    return { ok: false, motivo: 'Token da empresa (loja) na Brasil NFe não configurado.' }
  }

  const gateway = getFiscalService()
  const sent = await gateway.enviarCertificado({ token: cfg.brasilnfeToken, base64, senha })

  const validade = sent.validade ?? null
  const vencido = sent.expirado || (validade ? new Date(validade).getTime() < Date.now() : false)

  // Falha de envio (senha errada/arquivo inválido) → marca como inválido.
  if (!sent.success && !vencido) {
    await svc
      .from('store_fiscal_config')
      .update({ cert_status: 'invalido', cert_updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
    return { ok: false, motivo: sent.motivo || 'Gateway recusou o certificado.' }
  }

  await svc
    .from('store_fiscal_config')
    .update({
      cert_status: vencido ? 'vencido' : 'valido',
      cert_validade: validade,
      cert_updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)

  return {
    ok: !vencido,
    validade: validade ?? undefined,
    motivo: vencido ? 'Certificado vencido.' : undefined,
  }
}

export type CadastrarEmpresaResult = { ok: boolean; motivo?: string }

/**
 * Cadastra a loja como "Empresa" na Brasil NFe (modelo master: a Vyria possui o
 * UserToken). Monta os dados do emitente a partir de `store_fiscal_config`,
 * envia o CSC da NFC-e e guarda o Token retornado em `brasilnfe_token`.
 *
 * Idempotente: se a empresa já existir (CNPJ duplicado), recupera o token via
 * listagem em vez de falhar.
 */
export async function cadastrarEmpresa(storeId: string): Promise<CadastrarEmpresaResult> {
  if (!storeId?.trim()) return { ok: false, motivo: 'Loja inválida.' }

  const svc = createServiceRoleClient()
  const { data: row } = await svc
    .from('store_fiscal_config')
    .select(
      'ambiente, regime_tributario, cnpj, razao_social, nome_fantasia, inscricao_estadual, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_municipio_ibge, endereco_uf, endereco_cep, csc_id, csc_token'
    )
    .eq('store_id', storeId)
    .maybeSingle()
  if (!row) return { ok: false, motivo: 'Loja sem configuração fiscal.' }

  const r = row as Record<string, unknown>
  const str = (v: unknown) => String(v ?? '').trim()
  const cnpj = str(r.cnpj).replace(/\D/g, '')
  const razaoSocial = str(r.razao_social)
  if (!cnpj || !razaoSocial) {
    return {
      ok: false,
      motivo: 'Preencha CNPJ e Razão Social na configuração fiscal antes de cadastrar a empresa.',
    }
  }

  const ambiente = parseFiscalAmbiente(r.ambiente)
  const cscId = str(r.csc_id)
  const cscToken = str(r.csc_token)
  const csc =
    cscId || cscToken
      ? ambiente === 'producao'
        ? { idProducao: cscId || undefined, tokenProducao: cscToken || undefined }
        : { idHomologacao: cscId || undefined, tokenHomologacao: cscToken || undefined }
      : undefined

  const empresaInput: EmpresaInput = {
    cnpj,
    razaoSocial,
    nomeFantasia: str(r.nome_fantasia) || undefined,
    inscricaoEstadual: str(r.inscricao_estadual) || undefined,
    crt: regimeToCrt(str(r.regime_tributario)),
    csc,
    endereco: {
      cep: str(r.endereco_cep) || undefined,
      uf: str(r.endereco_uf) || undefined,
      municipio: str(r.endereco_municipio) || undefined,
      municipioIbge: str(r.endereco_municipio_ibge) || undefined,
      logradouro: str(r.endereco_logradouro) || undefined,
      numero: str(r.endereco_numero) || undefined,
      bairro: str(r.endereco_bairro) || undefined,
    },
  }

  const gateway = getFiscalService()
  const add = await gateway.adicionarEmpresa(empresaInput)
  let token = add.token

  // Empresa já existe (CNPJ duplicado) ou token não veio: recupera pelo CNPJ.
  if (!token) {
    const list = await gateway.listarEmpresas()
    token = list.empresas.find((e) => e.cnpj === cnpj)?.token
  }
  if (!token) {
    return {
      ok: false,
      motivo: add.motivo || 'Não foi possível obter o token da empresa na Brasil NFe.',
    }
  }

  const { error } = await svc
    .from('store_fiscal_config')
    .update({ brasilnfe_token: token, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
  if (error) return { ok: false, motivo: error.message }

  return { ok: true }
}
