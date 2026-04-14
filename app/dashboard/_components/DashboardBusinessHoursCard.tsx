'use client'

import { useEffect, useState } from 'react'
import {
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
  DEFAULT_WEEKLY_HOURS,
  parseWeeklyHours,
  serializeWeeklyHours,
  type WeeklyHours,
} from '@/lib/business-hours'
import { updateStore } from '@/services/store'

export function DashboardBusinessHoursCard({
  storeId,
  initialBusinessHours,
}: {
  storeId: string
  initialBusinessHours: unknown
}) {
  const [hours, setHours] = useState<WeeklyHours>(() =>
    parseWeeklyHours(initialBusinessHours)
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setHours(parseWeeklyHours(initialBusinessHours))
  }, [initialBusinessHours])

  function setDay(
    key: DayKey,
    patch: Partial<{ closed: boolean; open: string; close: string }>
  ) {
    setHours((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const { error } = await updateStore(storeId, {
      business_hours: serializeWeeklyHours(hours),
    })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setSaved(true)
  }

  function handleResetDefaults() {
    setHours(DEFAULT_WEEKLY_HOURS())
    setSaved(false)
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-vyria-navy">
          Horário de funcionamento
        </p>
        <p className="mt-1 text-xs text-vyria-navy-muted">
          Aparece no link público do cardápio como <strong>Aberto</strong> ou{' '}
          <strong>Fechado</strong>, com base na hora atual (Brasília). Se não
          guardares horários, o link continua a mostrar como aberto.
        </p>
      </div>

      <div className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto pr-1">
        {DAY_KEYS.map((key) => {
          const row = hours[key]
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
            >
              <label className="flex min-w-[7rem] flex-1 items-center gap-2 font-medium text-vyria-navy">
                <input
                  type="checkbox"
                  checked={row.closed}
                  onChange={(e) => setDay(key, { closed: e.target.checked })}
                  className="rounded border-vyria-navy/30"
                />
                <span className="text-xs sm:text-sm">{DAY_LABELS[key]}</span>
              </label>
              {!row.closed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    value={row.open}
                    onChange={(e) => setDay(key, { open: e.target.value })}
                    className="w-[6.5rem] rounded-lg border border-[var(--card-border)] px-2 py-1 text-xs"
                  />
                  <span className="text-vyria-navy-muted">às</span>
                  <input
                    type="time"
                    value={row.close}
                    onChange={(e) => setDay(key, { close: e.target.value })}
                    className="w-[6.5rem] rounded-lg border border-[var(--card-border)] px-2 py-1 text-xs"
                  />
                </div>
              ) : (
                <span className="text-xs text-vyria-navy-muted">Fechado</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--card-border)] pt-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-vyria-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-vyria-navy/90 disabled:opacity-50"
        >
          {saving ? 'A guardar…' : 'Guardar horários'}
        </button>
        <button
          type="button"
          onClick={handleResetDefaults}
          className="rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-vyria-navy hover:bg-[#f9f9f9]"
        >
          Repor padrão
        </button>
        {saved ? (
          <span className="text-xs font-medium text-emerald-700">
            Guardado.
          </span>
        ) : null}
      </div>
    </div>
  )
}
