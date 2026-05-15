'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateStore } from '@/services/store'
import { StoreOpenSwitch } from '@/app/dashboard/_components/StoreOpenSwitch'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-[#1a1614] outline-none transition-all placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12'

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function parseMoney(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return !Number.isNaN(n) && n >= 0 ? n : null
}

function parseMaxKm(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return !Number.isNaN(n) && n > 0 ? n : null
}

export function DashboardOperationCard({
  storeId,
  initialManualClosed,
  initialDeliveryFee,
  initialDeliveryFreeAbove,
  initialDeliveryMaxKm = '',
  showDeliveryFeeSection = true,
}: {
  storeId: string
  initialManualClosed: boolean
  initialDeliveryFee: string
  initialDeliveryFreeAbove: string
  /** Raio máximo de entrega (km); vazio = sem limite por distância. */
  initialDeliveryMaxKm?: string
  showDeliveryFeeSection?: boolean
}) {
  const router = useRouter()
  const [storeOpen, setStoreOpen] = useState(!initialManualClosed)
  const [deliveryFee, setDeliveryFee] = useState(initialDeliveryFee)
  const [freeAbove, setFreeAbove] = useState(initialDeliveryFreeAbove)
  const [deliveryMaxKm, setDeliveryMaxKm] = useState(initialDeliveryMaxKm)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    const feeNum = parseMoney(deliveryFee)
    if (
      showDeliveryFeeSection &&
      deliveryFee.trim() !== '' &&
      feeNum === null
    ) {
      setSaving(false)
      alert('Valor da taxa de entrega inválido.')
      return
    }

    const freeNum = parseMoney(freeAbove)
    if (
      showDeliveryFeeSection &&
      freeAbove.trim() !== '' &&
      freeNum === null
    ) {
      setSaving(false)
      alert('Valor «frete grátis acima de» inválido.')
      return
    }

    const maxKmNum = parseMaxKm(deliveryMaxKm)
    if (
      showDeliveryFeeSection &&
      deliveryMaxKm.trim() !== '' &&
      maxKmNum === null
    ) {
      setSaving(false)
      alert('Raio de entrega inválido. Indica um número em km (ex.: 5).')
      return
    }

    const patch: Record<string, unknown> = {
      manual_closed: !storeOpen,
      ...(showDeliveryFeeSection
        ? {
            delivery_fee: deliveryFee.trim() === '' ? null : feeNum,
            delivery_free_above:
              freeAbove.trim() === '' ? null : freeNum,
            delivery_max_km:
              deliveryMaxKm.trim() === '' ? null : maxKmNum,
          }
        : {}),
    }

    const attemptedPatch: Record<string, unknown> = { ...patch }
    let error: { message: string } | null = null

    while (true) {
      const result = await updateStore(storeId, attemptedPatch)
      if (!result.error) {
        error = null
        break
      }
      const msg = result.error.message || ''
      const canDrop = (key: string, needle: string) =>
        key in attemptedPatch && msg.includes(needle)

      if (canDrop('delivery_fee', 'delivery_fee')) {
        delete attemptedPatch.delivery_fee
        continue
      }
      if (canDrop('delivery_free_above', 'delivery_free_above')) {
        delete attemptedPatch.delivery_free_above
        continue
      }
      if (canDrop('delivery_max_km', 'delivery_max_km')) {
        delete attemptedPatch.delivery_max_km
        continue
      }
      if (canDrop('store_geo_lat', 'store_geo_lat')) {
        delete attemptedPatch.store_geo_lat
        continue
      }
      if (canDrop('store_geo_lng', 'store_geo_lng')) {
        delete attemptedPatch.store_geo_lng
        continue
      }

      error = result.error
      break
    }

    setSaving(false)
    if (error) {
      alert(
        error.message.includes('delivery') ||
          error.message.includes('geo') ||
          error.message.includes('column')
          ? `${error.message}\n\nExecuta scripts/supabase-store-settings-extra.sql e scripts/supabase-store-delivery-advanced.sql no Supabase.`
          : error.message
      )
      return
    }
    router.refresh()
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 2500)
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] md:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]">
          <IconClock className="h-5 w-5" />
        </span>
        <h2 className="text-base font-bold text-[#1a1614]">Funcionamento</h2>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-[#1a1614]">Loja aberta</p>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {showDeliveryFeeSection ? (
              <>
                Ativa para receber pedidos no link público. O horário semanal (aberto/fechado no
                cardápio) define-se em{' '}
                <Link href="/dashboard/settings" className="font-medium text-[var(--dash-primary)] underline">
                  Configurações
                </Link>
                ; se a loja estiver fechada manualmente aqui, o cardápio fica fechado.
              </>
            ) : (
              <>
                Útil em manutenção ou pausa geral. O horário semanal em{' '}
                <Link href="/dashboard/settings" className="font-medium text-[var(--dash-primary)] underline">
                  Configurações
                </Link>{' '}
                continua a aplicar-se onde fizer sentido para o teu plano.
              </>
            )}
          </p>
        </div>
        <StoreOpenSwitch
          open={storeOpen}
          disabled={!storeId || saving}
          onToggle={() => setStoreOpen((o) => !o)}
        />
      </div>

      {showDeliveryFeeSection ? (
        <div className="mt-6 rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4 md:p-5">
          <h3 className="text-sm font-bold text-[#1a1614]">Taxa de entrega</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">
            Valor cobrado ao cliente pela entrega. Podes oferecer frete grátis quando o subtotal
            do pedido ultrapassa um valor.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#374151]">
              Valor fixo (R$)
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="Ex.: 5,00"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
              />
              <span className="mt-1 block text-xs text-[#9ca3af]">
                O que o cliente paga de entrega quando não há frete grátis.
              </span>
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              Frete grátis acima de (R$)
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="Ex.: 40,00"
                value={freeAbove}
                onChange={(e) => setFreeAbove(e.target.value)}
              />
              <span className="mt-1 block text-xs text-[#9ca3af]">
                Subtotal do pedido a partir do qual a taxa passa a zero. Vazio = sem frete grátis
                automático.
              </span>
            </label>
          </div>

          <div className="mt-5 border-t border-[var(--card-border)] pt-5">
            <h3 className="text-sm font-bold text-[#1a1614]">Zona de entrega</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">
              Raio máximo a partir do endereço da loja em{' '}
              <Link href="/dashboard/settings" className="font-medium text-[var(--dash-primary)] underline">
                Configurações
              </Link>
              . Vazio = sem limite por distância (apenas taxa fixa).
            </p>
            <label className="mt-4 block text-sm font-medium text-[#374151]">
              Raio máximo (km)
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="Ex.: 8"
                value={deliveryMaxKm}
                onChange={(e) => setDeliveryMaxKm(e.target.value)}
              />
              <span className="mt-1 block text-xs text-[#9ca3af]">
                Pedidos fora deste raio são recusados no checkout online.
              </span>
            </label>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {justSaved ? (
          <span className="text-sm font-medium text-emerald-700">Guardado.</span>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-xl bg-[var(--dash-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'A guardar…' : 'Guardar funcionamento'}
        </button>
      </div>
    </section>
  )
}
