'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  REFERRAL_POINTS_PER_ACTIVATION,
  REFERRAL_POINTS_TO_REDEEM,
  REFERRAL_POINTS_VALIDITY_DAYS,
  REFERRAL_REDEEM_BONUS_DAYS,
} from '@/lib/referral/constants'
import type { ReferralDashboardData } from '@/services/store-referral.server'
import { ConquestTrail } from './ConquestTrail'

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

type Props = {
  data: ReferralDashboardData
}

/**
 * Nível de status calculado em runtime a partir de resgates históricos
 * (sem persistência no banco):
 * - 0 resgates → Bronze
 * - 1–2 resgates → Prata
 * - 3+ resgates → Ouro
 */
function referralTierFromRedemptions(count: number): {
  label: string
  className: string
  dotClassName: string
} {
  if (count >= 3) {
    return {
      label: 'Ouro',
      className:
        'bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-500 text-amber-950 ring-amber-500/60 shadow-[0_0_18px_rgba(234,179,8,0.55)]',
      dotClassName: 'bg-amber-900 shadow-[0_0_6px_rgba(234,179,8,0.9)]',
    }
  }
  if (count >= 1) {
    return {
      label: 'Prata',
      className:
        'bg-gradient-to-br from-slate-300 via-slate-100 to-zinc-400 text-slate-900 ring-slate-400/70 shadow-[0_0_12px_rgba(148,163,184,0.5)]',
      dotClassName: 'bg-slate-700 shadow-[0_0_4px_rgba(226,232,240,0.9)]',
    }
  }
  return {
    label: 'Bronze',
    className:
      'bg-gradient-to-br from-[#c87533] via-[#e8a54b] to-[#a85d20] text-white ring-[#cd7f32]/70 shadow-[0_0_14px_rgba(205,127,50,0.45)]',
    dotClassName: 'bg-amber-100 shadow-[0_0_4px_rgba(255,237,213,0.8)]',
  }
}

function nearMissMicrocopy(
  saldo: number,
  meta: number,
  pontosPorIndicacao: number,
  canRedeem: boolean
): string {
  if (canRedeem) {
    return 'Você desbloqueou o resgate — aproveite seu bônus!'
  }
  const remaining = Math.max(0, meta - saldo)
  if (remaining === 0) return 'Pronto para resgatar!'
  const indicacoesFaltando = Math.ceil(remaining / pontosPorIndicacao)
  if (indicacoesFaltando === 1) {
    return 'Só mais 1 indicação para o próximo resgate!'
  }
  return `Faltam ${remaining} pontos para o próximo resgate`
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function nextTierProgress(redemptions: number): {
  pct: number
  label: string
  next: string | null
} {
  if (redemptions >= 3) {
    return { pct: 100, label: 'Nível máximo — continue indicando!', next: null }
  }
  if (redemptions >= 1) {
    const pct = Math.round(((redemptions - 1) / 2) * 100)
    const remaining = 3 - redemptions
    return {
      pct,
      label: remaining === 1 ? 'Só mais 1 resgate para Ouro!' : `${remaining} resgates para Ouro`,
      next: 'Ouro',
    }
  }
  return { pct: 0, label: '1 resgate para subir para Prata', next: 'Prata' }
}

function IconGift({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M12 22V12M12 12H4.5a1.5 1.5 0 0 1 0-3c1.5 0 2.5 1.5 3.5 3 1-1.5 2-3 3.5-3a1.5 1.5 0 0 1 0 3H12ZM12 7V4M8 7c0-2 1.5-3 4-3s4 1 4 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconShare({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IndiqueGanheClient({ data: initial }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromHub = searchParams.get('hub') === 'indique'
  const [data, setData] = useState(initial)
  const [redeeming, setRedeeming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const tier = referralTierFromRedemptions(data.redemptions_count)
  const tierProgress = nextTierProgress(data.redemptions_count)
  const redeemProgressPct = Math.min(
    100,
    Math.round((data.points_available / REFERRAL_POINTS_TO_REDEEM) * 100)
  )
  const nearMiss = nearMissMicrocopy(
    data.points_available,
    REFERRAL_POINTS_TO_REDEEM,
    REFERRAL_POINTS_PER_ACTIVATION,
    data.can_redeem
  )

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(data.referral_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setMessage('Não foi possível copiar. Selecione o link manualmente.')
    }
  }

  async function handleRedeem() {
    if (!data.can_redeem || redeeming) return
    setRedeeming(true)
    setMessage(null)
    try {
      const res = await fetch('/api/referrals/redeem', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        ok?: boolean
        plano_vence_em?: string
      }
      if (!res.ok || !json.ok) {
        setMessage(json.error || 'Não foi possível resgatar.')
        return
      }
      setMessage(
        `Bônus aplicado! Sua assinatura foi estendida até ${dateFmt.format(
          new Date(`${json.plano_vence_em}T12:00:00`)
        )}.`
      )
      setData((prev) => {
        const nextBalance = Math.max(0, prev.points_available - REFERRAL_POINTS_TO_REDEEM)
        return {
          ...prev,
          points_available: nextBalance,
          can_redeem: nextBalance >= REFERRAL_POINTS_TO_REDEEM,
          points_until_redeem: Math.max(0, REFERRAL_POINTS_TO_REDEEM - nextBalance),
          redemptions_count: prev.redemptions_count + 1,
        }
      })
      router.refresh()
    } catch {
      setMessage('Erro de rede. Tente novamente.')
    } finally {
      setRedeeming(false)
    }
  }

  if (data.missing_schema) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">Indique e ganhe</h1>
        <p className="mt-3 text-sm text-amber-950/90">
          O programa está quase pronto — falta aplicar a migração de indicações no Supabase.
          Entre em contato com o suporte se o problema persistir.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm font-semibold text-[var(--dash-primary)]"
        >
          Voltar ao painel
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-8">
      {fromHub ? (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-semibold text-vyria-navy-muted transition-colors hover:text-vyria-navy"
        >
          ← Voltar ao hub
        </Link>
      ) : null}

      <div className={`space-y-5 sm:space-y-6 ${fromHub ? 'mt-3' : ''}`}>
      {/* Hero — psicologia de jogo */}
      <header className="relative overflow-hidden rounded-2xl border border-orange-200/70 bg-gradient-to-br from-[#1c1410] via-[#2a1a14] to-[#1a1614] p-4 shadow-[0_12px_40px_rgba(249,115,22,0.2)] sm:p-5">
        <div
          className="pointer-events-none absolute -right-6 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-rose-500/30 to-amber-400/20 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-8 left-0 h-28 w-28 rounded-full bg-gradient-to-tr from-orange-500/25 to-yellow-300/10 blur-2xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 motion-safe:animate-pulse" aria-hidden />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-200/90">
                  Missão ativa
                </span>
              </div>
              <h1 className="font-brand mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                <span className="bg-gradient-to-r from-rose-300 via-orange-300 to-amber-200 bg-clip-text text-transparent">
                  Indique e ganhe
                </span>
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/72">
                Cada loja ativada vale{' '}
                <span className="font-bold text-amber-300">
                  +{REFERRAL_POINTS_PER_ACTIVATION} pts
                </span>
                . Junte{' '}
                <span className="font-bold text-amber-300">{REFERRAL_POINTS_TO_REDEEM} pts</span>{' '}
                e desbloqueie{' '}
                <span className="font-bold text-rose-300">
                  +{REFERRAL_REDEEM_BONUS_DAYS} dias grátis
                </span>{' '}
                no seu plano.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end sm:min-w-[9.5rem]">
              <span
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide ring-2 sm:justify-end ${tier.className}`}
              >
                <span className={`h-2 w-2 rounded-full ${tier.dotClassName}`} aria-hidden />
                Nível {tier.label}
              </span>
              <span className="text-center text-[11px] font-medium text-white/50 sm:text-right">
                {data.redemptions_count}{' '}
                {data.redemptions_count === 1 ? 'resgate' : 'resgates'}
              </span>
            </div>
          </div>

          {/* Barra de progresso ao prêmio */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-amber-200/90">Progresso do prêmio</span>
              <span className="font-mono font-bold tabular-nums text-white">
                {data.points_available}
                <span className="text-white/45">/{REFERRAL_POINTS_TO_REDEEM} pts</span>
              </span>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={data.points_available}
              aria-valuemin={0}
              aria-valuemax={REFERRAL_POINTS_TO_REDEEM}
              aria-label="Progresso até o resgate"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300 shadow-[0_0_12px_rgba(251,146,60,0.6)] transition-[width] duration-700"
                style={{ width: `${redeemProgressPct}%` }}
              />
            </div>
            <p
              className={`mt-2 text-xs font-semibold leading-snug ${
                data.can_redeem ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {nearMiss}
            </p>
          </div>

          {/* Barra de nível (XP) */}
          {tierProgress.next ? (
            <div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-white/50">
                  Próximo nível:{' '}
                  <span className="font-bold text-white/80">{tierProgress.next}</span>
                </span>
                <span className="font-semibold text-amber-300/90">{tierProgress.label}</span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={tierProgress.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progresso para nível ${tierProgress.next}`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-yellow-300 transition-[width] duration-700"
                  style={{ width: `${tierProgress.pct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-center text-xs font-semibold text-amber-300/90">
              {tierProgress.label}
            </p>
          )}

          <p className="text-[11px] text-white/40">
            Pontos válidos por {REFERRAL_POINTS_VALIDITY_DAYS} dias após ganhos.
          </p>
        </div>
      </header>

      {/* Trilha de conquista — elemento central */}
      <section className="relative overflow-hidden rounded-2xl border border-orange-200/60 bg-gradient-to-br from-orange-50 via-rose-50/80 to-amber-50 p-4 shadow-[0_8px_32px_rgba(249,115,22,0.12)] sm:p-6">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-rose-300/30 to-amber-300/20 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-gradient-to-tr from-orange-300/25 to-yellow-200/20 blur-2xl"
          aria-hidden
        />

        <div className="relative mb-4 sm:mb-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-rose-600">
              Placar de pontos
            </p>
            <div className="mt-1 inline-flex max-w-full items-baseline gap-2 rounded-xl bg-gradient-to-br from-[#1c1410] to-[#2a1f18] px-3 py-2 ring-2 ring-amber-400/50 shadow-[0_4px_20px_rgba(0,0,0,0.25)] sm:px-4 sm:py-2.5">
              <span
                className="font-mono text-3xl font-black tabular-nums tracking-tight text-transparent bg-gradient-to-b from-amber-200 to-orange-400 bg-clip-text sm:text-4xl md:text-5xl"
                aria-label={`${data.points_available} pontos`}
              >
                {data.points_available}
              </span>
              <span className="pb-1 font-mono text-sm font-bold tracking-widest text-amber-400/90">
                PTS
              </span>
            </div>
          </div>
        </div>

        <ConquestTrail
          saldo={data.points_available}
          metaResgate={REFERRAL_POINTS_TO_REDEEM}
          pontosPorIndicacao={REFERRAL_POINTS_PER_ACTIVATION}
          canRedeem={data.can_redeem}
        />

        {data.next_expiry_at ? (
          <p className="mt-4 text-center text-xs text-vyria-navy-muted">
            Próxima expiração de pontos:{' '}
            <span className="font-medium text-vyria-navy">
              {dateFmt.format(new Date(data.next_expiry_at))}
            </span>
          </p>
        ) : null}
      </section>

      {/* Botão de resgate com estados travado / desbloqueado */}
      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
        {data.can_redeem ? (
          <button
            type="button"
            disabled={redeeming}
            onClick={handleRedeem}
            className="group flex w-full flex-wrap items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-vyria-plum via-vyria-orange to-amber-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-300/30 transition-all duration-200 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vyria-orange motion-safe:animate-[pulse_3s_ease-in-out_infinite] disabled:opacity-70 sm:gap-2.5 sm:px-6 sm:py-4 sm:text-base"
          >
            <IconGift className="h-5 w-5 transition-transform group-hover:scale-110" />
            {redeeming ? 'Resgatando…' : 'Resgatar bônus'}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
              +{REFERRAL_REDEEM_BONUS_DAYS} dias
            </span>
          </button>
        ) : (
          <div
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-orange-300/60 bg-gradient-to-b from-orange-50/80 to-rose-50/50 px-6 py-5 text-center"
            role="status"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-200 to-rose-200 text-orange-700 shadow-inner">
              <IconLock className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-vyria-navy">Resgate bloqueado</p>
            <p className="text-sm text-vyria-navy-muted">
              Faltam{' '}
              <span className="font-bold tabular-nums text-vyria-orange">
                {data.points_until_redeem}
              </span>{' '}
              pontos para +{REFERRAL_REDEEM_BONUS_DAYS} dias no plano atual
            </p>
          </div>
        )}
      </section>

      {message ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {message}
        </p>
      ) : null}

      {/* Link de indicação — gatilho de compartilhar */}
      <section className="overflow-hidden rounded-2xl border border-orange-200/70 bg-white p-4 shadow-[0_6px_24px_rgba(244,63,94,0.1)] sm:p-6">
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200/80 bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 px-3 py-3 sm:px-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-amber-400 text-white shadow-[0_6px_20px_rgba(244,63,94,0.4)] motion-safe:animate-pulse sm:h-12 sm:w-12">
            <IconGift className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-vyria-navy">
              Compartilhe e destrave sua recompensa
            </p>
            <p className="text-xs leading-snug text-vyria-navy-muted">
              Cada indicação ativada vale {REFERRAL_POINTS_PER_ACTIVATION} pts rumo a{' '}
              <span className="font-semibold text-orange-600">
                +{REFERRAL_REDEEM_BONUS_DAYS} dias grátis
              </span>
            </p>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-vyria-navy">Seu link de indicação</h2>
        <p className="mt-1 text-xs text-vyria-navy-muted">
          Código:{' '}
          <span className="font-mono font-semibold text-vyria-navy">{data.referral_code}</span>
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            readOnly
            value={data.referral_url}
            className="min-w-0 flex-1 truncate rounded-xl border border-[var(--card-border)] bg-[#f9fafb] px-3 py-2.5 text-xs text-vyria-navy sm:px-4 sm:text-sm"
            aria-label="Link de indicação"
          />
          <button
            type="button"
            onClick={copyLink}
            className={`inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-lg transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 sm:w-auto ${
              copied
                ? 'bg-emerald-600 text-white shadow-emerald-300/40 ring-2 ring-emerald-300'
                : 'bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 text-white shadow-orange-400/40 hover:brightness-110 hover:shadow-orange-400/55'
            }`}
            aria-live="polite"
          >
            {copied ? (
              <>
                <IconCheck className="h-4 w-4" />
                Copiado!
              </>
            ) : (
              'Copiar link'
            )}
          </button>
        </div>
      </section>

      {/* Lista de indicações */}
      <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm">
        <div className="border-b border-[var(--card-border)] px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-vyria-navy">Suas indicações</h2>
        </div>
        {data.referrals.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center sm:px-6 sm:py-12">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-rose-500 to-amber-400 text-white shadow-[0_8px_28px_rgba(244,63,94,0.35)] ring-2 ring-amber-200/60">
              <IconShare className="h-8 w-8" />
            </span>
            <p className="font-brand mt-4 text-lg font-bold text-vyria-navy">
              Sua primeira conquista está a um clique
            </p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-vyria-navy-muted">
              Envie seu link para outro lojista. Cada loja ativada vale{' '}
              {REFERRAL_POINTS_PER_ACTIVATION} pontos na trilha — e você sobe de nível a cada
              resgate.
            </p>
            <button
              type="button"
              onClick={copyLink}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-400/35 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            >
              <IconShare className="h-4 w-4" />
              {copied ? 'Link copiado!' : 'Copiar link e começar'}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]">
            {data.referrals.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm sm:px-6"
              >
                <div>
                  <p className="font-medium text-vyria-navy">{r.referred_store_name}</p>
                  <p className="text-xs text-vyria-navy-muted">
                    Cadastro em {dateFmt.format(new Date(r.created_at))}
                  </p>
                </div>
                <div className="text-right">
                  {r.status === 'activated' ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                      +{r.points_awarded} pts
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                      Aguardando ativação
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  )
}
