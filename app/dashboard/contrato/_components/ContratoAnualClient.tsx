'use client'

import type { AnnualContractDocument } from '@/lib/annual-contract-acceptance'
import { buildIdentificacaoPartesClause } from '@/lib/annual-contract-identificacao'
import {
  resolveVyriaContratadaCnpjLabel,
  resolveVyriaContratadaRazaoSocial,
} from '@/lib/vyria-legal-constants'
import { BrandLogo } from '@/app/_components/BrandLogo'
import { useMemo, useState } from 'react'
import { SignaturePad } from './SignaturePad'

export function ContratoAnualClient({
  document,
  storeName,
  userEmail,
}: {
  document: AnnualContractDocument
  storeName: string
  userEmail: string
}) {
  const [aceiteTermos, setAceiteTermos] = useState(false)
  const [aceiteCompromisso, setAceiteCompromisso] = useState(false)
  const [aceiteRepresentante, setAceiteRepresentante] = useState(false)
  const [documentoTipo, setDocumentoTipo] = useState<'cpf' | 'cnpj'>('cnpj')
  const [documentoNumero, setDocumentoNumero] = useState('')
  const [representanteCargo, setRepresentanteCargo] = useState('Sócio administrador')
  const [assinaturaNome, setAssinaturaNome] = useState('')
  const [assinaturaPng, setAssinaturaPng] = useState<string | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nomeOk = assinaturaNome.trim().length >= 3
  const docOk = documentoNumero.replace(/\D/g, '').length >= 11
  const cargoOk = representanteCargo.trim().length >= 2
  const canSubmit =
    aceiteTermos &&
    aceiteCompromisso &&
    aceiteRepresentante &&
    nomeOk &&
    docOk &&
    cargoOk &&
    hasInk &&
    assinaturaPng &&
    !busy

  const vyriaRazaoSocial = resolveVyriaContratadaRazaoSocial(document.vyriaRazaoSocial)
  const vyriaCnpjLabel = resolveVyriaContratadaCnpjLabel(document.vyriaCnpjLabel)

  const clausulas = useMemo(() => {
    const identificacao = buildIdentificacaoPartesClause({
      vyriaRazaoSocial,
      vyriaCnpjLabel,
      storeName,
      signatario: {
        nome: assinaturaNome,
        documentoTipo,
        documentoNumero,
        cargo: representanteCargo,
      },
    })
    return [identificacao, ...document.clausulas.slice(1)]
  }, [
    assinaturaNome,
    document.clausulas,
    documentoNumero,
    documentoTipo,
    representanteCargo,
    storeName,
    vyriaCnpjLabel,
    vyriaRazaoSocial,
  ])

  async function submit() {
    if (!canSubmit || !assinaturaPng) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/contrato/aceitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aceite_termos: true,
          aceite_compromisso_12m: true,
          aceite_representante_legal: true,
          assinatura_nome: assinaturaNome.trim(),
          assinatura_png: assinaturaPng,
          documento_tipo: documentoTipo,
          documento_numero: documentoNumero,
          representante_cargo: representanteCargo.trim(),
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error || 'Não foi possível registar o contrato.')
        return
      }
      // Hard navigation: sessão já assinada → hub operacional.
      window.location.assign('/dashboard')
    } catch {
      setError('Erro de rede. Tenta novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f4]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
        <header className="mb-6 flex items-center gap-3">
          <BrandLogo className="h-8 w-auto" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Vyria Delivery
            </p>
            <p className="text-sm font-semibold text-[#1a1614]">{storeName}</p>
          </div>
        </header>

        <main className="flex-1 rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-vyria-plum">
            Primeiro acesso — contrato obrigatório
          </p>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-[#1a1614] sm:text-2xl">
            {document.titulo}
          </h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            Documento com validade probatória: PDF arquivado, hash SHA-256, registo de IP e cópia
            por e-mail para ambas as partes.
          </p>

          <dl className="mt-6 grid gap-3 rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-[#6b7280]">Contratada</dt>
              <dd className="font-medium text-[#1a1614]">
                {vyriaRazaoSocial} · CNPJ {vyriaCnpjLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[#6b7280]">Plano</dt>
              <dd className="font-semibold text-[#1a1614]">{document.planoLabel}</dd>
            </div>
            <div>
              <dt className="text-[#6b7280]">Modelo</dt>
              <dd className="font-semibold text-[#1a1614]">{document.operationModeLabel}</dd>
            </div>
            <div>
              <dt className="text-[#6b7280]">Mensalidade (anual)</dt>
              <dd className="font-semibold tabular-nums text-[#1a1614]">
                {document.mensalidadeLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[#6b7280]">Vigência</dt>
              <dd>
                {document.contratoInicioLabel} — {document.contratoFimLabel}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[#6b7280]">Termos de uso</dt>
              <dd>
                <a
                  href={document.termosUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-vyria-plum underline-offset-2 hover:underline"
                >
                  {document.termosUrl}
                </a>
              </dd>
            </div>
          </dl>

          <section className="mt-8 space-y-4 border-t border-[var(--card-border)] pt-6">
            <p className="text-sm font-semibold text-[#1a1614]">Identificação do signatário</p>
            {userEmail ? (
              <p className="text-xs text-[#6b7280]">
                E-mail da conta (registado no aceite): <strong>{userEmail}</strong>
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#374151]">
                Tipo de documento
                <select
                  className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                  value={documentoTipo}
                  onChange={(e) =>
                    setDocumentoTipo(e.target.value === 'cpf' ? 'cpf' : 'cnpj')
                  }
                >
                  <option value="cnpj">CNPJ (empresa)</option>
                  <option value="cpf">CPF (pessoa física / MEI)</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-[#374151]">
                {documentoTipo === 'cpf' ? 'CPF' : 'CNPJ'}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={documentoTipo === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                  className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                  value={documentoNumero}
                  onChange={(e) => setDocumentoNumero(e.target.value)}
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-[#374151]">
              Cargo / função (representação legal)
              <input
                type="text"
                placeholder="Ex.: Sócio administrador, Proprietário"
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={representanteCargo}
                onChange={(e) => setRepresentanteCargo(e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-[#374151]">
              Nome completo do signatário
              <input
                type="text"
                autoComplete="name"
                placeholder="Como no documento de identificação"
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={assinaturaNome}
                onChange={(e) => setAssinaturaNome(e.target.value)}
              />
            </label>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-bold text-[#1a1614]">Cláusulas do contrato</h2>
            <ol className="mt-3 max-h-64 list-decimal space-y-2 overflow-y-auto pl-5 text-sm leading-relaxed text-[#374151]">
              {clausulas.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-[#6b7280]">
              Foro: {document.foroComarca}. Versão {document.termosVersao}.
            </p>
          </section>

          <section className="mt-8 space-y-4 border-t border-[var(--card-border)] pt-6">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-[#374151]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--card-border)]"
                checked={aceiteTermos}
                onChange={(e) => setAceiteTermos(e.target.checked)}
              />
              <span>
                Li e aceito os{' '}
                <a
                  href={document.termosUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-vyria-plum underline-offset-2 hover:underline"
                >
                  termos de uso
                </a>{' '}
                da Vyria Delivery (versão {document.termosVersao}).
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 text-sm text-[#374151]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--card-border)]"
                checked={aceiteCompromisso}
                onChange={(e) => setAceiteCompromisso(e.target.checked)}
              />
              <span>
                Aceito o <strong>compromisso mínimo de 12 meses</strong> e a multa de 50% sobre o
                valor restante em caso de cancelamento antecipado.
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 text-sm text-[#374151]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--card-border)]"
                checked={aceiteRepresentante}
                onChange={(e) => setAceiteRepresentante(e.target.checked)}
              />
              <span>
                Declaro ser <strong>representante legal</strong> do estabelecimento contratante e ter
                poderes para vinculá-lo a este contrato.
              </span>
            </label>

            <div>
              <p className="text-sm font-medium text-[#374151]">Assinatura electrónica</p>
              <div className="mt-2">
                <SignaturePad
                  onChange={(dataUrl, ink) => {
                    setAssinaturaPng(dataUrl)
                    setHasInk(ink)
                  }}
                />
              </div>
            </div>

            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="btn-vyria-gradient w-full rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'A gerar PDF e registar contrato…' : 'Aceitar, assinar e arquivar contrato'}
            </button>
          </section>
        </main>
      </div>
    </div>
  )
}
