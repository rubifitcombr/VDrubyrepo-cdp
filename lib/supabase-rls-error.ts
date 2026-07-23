/** Erro PostgREST/Supabase quando RLS bloqueia INSERT/UPDATE/DELETE. */
export function isSupabaseRlsViolation(message: string | undefined | null): boolean {
  if (!message) return false
  return /row-level security|violates row-level security policy/i.test(message)
}
