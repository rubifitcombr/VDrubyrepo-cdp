export type AdminAuthUserDTO = {
  id: string
  email: string | null
  created_at: string | null
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  banned: boolean
  /** Nome pretendido no registo (user_metadata.store_name), se existir. */
  intended_store_name: string | null
  store_id: string | null
  store_name: string | null
  store_slug: string | null
  store_status: string | null
}

/** Linha especial no painel de lojistas (órfão Auth ou loja sem dono). */
export type LojistaRowKind = 'store' | 'orphan_auth' | 'ghost_store'
