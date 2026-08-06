#!/usr/bin/env node
/**
 * Cancela comandas de teste presas no mapa do Garçom — Sanduicheria Tudibom.
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
  } catch {
    /* ignore */
  }
}
loadEnv()

const TEST_NAME_PATTERNS = [
  /^teste\b/i,
  /^audit\b/i,
  /teste e2e/i,
  /comanda de teste/i,
]

function isTestComanda(order) {
  const name = String(order.customer_name ?? '').trim()
  const notes = String(order.notes ?? '').trim()
  if (TEST_NAME_PATTERNS.some((re) => re.test(name))) return true
  if (/\[Limpeza\]/i.test(notes)) return false
  if (/pedido via qr.*teste/i.test(notes)) return true
  return false
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: open, error } = await sb
    .from('orders')
    .select('id, status, customer_name, notes, total')
    .eq('store_id', STORE_ID)
    .in('source', ['waiter', 'autoatendimento'])
    .in('status', ['pending', 'preparing', 'ready', 'confirmed'])
    .is('caixa_turno_id', null)

  if (error) {
    console.error('Erro ao listar comandas:', error.message)
    process.exit(1)
  }

  const targets = (open ?? []).filter(isTestComanda)
  if (targets.length === 0) {
    console.log('Nenhuma comanda de teste em aberto.')
    return
  }

  console.log(`A cancelar ${targets.length} comanda(s) de teste…`)
  for (const order of targets) {
    const noteBase = String(order.notes ?? '').trim()
    const cleanupLine = '[Limpeza] Comanda de teste cancelada.'
    const notes = noteBase ? `${noteBase}\n${cleanupLine}` : cleanupLine
    const { error: upErr } = await sb
      .from('orders')
      .update({ status: 'cancelled', notes })
      .eq('id', order.id)
      .eq('store_id', STORE_ID)
      .neq('status', 'cancelled')

    if (upErr) {
      console.error(`❌ ${order.id.slice(0, 8)}: ${upErr.message}`)
      continue
    }
    console.log(
      `✅ Cancelada ${order.id.slice(0, 8)} — ${order.customer_name || 'sem nome'} — R$ ${order.total}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
