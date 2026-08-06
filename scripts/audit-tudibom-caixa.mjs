#!/usr/bin/env node
/**
 * Auditoria DB do módulo Caixa — Sanduicheria Tudibom.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const STORE_ID = 'e472b84e-32c1-4a9d-87fc-756b874f793a'

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch { /* */ }
}
loadEnv()

const pass = (m) => console.log(`✅ ${m}`)
const warn = (m) => console.log(`⚠️  ${m}`)
const fail = (m) => console.log(`❌ ${m}`)

function paymentRegistered(notes) {
  const text = String(notes ?? '')
  return (
    /\[Caixa\] Fechado em /i.test(text) ||
    /\[PDV\] Recebido em /i.test(text) ||
    /\[Garçom\] Recebido em /i.test(text)
  )
}

async function main() {
  console.log('\n🔍 Auditoria Caixa Tudibom (DB)\n')
  let errors = 0
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: turno } = await sb
    .from('caixas_turnos')
    .select('id, status, aberto_em, operador')
    .eq('store_id', STORE_ID)
    .eq('status', 'aberto')
    .maybeSingle()

  if (turno) {
    pass(`Turno aberto: ${turno.operador} desde ${turno.aberto_em}`)
  } else {
    warn('Nenhum turno aberto (Receber comandas bloqueado até abrir)')
  }

  const { data: comandas } = await sb
    .from('orders')
    .select('id, source, status, total, notes, customer_name, payment_method')
    .eq('store_id', STORE_ID)
    .in('source', ['pdv', 'waiter', 'autoatendimento'])
    .neq('status', 'cancelled')

  const open = (comandas ?? []).filter((o) => !paymentRegistered(o.notes))
  pass(`Comandas em aberto no caixa: ${open.length}`)
  const unnamed = open.filter((o) => !String(o.customer_name ?? '').trim())
  if (unnamed.length > 0) {
    warn(`${unnamed.length} comanda(s) sem nome de cliente`)
  }

  const { data: splitOrders } = await sb
    .from('orders')
    .select('id')
    .eq('store_id', STORE_ID)
    .eq('payment_method', 'split')
    .limit(50)

  let splitMissing = 0
  for (const o of splitOrders ?? []) {
    const { count } = await sb
      .from('order_payments')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', o.id)
    if (!count) splitMissing++
  }
  if (splitMissing > 0) {
    fail(`${splitMissing} pedido(s) split sem linhas em order_payments`)
    errors++
  } else {
    pass('Pagamentos split com linhas em order_payments OK')
  }

  if (turno?.id) {
    const { count: movs } = await sb
      .from('caixa_movimentacoes')
      .select('*', { count: 'exact', head: true })
      .eq('turno_id', turno.id)
    pass(`Movimentações no turno atual: ${movs ?? 0}`)
  }

  console.log(`\n─── ${errors === 0 ? 'Caixa DB OK' : `${errors} falha(s)`} ───\n`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
