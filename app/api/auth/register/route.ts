import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseOperationModeInput } from '@/lib/merchant-operation-mode'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { createOrRelinkPendingStoreForAuthUser } from '@/lib/admin-create-pending-store.server'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'

export const dynamic = 'force-dynamic'

function optionalText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function isAlreadyRegisteredError(err: { message?: string; status?: number; code?: string } | null) {
  if (!err) return false
  const msg = String(err.message ?? '').toLowerCase()
  const code = String(err.code ?? '').toLowerCase()
  return (
    err.status === 422 ||
    code.includes('already') ||
    code.includes('exists') ||
    msg.includes('already') ||
    msg.includes('registered') ||
    msg.includes('exists') ||
    msg.includes('user already')
  )
}

async function findAuthUserIdByEmail(
  svc: SupabaseClient,
  email: string
): Promise<string | null> {
  const target = email.toLowerCase()

  // Caminho rápido: espelho public.usuarios (quando o trigger correu).
  const { data: mirror } = await svc
    .from('usuarios')
    .select('id')
    .ilike('email', target)
    .limit(1)
    .maybeSingle()
  if (mirror && typeof (mirror as { id?: string }).id === 'string') {
    const id = String((mirror as { id: string }).id)
    const { data } = await svc.auth.admin.getUserById(id)
    if (data?.user?.id) return data.user.id
  }

  for (let page = 1; page <= 200; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const users = data?.users ?? []
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target)
    if (hit?.id) return hit.id
    if (users.length < 200) return null
  }
  return null
}

async function upsertUsuarioMirror(
  svc: SupabaseClient,
  userId: string,
  email: string
): Promise<string | null> {
  let mirrorErr = (
    await svc.from('usuarios').upsert(
      { id: userId, email, role: 'lojista' },
      { onConflict: 'id' }
    )
  ).error

  if (mirrorErr && /role|column|schema cache/i.test(mirrorErr.message)) {
    mirrorErr = (
      await svc.from('usuarios').upsert({ id: userId, email }, { onConflict: 'id' })
    ).error
  }

  return mirrorErr?.message ?? null
}

async function ensureStoreForOwner(
  svc: SupabaseClient,
  userId: string,
  input: {
    name: string
    phone: string | null
    mode: string
  }
): Promise<{ storeId: string | null; error: string | null; created: boolean }> {
  try {
    const { data: userData } = await svc.auth.admin.getUserById(userId)
    const result = await createOrRelinkPendingStoreForAuthUser(svc, {
      userId,
      email: userData?.user?.email ?? null,
      storeName: input.name,
      phone: input.phone,
      operationMode: input.mode,
    })
    return {
      storeId: result.storeId,
      error: null,
      created: result.created || result.relinked,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar loja.'
    const missingCol =
      /operation_mode|column/i.test(msg) && /does not exist|schema cache/i.test(msg)
    return {
      storeId: null,
      created: false,
      error: missingCol
        ? 'Coluna operation_mode em falta na base de dados. Aplica supabase/migrations/20260725190010_configuracoes_schema.sql no Supabase.'
        : msg,
    }
  }
}

/**
 * Registo de lojista no servidor (service role):
 * - cria utilizador Auth com email já confirmado
 * - se o email já existir sem loja (cadastro a meio), completa o perfil/loja
 * - espelha em public.usuarios e cria loja pendente
 */
export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`auth-register:${ip}`, 8, 15 * 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec)

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

  let userId = created?.user?.id ?? null

  if (createErr || !userId) {
    if (isAlreadyRegisteredError(createErr)) {
      const existingId = await findAuthUserIdByEmail(svc, email)
      if (!existingId) {
        return NextResponse.json(
          {
            error:
              'Este email já tem conta. Entra em «Entrar» ou recupera a senha em /login/recuperar.',
          },
          { status: 409 }
        )
      }

      const { data: existingStore } = await svc
        .from('stores')
        .select('id')
        .eq('owner_id', existingId)
        .maybeSingle()

      if (existingStore?.id) {
        return NextResponse.json(
          {
            error:
              'Este email já tem conta. Entra em «Entrar» ou recupera a senha em /login/recuperar.',
          },
          { status: 409 }
        )
      }

      // Conta Auth órfã (sem loja) — completa o cadastro com a senha/dados atuais.
      const { error: updateErr } = await svc.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
        user_metadata: { store_name: name },
      })
      if (updateErr) {
        return NextResponse.json(
          {
            error:
              'Este email já existe, mas não foi possível atualizar a senha. Tenta recuperar a senha em /login/recuperar.',
          },
          { status: 500 }
        )
      }

      userId = existingId
    } else {
      const msg = createErr?.message ?? 'Erro ao criar utilizador.'
      if (/database error saving new user/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              'Erro na base de dados ao criar utilizador. Executa no Supabase a migração 20260717120000_fix_auth_signup_usuarios.sql e tenta de novo.',
          },
          { status: 500 }
        )
      }
      // Nunca devolver inglês cru do GoTrue ao utilizador.
      if (/user already registered/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              'Este email já tem conta. Entra em «Entrar» ou recupera a senha em /login/recuperar.',
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const mirrorMsg = await upsertUsuarioMirror(svc, userId, email)
  if (mirrorMsg) {
    // Só apaga utilizador Auth se foi criado nesta request (não órfão recuperado).
    if (created?.user?.id === userId) {
      await svc.auth.admin.deleteUser(userId).catch(() => null)
    }
    return NextResponse.json(
      {
        error:
          mirrorMsg.includes('relation') || /usuarios/i.test(mirrorMsg)
            ? 'Tabela usuarios em falta ou bloqueada. Executa a migração 20260717120000_fix_auth_signup_usuarios.sql no Supabase.'
            : `Erro ao guardar perfil: ${mirrorMsg}`,
      },
      { status: 500 }
    )
  }

  const storeResult = await ensureStoreForOwner(svc, userId, { name, phone, mode })
  if (storeResult.error) {
    if (created?.user?.id === userId) {
      await svc.auth.admin.deleteUser(userId).catch(() => null)
      try {
        await svc.from('usuarios').delete().eq('id', userId)
      } catch {
        /* ignore cleanup */
      }
    }
    return NextResponse.json({ error: storeResult.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId, storeCreated: storeResult.created })
}
