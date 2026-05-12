import 'server-only'

import { NextResponse } from 'next/server'
import { menuKeysForMerchant } from '@/lib/dashboard-menu'
import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
  type MerchantOperationMode,
} from '@/lib/merchant-operation-mode'
import { hasFeature, type Plan } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'

// Gating alinhado ao menu comercial: `merchant-menu-matrix`, `menuKeysForMerchant`.
export function merchantApiForbidden(hint?: string): NextResponse {
  return NextResponse.json(
    {
      error:
        'Recurso indisponível para o plano ou modelo de operação da loja.' +
        (hint ? ` (${hint})` : ''),
    },
    { status: 403 }
  )
}

export function effectivePlanFromStore(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): Plan {
  return effectiveDashboardPlan(userEmail ?? null, readStorePlano(store))
}

export function operationModeFromStore(
  store: Record<string, unknown>
): MerchantOperationMode | null {
  return parseOperationModeFromStore(store)
}

export function merchantHasMenuKey(
  store: Record<string, unknown>,
  userEmail: string | null | undefined,
  key: DashboardMenuKey
): boolean {
  const plan = effectivePlanFromStore(store, userEmail)
  const mode = operationModeFromStore(store)
  return menuKeysForMerchant(plan, mode).has(key)
}

export function merchantHasDeliveryContext(
  store: Record<string, unknown>
): boolean {
  return isDeliveryPipelineEnabled(parseOperationModeFromStore(store))
}

export function merchantHasInventory(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): boolean {
  const plan = effectivePlanFromStore(store, userEmail)
  return hasFeature(plan, 'inventory')
}

export function gateMerchantMenuKey(
  store: Record<string, unknown>,
  userEmail: string | null | undefined,
  key: DashboardMenuKey
): NextResponse | null {
  if (!merchantHasMenuKey(store, userEmail, key)) {
    return merchantApiForbidden(`menu:${key}`)
  }
  return null
}

export function gateMerchantInventory(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): NextResponse | null {
  if (!merchantHasInventory(store, userEmail)) {
    return merchantApiForbidden('inventory')
  }
  return null
}

/** Rotas de entregadores / entregas / registo de corrida (não aplicável em modo só presencial). */
export function gateMerchantDeliveryPipeline(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): NextResponse | null {
  const denyMenu = gateMerchantMenuKey(store, userEmail, 'pedidos')
  if (denyMenu) return denyMenu
  if (!merchantHasDeliveryContext(store)) {
    return merchantApiForbidden('entregas')
  }
  return null
}
