import 'server-only'

import { createClient } from '@/lib/supabase/server'

export async function getStoreByUser(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .single()

  return data
}
