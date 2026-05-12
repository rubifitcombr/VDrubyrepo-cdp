import { createClient } from '@/lib/supabase/server'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { readStorePlano } from '@/lib/store-columns'
import { currentYearMonthUtc, getMenuImportMonthlyLimit } from '@/lib/menu-import-quota'
import { hasAiMenuPhotoImport } from '@/lib/plan'
import {
  getMenuImportCountForMonth,
  incrementMenuImportUsage,
} from '@/services/menu-import-usage.server'
import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

const MAX_BYTES = 12 * 1024 * 1024

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    }

    const gate = await requireLojistaAtivoApi(user.id)
    if (!gate.ok) return gate.response

    const menuDeny = gateMerchantMenuKey(gate.ctx.store, user.email, 'produtos')
    if (menuDeny) return menuDeny

    const plan = effectiveDashboardPlan(
      user.email,
      readStorePlano(gate.ctx.store)
    )
    if (!hasAiMenuPhotoImport(plan)) {
      return NextResponse.json(
        {
          error:
            'Importação por foto disponível a partir do plano Growth. Faz upgrade para continuar.',
        },
        { status: 403 }
      )
    }

    const storeId = gate.ctx.storeId

    const ym = currentYearMonthUtc()
    const limit = getMenuImportMonthlyLimit(plan)
    const used = await getMenuImportCountForMonth(supabase, storeId, ym)
    if (limit !== null && used >= limit) {
      return NextResponse.json(
        {
          error: `Limite mensal de importações por foto atingido (${used}/${limit}). Faz upgrade para Pro para mais análises.`,
          quota: { used, limit, yearMonth: ym },
        },
        { status: 429 }
      )
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY não configurada no servidor.' },
        { status: 503 }
      )
    }
    const openai = new OpenAI({ apiKey })

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'O ficheiro tem de ser uma imagem.' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Imagem demasiado grande (máx. 12 MB).' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analisa esta imagem de um cardápio (restaurante, padaria, delivery, etc.) e extrai os produtos com preço quando visível.

Responde APENAS com um objeto JSON válido (sem markdown), neste formato exato:
{"items":[{"name":"string","price":number|null,"category":"string","description":"string"}]}

Regras:
- "name": nome do prato/produto.
- "price": número decimal (ex.: 28.9 para R$ 28,90). null se não houver preço legível.
- "category": secção do menu se existir (ex.: "Hambúrgueres"); senão "".
- "description": ingredientes ou texto curto se visível; senão "".
- Se não identificares itens, devolve {"items":[]}.`,
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' },
            },
          ],
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (content == null || content.trim() === '') {
      return NextResponse.json(
        { error: 'A IA não devolveu texto.' },
        { status: 502 }
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return NextResponse.json(
        { error: 'Erro ao interpretar IA' },
        { status: 502 }
      )
    }

    const inc = await incrementMenuImportUsage(supabase, storeId, ym)
    if (!inc.ok) {
      console.error('[menu/import] increment quota:', inc.error)
    }

    return NextResponse.json({
      data: parsed,
      quota: {
        usedThisMonth: inc.ok ? inc.count : used,
        limit,
        yearMonth: ym,
        usageWarning: inc.ok ? undefined : inc.error,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro'
    console.error('[menu/import]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
