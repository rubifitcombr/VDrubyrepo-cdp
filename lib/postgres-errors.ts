/** Violação de UNIQUE / duplicate key no Postgres (23505). */
export function isPostgresUniqueViolation(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return /unique|duplicate key|23505/i.test(error.message ?? '')
}
