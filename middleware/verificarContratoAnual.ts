import 'server-only'

import { createClient } from '@supabase/supabase-js'
import {
  isAnnualContractGateExemptPath,
  requiresAnnualContractAcceptance,
} from '@/lib/annual-contract-acceptance'

/**
 * Se o lojista tem contrato anual pendente de aceite, devolve o caminho do gate.
 */
export async function verificarContratoAnualGate(
  userId: string,
  pathname: string
): Promise<string | null> {
  if (isAnnualContractGateExemptPath(pathname)) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null

  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: store, error } = await svc
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()

  if (error || !store) return null

  if (requiresAnnualContractAcceptance(store as Record<string, unknown>)) {
    return '/dashboard/contrato'
  }

  return null
}
