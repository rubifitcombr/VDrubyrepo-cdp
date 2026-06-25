import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseFiscalAmbiente,
  parseFiscalCertStatus,
  parseFiscalStatus,
  type FiscalAmbiente,
  type FiscalCertStatus,
  type FiscalInvoiceStatus,
  type FiscalStatus,
} from '@/lib/fiscal'

// Raiz dos serviços da Brasil NFe. Os módulos ficam em sub-rotas:
//   /fiscal/*  -> emissão/consulta de documentos
//   /empresa/* -> cadastro de empresas e certificados (requer UserToken)
const DEFAULT_ROOT_URL = 'https://api.brasilnfe.com.br/services'
const REQUEST_TIMEOUT_MS = 20_000

/** Normaliza a env para a raiz (aceita valores antigos terminados em /fiscal). */
function resolveRootUrl(raw?: string): string {
  const base = (raw || '').trim().replace(/\/+$/, '')
  if (!base) return DEFAULT_ROOT_URL
  return base.replace(/\/(fiscal|empresa)$/, '')
}

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
  certId: string | null
  certStatus: FiscalCertStatus
  certCn: string | null
  certValidade: string | null
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
    certId: (row.cert_id as string | null) ?? null,
    certStatus: parseFiscalCertStatus(row.cert_status),
    certCn: (row.cert_cn as string | null) ?? null,
    certValidade: (row.cert_validade as string | null) ?? null,
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
  /** Identificador do documento no gateway, p/ consulta posterior. */
  nfeId?: string
  raw?: unknown
}

export type FiscalStatusResult = {
  success: boolean
  status: FiscalInvoiceStatus
  chaveAcesso?: string
  protocolo?: string
  nfeUrl?: string
  motivo?: string
  raw?: unknown
}

export type CertificadoInput = {
  /** Token da empresa (loja) na Brasil NFe. */
  token: string
  /** Conteúdo do .pfx em base64 — NUNCA persistido. */
  base64: string
  /** Senha do certificado — NUNCA persistida. */
  senha: string
}

export type CertificadoResult = {
  success: boolean
  certId?: string
  cn?: string
  validade?: string
  motivo?: string
  raw?: unknown
}

export type EmpresaInput = {
  cnpj: string
  razaoSocial: string
  nomeFantasia?: string
  inscricaoEstadual?: string
  crt?: number
  endereco?: {
    cep?: string
    uf?: string
    municipio?: string
    municipioIbge?: string
    logradouro?: string
    numero?: string
    bairro?: string
  }
}

export type EmpresaResult = {
  success: boolean
  /** Token gerado para a empresa (loja) — guardamos em store_fiscal_config. */
  token?: string
  motivo?: string
  raw?: unknown
}

export interface FiscalService {
  emitirNfce(input: NfceEmitInput): Promise<FiscalEmissionResult>
  consultarStatus(nfeId: string, token: string): Promise<FiscalStatusResult>
  enviarCertificado(input: CertificadoInput): Promise<CertificadoResult>
  verificarCertificado(input: CertificadoInput): Promise<CertificadoResult>
  adicionarEmpresa(input: EmpresaInput): Promise<EmpresaResult>
}

/* ------------------------------------------------------------------ */
/* Implementação Brasil NFe                                            */
/* ------------------------------------------------------------------ */

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

function toObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function mapInvoiceStatusFromObj(obj: Record<string, unknown>, httpOk: boolean): FiscalInvoiceStatus {
  const chave = pickString(obj, 'ChaveAcesso', 'chaveAcesso', 'chave')
  const protocolo = pickString(obj, 'Protocolo', 'protocolo', 'nProt')
  if (httpOk && chave && protocolo) return 'autorizada'
  const sit = (pickString(obj, 'Situacao', 'situacao', 'Status', 'status') || '').toLowerCase()
  if (sit.includes('autoriz')) return 'autorizada'
  if (sit.includes('cancel')) return 'cancelada'
  if (sit.includes('rejeit') || sit.includes('denegad')) return 'rejeitada'
  return httpOk ? 'pendente' : 'erro'
}

export class BrasilNfeService implements FiscalService {
  private readonly root: string
  private readonly userToken?: string

  constructor(opts?: { rootUrl?: string; userToken?: string }) {
    this.root = resolveRootUrl(opts?.rootUrl)
    this.userToken = opts?.userToken?.trim() || undefined
  }

  private async request(
    path: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<{ ok: boolean; httpStatus: number; raw: unknown }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(`${this.root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      let raw: unknown = null
      try {
        raw = await res.json()
      } catch {
        raw = await res.text().catch(() => null)
      }
      return { ok: res.ok, httpStatus: res.status, raw }
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'Falha de rede.'
      return { ok: false, httpStatus: 0, raw: { Mensagem: motivo } }
    } finally {
      clearTimeout(timer)
    }
  }

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

    const { ok, httpStatus, raw } = await this.request('/fiscal/EnviarNotaFiscal', payload, {
      Token: input.token,
    })
    const obj = toObject(raw)
    const chaveAcesso = pickString(obj, 'ChaveAcesso', 'chaveAcesso', 'chave')
    const protocolo = pickString(obj, 'Protocolo', 'protocolo', 'nProt')
    const nfeUrl = pickString(obj, 'UrlQrCode', 'QrCodeUrl', 'urlDanfe', 'DanfeUrl', 'nfe_url')
    const xml = pickString(obj, 'Xml', 'xml', 'XmlAssinado')
    const nfeId = pickString(obj, 'Id', 'id', 'NfeId', 'DocumentoId', 'IdDocumento')
    const motivo = pickString(obj, 'Mensagem', 'mensagem', 'Motivo', 'xMotivo', 'erro', 'error')

    if (ok && chaveAcesso && protocolo) {
      return { success: true, status: 'autorizada', chaveAcesso, protocolo, nfeUrl, xml, nfeId, raw }
    }
    if (!ok) {
      return { success: false, status: 'erro', motivo: motivo || `HTTP ${httpStatus}`, raw }
    }
    return { success: false, status: 'rejeitada', motivo: motivo || 'Nota rejeitada pela SEFAZ.', raw }
  }

  async consultarStatus(nfeId: string, token: string): Promise<FiscalStatusResult> {
    if (!token?.trim()) {
      return { success: false, status: 'erro', motivo: 'Token da Brasil NFe ausente.' }
    }
    if (!nfeId?.trim()) {
      return { success: false, status: 'erro', motivo: 'Identificador da nota ausente.' }
    }
    const { ok, httpStatus, raw } = await this.request(
      '/fiscal/ConsultarNotaFiscal',
      { Id: nfeId },
      { Token: token }
    )
    const obj = toObject(raw)
    const status = mapInvoiceStatusFromObj(obj, ok)
    const motivo = pickString(obj, 'Mensagem', 'mensagem', 'Motivo', 'xMotivo', 'erro', 'error')
    return {
      success: ok && status === 'autorizada',
      status,
      chaveAcesso: pickString(obj, 'ChaveAcesso', 'chaveAcesso', 'chave'),
      protocolo: pickString(obj, 'Protocolo', 'protocolo', 'nProt'),
      nfeUrl: pickString(obj, 'UrlQrCode', 'QrCodeUrl', 'urlDanfe', 'DanfeUrl', 'nfe_url'),
      motivo: ok ? undefined : motivo || `HTTP ${httpStatus}`,
      raw,
    }
  }

  async enviarCertificado(input: CertificadoInput): Promise<CertificadoResult> {
    if (!this.userToken) {
      return { success: false, motivo: 'BRASIL_NFE_USER_TOKEN não configurado.' }
    }
    if (!input.token?.trim()) {
      return { success: false, motivo: 'Token da empresa (loja) ausente.' }
    }
    const { ok, httpStatus, raw } = await this.request(
      '/empresa/AlterarCertificado',
      { Base64CertificateFile: input.base64, Senha: input.senha },
      { Token: input.token, UserToken: this.userToken }
    )
    const obj = toObject(raw)
    const motivo = pickString(obj, 'Mensagem', 'mensagem', 'Motivo', 'erro', 'error')
    if (!ok) {
      return { success: false, motivo: motivo || `HTTP ${httpStatus}`, raw }
    }
    return {
      success: true,
      certId: pickString(obj, 'CertId', 'CertificadoId', 'Id'),
      cn: pickString(obj, 'CN', 'Cn', 'cn', 'NomeTitular'),
      validade: pickString(obj, 'Validade', 'validade', 'DataValidade', 'ValidoAte'),
      raw,
    }
  }

  async verificarCertificado(input: CertificadoInput): Promise<CertificadoResult> {
    if (!this.userToken) {
      return { success: false, motivo: 'BRASIL_NFE_USER_TOKEN não configurado.' }
    }
    const { ok, httpStatus, raw } = await this.request(
      '/empresa/VerificarCertificado',
      input.base64 ? { Base64CertificateFile: input.base64, Senha: input.senha } : {},
      { Token: input.token, UserToken: this.userToken }
    )
    const obj = toObject(raw)
    const motivo = pickString(obj, 'Mensagem', 'mensagem', 'Motivo', 'erro', 'error')
    if (!ok) {
      return { success: false, motivo: motivo || `HTTP ${httpStatus}`, raw }
    }
    return {
      success: true,
      cn: pickString(obj, 'CN', 'Cn', 'cn', 'NomeTitular'),
      validade: pickString(obj, 'Validade', 'validade', 'DataValidade', 'ValidoAte'),
      raw,
    }
  }

  async adicionarEmpresa(input: EmpresaInput): Promise<EmpresaResult> {
    if (!this.userToken) {
      return { success: false, motivo: 'BRASIL_NFE_USER_TOKEN não configurado.' }
    }
    if (!input.cnpj?.trim() || !input.razaoSocial?.trim()) {
      return { success: false, motivo: 'CNPJ e Razão Social são obrigatórios.' }
    }
    const payload = {
      Cnpj: input.cnpj.replace(/\D/g, ''),
      RzSocial: input.razaoSocial,
      ...(input.nomeFantasia ? { NmFantasia: input.nomeFantasia } : {}),
      ...(input.inscricaoEstadual ? { Ie: input.inscricaoEstadual } : {}),
      ...(input.crt ? { Crt: input.crt } : {}),
      ...(input.endereco
        ? {
            Endereco: {
              ...(input.endereco.cep ? { Cep: input.endereco.cep.replace(/\D/g, '') } : {}),
              ...(input.endereco.uf ? { Uf: input.endereco.uf } : {}),
              ...(input.endereco.municipio ? { Municipio: input.endereco.municipio } : {}),
              ...(input.endereco.municipioIbge ? { CodMunicipio: input.endereco.municipioIbge } : {}),
              ...(input.endereco.logradouro ? { Logradouro: input.endereco.logradouro } : {}),
              ...(input.endereco.numero ? { Numero: input.endereco.numero } : {}),
              ...(input.endereco.bairro ? { Bairro: input.endereco.bairro } : {}),
            },
          }
        : {}),
    }
    const { ok, httpStatus, raw } = await this.request('/empresa/AdicionarEmpresa', payload, {
      UserToken: this.userToken,
    })
    const obj = toObject(raw)
    const motivo = pickString(obj, 'Mensagem', 'mensagem', 'Motivo', 'erro', 'error')
    if (!ok) {
      return { success: false, motivo: motivo || `HTTP ${httpStatus}`, raw }
    }
    return { success: true, token: pickString(obj, 'Token', 'token'), raw }
  }
}

/** Fábrica do serviço fiscal — troque aqui para usar outro provedor. */
export function getFiscalService(): FiscalService {
  return new BrasilNfeService({
    rootUrl: process.env.BRASIL_NFE_API_URL,
    userToken: process.env.BRASIL_NFE_USER_TOKEN,
  })
}
