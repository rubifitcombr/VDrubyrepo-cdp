import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { BrasilNFe } from 'brasilnfe'
import type {
  EmpresaEnvio,
  NotaFiscalEnvio,
  Pagamento as SdkPagamento,
  Produto as SdkProduto,
} from 'brasilnfe'
import {
  parseFiscalAmbiente,
  parseFiscalCertStatus,
  parseFiscalStatus,
  type FiscalAmbiente,
  type FiscalCertStatus,
  type FiscalInvoiceStatus,
  type FiscalStatus,
} from '@/lib/fiscal'

// URL base dos serviços da Brasil NFe. O SDK já aponta para a oficial; a env só
// é usada para sobrescrever (sandbox interno). O ambiente (produção/homologação)
// é definido pelo campo TipoAmbiente de cada requisição, NÃO pela URL.
const DEFAULT_SDK_URL = 'https://api.brasilnfe.com.br/services/'

/** Normaliza a env para a base esperada pelo SDK (com barra final). */
function resolveSdkUrl(raw?: string): string {
  const base = (raw || '').trim().replace(/\/+$/, '')
  if (!base) return DEFAULT_SDK_URL
  return `${base.replace(/\/(fiscal|empresa)$/, '')}/`
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

/** Converte o regime salvo na config para o código CRT da SEFAZ. */
export function regimeToCrt(regime: string | null | undefined): number {
  switch ((regime || '').trim()) {
    case 'regime_normal':
    case 'normal':
      return 3
    case 'simples_nacional_excesso':
      return 2
    default:
      return 1 // simples_nacional
  }
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
  codigo?: string
  ncm: string
  cfop: string | number
  quantidade: number
  valorUnitario: number
  unidade?: string
  origem?: string | number
  /** CSOSN (Simples) ou CST (Regime Normal) do ICMS. */
  cstCsosn?: string
  cest?: string
}

export type NfcePagamentoInput = {
  /** Código SEFAZ (01 = Dinheiro, 03 = Crédito, 04 = Débito, 17 = PIX…). */
  forma: string
  valor: number
  troco?: number
}

export type NfceEmitInput = {
  token: string
  ambiente: FiscalAmbiente
  /** 1 = Simples Nacional, 2 = Simples (excesso), 3 = Regime Normal. */
  crt?: number
  naturezaOperacao?: string
  cliente?: NfceClienteInput
  produtos: NfceProdutoInput[]
  pagamentos?: NfcePagamentoInput[]
  /** Total da nota; usado para o pagamento padrão quando não há detalhamento. */
  valorTotal?: number
  /** Correlaciona a nota com o pedido (usado na consulta posterior). */
  identificadorInterno?: string
}

export type FiscalEmissionResult = {
  success: boolean
  status: FiscalInvoiceStatus
  chaveAcesso?: string
  protocolo?: string
  nfeUrl?: string
  /** XML autorizado (base64), quando devolvido pelo gateway. */
  xmlBase64?: string
  /** DANFE/cupom em PDF (base64), quando devolvido pelo gateway. */
  danfeBase64?: string
  motivo?: string
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
  cn?: string
  validade?: string
  /** Certificado já vencido (a Brasil NFe sinaliza no retorno). */
  expirado?: boolean
  motivo?: string
  raw?: unknown
}

export type EmpresaInput = {
  cnpj: string
  razaoSocial: string
  nomeFantasia?: string
  inscricaoEstadual?: string
  crt?: number
  /** CSC da NFC-e (por ambiente) — fica na configuração da empresa. */
  csc?: {
    idHomologacao?: string
    tokenHomologacao?: string
    idProducao?: string
    tokenProducao?: string
  }
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

export type EmpresaListItem = { cnpj: string; token: string }

export type EmpresaListResult = {
  success: boolean
  empresas: EmpresaListItem[]
  motivo?: string
}

export interface FiscalService {
  emitirNfce(input: NfceEmitInput): Promise<FiscalEmissionResult>
  consultarStatus(nfeId: string, token: string): Promise<FiscalStatusResult>
  enviarCertificado(input: CertificadoInput): Promise<CertificadoResult>
  verificarCertificado(input: CertificadoInput): Promise<CertificadoResult>
  adicionarEmpresa(input: EmpresaInput): Promise<EmpresaResult>
  /** Lista empresas da conta (UserToken) — usado para recuperar token por CNPJ. */
  listarEmpresas(): Promise<EmpresaListResult>
}

/* ------------------------------------------------------------------ */
/* Implementação Brasil NFe (via SDK oficial)                          */
/* ------------------------------------------------------------------ */

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v.replace(',', '.')) || 0
  return 0
}

/** Formata data no padrão aceito pela Brasil NFe (sem timezone). */
function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Falha de comunicação com a Brasil NFe.'
}

export class BrasilNfeService implements FiscalService {
  private readonly url: string
  private readonly userToken: string

  constructor(opts?: { rootUrl?: string; userToken?: string }) {
    this.url = resolveSdkUrl(opts?.rootUrl)
    this.userToken = opts?.userToken?.trim() || ''
  }

  /** Instancia o SDK com o token da empresa (loja). */
  private client(empresaToken: string): BrasilNFe {
    return new BrasilNFe(empresaToken, this.userToken || undefined, this.url)
  }

  async emitirNfce(input: NfceEmitInput): Promise<FiscalEmissionResult> {
    if (!input.token?.trim()) {
      return { success: false, status: 'erro', motivo: 'Token da empresa (loja) ausente.' }
    }
    if (!input.produtos.length) {
      return { success: false, status: 'erro', motivo: 'Nenhum produto para emitir.' }
    }

    const crt = input.crt ?? 1 // padrão Simples Nacional
    const cstIcmsPadrao = crt === 3 ? '00' : '102' // Normal usa CST; Simples usa CSOSN

    const produtos: SdkProduto[] = input.produtos.map((p) => {
      const quantidade = toNum(p.quantidade) || 1
      const valorUnitario = toNum(p.valorUnitario)
      return {
        CodProdutoServico: p.codigo || undefined,
        NmProduto: p.nome,
        NCM: p.ncm,
        CFOP: Number(p.cfop) || undefined,
        CEST: p.cest || undefined,
        Quantidade: quantidade,
        UnidadeComercial: p.unidade || 'UN',
        ValorUnitario: valorUnitario,
        ValorTotal: Number((quantidade * valorUnitario).toFixed(2)),
        OrigemProduto: Number(p.origem ?? 0) || 0,
        Imposto: {
          ICMS: { CodSituacaoTributaria: p.cstCsosn?.trim() || cstIcmsPadrao, AliquotaICMS: 0 },
          PIS: { CodSituacaoTributaria: '99', Aliquota: 0 },
          COFINS: { CodSituacaoTributaria: '99', Aliquota: 0 },
        },
      }
    })

    const total =
      input.valorTotal != null
        ? toNum(input.valorTotal)
        : produtos.reduce((acc, p) => acc + (p.ValorTotal ?? 0), 0)

    const pagamentos: SdkPagamento[] = (input.pagamentos?.length
      ? input.pagamentos
      : [{ forma: '01', valor: total }]
    ).map((pg) => ({
      IndicadorPagamento: 0,
      FormaPagamento: pg.forma || '01',
      VlPago: toNum(pg.valor),
      ...(pg.troco ? { VlTroco: toNum(pg.troco) } : {}),
    }))

    const cpf = input.cliente?.cpf?.replace(/\D/g, '') || ''
    const payload: NotaFiscalEnvio = {
      TipoAmbiente: input.ambiente === 'producao' ? 1 : 2,
      ModeloDocumento: 65,
      Finalidade: 1,
      NaturezaOperacao: input.naturezaOperacao || 'VENDA AO CONSUMIDOR',
      IndicadorPresenca: 1,
      ConsumidorFinal: true,
      ...(input.identificadorInterno ? { IdentificadorInterno: input.identificadorInterno } : {}),
      ...(cpf
        ? {
            Cliente: {
              CpfCnpj: cpf,
              IndicadorIe: 9,
              ...(input.cliente?.nome ? { NmCliente: input.cliente.nome } : {}),
            },
          }
        : {}),
      Produtos: produtos,
      Pagamentos: pagamentos,
    }

    try {
      const resp = await this.client(input.token).notaFiscal.enviarNotaFiscal(payload, crt)
      const ret = resp.ReturnNF
      const slimRaw = { ReturnNF: ret, Error: resp.Error, Avisos: resp.Avisos }

      if (ret?.Ok) {
        return {
          success: true,
          status: 'autorizada',
          chaveAcesso: ret.ChaveNF || undefined,
          protocolo: ret.Numero != null ? String(ret.Numero) : undefined,
          xmlBase64: resp.Base64Xml || undefined,
          danfeBase64: resp.Base64File || undefined,
          raw: slimRaw,
        }
      }

      const motivo =
        ret?.DsStatusRespostaSefaz ||
        resp.Error ||
        resp.Avisos?.join('; ') ||
        'Nota rejeitada pela SEFAZ.'
      return {
        success: false,
        status: ret?.CodStatusRespostaSefaz ? 'rejeitada' : 'erro',
        chaveAcesso: ret?.ChaveNF || undefined,
        motivo,
        raw: slimRaw,
      }
    } catch (err) {
      return { success: false, status: 'erro', motivo: errorMessage(err) }
    }
  }

  async consultarStatus(nfeId: string, token: string): Promise<FiscalStatusResult> {
    if (!token?.trim()) {
      return { success: false, status: 'erro', motivo: 'Token da empresa (loja) ausente.' }
    }
    if (!nfeId?.trim()) {
      return { success: false, status: 'erro', motivo: 'Identificador da nota ausente.' }
    }
    try {
      const dtFim = new Date()
      const dtInicio = new Date(Date.now() - 92 * 24 * 60 * 60 * 1000)
      const resp = await this.client(token).consultas.obterNotasFiscais({
        TipoDocumentoFiscal: 1, // saídas
        DtInicio: fmtDate(dtInicio),
        DtFim: fmtDate(dtFim),
      })
      const nota = resp.Notas?.find(
        (n) => n.Chave === nfeId || n.IdentificadorInterno === nfeId
      )
      if (!nota) {
        return {
          success: false,
          status: 'pendente',
          motivo: resp.Error || 'Nota não localizada na consulta.',
        }
      }
      const status: FiscalInvoiceStatus =
        nota.Status === 1
          ? 'autorizada'
          : nota.Status === 2
            ? 'cancelada'
            : nota.Status === 3
              ? 'rejeitada'
              : 'pendente'
      return {
        success: status === 'autorizada',
        status,
        chaveAcesso: nota.Chave || undefined,
        protocolo: nota.NumeroProtocolo || undefined,
        raw: nota,
      }
    } catch (err) {
      return { success: false, status: 'erro', motivo: errorMessage(err) }
    }
  }

  async enviarCertificado(input: CertificadoInput): Promise<CertificadoResult> {
    if (!this.userToken) {
      return { success: false, motivo: 'BRASIL_NFE_USER_TOKEN não configurado.' }
    }
    if (!input.token?.trim()) {
      return { success: false, motivo: 'Token da empresa (loja) ausente.' }
    }
    try {
      const resp = await this.client(input.token).empresa.alterarCertificado({
        Base64CertificateFile: input.base64,
        Senha: input.senha,
      })
      if (resp.Error) {
        return { success: false, motivo: resp.Error, raw: resp }
      }
      return {
        success: resp.status !== false && !resp.Expirado,
        validade: resp.DtExpiracao || undefined,
        expirado: Boolean(resp.Expirado),
        motivo: resp.Expirado ? 'Certificado vencido.' : undefined,
        raw: resp,
      }
    } catch (err) {
      return { success: false, motivo: errorMessage(err) }
    }
  }

  async verificarCertificado(input: CertificadoInput): Promise<CertificadoResult> {
    if (!this.userToken) {
      return { success: false, motivo: 'BRASIL_NFE_USER_TOKEN não configurado.' }
    }
    if (!input.token?.trim()) {
      return { success: false, motivo: 'Token da empresa (loja) ausente.' }
    }
    try {
      // Sem base64 → verifica o certificado já vinculado à empresa.
      const resp = await this.client(input.token).empresa.verificarCertificado(
        input.base64 ? { Base64CertificateFile: input.base64, Senha: input.senha } : {}
      )
      if (resp.Error) {
        return { success: false, motivo: resp.Error, raw: resp }
      }
      return {
        success: resp.status !== false && !resp.Expirado,
        validade: resp.DtExpiracao || undefined,
        expirado: Boolean(resp.Expirado),
        raw: resp,
      }
    } catch (err) {
      return { success: false, motivo: errorMessage(err) }
    }
  }

  async adicionarEmpresa(input: EmpresaInput): Promise<EmpresaResult> {
    if (!this.userToken) {
      return { success: false, motivo: 'BRASIL_NFE_USER_TOKEN não configurado.' }
    }
    if (!input.cnpj?.trim() || !input.razaoSocial?.trim()) {
      return { success: false, motivo: 'CNPJ e Razão Social são obrigatórios.' }
    }
    const payload: EmpresaEnvio = {
      CNPJ: input.cnpj.replace(/\D/g, ''),
      RzSocial: input.razaoSocial,
      ...(input.nomeFantasia ? { NmFantasia: input.nomeFantasia } : {}),
      ...(input.inscricaoEstadual ? { IE: input.inscricaoEstadual } : {}),
      ...(input.crt ? { CRT: input.crt } : {}),
      ...(input.csc
        ? {
            Configuracao: {
              NFCe: {
                ...(input.csc.idHomologacao ? { IdCSCHomologacao: input.csc.idHomologacao } : {}),
                ...(input.csc.tokenHomologacao ? { CSCHomologacao: input.csc.tokenHomologacao } : {}),
                ...(input.csc.idProducao ? { IdCSCProducao: input.csc.idProducao } : {}),
                ...(input.csc.tokenProducao ? { CSCProducao: input.csc.tokenProducao } : {}),
              },
            },
          }
        : {}),
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
    try {
      // AdicionarEmpresa usa apenas o UserToken (Token da empresa não é exigido).
      const resp = await new BrasilNFe('', this.userToken, this.url).empresa.adicionarEmpresa(
        payload
      )
      if (resp.Error) {
        return { success: false, motivo: resp.Error, raw: resp }
      }
      return { success: resp.status !== false, token: resp.token || undefined, raw: resp }
    } catch (err) {
      return { success: false, motivo: errorMessage(err) }
    }
  }

  async listarEmpresas(): Promise<EmpresaListResult> {
    if (!this.userToken) {
      return { success: false, empresas: [], motivo: 'BRASIL_NFE_USER_TOKEN não configurado.' }
    }
    try {
      const empresas = await new BrasilNFe('', this.userToken, this.url).empresa.buscarTodasEmpresas()
      const items: EmpresaListItem[] = (empresas ?? [])
        .map((e) => ({
          cnpj: (e.CNPJ || '').replace(/\D/g, ''),
          token: e.Token || '',
        }))
        .filter((e) => e.cnpj && e.token)
      return { success: true, empresas: items }
    } catch (err) {
      return { success: false, empresas: [], motivo: errorMessage(err) }
    }
  }
}

/** Fábrica do serviço fiscal — troque aqui para usar outro provedor. */
export function getFiscalService(): FiscalService {
  return new BrasilNfeService({
    rootUrl: process.env.BRASIL_NFE_API_URL,
    userToken: process.env.BRASIL_NFE_USER_TOKEN,
  })
}
