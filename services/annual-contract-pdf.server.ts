import 'server-only'

import { jsPDF } from 'jspdf'
import type { AnnualContractLegalRecord } from '@/lib/annual-contract-acceptance'
import { brDocumentTypeLabel, formatCnpj, formatCpf } from '@/lib/br-document'
import {
  resolveVyriaContratadaCnpjLabel,
  resolveVyriaContratadaRazaoSocial,
} from '@/lib/vyria-legal-constants'

export type AnnualContractPdfAudit = {
  aceiteIso: string
  aceiteLabelBr: string
  signatarioEmail: string
  signatarioUserId: string
  ipAddress: string | null
  userAgent: string | null
  documentoHash: string
}

function wrapLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[]
}

function drawParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = wrapLines(doc, text, maxWidth)
  for (const line of lines) {
    if (y > 275) {
      doc.addPage()
      y = 18
    }
    doc.text(line, x, y)
    y += lineHeight
  }
  return y
}

export function buildAnnualContractPdfBuffer(input: {
  record: AnnualContractLegalRecord
  audit: AnnualContractPdfAudit
  assinaturaPngDataUrl: string
}): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const width = 210 - margin * 2
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(input.record.titulo, margin, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y = drawParagraph(
    doc,
    `Versao ${input.record.versao} · Documento gerado eletronicamente em ${input.audit.aceiteLabelBr}`,
    margin,
    y,
    width,
    4.5
  )
  y += 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Partes', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y = drawParagraph(
    doc,
    `CONTRATADA: ${resolveVyriaContratadaRazaoSocial(input.record.contratada.razaoSocial)}, inscrita no CNPJ sob o nº ${resolveVyriaContratadaCnpjLabel(null, input.record.contratada.cnpj)}, doravante "Vyria".`,
    margin,
    y,
    width,
    4.5
  )
  const docLabel =
    input.record.contratante.documentoTipo === 'cpf'
      ? formatCpf(input.record.contratante.documentoNumero)
      : formatCnpj(input.record.contratante.documentoNumero)
  y = drawParagraph(
    doc,
    `CONTRATANTE: ${input.record.contratante.lojaNome}, ${brDocumentTypeLabel(input.record.contratante.documentoTipo)} ${docLabel}`,
    margin,
    y,
    width,
    4.5
  )
  y = drawParagraph(
    doc,
    `Representante: ${input.record.contratante.representanteNome} (${input.record.contratante.representanteCargo})`,
    margin,
    y,
    width,
    4.5
  )
  y += 3

  doc.setFont('helvetica', 'bold')
  doc.text('Clausulas', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  input.record.clausulas.forEach((clausula, idx) => {
    y = drawParagraph(doc, `${idx + 1}. ${clausula}`, margin, y, width, 4.5)
    y += 1.5
  })

  if (y > 210) {
    doc.addPage()
    y = 18
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Assinatura do Contratante', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  y = drawParagraph(
    doc,
    `Nome: ${input.record.contratante.representanteNome}`,
    margin,
    y,
    width,
    4.5
  )
  y = drawParagraph(doc, `E-mail: ${input.audit.signatarioEmail}`, margin, y, width, 4.5)
  y = drawParagraph(
    doc,
    `Data/hora (UTC): ${input.audit.aceiteIso}`,
    margin,
    y,
    width,
    4.5
  )

  try {
    doc.addImage(input.assinaturaPngDataUrl, 'PNG', margin, y, 70, 22)
    y += 26
  } catch {
    y = drawParagraph(doc, '[Imagem de assinatura anexa no registo digital]', margin, y, width, 4.5)
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Registo de integridade (prova digital)', margin, y)
  y += 5
  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  y = drawParagraph(doc, `SHA-256: ${input.audit.documentoHash}`, margin, y, width, 4)
  if (input.audit.ipAddress) {
    y = drawParagraph(doc, `IP: ${input.audit.ipAddress}`, margin, y, width, 4)
  }
  if (input.audit.userAgent) {
    y = drawParagraph(
      doc,
      `User-Agent: ${input.audit.userAgent.slice(0, 240)}`,
      margin,
      y,
      width,
      4
    )
  }
  y = drawParagraph(doc, `User ID: ${input.audit.signatarioUserId}`, margin, y, width, 4)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  drawParagraph(
    doc,
    'Este documento foi aceite electronicamente no painel Vyria Delivery. A integridade pode ser verificada pelo hash SHA-256 acima, confrontado com o registo na base de dados Vyria.',
    margin,
    Math.min(y + 4, 285),
    width,
    4
  )

  const ab = doc.output('arraybuffer')
  return Buffer.from(ab)
}
