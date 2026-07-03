import 'server-only'

import { NextResponse } from 'next/server'
import { effectivePlanFromStore } from '@/lib/merchant-api-gate.server'
import { hasFeature, type Plan } from '@/lib/plan'

/**
 * Escrita de pedidos pelo fluxo «garçom no painel» (Pro).
 * Growth usa só o QR público para criar/alterar pedidos; configuração de mesas (`PUT /api/waiter/tables`)
 * fica disponível com acesso a Garçom (ex.: Growth + QR salão).
 */
export function denyStaffWaiterPanelWrites(
  store: Record<string, unknown>,
  userEmail: string | null | undefined
): NextResponse | null {
  const plan: Plan = effectivePlanFromStore(store, userEmail)
  if (!hasFeature(plan, 'waiter')) {
    return NextResponse.json(
      {
        error:
          'Pedidos pelo mapa de garçom são exclusivos do plano Pro. No Growth os pedidos no salão chegam pelo QR de autoatendimento.',
      },
      { status: 403 }
    )
  }
  return null
}
