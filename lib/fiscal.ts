/** Tipos e rótulos da integração fiscal (NFC-e). Seguro para client e server. */

export type FiscalStatus =
  | 'nao_configurado'
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
  pending_review: 'Aguardando aprovação',
  ativo: 'Ativo',
  bloqueado: 'Bloqueado',
}

export const FISCAL_INVOICE_STATUS_LABEL: Record<FiscalInvoiceStatus, string> = {
  pendente: 'Pendente',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  erro: 'Erro',
}

export const FISCAL_CERT_STATUS_LABEL: Record<FiscalCertStatus, string> = {
  nao_enviado: 'Certificado não enviado',
  valido: 'Certificado válido',
  vencido: 'Certificado vencido',
  invalido: 'Certificado inválido',
}

export function parseFiscalStatus(raw: unknown): FiscalStatus {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'pending_review' || v === 'ativo' || v === 'bloqueado') return v
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
