import 'server-only'

import {
  ANNUAL_CONTRACT_TERMS_VERSION,
  buildAnnualContractLegalRecord,
  hashAnnualContractLegalRecord,
  type AnnualContractLegalRecord,
} from '@/lib/annual-contract-acceptance'
import type { BrDocumentType } from '@/lib/br-document'
import { parseBrDocument } from '@/lib/br-document'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { readStorePlano } from '@/lib/store-columns'
import { getVyriaLegalEntity } from '@/lib/vyria-legal-entity'
import { readStoreContract } from '@/lib/contract-pricing'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { buildAnnualContractPdfBuffer } from '@/services/annual-contract-pdf.server'
import { escapeHtml, sendResendEmail } from '@/services/email-resend.server'

export type AcceptAnnualContractInput = {
  store: Record<string, unknown>
  userId: string
  userEmail: string | null
  aceiteTermos: boolean
  aceiteCompromisso12m: boolean
  aceiteRepresentanteLegal: boolean
  assinaturaNome: string
  assinaturaPng: string
  documentoTipo: BrDocumentType
  documentoNumero: string
  representanteCargo: string
  ipAddress: string | null
  userAgent: string | null
}

export type AcceptAnnualContractResult =
  | { ok: true; documentoHash: string; pdfPath: string }
  | { ok: false; error: string; status: number }

function aceiteLabelBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(new Date(iso))
}

async function uploadContractPdf(
  storeId: string,
  hash: string,
  pdf: Buffer
): Promise<string | null> {
  try {
    const svc = createServiceRoleClient()
    const path = `${storeId}/${Date.now()}-${hash.slice(0, 12)}.pdf`
    const { error } = await svc.storage.from('contratos').upload(path, pdf, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (error) {
      console.warn('[contrato] upload storage:', error.message)
      return null
    }
    return path
  } catch (e) {
    console.warn('[contrato] upload storage indisponivel:', e)
    return null
  }
}

async function insertAuditRow(
  svc: ReturnType<typeof createServiceRoleClient>,
  row: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await svc.from('contrato_aceites').insert(row).select('id').maybeSingle()
  if (error) {
    console.warn('[contrato] audit insert:', error.message)
    return null
  }
  return data && typeof data === 'object' && 'id' in data ? String((data as { id: unknown }).id) : null
}

async function notifyContractSigned(input: {
  storeName: string
  merchantEmail: string | null
  adminEmail: string | null
  documentoHash: string
  aceiteLabel: string
  pdfBase64: string
  record: AnnualContractLegalRecord
}): Promise<void> {
  const recipients = new Set<string>()
  if (input.merchantEmail?.trim()) recipients.add(input.merchantEmail.trim())
  if (input.adminEmail?.trim()) recipients.add(input.adminEmail.trim())
  const vyria = getVyriaLegalEntity()
  if (vyria.emailJuridico.trim()) recipients.add(vyria.emailJuridico.trim())

  if (recipients.size === 0) return

  const html = `
    <p><strong>Contrato anual assinado</strong> — ${escapeHtml(input.storeName)}</p>
    <ul>
      <li><strong>Data/hora:</strong> ${escapeHtml(input.aceiteLabel)}</li>
      <li><strong>Representante:</strong> ${escapeHtml(input.record.contratante.representanteNome)}</li>
      <li><strong>Plano:</strong> ${escapeHtml(input.record.comercial.plano)}</li>
      <li><strong>SHA-256:</strong> <code>${escapeHtml(input.documentoHash)}</code></li>
    </ul>
    <p>Segue em anexo o PDF do contrato para arquivo.</p>
  `

  await sendResendEmail({
    to: [...recipients],
    subject: `Vyria — Contrato anual assinado — ${input.storeName}`,
    html,
    attachments: [
      {
        filename: `contrato-vyria-${input.storeName.replace(/[^\w.-]+/g, '_').slice(0, 40)}.pdf`,
        content: input.pdfBase64,
        contentType: 'application/pdf',
      },
    ],
  })
}

export async function acceptAnnualContract(
  input: AcceptAnnualContractInput
): Promise<AcceptAnnualContractResult> {
  if (!input.aceiteTermos || !input.aceiteCompromisso12m || !input.aceiteRepresentanteLegal) {
    return {
      ok: false,
      status: 400,
      error: 'Aceite todos os termos, o compromisso de 12 meses e a declaração de representação legal.',
    }
  }

  const doc = parseBrDocument(input.documentoTipo, input.documentoNumero)
  if (!doc) {
    return { ok: false, status: 400, error: 'CPF ou CNPJ inválido.' }
  }

  const cargo = String(input.representanteCargo || '').trim()
  if (cargo.length < 2) {
    return { ok: false, status: 400, error: 'Informe o cargo/função do representante legal.' }
  }

  const assinaturaNome = String(input.assinaturaNome || '').trim()
  if (assinaturaNome.length < 3) {
    return { ok: false, status: 400, error: 'Informe o nome completo do signatário.' }
  }

  const storeId = String(input.store.id)
  const storeName =
    typeof input.store.name === 'string' && input.store.name.trim()
      ? input.store.name.trim()
      : 'Loja'
  const plan = effectiveDashboardPlan(input.userEmail, readStorePlano(input.store))
  const operationMode = parseOperationModeFromStore(input.store)
  const contract = readStoreContract(input.store)
  const vyria = getVyriaLegalEntity()

  const legalRecord = buildAnnualContractLegalRecord({
    storeName,
    plan,
    operationMode,
    contract,
    vyria,
    signatario: {
      nome: assinaturaNome,
      documentoTipo: doc.tipo,
      documentoNumero: doc.numero,
      cargo,
    },
  })

  const documentoHash = hashAnnualContractLegalRecord(legalRecord)
  const aceiteIso = new Date().toISOString()
  const aceiteLabel = aceiteLabelBr(aceiteIso)

  const pdfBuffer = buildAnnualContractPdfBuffer({
    record: legalRecord,
    audit: {
      aceiteIso,
      aceiteLabelBr: aceiteLabel,
      signatarioEmail: input.userEmail || '—',
      signatarioUserId: input.userId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      documentoHash,
    },
    assinaturaPngDataUrl: input.assinaturaPng,
  })

  const pdfPath = await uploadContractPdf(storeId, documentoHash, pdfBuffer)
  const svc = createServiceRoleClient()

  const storePatch: Record<string, unknown> = {
    contrato_aceite_em: aceiteIso,
    contrato_assinatura_nome: assinaturaNome,
    contrato_assinatura_png: input.assinaturaPng,
    contrato_termos_versao: ANNUAL_CONTRACT_TERMS_VERSION,
    contrato_aceite_por: input.userId,
    contrato_documento_tipo: doc.tipo,
    contrato_documento_numero: doc.numero,
    contrato_representante_cargo: cargo,
    contrato_documento_hash: documentoHash,
    contrato_pdf_path: pdfPath,
    contrato_aceite_ip: input.ipAddress,
    contrato_aceite_user_agent: input.userAgent,
    contrato_aceite_email: input.userEmail,
    plano_atualizado_em: aceiteIso,
  }

  const { error: updateError } = await svc
    .from('stores')
    .update(storePatch)
    .eq('id', storeId)

  if (updateError) {
    return {
      ok: false,
      status: 500,
      error: updateError.message?.includes('column')
        ? 'Executa supabase/annual-contract.sql no Supabase.'
        : updateError.message || 'Erro ao registar contrato',
    }
  }

  await insertAuditRow(svc, {
    store_id: storeId,
    termos_versao: ANNUAL_CONTRACT_TERMS_VERSION,
    documento_hash: documentoHash,
    assinatura_nome: assinaturaNome,
    documento_tipo: doc.tipo,
    documento_numero: doc.numero,
    representante_cargo: cargo,
    aceite_representante_legal: true,
    aceite_termos: true,
    aceite_compromisso_12m: true,
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
    user_id: input.userId,
    user_email: input.userEmail,
    pdf_storage_path: pdfPath,
    contrato_inicio_em: contract.contratoInicioEm,
    contrato_fim_em: contract.contratoFimEm,
    mensal_brl: legalRecord.comercial.mensalidadeBrl,
    documento_canonico: legalRecord,
  })

  const adminEmail = process.env.ADMIN_EMAIL?.trim() || null
  await notifyContractSigned({
    storeName,
    merchantEmail: input.userEmail,
    adminEmail,
    documentoHash,
    aceiteLabel,
    pdfBase64: pdfBuffer.toString('base64'),
    record: legalRecord,
  })

  return {
    ok: true,
    documentoHash,
    pdfPath: pdfPath || '',
  }
}
