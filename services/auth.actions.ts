'use server'

import { createClient } from '@/lib/supabase/server'

export async function signInWithPasswordAction(email: string, password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) {
    return { ok: false as const, error: error.message }
  }

  return { ok: true as const }
}
