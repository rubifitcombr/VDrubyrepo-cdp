const ANNUAL_CONTRACT_SQL_PATH = 'supabase/annual-contract.sql'
const LOYALTY_ORDER_COLUMNS_SQL_PATH = 'supabase/loyalty-order-columns.sql'

export function isMissingLoyaltyOrderColumnsError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false
  const msg = String(error.message || '')
  const code = String(error.code || '')
  if (!/loyalty_discount_brl|loyalty_redeem_points/i.test(msg)) return false
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    /schema cache/i.test(msg) ||
    /column/i.test(msg) ||
    /does not exist/i.test(msg)
  )
}

export function supabaseLoyaltyOrderColumnsSchemaHint(): string {
  return `Base de dados desactualizada: executa o script ${LOYALTY_ORDER_COLUMNS_SQL_PATH} no SQL Editor do Supabase (Project → SQL → New query) e tenta novamente.`
}

const LOYALTY_SCHEMA_SQL_PATH = 'supabase/loyalty-schema.sql'

export function isMissingLoyaltySchemaError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false
  const msg = String(error.message || '')
  const code = String(error.code || '')
  if (
    !/store_loyalty_config|loyalty_accounts|loyalty_ledger/i.test(msg) &&
    code !== '42P01'
  ) {
    return false
  }
  return (
    code === 'PGRST204' ||
    code === '42P01' ||
    code === '42703' ||
    /schema cache/i.test(msg) ||
    /does not exist/i.test(msg)
  )
}

export function supabaseLoyaltySchemaHint(): string {
  return `Base de dados desactualizada: executa o script ${LOYALTY_SCHEMA_SQL_PATH} no SQL Editor do Supabase (Project → SQL → New query) e recarrega esta página.`
}

export function formatSupabaseLoyaltyError(
  error: { message?: string; code?: string } | null | undefined
): string {
  if (isMissingLoyaltySchemaError(error)) return supabaseLoyaltySchemaHint()
  return String(error?.message || 'Erro ao carregar fidelidade.')
}

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
