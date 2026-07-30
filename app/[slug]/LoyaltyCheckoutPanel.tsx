'use client'

import { useEffect, useState } from 'react'
import type { CustomerLoyaltyBalance, PublicLoyaltyProgram } from '@/lib/loyalty/types'
import { formatLoyaltyMoney } from '@/lib/loyalty/utils'

type Props = {
  storeSlug: string
  program: PublicLoyaltyProgram
  customerPhone: string
  orderTotal: number
  redeemEnabled: boolean
  redeemPoints: number
  onRedeemEnabledChange: (enabled: boolean) => void
  onRedeemPointsChange: (points: number) => void
}

export function LoyaltyCheckoutPanel({
  storeSlug,
  program,
  customerPhone,
  orderTotal,
  redeemEnabled,
  redeemPoints,
  onRedeemEnabledChange,
  onRedeemPointsChange,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState<CustomerLoyaltyBalance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, '')
    if (!program.enabled || digits.length < 10 || orderTotal <= 0) {
      setBalance(null)
      setError(null)
      onRedeemEnabledChange(false)
      onRedeemPointsChange(0)
      return
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        setError(null)
        try {
          const qs = new URLSearchParams({
            slug: storeSlug,
            phone: digits,
            orderTotal: String(orderTotal),
          })
          const res = await fetch(`/api/public/loyalty/balance?${qs}`)
          const json = (await res.json()) as {
            balance?: CustomerLoyaltyBalance | null
            error?: string
          }
          if (!res.ok) throw new Error(json.error || 'Falha ao consultar pontos.')
          setBalance(json.balance ?? null)
          if (json.balance?.can_redeem) {
            onRedeemPointsChange(json.balance.max_redeem_points)
          } else {
            onRedeemEnabledChange(false)
            onRedeemPointsChange(0)
          }
        } catch (e) {
          setBalance(null)
          setError(e instanceof Error ? e.message : 'Erro ao consultar pontos.')
        } finally {
          setLoading(false)
        }
      })()
    }, 450)

    return () => window.clearTimeout(timer)
  }, [
    customerPhone,
    onRedeemEnabledChange,
    onRedeemPointsChange,
    orderTotal,
    program.enabled,
    storeSlug,
  ])

  if (!program.enabled) return null

  const discountBrl =
    redeemEnabled && balance
      ? Math.min(
          orderTotal,
          Math.round(
            ((redeemPoints * balance.redeem_cents_per_point) / 100) * 100
          ) / 100
        )
      : 0

  return (
    <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-900">Programa de fidelidade</p>
          <p className="mt-1 text-xs text-emerald-800/80">
            Ganhe {program.points_per_real} pt(s) por R$ 1,00 gasto.
          </p>
        </div>
        {loading ? (
          <span className="text-xs text-emerald-700">A consultar…</span>
        ) : balance ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-emerald-800">
            {balance.balance} pts
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {!loading && balance && balance.can_redeem ? (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-emerald-900">
            <input
              type="checkbox"
              checked={redeemEnabled}
              onChange={(e) => {
                onRedeemEnabledChange(e.target.checked)
                onRedeemPointsChange(
                  e.target.checked ? balance.max_redeem_points : 0
                )
              }}
            />
            Usar pontos neste pedido
          </label>
          {redeemEnabled ? (
            <>
              <label className="block text-xs font-medium text-emerald-900">
                Pontos a resgatar (máx. {balance.max_redeem_points})
                <input
                  type="number"
                  min={balance.min_redeem_points}
                  max={balance.max_redeem_points}
                  value={redeemPoints}
                  onChange={(e) =>
                    onRedeemPointsChange(
                      Math.max(0, Math.floor(Number(e.target.value) || 0))
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <p className="text-xs font-semibold text-emerald-800">
                Desconto: −{formatLoyaltyMoney(discountBrl)}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {!loading && balance && !balance.can_redeem && balance.balance > 0 ? (
        <p className="mt-2 text-xs text-emerald-800/90">
          Você tem {balance.balance} pts. Mínimo para resgatar:{' '}
          {program.min_redeem_points} pts.
        </p>
      ) : null}

      {!loading && balance && balance.balance === 0 ? (
        <p className="mt-2 text-xs text-emerald-800/90">
          Você ainda não tem pontos. Este pedido pode gerar pontos após a entrega.
        </p>
      ) : null}
    </div>
  )
}
