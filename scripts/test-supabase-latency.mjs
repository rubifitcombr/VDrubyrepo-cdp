import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const raw = readFileSync('.env.local', 'utf8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
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
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !serviceKey || !anonKey) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

async function timed(label, fn) {
  const t0 = Date.now()
  try {
    const result = await fn()
    console.log(`${label}: ${Date.now() - t0}ms`, result)
    return result
  } catch (e) {
    console.log(`${label}: ${Date.now() - t0}ms ERROR`, e.message)
    return null
  }
}

const svc = createClient(url, serviceKey)
const anon = createClient(url, anonKey)

await timed('health', async () => {
  const res = await fetch(`${url}/auth/v1/health`)
  return res.status
})

await timed('service stores slug', async () => {
  const { data, error } = await svc
    .from('stores')
    .select('id,slug,name,status')
    .eq('slug', 'donna-cereja')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.slug ?? 'not found'
})

await timed('anon rpc get_public_store_by_slug', async () => {
  const { data, error } = await anon.rpc('get_public_store_by_slug', {
    p_slug: 'donna-cereja',
  })
  if (error) throw new Error(error.message)
  return data?.slug ?? data?.name ?? 'null'
})

console.log('done')
