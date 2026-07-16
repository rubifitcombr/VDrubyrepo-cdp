/** Tipos e rótulos da integração fiscal (NFC-e). Seguro para client e server. */

export type FiscalStatus =
  | 'nao_configurado'
  | 'aguardando_configuracao'
  | 'pending_review'
  | 'ativo'
  | 'bloqueado'

export type FiscalAmbiente = 'homologacao' | 'producao'

export type FiscalInvoiceStatus =
  | 'pendente'
  | 'autorizada'
  | 'rejeitada'
  | 'cancelada'
  | 'erro'

export type FiscalCertStatus = 'nao_enviado' | 'valido' | 'vencido' | 'invalido'

export const FISCAL_STATUS_LABEL: Record<FiscalStatus, string> = {
  nao_configurado: 'Não configurado',
  aguardando_configuracao: 'Aguardando configuração',
  pending_review: 'Pronto para aprovação',
  ativo: 'Ativo',
  bloqueado: 'Bloqueado',
}

export const FISCAL_INVOICE_STATUS_LABEL: Record<FiscalInvoiceStatus, string> = {
  pendente: 'Pendente / Contingência',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  erro: 'Erro',
}

/** Tom visual do status da nota (sinalizador). */
export type FiscalInvoiceTone = 'green' | 'red' | 'amber' | 'slate'

export function parseFiscalInvoiceStatus(raw: unknown): FiscalInvoiceStatus {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (
    v === 'autorizada' ||
    v === 'rejeitada' ||
    v === 'cancelada' ||
    v === 'pendente' ||
    v === 'erro'
  ) {
    return v
  }
  return 'erro'
}

export function fiscalInvoiceTone(status: FiscalInvoiceStatus): FiscalInvoiceTone {
  if (status === 'autorizada') return 'green'
  if (status === 'rejeitada' || status === 'erro') return 'red'
  if (status === 'pendente') return 'amber'
  return 'slate'
}

/**
 * Mensagem legível da SEFAZ / gateway a partir dos campos da nota.
 * Preferência: motivo gravado → DsStatusRespostaSefaz no raw → fallback por status.
 */
export function fiscalInvoiceSefazMessage(row: {
  status?: unknown
  motivo_rejeicao?: string | null
  motivo_cancelamento?: string | null
  raw?: unknown
}): string {
  const status = parseFiscalInvoiceStatus(row.status)
  const motivoRej = String(row.motivo_rejeicao ?? '').trim()
  const motivoCanc = String(row.motivo_cancelamento ?? '').trim()

  if (status === 'cancelada' && motivoCanc) return motivoCanc
  if ((status === 'rejeitada' || status === 'erro' || status === 'pendente') && motivoRej) {
    return motivoRej
  }

  const fromRaw = extractDsStatusFromRaw(row.raw)
  if (fromRaw) return fromRaw

  if (status === 'autorizada') return 'Autorizado o uso da NFC-e.'
  if (status === 'cancelada') return 'NFC-e cancelada.'
  if (status === 'pendente') {
    return 'Aguardando retorno da SEFAZ (em processamento ou contingência).'
  }
  if (status === 'rejeitada') return 'Rejeição: sem detalhe da SEFAZ.'
  return 'Falha na emissão — sem mensagem da SEFAZ.'
}

function extractDsStatusFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const returnNf = r.ReturnNF
  if (returnNf && typeof returnNf === 'object') {
    const ds = String((returnNf as Record<string, unknown>).DsStatusRespostaSefaz ?? '').trim()
    if (ds) return ds
  }
  const dsTop = String(r.DsStatusRespostaSefaz ?? r.DsMotivo ?? '').trim()
  return dsTop || null
}

export const FISCAL_CERT_STATUS_LABEL: Record<FiscalCertStatus, string> = {
  nao_enviado: 'Certificado não enviado',
  valido: 'Certificado válido',
  vencido: 'Certificado vencido',
  invalido: 'Certificado inválido',
}

export function parseFiscalStatus(raw: unknown): FiscalStatus {
  const v = String(raw ?? '').trim().toLowerCase()
  if (
    v === 'aguardando_configuracao' ||
    v === 'pending_review' ||
    v === 'ativo' ||
    v === 'bloqueado'
  ) {
    return v
  }
  return 'nao_configurado'
}

export function parseFiscalAmbiente(raw: unknown): FiscalAmbiente {
  return String(raw ?? '').trim().toLowerCase() === 'producao'
    ? 'producao'
    : 'homologacao'
}

export function parseFiscalCertStatus(raw: unknown): FiscalCertStatus {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'valido' || v === 'vencido' || v === 'invalido') return v
  return 'nao_enviado'
}

/** O lojista só pode emitir NFC-e quando o add-on está ativo. */
export function isFiscalActive(status: unknown): boolean {
  return parseFiscalStatus(status) === 'ativo'
}

/** Lojista pode configurar emitente, certificado e produtos durante o onboarding. */
export function canAccessFiscalSettings(status: unknown): boolean {
  const s = parseFiscalStatus(status)
  return s === 'ativo' || s === 'pending_review' || s === 'aguardando_configuracao'
}

/** CFOPs aceitos pela NFC-e (saída a consumidor final) — Brasil NFe. */
export const NFCE_CFOPS_VALIDOS = [
  '5101',
  '5102',
  '5103',
  '5104',
  '5115',
  '5405',
  '5656',
  '5667',
  '5933',
  '6108',
  '6109',
  '6110',
] as const

const NFCE_CFOP_SET = new Set<string>(NFCE_CFOPS_VALIDOS)

export function isNfceCfopValido(cfop: unknown): boolean {
  const c = String(cfop ?? '').replace(/\D/g, '')
  return NFCE_CFOP_SET.has(c)
}

/** Mapeia meio de pagamento da loja → código SEFAZ da NFC-e. */
export function paymentMethodToNfceForma(method: unknown): string {
  const t = String(method ?? '')
    .trim()
    .toLowerCase()
  if (t === 'pix') return '17'
  if (t === 'card_debit' || t === 'debit' || t === 'debito') return '04'
  if (t === 'card_credit' || t === 'credit' || t === 'credito' || t === 'card') return '03'
  return '01'
}

/**
 * Indicador de presença NFC-e a partir do canal/endereço/frete.
 * 1 = presencial · 4 = entrega a domicílio · 9 = não presencial outros
 */
export function indicadorPresencaForOrder(opts: {
  source?: unknown
  deliveryAddress?: unknown
  deliveryFee?: unknown
}): number {
  const src = String(opts.source ?? '')
    .trim()
    .toLowerCase()
  const addr = String(opts.deliveryAddress ?? '').trim()
  const fee = Number(String(opts.deliveryFee ?? '').replace(',', '.')) || 0
  if (fee > 0 || addr.length > 0) return 4
  if (src === 'pdv' || src === 'waiter' || src === 'autoatendimento' || src === 'garcom') {
    return 1
  }
  // Pedido web sem frete/endereço → tipicamente retirada (presencial no balcão).
  if (src === 'web' || src === 'site' || src === 'online') return 1
  return 1
}

/** Dias até o vencimento do certificado (negativo se já venceu). */
export function fiscalCertDaysRemaining(
  validade: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!validade?.trim()) return null
  const t = new Date(validade).getTime()
  if (!Number.isFinite(t)) return null
  return Math.ceil((t - now.getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Prazo típico de cancelamento de NFC-e após autorização (minutos).
 * A SEFAZ/UF pode rejeitar antes ou depois; usamos como aviso preventivo.
 */
export const NFCE_CANCEL_WINDOW_MINUTES = 30

export const NFCE_CANCEL_JUSTIFICATIVA_MIN = 15
export const NFCE_CANCEL_JUSTIFICATIVA_MAX = 1000

export type NfceCancelavelInvoice = {
  status?: string | null
  emitida_em?: string | null
  emitidaEm?: string | null
}

/** Minutos restantes no prazo de cancelamento (0 se expirado / sem data). */
export function nfceCancelMinutesRemaining(
  invoice: NfceCancelavelInvoice,
  now: Date = new Date()
): number {
  const raw = invoice.emitida_em ?? invoice.emitidaEm
  if (!raw) return 0
  const emitted = new Date(raw).getTime()
  if (!Number.isFinite(emitted)) return 0
  const deadline = emitted + NFCE_CANCEL_WINDOW_MINUTES * 60_000
  return Math.max(0, Math.ceil((deadline - now.getTime()) / 60_000))
}

/** Nota autorizada ainda dentro da janela típica de cancelamento. */
export function isNfceCancelavel(
  invoice: NfceCancelavelInvoice,
  now: Date = new Date()
): boolean {
  const status = String(invoice.status ?? '')
    .trim()
    .toLowerCase()
  if (status !== 'autorizada') return false
  return nfceCancelMinutesRemaining(invoice, now) > 0
}

export function nfceCancelPrazoLabel(
  invoice: NfceCancelavelInvoice,
  now: Date = new Date()
): string {
  const mins = nfceCancelMinutesRemaining(invoice, now)
  if (mins <= 0) {
    return `Prazo típico de ${NFCE_CANCEL_WINDOW_MINUTES} min expirado — a SEFAZ pode rejeitar.`
  }
  if (mins === 1) return 'Cerca de 1 min restante para cancelar.'
  return `Cerca de ${mins} min restantes para cancelar.`
}
