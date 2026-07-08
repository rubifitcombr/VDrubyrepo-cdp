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
import { buildSupabasePublicStorageUrl, MENU_IMAGE_BUCKET } from '@/lib/menu-image-url'
import { randomUUID } from 'crypto'

const BUCKET = MENU_IMAGE_BUCKET

const GENERIC_ERROR = 'Tokens esgotados, fale com suporte.'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      console.error('[ai/product-image] OPENAI_API_KEY não configurada')
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 })
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
        console.error('[ai/product-image] download falhou:', imgRes.status)
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 })
      }
      const arr = await imgRes.arrayBuffer()
      buffer = Buffer.from(arr)
    }

    if (!buffer?.length) {
      console.error('[ai/product-image] resposta de imagem vazia da IA')
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 })
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
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const imageUrl =
      buildSupabasePublicStorageUrl(path) ?? pub?.publicUrl ?? null
    if (!imageUrl) {
      console.error('[ai/product-image] sem URL pública')
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
    }

    const inc = await incrementMarketingAiUsage(supabase, storeId, 'image', ym)
    if (!inc.ok) {
      console.error('[ai/product-image] quota:', inc.error)
    }

    return NextResponse.json({ imageUrl })
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error('[ai/product-image] OpenAI', err.status, err.message)
    } else {
      console.error('[ai/product-image]', err)
    }
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
