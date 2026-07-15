'use client'

import type { FiscalChecklistItem } from '@/lib/fiscal-readiness'

function CheckIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#9ca3af]">
      <span className="h-2 w-2 rounded-full bg-[#d1d5db]" />
    </span>
  )
}

export function FiscalChecklist({
  items,
  pendingCount,
  compact = false,
}: {
  items: FiscalChecklistItem[]
  pendingCount: number
  compact?: boolean
}) {
  const displayItems = items.filter((i) => i.id !== 'pronto_emissao')
  const allReady = pendingCount === 0

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#1a1614]">Checklist Fiscal</h2>
          {!compact ? (
            <p className="mt-0.5 text-xs text-[#6b7280]">
              Complete todos os itens para solicitar a ativação do módulo.
            </p>
          ) : null}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            allReady
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {allReady ? 'Completo' : `${pendingCount} pendente${pendingCount === 1 ? '' : 's'}`}
        </span>
      </div>

      <ul className={`mt-4 grid gap-2 ${compact ? 'sm:grid-cols-2' : ''}`}>
        {displayItems.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm ${
              item.ok ? 'bg-emerald-50/60 text-[#374151]' : 'bg-[#fafafa] text-[#374151]'
            }`}
          >
            <CheckIcon ok={item.ok} />
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${item.ok ? 'text-emerald-900' : 'text-[#1a1614]'}`}>
                {item.label}
              </p>
              {!item.ok && item.hint ? (
                <p className="mt-0.5 text-xs text-[#6b7280]">{item.hint}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div
        className={`mt-4 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
          allReady
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-[var(--card-border)] bg-[#fafafa] text-[#6b7280]'
        }`}
      >
        <CheckIcon ok={allReady} />
        <p className="font-semibold">Pronto para emissão</p>
      </div>
    </section>
  )
}
