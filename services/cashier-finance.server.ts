import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isFinanciallyClosedOrder } from '@/lib/cashier-comanda-close'
import type {
  FinancialEntryDTO,
  FinancialEntryStatus,
  FinancialEntryType,
  OperationalSaleDTO,
  SupplierDTO,
} from '@/lib/financial-types'

const SUPPLIER_SELECT =
  'id, store_id, nome, telefone, email, categoria, cnpj, observacao, created_at'
const ENTRY_SELECT =
  'id, store_id, tipo, categoria, supplier_id, descricao, valor, vencimento, data_pagamento, status, created_at'
const SALE_SELECT =
  'id, total, created_at, source, payment_method, notes, caixa_turno_id, status'

function moneyNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
  }
  return 0
}

function parseEntryType(v: unknown): FinancialEntryType {
  return String(v ?? '').trim().toLowerCase() === 'receita' ? 'receita' : 'despesa'
}

function parseEntryStatus(v: unknown): FinancialEntryStatus {
  return String(v ?? '').trim().toLowerCase() === 'pago' ? 'pago' : 'pendente'
}

function cleanOptional(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function mapSupplier(row: Record<string, unknown>, pendingBySupplier: Map<string, number>): SupplierDTO {
  const id = String(row.id ?? '')
  return {
    id,
    store_id: String(row.store_id ?? ''),
    nome: String(row.nome ?? '').trim() || '—',
    telefone: cleanOptional(row.telefone),
    email: cleanOptional(row.email),
    categoria: cleanOptional(row.categoria),
    cnpj: cleanOptional(row.cnpj),
    observacao: cleanOptional(row.observacao),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    contas_pendentes: pendingBySupplier.get(id) ?? 0,
  }
}

function mapEntry(row: Record<string, unknown>, supplierNames: Map<string, string>): FinancialEntryDTO {
  const supplierId = cleanOptional(row.supplier_id)
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    tipo: parseEntryType(row.tipo),
    categoria: String(row.categoria ?? '').trim() || 'Sem categoria',
    supplier_id: supplierId,
    supplier_nome: supplierId ? supplierNames.get(supplierId) ?? null : null,
    descricao: String(row.descricao ?? '').trim() || '—',
    valor: moneyNumber(row.valor),
    vencimento: cleanOptional(row.vencimento),
    data_pagamento: cleanOptional(row.data_pagamento),
    status: parseEntryStatus(row.status),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function mapSale(row: Record<string, unknown>): OperationalSaleDTO {
  return {
    id: String(row.id ?? ''),
    total: moneyNumber(row.total),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    source: cleanOptional(row.source),
    payment_method: cleanOptional(row.payment_method),
  }
}

export type SupplierInput = {
  nome: string
  telefone: string | null
  email: string | null
  categoria: string | null
  cnpj: string | null
  observacao: string | null
}

export async function getFinanceiroSnapshot(
  svc: SupabaseClient,
  storeId: string
): Promise<{
  suppliers: SupplierDTO[]
  entries: FinancialEntryDTO[]
  sales: OperationalSaleDTO[]
}> {
  const since = new Date()
  since.setDate(since.getDate() - 120)

  let supplierRows: Record<string, unknown>[] = []
  {
    const primary = await svc
      .from('suppliers')
      .select(SUPPLIER_SELECT)
      .eq('store_id', storeId)
      .order('nome')
    if (!primary.error) {
      supplierRows = (primary.data ?? []) as Record<string, unknown>[]
    } else if (/cnpj|observacao|column|schema cache/i.test(primary.error.message)) {
      const fallback = await svc
        .from('suppliers')
        .select('id, store_id, nome, telefone, email, categoria, created_at')
        .eq('store_id', storeId)
        .order('nome')
      if (fallback.error) throw new Error(fallback.error.message)
      supplierRows = (fallback.data ?? []) as Record<string, unknown>[]
    } else {
      throw new Error(primary.error.message)
    }
  }

  const [{ data: entries, error: entriesErr }, { data: sales, error: salesErr }] = await Promise.all([
    svc
      .from('financial_entries')
      .select(ENTRY_SELECT)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false }),
    svc
      .from('orders')
      .select(SALE_SELECT)
      .eq('store_id', storeId)
      .eq('status', 'delivered')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(3000),
  ])

  if (entriesErr) throw new Error(entriesErr.message)
  // Vendas são opcionais no snapshot: se a query falhar, segue sem bloquear o financeiro.
  const saleRows = salesErr
    ? []
    : ((sales ?? []) as Record<string, unknown>[]).filter((row) =>
        isFinanciallyClosedOrder(row as { status?: string; notes?: string; caixa_turno_id?: string })
      )

  const entryRows = (entries ?? []) as Record<string, unknown>[]
  const supplierNames = new Map(
    supplierRows.map((s) => [String(s.id ?? ''), String(s.nome ?? '').trim() || '—'])
  )
  const pendingBySupplier = new Map<string, number>()
  for (const e of entryRows) {
    const supplierId = cleanOptional(e.supplier_id)
    if (!supplierId || parseEntryType(e.tipo) !== 'despesa' || parseEntryStatus(e.status) !== 'pendente') {
      continue
    }
    pendingBySupplier.set(supplierId, (pendingBySupplier.get(supplierId) ?? 0) + moneyNumber(e.valor))
  }

  return {
    suppliers: supplierRows.map((s) => mapSupplier(s, pendingBySupplier)),
    entries: entryRows.map((e) => mapEntry(e, supplierNames)),
    sales: saleRows.map(mapSale),
  }
}

async function writeSupplier(
  svc: SupabaseClient,
  mode: 'insert' | 'update',
  storeId: string,
  input: SupplierInput,
  id?: string
): Promise<SupplierDTO> {
  const fullRow = {
    store_id: storeId,
    nome: input.nome.trim(),
    telefone: input.telefone,
    email: input.email,
    categoria: input.categoria,
    cnpj: input.cnpj,
    observacao: input.observacao,
  }
  const basicRow = {
    store_id: storeId,
    nome: input.nome.trim(),
    telefone: input.telefone,
    email: input.email,
    categoria: input.categoria,
  }

  const run = async (row: Record<string, unknown>, select: string) => {
    if (mode === 'insert') {
      return svc.from('suppliers').insert(row).select(select).single()
    }
    return svc
      .from('suppliers')
      .update(row)
      .eq('store_id', storeId)
      .eq('id', id!)
      .select(select)
      .single()
  }

  let { data, error } = await run(fullRow, SUPPLIER_SELECT)
  if (error && /cnpj|observacao|column|schema cache/i.test(error.message)) {
    ;({ data, error } = await run(
      basicRow,
      'id, store_id, nome, telefone, email, categoria, created_at'
    ))
  }
  if (error || !data) {
    throw new Error(error?.message ?? (mode === 'insert' ? 'Erro ao criar fornecedor.' : 'Erro ao atualizar fornecedor.'))
  }
  return mapSupplier(data as unknown as Record<string, unknown>, new Map())
}

export async function insertSupplier(
  svc: SupabaseClient,
  storeId: string,
  input: SupplierInput
): Promise<SupplierDTO> {
  return writeSupplier(svc, 'insert', storeId, input)
}

export async function updateSupplier(
  svc: SupabaseClient,
  storeId: string,
  id: string,
  input: SupplierInput
): Promise<SupplierDTO> {
  return writeSupplier(svc, 'update', storeId, input, id)
}

export async function deleteSupplier(
  svc: SupabaseClient,
  storeId: string,
  id: string
): Promise<void> {
  const { error } = await svc.from('suppliers').delete().eq('store_id', storeId).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function upsertFinancialEntry(
  svc: SupabaseClient,
  storeId: string,
  input: {
    id?: string | null
    tipo: FinancialEntryType
    categoria: string
    supplier_id: string | null
    descricao: string
    valor: number
    vencimento: string | null
    data_pagamento: string | null
    status: FinancialEntryStatus
    created_at?: string | null
  }
): Promise<FinancialEntryDTO> {
  const row = {
    store_id: storeId,
    tipo: input.tipo,
    categoria: input.categoria.trim(),
    supplier_id: input.supplier_id,
    descricao: input.descricao.trim(),
    valor: input.valor,
    vencimento: input.vencimento,
    data_pagamento: input.status === 'pago' ? input.data_pagamento ?? new Date().toISOString() : null,
    status: input.status,
    ...(input.created_at ? { created_at: input.created_at } : {}),
  }

  const query = input.id
    ? svc
        .from('financial_entries')
        .update(row)
        .eq('store_id', storeId)
        .eq('id', input.id)
        .select(ENTRY_SELECT)
        .single()
    : svc.from('financial_entries').insert(row).select(ENTRY_SELECT).single()

  const { data, error } = await query
  if (error || !data) throw new Error(error?.message ?? 'Erro ao guardar lançamento.')
  return mapEntry(data as Record<string, unknown>, new Map())
}

export async function markFinancialEntryPaid(
  svc: SupabaseClient,
  storeId: string,
  id: string
): Promise<FinancialEntryDTO> {
  const { data, error } = await svc
    .from('financial_entries')
    .update({ status: 'pago', data_pagamento: new Date().toISOString() })
    .eq('store_id', storeId)
    .eq('id', id)
    .select(ENTRY_SELECT)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao marcar como pago.')
  return mapEntry(data as Record<string, unknown>, new Map())
}

export async function deleteFinancialEntry(
  svc: SupabaseClient,
  storeId: string,
  id: string
): Promise<void> {
  const { error } = await svc.from('financial_entries').delete().eq('store_id', storeId).eq('id', id)
  if (error) throw new Error(error.message)
}
