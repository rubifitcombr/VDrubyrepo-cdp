import { parseBillingCycle, readStoreContract } from '@/lib/contract-pricing'

/** Versão actual dos termos do contrato anual Vyria Delivery. */
export const ANNUAL_CONTRACT_TERMS_VERSION = '2026-07'

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
  if (n === '/api/assinatura/cancelar') return false
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
