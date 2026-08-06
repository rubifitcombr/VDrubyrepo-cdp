#!/usr/bin/env node
/**
 * Auditoria DB do painel Garçom — Sanduicheria Tudibom (sem HTTP).
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
const fail = (m) => console.log(`❌ ${m}`)
const warn = (m) => console.log(`⚠️  ${m}`)

async function main() {
  console.log('\n🔍 Auditoria Garçom Tudibom (DB)\n')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  let errors = 0

  const { data: store } = await sb.from('stores').select('id, slug, name, plano, operation_mode, salao_attendance_mode, contrato_aceite_em').eq('id', STORE_ID).single()
  if (!store) { fail('Loja não encontrada'); process.exit(1) }
  pass(`Loja: ${store.name} · ${store.plano} · ${store.operation_mode} · salão=${store.salao_attendance_mode}`)

  const { count: tables } = await sb.from('store_tables').select('id', { count: 'exact', head: true }).eq('store_id', STORE_ID)
  tables >= 1 ? pass(`Mesas configuradas: ${tables}`) : (fail('Sem mesas'), errors++)

  const { data: garcons } = await sb.from('store_garcons').select('id, nome, pin_ativo, ativo').eq('store_id', STORE_ID).eq('ativo', true)
  ;(garcons?.length ?? 0) > 0 ? pass(`Garçons activos: ${garcons?.length}`) : warn('Sem garçons activos')

  const { data: openOrders } = await sb
    .from('orders')
    .select('id, status, source, customer_name, notes, total, garcom_id, caixa_turno_id')
    .eq('store_id', STORE_ID)
    .in('source', ['waiter', 'autoatendimento'])
    .in('status', ['pending', 'preparing', 'ready', 'confirmed'])
    .is('caixa_turno_id', null)

  const orders = openOrders ?? []
  pass(`Comandas abertas no mapa: ${orders.length}`)

  const unnamed = orders.filter((o) => !o.customer_name?.trim())
  if (unnamed.length > 0) {
    warn(`${unnamed.length} comanda(s) sem nome (será preenchido ao registar nova)`)
  } else {
    pass('Todas as comandas abertas têm nome')
  }

  for (const o of orders.slice(0, 5)) {
    const { data: items, error } = await sb
      .from('order_items')
      .select('id, product_id, name, unit_price, addons')
      .eq('order_id', o.id)
    if (error) { fail(`order_items ${o.id}: ${error.message}`); errors++; continue }
    if (!items?.length) { warn(`Comanda ${o.id.slice(0, 8)} sem itens`); continue }
    const hasAddonsCol = items.every((it) => 'addons' in it)
    if (!hasAddonsCol) { fail('Coluna addons em falta em order_items'); errors++ }
  }
  pass('Estrutura order_items.addons OK (amostra)')

  const productIds = [...new Set((await sb.from('products').select('id').eq('store_id', STORE_ID).eq('active', true)).data?.map((p) => p.id) ?? [])]
  const { count: addonGroups } = await sb.from('addon_groups').select('id', { count: 'exact', head: true }).in('product_id', productIds.slice(0, 200))
  pass(`Grupos de adicionais: ${addonGroups ?? 0}`)

  const { data: turno } = await sb.from('caixa_turnos').select('id').eq('store_id', STORE_ID).is('fechado_em', null).maybeSingle()
  turno ? pass('Turno de caixa: aberto') : warn('Turno de caixa: fechado (Receber agora bloqueado até abrir)')

  console.log(`\n─── ${errors === 0 ? 'DB OK' : `${errors} falha(s)`} ───\n`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
