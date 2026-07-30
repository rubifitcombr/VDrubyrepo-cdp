'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type {
  LoyaltyAccountRow,
  LoyaltyLedgerRow,
  LoyaltySummary,
  StoreLoyaltyConfig,
} from '@/lib/loyalty/types'

function moneyFromPoints(points: number, centsPerPoint: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((points * centsPerPoint) / 100)
}

export function FidelidadeMasterClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [config, setConfig] = useState<StoreLoyaltyConfig | null>(null)
  const [summary, setSummary] = useState<LoyaltySummary | null>(null)
  const [members, setMembers] = useState<LoyaltyAccountRow[]>([])
  const [ledger, setLedger] = useState<LoyaltyLedgerRow[]>([])

  const [adjustPhone, setAdjustPhone] = useState('')
  const [adjustName, setAdjustName] = useState('')
  const [adjustPoints, setAdjustPoints] = useState('')
  const [adjustNote, setAdjustNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/master/loyalty/config')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar.')
      setConfig(json.config)
      setSummary(json.summary)
      setMembers(json.members ?? [])
      setLedger(json.ledger ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveConfig(patch: Partial<StoreLoyaltyConfig>) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/loyalty/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao guardar.')
      setConfig(json.config)
      setSuccess('Configurações guardadas.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/master/loyalty/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_phone: adjustPhone,
          customer_name: adjustName || null,
          points_delta: Number(adjustPoints),
          note: adjustNote || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha no ajuste.')
      setSuccess('Pontos actualizados.')
      setAdjustPhone('')
      setAdjustName('')
      setAdjustPoints('')
      setAdjustNote('')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no ajuste.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-vyria-navy-muted">A carregar…</p>
  }

  if (!config) return null

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['Membros', String(summary?.members_count ?? 0)],
          ['Pontos em circulação', String(summary?.total_points_outstanding ?? 0)],
          ['Total distribuído', String(summary?.total_lifetime_earned ?? 0)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
              {label}
            </p>
            <p className="mt-2 font-brand text-2xl font-bold text-vyria-navy">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Regras do programa</h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Pontos por real gasto, resgate mínimo e bónus de boas-vindas.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={saving}
              onChange={(e) => void saveConfig({ enabled: e.target.checked })}
            />
            Programa activo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.whatsapp_balance_enabled}
              disabled={saving}
              onChange={(e) =>
                void saveConfig({ whatsapp_balance_enabled: e.target.checked })
              }
            />
            Consulta de saldo pelo WhatsApp
          </label>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Pontos por R$ 1,00</span>
            <input
              type="number"
              min={0}
              step={0.1}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.points_per_real}
              onBlur={(e) =>
                void saveConfig({ points_per_real: Number(e.target.value) })
              }
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Mínimo para resgatar (pontos)</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.min_redeem_points}
              onBlur={(e) =>
                void saveConfig({ min_redeem_points: Number(e.target.value) })
              }
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Valor do ponto (centavos)</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.redeem_cents_per_point}
              onBlur={(e) =>
                void saveConfig({ redeem_cents_per_point: Number(e.target.value) })
              }
            />
            <span className="mt-1 block text-xs text-vyria-navy-muted">
              Ex.: 100 pts ={' '}
              {moneyFromPoints(100, config.redeem_cents_per_point)}
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Bónus de boas-vindas (pontos)</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              defaultValue={config.welcome_bonus_points}
              onBlur={(e) =>
                void saveConfig({ welcome_bonus_points: Number(e.target.value) })
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Ajuste manual de pontos</h2>
        <form onSubmit={handleAdjust} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Telefone (WhatsApp)</span>
            <input
              required
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={adjustPhone}
              onChange={(e) => setAdjustPhone(e.target.value)}
              placeholder="5511999999999"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Nome (opcional)</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={adjustName}
              onChange={(e) => setAdjustName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Pontos (+ ou −)</span>
            <input
              required
              type="number"
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={adjustPoints}
              onChange={(e) => setAdjustPoints(e.target.value)}
              placeholder="50 ou -20"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-vyria-navy">Nota (opcional)</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-vyria-gradient rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              Aplicar ajuste
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Membros</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">
            Nenhum cliente com pontos ainda. Os pontos serão creditados automaticamente nos
            pedidos quando o programa estiver activo.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-vyria-navy-muted">
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Telefone</th>
                  <th className="py-2 pr-4">Saldo</th>
                  <th className="py-2">Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.customer_phone} className="border-b border-[var(--card-border)]">
                    <td className="py-2 pr-4">{m.customer_name || '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{m.customer_phone}</td>
                    <td className="py-2 pr-4 font-semibold">{m.points_balance} pts</td>
                    <td className="py-2 text-vyria-navy-muted">
                      {m.last_order_at
                        ? new Date(m.last_order_at).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Movimentos recentes</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-vyria-navy-muted">Sem movimentos.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--card-border)]">
            {ledger.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="font-mono text-xs text-vyria-navy-muted">
                    {row.customer_phone}
                  </span>
                  <span className="mx-2 text-vyria-navy-muted">·</span>
                  <span className="text-vyria-navy">{row.kind}</span>
                  {row.note ? (
                    <span className="ml-2 text-vyria-navy-muted">({row.note})</span>
                  ) : null}
                </div>
                <div className="text-right">
                  <span
                    className={
                      row.points_delta >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }
                  >
                    {row.points_delta >= 0 ? '+' : ''}
                    {row.points_delta} pts
                  </span>
                  <time className="mt-0.5 block text-xs text-vyria-navy-muted">
                    {new Date(row.created_at).toLocaleString('pt-BR')}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-sm text-vyria-navy-muted">
        <Link href="/dashboard/master" className="font-semibold text-vyria-plum hover:underline">
          ← Voltar ao hub Master
        </Link>
      </p>
    </div>
  )
}
