'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCart } from '@/app/context/CartContext'
import { computeDeliveryCharge } from '@/lib/delivery-pricing'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, '')
}

function buildMessage(
  storeName: string,
  items: { name: string; quantity: number; price: number }[],
  subtotal: number
) {
  if (items.length === 0) {
    return `Olá! Vim pelo cardápio online da *${storeName}* e gostaria de fazer um pedido.`
  }

  const lines = [
    `Olá! Gostaria de pedir na *${storeName}*:`,
    '',
    ...items.map(
      (i) =>
        `• ${i.name} x${i.quantity} — ${money.format(i.price * i.quantity)}`
    ),
    '',
    `*Subtotal:* ${money.format(subtotal)}`,
  ]
  return lines.join('\n')
}

function formatAddressBlock(parts: {
  rua: string
  quadra: string
  lote: string
  casa: string
  referencia: string
  bairro: string
}): string {
  return [
    `Rua: ${parts.rua}`,
    `Quadra: ${parts.quadra}`,
    `Lote: ${parts.lote}`,
    `Casa: ${parts.casa}`,
    `Ponto de referência: ${parts.referencia}`,
    `Bairro: ${parts.bairro}`,
  ].join('\n')
}

type FulfillmentType = 'delivery' | 'pickup'

export function WhatsAppCheckoutButton({
  storeName,
  storeSlug,
  storePlan,
  phone,
  deliveryFee,
  deliveryFreeAbove,
  deliveryMaxKm: _deliveryMaxKm,
  locationEnabled,
  locationLat,
  locationLng,
  locationAddress,
  locationLabel,
  openSignal,
}: {
  storeName: string
  storeSlug: string
  storePlan: string | null | undefined
  phone: string | null | undefined
  deliveryFee?: number | null
  deliveryFreeAbove?: number | null
  /** Reservado: raio validado no servidor no checkout. */
  deliveryMaxKm?: number | null
  locationEnabled?: boolean
  locationLat?: number | null
  locationLng?: number | null
  locationAddress?: string | null
  locationLabel?: string | null
  openSignal?: number
}) {
  void _deliveryMaxKm
  const { items, subtotal, clearCart } = useCart()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [addressRua, setAddressRua] = useState('')
  const [addressQuadra, setAddressQuadra] = useState('')
  const [addressLote, setAddressLote] = useState('')
  const [addressCasa, setAddressCasa] = useState('')
  const [addressReferencia, setAddressReferencia] = useState('')
  const [addressBairro, setAddressBairro] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'cash'>(
    'pix'
  )
  const [trocoPara, setTrocoPara] = useState('')
  const [notes, setNotes] = useState('')
  const [fulfillment, setFulfillment] = useState<FulfillmentType | null>(null)
  void storePlan
  const lastOpenSignalRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (openSignal == null) return
    if (lastOpenSignalRef.current == null) {
      lastOpenSignalRef.current = openSignal
      return
    }
    if (openSignal === lastOpenSignalRef.current) return
    lastOpenSignalRef.current = openSignal
    if (!items.length) return
    const tid = window.setTimeout(() => {
      setError(null)
      setFulfillment(null)
      setOpen(true)
    }, 0)
    return () => window.clearTimeout(tid)
  }, [openSignal, items.length])

  const estimatedDelivery = useMemo(
    () =>
      computeDeliveryCharge(
        subtotal,
        deliveryFee ?? null,
        deliveryFreeAbove ?? null
      ),
    [subtotal, deliveryFee, deliveryFreeAbove]
  )

  const estimatedTotal = subtotal + estimatedDelivery
  const pickupLocationLabel = locationLabel?.trim() || 'Retirada na loja'
  const pickupLocationAddress = locationAddress?.trim() || ''
  const pickupMapsHref = locationMapsHref()

  const waUrl = useMemo(() => {
    const raw = phone?.trim()
    if (!raw) return null
    const n = digitsOnly(raw)
    if (!n) return null
    const text = buildMessage(storeName, items, subtotal)
    return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
  }, [phone, storeName, items, subtotal])

  if (!waUrl) {
    return (
      <p className="text-center text-sm text-vyria-navy-muted">
        Esta loja ainda não configurou o WhatsApp para pedidos.
      </p>
    )
  }

  function validateDeliveryCheckout(): string | null {
    const phoneDigits = digitsOnly(customerPhone)
    if (phoneDigits.length < 10) {
      return 'Telefone é obrigatório (mínimo 10 dígitos).'
    }
    if (!addressRua.trim()) return 'Preenche a rua.'
    if (!addressQuadra.trim()) return 'Preenche a quadra.'
    if (!addressLote.trim()) return 'Preenche o lote.'
    if (!addressCasa.trim()) return 'Preenche o número da casa.'
    if (!addressReferencia.trim()) return 'Preenche o ponto de referência.'
    if (!addressBairro.trim()) return 'Preenche o bairro.'
    if (paymentMethod === 'cash' && !trocoPara.trim()) {
      return 'Preenche o campo «troco para quanto?».'
    }
    return null
  }

  function validatePickupCheckout(): string | null {
    const phoneDigits = digitsOnly(customerPhone)
    if (phoneDigits.length < 10) {
      return 'Telefone é obrigatório (mínimo 10 dígitos).'
    }
    if (paymentMethod === 'cash' && !trocoPara.trim()) {
      return 'Preenche o campo «troco para quanto?».'
    }
    return null
  }

  function paymentLabel(method: 'pix' | 'card' | 'cash'): string {
    if (method === 'pix') return 'PIX'
    if (method === 'card') return 'Cartão'
    return 'Dinheiro'
  }

  function buildNotesPayload(): string {
    const base = notes.trim()
    const trocoLine =
      paymentMethod === 'cash' && trocoPara.trim()
        ? `Troco para: ${trocoPara.trim()}`
        : ''
    return [base, trocoLine].filter(Boolean).join('\n')
  }

  function locationMapsHref(): string | null {
    if (!locationEnabled) return null
    const rawText = locationAddress?.trim() || ''
    if (rawText && /^https?:\/\//i.test(rawText)) return rawText
    const hasCoords =
      Number.isFinite(Number(locationLat)) && Number.isFinite(Number(locationLng))
    if (hasCoords) {
      return `https://maps.google.com/?q=${locationLat},${locationLng}`
    }
    if (rawText) {
      return `https://maps.google.com/?q=${encodeURIComponent(rawText)}`
    }
    return null
  }

  async function submitDeliveryOrder() {
    if (!items.length || submitting) return
    setError(null)
    const validationError = validateDeliveryCheckout()
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    try {
      const resp = await fetch('/api/public/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: storeSlug,
          fulfillment: 'delivery',
          customerName,
          customerPhone,
          addressRua: addressRua.trim(),
          addressQuadra: addressQuadra.trim(),
          addressLote: addressLote.trim(),
          addressCasa: addressCasa.trim(),
          addressReferencia: addressReferencia.trim(),
          addressBairro: addressBairro.trim(),
          paymentMethod,
          notes: buildNotesPayload(),
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.price,
          })),
        }),
      })
      const payload = (await resp.json()) as {
        ok?: boolean
        error?: string
        orderId?: string
        subtotal?: number
        deliveryCharge?: number
        orderTotal?: number
      }
      if (!resp.ok || !payload.ok || !payload.orderId) {
        setSubmitting(false)
        setError(payload.error || 'Não foi possível finalizar o pedido.')
        return
      }
      const ref = `#${payload.orderId.slice(0, 8).toUpperCase()}`
      const subFinal =
        typeof payload.subtotal === 'number' ? payload.subtotal : subtotal
      const dCharge =
        typeof payload.deliveryCharge === 'number'
          ? payload.deliveryCharge
          : estimatedDelivery
      const totalFinal =
        typeof payload.orderTotal === 'number'
          ? payload.orderTotal
          : subFinal + dCharge

      const baseText = buildMessage(storeName, items, subtotal)
      const addrBlock = formatAddressBlock({
        rua: addressRua.trim(),
        quadra: addressQuadra.trim(),
        lote: addressLote.trim(),
        casa: addressCasa.trim(),
        referencia: addressReferencia.trim(),
        bairro: addressBairro.trim(),
      })
      const nameLine = customerName.trim()
        ? `*Nome:* ${customerName.trim()}`
        : ''
      const finalText = [
        baseText,
        '',
        nameLine,
        `*Telefone:* ${customerPhone.trim()}`,
        '*Endereço:*',
        addrBlock,
        `*Pagamento:* ${paymentLabel(paymentMethod)}`,
        paymentMethod === 'cash' && trocoPara.trim()
          ? `*Troco para quanto:* ${trocoPara.trim()}`
          : '',
        notes.trim() ? `*Observações:* ${notes.trim()}` : '',
        '',
        `*Subtotal:* ${money.format(subFinal)}`,
        `*Entrega:* ${dCharge <= 0 ? 'Grátis' : money.format(dCharge)}`,
        `*Total:* ${money.format(totalFinal)}`,
        '',
        `*Pedido:* ${ref}`,
      ]
        .filter(Boolean)
        .join('\n')
      const n = digitsOnly(phone || '')
      const link = `https://wa.me/${n}?text=${encodeURIComponent(finalText)}`
      window.open(link, '_blank', 'noopener,noreferrer')
      clearCart()
      setSubmitting(false)
      setOpen(false)
      setFulfillment(null)
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : 'Erro ao finalizar pedido.')
    }
  }

  async function submitPickupOrder() {
    if (!items.length || submitting) return
    setError(null)
    const validationError = validatePickupCheckout()
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    try {
      const resp = await fetch('/api/public/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: storeSlug,
          fulfillment: 'pickup',
          customerName,
          customerPhone,
          paymentMethod,
          notes: buildNotesPayload(),
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.price,
          })),
        }),
      })
      const payload = (await resp.json()) as {
        ok?: boolean
        error?: string
        orderId?: string
        orderTotal?: number
      }
      if (!resp.ok || !payload.ok || !payload.orderId) {
        setSubmitting(false)
        setError(payload.error || 'Não foi possível finalizar o pedido.')
        return
      }

      const ref = `#${payload.orderId.slice(0, 8).toUpperCase()}`
      const finalTotal =
        typeof payload.orderTotal === 'number' ? payload.orderTotal : subtotal
      const baseText = buildMessage(storeName, items, subtotal)
      const finalText = [
        baseText,
        '',
        '*Tipo:* Retirar na loja',
        customerName.trim() ? `*Nome:* ${customerName.trim()}` : '',
        `*Telefone:* ${customerPhone.trim()}`,
        `*Pagamento:* ${paymentLabel(paymentMethod)}`,
        paymentMethod === 'cash' && trocoPara.trim()
          ? `*Troco para quanto:* ${trocoPara.trim()}`
          : '',
        notes.trim() ? `*Observações:* ${notes.trim()}` : '',
        '',
        `*Total:* ${money.format(finalTotal)}`,
        '',
        `*Local de retirada:* ${pickupLocationLabel}`,
        pickupLocationAddress ? pickupLocationAddress : '',
        pickupMapsHref ? `Mapa: ${pickupMapsHref}` : '',
        '',
        `*Pedido:* ${ref}`,
      ]
        .filter(Boolean)
        .join('\n')
      const n = digitsOnly(phone || '')
      const link = `https://wa.me/${n}?text=${encodeURIComponent(finalText)}`
      window.open(link, '_blank', 'noopener,noreferrer')
      clearCart()
      setSubmitting(false)
      setOpen(false)
      setFulfillment(null)
    } catch (e) {
      setSubmitting(false)
      setError(e instanceof Error ? e.message : 'Erro ao finalizar pedido.')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setFulfillment(null)
          setOpen(true)
        }}
        disabled={items.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-600/25 ring-2 ring-offset-2 ring-offset-white ring-[#F27121]/40 transition-colors hover:bg-[#20BD5A] active:bg-[#18994a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          className="h-5 w-5 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.883 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Finalizar pedido
      </button>

      {open && typeof window !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] bg-black/55"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setOpen(false)
                  setFulfillment(null)
                }
              }}
            >
              <div className="flex min-h-dvh items-end justify-center p-0 sm:items-center sm:p-6">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="checkout-modal-title"
                  className="w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-3xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-[var(--card-border)] px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3
                          id="checkout-modal-title"
                          className="text-lg font-bold tracking-tight text-vyria-navy"
                        >
                          Finalizar pedido
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false)
                          setFulfillment(null)
                        }}
                        className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-vyria-navy-muted transition-colors hover:bg-[#f8fafc] active:bg-neutral-200"
                      >
                        Fechar
                      </button>
                    </div>
                    <p className="mt-3 text-xs font-medium text-vyria-navy-muted">
                      {items.length} item(ns) no carrinho
                    </p>
                    <div className="mt-3 rounded-xl border border-[var(--card-border)] bg-[#f8fafc] px-3 py-2 text-xs text-vyria-navy">
                      <p className="flex justify-between gap-2">
                        <span>Subtotal</span>
                        <span className="font-semibold tabular-nums">
                          {money.format(subtotal)}
                        </span>
                      </p>
                      {fulfillment === 'delivery' ? (
                        <>
                          <p className="mt-1 flex justify-between gap-2">
                            <span>Entrega (estim.)</span>
                            <span className="font-semibold tabular-nums">
                              {estimatedDelivery <= 0
                                ? 'Grátis'
                                : money.format(estimatedDelivery)}
                            </span>
                          </p>
                          <p className="mt-1 flex justify-between border-t border-[var(--card-border)] pt-1 font-semibold">
                            <span>Total estimado</span>
                            <span className="tabular-nums">
                              {money.format(estimatedTotal)}
                            </span>
                          </p>
                          {deliveryFreeAbove != null &&
                          deliveryFreeAbove > 0 &&
                          subtotal < deliveryFreeAbove ? (
                            <p className="mt-2 text-[11px] leading-snug text-vyria-navy-muted">
                              Frete grátis a partir de {money.format(deliveryFreeAbove)} em
                              produtos.
                            </p>
                          ) : null}
                        </>
                      ) : fulfillment === 'pickup' ? (
                        <p className="mt-1 flex justify-between border-t border-[var(--card-border)] pt-1 font-semibold">
                        <span>Total (retirada)</span>
                          <span className="tabular-nums">{money.format(subtotal)}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="max-h-[62dvh] overflow-y-auto px-4 py-4 sm:max-h-[60dvh] sm:px-6 sm:py-5">
                    {fulfillment == null ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-vyria-navy">
                          Como você quer receber o pedido?
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              setError(null)
                              setFulfillment('delivery')
                            }}
                            className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-4 text-left transition-colors hover:bg-[#f8fafc] active:bg-neutral-100"
                          >
                            <p className="text-sm font-semibold text-vyria-navy">Entregar</p>
                            <p className="mt-1 text-xs text-vyria-navy-muted">
                              Informar endereço e calcular taxa de entrega.
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setError(null)
                              setFulfillment('pickup')
                            }}
                            className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-4 text-left transition-colors hover:bg-[#f8fafc] active:bg-neutral-100"
                          >
                            <p className="text-sm font-semibold text-vyria-navy">Retirar</p>
                            <p className="mt-1 text-xs text-vyria-navy-muted">
                              Retirada na loja, sem taxa de entrega.
                            </p>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="sm:col-span-1">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                            Nome{' '}
                            <span className="font-normal normal-case text-vyria-navy-muted/80">
                              (opcional)
                            </span>
                          </span>
                          <input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Seu nome"
                            autoComplete="name"
                            className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                          />
                        </label>
                        <label className="sm:col-span-1">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                            Telefone <span className="text-red-600">*</span>
                          </span>
                          <input
                            type="tel"
                            inputMode="tel"
                            required
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Ex.: 62999999999"
                            autoComplete="tel"
                            className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                          />
                        </label>

                        {fulfillment === 'delivery' ? (
                          <div className="sm:col-span-2">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                              Endereço para entrega <span className="text-red-600">*</span>
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="sm:col-span-2">
                                <span className="mb-1 block text-[11px] font-medium text-vyria-navy-muted">
                                  Rua <span className="text-red-600">*</span>
                                </span>
                                <input
                                  required
                                  value={addressRua}
                                  onChange={(e) => setAddressRua(e.target.value)}
                                  placeholder="Nome da rua / avenida"
                                  autoComplete="street-address"
                                  className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                                />
                              </label>
                              <label>
                                <span className="mb-1 block text-[11px] font-medium text-vyria-navy-muted">
                                  Quadra <span className="text-red-600">*</span>
                                </span>
                                <input
                                  required
                                  value={addressQuadra}
                                  onChange={(e) => setAddressQuadra(e.target.value)}
                                  placeholder="Ex.: Qd. 12"
                                  className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                                />
                              </label>
                              <label>
                                <span className="mb-1 block text-[11px] font-medium text-vyria-navy-muted">
                                  Lote <span className="text-red-600">*</span>
                                </span>
                                <input
                                  required
                                  value={addressLote}
                                  onChange={(e) => setAddressLote(e.target.value)}
                                  placeholder="Ex.: Lt. 5"
                                  className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                                />
                              </label>
                              <label>
                                <span className="mb-1 block text-[11px] font-medium text-vyria-navy-muted">
                                  Casa <span className="text-red-600">*</span>
                                </span>
                                <input
                                  required
                                  value={addressCasa}
                                  onChange={(e) => setAddressCasa(e.target.value)}
                                  placeholder="Nº da casa / apto"
                                  className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                                />
                              </label>
                              <label className="sm:col-span-2">
                                <span className="mb-1 block text-[11px] font-medium text-vyria-navy-muted">
                                  Ponto de referência <span className="text-red-600">*</span>
                                </span>
                                <input
                                  required
                                  value={addressReferencia}
                                  onChange={(e) => setAddressReferencia(e.target.value)}
                                  placeholder="Ex.: perto da padaria, portão azul"
                                  className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                                />
                              </label>
                              <label className="sm:col-span-2">
                                <span className="mb-1 block text-[11px] font-medium text-vyria-navy-muted">
                                  Bairro <span className="text-red-600">*</span>
                                </span>
                                <input
                                  required
                                  value={addressBairro}
                                  onChange={(e) => setAddressBairro(e.target.value)}
                                  placeholder="Nome do bairro"
                                  autoComplete="address-level2"
                                  className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="sm:col-span-2 rounded-xl border border-[var(--card-border)] bg-[#f8fafc] px-3 py-3 text-sm text-vyria-navy">
                            <p className="font-semibold">Local de retirada</p>
                            <p className="mt-1 text-vyria-navy-muted">
                              {pickupLocationLabel}
                            </p>
                            {pickupLocationAddress ? (
                              <p className="mt-1 whitespace-pre-line text-vyria-navy-muted">
                                {pickupLocationAddress}
                              </p>
                            ) : null}
                            {pickupMapsHref ? (
                              <a
                                href={pickupMapsHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-sm font-semibold text-vyria-plum underline"
                              >
                                Abrir no mapa
                              </a>
                            ) : null}
                          </div>
                        )}

                        <div className="flex flex-col gap-3 sm:col-span-1">
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                              Pagamento
                            </span>
                            <select
                              value={paymentMethod}
                              onChange={(e) => {
                                const v = e.target.value as 'pix' | 'card' | 'cash'
                                setPaymentMethod(v)
                                if (v !== 'cash') setTrocoPara('')
                              }}
                              className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                            >
                              <option value="pix">PIX</option>
                              <option value="card">Cartão</option>
                              <option value="cash">Dinheiro</option>
                            </select>
                          </label>
                          {paymentMethod === 'cash' ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                                Troco para quanto? <span className="text-red-600">*</span>
                              </span>
                              <input
                                value={trocoPara}
                                onChange={(e) => setTrocoPara(e.target.value)}
                                placeholder="Ex.: 50,00 ou exato"
                                inputMode="text"
                                autoComplete="off"
                                className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                              />
                            </label>
                          ) : null}
                        </div>
                        <label className="sm:col-span-1">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                            Observações{' '}
                            <span className="font-normal normal-case text-vyria-navy-muted/80">
                              (opcional)
                            </span>
                          </span>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ex.: sem cebola"
                            rows={3}
                            className="w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                          />
                        </label>
                      </div>
                    )}

                    {error ? (
                      <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {error}
                      </p>
                    ) : null}
                  </div>

                  <div className="border-t border-[var(--card-border)] bg-white px-4 py-3 sm:px-6 sm:py-4">
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-vyria-navy">
                        Total:{' '}
                        {money.format(
                          fulfillment === 'delivery' ? estimatedTotal : subtotal
                        )}
                      </p>
                      {fulfillment == null ? null : (
                        <div className="flex w-full gap-2 sm:w-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setError(null)
                              setFulfillment(null)
                            }}
                            className="w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm font-semibold text-vyria-navy-muted transition-colors hover:bg-[#f8fafc] sm:w-auto"
                          >
                            Voltar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void (fulfillment === 'delivery'
                                ? submitDeliveryOrder()
                                : submitPickupOrder())
                            }
                            disabled={submitting || items.length === 0}
                            className="w-full rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#20bd5a] active:bg-[#18994a] disabled:opacity-60 sm:w-auto"
                          >
                            {submitting ? 'A finalizar…' : 'Enviar pedido'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
