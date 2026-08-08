import { getE2eStoreConfig } from './store-config'

const { storeId, slug } = getE2eStoreConfig()

/** Loja dedicada de teste — nunca cliente real (ver e2e/README.md). */
export const E2E_STORE_ID = storeId
export const E2E_STORE_SLUG = slug

export type E2eGarcomPin = {
  id: string
  nome: string
  pin: string
}

export type E2eTestData = {
  storeId: string
  slug: string
  ownerEmail: string
  sampleOrderId: string | null
  garcoms: E2eGarcomPin[]
  plano: string
  operationMode: string
  salaoAttendanceMode: string
  publicDineInAllowed: boolean
  hubPinBalcaoEnabled: boolean
  hubPinBalcao: string | null
}
