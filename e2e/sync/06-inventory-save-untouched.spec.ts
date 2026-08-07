import { test, expect } from '@playwright/test'
import { E2E_STORE_ID } from '../fixtures/store'
import { unlockHubAdministracaoPin } from '../helpers/hub-pin'
import { getSupabaseAdmin } from '../helpers/supabase-admin'
import { buildInventorySaveItems } from '../../lib/inventory-save-payload'

async function findUncontrolledProductIds(limit = 2): Promise<string[]> {
  const sb = getSupabaseAdmin()
  const { data: products, error: productsError } = await sb
    .from('products')
    .select('id, name')
    .eq('store_id', E2E_STORE_ID)
    .eq('active', true)
    .order('name')
    .limit(50)

  if (productsError || !products?.length) {
    throw new Error(
      `Não foi possível listar produtos E2E: ${productsError?.message ?? 'lista vazia'}`
    )
  }

  const { data: stockRows, error: stockError } = await sb
    .from('store_product_stock')
    .select('product_id')
    .eq('store_id', E2E_STORE_ID)

  if (stockError) {
    throw new Error(`Não foi possível listar stock E2E: ${stockError.message}`)
  }

  const controlled = new Set((stockRows ?? []).map((row) => String(row.product_id)))
  return products
    .map((p) => String(p.id))
    .filter((id) => !controlled.has(id))
    .slice(0, limit)
}

async function hasStockRow(productId: string): Promise<boolean> {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('store_product_stock')
    .select('product_id')
    .eq('store_id', E2E_STORE_ID)
    .eq('product_id', productId)
    .maybeSingle()
  return Boolean(data?.product_id)
}

test.describe('Estoque — save sem tocar produtos ilimitados', () => {
  test('abrir Estoque e guardar sem alterações não cria linhas novas', async ({
    page,
  }) => {
    const uncontrolledIds = await findUncontrolledProductIds(2)
    expect(
      uncontrolledIds.length,
      'Precisa de pelo menos 1 produto activo sem linha em store_product_stock'
    ).toBeGreaterThan(0)

    const targetId = uncontrolledIds[0]!
    expect(await hasStockRow(targetId)).toBe(false)

    const inventoryPuts: unknown[] = []
    await page.route('**/api/inventory', async (route) => {
      if (route.request().method() === 'PUT') {
        inventoryPuts.push(route.request().postDataJSON())
      }
      await route.continue()
    })

    await page.goto('/dashboard')
    await unlockHubAdministracaoPin(page, E2E_STORE_ID)
    await page.goto('/dashboard/inventory')
    await expect(page.getByRole('heading', { name: /^estoque$/i })).toBeVisible({
      timeout: 30_000,
    })

    const saveButton = page.getByRole('button', { name: /^guardar estoque$/i })
    await expect(saveButton).toBeDisabled()

    await saveButton.click({ force: true })
    await page.waitForTimeout(500)

    expect(inventoryPuts).toEqual([])
    expect(await hasStockRow(targetId)).toBe(false)

    const payload = buildInventorySaveItems(
      [
        {
          productId: targetId,
          quantity: 0,
          lowStockAlert: null,
        },
      ],
      { [targetId]: { quantity: '0', low: '' } },
      new Set()
    )
    expect(payload).toEqual([])
  })

  test('editar um produto não cria stock para os outros ilimitados', async ({
    page,
  }) => {
    const uncontrolledIds = await findUncontrolledProductIds(2)
    test.skip(
      uncontrolledIds.length < 2,
      'Precisa de 2 produtos activos sem controle de stock'
    )

    const untouchedId = uncontrolledIds[0]!
    const editedId = uncontrolledIds[1]!

    const sb = getSupabaseAdmin()
    const { data: editedProduct } = await sb
      .from('products')
      .select('name')
      .eq('id', editedId)
      .single()

    expect(editedProduct?.name).toBeTruthy()
    expect(await hasStockRow(untouchedId)).toBe(false)
    expect(await hasStockRow(editedId)).toBe(false)

    let putBody: { items?: Array<{ product_id: string; quantity: number }> } | null =
      null
    await page.route('**/api/inventory', async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = route.request().postDataJSON() as {
          items?: Array<{ product_id: string; quantity: number }>
        }
      }
      await route.continue()
    })

    await page.goto('/dashboard')
    await unlockHubAdministracaoPin(page, E2E_STORE_ID)
    await page.goto('/dashboard/inventory')
    await expect(page.getByRole('heading', { name: /^estoque$/i })).toBeVisible({
      timeout: 30_000,
    })

    const search = page.getByPlaceholder(/buscar por produto/i)
    await search.fill(String(editedProduct!.name))
    const row = page.getByRole('row').filter({ hasText: editedProduct!.name }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByRole('spinbutton').first().fill('7')

    const saveButton = page.getByRole('button', { name: /^guardar estoque$/i })
    await expect(saveButton).toBeEnabled({ timeout: 10_000 })
    await saveButton.click()
    await expect(page.getByText(/estoque atualizado/i)).toBeVisible({
      timeout: 20_000,
    })

    expect(putBody?.items?.map((item) => item.product_id)).toEqual([editedId])
    expect(await hasStockRow(untouchedId)).toBe(false)

    const { data: editedRow } = await sb
      .from('store_product_stock')
      .select('quantity')
      .eq('store_id', E2E_STORE_ID)
      .eq('product_id', editedId)
      .maybeSingle()
    expect(Number(editedRow?.quantity ?? -1)).toBe(7)

    await sb
      .from('store_product_stock')
      .delete()
      .eq('store_id', E2E_STORE_ID)
      .eq('product_id', editedId)
  })
})
