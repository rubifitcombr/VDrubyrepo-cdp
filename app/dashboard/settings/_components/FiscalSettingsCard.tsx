'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FISCAL_STATUS_LABEL,
  parseFiscalStatus,
  type FiscalStatus,
} from '@/lib/fiscal'

const inputClass =
  'mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm text-[#1a1614] outline-none transition-all placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12'
const labelClass = 'block text-xs font-semibold text-[#374151]'

type FiscalForm = {
  ambiente: string
  regimeTributario: string
  cnpj: string
  inscricaoEstadual: string
  razaoSocial: string
  nomeFantasia: string
  enderecoLogradouro: string
  enderecoNumero: string
  enderecoBairro: string
  enderecoMunicipio: string
  enderecoMunicipioIbge: string
  enderecoUf: string
  enderecoCep: string
  brasilnfeToken: string
  cscId: string
  cscToken: string
}

const EMPTY_FORM: FiscalForm = {
  ambiente: 'homologacao',
  regimeTributario: 'simples_nacional',
  cnpj: '',
  inscricaoEstadual: '',
  razaoSocial: '',
  nomeFantasia: '',
  enderecoLogradouro: '',
  enderecoNumero: '',
  enderecoBairro: '',
  enderecoMunicipio: '',
  enderecoMunicipioIbge: '',
  enderecoUf: '',
  enderecoCep: '',
  brasilnfeToken: '',
  cscId: '',
  cscToken: '',
}

function statusTone(status: FiscalStatus): string {
  if (status === 'ativo') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'pending_review') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'bloqueado') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

export function FiscalSettingsCard({ storeId }: { storeId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<FiscalStatus>('nao_configurado')
  const [hasToken, setHasToken] = useState(false)
  const [form, setForm] = useState<FiscalForm>(EMPTY_FORM)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/store/fiscal?storeId=${encodeURIComponent(storeId)}`, {
        credentials: 'include',
      })
      const data = (await res.json()) as { fiscal?: Record<string, unknown>; error?: string }
      if (res.ok && data.fiscal) {
        const f = data.fiscal
        setStatus(parseFiscalStatus(f.status))
        setHasToken(Boolean(f.hasToken))
        setForm({
          ambiente: String(f.ambiente ?? 'homologacao'),
          regimeTributario: String(f.regimeTributario ?? 'simples_nacional'),
          cnpj: String(f.cnpj ?? ''),
          inscricaoEstadual: String(f.inscricaoEstadual ?? ''),
          razaoSocial: String(f.razaoSocial ?? ''),
          nomeFantasia: String(f.nomeFantasia ?? ''),
          enderecoLogradouro: String(f.enderecoLogradouro ?? ''),
          enderecoNumero: String(f.enderecoNumero ?? ''),
          enderecoBairro: String(f.enderecoBairro ?? ''),
          enderecoMunicipio: String(f.enderecoMunicipio ?? ''),
          enderecoMunicipioIbge: String(f.enderecoMunicipioIbge ?? ''),
          enderecoUf: String(f.enderecoUf ?? ''),
          enderecoCep: String(f.enderecoCep ?? ''),
          brasilnfeToken: '',
          cscId: '',
          cscToken: '',
        })
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void load()
  }, [load])

  function set<K extends keyof FiscalForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/store/fiscal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ storeId, ...form }),
      })
      const data = (await res.json()) as { status?: string; error?: string }
      if (!res.ok) {
        setMsg(data.error || 'Não foi possível salvar.')
        return
      }
      setMsg('Dados fiscais salvos. A Vyria vai revisar e ativar a emissão.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </span>
          <h2 className="text-base font-bold text-[#1a1614]">Nota fiscal (NFC-e)</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(status)}`}>
          {FISCAL_STATUS_LABEL[status]}
        </span>
      </div>

      <p className="mt-2 text-sm text-[#6b7280]">
        Emissão de NFC-e via Brasil NFe. Preencha os dados do emitente e o Token da sua
        conta na Brasil NFe. O <strong>certificado digital (.pfx)</strong> deve ser enviado
        no painel da própria Brasil NFe — a Vyria não armazena o certificado. Após salvar,
        o status fica <strong>Aguardando aprovação</strong> até a Vyria ativar.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-[#9ca3af]">A carregar…</p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Token Brasil NFe</label>
              <input
                type="password"
                className={inputClass}
                placeholder={hasToken ? '•••••• (configurado — preencha para alterar)' : 'Cole o token da Brasil NFe'}
                value={form.brasilnfeToken}
                onChange={(e) => set('brasilnfeToken', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass}>Ambiente</label>
              <select
                className={inputClass}
                value={form.ambiente}
                onChange={(e) => set('ambiente', e.target.value)}
              >
                <option value="homologacao">Homologação (teste)</option>
                <option value="producao">Produção</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>CSC ID (QR da NFC-e)</label>
              <input
                className={inputClass}
                placeholder="Ex.: 000001"
                value={form.cscId}
                onChange={(e) => set('cscId', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>CSC Token</label>
              <input
                type="password"
                className={inputClass}
                placeholder="Código de Segurança do Contribuinte"
                value={form.cscToken}
                onChange={(e) => set('cscToken', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Regime tributário</label>
              <select
                className={inputClass}
                value={form.regimeTributario}
                onChange={(e) => set('regimeTributario', e.target.value)}
              >
                <option value="simples_nacional">Simples Nacional</option>
                <option value="regime_normal">Regime Normal</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>CNPJ</label>
              <input
                className={inputClass}
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => set('cnpj', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Inscrição Estadual</label>
              <input
                className={inputClass}
                value={form.inscricaoEstadual}
                onChange={(e) => set('inscricaoEstadual', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Razão Social</label>
              <input
                className={inputClass}
                value={form.razaoSocial}
                onChange={(e) => set('razaoSocial', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Nome Fantasia</label>
              <input
                className={inputClass}
                value={form.nomeFantasia}
                onChange={(e) => set('nomeFantasia', e.target.value)}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
              Endereço do emitente
            </p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Logradouro</label>
                <input
                  className={inputClass}
                  value={form.enderecoLogradouro}
                  onChange={(e) => set('enderecoLogradouro', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Número</label>
                <input
                  className={inputClass}
                  value={form.enderecoNumero}
                  onChange={(e) => set('enderecoNumero', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Bairro</label>
                <input
                  className={inputClass}
                  value={form.enderecoBairro}
                  onChange={(e) => set('enderecoBairro', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Município</label>
                <input
                  className={inputClass}
                  value={form.enderecoMunicipio}
                  onChange={(e) => set('enderecoMunicipio', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Código IBGE do município</label>
                <input
                  className={inputClass}
                  placeholder="Ex.: 5208707"
                  value={form.enderecoMunicipioIbge}
                  onChange={(e) => set('enderecoMunicipioIbge', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>UF</label>
                <input
                  className={inputClass}
                  maxLength={2}
                  placeholder="GO"
                  value={form.enderecoUf}
                  onChange={(e) => set('enderecoUf', e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className={labelClass}>CEP</label>
                <input
                  className={inputClass}
                  placeholder="00000-000"
                  value={form.enderecoCep}
                  onChange={(e) => set('enderecoCep', e.target.value)}
                />
              </div>
            </div>
          </div>

          {msg ? <p className="text-sm text-[#374151]">{msg}</p> : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-xl bg-[var(--dash-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'A guardar…' : 'Salvar dados fiscais'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
