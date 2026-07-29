/** Tipos partilhados da integração de balança (Pro, presencial). */

export type ScaleConnectionType = 'web_serial' | 'agent' | 'barcode_only'

export type ScaleBrand = 'toledo' | 'filizola' | 'urano' | 'generic'

export type ScaleProtocol = 'toledo_p03'

export type OrderItemUnitType = 'unit' | 'weight'

export type ScaleReading = {
  weightKg: number
  stable: boolean
  tareKg: number
  raw?: string
}

export type ParsedWeighableBarcode = {
  plu: string
  weightKg: number
  barcode: string
}
