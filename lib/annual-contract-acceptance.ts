import { createHash } from 'crypto'
import type { BrDocumentType } from '@/lib/br-document'
import { formatCnpj, formatCpf } from '@/lib/br-document'
import { buildIdentificacaoPartesClause } from '@/lib/annual-contract-identificacao'
import {
  resolveVyriaContratadaCnpjLabel,
  resolveVyriaContratadaRazaoSocial,
} from '@/lib/vyria-legal-constants'
import {
  ANNUAL_CONTRACT_DISCOUNT_PCT,
  EARLY_TERMINATION_PENALTY_PCT,
  formatContractMonthlyLabel,
  isAnnualContractActive,
  parseBillingCycle,
  planContractMonthlyAmountBrl,
  readStoreContract,
  type StoreContractSnapshot,
} from '@/lib/contract-pricing'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { operationModeLabel } from '@/lib/merchant-operation-mode'
import type { Plan } from '@/lib/plan'
import { planShortLabel } from '@/lib/plan'

export type VyriaLegalEntity = {
  razaoSocial: string
  cnpj: string
  cnpjLabel: string
  emailJuridico: string
  foroComarca: string
  termosUrl: string
}

/** Versão actual dos termos do contrato anual Vyria Delivery. */
export const ANNUAL_CONTRACT_TERMS_VERSION = '2026-07'

export type AnnualContractDocument = {
  titulo: string
  lojaNome: string
  planoLabel: string
  operationModeLabel: string
  mensalidadeLabel: string
  descontoPct: number
  contratoInicioLabel: string
  contratoFimLabel: string
  clausulas: string[]
  termosVersao: string
  vyriaRazaoSocial: string
  vyriaCnpjLabel: string
  termosUrl: string
  foroComarca: string
}

export type AnnualContractLegalRecord = {
  versao: string
  titulo: string
  contratada: {
    razaoSocial: string
    cnpj: string
    emailJuridico: string
  }
  contratante: {
    lojaNome: string
    documentoTipo: BrDocumentType
    documentoNumero: string
    representanteNome: string
    representanteCargo: string
  }
  comercial: {
    plano: string
    operationMode: string
    mensalidadeBrl: number
    mensalidadeLabel: string
    descontoPct: number
    contratoInicio: string
    contratoFim: string
    multaPct: number
    compromissoMeses: number
  }
  clausulas: string[]
  termosUrl: string
  foroComarca: string
}

export function readContractAcceptance(store: Record<string, unknown> | null | undefined): {
  aceiteEm: string | null
  assinaturaNome: string | null
  termosVersao: string | null
  documentoHash: string | null
  pdfPath: string | null
} {
  const aceiteEm =
    typeof store?.contrato_aceite_em === 'string' && store.contrato_aceite_em.trim()
      ? store.contrato_aceite_em.trim()
      : null
  const assinaturaNome =
    typeof store?.contrato_assinatura_nome === 'string' && store.contrato_assinatura_nome.trim()
      ? store.contrato_assinatura_nome.trim()
      : null
  const termosVersao =
    typeof store?.contrato_termos_versao === 'string' && store.contrato_termos_versao.trim()
      ? store.contrato_termos_versao.trim()
      : null
  const documentoHash =
    typeof store?.contrato_documento_hash === 'string' && store.contrato_documento_hash.trim()
      ? store.contrato_documento_hash.trim()
      : null
  const pdfPath =
    typeof store?.contrato_pdf_path === 'string' && store.contrato_pdf_path.trim()
      ? store.contrato_pdf_path.trim()
      : null
  return { aceiteEm, assinaturaNome, termosVersao, documentoHash, pdfPath }
}

export function requiresAnnualContractAcceptance(
  store: Record<string, unknown> | null | undefined
): boolean {
  if (!store) return false
  const contract = readStoreContract(store)
  if (contract.billingCycle !== 'annual') return false
  const { aceiteEm, termosVersao, documentoHash } = readContractAcceptance(store)
  if (!aceiteEm || !documentoHash) return true
  return termosVersao !== ANNUAL_CONTRACT_TERMS_VERSION
}

export function clearAnnualContractAcceptancePatch(): Record<string, unknown> {
  return {
    contrato_aceite_em: null,
    contrato_assinatura_nome: null,
    contrato_assinatura_png: null,
    contrato_termos_versao: null,
    contrato_aceite_por: null,
    contrato_documento_tipo: null,
    contrato_documento_numero: null,
    contrato_representante_cargo: null,
    contrato_documento_hash: null,
    contrato_pdf_path: null,
    contrato_aceite_ip: null,
    contrato_aceite_user_agent: null,
    contrato_aceite_email: null,
  }
}

function formatDateBr(ymd: string): string {
  const d = new Date(ymd.includes('T') ? ymd : `${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('pt-BR')
}

export function buildAnnualContractLegalRecord(input: {
  storeName: string
  plan: Plan
  operationMode: MerchantOperationMode | null
  contract: StoreContractSnapshot
  vyria: VyriaLegalEntity
  signatario: {
    nome: string
    documentoTipo: BrDocumentType
    documentoNumero: string
    cargo: string
  }
}): AnnualContractLegalRecord {
  const mensal =
    input.contract.contratoMensalBrl ??
    planContractMonthlyAmountBrl(input.plan, input.operationMode)
  const modo =
    input.operationMode != null
      ? operationModeLabel(input.operationMode)
      : 'Conforme modelo da loja'

  const clausulas = [
    buildIdentificacaoPartesClause({
      vyriaRazaoSocial: input.vyria.razaoSocial,
      vyriaCnpjLabel: input.vyria.cnpjLabel,
      storeName: input.storeName,
      signatario: input.signatario,
    }),
    `OBJETO. Prestação de serviços de software SaaS (Vyria Delivery) no plano ${planShortLabel(input.plan)}, modelo de operação ${modo}, mediante assinatura mensal com desconto por compromisso anual.`,
    `VIGÊNCIA E PERMANÊNCIA MÍNIMA. Compromisso de permanência de 12 (doze) meses de calendário, de ${input.contract.contratoInicioEm ? formatDateBr(input.contract.contratoInicioEm) : '—'} a ${input.contract.contratoFimEm ? formatDateBr(input.contract.contratoFimEm) : '—'}. A cobrança é mensal durante a vigência.`,
    `PREÇO. Mensalidade de ${formatContractMonthlyLabel(mensal)} (${input.contract.contratoDescontoPct || ANNUAL_CONTRACT_DISCOUNT_PCT}% de desconto face à tabela vigente), valor travado neste contrato.`,
    `RESCISÃO ANTECIPADA. Cancelamento antes do termo implica multa de ${EARLY_TERMINATION_PENALTY_PCT}% sobre o valor das mensalidades restantes até o fim do compromisso, calculado em meses de calendário, sem prejuízo de cobrança judicial e atualização monetária.`,
    `TERMOS DE USO E POLÍTICAS. O Contratante declara ter lido e aceito os Termos de Uso em ${input.vyria.termosUrl}, bem como as políticas de privacidade (LGPD) e regras operacionais da plataforma.`,
    `ASSINATURA ELETRÔNICA. As partes reconhecem validade da assinatura eletrônica simples (Lei 14.063/2020) e manifestação de vontade por meio do painel Vyria, incluindo registo de IP, data/hora, e-mail e hash de integridade do documento.`,
    `REPRESENTAÇÃO LEGAL. O signatário declara possuir poderes para vincular o Contratante e responsabiliza-se pela veracidade dos dados informados (nome, documento e cargo).`,
    `COMUNICAÇÕES. Notificações relativas a este contrato poderão ser enviadas aos e-mails cadastrados e ao endereço eletrônico jurídico da Vyria: ${input.vyria.emailJuridico}.`,
    `FORO. Fica eleito o foro da ${input.vyria.foroComarca}, com renúncia a qualquer outro, para dirimir controvérsias oriundas deste contrato.`,
  ]

  return {
    versao: ANNUAL_CONTRACT_TERMS_VERSION,
    titulo: 'Contrato de Prestação de Serviços — Plano Anual Vyria Delivery',
    contratada: {
      razaoSocial: input.vyria.razaoSocial,
      cnpj: input.vyria.cnpj,
      emailJuridico: input.vyria.emailJuridico,
    },
    contratante: {
      lojaNome: input.storeName,
      documentoTipo: input.signatario.documentoTipo,
      documentoNumero: input.signatario.documentoNumero,
      representanteNome: input.signatario.nome,
      representanteCargo: input.signatario.cargo,
    },
    comercial: {
      plano: planShortLabel(input.plan),
      operationMode: modo,
      mensalidadeBrl: mensal,
      mensalidadeLabel: formatContractMonthlyLabel(mensal),
      descontoPct: input.contract.contratoDescontoPct || ANNUAL_CONTRACT_DISCOUNT_PCT,
      contratoInicio: input.contract.contratoInicioEm || '',
      contratoFim: input.contract.contratoFimEm || '',
      multaPct: EARLY_TERMINATION_PENALTY_PCT,
      compromissoMeses: 12,
    },
    clausulas,
    termosUrl: input.vyria.termosUrl,
    foroComarca: input.vyria.foroComarca,
  }
}

export function hashAnnualContractLegalRecord(record: AnnualContractLegalRecord): string {
  const canonical = JSON.stringify(record)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function buildAnnualContractDocument(
  record: AnnualContractLegalRecord
): AnnualContractDocument {
  return {
    titulo: record.titulo,
    lojaNome: record.contratante.lojaNome,
    planoLabel: record.comercial.plano,
    operationModeLabel: record.comercial.operationMode,
    mensalidadeLabel: record.comercial.mensalidadeLabel,
    descontoPct: record.comercial.descontoPct,
    contratoInicioLabel: record.comercial.contratoInicio
      ? formatDateBr(record.comercial.contratoInicio)
      : '—',
    contratoFimLabel: record.comercial.contratoFim
      ? formatDateBr(record.comercial.contratoFim)
      : '—',
    clausulas: record.clausulas,
    termosVersao: record.versao,
    vyriaRazaoSocial: resolveVyriaContratadaRazaoSocial(record.contratada.razaoSocial),
    vyriaCnpjLabel: resolveVyriaContratadaCnpjLabel(null, record.contratada.cnpj),
    termosUrl: record.termosUrl,
    foroComarca: record.foroComarca,
  }
}

export function contractAcceptanceFromStore(
  store: Record<string, unknown>,
  storeName: string,
  plan: Plan,
  operationMode: MerchantOperationMode | null,
  vyria: VyriaLegalEntity,
  signatarioPreview?: {
    nome: string
    documentoTipo: BrDocumentType
    documentoNumero: string
    cargo: string
  }
): {
  pending: boolean
  document: AnnualContractDocument
  legalRecord: AnnualContractLegalRecord
} {
  const contract = readStoreContract(store)
  const pending = requiresAnnualContractAcceptance(store)
  const legalRecord = buildAnnualContractLegalRecord({
    storeName,
    plan,
    operationMode,
    contract,
    vyria,
    signatario: signatarioPreview ?? {
      nome: '',
      documentoTipo: 'cnpj',
      documentoNumero: '',
      cargo: '',
    },
  })
  const document = buildAnnualContractDocument(legalRecord)
  return { pending, document, legalRecord }
}

export function isAnnualContractGateExemptPath(pathname: string): boolean {
  const p = pathname.split('?')[0] || '/'
  const n = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
  if (n === '/dashboard/contrato' || n.startsWith('/dashboard/contrato/')) return true
  if (n.startsWith('/api/contrato/')) return true
  if (n === '/logout' || n.startsWith('/logout/')) return true
  if (n === '/acesso-suspenso' || n.startsWith('/acesso-suspenso/')) return true
  return false
}

/** APIs do lojista bloqueadas enquanto o contrato anual estiver pendente. */
export function isMerchantApiContractGatePath(pathname: string): boolean {
  const p = pathname.split('?')[0] || '/'
  const n = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
  if (!n.startsWith('/api/')) return false
  if (n.startsWith('/api/contrato/')) return false
  if (n.startsWith('/api/admin/')) return false
  if (n.startsWith('/api/public/')) return false
  if (n.startsWith('/api/webhooks/')) return false
  if (n.startsWith('/api/cron/')) return false
  if (n.startsWith('/api/auth/')) return false
  if (n.startsWith('/api/impersonate/')) return false
  return true
}

export function storeHasAnnualBillingCycle(store: Record<string, unknown>): boolean {
  return parseBillingCycle(store.billing_cycle) === 'annual'
}
