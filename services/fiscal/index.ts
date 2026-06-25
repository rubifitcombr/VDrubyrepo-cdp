import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { isFiscalActive, type FiscalInvoiceStatus } from '@/lib/fiscal'
import {
  getFiscalService,
  getStoreFiscalConfig,
  type FiscalStatusResult,
  type NfceProdutoInput,
  type StoreFiscalConfig,
} from '@/services/fiscal.server'

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
  products: {
    ncm: string | null
    cfop: string | null
    cest: string | null
    unidade: string | null
    origem: string | null
    cst_csosn: string | null
  } | null
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v.replace(',', '.')) || 0
  return 0
}

/** Garante config + add-on ativo + token presentes antes de qualquer emissão. */
function assertEmissionReady(cfg: StoreFiscalConfig | null): string | null {
  if (!cfg) return 'Loja sem configuração fiscal.'
  if (!isFiscalActive(cfg.status)) return 'Módulo fiscal não está ativo para esta loja.'
  if (!cfg.brasilnfeToken) return 'Token da Brasil NFe não configurado.'
  if (cfg.certStatus !== 'valido') return 'Certificado digital ausente ou inválido.'
  return null
}

/**
 * Emite a NFC-e de um pedido. Valida o add-on, monta os itens a partir de
 * `order_items` + dados fiscais do produto, chama o gateway e grava em
 * `fiscal_invoices` (idempotente por pedido: nota já autorizada não reemite).
 */
export async function emitirNfce(orderId: string): Promise<EmitirNfceResult> {
  if (!orderId?.trim()) {
    return { ok: false, status: 'erro', motivo: 'Pedido inválido.' }
  }
  const svc = createServiceRoleClient()

  const { data: order, error: orderErr } = await svc
    .from('orders')
    .select('id, store_id, total, customer_name')
    .eq('id', orderId)
    .maybeSingle()
  if (orderErr || !order) {
    return { ok: false, status: 'erro', motivo: 'Pedido não encontrado.' }
  }
  const storeId = String(order.store_id ?? '')

  // Idempotência: se já existe nota autorizada para o pedido, não reemite.
  const { data: existing } = await svc
    .from('fiscal_invoices')
    .select('id, status, chave_acesso, protocolo, nfe_url')
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
    .select('quantity, unit_price, price, name, products(ncm, cfop, cest, unidade, origem, cst_csosn)')
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
  for (const it of items) {
    const nome = (it.name || it.products?.ncm || 'Item').toString()
    const ncm = it.products?.ncm?.trim() || ''
    const cfop = it.products?.cfop?.trim() || ''
    if (!ncm || !cfop) {
      semFiscal.push(it.name || nome)
      continue
    }
    produtos.push({
      nome,
      ncm,
      cfop,
      quantidade: toNumber(it.quantity) || 1,
      valorUnitario: toNumber(it.unit_price) || toNumber(it.price),
      unidade: it.products?.unidade?.trim() || 'UN',
      origem: it.products?.origem?.trim() || '0',
      cstCsosn: it.products?.cst_csosn?.trim() || undefined,
      cest: it.products?.cest?.trim() || undefined,
    })
  }
  if (semFiscal.length) {
    return {
      ok: false,
      status: 'erro',
      motivo: `Produtos sem NCM/CFOP: ${semFiscal.slice(0, 5).join(', ')}. Preencha os dados fiscais no cardápio.`,
    }
  }

  const result = await getFiscalService().emitirNfce({
    token: cfg.brasilnfeToken!,
    ambiente: cfg.ambiente,
    cliente: order.customer_name ? { nome: String(order.customer_name) } : undefined,
    produtos,
  })

  const { data: inserted } = await svc
    .from('fiscal_invoices')
    .insert({
      store_id: storeId,
      order_id: orderId,
      status: result.status,
      ambiente: cfg.ambiente,
      modelo: 65,
      chave_acesso: result.chaveAcesso ?? null,
      protocolo: result.protocolo ?? null,
      nfe_url: result.nfeUrl ?? null,
      motivo_rejeicao: result.success ? null : result.motivo ?? null,
      valor_total: toNumber(order.total) || null,
      raw: result.raw ?? null,
      emitida_em: result.success ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  return {
    ok: result.success,
    invoiceId: inserted?.id ? String(inserted.id) : undefined,
    status: result.status,
    chaveAcesso: result.chaveAcesso,
    protocolo: result.protocolo,
    nfeUrl: result.nfeUrl,
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
        protocolo: result.protocolo ?? null,
        nfe_url: result.nfeUrl ?? null,
      })
      .eq('id', invoice.id)
  }
  return result
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
  if (!sent.success) {
    await svc
      .from('store_fiscal_config')
      .update({ cert_status: 'invalido', cert_updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
    return { ok: false, motivo: sent.motivo || 'Gateway recusou o certificado.' }
  }

  // Confirma validade/CN no gateway (fonte da verdade dos metadados).
  const verify = await gateway.verificarCertificado({ token: cfg.brasilnfeToken, base64: '', senha: '' })
  const cn = verify.cn ?? sent.cn ?? null
  const validade = verify.validade ?? sent.validade ?? null
  const vencido = validade ? new Date(validade).getTime() < Date.now() : false

  await svc
    .from('store_fiscal_config')
    .update({
      cert_id: sent.certId ?? null,
      cert_status: vencido ? 'vencido' : 'valido',
      cert_cn: cn,
      cert_validade: validade,
      cert_updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)

  return { ok: !vencido, cn: cn ?? undefined, validade: validade ?? undefined, motivo: vencido ? 'Certificado vencido.' : undefined }
}
