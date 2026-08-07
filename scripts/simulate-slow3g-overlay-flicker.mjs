/**
 * Simula overlays com acção em voo + TTL de segurança.
 * Uso:
 *   node --experimental-strip-types scripts/simulate-slow3g-overlay-flicker.mjs
 *   node --experimental-strip-types scripts/simulate-slow3g-overlay-flicker.mjs --safety-ms=30000 --hung
 */
import {
  OPERATIONAL_OVERLAY_SAFETY_MS,
  OPERATIONAL_OVERLAY_CONFIRM_FAIL_MESSAGE,
  reconcileOrdersWithPendingOverlays,
} from '../lib/operational-sync-reconcile.ts'

const API_LATENCY_MS = Number(process.env.SIM_API_LATENCY_MS ?? 12_000)
const SAFETY_MS = Number(
  process.argv.find((a) => a.startsWith('--safety-ms='))?.split('=')[1] ??
    process.env.SIM_SAFETY_MS ??
    OPERATIONAL_OVERLAY_SAFETY_MS
)
const HUNG = process.argv.includes('--hung')

function shouldKeepCashierOverlay(serverRow, overlay) {
  const localPaid = String(overlay.notes ?? '').includes('caixa:pago')
  const serverPaid = String(serverRow.notes ?? '').includes('caixa:pago')
  if (localPaid && !serverPaid) return true
  const rank = (s) =>
    s === 'delivered' || s === 'cancelled' ? 2 : s === 'ready' ? 1 : 0
  return rank(overlay.status) > rank(serverRow.status)
}

function shouldKeepCancelledOverlay(serverRow, overlay) {
  const o = String(overlay.status ?? '').toLowerCase()
  const s = String(serverRow.status ?? '').toLowerCase()
  return o === 'cancelled' && s !== 'cancelled'
}

function isInFlightAt(t, actionKey, apiCompleteMs) {
  if (HUNG) return t < SAFETY_MS
  return t < apiCompleteMs
}

function reconcileAt({
  nowMs,
  startMs,
  serverRow,
  localRow,
  shouldKeep,
  actionKey,
  apiCompleteMs,
  safetyMs,
}) {
  const overlays = new Map()
  overlays.set(localRow.id, {
    expiresAt: startMs + safetyMs,
    snapshot: localRow,
    actionKey,
  })

  const safetyEvents = []
  const realNow = Date.now
  Date.now = () => nowMs
  let merged
  try {
    merged = reconcileOrdersWithPendingOverlays(
      [serverRow],
      overlays,
      shouldKeep,
      {
        isActionInFlight: (key) =>
          key === actionKey && isInFlightAt(nowMs, key, apiCompleteMs),
        onSafetyExpired: (orderId) => {
          safetyEvents.push({
            at: nowMs,
            orderId,
            message: OPERATIONAL_OVERLAY_CONFIRM_FAIL_MESSAGE,
          })
        },
      }
    )
  } finally {
    Date.now = realNow
  }

  return { status: merged[0]?.status ?? 'missing', safetyEvents }
}

function runScenario(label, serverAt, localRow, shouldKeep, actionKey) {
  const ticks = [0, 2000, 4000, 7999, 8000, 8001, 10_000, API_LATENCY_MS, API_LATENCY_MS + 500]
  if (HUNG) ticks.push(SAFETY_MS - 1, SAFETY_MS, SAFETY_MS + 500)

  console.log(`\n=== ${label} ===`)
  console.log(
    `API ${HUNG ? 'pendurada' : `completa em ${API_LATENCY_MS}ms`}, safety TTL ${SAFETY_MS}ms`
  )

  const flicker = []
  const safetyWarnings = []
  let prev = null

  for (const t of ticks) {
    const server =
      HUNG || t < API_LATENCY_MS ? serverAt.before : serverAt.after
    const { status, safetyEvents } = reconcileAt({
      nowMs: t,
      startMs: 0,
      serverRow: server,
      localRow,
      shouldKeep,
      actionKey,
      apiCompleteMs: API_LATENCY_MS,
      safetyMs: SAFETY_MS,
    })
    safetyWarnings.push(...safetyEvents)

    const inFlight = isInFlightAt(t, actionKey, API_LATENCY_MS)
    console.log(
      `t=${String(t).padStart(5)}ms | voo=${inFlight ? 'sim' : 'não '} | servidor=${String(server.status).padEnd(10)} | UI=${status}`
    )
    if (prev !== null && prev !== status) flicker.push({ at: t, from: prev, to: status })
    prev = status
  }

  return { flicker, safetyWarnings }
}

const serverOpen = {
  id: 'o1',
  status: 'ready',
  notes: 'Mesa 5',
  created_at: '2026-01-01T12:00:00Z',
}
const localClosed = {
  ...serverOpen,
  status: 'delivered',
  notes: `${serverOpen.notes}\n[vyria:caixa_pago]`,
}
const localCancelled = { ...serverOpen, status: 'cancelled' }

const cashier = runScenario(
  'Caixa — fechar comanda',
  { before: serverOpen, after: localClosed },
  localClosed,
  shouldKeepCashierOverlay,
  'caixa-close:o1'
)

const cancel = runScenario(
  'Pedidos — cancelar',
  { before: serverOpen, after: localCancelled },
  localCancelled,
  shouldKeepCancelledOverlay,
  'orders-status:o1'
)

console.log('\n=== Garçom — optimistic (acção em voo) ===')
for (const t of [0, 4000, 8001, API_LATENCY_MS, API_LATENCY_MS + 500]) {
  const inFlight = isInFlightAt(t, 'waiter-order:optimistic-1', API_LATENCY_MS)
  const serverHas = !HUNG && t >= API_LATENCY_MS
  const ui = inFlight ? 'pending (optimistic)' : serverHas ? 'pending (server)' : 'ausente'
  console.log(
    `t=${String(t).padStart(5)}ms | voo=${inFlight ? 'sim' : 'não '} | servidor=${serverHas ? 'tem   ' : 'sem   '} | UI=${ui}`
  )
}

const badFlicker = [...cashier.flicker, ...cancel.flicker].filter(
  (e) => !(e.to === 'delivered' || e.to === 'cancelled') || e.from === 'delivered' || e.from === 'cancelled'
)

// Flicker regressivo involuntário (TTL curto) — não inclui expiração intencional do safety TTL
const regressions = [...cashier.flicker, ...cancel.flicker].filter(
  (e) =>
    ((e.from === 'delivered' && e.to === 'ready') ||
      (e.from === 'cancelled' && e.to === 'ready')) &&
    !(HUNG && e.at >= SAFETY_MS)
)

console.log('\n--- Resultado ---')
if (regressions.length === 0) {
  console.log('OK: sem flicker regressivo (UI não volta ao estado antigo do servidor).')
} else {
  console.log('FALHA: flicker regressivo detectado:')
  for (const e of regressions) console.log(`  @${e.at}ms: ${e.from} → ${e.to}`)
  process.exitCode = 1
}

const allSafety = [...cashier.safetyWarnings, ...cancel.safetyWarnings]
if (HUNG) {
  if (allSafety.length > 0) {
    console.log(`OK: TTL de segurança disparou (${allSafety.length}x) — "${OPERATIONAL_OVERLAY_CONFIRM_FAIL_MESSAGE}"`)
    console.log(`OK: após ${SAFETY_MS}ms a UI reverte ao servidor com aviso (comportamento esperado).`)
  } else {
    console.log('FALHA: request pendurado mas TTL de segurança não disparou.')
    process.exitCode = 1
  }
} else if (allSafety.length > 0) {
  console.log('AVISO: safety disparou sem request pendurado (inesperado neste cenário).')
}

if (!HUNG && badFlicker.length > 0 && regressions.length === 0) {
  console.log('Transições finais (esperadas após API):', badFlicker.map((e) => `${e.from}→${e.to}@${e.at}ms`).join(', '))
}
