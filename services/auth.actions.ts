'use server'

import { createClient } from '@/lib/supabase/server'
import { requiresAnnualContractAcceptance } from '@/lib/annual-contract-acceptance'

export async function signInWithPasswordAction(email: string, password: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) {
    return { ok: false as const, error: error.message }
  }

  const userId = data.user?.id
  if (!userId) {
    return { ok: true as const, redirectTo: '/dashboard' as const }
  }

  const { data: store } = await supabase
    .from('stores')
    .select(
      'billing_cycle, contrato_aceite_em, contrato_termos_versao, contrato_documento_hash'
    )
    .eq('owner_id', userId)
    .maybeSingle()

  if (
    store &&
    requiresAnnualContractAcceptance(store as Record<string, unknown>)
  ) {
    return { ok: true as const, redirectTo: '/dashboard/contrato' as const }
  }

  return { ok: true as const, redirectTo: '/dashboard' as const }
}
