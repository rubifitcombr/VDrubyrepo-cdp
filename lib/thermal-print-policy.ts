import {
  thermalAutoSourceFromOrderSource,
  type ThermalAutoSource,
} from '@/lib/thermal-print-source'

export type ThermalPrintToggles = {
  print_agent_url?: string | null
  print_printer_ip?: string | null
  print_auto_delivery: boolean
  print_auto_autoatendimento: boolean
  print_auto_pdv: boolean
  print_auto_garcom: boolean
}

export function thermalAgentConfigured(toggles: ThermalPrintToggles): boolean {
  const url = String(toggles.print_agent_url ?? '').trim()
  const ip = String(toggles.print_printer_ip ?? '').trim()
  return Boolean(url && ip && /^https?:\/\//i.test(url))
}

export function thermalToggleForCategory(
  cat: ThermalAutoSource,
  toggles: ThermalPrintToggles
): boolean {
  switch (cat) {
    case 'delivery':
      return toggles.print_auto_delivery
    case 'autoatendimento':
      return toggles.print_auto_autoatendimento
    case 'pdv':
      return toggles.print_auto_pdv
    case 'garcom':
      return toggles.print_auto_garcom
    default:
      return false
  }
}

/** Print Agent com auto-impressão activa para a origem do pedido. */
export function shouldAutoThermalPrintForSource(
  orderSource: string | null | undefined,
  toggles: ThermalPrintToggles
): boolean {
  if (!thermalAgentConfigured(toggles)) return false
  const cat = thermalAutoSourceFromOrderSource(orderSource)
  if (!cat) return false
  return thermalToggleForCategory(cat, toggles)
}

/**
 * Evita cupom duplicado no browser quando o agente térmico já imprime
 * automaticamente para a mesma origem (`print_auto_*`).
 */
export function shouldSkipBrowserAutoPrintOnConfirm(
  printing: ThermalPrintToggles,
  orderSource: string | null | undefined
): boolean {
  return shouldAutoThermalPrintForSource(orderSource, printing)
}
