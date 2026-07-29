'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { StoreScaleState } from '@/lib/store-scale'
import type { ScaleConnectionType } from '@/lib/scale/types'
import {
  fetchScalePortsFromAgent,
  fetchScaleStatusFromAgent,
  fetchScaleWeightFromAgent,
  postScaleConfigureToAgent,
} from '@/lib/scale-agent-client'
import { updateStore } from '@/services/store'

const SCALE_SCHEMA_MIGRATION =
  'supabase/migrations/20260728100000_scale_integration_schema.sql'

function scaleSchemaError(msg: string, code?: string): string | null {
  if (
    /scale_|column|schema cache|does not exist/i.test(msg) ||
    code === 'PGRST204' ||
    code === 'NO_ROWS_UPDATED'
  ) {
    return `${msg || 'Configuração de balança em falta.'}\n\nAplica ${SCALE_SCHEMA_MIGRATION} no Supabase.`
  }
  return null
}

function ScaleSwitch({
  on,
  disabled,
  onToggle,
  label,
}: {
  on: boolean
  disabled: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]/35 disabled:opacity-50 ${
        on ? 'bg-[var(--dash-primary)]' : 'bg-[#d1d5db]'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1 left-1 block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function BalancaClient({
  storeId,
  scaleInitial,
  printAgentUrl,
  printAgentToken,
}: {
  storeId: string
  scaleInitial: StoreScaleState
  printAgentUrl: string
  printAgentToken: string
}) {
  const [scaleValues, setScaleValues] = useState<StoreScaleState>(scaleInitial)
  const [savingScale, setSavingScale] = useState(false)
  const [scalePortsBusy, setScalePortsBusy] = useState(false)
  const [scaleTestBusy, setScaleTestBusy] = useState(false)
  const [scalePorts, setScalePorts] = useState<
    Array<{ path: string; manufacturer?: string | null }>
  >([])
  const [scaleLiveReading, setScaleLiveReading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const agentUrlForScale = printAgentUrl.trim()
  const agentTokenForScale = printAgentToken.trim() || 'vyria-agent-2026'
  const scaleSectionBusy = savingScale || scalePortsBusy || scaleTestBusy

  useEffect(() => {
    setScaleValues(scaleInitial)
  }, [scaleInitial])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4500)
  }, [])

  async function saveScaleSettings(options?: { skipSuccessToast?: boolean }): Promise<boolean> {
    setSavingScale(true)
    setError(null)
    const { error: upErr } = await updateStore(storeId, {
      scale_enabled: scaleValues.scale_enabled,
      scale_connection: scaleValues.scale_connection,
      scale_brand: scaleValues.scale_brand,
      scale_protocol: scaleValues.scale_protocol,
      scale_baud_rate: scaleValues.scale_baud_rate,
      scale_auto_add_stable: scaleValues.scale_auto_add_stable,
      scale_plu_prefix: scaleValues.scale_plu_prefix.trim() || '2',
      scale_serial_port: scaleValues.scale_serial_port.trim(),
    })
    setSavingScale(false)
    if (upErr) {
      const msg = upErr.message || ''
      setError(
        scaleSchemaError(msg, upErr.code) ?? (msg || 'Não foi possível guardar a balança.')
      )
      return false
    }
    if (!options?.skipSuccessToast) {
      showToast('Configuração da balança guardada.')
    }
    return true
  }

  async function listScaleSerialPorts() {
    setError(null)
    const base = agentUrlForScale.replace(/\/+$/, '')
    if (!base || !/^https?:\/\//i.test(base)) {
      setError(
        'Configura primeiro o endereço do programa Vyria em Impressão → Wi-Fi na loja.'
      )
      return
    }
    setScalePortsBusy(true)
    setScalePorts([])
    try {
      const res = await fetchScalePortsFromAgent(base, agentTokenForScale)
      if (!res.ok) {
        setError(res.message)
        showToast(res.message)
        return
      }
      setScalePorts(res.data)
      if (res.data.length === 0) {
        showToast('Nenhuma porta serial encontrada no PC do programa.')
      } else if (res.data.length === 1) {
        setScaleValues((v) => ({ ...v, scale_serial_port: res.data[0]!.path }))
        showToast(`Porta ${res.data[0]!.path} selecionada.`)
      } else {
        showToast(`${res.data.length} portas encontradas — escolhe uma em baixo.`)
      }
    } finally {
      setScalePortsBusy(false)
    }
  }

  async function testScaleOnAgent() {
    setError(null)
    setScaleLiveReading(null)
    const base = agentUrlForScale.replace(/\/+$/, '')
    if (!base || !/^https?:\/\//i.test(base)) {
      setError('Configura o programa Vyria em Impressão antes de testar a balança.')
      return
    }
    if (!scaleValues.scale_serial_port.trim()) {
      setError('Indica a porta serial da balança (ex.: COM3 ou /dev/ttyUSB0).')
      return
    }
    setScaleTestBusy(true)
    try {
      const ok = await saveScaleSettings({ skipSuccessToast: true })
      if (!ok) return

      const cfg = await postScaleConfigureToAgent(base, agentTokenForScale, {
        path: scaleValues.scale_serial_port.trim(),
        baudRate: scaleValues.scale_baud_rate,
        protocol: scaleValues.scale_protocol,
      })
      if (!cfg.ok) {
        setError(cfg.message)
        showToast(cfg.message)
        return
      }

      const status = await fetchScaleStatusFromAgent(base, agentTokenForScale)
      if (!status.ok) {
        setError(status.message)
        showToast(status.message)
        return
      }

      const weight = await fetchScaleWeightFromAgent(base, agentTokenForScale)
      if (!weight.ok) {
        setError(weight.message)
        showToast(weight.message)
        return
      }

      const label = `${weight.data.weightKg.toFixed(3).replace('.', ',')} kg${
        weight.data.stable ? ' (estável)' : ' (instável)'
      }`
      setScaleLiveReading(label)
      showToast(`Leitura: ${label}`)
    } finally {
      setScaleTestBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-6">
      <header>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Balança
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Liga a balança ao PDV e ao Garçom — pesagem ao vivo ou leitura de etiquetas.
        </p>
      </header>

      {toast ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
          role="status"
        >
          {toast}
        </p>
      ) : null}

      {error ? (
        <p
          className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Balança no PDV</h2>
            <p className="mt-2 text-sm leading-relaxed text-vyria-navy-muted">
              O PDV tenta primeiro <strong>USB no navegador</strong> (Chrome/Edge); se não der, usa o{' '}
              <strong>programa Vyria</strong> com a balança ligada ao mesmo PC.
            </p>
          </div>
          <ScaleSwitch
            on={scaleValues.scale_enabled}
            disabled={scaleSectionBusy}
            onToggle={() =>
              setScaleValues((v) => ({ ...v, scale_enabled: !v.scale_enabled }))
            }
            label="Ativar balança no PDV"
          />
        </div>

        {scaleValues.scale_enabled ? (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-vyria-navy">
              Como ligar a balança
              <select
                className="mt-2 block w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy"
                value={scaleValues.scale_connection}
                disabled={scaleSectionBusy}
                onChange={(e) =>
                  setScaleValues((v) => ({
                    ...v,
                    scale_connection: e.target.value as ScaleConnectionType,
                  }))
                }
              >
                <option value="web_serial">USB no navegador (Chrome/Edge no PDV)</option>
                <option value="agent">USB no PC do programa Vyria (Print Agent)</option>
                <option value="barcode_only">Só etiqueta / código de barras</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-vyria-navy-muted">
                {scaleValues.scale_connection === 'web_serial'
                  ? 'O atendente liga a balança ao computador ou tablet onde abre o PDV.'
                  : scaleValues.scale_connection === 'agent'
                    ? (
                        <>
                          A balança fica no mesmo PC onde corre o programa Vyria. Configura o agente em{' '}
                          <Link
                            href="/dashboard/printing?hub=administracao"
                            className="font-semibold text-[var(--dash-primary)] underline"
                          >
                            Impressão
                          </Link>
                          .
                        </>
                      )
                    : 'Sem pesagem ao vivo — só leitura de etiqueta com leitor USB.'}
              </span>
            </label>

            {scaleValues.scale_connection === 'agent' ? (
              <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                <p className="text-sm font-semibold text-vyria-navy">Porta serial da balança</p>
                <p className="mt-1 text-xs text-vyria-navy-muted">
                  No Windows costuma ser <strong className="font-mono">COM3</strong>; no Linux{' '}
                  <strong className="font-mono">/dev/ttyUSB0</strong>. Também podes definir{' '}
                  <code className="rounded bg-white px-1 text-[11px]">SCALE_SERIAL_PATH</code> no
                  agente.
                </p>
                <input
                  className="mt-3 block w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-vyria-navy"
                  placeholder="COM3 ou /dev/ttyUSB0"
                  value={scaleValues.scale_serial_port}
                  disabled={scaleSectionBusy}
                  onChange={(e) =>
                    setScaleValues((v) => ({ ...v, scale_serial_port: e.target.value }))
                  }
                  autoComplete="off"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={scaleSectionBusy || !agentUrlForScale}
                    onClick={() => void listScaleSerialPorts()}
                    className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-vyria-navy hover:bg-[#f9fafb] disabled:opacity-50"
                  >
                    {scalePortsBusy ? 'A procurar portas…' : 'Listar portas no programa'}
                  </button>
                </div>
                {scalePorts.length > 1 ? (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Portas seriais">
                    {scalePorts.map((port) => (
                      <li key={port.path}>
                        <button
                          type="button"
                          disabled={scaleSectionBusy}
                          onClick={() => {
                            setScaleValues((v) => ({ ...v, scale_serial_port: port.path }))
                            setScalePorts([])
                            showToast(`${port.path} selecionada.`)
                          }}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-vyria-navy ring-1 ring-[var(--card-border)] hover:bg-[#f3f4f6] disabled:opacity-50"
                        >
                          {port.path}
                          {port.manufacturer ? ` · ${port.manufacturer}` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-vyria-navy-muted">
                Marca (opcional)
                <select
                  className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
                  value={scaleValues.scale_brand ?? ''}
                  disabled={scaleSectionBusy}
                  onChange={(e) =>
                    setScaleValues((v) => ({
                      ...v,
                      scale_brand: e.target.value
                        ? (e.target.value as StoreScaleState['scale_brand'])
                        : null,
                    }))
                  }
                >
                  <option value="">Não especificada</option>
                  <option value="toledo">Toledo</option>
                  <option value="filizola">Filizola</option>
                  <option value="urano">Urano</option>
                  <option value="generic">Genérica</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-vyria-navy-muted">
                Velocidade (baud)
                <select
                  className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
                  value={scaleValues.scale_baud_rate}
                  disabled={scaleSectionBusy}
                  onChange={(e) =>
                    setScaleValues((v) => ({
                      ...v,
                      scale_baud_rate: Number(e.target.value),
                    }))
                  }
                >
                  <option value={2400}>2400</option>
                  <option value={4800}>4800</option>
                  <option value={9600}>9600</option>
                  <option value={19200}>19200</option>
                </select>
              </label>
            </div>

            <label className="block text-xs font-medium text-vyria-navy-muted">
              Prefixo PLU nas etiquetas EAN-13
              <input
                className="mt-1 block w-full max-w-[8rem] rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm font-mono text-vyria-navy"
                inputMode="numeric"
                maxLength={1}
                value={scaleValues.scale_plu_prefix}
                disabled={scaleSectionBusy}
                onChange={(e) =>
                  setScaleValues((v) => ({ ...v, scale_plu_prefix: e.target.value }))
                }
              />
              <span className="mt-1 block text-[11px] text-vyria-navy-muted">
                Padrão varejo BR: <strong>2</strong>
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3">
              <ScaleSwitch
                on={scaleValues.scale_auto_add_stable}
                disabled={scaleSectionBusy}
                onToggle={() =>
                  setScaleValues((v) => ({
                    ...v,
                    scale_auto_add_stable: !v.scale_auto_add_stable,
                  }))
                }
                label="Adicionar ao carrinho quando o peso estabilizar"
              />
              <span className="text-sm text-vyria-navy">
                Adicionar automaticamente quando o peso estabilizar
              </span>
            </label>

            {scaleLiveReading ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Última leitura: <strong>{scaleLiveReading}</strong>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={scaleSectionBusy}
                onClick={() => void saveScaleSettings()}
                className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
              >
                {savingScale ? 'A guardar…' : 'Guardar balança'}
              </button>
              {scaleValues.scale_connection === 'agent' ? (
                <button
                  type="button"
                  disabled={scaleSectionBusy || !agentUrlForScale}
                  onClick={() => void testScaleOnAgent()}
                  className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy hover:bg-[#f9fafb] disabled:opacity-50"
                >
                  {scaleTestBusy ? 'A testar…' : 'Testar leitura no programa'}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-vyria-navy-muted">
            Ativa para pesar produtos vendidos por kg no PDV e Garçom. Configura produtos pesáveis no{' '}
            <Link href="/dashboard/menu?hub=administracao" className="font-semibold text-[var(--dash-primary)] underline">
              cardápio
            </Link>{' '}
            (badge <strong>kg</strong>).
          </p>
        )}
      </section>
    </div>
  )
}
