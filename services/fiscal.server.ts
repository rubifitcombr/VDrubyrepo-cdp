import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseFiscalAmbiente,
  parseFiscalStatus,
  type FiscalAmbiente,
  type FiscalInvoiceStatus,
  type FiscalStatus,
} from '@/lib/fiscal'

const DEFAULT_BASE_URL = 'https://api.brasilnfe.com.br/services/fiscal'
const REQUEST_TIMEOUT_MS = 20_000

/* ------------------------------------------------------------------ */
/* Configuração fiscal por loja                                        */
/* ------------------------------------------------------------------ */

export type StoreFiscalConfig = {
  storeId: string
  status: FiscalStatus
  ambiente: FiscalAmbiente
  brasilnfeToken: string | null
  cscId: string | null
  cscToken: string | null
  regimeTributario: string | null
  cnpj: string | null
  razaoSocial: string | null
}

function mapFiscalConfig(row: Record<string, unknown>): StoreFiscalConfig {
  return {
    storeId: String(row.store_id ?? ''),
    status: parseFiscalStatus(row.status),
    ambiente: parseFiscalAmbiente(row.ambiente),
    brasilnfeToken: (row.brasilnfe_token as string | null) ?? null,
    cscId: (row.csc_id as string | null) ?? null,
    cscToken: (row.csc_token as string | null) ?? null,
    regimeTributario: (row.regime_tributario as string | null) ?? null,
    cnpj: (row.cnpj as string | null) ?? null,
    razaoSocial: (row.razao_social as string | null) ?? null,
  }
}

export async function getStoreFiscalConfig(
  svc: SupabaseClient,
  storeId: string
): Promise<StoreFiscalConfig | null> {
  const { data, error } = await svc
    .from('store_fiscal_config')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()
  if (error || !data) return null
  return mapFiscalConfig(data as Record<string, unknown>)
}

/* ------------------------------------------------------------------ */
/* Contrato do serviço fiscal (isola o SaaS da API externa)            */
/* ------------------------------------------------------------------ */

export type NfceClienteInput = {
  cpf?: string | null
  nome?: string | null
}

export type NfceProdutoInput = {
  nome: string
  ncm: string
  cfop: string
  quantidade: number
  valorUnitario: number
  unidade?: string
  origem?: string
  cstCsosn?: string
  cest?: string
}

export type NfceEmitInput = {
  token: string
  ambiente: FiscalAmbiente
  naturezaOperacao?: string
  cliente?: NfceClienteInput
  produtos: NfceProdutoInput[]
}

export type FiscalEmissionResult = {
  success: boolean
  status: FiscalInvoiceStatus
  chaveAcesso?: string
  protocolo?: string
  nfeUrl?: string
  xml?: string
  motivo?: string
  raw?: unknown
}

export interface FiscalService {
  emitirNfce(input: NfceEmitInput): Promise<FiscalEmissionResult>
}

/* ------------------------------------------------------------------ */
/* Implementação Brasil NFe                                            */
/* ------------------------------------------------------------------ */

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

export class BrasilNfeService implements FiscalService {
  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  async emitirNfce(input: NfceEmitInput): Promise<FiscalEmissionResult> {
    if (!input.token?.trim()) {
      return { success: false, status: 'erro', motivo: 'Token da Brasil NFe ausente.' }
    }
    if (!input.produtos.length) {
      return { success: false, status: 'erro', motivo: 'Nenhum produto para emitir.' }
    }

    const payload = {
      ModeloDocumento: 65,
      TipoAmbiente: input.ambiente === 'producao' ? '1' : '2',
      NaturezaOperacao: input.naturezaOperacao || 'Venda ao Consumidor',
      ConsumidorFinal: true,
      ...(input.cliente?.cpf
        ? {
            Cliente: {
              CpfCnpj: input.cliente.cpf.replace(/\D/g, ''),
              ...(input.cliente.nome ? { NmCliente: input.cliente.nome } : {}),
            },
          }
        : {}),
      Produtos: input.produtos.map((p) => ({
        NmProduto: p.nome,
        NCM: p.ncm,
        CFOP: Number(p.cfop) || p.cfop,
        Quantidade: p.quantidade,
        ValorUnitario: p.valorUnitario,
        Unidade: p.unidade || 'UN',
        Origem: p.origem || '0',
        ...(p.cstCsosn ? { CstCsosn: p.cstCsosn } : {}),
        ...(p.cest ? { CEST: p.cest } : {}),
      })),
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/EnviarNotaFiscal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Token: input.token,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      const motivo = err instanceof Error ? err.message : 'Falha de rede ao emitir.'
      return { success: false, status: 'erro', motivo }
    }
    clearTimeout(timer)

    let raw: unknown = null
    try {
      raw = await res.json()
    } catch {
      raw = await res.text().catch(() => null)
    }

    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const chaveAcesso = pickString(obj, 'ChaveAcesso', 'chaveAcesso', 'chave')
    const protocolo = pickString(obj, 'Protocolo', 'protocolo', 'nProt')
    const nfeUrl = pickString(obj, 'UrlQrCode', 'QrCodeUrl', 'urlDanfe', 'DanfeUrl', 'nfe_url')
    const xml = pickString(obj, 'Xml', 'xml', 'XmlAssinado')
    const motivo = pickString(obj, 'Mensagem', 'mensagem', 'Motivo', 'xMotivo', 'erro', 'error')

    // Considera autorizada quando a SEFAZ devolve chave + protocolo.
    if (res.ok && chaveAcesso && protocolo) {
      return { success: true, status: 'autorizada', chaveAcesso, protocolo, nfeUrl, xml, raw }
    }
    if (!res.ok) {
      return { success: false, status: 'erro', motivo: motivo || `HTTP ${res.status}`, raw }
    }
    return { success: false, status: 'rejeitada', motivo: motivo || 'Nota rejeitada pela SEFAZ.', raw }
  }
}

/** Fábrica do serviço fiscal — troque aqui para usar outro provedor. */
export function getFiscalService(): FiscalService {
  const base = process.env.BRASIL_NFE_API_URL?.trim() || DEFAULT_BASE_URL
  return new BrasilNfeService(base)
}
