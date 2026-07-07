const ANNUAL_CONTRACT_SQL_PATH = 'supabase/annual-contract.sql'

/** Mensagem amigável quando colunas do contrato anual ainda não existem no Supabase. */
export function supabaseAnnualContractSchemaHint(
  error: { message?: string; code?: string } | null | undefined
): string | null {
  if (!error) return null
  const msg = String(error.message || '')
  const code = String(error.code || '')
  if (
    code === 'PGRST204' ||
    code === '42703' ||
    /schema cache/i.test(msg) ||
    /billing_cycle/i.test(msg) ||
    /contrato_/i.test(msg)
  ) {
    return `Base de dados desactualizada: executa o script ${ANNUAL_CONTRACT_SQL_PATH} no SQL Editor do Supabase (Project → SQL → New query) e tenta novamente.`
  }
  return null
}

export function formatSupabaseStoreUpdateError(
  error: { message?: string; code?: string } | null | undefined
): string {
  const hint = supabaseAnnualContractSchemaHint(error)
  if (hint) return hint
  return String(error?.message || 'Erro ao actualizar loja')
}
