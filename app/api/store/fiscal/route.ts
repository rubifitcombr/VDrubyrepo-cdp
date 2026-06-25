import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getStoreFiscalConfig } from '@/services/fiscal.server'
import { parseFiscalAmbiente, parseFiscalStatus } from '@/lib/fiscal'

async function requireOwnedStore(storeId: string) {
  const user = await getUser()
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 }),
    }
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return { ok: false as const, response: gate.response }
  if (storeId !== gate.ctx.storeId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Acesso negado à loja.' }, { status: 403 }),
    }
  }
  return { ok: true as const, storeId: gate.ctx.storeId }
}

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')?.trim() || ''
  if (!storeId) {
    return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
  }
  const owned = await requireOwnedStore(storeId)
  if (!owned.ok) return owned.response

  const svc = createServiceRoleClient()
  const cfg = await getStoreFiscalConfig(svc, storeId)

  const { data: raw } = await svc
    .from('store_fiscal_config')
    .select(
      'inscricao_estadual, nome_fantasia, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_municipio_ibge, endereco_uf, endereco_cep, csc_id'
    )
    .eq('store_id', storeId)
    .maybeSingle()
  const extra = (raw ?? {}) as Record<string, unknown>

  return NextResponse.json({
    ok: true,
    fiscal: {
      status: cfg?.status ?? 'nao_configurado',
      ambiente: cfg?.ambiente ?? 'homologacao',
      regimeTributario: cfg?.regimeTributario ?? 'simples_nacional',
      cnpj: cfg?.cnpj ?? '',
      razaoSocial: cfg?.razaoSocial ?? '',
      inscricaoEstadual: (extra.inscricao_estadual as string | null) ?? '',
      nomeFantasia: (extra.nome_fantasia as string | null) ?? '',
      enderecoLogradouro: (extra.endereco_logradouro as string | null) ?? '',
      enderecoNumero: (extra.endereco_numero as string | null) ?? '',
      enderecoBairro: (extra.endereco_bairro as string | null) ?? '',
      enderecoMunicipio: (extra.endereco_municipio as string | null) ?? '',
      enderecoMunicipioIbge: (extra.endereco_municipio_ibge as string | null) ?? '',
      enderecoUf: (extra.endereco_uf as string | null) ?? '',
      enderecoCep: (extra.endereco_cep as string | null) ?? '',
      // Segredos: só indicamos se estão preenchidos.
      hasToken: Boolean(cfg?.brasilnfeToken),
      hasCsc: Boolean((extra.csc_id as string | null) || cfg?.cscToken),
    },
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
  if (!storeId) {
    return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
  }
  const owned = await requireOwnedStore(storeId)
  if (!owned.ok) return owned.response

  const svc = createServiceRoleClient()
  const current = await getStoreFiscalConfig(svc, storeId)

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const patch: Record<string, unknown> = {
    store_id: storeId,
    ambiente: parseFiscalAmbiente(body.ambiente),
    regime_tributario: str(body.regimeTributario) || 'simples_nacional',
    cnpj: str(body.cnpj),
    inscricao_estadual: str(body.inscricaoEstadual),
    razao_social: str(body.razaoSocial),
    nome_fantasia: str(body.nomeFantasia),
    endereco_logradouro: str(body.enderecoLogradouro),
    endereco_numero: str(body.enderecoNumero),
    endereco_bairro: str(body.enderecoBairro),
    endereco_municipio: str(body.enderecoMunicipio),
    endereco_municipio_ibge: str(body.enderecoMunicipioIbge),
    endereco_uf: str(body.enderecoUf).toUpperCase().slice(0, 2),
    endereco_cep: str(body.enderecoCep),
    updated_at: new Date().toISOString(),
  }

  // Segredos só são sobrescritos quando reenviados (não apaga ao re-salvar).
  if (str(body.brasilnfeToken)) patch.brasilnfe_token = str(body.brasilnfeToken)
  if (str(body.cscId)) patch.csc_id = str(body.cscId)
  if (str(body.cscToken)) patch.csc_token = str(body.cscToken)

  // O lojista nunca se auto-ativa: só admin coloca 'ativo'. Mantém estado se já
  // ativo/bloqueado; caso contrário marca para revisão.
  const curStatus = parseFiscalStatus(current?.status)
  patch.status =
    curStatus === 'ativo' || curStatus === 'bloqueado' ? curStatus : 'pending_review'

  const { error } = await svc
    .from('store_fiscal_config')
    .upsert(patch, { onConflict: 'store_id' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: patch.status })
}
