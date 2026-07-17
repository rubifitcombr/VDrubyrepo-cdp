export type AdminAuthUserDTO = {
  id: string
  email: string | null
  created_at: string | null
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  banned: boolean
  store_id: string | null
  store_name: string | null
  store_slug: string | null
  store_status: string | null
}
