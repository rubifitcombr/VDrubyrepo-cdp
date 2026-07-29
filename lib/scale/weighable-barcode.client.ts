'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'

export type ParsedWeighableBarcodeClient = {
  productId: string
  name: string
  plu: string
  weightKg: number
  pricePerKg: number
  lineTotal: number
  barcode: string
}

export type ParseWeighableBarcodeResult =
  | { ok: true; data: ParsedWeighableBarcodeClient }
  | { ok: false; message: string; code?: string }

export async function parseWeighableBarcode(
  barcode: string
): Promise<ParseWeighableBarcodeResult> {
  const raw = String(barcode ?? '').trim()
  if (!raw) {
    return { ok: false, code: 'empty', message: 'Código vazio.' }
  }

  try {
    const res = await dashboardFetch('/api/scale/parse-barcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: raw }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      code?: string
      data?: ParsedWeighableBarcodeClient
    }
    if (!res.ok || !json.ok || !json.data) {
      return {
        ok: false,
        code: json.code,
        message: json.error || 'Não foi possível ler a etiqueta.',
      }
    }
    return { ok: true, data: json.data }
  } catch (error) {
    return {
      ok: false,
      code: 'network',
      message: error instanceof Error ? error.message : 'Erro de rede.',
    }
  }
}

export async function printWeighableLabel(input: {
  productId: string
  weightKg: number
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await dashboardFetch('/api/scale/print-label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    if (!res.ok || !json.ok) {
      return { ok: false, message: json.error || 'Não foi possível imprimir a etiqueta.' }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Erro de rede.',
    }
  }
}
