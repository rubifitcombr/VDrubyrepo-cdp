export const E2E_STORE_ID = 'e472b84e-32c1-4a9d-87fc-756b874f793a'
export const E2E_STORE_SLUG = 'tudibom'

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
