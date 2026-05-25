'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconCube,
  IconPencil,
  IconSearch,
  IconTrash,
} from '@/app/dashboard/_components/NavIcons'
import type { MenuProductRow } from '@/lib/menu-product'
import { effectiveProductPrice } from '@/lib/product-pricing'
import type { Plan } from '@/lib/plan'
import {
  hasAiMenuPhotoImport,
  hasFeature,
  hasMarketingAiDescription,
  hasProMarketingAi,
} from '@/lib/plan'
import { uploadProductImage } from '@/lib/storage-upload'
import {
  fetchProductAddonTree,
  replaceProductAddons,
  type AddonGroupSaved,
} from '@/services/product-addons'
import {
  createMenuProduct,
  deleteProduct,
  getMenuProducts,
  getNextProductSortOrder,
  updateProduct,
} from '@/services/products'
import { MenuImportReviewModal } from './MenuImportReviewModal'

type Product = MenuProductRow
type StockInfo = {
  quantity: number
  lowStockAlert: number | null
}

type AddonItemDraft = { key: string; name: string; price: string }
type AddonGroupDraft = {
  key: string
  name: string
  required: boolean
  items: AddonItemDraft[]
}

function newItemDraft(): AddonItemDraft {
  return { key: crypto.randomUUID(), name: '', price: '' }
}

function newGroupDraft(): AddonGroupDraft {
  return { key: crypto.randomUUID(), name: '', required: false, items: [] }
}

function treeToDrafts(tree: AddonGroupSaved[]): AddonGroupDraft[] {
  return tree.map((g) => ({
    key: crypto.randomUUID(),
    name: g.name,
    required: g.required,
    items: g.items.map((it) => ({
      key: crypto.randomUUID(),
      name: it.name,
      price:
        it.price != null && !Number.isNaN(Number(it.price))
          ? String(it.price).replace('.', ',')
          : '0',
    })),
  }))
}

function draftsToSaved(groups: AddonGroupDraft[]): AddonGroupSaved[] {
  return groups
    .map((g) => ({
      name: g.name.trim(),
      required: g.required,
      items: g.items
        .map((it) => {
          const p = Number(it.price.replace(',', '.'))
          return { name: it.name.trim(), price: p }
        })
        .filter((it) => it.name.length > 0 && !Number.isNaN(it.price) && it.price >= 0),
    }))
    .filter((g) => g.name.length > 0)
}

function AddonsEditor({
  groups,
  onChange,
}: {
  groups: AddonGroupDraft[]
  onChange: (next: AddonGroupDraft[]) => void
}) {
  function patchGroup(key: string, patch: Partial<AddonGroupDraft>) {
    onChange(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)))
  }
  function removeGroup(key: string) {
    onChange(groups.filter((g) => g.key !== key))
  }
  function addGroup() {
    onChange([...groups, newGroupDraft()])
  }
  function patchItem(gkey: string, ikey: string, patch: Partial<AddonItemDraft>) {
    onChange(
      groups.map((g) =>
        g.key !== gkey
          ? g
          : {
              ...g,
              items: g.items.map((it) =>
                it.key === ikey ? { ...it, ...patch } : it
              ),
            }
      )
    )
  }
  function addItem(gkey: string) {
    onChange(
      groups.map((g) =>
        g.key === gkey ? { ...g, items: [...g.items, newItemDraft()] } : g
      )
    )
  }
  function removeItem(gkey: string, ikey: string) {
    onChange(
      groups.map((g) =>
        g.key === gkey
          ? { ...g, items: g.items.filter((it) => it.key !== ikey) }
          : g
      )
    )
  }

  return (
    <div className="space-y-3 border-t border-[var(--card-border)] pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-vyria-navy">Adicionais</h3>
        <button
          type="button"
          onClick={addGroup}
          className="text-xs font-medium text-vyria-plum hover:underline"
        >
          + Novo grupo
        </button>
      </div>
      <p className="text-xs text-vyria-navy-muted">
        Grupos opcionais (ex.: Extras). Marca &quot;Obrigatório&quot; se o cliente
        tiver de escolher algo nesse grupo.
      </p>
      {groups.length === 0 ? (
        <p className="text-xs text-vyria-navy-muted">Nenhum grupo ainda.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li
              key={g.key}
              className="rounded-lg border border-[var(--card-border)] bg-[#fafafa] p-3"
            >
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-medium text-vyria-navy">
                  Nome do grupo
                  <input
                    value={g.name}
                    onChange={(e) => patchGroup(g.key, { name: e.target.value })}
                    className="mt-1 w-full rounded border border-[var(--card-border)] bg-white px-2 py-1.5 text-sm"
                    placeholder="Ex.: Extras"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-vyria-navy">
                  <input
                    type="checkbox"
                    checked={g.required}
                    onChange={(e) =>
                      patchGroup(g.key, { required: e.target.checked })
                    }
                    className="rounded border-vyria-navy/30"
                  />
                  Obrigatório
                </label>
                <button
                  type="button"
                  onClick={() => removeGroup(g.key)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remover grupo
                </button>
              </div>
              <ul className="mt-2 space-y-2 pl-1">
                {g.items.map((it) => (
                  <li
                    key={it.key}
                    className="flex flex-wrap items-end gap-2 border-l-2 border-vyria-navy/15 pl-2"
                  >
                    <label className="min-w-0 flex-1 text-xs font-medium text-vyria-navy">
                      Item
                      <input
                        value={it.name}
                        onChange={(e) =>
                          patchItem(g.key, it.key, { name: e.target.value })
                        }
                        className="mt-1 w-full rounded border border-[var(--card-border)] bg-white px-2 py-1.5 text-sm"
                        placeholder="Ex.: Bacon"
                      />
                    </label>
                    <label className="w-24 text-xs font-medium text-vyria-navy">
                      R$
                      <input
                        value={it.price}
                        onChange={(e) =>
                          patchItem(g.key, it.key, { price: e.target.value })
                        }
                        inputMode="decimal"
                        className="mt-1 w-full rounded border border-[var(--card-border)] bg-white px-2 py-1.5 text-sm"
                        placeholder="0"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(g.key, it.key)}
                      className="pb-1 text-xs font-medium text-vyria-navy-muted hover:text-red-600"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => addItem(g.key)}
                className="mt-2 text-xs font-medium text-vyria-plum hover:underline"
              >
                + Item
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function priceToInput(v: number | string | null | undefined): string {
  if (v == null || v === '') return ''
  return String(v).replace('.', ',')
}

function parsePriceInput(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  if (Number.isNaN(n) || n < 0) return null
  return n
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function isProductActive(p: Product) {
  return p.active !== false
}

function ProductActiveSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={active ? 'Produto ativo' : 'Produto inativo'}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]/35 disabled:opacity-50 ${
        active ? 'bg-[var(--dash-primary)]' : 'bg-[#d1d5db]'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1 left-1 block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
          active ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-4 sm:pb-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-modal-title"
        className="max-h-[min(92dvh,52rem)] w-full max-w-[calc(100vw-0px)] overflow-y-auto rounded-t-2xl border border-[var(--card-border)] border-b-0 bg-white shadow-xl sm:max-h-[min(92vh,52rem)] sm:max-w-xl sm:rounded-xl sm:border-b lg:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
          <h2 id="menu-modal-title" className="text-base font-semibold text-vyria-navy">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-vyria-navy-muted hover:bg-[#f5f5f5] hover:text-vyria-navy"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:pb-6">{children}</div>
      </div>
    </div>
  )
}

export function MenuManagerClient({
  initialProducts,
  stockByProduct,
  storeId,
  storeSlug,
  plan,
  showPublicStorefrontLink = true,
}: {
  initialProducts: Product[]
  stockByProduct: Record<string, StockInfo>
  storeId: string
  storeSlug: string | null
  plan: Plan
  showPublicStorefrontLink?: boolean
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [extraCategories, setExtraCategories] = useState<string[]>([])
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDeliveryPrice, setFormDeliveryPrice] = useState('')
  const [formDineInPrice, setFormDineInPrice] = useState('')
  const [formDeliveryPromoActive, setFormDeliveryPromoActive] = useState(false)
  const [formDeliveryPromoPrice, setFormDeliveryPromoPrice] = useState('')
  const [formDineInPromoActive, setFormDineInPromoActive] = useState(false)
  const [formDineInPromoPrice, setFormDineInPromoPrice] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formFile, setFormFile] = useState<File | null>(null)
  const [formAiImageUrl, setFormAiImageUrl] = useState<string | null>(null)
  const [aiDescBusy, setAiDescBusy] = useState(false)
  const [aiImgBusy, setAiImgBusy] = useState(false)
  const [addonGroups, setAddonGroups] = useState<AddonGroupDraft[]>([])
  const [formSaving, setFormSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [selectedCategory, setSelectedCategory] = useState('Todos')

  useEffect(() => {
    setProducts(initialProducts)
  }, [initialProducts])

  const refresh = useCallback(async () => {
    try {
      const data = await getMenuProducts(storeId)
      setProducts(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar lista.'
      console.error('[menu] refresh:', e)
      alert(
        `${msg}\n\nA lista não foi atualizada. Verifica a ligação ou as permissões do Supabase.`
      )
    }
  }, [storeId])

  async function runAiDescription(withExisting: boolean) {
    const name = formName.trim()
    const price = formDeliveryPrice.trim() || formDineInPrice.trim()
    if (!name) {
      alert('Preenche o nome do produto primeiro.')
      return
    }
    const parsedPrice = parsePriceInput(price)
    if (parsedPrice == null) {
      alert('Preenche um preço delivery ou presencial válido.')
      return
    }
    setAiDescBusy(true)
    try {
      const res = await dashboardFetch('/api/ai/product-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name,
          category: formCategory.trim() || '—',
          price: parsedPrice,
          ...(withExisting && formDescription.trim()
            ? { existingDescription: formDescription.trim() }
            : {}),
        }),
      })
      const data = (await res.json()) as { description?: string; error?: string }
      if (!res.ok) {
        alert(data.error || 'Não foi possível gerar a descrição.')
        return
      }
      if (typeof data.description === 'string' && data.description.trim()) {
        setFormDescription(data.description.trim())
      }
    } finally {
      setAiDescBusy(false)
    }
  }

  async function runAiImage() {
    const name = formName.trim()
    if (!name) return
    setAiImgBusy(true)
    try {
      const res = await dashboardFetch('/api/ai/product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name,
          description: formDescription.trim(),
          category: formCategory.trim(),
        }),
      })
      const data = (await res.json()) as { imageUrl?: string; error?: string }
      if (!res.ok) {
        alert(data.error || 'Erro ao gerar imagem.')
        return
      }
      if (data.imageUrl) {
        setFormFile(null)
        setFormAiImageUrl(data.imageUrl)
      }
    } finally {
      setAiImgBusy(false)
    }
  }

  const categoryOptions = useMemo(() => {
    const s = new Set<string>()
    for (const p of products) {
      const c = p.category?.trim()
      if (c) s.add(c)
    }
    for (const c of extraCategories) s.add(c)
    return [...s].sort((a, b) => a.localeCompare(b, 'pt'))
  }, [products, extraCategories])

  const filterCategories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) {
      set.add(p.category?.trim() || 'Sem categoria')
    }
    for (const c of extraCategories) {
      if (c.trim()) set.add(c.trim())
    }
    return [...set].sort((a, b) => {
      if (a === 'Sem categoria') return 1
      if (b === 'Sem categoria') return -1
      return a.localeCompare(b, 'pt')
    })
  }, [products, extraCategories])

  const filteredProducts = useMemo(() => {
    let list = products.slice()
    if (selectedCategory !== 'Todos') {
      list = list.filter(
        (p) => (p.category?.trim() || 'Sem categoria') === selectedCategory
      )
    }
    const q = deferredSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => {
        const name = p.name.toLowerCase()
        const desc = (p.description || '').toLowerCase()
        return name.includes(q) || desc.includes(q)
      })
    }
    list.sort((a, b) => {
      const so = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
      if (so !== 0) return so
      return a.name.localeCompare(b.name, 'pt')
    })
    return list
  }, [products, selectedCategory, deferredSearch])

  function openCreateModal(prefillCategory?: string) {
    setEditingId(null)
    setFormName('')
    setFormDeliveryPrice('')
    setFormDineInPrice('')
    setFormDeliveryPromoActive(false)
    setFormDeliveryPromoPrice('')
    setFormDineInPromoActive(false)
    setFormDineInPromoPrice('')
    setFormDescription('')
    setFormCategory(
      prefillCategory && prefillCategory !== 'Sem categoria'
        ? prefillCategory
        : ''
    )
    setFormFile(null)
    setFormAiImageUrl(null)
    setAddonGroups([])
    setProductModalOpen(true)
  }

  async function openEditModal(p: Product) {
    setEditingId(p.id)
    setFormName(p.name)
    setFormDeliveryPrice(priceToInput(p.delivery_price ?? p.price))
    setFormDineInPrice(priceToInput(p.dine_in_price ?? p.price))
    setFormDeliveryPromoActive(p.delivery_promotion_active === true)
    setFormDeliveryPromoPrice(priceToInput(p.delivery_promotional_price))
    setFormDineInPromoActive(p.dine_in_promotion_active === true)
    setFormDineInPromoPrice(priceToInput(p.dine_in_promotional_price))
    setFormCategory(p.category?.trim() ?? '')
    setFormDescription(p.description?.trim() ?? '')
    setFormFile(null)
    setFormAiImageUrl(null)
    let addons: AddonGroupDraft[] = []
    try {
      const tree = await fetchProductAddonTree(p.id)
      addons = treeToDrafts(tree)
    } catch {
      addons = []
    }
    setAddonGroups(addons)
    setProductModalOpen(true)
  }

  function openCreateWithContext() {
    if (selectedCategory === 'Todos') {
      openCreateModal()
      return
    }
    if (selectedCategory === 'Sem categoria') {
      openCreateModal(undefined)
      return
    }
    openCreateModal(selectedCategory)
  }

  function closeProductModal() {
    setProductModalOpen(false)
    setEditingId(null)
    setFormSaving(false)
    setAddonGroups([])
    setFormAiImageUrl(null)
  }

  async function submitProductForm() {
    const name = formName.trim()
    const delivery = parsePriceInput(formDeliveryPrice)
    const dineIn = parsePriceInput(formDineInPrice)
    if (!name) {
      alert('Indica o nome do item.')
      return
    }
    if (delivery == null && dineIn == null) {
      alert('Indica ao menos o preço delivery ou presencial.')
      return
    }
    const legacyPrice = delivery ?? dineIn ?? 0
    const deliveryPromo = parsePriceInput(formDeliveryPromoPrice)
    const dineInPromo = parsePriceInput(formDineInPromoPrice)
    if (formDeliveryPromoActive && deliveryPromo == null) {
      alert('Preço promocional delivery inválido.')
      return
    }
    if (formDineInPromoActive && dineInPromo == null) {
      alert('Preço promocional presencial inválido.')
      return
    }

    const channelPatch = {
      price: legacyPrice,
      delivery_price: delivery,
      dine_in_price: dineIn,
      delivery_promotional_price: formDeliveryPromoActive ? deliveryPromo : null,
      delivery_promotion_active: formDeliveryPromoActive,
      dine_in_promotional_price: formDineInPromoActive ? dineInPromo : null,
      dine_in_promotion_active: formDineInPromoActive,
    }

    let uploadedUrl: string | null = null
    if (formFile) {
      const { publicUrl, error: upErr } = await uploadProductImage(
        storeId,
        formFile
      )
      if (upErr) {
        alert(upErr.message)
        return
      }
      uploadedUrl = publicUrl
      if (!uploadedUrl) {
        alert('Não foi possível obter o URL da imagem após o upload.')
        return
      }
    }

    const aiUrl = formAiImageUrl?.trim() || null
    const imageUrl = uploadedUrl ?? aiUrl

    const catRaw = formCategory.trim()
    const category = catRaw || null

    setFormSaving(true)

    const desc = formDescription.trim() || null
    const addonPayload = draftsToSaved(addonGroups)

    if (editingId) {
      const { error } = await updateProduct(editingId, {
        name,
        category,
        description: desc,
        ...channelPatch,
        ...(imageUrl != null ? { image_url: imageUrl } : {}),
      })
      if (error) {
        setFormSaving(false)
        alert(error.message)
        return
      }
      const { error: addonErr } = await replaceProductAddons(
        editingId,
        addonPayload
      )
      setFormSaving(false)
      if (addonErr) {
        alert(
          `${addonErr.message}\n\nProduto atualizado; adicionais não foram gravados. Executa scripts/supabase-product-addons.sql no Supabase.`
        )
        void refresh()
        return
      }
      closeProductModal()
      void refresh()
      return
    }

    const sort = await getNextProductSortOrder(storeId, category)
    const { data: created, error } = await createMenuProduct({
      store_id: storeId,
      name,
      category,
      image_url: imageUrl,
      description: desc,
      active: true,
      sort_order: sort,
      promotion_active: false,
      promotional_price: null,
      ...channelPatch,
    })
    if (error) {
      setFormSaving(false)
      alert(error.message)
      return
    }
    const newId = (created as { id: string } | null)?.id
    if (!newId) {
      setFormSaving(false)
      alert('Produto criado mas sem id — não foi possível guardar adicionais.')
      closeProductModal()
      void refresh()
      return
    }
    const { error: addonErr } = await replaceProductAddons(newId, addonPayload)
    setFormSaving(false)
    if (addonErr) {
      alert(
        `${addonErr.message}\n\nProduto criado; executa scripts/supabase-product-addons.sql para gravar adicionais.`
      )
    }
    closeProductModal()
    void refresh()
  }

  async function handleToggleActive(p: Product) {
    const next = !isProductActive(p)
    setBusyIds((prev) => new Set(prev).add(p.id))
    const { error } = await updateProduct(p.id, { active: next })
    setBusyIds((prev) => {
      const n = new Set(prev)
      n.delete(p.id)
      return n
    })
    if (error) {
      alert(error.message)
      return
    }
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, active: next } : x))
    )
  }

  async function handleDeleteProductFromList(p: Product) {
    if (!confirm(`Remover "${p.name}" do cardápio?`)) return
    setBusyIds((prev) => new Set(prev).add(p.id))
    await deleteProduct(p.id)
    setBusyIds((prev) => {
      const n = new Set(prev)
      n.delete(p.id)
      return n
    })
    void refresh()
  }

  function confirmAddCategory() {
    const n = newCatName.trim()
    if (!n) return
    if (n === 'Sem categoria') {
      alert('Usa outro nome para a categoria.')
      return
    }
    setExtraCategories((prev) => (prev.includes(n) ? prev : [...prev, n]))
    setNewCatName('')
    setCatModalOpen(false)
  }

  async function handleDeleteProduct() {
    if (!editingId) return
    if (!confirm('Remover este item do cardápio?')) return
    setFormSaving(true)
    await deleteProduct(editingId)
    setFormSaving(false)
    closeProductModal()
    void refresh()
  }

  const productCount = products.length
  const productCountLabel =
    productCount === 1
      ? '1 produto cadastrado'
      : `${productCount} produtos cadastrados`
  const stockSummary = useMemo(() => {
    let withoutControl = 0
    let outOfStock = 0
    let lowStock = 0
    if (!hasFeature(plan, 'inventory')) {
      return { withoutControl: 0, outOfStock: 0, lowStock: 0 }
    }
    for (const p of products) {
      const stock = stockByProduct[p.id]
      if (!stock) {
        withoutControl += 1
        continue
      }
      const qty = Math.max(0, Math.floor(Number(stock.quantity) || 0))
      const low =
        stock.lowStockAlert == null
          ? null
          : Math.max(0, Math.floor(Number(stock.lowStockAlert) || 0))
      if (qty <= 0) {
        outOfStock += 1
      } else if (low != null && low > 0 && qty <= low) {
        lowStock += 1
      }
    }
    return { withoutControl, outOfStock, lowStock }
  }, [products, stockByProduct, plan])

  const importPhotoInputRef = useRef<HTMLInputElement>(null)
  const [importPhotoBusy, setImportPhotoBusy] = useState(false)
  const [importReviewOpen, setImportReviewOpen] = useState(false)
  const [importReviewParsed, setImportReviewParsed] = useState<unknown | null>(
    null
  )
  const [importQuotaHint, setImportQuotaHint] = useState<string | null>(null)

  function closeImportReview() {
    setImportReviewOpen(false)
    setImportReviewParsed(null)
  }

  async function handleImportPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportPhotoBusy(true)
    setImportQuotaHint(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await dashboardFetch('/api/menu/import', {
        method: 'POST',
        body: fd,
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        data?: { items?: unknown[] }
        quota?: {
          usedThisMonth?: number
          limit?: number | null
          yearMonth?: string
          usageWarning?: string
        }
      }
      if (!res.ok) {
        alert(
          typeof data.error === 'string'
            ? data.error
            : 'Não foi possível enviar a imagem.'
        )
        return
      }
      if (data.quota) {
        const u = data.quota.usedThisMonth
        const lim = data.quota.limit
        if (lim != null && typeof u === 'number') {
          setImportQuotaHint(`Importações neste mês: ${u} / ${lim}`)
        } else if (lim == null && typeof u === 'number') {
          setImportQuotaHint(`Importações neste mês: ${u}`)
        }
        if (data.quota.usageWarning) {
          console.warn(data.quota.usageWarning)
        }
      }
      const items = data.data?.items
      const n = Array.isArray(items) ? items.length : 0
      if (n === 0) {
        alert(
          'A IA não encontrou itens nesta imagem. Tenta outra foto ou verifica a legibilidade.'
        )
        return
      }
      setImportReviewParsed(data.data ?? null)
      setImportReviewOpen(true)
    } catch {
      alert('Erro de rede ao enviar a imagem.')
    } finally {
      setImportPhotoBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Produtos</span>
      </nav>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
            Produtos
          </h1>
          <p className="mt-1 text-sm text-[#6b7280]">{productCountLabel}</p>
          {hasFeature(plan, 'inventory') ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-[var(--card-border)] bg-white px-3 py-1 text-xs font-semibold text-[#374151]">
                Sem controle: {stockSummary.withoutControl}
              </span>
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Baixo: {stockSummary.lowStock}
              </span>
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
                Zerado: {stockSummary.outOfStock}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {hasFeature(plan, 'inventory') ? (
            <Link
              href="/dashboard/inventory"
              className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:bg-[#f9fafb]"
            >
              Gerenciar estoque
            </Link>
          ) : null}
          {hasAiMenuPhotoImport(plan) ? (
            <>
              <input
                ref={importPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={handleImportPhotoChange}
              />
              <button
                type="button"
                disabled={importPhotoBusy}
                onClick={() => importPhotoInputRef.current?.click()}
                className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:bg-[#f9fafb] disabled:opacity-60"
              >
                {importPhotoBusy ? 'A enviar…' : 'Importar cardápio por foto'}
              </button>
              {importQuotaHint ? (
                <span className="text-xs text-[#6b7280]">{importQuotaHint}</span>
              ) : null}
            </>
          ) : null}
          {showPublicStorefrontLink && storeSlug ? (
            <a
              href={`/${storeSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:bg-[#f9fafb]"
            >
              Ver loja pública
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setNewCatName('')
              setCatModalOpen(true)
            }}
            className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:bg-[#f9fafb]"
          >
            + Categoria
          </button>
          <button
            type="button"
            onClick={openCreateWithContext}
            className="rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
          >
            + Novo produto
          </button>
        </div>
      </header>

      <div className="mt-8 space-y-4">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9ca3af]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar produtos..."
            className="w-full rounded-xl border border-[var(--card-border)] bg-white py-3 pl-11 pr-4 text-sm text-[#1a1614] shadow-sm outline-none ring-[var(--dash-primary)]/0 transition-[box-shadow,border-color] placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)]/35 focus:ring-2 focus:ring-[var(--dash-primary)]/12"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('Todos')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              selectedCategory === 'Todos'
                ? 'bg-[var(--dash-primary)] text-white shadow-sm shadow-[var(--dash-primary)]/20'
                : 'border border-[var(--card-border)] bg-white text-[#374151] shadow-sm hover:bg-[#f9fafb]'
            }`}
          >
            Todos
          </button>
          {filterCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                selectedCategory === cat
                  ? 'bg-[var(--dash-primary)] text-white shadow-sm shadow-[var(--dash-primary)]/20'
                  : 'border border-[var(--card-border)] bg-white text-[#374151] shadow-sm hover:bg-[#f9fafb]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <Modal
        open={catModalOpen}
        title="Nova categoria"
        onClose={() => setCatModalOpen(false)}
      >
        <p className="text-sm text-vyria-navy-muted">
          A categoria aparece na lista quando adicionares um item nela.
        </p>
        <label className="mt-3 block text-sm font-medium text-vyria-navy">
          Nome
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
            placeholder="Ex.: Bebidas"
            onKeyDown={(e) => e.key === 'Enter' && confirmAddCategory()}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setCatModalOpen(false)}
            className="rounded-lg px-3 py-2 text-sm text-vyria-navy-muted hover:bg-[#f5f5f5]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmAddCategory}
            className="rounded-lg bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Adicionar
          </button>
        </div>
      </Modal>

      <Modal
        open={productModalOpen}
        title={editingId ? 'Editar item' : 'Novo item'}
        onClose={() => !formSaving && closeProductModal()}
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-vyria-navy">
            Nome
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
            />
          </label>
          <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa]/60 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
              Preços por canal
            </p>
            <label className="block text-sm font-medium text-vyria-navy">
              Preço Delivery / link público (R$)
              <input
                value={formDeliveryPrice}
                onChange={(e) => setFormDeliveryPrice(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
                placeholder="0,00"
              />
            </label>
            <label className="block text-sm font-medium text-vyria-navy">
              Preço Presencial / QR, garçom e PDV (R$)
              <input
                value={formDineInPrice}
                onChange={(e) => setFormDineInPrice(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
                placeholder="0,00"
              />
            </label>
            <p className="text-xs text-vyria-navy-muted">
              O preço base da loja usa o valor delivery quando definido; produtos
              antigos sem canal usam o preço único como fallback.
            </p>
          </div>
          <div className="rounded-xl border border-vyria-plum/15 bg-vyria-plum/[0.04] p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-vyria-plum">
              Promoção Delivery
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-vyria-navy">
              <input
                type="checkbox"
                checked={formDeliveryPromoActive}
                onChange={(e) => setFormDeliveryPromoActive(e.target.checked)}
                className="rounded border-[var(--card-border)]"
              />
              Promoção ativa no delivery
            </label>
            {formDeliveryPromoActive ? (
              <label className="block text-sm font-medium text-vyria-navy">
                Valor promocional delivery (R$)
                <input
                  value={formDeliveryPromoPrice}
                  onChange={(e) => setFormDeliveryPromoPrice(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
                  placeholder="0,00"
                />
              </label>
            ) : null}
          </div>
          <div className="rounded-xl border border-emerald-600/15 bg-emerald-50/40 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Promoção Presencial
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-vyria-navy">
              <input
                type="checkbox"
                checked={formDineInPromoActive}
                onChange={(e) => setFormDineInPromoActive(e.target.checked)}
                className="rounded border-[var(--card-border)]"
              />
              Promoção ativa no presencial
            </label>
            {formDineInPromoActive ? (
              <label className="block text-sm font-medium text-vyria-navy">
                Valor promocional presencial (R$)
                <input
                  value={formDineInPromoPrice}
                  onChange={(e) => setFormDineInPromoPrice(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
                  placeholder="0,00"
                />
              </label>
            ) : null}
          </div>
          <label className="block text-sm font-medium text-vyria-navy">
            Categoria
            <input
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              list="menu-category-suggestions"
              className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
              placeholder="Escolhe ou escreve uma nova"
            />
            <datalist id="menu-category-suggestions">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm font-medium text-vyria-navy">
            Descrição
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm"
              placeholder="Opcional — ingredientes, tamanho…"
            />
          </label>
          {hasMarketingAiDescription(plan) ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={aiDescBusy || formSaving}
                onClick={() =>
                  void runAiDescription(!!formDescription.trim())
                }
                className="rounded-lg border border-vyria-plum/25 bg-vyria-plum/[0.06] px-3 py-2 text-xs font-semibold text-vyria-plum hover:bg-vyria-plum/10 disabled:opacity-50"
              >
                {aiDescBusy
                  ? 'A gerar…'
                  : formDescription.trim()
                    ? 'Melhorar descrição'
                    : 'Gerar descrição com IA'}
              </button>
              {aiDescBusy ? (
                <span className="text-xs text-vyria-navy-muted">
                  IA a trabalhar…
                </span>
              ) : null}
            </div>
          ) : null}
          <AddonsEditor groups={addonGroups} onChange={setAddonGroups} />
          <label className="block text-sm font-medium text-vyria-navy">
            Imagem (opcional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                setFormFile(e.target.files?.[0] ?? null)
                setFormAiImageUrl(null)
              }}
              className="mt-1 block w-full text-sm text-vyria-navy-muted file:mr-3 file:rounded file:border-0 file:bg-[#f0f0f0] file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </label>
          {hasProMarketingAi(plan) ? (
            <div className="space-y-2 rounded-xl border border-[var(--card-border)] bg-[#fafafa]/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-vyria-navy-muted">
                Imagem com IA
              </p>
              {!formName.trim() ? (
                <p className="text-xs text-vyria-navy-muted">
                  Preencha o nome do produto primeiro para gerar imagem com IA.
                </p>
              ) : null}
              <button
                type="button"
                title={
                  !formName.trim()
                    ? 'Preencha o nome do produto primeiro'
                    : 'Gera uma imagem com base no nome, descrição e categoria'
                }
                disabled={!formName.trim() || aiImgBusy || formSaving}
                onClick={() => void runAiImage()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {aiImgBusy ? (
                  <>
                    <span
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--dash-primary)] border-t-transparent"
                      aria-hidden
                    />
                    <span>Gerando imagem…</span>
                  </>
                ) : (
                  'Gerar imagem com IA'
                )}
              </button>
              {aiImgBusy ? (
                <p className="text-xs text-vyria-navy-muted">
                  Isso pode levar alguns segundos
                </p>
              ) : null}
              {formAiImageUrl ? (
                <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-white p-3">
                  <p className="text-sm font-semibold text-vyria-navy">
                    Pré-visualização
                  </p>
                  <p className="mt-0.5 text-xs text-vyria-navy-muted">
                    Revê o resultado. A foto só fica associada ao produto no
                    cardápio depois de clicares em Salvar.
                  </p>
                  <div className="relative mx-auto mt-3 h-52 w-full max-w-sm">
                    <Image
                      src={formAiImageUrl}
                      alt="Pré-visualização da imagem gerada"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormAiImageUrl(null)}
                    className="mt-3 text-xs font-medium text-vyria-navy-muted hover:text-red-600"
                  >
                    Descartar imagem gerada
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-vyria-navy-muted">
            {editingId
              ? 'Só envia um ficheiro se quiseres substituir a imagem atual.'
              : 'Envia um ficheiro para mostrar foto no cardápio.'}
            {hasProMarketingAi(plan)
              ? ' Imagem por IA só quando pedires — custo controlado.'
              : hasMarketingAiDescription(plan)
                ? ' Geração de descrição por IA disponível no seu plano.'
              : ''}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)] pt-4">
          {editingId ? (
            <button
              type="button"
              disabled={formSaving}
              onClick={() => void handleDeleteProduct()}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              Excluir item
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={formSaving}
              onClick={closeProductModal}
              className="rounded-lg px-3 py-2 text-sm text-vyria-navy-muted hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={formSaving}
              onClick={() => void submitProductForm()}
              className="rounded-lg bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {formSaving ? 'A guardar…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      <div className="mt-8">
        {productCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--card-border)] bg-white py-16 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f3f4f6] text-[#9ca3af]">
              <IconCube className="h-8 w-8" />
            </div>
            <p className="mt-4 text-sm font-medium text-[#1a1614]">
              Nenhum produto cadastrado
            </p>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="mt-4 text-sm font-semibold text-[var(--dash-primary)] hover:underline"
            >
              Criar primeiro produto
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-white py-14 text-center text-sm text-[#6b7280] shadow-sm">
            Nenhum produto corresponde à pesquisa ou ao filtro.
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('Todos')
              }}
              className="mt-3 block w-full text-center text-sm font-semibold text-[var(--dash-primary)] hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((p) => {
              const catLabel = p.category?.trim() || 'Sem categoria'
              const imgUrl = p.image_url?.trim()
              const desc = p.description?.trim()
              const stock = stockByProduct[p.id]
              const stockBadge = hasFeature(plan, 'inventory')
                ? !stock
                  ? { label: 'Sem controle', className: 'bg-zinc-100 text-zinc-700' }
                  : (() => {
                      const stockQty = Math.max(0, Math.floor(Number(stock.quantity) || 0))
                      const stockLow =
                        stock.lowStockAlert == null
                          ? null
                          : Math.max(0, Math.floor(Number(stock.lowStockAlert) || 0))
                      if (stockQty <= 0) {
                        return { label: 'Sem estoque', className: 'bg-red-100 text-red-800' }
                      }
                      if (stockLow != null && stockLow > 0 && stockQty <= stockLow) {
                        return {
                          label: `Baixo (${stockQty})`,
                          className: 'bg-amber-100 text-amber-900',
                        }
                      }
                      return {
                        label: `Estoque ${stockQty}`,
                        className: 'bg-emerald-100 text-emerald-800',
                      }
                    })()
                : null
              return (
                <li
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm shadow-black/[0.04] transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] w-full bg-[#f3f4f6]">
                    {imgUrl ? (
                      <Image
                        src={imgUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#c4c4c4]">
                        <IconCube className="h-14 w-14 opacity-80" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 flex-1 font-bold leading-snug text-[#1a1614]">
                        {p.name}
                      </h2>
                      <span className="shrink-0 max-w-[42%] truncate text-right text-xs font-medium text-[#9ca3af]">
                        {catLabel}
                      </span>
                    </div>
                    {stockBadge ? (
                      <div className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${stockBadge.className}`}
                        >
                          {stockBadge.label}
                        </span>
                      </div>
                    ) : null}
                    {desc ? (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#6b7280]">
                        {desc}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm italic text-[#d1d5db]">
                        Sem descrição
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-4">
                      <div className="min-w-0 text-sm font-semibold tabular-nums text-[var(--dash-primary)]">
                        <p>
                          Delivery{' '}
                          {money.format(effectiveProductPrice(p, 'delivery'))}
                        </p>
                        <p className="text-[#6b7280]">
                          Presencial{' '}
                          {money.format(effectiveProductPrice(p, 'dine_in'))}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ProductActiveSwitch
                          active={isProductActive(p)}
                          disabled={busyIds.has(p.id)}
                          onToggle={() => void handleToggleActive(p)}
                        />
                        <button
                          type="button"
                          onClick={() => void openEditModal(p)}
                          className="rounded-lg border border-[var(--card-border)] p-2 text-[#374151] transition-colors hover:border-[var(--dash-primary)]/30 hover:bg-[var(--dash-primary)]/5 hover:text-[var(--dash-primary)]"
                          aria-label="Editar produto"
                        >
                          <IconPencil className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          disabled={busyIds.has(p.id)}
                          onClick={() => void handleDeleteProductFromList(p)}
                          className="rounded-lg border border-transparent p-2 text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label="Remover produto"
                        >
                          <IconTrash className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <MenuImportReviewModal
        open={importReviewOpen}
        onClose={closeImportReview}
        storeId={storeId}
        parsed={importReviewParsed}
        plan={plan}
        onSaved={() => void refresh()}
      />
    </div>
  )
}
