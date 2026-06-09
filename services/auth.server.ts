import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getUser = cache(async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
