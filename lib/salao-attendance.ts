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
 * Modo efectivo no painel Garçom.
 * Growth → sempre autoatendimento (sem mapa de garçom no painel).
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

/** Checkout público `?auto=1` só quando a loja está em autoatendimento (Pro) ou Growth. */
export function publicDineInCheckoutAllowed(
  plan: Plan,
  storeRow: Record<string, unknown>
): boolean {
  if (!planAllowsSalonSelfServiceQr(plan)) return false
  if (planAllowsSalonStaffGarcom(plan)) {
    return parseSalaoAttendanceMode(storeRow.salao_attendance_mode) === 'self_service'
  }
  return true
}
