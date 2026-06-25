import { gerarPromptImagem } from '@/lib/ai-product-image-prompt'
import { optimizeImageBufferForStorage } from '@/lib/image-optimize.server'
import { requireProMarketingAiStore } from '@/lib/ai-plan-guard.server'
import { currentYearMonthUtc } from '@/lib/menu-import-quota'
import { getMarketingAiMonthlyLimit } from '@/lib/marketing-ai-quota'
import { createClient } from '@/lib/supabase/server'
import {
  getMarketingAiCounts,
  incrementMarketingAiUsage,
} from '@/services/marketing-ai-usage.server'
import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

const BUCKET = 'product-images'

export const maxDuration = 120

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
    const description =
      typeof b.description === 'string' ? b.description.trim() : ''
    const category =
      typeof b.category === 'string' ? b.category.trim() : ''

    if (!storeId) {
      return NextResponse.json({ error: 'storeId em falta.' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Nome do produto em falta.' }, { status: 400 })
    }

    const guard = await requireProMarketingAiStore(storeId)
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    const supabase = await createClient()
    const ym = currentYearMonthUtc()
    const imgLimit = getMarketingAiMonthlyLimit(guard.plan, 'image')
    if (imgLimit !== null && imgLimit > 0) {
      const { image: usedImg } = await getMarketingAiCounts(
        supabase,
        storeId,
        ym
      )
      if (usedImg >= imgLimit) {
        return NextResponse.json(
          {
            error: `Limite mensal de imagens com IA atingido (${imgLimit}). O contador renova no início do próximo mês.`,
          },
          { status: 429 }
        )
      }
    }

    const imagePrompt = gerarPromptImagem(name, description, category)

    const image = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
      background: 'auto',
      output_format: 'png',
    })

    const item = image.data?.[0]
    let buffer: Buffer | null = null

    if (item?.b64_json) {
      buffer = Buffer.from(item.b64_json, 'base64')
    } else if (item?.url) {
      const imgRes = await fetch(item.url)
      if (!imgRes.ok) {
        return NextResponse.json(
          { error: 'Não foi possível obter a imagem gerada.' },
          { status: 502 }
        )
      }
      const arr = await imgRes.arrayBuffer()
      buffer = Buffer.from(arr)
    }

    if (!buffer?.length) {
      return NextResponse.json(
        { error: 'Resposta de imagem vazia da IA.' },
        { status: 502 }
      )
    }

    let uploadBody: Buffer = buffer
    let uploadContentType = 'image/png'
    let ext = 'png'
    try {
      const o = await optimizeImageBufferForStorage(buffer)
      uploadBody = o.buffer
      uploadContentType = o.contentType
      ext = 'webp'
    } catch (err) {
      console.warn('[ai/product-image] optimize skipped:', err)
    }

    const path = `${storeId}/${randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, uploadBody, {
        contentType: uploadContentType,
        cacheControl: '3600',
        upsert: false,
      })

    if (upErr) {
      console.error('[ai/product-image] upload', upErr)
      return NextResponse.json(
        {
          error: `${upErr.message} (confirma bucket ${BUCKET} e políticas de Storage).`,
        },
        { status: 500 }
      )
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const imageUrl = pub?.publicUrl
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Não foi possível obter URL pública da imagem.' },
        { status: 500 }
      )
    }

    const inc = await incrementMarketingAiUsage(supabase, storeId, 'image', ym)
    if (!inc.ok) {
      console.error('[ai/product-image] quota:', inc.error)
    }

    return NextResponse.json({ imageUrl })
  } catch (err) {
    console.error('[ai/product-image]', err)

    if (err instanceof OpenAI.APIError) {
      const apiMsg = err.message || ''
      const lower = apiMsg.toLowerCase()
      const status = err.status ?? 502

      if (
        lower.includes('must be verified') ||
        lower.includes('verify organization') ||
        lower.includes('organization must be verified')
      ) {
        return NextResponse.json(
          {
            error:
              'A sua organização na OpenAI precisa ser verificada para usar o gpt-image-1. Acesse platform.openai.com/settings/organization/general e clique em "Verify Organization".',
          },
          { status: 502 }
        )
      }

      if (
        status === 429 ||
        lower.includes('quota') ||
        lower.includes('billing') ||
        lower.includes('insufficient_quota')
      ) {
        return NextResponse.json(
          {
            error:
              'Sem créditos/cota na conta OpenAI (ou limite de requisições atingido). Verifique o billing em platform.openai.com.',
          },
          { status: 502 }
        )
      }

      if (lower.includes('content') && lower.includes('policy')) {
        return NextResponse.json(
          {
            error:
              'O pedido foi recusado pela política de conteúdo da OpenAI. Ajuste o nome/descrição do produto e tente novamente.',
          },
          { status: 422 }
        )
      }

      if (lower.includes('model') || lower.includes('invalid')) {
        return NextResponse.json(
          {
            error:
              'Modelo de imagem indisponível. Verifique se a sua conta OpenAI tem acesso ao gpt-image-1.',
          },
          { status: 502 }
        )
      }

      return NextResponse.json(
        { error: `Falha na OpenAI: ${apiMsg || 'erro desconhecido'}` },
        { status: status >= 400 && status < 600 ? status : 502 }
      )
    }

    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('model') || msg.includes('invalid')) {
      return NextResponse.json(
        {
          error:
            'Modelo de imagem indisponível. Verifique se a sua conta OpenAI tem acesso ao gpt-image-1.',
        },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { error: `Erro ao gerar imagem${msg ? `: ${msg}` : '.'}` },
      { status: 500 }
    )
  }
}
