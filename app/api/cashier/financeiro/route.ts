import { NextRequest, NextResponse } from 'next/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/services/auth.server'
import {
  deleteFinancialEntry,
  deleteSupplier,
  getFinanceiroSnapshot,
  insertSupplier,
  markFinancialEntryPaid,
  updateSupplier,
  upsertFinancialEntry,
} from '@/services/cashier-finance.server'
import type { FinancialEntryStatus, FinancialEntryType } from '@/lib/financial-types'

function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim())
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
  }
  return 0
}

function optionalText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function optionalDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const raw = v.trim()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function entryType(v: unknown): FinancialEntryType | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'receita' || t === 'despesa') return t
  return null
}

function entryStatus(v: unknown): FinancialEntryStatus {
  return String(v ?? '').trim().toLowerCase() === 'pago' ? 'pago' : 'pendente'
}

function supplierPayload(body: Record<string, unknown>) {
  const nome = optionalText(body.nome)
  if (!nome) return null
  return {
    nome,
    telefone: optionalText(body.telefone),
    email: optionalText(body.email),
    categoria: optionalText(body.categoria),
    cnpj: optionalText(body.cnpj),
    observacao: optionalText(body.observacao),
  }
}

async function requireCashierAccess() {
  const user = await getUser()
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }),
    }
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return { ok: false as const, response: gate.response }

  const deny = gateMerchantMenuKey(gate.ctx.store, user.email, 'caixa')
  if (deny) return { ok: false as const, response: deny }

  return { ok: true as const, storeId: gate.ctx.storeId }
}

function financeiroDbErrorResponse(msg: string) {
  if (/relation|does not exist|schema cache|42P01/i.test(msg)) {
    return NextResponse.json(
      {
        error:
          'Tabelas do Financeiro em falta. Aplica supabase/migrations/20260725190016_financeiro_schema.sql no Supabase.',
        missingTable: true,
      },
      { status: 503 }
    )
  }
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function GET() {
  const access = await requireCashierAccess()
  if (!access.ok) return access.response

  const supabase = await createClient()
  try {
    const snapshot = await getFinanceiroSnapshot(supabase, access.storeId)
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    if (/relation|does not exist|schema cache|42P01/i.test(msg)) {
      return NextResponse.json({
        ok: true,
        suppliers: [],
        entries: [],
        sales: [],
        missingTable: true,
      })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const access = await requireCashierAccess()
  if (!access.ok) return access.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const resource = String(body.resource ?? '').trim().toLowerCase()

  try {
    if (resource === 'supplier') {
      const payload = supplierPayload(body)
      if (!payload) return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 })

      const id = optionalText(body.id)
      const supplier = id
        ? await updateSupplier(supabase, access.storeId, id, payload)
        : await insertSupplier(supabase, access.storeId, payload)
      return NextResponse.json({ ok: true, supplier })
    }

    if (resource !== 'entry') {
      return NextResponse.json({ error: 'Recurso inválido.' }, { status: 400 })
    }

    const tipo = entryType(body.tipo)
    const valor = parseMoney(body.valor)
    const categoria = optionalText(body.categoria)
    const descricao = optionalText(body.descricao)
    if (!tipo) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })
    if (!categoria) return NextResponse.json({ error: 'Categoria obrigatória.' }, { status: 400 })
    if (!descricao) return NextResponse.json({ error: 'Descrição obrigatória.' }, { status: 400 })
    if (valor <= 0) return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 })

    const entry = await upsertFinancialEntry(supabase, access.storeId, {
      id: optionalText(body.id),
      tipo,
      categoria,
      supplier_id: optionalText(body.supplier_id),
      descricao,
      valor,
      vencimento: optionalDate(body.vencimento),
      data_pagamento: optionalDate(body.data_pagamento),
      status: entryStatus(body.status),
      created_at: optionalDate(body.created_at),
    })

    return NextResponse.json({ ok: true, entry })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return financeiroDbErrorResponse(msg)
  }
}

export async function PATCH(req: NextRequest) {
  const access = await requireCashierAccess()
  if (!access.ok) return access.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const id = optionalText(body.id)
  if (!id) return NextResponse.json({ error: 'ID em falta.' }, { status: 400 })

  const action = String(body.action ?? '').trim().toLowerCase()
  if (action !== 'mark_paid') {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }

  const supabase = await createClient()
  try {
    const entry = await markFinancialEntryPaid(supabase, access.storeId, id)
    return NextResponse.json({ ok: true, entry })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return financeiroDbErrorResponse(msg)
  }
}

export async function DELETE(req: NextRequest) {
  const access = await requireCashierAccess()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'ID em falta.' }, { status: 400 })

  const resource = String(searchParams.get('resource') ?? 'entry').trim().toLowerCase()
  const supabase = await createClient()
  try {
    if (resource === 'supplier') {
      await deleteSupplier(supabase, access.storeId, id)
      return NextResponse.json({ ok: true })
    }
    if (resource === 'entry') {
      await deleteFinancialEntry(supabase, access.storeId, id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Recurso inválido.' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return financeiroDbErrorResponse(msg)
  }
}
