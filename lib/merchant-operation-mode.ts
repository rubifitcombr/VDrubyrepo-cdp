/**
 * Modelo comercial de operação da loja (canal / segmento).
 * `null` = não definido: o painel mantém o comportamento legado baseado **apenas no plano**.
 */
export type MerchantOperationMode = 'delivery' | 'presencial' | 'hibrido'

const MODES = new Set<MerchantOperationMode>([
  'delivery',
  'presencial',
  'hibrido',
])

export function parseOperationModeFromStore(
  row: Record<string, unknown> | null | undefined
): MerchantOperationMode | null {
  if (!row) return null
  const v = row.operation_mode
  if (v == null || v === '') return null
  const s = String(v).trim().toLowerCase()
  if (s === 'híbrido') return 'hibrido'
  if (MODES.has(s as MerchantOperationMode)) return s as MerchantOperationMode
  return null
}

export function parseOperationModeInput(
  raw: unknown
): MerchantOperationMode | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' && raw.trim() === '') return null
  return parseOperationModeFromStore({ operation_mode: raw })
}

/**
 * Canal online (slug, entregas, taxa, «a caminho»): delivery e híbrido.
 * Em **presencial** (`null` no modo = legado inclui tudo) só falso quando `presencial` explícito.
 */
export function isDeliveryPipelineEnabled(
  mode: MerchantOperationMode | null
): boolean {
  if (mode === null) return true
  return mode === 'delivery' || mode === 'hibrido'
}

/** Pedidos — card/filtro Delivery visível em delivery e híbrido (legado `null` = ambos). */
export function ordersDeliveryChannelVisible(
  mode: MerchantOperationMode | null
): boolean {
  if (mode === null) return true
  return mode === 'delivery' || mode === 'hibrido'
}

/** Pedidos — card/filtro Presencial visível em presencial e híbrido (legado `null` = ambos). */
export function ordersPresencialChannelVisible(
  mode: MerchantOperationMode | null
): boolean {
  if (mode === null) return true
  return mode === 'presencial' || mode === 'hibrido'
}

export function resolveOrdersChannelFilter(
  mode: MerchantOperationMode | null,
  prefer: 'delivery' | 'presencial' = 'delivery'
): 'delivery' | 'presencial' {
  const delivery = ordersDeliveryChannelVisible(mode)
  const presencial = ordersPresencialChannelVisible(mode)
  if (!delivery) return 'presencial'
  if (!presencial) return 'delivery'
  return prefer
}

export function operationModeLabel(mode: MerchantOperationMode): string {
  switch (mode) {
    case 'delivery':
      return 'Delivery'
    case 'presencial':
      return 'Presencial'
    case 'hibrido':
      return 'Híbrido'
    default:
      return mode
  }
}
