import type { BrDocumentType } from '@/lib/br-document'
import {
  brDocumentTypeLabel,
  digitsOnly,
  formatCnpj,
  formatCpf,
} from '@/lib/br-document'
import {
  resolveVyriaContratadaCnpjLabel,
  resolveVyriaContratadaRazaoSocial,
} from '@/lib/vyria-legal-constants'

function formatSignatarioDocumentoLabel(
  tipo: BrDocumentType,
  numero: string
): string | null {
  const digits = digitsOnly(numero)
  const expected = tipo === 'cpf' ? 11 : 14
  if (digits.length !== expected) return null
  return tipo === 'cpf' ? formatCpf(digits) : formatCnpj(digits)
}

/** Primeira cláusula — CONTRATADA + CONTRATANTE (preview ou assinatura final). */
export function buildIdentificacaoPartesClause(input: {
  vyriaRazaoSocial: string
  vyriaCnpjLabel: string
  storeName: string
  signatario?: {
    nome?: string
    documentoTipo?: BrDocumentType
    documentoNumero?: string
    cargo?: string
  }
}): string {
  const razaoSocial = resolveVyriaContratadaRazaoSocial(input.vyriaRazaoSocial)
  const cnpjLabel = resolveVyriaContratadaCnpjLabel(input.vyriaCnpjLabel)
  const contratada = `CONTRATADA: ${razaoSocial}, inscrita no CNPJ sob o nº ${cnpjLabel}, doravante "Vyria".`
  const sig = input.signatario
  const nome = sig?.nome?.trim() ?? ''
  const cargo = sig?.cargo?.trim() ?? ''
  const tipo = sig?.documentoTipo ?? 'cnpj'
  const docLabel = formatSignatarioDocumentoLabel(tipo, sig?.documentoNumero ?? '')

  if (nome.length >= 3 && docLabel && cargo.length >= 2) {
    return `IDENTIFICAÇÃO DAS PARTES. ${contratada} CONTRATANTE: ${input.storeName}, ${brDocumentTypeLabel(tipo)} ${docLabel}, representada por ${nome}, na qualidade de ${cargo}, doravante "Contratante".`
  }

  return `IDENTIFICAÇÃO DAS PARTES. ${contratada} CONTRATANTE: ${input.storeName}, identificado(a) pelos dados informados na assinatura eletrónica abaixo, doravante "Contratante".`
}
