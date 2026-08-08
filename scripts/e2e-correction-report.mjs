#!/usr/bin/env node
/**
 * Relatório CSV de pedidos/comandas de teste E2E num dia e loja.
 *
 * Uso:
 *   npm run e2e:correction-report -- --store tudibom --date 2026-08-07
 *   npm run e2e:correction-report -- --store tudibom --date 2026-08-07 --out ./meu-relatorio.csv
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const TEST_NAME_PATTERNS = [
  /^e2e\b/i,
  /^smoke\b/i,
  /smoke pós-deploy/i,
  /^teste\b/i,
  /^audit\b/i,
  /teste e2e/i,
  /comanda de teste/i,
  /^e2e /i,
  /^e2e stock/i,
  /^e2e concurrency/i,
  /^e2e rollback/i,
  /^e2e auto accept/i,
  /^e2e loyalty/i,
  /^e2e referral/i,
  /^e2e garçom/i,
  /^e2e garcom/i,
]

const TEST_MESAS = new Set(['77', '88', '99'])

function loadEnv() {
  for (const name of ['.env.local', '.env.test']) {
    try {
      const raw = readFileSync(resolve(root, name), 'utf8')
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
      /* optional */
    }
  }
}

function parseArgs(argv) {
  const out = { store: null, date: null, out: null }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--store' && argv[i + 1]) out.store = argv[++i]
    else if (arg === '--date' && argv[i + 1]) out.date = argv[++i]
    else if (arg === '--out' && argv[i + 1]) out.out = argv[++i]
    else if (arg === '--help' || arg === '-h') out.help = true
  }
  return out
}

function usage() {
  console.log(`Uso:
  npm run e2e:correction-report -- --store <slug> --date YYYY-MM-DD [--out caminho.csv]

Exemplo:
  npm run e2e:correction-report -- --store tudibom --date 2026-08-07`)
}

function parseYmd(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw ?? ''))) return null
  return String(raw)
}

/** Início do dia civil em America/Sao_Paulo → ISO UTC (mesma regra dos relatórios). */
function spDayStartUtcIso(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0)).toISOString()
}

function spNextDayYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d, 3, 0, 0, 0) + 86400000
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(t)
  )
}

function parseMesa(order) {
  const notes = String(order.notes ?? '')
  const fromNotes =
    notes.match(/^\[Mesa\s+([^\]]+)\]/im)?.[1]?.trim() ||
    notes.match(/Mesa:\s*([^\n]+)/i)?.[1]?.trim() ||
    null
  if (fromNotes) return fromNotes
  return String(order.customer_name ?? '').match(/Mesa\s+(\S+)/i)?.[1]?.trim() || ''
}

function classifyTestOrder(order, validTableNames) {
  const name = String(order.customer_name ?? '').trim()
  const notes = String(order.notes ?? '').trim()
  const reasons = []

  for (const re of TEST_NAME_PATTERNS) {
    if (re.test(name)) {
      reasons.push(`nome: ${re}`)
      break
    }
  }
  if (/pedido via qr.*teste/i.test(notes)) reasons.push('notas: pedido QR teste')
  if (/\[E2E teardown\]/i.test(notes)) reasons.push('notas: E2E teardown')
  if (/\[Limpeza\]/i.test(notes)) reasons.push('notas: limpeza manual')

  const mesa = parseMesa(order)
  if (mesa && TEST_MESAS.has(mesa) && order.source === 'waiter') {
    reasons.push(`mesa de teste E2E: ${mesa}`)
  } else if (mesa && !validTableNames.has(mesa) && order.source === 'waiter') {
    reasons.push(`mesa inválida/inexistente: ${mesa}`)
  }

  return { isTest: reasons.length > 0, reasons: reasons.join('; ') }
}

function csvCell(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function formatBrt(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(iso))
}

function moneyBrl(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0.00'
  return v.toFixed(2)
}

async function main() {
  loadEnv()
  const args = parseArgs(process.argv)
  if (args.help || !args.store || !args.date) {
    usage()
    process.exit(args.help ? 0 : 1)
  }

  const ymd = parseYmd(args.date)
  if (!ymd) {
    console.error('❌ --date deve ser YYYY-MM-DD')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local')
    process.exit(1)
  }

  const sb = createClient(url, key)
  const slug = args.store.trim().toLowerCase()

  const { data: store, error: storeErr } = await sb
    .from('stores')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle()

  if (storeErr || !store?.id) {
    console.error(`❌ Loja não encontrada: ${slug} (${storeErr?.message ?? 'sem dados'})`)
    process.exit(1)
  }

  const storeId = String(store.id)
  const fromIso = spDayStartUtcIso(ymd)
  const toIso = spDayStartUtcIso(spNextDayYmd(ymd))

  const { data: tables } = await sb
    .from('store_tables')
    .select('name')
    .eq('store_id', storeId)
    .eq('active', true)
  const validTableNames = new Set((tables ?? []).map((t) => String(t.name).trim()))

  const { data: orders, error } = await sb
    .from('orders')
    .select(
      'id, status, source, customer_name, notes, total, created_at, updated_at, caixa_turno_id, payment_method, garcom_nome'
    )
    .eq('store_id', storeId)
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at')

  if (error) {
    console.error('❌ Erro ao listar pedidos:', error.message)
    process.exit(1)
  }

  const turnoIds = [
    ...new Set(
      (orders ?? [])
        .map((o) => o.caixa_turno_id)
        .filter(Boolean)
        .map(String)
    ),
  ]

  const turnoMap = new Map()
  if (turnoIds.length > 0) {
    const { data: turnos } = await sb
      .from('caixas_turnos')
      .select('id, aberto_em, fechado_em, total_geral, operador, status')
      .in('id', turnoIds)
    for (const t of turnos ?? []) {
      turnoMap.set(String(t.id), t)
    }
  }

  const allDay = orders ?? []
  const testRows = []
  let testTotalAll = 0
  let testTotalReported = 0
  let dayTotal = 0

  for (const order of allDay) {
    const total = Number(order.total) || 0
    const cancelled = String(order.status).toLowerCase() === 'cancelled'
    if (!cancelled) dayTotal += total
    const { isTest, reasons } = classifyTestOrder(order, validTableNames)
    if (!isTest) continue

    testTotalAll += total
    if (!cancelled) testTotalReported += total
    const turno = order.caixa_turno_id ? turnoMap.get(String(order.caixa_turno_id)) : null
    testRows.push({
      order_id: order.id,
      created_at_brt: formatBrt(order.created_at),
      customer_name: order.customer_name,
      mesa: parseMesa(order),
      status: order.status,
      source: order.source,
      total_brl: moneyBrl(total),
      payment_method: order.payment_method ?? '',
      garcom_nome: order.garcom_nome ?? '',
      caixa_turno_id: order.caixa_turno_id ?? '',
      turno_total_gravado: turno ? moneyBrl(turno.total_geral) : '',
      turno_fechado_em_brt: turno?.fechado_em ? formatBrt(turno.fechado_em) : '',
      incluido_em_relatorio_vendas: cancelled ? 'nao' : 'sim',
      motivo_classificacao_teste: reasons,
    })
  }

  const outPath =
    args.out?.trim() ||
    resolve(root, 'reports', `e2e-correction-${slug}-${ymd}.csv`)

  mkdirSync(dirname(outPath), { recursive: true })

  const header = [
    'order_id',
    'created_at_brt',
    'customer_name',
    'mesa',
    'status',
    'source',
    'total_brl',
    'payment_method',
    'garcom_nome',
    'caixa_turno_id',
    'turno_total_gravado',
    'turno_fechado_em_brt',
    'incluido_em_relatorio_vendas',
    'motivo_classificacao_teste',
  ]

  const lines = [
  `# Relatório de correção E2E — ${store.name} (${slug}) — dia ${ymd} (America/Sao_Paulo)`,
  `# Gerado em: ${formatBrt(new Date().toISOString())}`,
  `# Pedidos de teste (todos os status): ${testRows.length} | Total: R$ ${moneyBrl(testTotalAll)}`,
  `# Pedidos de teste no Relatórios (não cancelados): R$ ${moneyBrl(testTotalReported)} | Faturamento dia real: R$ ${moneyBrl(dayTotal - testTotalReported)} | Faturamento dia bruto (relatório): R$ ${moneyBrl(dayTotal)}`,
  `# Nota: totais gravados no fechamento do turno podem ser R$ 0 mesmo com pedidos vinculados.`,
  header.join(','),
  ...testRows.map((row) => header.map((col) => csvCell(row[col])).join(',')),
  ]

  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')

  console.log(`✅ CSV gerado: ${outPath}`)
  console.log(
    `   ${testRows.length} pedido(s) de teste | relatório: R$ ${moneyBrl(testTotalReported)} | dia bruto: R$ ${moneyBrl(dayTotal)}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
