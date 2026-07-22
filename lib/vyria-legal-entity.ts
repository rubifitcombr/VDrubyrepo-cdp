import 'server-only'

import type { VyriaLegalEntity } from '@/lib/annual-contract-acceptance'
import {
  resolveVyriaContratadaCnpjDigits,
  resolveVyriaContratadaCnpjLabel,
  resolveVyriaContratadaRazaoSocial,
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

/** Dados da contratada (Vyria) para contratos — só via variáveis de ambiente. */
export function getVyriaLegalEntity(): VyriaLegalEntity {
  const razaoSocial = resolveVyriaContratadaRazaoSocial(
    sanitizeEnvText(process.env.VYRIA_RAZAO_SOCIAL)
  )
  const cnpj = resolveVyriaContratadaCnpjDigits(
    sanitizeEnvText(process.env.VYRIA_CNPJ)
  )
  const emailJuridico =
    process.env.VYRIA_EMAIL_JURIDICO?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    ''
  const foroComarca = process.env.VYRIA_FORO_COMARCA?.trim() || ''
  const termosUrl = process.env.VYRIA_TERMOS_URL?.trim() || ''

  return {
    razaoSocial,
    cnpj,
    cnpjLabel: resolveVyriaContratadaCnpjLabel(null, cnpj),
    emailJuridico,
    foroComarca,
    termosUrl,
  }
}
