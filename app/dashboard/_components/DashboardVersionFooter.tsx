'use client'

import { DASHBOARD_CLIENT_VERSION } from '@/lib/dashboard-client-version'

/** Versão activa do cliente — visível para diagnóstico em suporte. */
export function DashboardVersionFooter() {
  return (
    <p
      data-testid="dashboard-client-version-footer"
      className="mt-6 select-all text-center text-[10px] text-[#9ca3af]"
      title="Versão do painel (cliente)"
    >
      Vyria · {DASHBOARD_CLIENT_VERSION}
    </p>
  )
}
