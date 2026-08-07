import type { SupabaseClient } from '@supabase/supabase-js'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateReferralCode(): string {
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!
  }
  return out
}

function isMissingSchemaError(msg: string): boolean {
  return /relation|does not exist|schema cache|42P01|column/i.test(msg)
}

export async function getOrCreateReferralAccount(
  svc: SupabaseClient,
  storeId: string
): Promise<{ referral_code: string } | { error: string; missing_schema?: boolean }> {
  const { data: existing, error: exErr } = await svc
    .from('store_referral_accounts')
    .select('referral_code')
    .eq('store_id', storeId)
    .maybeSingle()

  if (exErr) {
    if (isMissingSchemaError(exErr.message ?? '')) {
      return { error: 'Schema de indicações em falta.', missing_schema: true }
    }
    return { error: exErr.message ?? 'Erro ao ler código de indicação.' }
  }
  if (existing?.referral_code) {
    return { referral_code: String(existing.referral_code) }
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateReferralCode()
    const { error: insErr } = await svc.from('store_referral_accounts').insert({
      store_id: storeId,
      referral_code: code,
    })
    if (!insErr) return { referral_code: code }
    if (!/unique|duplicate/i.test(insErr.message ?? '')) {
      if (isMissingSchemaError(insErr.message ?? '')) {
        return { error: 'Schema de indicações em falta.', missing_schema: true }
      }
      return { error: insErr.message ?? 'Erro ao criar código.' }
    }
  }
  return { error: 'Não foi possível gerar código único.' }
}
