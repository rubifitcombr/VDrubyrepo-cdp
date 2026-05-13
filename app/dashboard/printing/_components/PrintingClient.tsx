'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StorePrintingKey, StorePrintingState } from '@/lib/store-printing'
import {
  getPrintSerialBaud,
  PRINT_SERIAL_BAUD_OPTIONS,
  setPrintSerialBaud,
} from '@/lib/print/device-prefs'
import type { PaperMm } from '@/lib/print/layout'
import { openPrintingPreviewPopup } from '@/lib/printing-preview-window'
import { updateStore } from '@/services/store'
import { IconPrinter } from '@/app/dashboard/_components/NavIcons'
import { ReceiptPreview } from './ReceiptPreview'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'

function PrintSwitch({
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

const LEGACY_ROWS: Array<{
  key: StorePrintingKey
  title: string
  description: string
}> = [
  {
    key: 'print_auto_on_confirm',
    title: 'Impressão automática (navegador)',
    description:
      'Ao entrar em «Preparando», abre o cupom no browser (pop-up) quando a automação ou esta opção estiver ativa.',
  },
  {
    key: 'print_include_customer_details',
    title: 'Imprimir detalhes do cliente',
    description: 'Incluir nome, telefone e endereço na impressão.',
  },
  {
    key: 'print_delivery_copy',
    title: 'Cópia para entregador',
    description: 'Imprimir segunda via para o entregador.',
  },
]

const THERMAL_AUTO_ROWS: Array<{
  key: StorePrintingKey
  title: string
  description: string
}> = [
  {
    key: 'print_auto_delivery',
    title: 'Delivery / link do cardápio',
    description:
      'Pedidos `site_live`, `site_start` ou retirada no site (`site_pickup`).',
  },
  {
    key: 'print_auto_autoatendimento',
    title: 'Autoatendimento (QR Code mesa)',
    description: 'Pedidos criados pelo cliente no salão via QR.',
  },
  {
    key: 'print_auto_pdv',
    title: 'PDV balcão',
    description: 'Vendas registadas no PDV.',
  },
  {
    key: 'print_auto_garcom',
    title: 'Garçom',
    description: 'Pedidos criados no painel Garçom.',
  },
]

export function PrintingClient({
  storeId,
  storeName,
  deliveryFee,
  initial,
}: {
  storeId: string
  storeName: string
  deliveryFee: number
  initial: StorePrintingState
}) {
  const [values, setValues] = useState<StorePrintingState>(initial)
  const [savingKey, setSavingKey] = useState<StorePrintingKey | null>(null)
  const [savingPaper, setSavingPaper] = useState(false)
  const [savingAgent, setSavingAgent] = useState(false)
  const [serialBaud, setSerialBaud] = useState(() => getPrintSerialBaud())
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null)
  const [busyHealth, setBusyHealth] = useState(false)
  const [busyTestPrint, setBusyTestPrint] = useState(false)

  useEffect(() => {
    setValues(initial)
  }, [initial])

  const fee = useMemo(
    () => (Number.isFinite(deliveryFee) && deliveryFee >= 0 ? deliveryFee : 5.99),
    [deliveryFee]
  )

  const agentConfigured = Boolean(
    values.print_agent_url?.trim() &&
      values.print_printer_ip?.trim() &&
      /^https?:\/\//i.test(values.print_agent_url.trim())
  )

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4500)
  }, [])

  const printPreviewToWindow = useCallback(() => {
    const ok = openPrintingPreviewPopup({
      storeName,
      fee,
      values: {
        print_include_customer_details: values.print_include_customer_details,
        print_delivery_copy: values.print_delivery_copy,
        print_paper_mm: values.print_paper_mm,
      },
      returnPath: '/dashboard/printing',
    })
    if (!ok) {
      alert('Permite pop-ups para testar a impressão.')
    }
  }, [fee, storeName, values.print_delivery_copy, values.print_include_customer_details, values.print_paper_mm])

  async function toggle(key: StorePrintingKey) {
    const next = !values[key]
    const prev = values[key]
    setValues((v) => ({ ...v, [key]: next }))
    setError(null)
    setSavingKey(key)
    const { error: upErr } = await updateStore(storeId, { [key]: next })
    setSavingKey(null)
    if (upErr) {
      setValues((v) => ({ ...v, [key]: prev }))
      const msg = upErr.message || ''
      setError(
        /print_|column/i.test(msg) || upErr.code === 'PGRST204'
          ? 'Aplica a migração SQL em supabase/migrations/20260513120000_store_thermal_print_agent.sql (ou equivalente) no Supabase.'
          : msg || 'Não foi possível guardar.'
      )
    }
  }

  async function savePaperMm(mm: PaperMm) {
    if (mm === values.print_paper_mm) return
    const prev = values.print_paper_mm
    setValues((v) => ({ ...v, print_paper_mm: mm }))
    setError(null)
    setSavingPaper(true)
    const { error: upErr } = await updateStore(storeId, { print_paper_mm: mm })
    setSavingPaper(false)
    if (upErr) {
      setValues((v) => ({ ...v, print_paper_mm: prev }))
      const msg = upErr.message || ''
      setError(
        /print_paper|column/i.test(msg) || upErr.code === 'PGRST204'
          ? 'Executa o script scripts/supabase-store-print-paper.sql no Supabase.'
          : msg || 'Não foi possível guardar.'
      )
    }
  }

  async function saveAgentAndPrinter() {
    setSavingAgent(true)
    setError(null)
    const port = Number.parseInt(String(values.print_printer_port), 10)
    const { error: upErr } = await updateStore(storeId, {
      print_agent_url: values.print_agent_url.trim(),
      print_agent_token: values.print_agent_token.trim() || 'vyria-agent-2026',
      print_printer_ip: values.print_printer_ip.trim(),
      print_printer_port:
        Number.isFinite(port) && port > 0 ? port : 9100,
    })
    setSavingAgent(false)
    if (upErr) {
      const msg = upErr.message || ''
      setError(
        /print_|column/i.test(msg) || upErr.code === 'PGRST204'
          ? 'Aplica a migração SQL em supabase/migrations/20260513120000_store_thermal_print_agent.sql no Supabase.'
          : msg || 'Não foi possível guardar.'
      )
      return
    }
    showToast('Configurações guardadas.')
  }

  async function testAgentHealth() {
    const base = values.print_agent_url?.trim().replace(/\/+$/, '')
    if (!base || !/^https?:\/\//i.test(base)) {
      setAgentOnline(null)
      setError('Indica uma URL válida do agente (http://… ou https://…).')
      return
    }
    setBusyHealth(true)
    setError(null)
    try {
      const res = await fetch(`${base}/health`, { method: 'GET' })
      setAgentOnline(res.ok)
      if (!res.ok) showToast('Agente offline ou URL incorreta.')
      else showToast('Agente respondeu ao health check.')
    } catch {
      setAgentOnline(false)
      showToast('Não foi possível contactar o agente (rede / URL).')
    } finally {
      setBusyHealth(false)
    }
  }

  async function testThermalPrint() {
    setBusyTestPrint(true)
    setError(null)
    try {
      const res = await dashboardFetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, test: true }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
      if (!res.ok || !json.ok) {
        showToast(json.error || 'Erro ao imprimir teste.')
        return
      }
      showToast('Cupom de teste enviado à impressora.')
    } catch {
      showToast('Erro de rede ao imprimir teste.')
    } finally {
      setBusyTestPrint(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Impressão
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Térmica Wi-Fi (agente local + ESC/POS) e opções de cupom no navegador.
        </p>
      </div>

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
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Bloco 1 — Estado */}
      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Estado da ligação</h2>
        {!values.print_agent_url?.trim() ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Impressão não configurada</p>
            <p className="mt-1 text-amber-900/95">
              Para imprimir pelo telemóvel ou tablet, configura o agente Node na rede Wi-Fi da loja
              e o IP da impressora térmica.
            </p>
            <p className="mt-2">
              <a href="#instrucoes-agente" className="font-semibold text-amber-950 underline">
                Ver instruções de instalação
              </a>
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              disabled={busyHealth}
              onClick={() => void testAgentHealth()}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
            >
              {busyHealth ? 'A testar…' : 'Testar ligação'}
            </button>
            <button
              type="button"
              disabled={busyTestPrint || !agentConfigured}
              onClick={() => void testThermalPrint()}
              className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
            >
              {busyTestPrint ? 'A imprimir…' : 'Imprimir teste'}
            </button>
            {agentOnline === null ? (
              <span className="text-xs text-vyria-navy-muted">
                Usa «Testar ligação» para verificar o agente.
              </span>
            ) : agentOnline ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Agente online
              </span>
            ) : (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 ring-1 ring-red-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                Agente offline
              </span>
            )}
          </div>
        )}
      </section>

      {/* Bloco 2 — Agente */}
      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Agente local</h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          O servidor Vyria na nuvem chama este URL; o agente na loja encaminha dados para a
          impressora na porta 9100.
        </p>
        <label className="mt-4 block text-xs font-medium text-vyria-navy-muted">
          URL do agente
          <input
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
            placeholder="http://192.168.1.100:3001"
            value={values.print_agent_url}
            disabled={savingAgent || savingKey !== null}
            onChange={(e) =>
              setValues((v) => ({ ...v, print_agent_url: e.target.value }))
            }
          />
          <span className="mt-1 block text-[11px] text-vyria-navy-muted">
            IP do telemóvel, mini-PC ou Android TV box onde corre o agente (mesma Wi-Fi da loja).
          </span>
        </label>
        <label className="mt-4 block text-xs font-medium text-vyria-navy-muted">
          Token de segurança
          <input
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
            placeholder="vyria-agent-2026"
            value={values.print_agent_token}
            disabled={savingAgent || savingKey !== null}
            onChange={(e) =>
              setValues((v) => ({ ...v, print_agent_token: e.target.value }))
            }
          />
          <span className="mt-1 block text-[11px] text-vyria-navy-muted">
            variável de ambiente <code className="text-[11px]">AGENT_TOKEN</code> no agente.
          </span>
        </label>
      </section>

      {/* Bloco 3 — Impressora */}
      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Impressora térmica</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-vyria-navy-muted">
            IP da impressora
            <input
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
              placeholder="192.168.1.200"
              value={values.print_printer_ip}
              disabled={savingAgent || savingKey !== null}
              onChange={(e) =>
                setValues((v) => ({ ...v, print_printer_ip: e.target.value }))
              }
            />
            <span className="mt-1 block text-[11px] text-vyria-navy-muted">
              IP atribuído pela rede Wi-Fi da loja.
            </span>
          </label>
          <label className="block text-xs font-medium text-vyria-navy-muted">
            Porta
            <input
              inputMode="numeric"
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
              placeholder="9100"
              value={String(values.print_printer_port)}
              disabled={savingAgent || savingKey !== null}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10)
                setValues((v) => ({
                  ...v,
                  print_printer_port: Number.isFinite(n) ? n : v.print_printer_port,
                }))
              }}
            />
            <span className="mt-1 block text-[11px] text-vyria-navy-muted">
              Padrão ESC/POS raw: 9100.
            </span>
          </label>
        </div>
        <button
          type="button"
          disabled={savingAgent || savingKey !== null || savingPaper}
          onClick={() => void saveAgentAndPrinter()}
          className="mt-6 rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
        >
          {savingAgent ? 'A guardar…' : 'Guardar configurações'}
        </button>
      </section>

      {/* Bloco 4 — Automático térmico + legado cupom */}
      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]"
            aria-hidden
          >
            <IconPrinter className="h-6 w-6" />
          </div>
          <h2 className="font-brand text-lg font-bold text-vyria-navy">
            Impressão automática (térmica Wi-Fi)
          </h2>
        </div>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Só envia para a impressora quando o agente e o IP estão configurados e o toggle da origem
          está ativo. Pedidos do site e QR mesa imprimem na <strong>criação</strong> do pedido (não
          de novo ao mudar o estado para «A caminho», para evitar cupom duplicado).
        </p>
        <ul className="mt-6 divide-y divide-vyria-navy/10">
          {THERMAL_AUTO_ROWS.map(({ key, title, description }) => (
            <li
              key={key}
              className="flex items-center gap-4 py-4 first:pt-0 last:pb-0 sm:gap-5"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-vyria-navy">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-vyria-navy-muted">
                  {description}
                </p>
              </div>
              <PrintSwitch
                on={values[key]}
                disabled={savingKey !== null || savingPaper || savingAgent}
                onToggle={() => toggle(key)}
                label={title}
              />
            </li>
          ))}
        </ul>

        <h3 className="mt-8 border-t border-vyria-navy/10 pt-6 font-semibold text-vyria-navy">
          Cupom no navegador (pop-up)
        </h3>
        <ul className="mt-4 divide-y divide-vyria-navy/10">
          {LEGACY_ROWS.map(({ key, title, description }) => (
            <li
              key={key}
              className="flex items-center gap-4 py-4 first:pt-0 last:pb-0 sm:gap-5"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-vyria-navy">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-vyria-navy-muted">
                  {description}
                </p>
              </div>
              <PrintSwitch
                on={values[key]}
                disabled={savingKey !== null || savingPaper || savingAgent}
                onToggle={() => toggle(key)}
                label={title}
              />
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-vyria-navy/10 pt-6">
          <h3 className="font-semibold text-vyria-navy">Largura do papel e porta série</h3>
          <p className="mt-1 text-sm text-vyria-navy-muted">
            Usado na pré-visualização e no envio USB / série no browser.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Largura do rolo
              <select
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm font-medium text-vyria-navy"
                value={values.print_paper_mm}
                disabled={savingKey !== null || savingPaper || savingAgent}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  void savePaperMm(v === 58 ? 58 : 80)
                }}
              >
                <option value={80}>80 mm (48 colunas)</option>
                <option value={58}>58 mm (32 colunas)</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Velocidade série (Web Serial)
              <select
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm font-medium text-vyria-navy"
                value={serialBaud}
                disabled={savingKey !== null}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setSerialBaud(n)
                  setPrintSerialBaud(n)
                }}
              >
                {PRINT_SERIAL_BAUD_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b} baud
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {/* Pré-visualização */}
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-brand text-lg font-bold text-vyria-navy">
              Pré-visualização do cupom
            </h2>
            <p className="mt-1 text-sm text-vyria-navy-muted">
              Simulação para o fluxo no navegador (não usa o agente Wi-Fi).
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Link
              href="/dashboard/printing/preview"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-105"
            >
              Abrir pré-visualização
            </Link>
            <button
              type="button"
              onClick={printPreviewToWindow}
              className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy shadow-sm hover:bg-[#f9fafb]"
            >
              Imprimir teste (janela)
            </button>
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <ReceiptPreview
            storeName={storeName}
            includeCustomer={values.print_include_customer_details}
            deliveryCopy={values.print_delivery_copy}
            deliveryFee={fee}
            paperMm={values.print_paper_mm}
          />
        </div>
      </section>

      {/* Bloco 5 — Instruções */}
      <details
        id="instrucoes-agente"
        className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6"
      >
        <summary className="cursor-pointer font-brand text-lg font-bold text-vyria-navy">
          Como instalar o agente de impressão
        </summary>
        <div className="mt-4 space-y-6 text-sm text-vyria-navy-muted">
          <div>
            <h3 className="font-semibold text-vyria-navy">Passo 1 — Android (Termux)</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Instala o Termux na Play Store.</li>
              <li>
                <code className="rounded bg-[#f3f4f6] px-1">pkg install nodejs</code>
              </li>
              <li>
                Clona o repositório Vyria Delivery (ou copia a pasta{' '}
                <code className="rounded bg-[#f3f4f6] px-1">agent/</code>).
              </li>
              <li>
                <code className="rounded bg-[#f3f4f6] px-1">cd agent && npm install</code>
              </li>
              <li>
                <code className="rounded bg-[#f3f4f6] px-1">node print-agent.js</code>
              </li>
              <li>
                Anota o IP do telemóvel (Wi-Fi) e cola em «URL do agente», por exemplo{' '}
                <code className="rounded bg-[#f3f4f6] px-1">http://192.168.1.50:3001</code>
              </li>
            </ol>
          </div>
          <div>
            <h3 className="font-semibold text-vyria-navy">Passo 2 — Mini PC / Android TV Box</h3>
            <p className="mt-2">
              Instala Node.js LTS, copia a pasta <code className="rounded bg-[#f3f4f6] px-1">agent/</code>,
              corre <code className="rounded bg-[#f3f4f6] px-1">npm install</code> e{' '}
              <code className="rounded bg-[#f3f4f6] px-1">node print-agent.js</code>. Ideal para ficar
              ligado 24h na loja.
            </p>
          </div>
          <p className="rounded-lg border border-vyria-navy/10 bg-[#fafafa] px-3 py-2 text-xs text-vyria-navy">
            Compatível com impressoras térmicas Wi-Fi que aceitem ESC/POS na porta 9100. Exemplos:
            Elgin i9, Bematech MP-4200, Epson TM-T20X.
          </p>
        </div>
      </details>

      {savingKey || savingPaper || savingAgent ? (
        <p className="text-center text-xs text-vyria-navy-muted">A guardar…</p>
      ) : null}
    </div>
  )
}
