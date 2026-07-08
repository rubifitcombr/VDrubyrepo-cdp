import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import type { StoreGarcomDTO } from '@/lib/garcons-types'
import { listGarconsForStore } from '@/services/store-garcons.server'

export type GarconsPageInitialData = {
  garcons: StoreGarcomDTO[]
  missingTable: boolean
}

export async function loadGarconsPageData(
  storeId: string
): Promise<GarconsPageInitialData> {
  const db = tryCreateServiceRoleClient() ?? (await createClient())
  try {
    const garcons = await listGarconsForStore(db, storeId)
    return { garcons, missingTable: false }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/relation|does not exist|42P01/i.test(msg)) {
      return { garcons: [], missingTable: true }
    }
    return { garcons: [], missingTable: false }
  }
}
