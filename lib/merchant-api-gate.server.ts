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
import { hasFeature, merchantEntregadoresEnabled, type Plan } from '@/lib/plan'
import { hasScaleIntegration } from '@/lib/scale/gate'
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

/** Gestão de garçons (CRUD/PIN/relatório) — exclusivo do plano Pro (presencial/híbrido). */
export function gateMerchantGarconsManagement(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): NextResponse | null {
  const plan = effectivePlanFromStore(store, userEmail)
  if (!hasFeature(plan, 'waiter')) {
    return NextResponse.json(
      {
        error:
          'A gestão de garçons (cadastro, PIN e relatório) está disponível a partir do plano Pro.',
      },
      { status: 403 }
    )
  }
  if (operationModeFromStore(store) === 'delivery') {
    return merchantApiForbidden('garcons:delivery')
  }
  return gateMerchantMenuKey(store, userEmail, 'garcons')
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
  const plan = effectivePlanFromStore(store, userEmail)
  if (!merchantEntregadoresEnabled(plan)) {
    return merchantApiForbidden('entregadores')
  }
  if (!merchantHasDeliveryContext(store)) {
    return merchantApiForbidden('entregas')
  }
  return gateMerchantMenuKey(store, userEmail, 'entregadores')
}

/** Balança / produtos pesáveis — exclusivo Pro em presencial ou híbrido. */
export function merchantHasScaleIntegration(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): boolean {
  const plan = effectivePlanFromStore(store, userEmail)
  const mode = operationModeFromStore(store)
  return hasScaleIntegration(plan, mode)
}

export function gateMerchantScaleIntegration(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): NextResponse | null {
  if (!merchantHasScaleIntegration(store, userEmail)) {
    return NextResponse.json(
      {
        error:
          'A integração de balança está disponível no plano Pro (operação presencial ou híbrida).',
      },
      { status: 403 }
    )
  }
  return null
}

/** Módulos exclusivos do plano Master (WhatsApp / fidelidade / recuperador). */
export function gateMerchantMasterFeature(
  store: Record<string, unknown>,
  userEmail: string | null | undefined,
  feature: 'whatsapp_ai' | 'loyalty' | 'recovery'
): NextResponse | null {
  const plan = effectivePlanFromStore(store, userEmail)
  if (!hasFeature(plan, feature)) {
    const labels: Record<typeof feature, string> = {
      whatsapp_ai: 'WhatsApp oficial e robô de IA',
      loyalty: 'Programa de fidelidade',
      recovery: 'Recuperador de clientes',
    }
    return NextResponse.json(
      {
        error: `${labels[feature]} está disponível no plano Master.`,
      },
      { status: 403 }
    )
  }
  return null
}
