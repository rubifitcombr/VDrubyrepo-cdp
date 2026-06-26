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
import { sendOrderTicketToPrintAgent } from '@/lib/print-agent-client'
import {
  connectBluetoothPrinter,
  forgetBluetoothPrinter,
  getBluetoothPrinterName,
  isBluetoothPrinterConnected,
  isWebBluetoothSupported,
  printBluetoothTestTicket,
  tryReconnectKnownBluetoothPrinter,
} from '@/lib/bluetooth-print-client'
import { openPrintingPreviewPopup } from '@/lib/printing-preview-window'
import { updateStore } from '@/services/store'
import { IconPrinter } from '@/app/dashboard/_components/NavIcons'
import { ReceiptPreview } from './ReceiptPreview'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'

type DiscoveredPrinter = {
  ip: string
  port: number
  status?: string
  model?: string | null
}

function diagnosticMessage(error: string | undefined, code?: string, detail?: string): string {
  if (error) return detail ? `${error} (${detail})` : error
  if (code === 'agent_offline') return 'Agente offline ou URL incorreta.'
  if (code === 'printer_timeout') return 'Impressora não respondeu no tempo esperado. Confirma IP, porta e Wi-Fi.'
  if (code === 'printer_connection_refused') return 'A impressora recusou a conexão. A porta pode estar errada.'
  if (code === 'printer_offline') return 'Impressora offline ou IP fora da rede.'
  if (code === 'unauthorized') return 'Palavra-passe do programa incorreta.'
  return 'Falha de impressão sem detalhe.'
}

function subnetFromIp(ip: string): string | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number.parseInt(p, 10))
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null
  return `${nums[0]}.${nums[1]}.${nums[2]}`
}

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
    title: 'Cupom no navegador ao aceitar',
    description: 'Abre o cupom quando o pedido passa a «A preparar».',
  },
  {
    key: 'print_include_customer_details',
    title: 'Dados do cliente no cupom',
    description: 'Nome, telefone e morada.',
  },
  {
    key: 'print_delivery_copy',
    title: 'Segunda via para entrega',
    description: 'Cópia extra para o estafeta.',
  },
]

const THERMAL_AUTO_ROWS: Array<{
  key: StorePrintingKey
  title: string
  description: string
}> = [
  {
    key: 'print_auto_delivery',
    title: 'Pedidos online',
    description: 'Delivery e retirada pelo site.',
  },
  {
    key: 'print_auto_autoatendimento',
    title: 'QR na mesa',
    description: 'Pedidos pelo QR do salão.',
  },
  {
    key: 'print_auto_pdv',
    title: 'PDV',
    description: 'Vendas no balcão.',
  },
  {
    key: 'print_auto_garcom',
    title: 'Garçom',
    description: 'Pedidos pelo painel Garçom.',
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
  const [discoverBusy, setDiscoverBusy] = useState(false)
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([])
  const [btSupported, setBtSupported] = useState(false)
  const [btDeviceName, setBtDeviceName] = useState<string | null>(null)
  const [btConnected, setBtConnected] = useState(false)
  const [btBusy, setBtBusy] = useState(false)
  const [btTestBusy, setBtTestBusy] = useState(false)
  const [btFallbackHint, setBtFallbackHint] = useState(false)

  useEffect(() => {
    setValues(initial)
  }, [initial])

  useEffect(() => {
    setBtSupported(isWebBluetoothSupported())
    setBtDeviceName(getBluetoothPrinterName())
    void (async () => {
      const ok = await tryReconnectKnownBluetoothPrinter()
      if (ok) {
        setBtConnected(true)
        setBtDeviceName(getBluetoothPrinterName())
      }
    })()
  }, [])

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

  async function saveAgentAndPrinter(options?: { skipSuccessToast?: boolean }): Promise<boolean> {
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
      return false
    }
    if (!options?.skipSuccessToast) {
      showToast('Guardado.')
    }
    return true
  }

  async function saveLinkAndTestPrint() {
    setError(null)
    const url = values.print_agent_url?.trim() ?? ''
    if (!url || !/^https?:\/\//i.test(url)) {
      setError('No primeiro campo, coloca o endereço que começa com http:// ou https://')
      return
    }
    if (!values.print_printer_ip?.trim()) {
      setError('No segundo campo, coloca o número da impressora (ex.: 192.168.1.200).')
      return
    }
    const ok = await saveAgentAndPrinter({ skipSuccessToast: true })
    if (!ok) return
    await testAgentHealth({ quiet: true })
    await testThermalPrint({ quiet: true })
    showToast('Se saiu um cupom na impressora, está tudo certo.')
  }

  async function testAgentHealth(opts?: { quiet?: boolean }) {
    const base = values.print_agent_url?.trim().replace(/\/+$/, '')
    if (!base || !/^https?:\/\//i.test(base)) {
      setAgentOnline(null)
      setError('Indica uma URL válida do agente (http://… ou https://…).')
      return
    }
    setBusyHealth(true)
    setError(null)
    try {
      const token = values.print_agent_token.trim() || 'vyria-agent-2026'
      const printerIp = values.print_printer_ip.trim()
      const port = Number.isFinite(Number(values.print_printer_port))
        ? Number(values.print_printer_port)
        : 9100
      const qs = printerIp
        ? `?printerIp=${encodeURIComponent(printerIp)}&printerPort=${encodeURIComponent(String(port))}`
        : ''
      const res = await fetch(`${base}/health${qs}`, {
        method: 'GET',
        headers: printerIp ? { 'x-agent-token': token } : undefined,
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        code?: string
        detail?: string
        printer?: { ok?: boolean; ip?: string; port?: number } | null
      }
      setAgentOnline(res.ok)
      if (!res.ok) {
        const msg = diagnosticMessage(json.error, json.code, json.detail)
        setError(msg)
        showToast(msg)
      } else if (!opts?.quiet) {
        showToast(json.printer?.ok ? 'Agente ligado e impressora acessível.' : 'Agente respondeu ao health check.')
      }
    } catch {
      setAgentOnline(false)
      const msg = 'Não foi possível contactar o agente. Confirma URL, túnel e rede.'
      setError(msg)
      showToast(msg)
    } finally {
      setBusyHealth(false)
    }
  }

  async function testThermalPrint(opts?: { quiet?: boolean }) {
    setBusyTestPrint(true)
    setError(null)
    try {
      const direct = await sendOrderTicketToPrintAgent(
        {
          storeName,
          order: {
            id: '00000000-0000-0000-0000-000000000099',
            customer_name: 'Cliente teste',
            customer_phone: null,
            delivery_address: null,
            delivery_fee: null,
            payment_method: 'pix',
            payment_status: null,
            notes: 'Cupom de teste — impressao Wi-Fi/cabo.',
            total: 1,
            status: null,
            created_at: new Date().toISOString(),
            source: 'pdv',
            items_summary: '1x Item de teste (un R$ 1,00)=R$ 1,00',
          },
          orderDisplayRef: 'TESTE',
          printing: {
            print_include_customer_details:
              values.print_include_customer_details,
            print_delivery_copy: values.print_delivery_copy,
            print_paper_mm: values.print_paper_mm,
          },
          variant: 'balcao',
        },
        values
      )
      if (direct.ok) {
        if (!opts?.quiet) {
          showToast('Cupom de teste enviado à impressora.')
        }
        return
      }

      const res = await dashboardFetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, test: true }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
      const detailed = json as { error?: string; ok?: boolean; code?: string; detail?: string }
      if (!res.ok || !json.ok) {
        const msg = diagnosticMessage(detailed.error, detailed.code, detailed.detail)
        setError(msg)
        showToast(msg)
        return
      }
      if (!opts?.quiet) {
        showToast('Cupom de teste enviado à impressora.')
      }
    } catch {
      const msg = 'Erro de rede ao imprimir teste. O agente pode estar offline.'
      setError(msg)
      showToast(msg)
    } finally {
      setBusyTestPrint(false)
    }
  }

  async function discoverPrintersOnLan() {
    setError(null)
    const base = values.print_agent_url?.trim().replace(/\/+$/, '')
    if (!base || !/^https?:\/\//i.test(base)) {
      setError('Escreve primeiro o endereço do programa (Campo 1).')
      return
    }
    setDiscoverBusy(true)
    setDiscoveredPrinters([])
    try {
      const token = values.print_agent_token.trim() || 'vyria-agent-2026'
      const port = Number.isFinite(Number(values.print_printer_port))
        ? Number(values.print_printer_port)
        : 9100
      const params = new URLSearchParams({ port: String(port) })
      const manualSubnet = subnetFromIp(values.print_printer_ip)
      if (manualSubnet) params.set('subnet', manualSubnet)
      const res = await fetch(`${base}/discover-printers?${params.toString()}`, {
        headers: { 'x-agent-token': token },
      })
      if (res.status === 404) {
        showToast('Actualiza o programa Vyria na loja (ficheiro print-agent.js novo) para procurar na Wi-Fi.')
        return
      }
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        printers?: Array<string | DiscoveredPrinter>
        error?: string
        code?: string
        detail?: string
      }
      if (!res.ok || !json.ok) {
        const msg = diagnosticMessage(json.error || 'Não foi possível procurar impressoras.', json.code, json.detail)
        setError(msg)
        showToast(msg)
        return
      }
      const list = Array.isArray(json.printers)
        ? json.printers
            .map((printer) =>
              typeof printer === 'string'
                ? { ip: printer, port, status: 'open', model: null }
                : {
                    ip: String(printer.ip ?? ''),
                    port: Number(printer.port) || port,
                    status: printer.status,
                    model: printer.model ?? null,
                  }
            )
            .filter((printer) => printer.ip)
        : []
      setDiscoveredPrinters(list)
      if (list.length === 0) {
        showToast(
          'Não encontrámos nada na porta ' +
            String(port) +
            '. Confirma a Wi-Fi ou escreve o número à mão.'
        )
      } else if (list.length === 1) {
        const only = list[0]!
        setValues((v) => ({ ...v, print_printer_ip: only.ip, print_printer_port: only.port }))
        showToast(`Encontrámos ${only.ip}:${only.port} — já está nos campos.`)
      } else {
        showToast(`Encontrámos ${list.length} máquinas. Escolhe uma em baixo.`)
      }
    } catch {
      const msg = 'Não deu para falar com o programa. Confirma se o Campo 1 está acessível.'
      setError(msg)
      showToast(msg)
    } finally {
      setDiscoverBusy(false)
    }
  }

  async function connectBt() {
    setError(null)
    setBtFallbackHint(false)
    setBtBusy(true)
    try {
      const res = await connectBluetoothPrinter()
      if (res.ok) {
        setBtConnected(true)
        setBtDeviceName(res.deviceName ?? getBluetoothPrinterName())
        showToast(
          res.deviceName
            ? `Ligado a «${res.deviceName}». Toca em «Imprimir teste».`
            : 'Impressora Bluetooth ligada. Toca em «Imprimir teste».'
        )
      } else if (res.code !== 'cancelled') {
        setError(res.message)
        showToast(res.message)
        setBtFallbackHint(true)
      }
    } finally {
      setBtBusy(false)
    }
  }

  async function testBt() {
    setError(null)
    setBtTestBusy(true)
    try {
      const res = await printBluetoothTestTicket(storeName)
      if (res.ok) {
        setBtConnected(isBluetoothPrinterConnected())
        setBtFallbackHint(false)
        showToast('Cupom de teste enviado por Bluetooth.')
      } else {
        setError(res.message)
        showToast(res.message)
        setBtFallbackHint(true)
      }
    } finally {
      setBtTestBusy(false)
    }
  }

  function forgetBt() {
    forgetBluetoothPrinter()
    setBtConnected(false)
    setBtDeviceName(null)
    setBtFallbackHint(false)
    showToast('Impressora Bluetooth esquecida.')
  }

  const linkWizardBusy = savingAgent || busyHealth || busyTestPrint || discoverBusy

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-6">
      <header>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Impressão
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Funciona no telemóvel (iPhone ou Android), tablet e computador — escolhe a forma que
          combina com a tua impressora.
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
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section
        id="formas-impressao"
        className="rounded-2xl border border-[var(--card-border)] bg-gradient-to-b from-[#fafafa] to-white p-5 shadow-sm sm:p-6"
      >
        <h2 className="font-brand text-base font-bold text-vyria-navy">
          Três formas de imprimir (escolhe uma)
        </h2>
        <ul className="mt-4 space-y-4 text-sm leading-relaxed text-vyria-navy-muted">
          <li className="flex gap-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--dash-primary)] text-xs font-bold text-white"
              aria-hidden
            >
              1
            </span>
            <div>
              <p className="font-semibold text-vyria-navy">Wi-Fi na loja (o mais simples no telemóvel)</p>
              <p className="mt-1">
                Um aparelho na <strong>mesma Wi-Fi</strong> que a impressora corre o programa Vyria
                (abaixo). O painel — no iPhone, Android, tablet ou PC — manda imprimir pela nuvem.
                Usa <strong>«Procurar impressora na Wi-Fi»</strong> ou escreve o número da impressora.{' '}
                <a href="#wifi-loja" className="font-semibold text-[var(--dash-primary)] underline">
                  Configurar
                </a>
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#374151] text-xs font-bold text-white"
              aria-hidden
            >
              2
            </span>
            <div>
              <p className="font-semibold text-vyria-navy">Cabo USB neste computador</p>
              <p className="mt-1">
                Em <strong>Chrome ou Edge</strong> (Windows ou Mac), abre «Abrir para imprimir» e,
                na janela, liga a térmica por <strong>USB / porta série</strong>. No{' '}
                <strong>iPhone ou Safari</strong> isto não está disponível — usa a opção Wi-Fi (1) ou{' '}
                <a href="#preview-cupom" className="font-semibold text-[var(--dash-primary)] underline">
                  cabo num PC com Chrome
                </a>
                .
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-300 text-xs font-bold text-zinc-800"
              aria-hidden
            >
              3
            </span>
            <div>
              <p className="font-semibold text-vyria-navy">Bluetooth (direto do navegador)</p>
              <p className="mt-1">
                Liga a térmica <strong>Bluetooth</strong> direto do painel em{' '}
                <strong>Chrome/Edge</strong> (Android, Windows ou Mac).{' '}
                <a href="#bluetooth" className="font-semibold text-[var(--dash-primary)] underline">
                  Configurar
                </a>
                . No <strong>iPhone/Safari</strong> não funciona — usa Wi-Fi (1) ou USB (2).
              </p>
            </div>
          </li>
        </ul>
      </section>

      <section
        id="wifi-loja"
        className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Wi-Fi na loja</h2>
            <p className="mt-2 text-base font-medium leading-snug text-[#1a1614]">
              Impressora e aparelho com o <span className="text-[var(--dash-primary)]">programa Vyria</span>{' '}
              na <strong>mesma Wi-Fi</strong>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-vyria-navy-muted">
              Preenche os dois campos, toca em <strong>Procurar impressora na Wi-Fi</strong> se quiseres,
              depois em <strong>Guardar e testar impressão</strong>. Só precisas de instalar o programa
              uma vez —{' '}
              <a href="#instrucoes-agente" className="font-semibold text-[var(--dash-primary)] underline">
                ver os 4 passos
              </a>
              .
            </p>
          </div>
          {values.print_agent_url?.trim() ? (
            agentOnline === null ? null : agentOnline ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Ligado
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 ring-1 ring-red-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                Sem ligação
              </span>
            )
          ) : null}
        </div>

        <ol className="mt-5 list-none space-y-5">
          <li className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--dash-primary)]">
              Campo 1
            </span>
            <p className="mt-1 text-sm font-semibold text-vyria-navy">Endereço que o programa mostra</p>
            <p className="mt-0.5 text-xs text-vyria-navy-muted">
              Copia tudo o que aparece no topo do Chrome (começa quase sempre por{' '}
              <strong className="font-mono text-[11px]">http://</strong>).
            </p>
            <input
              className="mt-3 block w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-base text-vyria-navy shadow-inner"
              placeholder="http://192.168.1.50:3001"
              value={values.print_agent_url}
              disabled={linkWizardBusy || savingKey !== null}
              onChange={(e) => setValues((v) => ({ ...v, print_agent_url: e.target.value }))}
              autoComplete="off"
            />
          </li>
          <li className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--dash-primary)]">
              Campo 2
            </span>
            <p className="mt-1 text-sm font-semibold text-vyria-navy">Número da impressora na rede</p>
            <p className="mt-0.5 text-xs text-vyria-navy-muted">
              São vários números separados por pontos (ex.: 192.168.1.200). Está no manual, no
              papel de teste da impressora ou pergunta a quem instalou a Wi-Fi na loja. Podes
              também pedir ao programa para{' '}
              <strong className="text-vyria-navy">procurar sozinho</strong> no botão abaixo.
            </p>
            <input
              className="mt-3 block w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-base text-vyria-navy shadow-inner"
              placeholder="192.168.1.200"
              value={values.print_printer_ip}
              disabled={linkWizardBusy || savingKey !== null}
              onChange={(e) => setValues((v) => ({ ...v, print_printer_ip: e.target.value }))}
              autoComplete="off"
            />
          </li>
        </ol>

        <div className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3">
          <p className="text-sm font-semibold text-sky-950">Procura automática na Wi-Fi</p>
          <p className="mt-1 text-xs leading-relaxed text-sky-900/90">
            O programa no Campo 1 varre a rede onde ele está (até ~20 s). Só funciona com
            impressoras que falem na porta {String(values.print_printer_port || 9100)} — o normal
            para térmicas.
          </p>
          <button
            type="button"
            disabled={linkWizardBusy || savingKey !== null}
            onClick={() => void discoverPrintersOnLan()}
            className="mt-3 w-full rounded-xl border border-sky-300 bg-white py-3 text-sm font-bold text-sky-950 shadow-sm hover:bg-sky-50 disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {discoverBusy ? 'A procurar na rede…' : 'Procurar impressora na Wi-Fi'}
          </button>
          {discoveredPrinters.length > 1 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Impressoras encontradas">
              {discoveredPrinters.map((printer) => (
                <li key={`${printer.ip}:${printer.port}`}>
                  <button
                    type="button"
                    disabled={linkWizardBusy || savingKey !== null}
                    onClick={() => {
                      setValues((v) => ({
                        ...v,
                        print_printer_ip: printer.ip,
                        print_printer_port: printer.port,
                      }))
                      setDiscoveredPrinters([])
                      showToast(`${printer.ip}:${printer.port} escolhido. Toca em «Guardar e testar impressão».`)
                    }}
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-300 hover:bg-sky-100 disabled:opacity-50"
                  >
                    {printer.ip}:{printer.port}
                    {printer.model ? ` · ${printer.model}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <details className="mt-4 rounded-xl border border-dashed border-[var(--card-border)] bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-vyria-navy">
            Opções extra (só se o suporte pedir)
          </summary>
          <div className="mt-4 space-y-4 border-t border-[var(--card-border)] pt-4">
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Palavra-passe do programa
              <input
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
                placeholder="Deixa vazio para o normal"
                value={values.print_agent_token}
                disabled={linkWizardBusy || savingKey !== null}
                onChange={(e) => setValues((v) => ({ ...v, print_agent_token: e.target.value }))}
              />
              <span className="mt-1 block text-[11px] text-vyria-navy-muted">
                Só mexe aqui se alguém da Vyria te tiver dado outra palavra-passe.
              </span>
            </label>
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Porta da impressora (quase sempre 9100)
              <input
                inputMode="numeric"
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-vyria-navy"
                placeholder="9100"
                value={String(values.print_printer_port)}
                disabled={linkWizardBusy || savingKey !== null}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10)
                  setValues((v) => ({
                    ...v,
                    print_printer_port: Number.isFinite(n) ? n : v.print_printer_port,
                  }))
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyHealth || linkWizardBusy}
                onClick={() => void testAgentHealth()}
                className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-vyria-navy hover:bg-[#f9fafb] disabled:opacity-50"
              >
                {busyHealth ? 'A testar…' : 'Só testar ligação'}
              </button>
              <button
                type="button"
                disabled={busyTestPrint || !agentConfigured || linkWizardBusy}
                onClick={() => void testThermalPrint()}
                className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-vyria-navy hover:bg-[#f9fafb] disabled:opacity-50"
              >
                {busyTestPrint ? 'A imprimir…' : 'Só testar impressão'}
              </button>
            </div>
          </div>
        </details>

        <button
          type="button"
          disabled={linkWizardBusy || savingKey !== null || savingPaper}
          onClick={() => void saveLinkAndTestPrint()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--dash-primary)] py-4 text-base font-bold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter] hover:brightness-105 disabled:opacity-50"
        >
          {linkWizardBusy ? (
            <>
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              A ligar e a testar…
            </>
          ) : (
            'Guardar e testar impressão'
          )}
        </button>
        <p className="mt-3 text-center text-xs text-vyria-navy-muted">
          O botão grava os dados e tenta imprimir um cupom de teste. Se não imprimir, chama o
          suporte com uma foto do ecrã.
        </p>
      </section>

      <section
        id="bluetooth"
        className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Bluetooth (direto do navegador)</h2>
            <p className="mt-2 text-sm leading-relaxed text-vyria-navy-muted">
              Liga a tua térmica <strong>Bluetooth</strong> sem programa nem Wi-Fi. Funciona em{' '}
              <strong>Chrome ou Edge</strong> no <strong>Android, Windows ou Mac</strong>. No{' '}
              <strong>iPhone/Safari</strong> o Bluetooth do navegador não está disponível — usa a
              Wi-Fi (acima) ou um cabo USB.
            </p>
          </div>
          {btConnected ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Ligada
            </span>
          ) : null}
        </div>

        {!btSupported ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Este navegador não suporta Bluetooth Web. Abre o painel no <strong>Chrome</strong> ou{' '}
            <strong>Edge</strong> (Android, Windows ou Mac) para usar esta opção.
          </p>
        ) : (
          <>
            {btDeviceName ? (
              <p className="mt-4 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3 text-sm text-vyria-navy">
                Impressora: <strong>{btDeviceName}</strong>
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={btBusy}
                onClick={() => void connectBt()}
                className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
              >
                {btBusy ? 'A ligar…' : btConnected ? 'Trocar de impressora' : 'Ligar impressora Bluetooth'}
              </button>
              <button
                type="button"
                disabled={btTestBusy || (!btConnected && !btDeviceName)}
                onClick={() => void testBt()}
                className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy hover:bg-[#f9fafb] disabled:opacity-50"
              >
                {btTestBusy ? 'A imprimir…' : 'Imprimir teste'}
              </button>
              {btDeviceName ? (
                <button
                  type="button"
                  disabled={btBusy || btTestBusy}
                  onClick={forgetBt}
                  className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Esquecer
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-vyria-navy-muted">
              Liga a impressora, carrega em <strong>Ligar impressora Bluetooth</strong> e escolhe-a na
              lista do navegador. Depois os pedidos saem direto por Bluetooth a partir do painel
              (Pedidos). Confirma a largura do rolo (58/80&nbsp;mm) em «Papel e porta série».
            </p>
            {btFallbackHint ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                <p className="font-semibold">A impressora não ligou por Bluetooth?</p>
                <p className="mt-1">
                  Muitas térmicas portáteis baratas (ex.: <strong>Knup KP-1025</strong> e similares)
                  usam Bluetooth «clássico», que o navegador não consegue aceder. Nesses casos, liga-a
                  por <strong>cabo USB</strong> num PC com Chrome/Edge usando a{' '}
                  <a href="#preview-cupom" className="font-semibold text-amber-950 underline">
                    pré-visualização → porta série
                  </a>
                  , ou usa <strong>Wi-Fi</strong> se a impressora tiver rede.
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]"
            aria-hidden
          >
            <IconPrinter className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-brand text-lg font-bold text-vyria-navy">Impressão automática nos pedidos</h2>
            <p className="mt-1 text-xs leading-relaxed text-vyria-navy-muted">
              Térmica: imprime quando entra o pedido (site, QR mesa, PDV ou Garçom), se a ligação
              acima estiver correcta. Não duplica ao mudar o estado do pedido.
            </p>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-vyria-navy/10">
          {THERMAL_AUTO_ROWS.map(({ key, title, description }) => (
            <li key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-vyria-navy">{title}</p>
                <p className="mt-0.5 text-xs text-vyria-navy-muted">{description}</p>
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

        <h3 className="mt-5 border-t border-vyria-navy/10 pt-5 text-sm font-bold text-vyria-navy">
          Cupom no navegador
        </h3>
        <ul className="mt-3 divide-y divide-vyria-navy/10">
          {LEGACY_ROWS.map(({ key, title, description }) => (
            <li key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-vyria-navy">{title}</p>
                <p className="mt-0.5 text-xs text-vyria-navy-muted">{description}</p>
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

        <details className="mt-5 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-vyria-navy">
            Papel e porta série (avançado)
          </summary>
          <p className="mt-2 text-xs text-vyria-navy-muted">
            Usado na pré-visualização e na impressão USB no browser.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Largura do rolo
              <select
                className="mt-1 block w-full rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-sm text-vyria-navy"
                value={values.print_paper_mm}
                disabled={savingKey !== null || savingPaper || savingAgent}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  void savePaperMm(v === 58 ? 58 : 80)
                }}
              >
                <option value={80}>80 mm</option>
                <option value={58}>58 mm</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-vyria-navy-muted">
              Velocidade série
              <select
                className="mt-1 block w-full rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-sm text-vyria-navy"
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
        </details>
      </section>

      <section
        id="preview-cupom"
        className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:p-6"
      >
        <h2 className="font-brand text-lg font-bold text-vyria-navy">Pré-visualização e cabo USB</h2>
        <p className="mt-1 text-xs text-vyria-navy-muted">
          Cupom no ecrã. Em <strong>Chrome ou Edge</strong> no PC, na janela que abre podes também
          ligar a térmica por <strong>USB / porta série</strong> (não funciona no Safari do iPhone).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={printPreviewToWindow}
            className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105"
          >
            Abrir para imprimir
          </button>
          <Link
            href="/dashboard/printing/preview"
            className="text-sm font-semibold text-[var(--dash-primary)] underline-offset-2 hover:underline"
          >
            Ver página completa
          </Link>
        </div>
        <div className="mt-5 flex justify-center overflow-x-auto">
          <ReceiptPreview
            storeName={storeName}
            includeCustomer={values.print_include_customer_details}
            deliveryCopy={values.print_delivery_copy}
            deliveryFee={fee}
            paperMm={values.print_paper_mm}
          />
        </div>
      </section>

      <details
        id="instrucoes-agente"
        className="rounded-2xl border border-[var(--card-border)] bg-white px-5 py-4 shadow-sm"
      >
        <summary className="cursor-pointer text-sm font-bold text-vyria-navy">
          Programa na loja — só 4 passos (uma vez)
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-vyria-navy-muted">
          <li>
            Num <strong>telemóvel Android, tablet ou PC</strong> na Wi-Fi da loja, instala o{' '}
            <strong>Node.js</strong> (grátis em{' '}
            <a
              href="https://nodejs.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--dash-primary)] underline"
            >
              nodejs.org
            </a>
            ). No iPhone não dá para correr este programa — usa um Android ou PC pequeno na mesa.
          </li>
          <li>
            Copia a pasta <code className="rounded bg-[#f3f4f6] px-1 text-xs">agent</code> do projeto
            Vyria para esse aparelho.
          </li>
          <li>
            Abre a terminal nessa pasta: <code className="rounded bg-[#f3f4f6] px-1 text-xs">npm install</code>{' '}
            e depois <code className="rounded bg-[#f3f4f6] px-1 text-xs">node print-agent.js</code>.
          </li>
          <li>
            O programa mostra um endereço no ecrã — cola-o no <strong>Campo 1</strong> em cima,
            depois usa <strong>Procurar impressora na Wi-Fi</strong> ou escreve o número no Campo 2.
          </li>
        </ol>
        <p className="mt-3 rounded-lg bg-[#fafafa] px-3 py-2 text-xs text-vyria-navy">
          Térmicas comuns na porta 9100 (Elgin, Bematech, Epson, etc.). Impressora só por Bluetooth
          sem Wi-Fi: liga-a ao router ou usa USB num portátil (opção 2 em «Três formas»).
        </p>
      </details>

      {savingKey || savingPaper || savingAgent || discoverBusy ? (
        <p className="text-center text-xs text-vyria-navy-muted">A guardar…</p>
      ) : null}
    </div>
  )
}
