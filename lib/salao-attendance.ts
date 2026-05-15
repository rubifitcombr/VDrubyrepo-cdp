import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import type { Plan } from '@/lib/plan'
import { hasFeature, planTier } from '@/lib/plan'

/** Modo de atendimento no salão (persistido em `stores.salao_attendance_mode`). */
export type SalaoAttendanceMode = 'waiter' | 'self_service'

export function parseSalaoAttendanceMode(raw: unknown): SalaoAttendanceMode {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'self_service' || s === 'autoatendimento') return 'self_service'
  return 'waiter'
}

/** Growth+ : QR único de autoatendimento. */
export function planAllowsSalonSelfServiceQr(plan: Plan): boolean {
  return planTier(plan) >= planTier('GROWTH')
}

/** Pro : garçom no painel + mapa de mesas. */
export function planAllowsSalonStaffGarcom(plan: Plan): boolean {
  return hasFeature(plan, 'waiter')
}

/**
 * Modo efectivo no painel Garçom (quando a rota está disponível no menu).
 * Growth sem mapa staff → autoatendimento no ecrã Garçom.
 * Pro → valor na loja (default `waiter` se coluna ausente).
 */
export function effectiveSalaoAttendanceMode(
  plan: Plan,
  stored: unknown
): SalaoAttendanceMode {
  if (!planAllowsSalonSelfServiceQr(plan)) return 'waiter'
  if (!planAllowsSalonStaffGarcom(plan)) return 'self_service'
  return parseSalaoAttendanceMode(stored)
}

/** Checkout público `?auto=1` / consumo no local: Pro em autoatendimento, ou Growth quando o menu inclui Garçom (presencial/híbrido). */
export function publicDineInCheckoutAllowed(
  plan: Plan,
  storeRow: Record<string, unknown>
): boolean {
  if (!planAllowsSalonSelfServiceQr(plan)) return false
  if (planAllowsSalonStaffGarcom(plan)) {
    return parseSalaoAttendanceMode(storeRow.salao_attendance_mode) === 'self_service'
  }
  const mode = parseOperationModeFromStore(storeRow)
  if (!menuKeysForMerchant(plan, mode).has('garcom')) return false
  return true
}
