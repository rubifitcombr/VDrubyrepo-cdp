import { createClient } from '@/lib/supabase/client'

export async function getStoreByUser(userId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .single()

  return data
}

export async function createStore(userId: string, name: string) {
  const slug = name.toLowerCase().replace(/\s+/g, '-')

  const supabase = createClient()
  const { data, error } = await supabase
    .from('stores')
    .insert({
      name,
      slug,
      owner_id: userId,
    })
    .select()
    .single()

  return { data, error }
}

export async function updateStore(
  storeId: string,
  patch: Record<string, unknown>
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stores')
    .update(patch)
    .eq('id', storeId)
    .select('id')
    .maybeSingle()

  if (error) return { error }
  if (!data?.id) {
    return {
      error: {
        message:
          'Nenhuma configuração foi atualizada. Verifica políticas RLS da tabela stores e se a loja pertence ao utilizador autenticado (owner_id).',
        code: 'NO_ROWS_UPDATED',
      },
    }
  }
  return { error: null }
}
