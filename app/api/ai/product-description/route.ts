import { requireMarketingAiDescriptionStore } from '@/lib/ai-plan-guard.server'
import { currentYearMonthUtc } from '@/lib/menu-import-quota'
import {
  getMarketingAiMonthlyLimit,
} from '@/lib/marketing-ai-quota'
import { createClient } from '@/lib/supabase/server'
import {
  getMarketingAiCounts,
  incrementMarketingAiUsage,
} from '@/services/marketing-ai-usage.server'
import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 45

function buildPrompt(input: {
  name: string
  category: string
  price: string
  existingDescription?: string
}): string {
  const base = `Você é um especialista em marketing gastronômico.

Com base no produto abaixo, crie uma descrição curta, atrativa e "saborosa", que aumente a chance de compra.

Produto:
Nome: ${input.name}
Categoria: ${input.category}
Preço: ${input.price}

Regras:
- Máximo 2 frases
- Linguagem simples e apetitiva
- Destaque sabor, textura e experiência
- Evite exageros irreais
- Não use emojis

Retorne apenas a descrição.`

  const existing = input.existingDescription?.trim()
  if (existing) {
    return `${base}

Descrição atual (melhore, mantendo as regras acima):
${existing}

Retorne apenas a nova descrição.`
  }

  return base
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY não configurada.' },
        { status: 503 }
      )
    }
    const openai = new OpenAI({ apiKey })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const storeId = typeof b.storeId === 'string' ? b.storeId.trim() : ''
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    const category =
      typeof b.category === 'string' && b.category.trim()
        ? b.category.trim()
        : '—'
    const priceRaw = b.price
    const price =
      typeof priceRaw === 'number' && !Number.isNaN(priceRaw)
        ? String(priceRaw)
        : typeof priceRaw === 'string'
          ? priceRaw.trim() || '—'
          : '—'
    const existingDescription =
      typeof b.existingDescription === 'string' ? b.existingDescription : ''

    if (!storeId) {
      return NextResponse.json({ error: 'storeId em falta.' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Nome do produto em falta.' }, { status: 400 })
    }

    const guard = await requireMarketingAiDescriptionStore(storeId)
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    const supabase = await createClient()
    const ym = currentYearMonthUtc()
    const descLimit = getMarketingAiMonthlyLimit(guard.plan, 'description')
    if (descLimit !== null && descLimit > 0) {
      const { description: usedDesc } = await getMarketingAiCounts(
        supabase,
        storeId,
        ym
      )
      if (usedDesc >= descLimit) {
        return NextResponse.json(
          {
            error: `Limite mensal de descrições com IA atingido (${descLimit}). No plano Master o limite é ilimitado.`,
          },
          { status: 429 }
        )
      }
    }

    const prompt = buildPrompt({
      name,
      category,
      price,
      existingDescription: existingDescription.trim() || undefined,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) {
      return NextResponse.json(
        { error: 'A IA não devolveu texto.' },
        { status: 502 }
      )
    }

    const inc = await incrementMarketingAiUsage(
      supabase,
      storeId,
      'description',
      ym
    )
    if (!inc.ok) {
      console.error('[ai/product-description] quota:', inc.error)
    }

    return NextResponse.json({ description: text })
  } catch (err) {
    console.error('[ai/product-description]', err)
    return NextResponse.json({ error: 'Erro ao gerar descrição.' }, { status: 500 })
  }
}
