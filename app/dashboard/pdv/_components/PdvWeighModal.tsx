'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MenuProductRow } from '@/lib/menu-product'
import {
  fetchScaleWeightFromAgent,
  postScaleConfigureToAgent,
  postScaleTareToAgent,
} from '@/lib/scale-agent-client'
import {
  getSharedScaleClient,
  type ScaleClientStatus,
} from '@/lib/scale-client'
import { resolvePdvScaleLiveMode } from '@/lib/scale/resolve-scale-mode'
import { weighableLineTotal } from '@/lib/scale/price'
import type { ScaleReading } from '@/lib/scale/types'
import type { PdvScaleContext } from '@/lib/store-scale'
import {
  effectivePricePerKg,
  formatPricePerKg,
  formatWeightKg,
  validateWeighableLineWeight,
} from '@/lib/weighable-product'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const AGENT_POLL_MS = 250

type Props = {
  open: boolean
  product: MenuProductRow | null
  scaleConfig: PdvScaleContext
  onClose: () => void
  onConfirm: (weightKg: number) => void
}

export function PdvWeighModal({
  open,
  product,
  scaleConfig,
  onClose,
  onConfirm,
}: Props) {
  const liveMode = useMemo(
    () => resolvePdvScaleLiveMode(scaleConfig),
    [scaleConfig]
  )

  const [reading, setReading] = useState<ScaleReading | null>(null)
  const [status, setStatus] = useState<ScaleClientStatus>('disconnected')
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [agentReady, setAgentReady] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const agentConnectedRef = useRef(false)

  const pricePerKg = product ? effectivePricePerKg(product) ?? 0 : 0

  const activeWeightKg = useMemo(() => {
    if (manualMode) {
      const n = Number(manualInput.replace(',', '.'))
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    return reading?.weightKg ?? 0
  }, [manualMode, manualInput, reading])

  const lineTotal = useMemo(
    () => (activeWeightKg > 0 ? weighableLineTotal(pricePerKg, activeWeightKg) : 0),
    [activeWeightKg, pricePerKg]
  )

  const scaleConnected =
    liveMode === 'web_serial'
      ? status === 'connected'
      : liveMode === 'agent'
        ? agentReady
        : false

  const canConfirm = useMemo(() => {
    if (!product || activeWeightKg <= 0) return false
    const check = validateWeighableLineWeight(product, activeWeightKg)
    if (!check.ok) return false
    if (manualMode) return true
    return reading?.stable === true
  }, [product, activeWeightKg, manualMode, reading?.stable])

  useEffect(() => {
    if (!open) {
      setReading(null)
      setManualMode(false)
      setManualInput('')
      setError(null)
      setConnecting(false)
      setAgentReady(false)
      agentConnectedRef.current = false
      setStatus('disconnected')
      setStatusDetail(null)
      return
    }

    if (liveMode === 'web_serial') {
      const client = getSharedScaleClient()
      const unsubReading = client.subscribe(setReading)
      const unsubStatus = client.subscribeStatus((s, detail) => {
        setStatus(s)
        setStatusDetail(detail ?? null)
      })
      setReading(client.getLastReading())
      setStatus(client.getStatus())
      return () => {
        unsubReading()
        unsubStatus()
      }
    }

    return undefined
  }, [open, liveMode])

  useEffect(() => {
    if (!open || liveMode !== 'agent' || !scaleConfig.agentUrl) return

    let cancelled = false
    let configured = false

    async function tick() {
      if (cancelled) return

      if (!configured && scaleConfig.scale_serial_port) {
        const cfg = await postScaleConfigureToAgent(
          scaleConfig.agentUrl,
          scaleConfig.agentToken,
          {
            path: scaleConfig.scale_serial_port,
            baudRate: scaleConfig.scale_baud_rate,
            protocol: scaleConfig.scale_protocol,
          }
        )
        if (cancelled) return
        configured = true
        if (!cfg.ok) {
          setAgentReady(false)
          setStatus('error')
          setStatusDetail(cfg.message)
          return
        }
        setAgentReady(cfg.data.connected)
        setStatus(cfg.data.connected ? 'connected' : 'connecting')
      } else if (!configured) {
        configured = true
      }

      const res = await fetchScaleWeightFromAgent(
        scaleConfig.agentUrl,
        scaleConfig.agentToken
      )
      if (cancelled) return
      if (res.ok) {
        setReading(res.data)
        setAgentReady(true)
        agentConnectedRef.current = true
        setStatus('connected')
        setStatusDetail(null)
      } else if (!agentConnectedRef.current) {
        setStatus('error')
        setStatusDetail(res.message)
      }
    }

    void tick()
    const interval = window.setInterval(() => void tick(), AGENT_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [
    open,
    liveMode,
    scaleConfig.agentUrl,
    scaleConfig.agentToken,
    scaleConfig.scale_serial_port,
    scaleConfig.scale_baud_rate,
    scaleConfig.scale_protocol,
  ])

  const connectWebSerial = useCallback(async () => {
    setError(null)
    setConnecting(true)
    try {
      const client = getSharedScaleClient()
      client.resetTare()
      await client.connect({
        baudRate: scaleConfig.scale_baud_rate,
        poll: scaleConfig.scale_protocol === 'toledo_p03',
      })
      setManualMode(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ligar a balança.')
    } finally {
      setConnecting(false)
    }
  }, [scaleConfig.scale_baud_rate, scaleConfig.scale_protocol])

  const handleTare = useCallback(async () => {
    setError(null)
    if (liveMode === 'agent' && scaleConfig.agentUrl) {
      const res = await postScaleTareToAgent(
        scaleConfig.agentUrl,
        scaleConfig.agentToken
      )
      if (!res.ok) {
        setError(res.message)
        return
      }
      setReading(res.data)
      return
    }
    getSharedScaleClient().tare()
  }, [liveMode, scaleConfig.agentUrl, scaleConfig.agentToken])

  const handleConfirm = useCallback(() => {
    if (!product) return
    const check = validateWeighableLineWeight(product, activeWeightKg)
    if (!check.ok) {
      setError(check.error)
      return
    }
    if (!manualMode && !reading?.stable) {
      setError('Aguarda o peso estabilizar na balança ou usa entrada manual.')
      return
    }
    onConfirm(activeWeightKg)
    onClose()
  }, [product, activeWeightKg, manualMode, reading?.stable, onConfirm, onClose])

  if (!open || !product) return null

  const showLiveScaleUi =
    scaleConfig.scale_enabled && (liveMode === 'web_serial' || liveMode === 'agent')

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdv-weigh-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[var(--card-border)] bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-[var(--card-border)] px-4 py-3">
          <h2 id="pdv-weigh-title" className="font-brand text-lg font-bold text-vyria-navy">
            Pesagem
          </h2>
          <p className="mt-0.5 truncate text-sm text-vyria-navy-muted">{product.name}</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--dash-primary)]">
            {formatPricePerKg(pricePerKg)} / kg
          </p>
          {liveMode === 'agent' ? (
            <p className="mt-1 text-[11px] font-medium text-vyria-navy-muted">
              Via Print Agent · {scaleConfig.agentUrl || 'URL não configurada'}
            </p>
          ) : null}
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}

          <div className="rounded-2xl border border-[var(--card-border)] bg-zinc-50 px-4 py-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
              Peso líquido
            </p>
            <p className="mt-2 font-mono text-4xl font-bold tabular-nums text-vyria-navy">
              {formatWeightKg(activeWeightKg)}{' '}
              <span className="text-xl font-semibold text-vyria-navy-muted">kg</span>
            </p>
            <p className="mt-2 text-lg font-bold tabular-nums text-[var(--dash-primary)]">
              {money.format(lineTotal)}
            </p>
            {!manualMode ? (
              <p
                className={`mt-3 text-xs font-semibold ${
                  reading?.stable ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {reading?.stable ? '● Peso estável' : '○ Aguardando estabilizar…'}
              </p>
            ) : (
              <p className="mt-3 text-xs font-medium text-vyria-navy-muted">
                Entrada manual de peso
              </p>
            )}
          </div>

          {showLiveScaleUi ? (
            <div className="flex flex-wrap gap-2">
              {liveMode === 'web_serial' && status !== 'connected' ? (
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void connectWebSerial()}
                  className="flex-1 rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {connecting ? 'A ligar…' : 'Ligar balança (USB)'}
                </button>
              ) : null}
              {scaleConnected ? (
                <button
                  type="button"
                  onClick={() => void handleTare()}
                  className="flex-1 rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy"
                >
                  Tara
                </button>
              ) : liveMode === 'agent' ? (
                <p className="flex-1 rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-xs text-vyria-navy-muted">
                  {statusDetail || 'A ligar ao Print Agent…'}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setManualMode((m) => !m)
                  setError(null)
                }}
                className="flex-1 rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy"
              >
                {manualMode ? 'Usar balança' : 'Peso manual'}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {liveMode === 'manual'
                ? 'Sem balança configurada — introduza o peso manualmente ou configure em Impressão / balança.'
                : 'Leitura ao vivo indisponível neste navegador.'}
            </div>
          )}

          {manualMode || !showLiveScaleUi ? (
            <label className="block text-sm font-medium text-vyria-navy">
              Peso (kg)
              <input
                className="mt-1 w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm font-mono"
                inputMode="decimal"
                placeholder="0,000"
                value={manualInput}
                onChange={(e) => {
                  setManualInput(e.target.value)
                  setError(null)
                }}
                autoFocus
              />
            </label>
          ) : null}

          {statusDetail && status === 'error' && liveMode === 'web_serial' ? (
            <p className="text-xs text-red-700">{statusDetail}</p>
          ) : null}

          {product.default_tare_kg > 0 ? (
            <p className="text-xs text-vyria-navy-muted">
              Tara padrão do produto: {formatWeightKg(product.default_tare_kg)} kg
              {scaleConnected ? ' — use «Tara» no prato antes de pesar.' : ''}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-[var(--card-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-vyria-navy"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="flex-1 rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  )
}
