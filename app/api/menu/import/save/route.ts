import { createClient } from '@/lib/supabase/server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { NextRequest, NextResponse } from 'next/server'

type IncomingProduct = {
  name: string
  description?: string | null
  price: number
}

type IncomingCategory = {
  name: string
  products: IncomingProduct[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

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

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    }

    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
    }

    const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
    const categoriesRaw = body.categories

    if (!storeId) {
      return NextResponse.json({ error: 'storeId em falta.' }, { status: 400 })
    }

    if (storeId !== gate.ctx.storeId) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 403 })
    }

    if (!Array.isArray(categoriesRaw) || categoriesRaw.length === 0) {
      return NextResponse.json({ error: 'categories em falta.' }, { status: 400 })
    }

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 403 })
    }

    const categories: IncomingCategory[] = []
    for (const c of categoriesRaw) {
      if (!isRecord(c)) continue
      const name =
        typeof c.name === 'string' && c.name.trim()
          ? c.name.trim()
          : 'Sem categoria'
      const prodsRaw = c.products
      const products: IncomingProduct[] = []
      if (Array.isArray(prodsRaw)) {
        for (const p of prodsRaw) {
          if (!isRecord(p)) continue
          const pname = typeof p.name === 'string' ? p.name.trim() : ''
          if (!pname) continue
          const priceNum =
            typeof p.price === 'number' && !Number.isNaN(p.price)
              ? p.price
              : Number(String(p.price ?? '').replace(',', '.'))
          if (Number.isNaN(priceNum) || priceNum < 0) continue
          const desc =
            typeof p.description === 'string' ? p.description.trim() : ''
          products.push({
            name: pname,
            description: desc || null,
            price: priceNum,
          })
        }
      }
      if (products.length > 0) {
        categories.push({ name, products })
      }
    }

    if (categories.length === 0) {
      return NextResponse.json({ error: 'Nenhum produto válido.' }, { status: 400 })
    }

    const { data: maxCatRow } = await supabase
      .from('categories')
      .select('sort_order')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    let nextCategorySort = 1
    if (
      maxCatRow &&
      typeof maxCatRow.sort_order === 'number' &&
      !Number.isNaN(maxCatRow.sort_order)
    ) {
      nextCategorySort = maxCatRow.sort_order + 1
    }

    let createdCategories = 0
    let createdProducts = 0

    for (const category of categories) {
      const { data: cat, error: catErr } = await supabase
        .from('categories')
        .insert({
          name: category.name,
          store_id: storeId,
          sort_order: nextCategorySort++,
        })
        .select('id')
        .single()

      if (catErr || !cat?.id) {
        console.error('[menu/import/save] category', catErr)
        return NextResponse.json(
          {
            error:
              catErr?.message?.includes('categories') ||
              catErr?.message?.includes('category_id')
                ? 'Executa scripts/supabase-categories.sql no Supabase (tabela categories).'
                : catErr?.message || 'Erro ao criar categoria.',
          },
          { status: 500 }
        )
      }

      const categoryId = cat.id as string
      createdCategories++

      const { data: maxProdRow } = await supabase
        .from('products')
        .select('sort_order')
        .eq('store_id', storeId)
        .eq('category', category.name)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      let productSort = 1
      if (
        maxProdRow &&
        typeof maxProdRow.sort_order === 'number' &&
        !Number.isNaN(maxProdRow.sort_order)
      ) {
        productSort = maxProdRow.sort_order + 1
      }

      for (const product of category.products) {
        const row: Record<string, unknown> = {
          store_id: storeId,
          name: product.name,
          description: product.description,
          price: product.price,
          category_id: categoryId,
          category: category.name,
          active: true,
          sort_order: productSort++,
          promotion_active: false,
        }

        const { error: insErr } = await supabase.from('products').insert(row)

        if (insErr) {
          console.error('[menu/import/save] product', insErr)
          return NextResponse.json(
            {
              error:
                insErr.message?.includes('category_id')
                  ? 'Coluna category_id em falta — executa scripts/supabase-categories.sql.'
                  : insErr.message,
            },
            { status: 500 }
          )
        }
        createdProducts++
      }
    }

    return NextResponse.json({
      success: true,
      createdCategories,
      createdProducts,
    })
  } catch (err) {
    console.error('[menu/import/save]', err)
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }
}
