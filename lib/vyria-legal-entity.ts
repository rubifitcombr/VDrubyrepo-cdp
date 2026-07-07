import 'server-only'

import type { VyriaLegalEntity } from '@/lib/annual-contract-acceptance'
import {
  resolveVyriaContratadaCnpjDigits,
  resolveVyriaContratadaCnpjLabel,
  resolveVyriaContratadaRazaoSocial,
  VYRIA_CONTRATADA_CNPJ,
  VYRIA_CONTRATADA_RAZAO_SOCIAL,
} from '@/lib/vyria-legal-constants'

function sanitizeEnvText(value: string | undefined): string {
  const v = String(value || '').trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim()
  }
  return v
}

/** Dados da contratada (Vyria) para contratos. */
export function getVyriaLegalEntity(): VyriaLegalEntity {
  const envRazao = sanitizeEnvText(process.env.VYRIA_RAZAO_SOCIAL)
  const envCnpj = sanitizeEnvText(process.env.VYRIA_CNPJ).replace(/\D/g, '')
  const hasCompleteEnvOverride = Boolean(envRazao) && envCnpj.length === 14

  const razaoSocial = hasCompleteEnvOverride
    ? envRazao
    : resolveVyriaContratadaRazaoSocial(envRazao || VYRIA_CONTRATADA_RAZAO_SOCIAL)
  const cnpj = hasCompleteEnvOverride
    ? envCnpj
    : resolveVyriaContratadaCnpjDigits(envCnpj || VYRIA_CONTRATADA_CNPJ)
  const emailJuridico =
    process.env.VYRIA_EMAIL_JURIDICO?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    'juridico@vyria.com.br'
  const foroComarca =
    process.env.VYRIA_FORO_COMARCA?.trim() || 'Comarca da Capital do Estado de São Paulo/SP'
  const termosUrl =
    process.env.VYRIA_TERMOS_URL?.trim() || 'https://vyria.com.br/termos'

  return {
    razaoSocial,
    cnpj,
    cnpjLabel: resolveVyriaContratadaCnpjLabel(null, cnpj),
    emailJuridico,
    foroComarca,
    termosUrl,
  }
}
