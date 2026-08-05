import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { addDaysIso, todayIsoLocal } from '@/lib/contract-pricing'
import {
  REFERRAL_POINTS_PER_ACTIVATION,
  REFERRAL_POINTS_TO_REDEEM,
  REFERRAL_POINTS_VALIDITY_DAYS,
  REFERRAL_REDEEM_BONUS_DAYS,
} from '@/lib/referral/constants'
import {
  planEligibleForReferralProgram,
  storeRowEligibleAsReferrer,
} from '@/lib/referral/eligibility'
import { getSiteMetadataBase } from '@/lib/site-metadata'
import { parsePlan } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'

export type ReferralLedgerRow = {
  id: string
  delta: number
  reason: string
  expires_at: string | null
  created_at: string
}

export type ReferralListItem = {
  id: string
  referred_store_name: string
  status: 'pending' | 'activated'
  created_at: string
  activated_at: string | null
  points_awarded: number
}

export type ReferralDashboardData = {
  referral_code: string
  referral_url: string
  points_available: number
  points_until_redeem: number
  next_expiry_at: string | null
  can_redeem: boolean
  referrals: ReferralListItem[]
  redemptions_count: number
  missing_schema: boolean
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateReferralCode(): string {
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!
  }
  return out
}

function normalizeReferralCodeInput(raw: unknown): string | null {
  const t = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return t.length >= 6 && t.length <= 12 ? t : null
}

function isMissingSchemaError(msg: string): boolean {
  return /relation|does not exist|schema cache|42P01|column/i.test(msg)
}

function computeAvailablePoints(rows: ReferralLedgerRow[]): number {
  const now = Date.now()
  let earned = 0
  let spent = 0
  for (const row of rows) {
    if (row.delta > 0) {
      if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue
      earned += row.delta
    } else {
      spent += -row.delta
    }
  }
  return Math.max(0, earned - spent)
}

function nextExpiryIso(rows: ReferralLedgerRow[]): string | null {
  const now = Date.now()
  let best: number | null = null
  for (const row of rows) {
    if (row.delta <= 0 || !row.expires_at) continue
    const t = new Date(row.expires_at).getTime()
    if (t <= now) continue
    if (best == null || t < best) best = t
  }
  return best != null ? new Date(best).toISOString() : null
}

export function buildReferralRegisterUrl(code: string): string {
  const base = getSiteMetadataBase().origin.replace(/\/+$/, '')
  return `${base}/register?ref=${encodeURIComponent(code)}`
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

export async function resolveReferrerStoreIdByCode(
  svc: SupabaseClient,
  rawCode: unknown
): Promise<{ referrer_store_id: string } | { error: string } | null> {
  const code = normalizeReferralCodeInput(rawCode)
  if (!code) return null

  const { data: account, error: accErr } = await svc
    .from('store_referral_accounts')
    .select('store_id')
    .eq('referral_code', code)
    .maybeSingle()

  if (accErr) {
    if (isMissingSchemaError(accErr.message ?? '')) return null
    return { error: accErr.message ?? 'Erro ao validar indicação.' }
  }
  if (!account?.store_id) return { error: 'Código de indicação inválido.' }

  const referrerId = String(account.store_id)
  const { data: store, error: stErr } = await svc
    .from('stores')
    .select('*')
    .eq('id', referrerId)
    .maybeSingle()

  if (stErr || !store) return { error: 'Indicador não encontrado.' }
  if (!storeRowEligibleAsReferrer(store as Record<string, unknown>)) {
    return { error: 'Código de indicação indisponível.' }
  }

  return { referrer_store_id: referrerId }
}

export async function attachReferralToNewStore(
  svc: SupabaseClient,
  input: {
    referredStoreId: string
    referrerStoreId: string
    referralCode: string
  }
): Promise<void> {
  const { error: upErr } = await svc
    .from('stores')
    .update({ referred_by_store_id: input.referrerStoreId })
    .eq('id', input.referredStoreId)

  if (upErr && !isMissingSchemaError(upErr.message ?? '')) {
    console.warn('[referral] referred_by_store_id:', upErr.message)
  }

  const { error: refErr } = await svc.from('store_referrals').insert({
    referrer_store_id: input.referrerStoreId,
    referred_store_id: input.referredStoreId,
    referral_code: input.referralCode,
    status: 'pending',
  })

  if (refErr && !/unique|duplicate/i.test(refErr.message ?? '')) {
    console.warn('[referral] store_referrals insert:', refErr.message)
  }
}

export async function awardReferralOnStoreActivation(
  svc: SupabaseClient,
  activatedStoreId: string
): Promise<void> {
  const { data: store, error: stErr } = await svc
    .from('stores')
    .select('id, referred_by_store_id, name')
    .eq('id', activatedStoreId)
    .maybeSingle()

  if (stErr || !store) return
  const referrerId = String((store as { referred_by_store_id?: string }).referred_by_store_id ?? '').trim()
  if (!referrerId) return

  const { data: referral, error: refErr } = await svc
    .from('store_referrals')
    .select('id, status, referral_code')
    .eq('referred_store_id', activatedStoreId)
    .eq('referrer_store_id', referrerId)
    .maybeSingle()

  if (refErr || !referral?.id) return
  if (String(referral.status) === 'activated') return

  const now = new Date().toISOString()
  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + REFERRAL_POINTS_VALIDITY_DAYS)

  const { error: upRef } = await svc
    .from('store_referrals')
    .update({ status: 'activated', activated_at: now })
    .eq('id', referral.id)
    .eq('status', 'pending')

  if (upRef) {
    console.warn('[referral] activate row:', upRef.message)
    return
  }

  await getOrCreateReferralAccount(svc, referrerId)

  const { error: ledErr } = await svc.from('store_referral_ledger').insert({
    store_id: referrerId,
    delta: REFERRAL_POINTS_PER_ACTIVATION,
    reason: 'referral_activated',
    referral_id: referral.id,
    expires_at: expiresAt.toISOString(),
  })

  if (ledErr) {
    console.warn('[referral] ledger earn:', ledErr.message)
  }
}

export async function getReferralDashboardData(
  svc: SupabaseClient,
  storeId: string
): Promise<ReferralDashboardData> {
  const account = await getOrCreateReferralAccount(svc, storeId)
  if ('error' in account) {
    return {
      referral_code: '',
      referral_url: '',
      points_available: 0,
      points_until_redeem: REFERRAL_POINTS_TO_REDEEM,
      next_expiry_at: null,
      can_redeem: false,
      referrals: [],
      redemptions_count: 0,
      missing_schema: account.missing_schema === true,
    }
  }

  const code = account.referral_code
  const url = buildReferralRegisterUrl(code)

  const { data: ledgerRaw, error: ledErr } = await svc
    .from('store_referral_ledger')
    .select('id, delta, reason, expires_at, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true })

  if (ledErr && isMissingSchemaError(ledErr.message ?? '')) {
    return {
      referral_code: code,
      referral_url: url,
      points_available: 0,
      points_until_redeem: REFERRAL_POINTS_TO_REDEEM,
      next_expiry_at: null,
      can_redeem: false,
      referrals: [],
      redemptions_count: 0,
      missing_schema: true,
    }
  }

  const ledger = (ledgerRaw ?? []) as ReferralLedgerRow[]
  const points_available = computeAvailablePoints(ledger)
  const next_expiry_at = nextExpiryIso(ledger)

  const { data: referralsRaw } = await svc
    .from('store_referrals')
    .select('id, status, created_at, activated_at, referred_store_id')
    .eq('referrer_store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(50)

  const referredIds = (referralsRaw ?? []).map((r) => String((r as { referred_store_id: string }).referred_store_id))
  const nameById = new Map<string, string>()
  if (referredIds.length > 0) {
    const { data: stores } = await svc.from('stores').select('id, name').in('id', referredIds)
    for (const s of stores ?? []) {
      nameById.set(String((s as { id: string }).id), String((s as { name?: string }).name ?? '—'))
    }
  }

  const referrals: ReferralListItem[] = (referralsRaw ?? []).map((r) => {
    const row = r as {
      id: string
      status: string
      created_at: string
      activated_at: string | null
      referred_store_id: string
    }
    return {
      id: row.id,
      referred_store_name: nameById.get(row.referred_store_id) ?? '—',
      status: row.status === 'activated' ? 'activated' : 'pending',
      created_at: row.created_at,
      activated_at: row.activated_at,
      points_awarded: row.status === 'activated' ? REFERRAL_POINTS_PER_ACTIVATION : 0,
    }
  })

  const { count: redemptions_count } = await svc
    .from('store_referral_redemptions')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)

  const can_redeem = points_available >= REFERRAL_POINTS_TO_REDEEM

  return {
    referral_code: code,
    referral_url: url,
    points_available,
    points_until_redeem: can_redeem
      ? 0
      : Math.max(0, REFERRAL_POINTS_TO_REDEEM - points_available),
    next_expiry_at,
    can_redeem,
    referrals,
    redemptions_count: redemptions_count ?? 0,
    missing_schema: false,
  }
}

export async function redeemReferralBonus(
  svc: SupabaseClient,
  storeId: string,
  storeRow: Record<string, unknown>
): Promise<{ ok: true; plano_vence_em: string } | { error: string; status?: number }> {
  const plan = parsePlan(readStorePlano(storeRow))
  if (!planEligibleForReferralProgram(plan)) {
    return { error: 'Programa disponível do plano Growth em diante.', status: 403 }
  }

  const { data: ledgerRaw, error: ledErr } = await svc
    .from('store_referral_ledger')
    .select('id, delta, reason, expires_at, created_at')
    .eq('store_id', storeId)

  if (ledErr) {
    return {
      error: isMissingSchemaError(ledErr.message ?? '')
        ? 'Schema de indicações em falta. Aplica a migração no Supabase.'
        : ledErr.message ?? 'Erro ao ler pontos.',
      status: 503,
    }
  }

  const available = computeAvailablePoints((ledgerRaw ?? []) as ReferralLedgerRow[])
  if (available < REFERRAL_POINTS_TO_REDEEM) {
    return {
      error: `Precisas de ${REFERRAL_POINTS_TO_REDEEM} pontos para resgatar (tens ${available}).`,
      status: 400,
    }
  }

  const today = todayIsoLocal()
  const rawCur = storeRow.plano_vence_em
  const cur =
    typeof rawCur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawCur.trim())
      ? rawCur.trim()
      : today
  const base = cur >= today ? cur : today
  const novoVence = addDaysIso(base, REFERRAL_REDEEM_BONUS_DAYS)

  const { data: redemption, error: redErr } = await svc
    .from('store_referral_redemptions')
    .insert({
      store_id: storeId,
      points_spent: REFERRAL_POINTS_TO_REDEEM,
      plano_vence_em_before: cur,
      plano_vence_em_after: novoVence,
    })
    .select('id')
    .single()

  if (redErr || !redemption?.id) {
    return { error: redErr?.message ?? 'Erro ao registar resgate.', status: 500 }
  }

  const { error: ledInsErr } = await svc.from('store_referral_ledger').insert({
    store_id: storeId,
    delta: -REFERRAL_POINTS_TO_REDEEM,
    reason: 'redemption',
    redemption_id: redemption.id,
    expires_at: null,
  })

  if (ledInsErr) {
    return { error: ledInsErr.message ?? 'Erro ao debitar pontos.', status: 500 }
  }

  const now = new Date().toISOString()
  const { error: upStore } = await svc
    .from('stores')
    .update({
      plano_vence_em: novoVence,
      plano_atualizado_em: now,
    })
    .eq('id', storeId)

  if (upStore) {
    return { error: upStore.message ?? 'Erro ao estender assinatura.', status: 500 }
  }

  return { ok: true, plano_vence_em: novoVence }
}
