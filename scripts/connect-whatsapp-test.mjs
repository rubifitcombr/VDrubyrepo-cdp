#!/usr/bin/env node
/**
 * Valida token Meta e liga WhatsApp à loja (teste de release).
 * Não commitar o token — passe só via variáveis de ambiente.
 *
 * Uso:
 *   WHATSAPP_TEST_ACCESS_TOKEN=... \
 *   WHATSAPP_TEST_WABA_ID=749870614887600 \
 *   WHATSAPP_TEST_PHONE_NUMBER_ID=1162876776919791 \
 *   node scripts/connect-whatsapp-test.mjs
 */
import { createCipheriv, createHash, randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const key = t.slice(0, i).trim()
      let val = t.slice(i + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
  }
}

loadEnvLocal()

const GRAPH = 'https://graph.facebook.com/v21.0'
const token = process.env.WHATSAPP_TEST_ACCESS_TOKEN?.trim()
const wabaId = process.env.WHATSAPP_TEST_WABA_ID?.trim()
const phoneNumberId = process.env.WHATSAPP_TEST_PHONE_NUMBER_ID?.trim()
const storeName = process.env.WHATSAPP_TEST_STORE_NAME?.trim() || 'Vyria Admin'

function encryptWhatsAppToken(plain) {
  const raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw || raw.length < 16) throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY inválida')
  const key = createHash('sha256').update(raw).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`
}

async function main() {
  if (!token || !wabaId || !phoneNumberId) {
    console.error(
      'Defina WHATSAPP_TEST_ACCESS_TOKEN, WHATSAPP_TEST_WABA_ID e WHATSAPP_TEST_PHONE_NUMBER_ID'
    )
    process.exit(1)
  }

  const url = `${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const phone = await res.json()
  if (!res.ok) {
    console.error('❌ Token inválido:', phone.error?.message || res.status)
    process.exit(1)
  }

  console.log('✅ Token Meta válido')
  console.log(`   Número: ${phone.display_phone_number || '—'}`)
  console.log(`   Nome: ${phone.verified_name || '—'}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Supabase não configurado')
    process.exit(1)
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: store, error: storeErr } = await db
    .from('stores')
    .select('id, name')
    .ilike('name', storeName)
    .maybeSingle()

  if (storeErr || !store) {
    console.error('❌ Loja não encontrada:', storeName, storeErr?.message)
    process.exit(1)
  }

  const display = phone.display_phone_number?.replace(/\D/g, '') || null
  const now = new Date().toISOString()
  const { error } = await db.from('store_whatsapp_config').upsert(
    {
      store_id: store.id,
      status: 'active',
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_e164: display,
      access_token_enc: encryptWhatsAppToken(token),
      last_error: null,
      updated_at: now,
    },
    { onConflict: 'store_id' }
  )

  if (error) {
    console.error('❌ Erro ao gravar config:', error.message)
    process.exit(1)
  }

  console.log(`✅ WhatsApp ligado à loja «${store.name}» (${store.id})`)
  console.log('   Próximo passo: painel → Master → WhatsApp → enviar mensagem de teste')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
