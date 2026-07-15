'use client'

import { useCallback, useEffect, useState } from 'react'
import { FiscalChecklist } from '@/app/dashboard/fiscal/_components/FiscalChecklist'
import { FiscalUpsell } from '@/app/dashboard/fiscal/_components/FiscalUpsell'
import { FiscalWelcomeStep } from '@/app/dashboard/fiscal/_components/FiscalWelcomeStep'
import { FiscalSettingsCard } from '@/app/dashboard/settings/_components/FiscalSettingsCard'
import { canAccessFiscalSettings, parseFiscalStatus, type FiscalStatus } from '@/lib/fiscal'
import { getFiscalDisplayLabel, type FiscalReadinessResult } from '@/lib/fiscal-readiness'

export function FiscalOnboardingClient({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState<FiscalStatus>('nao_configurado')
  const [sefazCredenciado, setSefazCredenciado] = useState(false)
  const [readiness, setReadiness] = useState<FiscalReadinessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [fiscalRes, readinessRes] = await Promise.all([
        fetch(`/api/store/fiscal?storeId=${encodeURIComponent(storeId)}`, { credentials: 'include' }),
        fetch(`/api/store/fiscal/readiness?storeId=${encodeURIComponent(storeId)}`, {
          credentials: 'include',
        }),
      ])
      const fiscalJson = (await fiscalRes.json()) as { fiscal?: Record<string, unknown> }
      const readinessJson = (await readinessRes.json()) as {
        readiness?: FiscalReadinessResult
        status?: string
      }
      if (fiscalRes.ok && fiscalJson.fiscal) {
        setStatus(parseFiscalStatus(fiscalJson.fiscal.status))
        setSefazCredenciado(Boolean(fiscalJson.fiscal.sefazCredenciado))
      }
      if (readinessRes.ok && readinessJson.readiness) {
        setReadiness(readinessJson.readiness)
        if (readinessJson.status) setStatus(parseFiscalStatus(readinessJson.status))
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSync() {
    setSyncBusy(true)
    setActionMsg(null)
    setActionError(null)
    try {
      const res = await fetch('/api/store/fiscal/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ storeId }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setActionError(data.error || 'Falha ao sincronizar com a Brasil NFe.')
        return
      }
      setActionMsg('Empresa sincronizada com a Brasil NFe.')
      await refresh()
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleSolicitarAtivacao() {
    setSubmitBusy(true)
    setActionMsg(null)
    setActionError(null)
    try {
      const res = await fetch('/api/store/fiscal/solicitar-ativacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ storeId }),
      })
      const data = (await res.json()) as {
        error?: string
        pending?: Array<{ label: string; hint?: string }>
      }
      if (!res.ok) {
        if (data.pending?.length) {
          setActionError(
            `${data.error || 'Configuração incompleta.'}\n${data.pending
              .slice(0, 5)
              .map((p) => `• ${p.label}`)
              .join('\n')}`
          )
        } else {
          setActionError(data.error || 'Não foi possível solicitar ativação.')
        }
        await refresh()
        return
      }
      setActionMsg('Solicitação enviada! A Vyria vai revisar e ativar a emissão em breve.')
      await refresh()
    } finally {
      setSubmitBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-[#9ca3af]">A carregar…</p>
  }

  if (status === 'bloqueado') {
    return <FiscalUpsell status="bloqueado" />
  }

  if (status === 'nao_configurado' && !sefazCredenciado && !showWelcome) {
    return (
      <FiscalUpsell
        status={status}
        showBeginButton
        onBeginConfig={() => setShowWelcome(true)}
      />
    )
  }

  if (!canAccessFiscalSettings(status) && !sefazCredenciado) {
    return <FiscalWelcomeStep storeId={storeId} onStarted={() => void refresh()} />
  }

  const ready = readiness?.ready ?? false
  const displayLabel = getFiscalDisplayLabel(status, ready)
  const submitted = status === 'pending_review'
  const isActive = status === 'ativo'

  return (
    <div className="space-y-6">
      {submitted ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sua documentação foi enviada e está <strong>pronta para aprovação</strong>. A Vyria vai
          revisar certificado, CSC e sincronização antes de liberar a emissão.
        </p>
      ) : null}

      {isActive ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Módulo fiscal <strong>ativo</strong>. Você já pode emitir NFC-e nos pedidos.
        </p>
      ) : null}

      {readiness ? (
        <FiscalChecklist items={readiness.items} pendingCount={readiness.pendingCount} />
      ) : null}

      <FiscalSettingsCard
        storeId={storeId}
        displayLabel={displayLabel}
        onUpdated={() => void refresh()}
      />

      {!submitted && !isActive ? (
        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 md:p-6">
          <h3 className="text-sm font-bold text-[#1a1614]">Finalizar configuração</h3>
          <p className="mt-1 text-xs text-[#6b7280]">
            Sincronize com a Brasil NFe após preencher os dados da empresa e o CSC. Quando o
            checklist estiver completo, solicite a ativação.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => void handleSync()}
              className="rounded-xl border border-[var(--dash-primary)]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[var(--dash-primary)] hover:bg-[var(--dash-primary)]/5 disabled:opacity-50"
            >
              {syncBusy ? 'Sincronizando…' : 'Sincronizar com Brasil NFe'}
            </button>
            <button
              type="button"
              disabled={submitBusy || !ready}
              onClick={() => void handleSolicitarAtivacao()}
              title={!ready ? 'Complete o checklist fiscal antes de solicitar' : undefined}
              className="rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 hover:brightness-105 disabled:opacity-50"
            >
              {submitBusy ? 'Enviando…' : 'Solicitar ativação'}
            </button>
          </div>

          {actionMsg ? <p className="mt-3 text-sm text-emerald-700">{actionMsg}</p> : null}
          {actionError ? (
            <p className="mt-3 whitespace-pre-line text-sm text-red-600">{actionError}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
