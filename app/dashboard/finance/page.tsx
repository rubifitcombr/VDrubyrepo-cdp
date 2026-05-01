import { redirect } from 'next/navigation'

/** Rota legada: indicadores passaram para Relatórios. */
export default function DashboardFinanceRedirect() {
  redirect('/dashboard/reports')
}
