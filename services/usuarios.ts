import { createClient } from '@/lib/supabase/client'

/** Espelha o utilizador em public.usuarios (sessão authenticated + RLS). */
export async function upsertUsuarioMirror(userId: string, email: string | null) {
  const supabase = createClient()
  return supabase.from('usuarios').upsert(
    { id: userId, email },
    { onConflict: 'id' }
  )
}
