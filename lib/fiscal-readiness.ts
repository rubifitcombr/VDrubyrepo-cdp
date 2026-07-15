/** Checklist de prontidão fiscal — lógica pura, segura para client e server. */

import type { FiscalCertStatus, FiscalStatus } from '@/lib/fiscal'

export type FiscalChecklistItemId =
  | 'sefaz_credenciado'
  | 'cnpj'
  | 'inscricao_estadual'
  | 'codigo_ibge'
  | 'regime_tributario'
  | 'endereco_completo'
  | 'certificado_enviado'
  | 'certificado_valido'
  | 'csc_id'
  | 'csc_token'
  | 'produtos_ncm'
  | 'produtos_cfop'
  | 'produtos_cst'
  | 'brasilnfe_sincronizada'
  | 'pronto_emissao'

export type FiscalChecklistItem = {
  id: FiscalChecklistItemId
  label: string
  ok: boolean
  hint?: string
}

export type FiscalReadinessInput = {
  sefazCredenciado: boolean
  cnpj: string | null
  inscricaoEstadual: string | null
  enderecoMunicipioIbge: string | null
  regimeTributario: string | null
  enderecoLogradouro: string | null
  enderecoNumero: string | null
  enderecoBairro: string | null
  enderecoMunicipio: string | null
  enderecoUf: string | null
  enderecoCep: string | null
  certStatus: FiscalCertStatus
  cscId: string | null
  cscToken: string | null
  brasilnfeSincronizada: boolean
  products: Array<{ name: string; ncm: string | null; cfop: string | null; cst_csosn: string | null }>
}

export type FiscalReadinessResult = {
  items: FiscalChecklistItem[]
  ready: boolean
  pendingCount: number
  productIssues: string[]
}

function digits(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '')
}

function str(v: string | null | undefined): string {
  return String(v ?? '').trim()
}

/** Avalia o checklist fiscal a partir dos dados da loja. */
export function evaluateFiscalReadiness(input: FiscalReadinessInput): FiscalReadinessResult {
  const cnpjOk = digits(input.cnpj).length === 14
  const ieOk = str(input.inscricaoEstadual).length > 0
  const ibgeOk = digits(input.enderecoMunicipioIbge).length === 7
  const regimeOk = str(input.regimeTributario).length > 0
  const enderecoOk =
    str(input.enderecoLogradouro).length > 0 &&
    str(input.enderecoNumero).length > 0 &&
    str(input.enderecoBairro).length > 0 &&
    str(input.enderecoMunicipio).length > 0 &&
    str(input.enderecoUf).length === 2 &&
    digits(input.enderecoCep).length === 8 &&
    ibgeOk

  const certEnviado = input.certStatus !== 'nao_enviado'
  const certValido = input.certStatus === 'valido'
  const cscIdOk = str(input.cscId).length > 0
  const cscTokenOk = str(input.cscToken).length > 0

  const productIssues: string[] = []
  if (input.products.length === 0) {
    productIssues.push('Cadastre ao menos um produto no cardápio.')
  }
  const semNcm = input.products.filter((p) => !str(p.ncm))
  const semCfop = input.products.filter((p) => !str(p.cfop))
  const semCst = input.products.filter((p) => !str(p.cst_csosn))
  if (semNcm.length) {
    productIssues.push(
      `${semNcm.length} produto(s) sem NCM: ${semNcm.slice(0, 3).map((p) => p.name).join(', ')}${semNcm.length > 3 ? '…' : ''}`
    )
  }
  if (semCfop.length) {
    productIssues.push(
      `${semCfop.length} produto(s) sem CFOP: ${semCfop.slice(0, 3).map((p) => p.name).join(', ')}${semCfop.length > 3 ? '…' : ''}`
    )
  }
  if (semCst.length) {
    productIssues.push(
      `${semCst.length} produto(s) sem CST/CSOSN: ${semCst.slice(0, 3).map((p) => p.name).join(', ')}${semCst.length > 3 ? '…' : ''}`
    )
  }

  const produtosNcmOk = input.products.length > 0 && semNcm.length === 0
  const produtosCfopOk = input.products.length > 0 && semCfop.length === 0
  const produtosCstOk = input.products.length > 0 && semCst.length === 0

  const coreItems: FiscalChecklistItem[] = [
    {
      id: 'sefaz_credenciado',
      label: 'Credenciamento NFC-e na SEFAZ confirmado',
      ok: input.sefazCredenciado,
      hint: 'Obtenha credenciamento, CSC ID e CSC Token no portal da SEFAZ do seu estado.',
    },
    { id: 'cnpj', label: 'CNPJ preenchido', ok: cnpjOk, hint: 'Informe o CNPJ do emitente (14 dígitos).' },
    {
      id: 'inscricao_estadual',
      label: 'Inscrição Estadual',
      ok: ieOk,
      hint: 'Preencha a IE do estabelecimento.',
    },
    {
      id: 'codigo_ibge',
      label: 'Código IBGE do município',
      ok: ibgeOk,
      hint: 'Código de 7 dígitos do município (ex.: 5208707).',
    },
    {
      id: 'regime_tributario',
      label: 'Regime tributário',
      ok: regimeOk,
      hint: 'Selecione Simples Nacional ou Regime Normal.',
    },
    {
      id: 'endereco_completo',
      label: 'Endereço completo do emitente',
      ok: enderecoOk,
      hint: 'Logradouro, número, bairro, município, UF, CEP e IBGE.',
    },
    {
      id: 'certificado_enviado',
      label: 'Certificado A1 enviado',
      ok: certEnviado,
      hint: 'Envie o arquivo .pfx/.p12 e a senha.',
    },
    {
      id: 'certificado_valido',
      label: 'Certificado válido',
      ok: certValido,
      hint:
        input.certStatus === 'vencido'
          ? 'Certificado vencido — renove e reenvie.'
          : input.certStatus === 'invalido'
            ? 'Certificado recusado — verifique arquivo e senha.'
            : 'O certificado precisa estar válido na Brasil NFe.',
    },
    { id: 'csc_id', label: 'CSC ID', ok: cscIdOk, hint: 'Informe o ID do CSC obtido na SEFAZ.' },
    {
      id: 'csc_token',
      label: 'CSC Token',
      ok: cscTokenOk,
      hint: 'Informe o token CSC obtido na SEFAZ.',
    },
    {
      id: 'produtos_ncm',
      label: 'Produtos com NCM',
      ok: produtosNcmOk,
      hint: productIssues.find((m) => m.includes('NCM')) ?? 'Todos os produtos precisam de NCM.',
    },
    {
      id: 'produtos_cfop',
      label: 'Produtos com CFOP',
      ok: produtosCfopOk,
      hint: productIssues.find((m) => m.includes('CFOP')) ?? 'Todos os produtos precisam de CFOP.',
    },
    {
      id: 'produtos_cst',
      label: 'Produtos com CST/CSOSN',
      ok: produtosCstOk,
      hint: productIssues.find((m) => m.includes('CST')) ?? 'Todos os produtos precisam de CST/CSOSN.',
    },
    {
      id: 'brasilnfe_sincronizada',
      label: 'Brasil NFe sincronizada',
      ok: input.brasilnfeSincronizada,
      hint: 'Clique em "Sincronizar com Brasil NFe" após preencher os dados da empresa.',
    },
  ]

  const ready = coreItems.every((i) => i.ok)
  const items: FiscalChecklistItem[] = [
    ...coreItems,
    {
      id: 'pronto_emissao',
      label: 'Pronto para emissão',
      ok: ready,
      hint: ready ? undefined : 'Conclua todos os itens acima.',
    },
  ]

  return {
    items,
    ready,
    pendingCount: coreItems.filter((i) => !i.ok).length,
    productIssues,
  }
}

/** Rótulo amigável do status fiscal considerando prontidão do checklist. */
export function getFiscalDisplayLabel(status: FiscalStatus, ready: boolean): string {
  if (status === 'ativo') return 'Ativo'
  if (status === 'bloqueado') return 'Bloqueado'
  if (status === 'pending_review') return 'Pronto para aprovação'
  if (status === 'aguardando_configuracao') {
    return ready ? 'Pronto para solicitar aprovação' : 'Aguardando configuração'
  }
  return 'Não configurado'
}
