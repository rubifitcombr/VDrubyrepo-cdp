'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { getUser } from '@/services/auth'
import { getStoreByUser } from '@/services/store'
import { uploadProductImage } from '@/lib/storage-upload'
import {
  createMenuProduct,
  getMenuProducts,
  getNextProductSortOrder,
  getProductById,
  updateProduct,
} from '@/services/products'

const STEPS = [
  { id: 0, label: 'Item', desc: 'Informações do produto' },
  { id: 1, label: 'Adicionais', desc: 'Extras opcionais' },
  { id: 2, label: 'Classificações', desc: 'Tipo e restrições' },
  { id: 3, label: 'Disponibilidade', desc: 'Quando aparece no cardápio' },
] as const

const DIETARY = [
  { key: 'vegetariano', label: 'Vegetariano', hint: 'Sem carne.' },
  { key: 'vegano', label: 'Vegano', hint: 'Sem produtos de origem animal.' },
  { key: 'organico', label: 'Orgânico', hint: 'Ingredientes orgânicos.' },
  { key: 'sem_gluten', label: 'Sem glúten', hint: 'Sem trigo, cevada, centeio.' },
  { key: 'sem_acucar', label: 'Sem açúcar', hint: 'Sem açúcares adicionados.' },
  { key: 'zero_lactose', label: 'Zero lactose', hint: 'Sem lactose.' },
] as const

function MenuItemWizardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preCategory = searchParams.get('category')?.trim() || ''
  const editId = searchParams.get('edit')?.trim() || ''

  const [step, setStep] = useState(0)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [editingProductId, setEditingProductId] = useState<string | null>(
    null
  )
  const [existingCategories, setExistingCategories] = useState<string[]>([])

  const [category, setCategory] = useState(preCategory)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [useNewCategory, setUseNewCategory] = useState(!preCategory)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [promotionalPrice, setPromotionalPrice] = useState('')
  const [promotionActive, setPromotionActive] = useState(false)

  const [addonsMode, setAddonsMode] = useState<'none' | 'with'>('none')
  const [addonsNotes, setAddonsNotes] = useState('')
  const [itemKind, setItemKind] = useState<'food' | 'drink'>('food')
  const [dietary, setDietary] = useState<string[]>([])
  const [availability, setAvailability] = useState<
    'always' | 'paused' | 'scheduled'
  >('always')
  const [scheduleNote, setScheduleNote] = useState('')

  const [saving, setSaving] = useState(false)

  const loadStore = useCallback(async () => {
    const user = await getUser()
    if (!user) return
    const store = await getStoreByUser(user.id)
    if (!store || typeof store !== 'object' || !('id' in store)) return
    setStoreId(store.id as string)
    try {
      const rows = await getMenuProducts(store.id as string)
      const cats = new Set<string>()
      for (const r of rows || []) {
        const c = (r as { category?: string | null }).category?.trim()
        if (c) cats.add(c)
      }
      setExistingCategories([...cats].sort((a, b) => a.localeCompare(b, 'pt')))
    } catch (e) {
      console.warn('[menu] categories load:', e)
      setExistingCategories([])
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadStore()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadStore])

  useEffect(() => {
    if (preCategory && !editId) {
      const t = window.setTimeout(() => {
        setCategory(preCategory)
        setUseNewCategory(false)
      }, 0)
      return () => window.clearTimeout(t)
    }
  }, [preCategory, editId])

  useEffect(() => {
    if (!storeId || !editId) {
      if (!editId) {
        const t = window.setTimeout(() => setEditingProductId(null), 0)
        return () => window.clearTimeout(t)
      }
      return
    }
    let cancelled = false
    ;(async () => {
      const { data, error } = await getProductById(editId)
      if (cancelled) return
      if (error || !data || data.store_id !== storeId) {
        alert('Item não encontrado.')
        router.replace('/dashboard/menu')
        return
      }
      const row = data as Record<string, unknown>
      const meta = (row.cardapio_meta as Record<string, unknown>) || {}

      setEditingProductId(editId)
      setName(String(row.name ?? ''))
      setDescription(
        row.description != null ? String(row.description) : ''
      )
      setPrice(
        row.price != null && row.price !== ''
          ? String(row.price).replace('.', ',')
          : ''
      )
      const cat = row.category != null ? String(row.category).trim() : ''
      if (cat) {
        setCategory(cat)
        setUseNewCategory(false)
        setNewCategoryName('')
      } else {
        setUseNewCategory(true)
        setNewCategoryName('')
        setCategory('')
      }
      setImageUrl(row.image_url != null ? String(row.image_url) : '')
      setPromotionActive(!!row.promotion_active)
      setPromotionalPrice(
        row.promotional_price != null && row.promotional_price !== ''
          ? String(row.promotional_price).replace('.', ',')
          : ''
      )

      if (row.active === false) {
        setAvailability('paused')
      } else if (meta.availability === 'scheduled') {
        setAvailability('scheduled')
      } else {
        setAvailability('always')
      }
      if (typeof meta.scheduleNote === 'string') {
        setScheduleNote(meta.scheduleNote)
      } else {
        setScheduleNote('')
      }

      setAddonsMode(meta.addonsMode === 'with' ? 'with' : 'none')
      setAddonsNotes(
        typeof meta.addonsNotes === 'string' ? meta.addonsNotes : ''
      )
      setItemKind(meta.itemKind === 'drink' ? 'drink' : 'food')
      if (Array.isArray(meta.dietary)) {
        setDietary(
          meta.dietary.filter((x): x is string => typeof x === 'string')
        )
      } else {
        setDietary([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storeId, editId, router])

  const resolvedCategory = useMemo(() => {
    if (useNewCategory) return newCategoryName.trim()
    return category.trim()
  }, [useNewCategory, newCategoryName, category])

  function toggleDietary(key: string) {
    setDietary((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function validateStep0() {
    if (!resolvedCategory) {
      alert('Escolhe ou cria uma categoria.')
      return false
    }
    if (!name.trim()) {
      alert('Nome do item é obrigatório.')
      return false
    }
    const parsed = Number(price.replace(',', '.'))
    if (Number.isNaN(parsed) || parsed < 0) {
      alert('Preço inválido.')
      return false
    }
    if (promotionActive) {
      const pp = Number(promotionalPrice.replace(',', '.'))
      if (Number.isNaN(pp) || pp < 0 || pp >= parsed) {
        alert('Preço promocional deve ser válido e menor que o preço normal.')
        return false
      }
    }
    return true
  }

  async function finalize() {
    if (!storeId || !validateStep0()) return
    const parsedPrice = Number(price.replace(',', '.'))
    setSaving(true)

    let finalImageUrl = imageUrl.trim() || null
    if (imageFile) {
      const { publicUrl, error: upErr } = await uploadProductImage(
        storeId,
        imageFile
      )
      if (upErr) {
        setSaving(false)
        alert(
          `${upErr.message}\n\nCria o bucket "product-images" no Supabase (público) e as políticas em scripts/supabase-menu-columns.sql, ou usa só URL.`
        )
        return
      }
      if (publicUrl) finalImageUrl = publicUrl
    }

    const parsedPromo = promotionActive
      ? Number(promotionalPrice.replace(',', '.'))
      : null

    const meta: Record<string, unknown> = {
      addonsMode,
      itemKind,
      dietary,
      availability,
    }
    if (addonsMode === 'with' && addonsNotes.trim()) {
      meta.addonsNotes = addonsNotes.trim()
    }
    if (availability === 'scheduled' && scheduleNote.trim()) {
      meta.scheduleNote = scheduleNote.trim()
    }

    if (editingProductId) {
      const { error } = await updateProduct(editingProductId, {
        name: name.trim(),
        price: parsedPrice,
        description: description.trim() || null,
        active: availability !== 'paused',
        category: resolvedCategory || null,
        image_url: finalImageUrl,
        promotional_price:
          promotionActive && parsedPromo != null && !Number.isNaN(parsedPromo)
            ? parsedPromo
            : null,
        promotion_active: promotionActive,
        cardapio_meta: meta,
      })
      setSaving(false)
      if (error) {
        alert(
          `${error.message}\n\nSe o erro mencionar coluna inexistente, executa o SQL em scripts/supabase-menu-columns.sql no Supabase.`
        )
        return
      }
      router.push('/dashboard/menu')
      return
    }

    const nextSort = await getNextProductSortOrder(
      storeId,
      resolvedCategory || null
    )

    const { error } = await createMenuProduct({
      store_id: storeId,
      name: name.trim(),
      price: parsedPrice,
      description: description.trim() || null,
      active: availability !== 'paused',
      category: resolvedCategory || null,
      image_url: finalImageUrl,
      sort_order: nextSort,
      promotional_price:
        promotionActive && parsedPromo != null && !Number.isNaN(parsedPromo)
          ? parsedPromo
          : null,
      promotion_active: promotionActive,
      cardapio_meta: meta,
    })
    setSaving(false)
    if (error) {
      alert(
        `${error.message}\n\nSe o erro mencionar coluna inexistente, executa o SQL em scripts/supabase-menu-columns.sql no Supabase.`
      )
      return
    }
    router.push('/dashboard/menu')
  }

  function next() {
    if (step === 0 && !validateStep0()) return
    setStep((s) => Math.min(3, s + 1))
  }

  function back() {
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl">
      <nav className="text-xs font-medium text-vyria-navy-muted">
        <Link href="/dashboard" className="hover:text-vyria-navy">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/dashboard/menu" className="hover:text-vyria-navy">
          Gestor de cardápio
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-vyria-navy">
          {editingProductId ? 'Editar item' : 'Novo item'}
        </span>
      </nav>

      <h1 className="font-brand mt-3 text-2xl font-bold text-vyria-navy md:text-3xl">
        Gestor de cardápio
      </h1>
      <p className="text-sm text-vyria-navy-muted">
        {editingProductId
          ? 'Atualiza os dados do item e guarda as alterações.'
          : 'Assistente em passos — igual ao fluxo profissional de gestão de menu'}
      </p>

      <div className="mt-8 grid gap-8 rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-lg shadow-vyria-navy-deep/[0.06] md:grid-cols-[11rem_1fr] md:p-8">
        <nav aria-label="Passos" className="flex flex-row gap-2 md:flex-col md:gap-1">
          {STEPS.map((s, i) => {
            const active = i === step
            const done = i < step
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`rounded-lg px-3 py-2.5 text-left text-sm transition-colors md:border-l-2 ${
                  active
                    ? 'border-vyria-plum bg-vyria-plum/5 font-bold text-vyria-plum md:-ml-px'
                    : done
                      ? 'border-transparent font-medium text-vyria-navy hover:bg-[#f9f9f9] md:border-transparent'
                      : 'cursor-not-allowed border-transparent text-vyria-navy-muted opacity-60'
                }`}
              >
                <span className="block">{s.label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-vyria-navy-muted">
                  {s.desc}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 border-t border-[var(--card-border)] pt-6 md:border-t-0 md:border-l md:pl-8 md:pt-0">
          {step === 0 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-vyria-navy">1. Item</h2>
                <p className="text-sm text-vyria-navy-muted">
                  Define as informações que aparecem no cardápio digital
                </p>
              </div>

              <label className="block text-sm font-medium text-vyria-navy">
                Categoria *
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-sm font-normal">
                    <input
                      type="radio"
                      checked={!useNewCategory}
                      onChange={() => setUseNewCategory(false)}
                    />
                    Existente
                  </label>
                  <select
                    disabled={useNewCategory}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm disabled:opacity-50"
                  >
                    <option value="">Selecionar…</option>
                    {existingCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm font-normal">
                  <input
                    type="radio"
                    checked={useNewCategory}
                    onChange={() => setUseNewCategory(true)}
                  />
                  Nova categoria
                </label>
                {useNewCategory ? (
                  <input
                    className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm"
                    placeholder="Ex.: Pizzas, Bebidas…"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                ) : null}
              </label>

              <label className="block text-sm font-medium text-vyria-navy">
                Nome do item *
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm"
                  maxLength={100}
                  placeholder="Ex.: X-Tudo, Água mineral…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className="mt-1 block text-right text-xs text-vyria-navy-muted">
                  {name.length}/100
                </span>
              </label>

              <label className="block text-sm font-medium text-vyria-navy">
                Descrição
                <textarea
                  className="mt-2 min-h-[100px] w-full resize-y rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm"
                  maxLength={1000}
                  placeholder="Ingredientes, tamanho, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <span className="mt-1 block text-right text-xs text-vyria-navy-muted">
                  {description.length}/1000
                </span>
              </label>

              <label className="block text-sm font-medium text-vyria-navy">
                Preço (R$) *
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>

              <div className="rounded-xl border border-[var(--card-border)] bg-[#f9f9f9] p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-vyria-navy">
                  <input
                    type="checkbox"
                    checked={promotionActive}
                    onChange={(e) => setPromotionActive(e.target.checked)}
                  />
                  Preço promocional
                </label>
                {promotionActive ? (
                  <input
                    className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm"
                    inputMode="decimal"
                    placeholder="Preço em promoção (menor que o normal)"
                    value={promotionalPrice}
                    onChange={(e) => setPromotionalPrice(e.target.value)}
                  />
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-vyria-navy md:col-span-2">
                  URL da imagem (opcional)
                  <input
                    className="mt-2 w-full rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm"
                    placeholder="https://…"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </label>
                <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--card-border)] bg-[#f9f9f9] p-4 text-center text-xs text-vyria-navy-muted md:col-span-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) =>
                      setImageFile(e.target.files?.[0] ?? null)
                    }
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                    Imagem
                  </span>
                  <p className="mt-2 font-medium text-vyria-navy">
                    {imageFile ? imageFile.name : 'Carregar foto'}
                  </p>
                  <p className="mt-1">
                    JPG, PNG, WebP ou GIF. Usa o bucket{' '}
                    <code className="rounded bg-white px-1">product-images</code>{' '}
                    no Supabase, ou cola uma URL.
                  </p>
                </label>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-vyria-navy">2. Adicionais</h2>
                <p className="text-sm text-vyria-navy-muted">
                  Define se o item tem extras (grupos de adicionais virão numa
                  próxima versão)
                </p>
              </div>
              <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-[#f9f9f9] p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="addons"
                    checked={addonsMode === 'none'}
                    onChange={() => setAddonsMode('none')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-semibold text-vyria-navy">
                      Sem adicionais
                    </span>
                    <p className="text-sm text-vyria-navy-muted">
                      Item simples, sem passo extra no pedido.
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="addons"
                    checked={addonsMode === 'with'}
                    onChange={() => setAddonsMode('with')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-semibold text-vyria-navy">
                      Com adicionais
                    </span>
                    <p className="text-sm text-vyria-navy-muted">
                      Descreve os extras (ex.: bacon +R$3, queijo extra…).
                    </p>
                  </div>
                </label>
                {addonsMode === 'with' ? (
                  <label className="mt-3 block text-sm font-medium text-vyria-navy">
                    Texto dos adicionais
                    <textarea
                      className="mt-2 min-h-[88px] w-full resize-y rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm"
                      placeholder="Ex.: Bacon +R$ 4 · Queijo extra +R$ 3 · Molho picante à parte"
                      value={addonsNotes}
                      onChange={(e) => setAddonsNotes(e.target.value)}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-vyria-navy">
                  3. Classificações
                </h2>
                <p className="text-sm text-vyria-navy-muted">
                  Ajuda clientes a filtrar no futuro; informação de responsabilidade do lojista.
                </p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-vyria-navy">
                <strong className="text-vyria-navy">Informação ao cliente</strong>
                : garante que os dados correspondem ao produto real.
              </div>
              <p className="text-sm font-medium text-vyria-navy">
                Qual tipo de item?
              </p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={itemKind === 'food'}
                    onChange={() => setItemKind('food')}
                  />
                  Comida
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={itemKind === 'drink'}
                    onChange={() => setItemKind('drink')}
                  />
                  Bebida
                </label>
              </div>
              <p className="text-sm font-medium text-vyria-navy">
                Restrições / selos (opcional)
              </p>
              <ul className="space-y-2">
                {DIETARY.map((d) => (
                  <li key={d.key}>
                    <label className="flex cursor-pointer gap-3 rounded-lg border border-[var(--card-border)] bg-white p-3 hover:bg-[#f9f9f9]">
                      <input
                        type="checkbox"
                        checked={dietary.includes(d.key)}
                        onChange={() => toggleDietary(d.key)}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-semibold text-vyria-navy">
                          {d.label}
                        </span>
                        <p className="text-xs text-vyria-navy-muted">
                          {d.hint}
                        </p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-vyria-navy">
                  4. Disponibilidade
                </h2>
                <p className="text-sm text-vyria-navy-muted">
                  Controla se o item aparece no cardápio público
                </p>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-2 text-sm text-amber-950">
                Atenção: itens pausados deixam de aparecer no cardápio digital.
              </div>
              <div className="space-y-3">
                <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--card-border)] p-4">
                  <input
                    type="radio"
                    name="avail"
                    checked={availability === 'always'}
                    onChange={() => setAvailability('always')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-semibold text-vyria-navy">
                      Sempre disponível
                    </span>
                    <p className="text-sm text-vyria-navy-muted">
                      Visível enquanto a loja estiver online.
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--card-border)] p-4">
                  <input
                    type="radio"
                    name="avail"
                    checked={availability === 'paused'}
                    onChange={() => setAvailability('paused')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-semibold text-vyria-navy">
                      Pausado
                    </span>
                    <p className="text-sm text-vyria-navy-muted">
                      Não aparece no cardápio (fica inativo).
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--card-border)] p-4">
                  <input
                    type="radio"
                    name="avail"
                    checked={availability === 'scheduled'}
                    onChange={() => setAvailability('scheduled')}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-vyria-navy">
                      Dias e horários específicos
                    </span>
                    <p className="text-sm text-vyria-navy-muted">
                      Nota interna: quando este item costuma estar disponível
                      (aparece no meta do cardápio).
                    </p>
                    {availability === 'scheduled' ? (
                      <textarea
                        className="mt-3 min-h-[72px] w-full resize-y rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
                        placeholder="Ex.: Só ao jantar (sex–sab) · Almoço 11h–15h"
                        value={scheduleNote}
                        onChange={(e) => setScheduleNote(e.target.value)}
                      />
                    ) : null}
                  </div>
                </label>
              </div>
            </div>
          ) : null}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-6">
            <Link
              href="/dashboard/menu"
              className="rounded-xl border border-[var(--card-border)] bg-white px-5 py-2.5 text-sm font-semibold text-vyria-navy hover:bg-[#f9f9f9]"
            >
              Cancelar
            </Link>
            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={back}
                  className="rounded-xl border border-[var(--card-border)] bg-white px-5 py-2.5 text-sm font-semibold text-vyria-navy hover:bg-[#f9f9f9]"
                >
                  Voltar
                </button>
              ) : null}
              {step < 3 ? (
                <button
                  type="button"
                  onClick={next}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700"
                >
                  Avançar
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void finalize()}
                  className="btn-vyria-gradient rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {saving
                    ? 'A guardar…'
                    : editingProductId
                      ? 'Guardar alterações'
                      : 'Finalizar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MenuItemNewPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-5xl p-12 text-center text-sm text-vyria-navy-muted lg:max-w-6xl xl:max-w-7xl">
          A carregar assistente…
        </div>
      }
    >
      <MenuItemWizardContent />
    </Suspense>
  )
}
