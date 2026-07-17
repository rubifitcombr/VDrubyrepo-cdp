import { NextRequest, NextResponse } from 'next/server'
import { parseOperationModeInput } from '@/lib/merchant-operation-mode'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { resolveUniqueStoreSlug } from '@/lib/store-slug.server'
import { slugifyStoreSlug } from '@/lib/store-slug'

export const dynamic = 'force-dynamic'

function optionalText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Registo de lojista no servidor (service role):
 * - cria utilizador Auth com email já confirmado (pode entrar de imediato)
 * - espelha em public.usuarios
 * - cria a loja em status pendente
 *
 * Evita falhas do fluxo só no browser (sessão ausente / trigger partido / RLS).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const email = optionalText(body.email)?.toLowerCase() ?? null
  const password = typeof body.password === 'string' ? body.password : ''
  const name = optionalText(body.name)
  const phone = optionalText(body.phone)
  const mode = parseOperationModeInput(body.operation_mode)

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'A senha deve ter pelo menos 6 caracteres.' },
      { status: 400 }
    )
  }
  if (!name) {
    return NextResponse.json({ error: 'Nome da loja é obrigatório.' }, { status: 400 })
  }
  if (!mode) {
    return NextResponse.json(
      {
        error:
          'Modelo de operação é obrigatório. Escolhe delivery, presencial ou hibrido.',
      },
      { status: 400 }
    )
  }

  let svc
  try {
    svc = createServiceRoleClient()
  } catch {
    return NextResponse.json(
      {
        error:
          'Configuração do servidor incompleta (SUPABASE_SERVICE_ROLE_KEY). Contacta o suporte.',
      },
      { status: 503 }
    )
  }

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { store_name: name },
  })

  if (createErr || !created.user?.id) {
    const msg = createErr?.message ?? 'Erro ao criar utilizador.'
    const lower = msg.toLowerCase()
    if (
      lower.includes('already') ||
      lower.includes('registered') ||
      lower.includes('exists') ||
      createErr?.status === 422
    ) {
      return NextResponse.json(
        { error: 'Este email já tem conta. Entra em «Entrar» ou recupera a senha.' },
        { status: 409 }
      )
    }
    if (/database error saving new user/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Erro na base de dados ao criar utilizador. Executa no Supabase a migração 20260717120000_fix_auth_signup_usuarios.sql e tenta de novo.',
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const userId = created.user.id

  let mirrorErr = (
    await svc.from('usuarios').upsert(
      {
        id: userId,
        email: created.user.email ?? email,
        role: 'lojista',
      },
      { onConflict: 'id' }
    )
  ).error

  if (mirrorErr && /role|column|schema cache/i.test(mirrorErr.message)) {
    mirrorErr = (
      await svc.from('usuarios').upsert(
        {
          id: userId,
          email: created.user.email ?? email,
        },
        { onConflict: 'id' }
      )
    ).error
  }

  if (mirrorErr) {
    // Conta Auth já existe — tenta limpar para não deixar órfão sem loja.
    await svc.auth.admin.deleteUser(userId).catch(() => null)
    return NextResponse.json(
      {
        error:
          mirrorErr.message.includes('relation') || /usuarios/i.test(mirrorErr.message)
            ? 'Tabela usuarios em falta ou bloqueada. Executa a migração 20260717120000_fix_auth_signup_usuarios.sql no Supabase.'
            : `Erro ao guardar perfil: ${mirrorErr.message}`,
      },
      { status: 500 }
    )
  }

  const { data: existingStore } = await svc
    .from('stores')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle()

  if (!existingStore?.id) {
    const uniqueSlug = await resolveUniqueStoreSlug(svc, slugifyStoreSlug(name))
    const { error: storeErr } = await svc.from('stores').insert({
      name,
      slug: uniqueSlug,
      owner_id: userId,
      status: 'pendente',
      plano: 'growth',
      operation_mode: mode,
      ...(phone ? { phone } : {}),
    })

    if (storeErr) {
      await svc.auth.admin.deleteUser(userId).catch(() => null)
      await svc.from('usuarios').delete().eq('id', userId).catch(() => null)
      const msg = storeErr.message || 'Erro ao criar loja.'
      const missingCol =
        /operation_mode|column/i.test(msg) && /does not exist|schema cache/i.test(msg)
      return NextResponse.json(
        {
          error: missingCol
            ? 'Coluna operation_mode em falta. Executa scripts/supabase-store-operation-mode.sql no Supabase.'
            : msg,
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ ok: true, userId })
}
