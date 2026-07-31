import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SW_CACHE_NAME } from '@/lib/sw-cache-version'

let cachedTemplate: string | null = null

function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate
  const path = join(process.cwd(), 'lib', 'service-worker.template.js')
  cachedTemplate = readFileSync(path, 'utf8')
  return cachedTemplate
}

/** Gera o script do service worker com a versão de cache do deploy actual. */
export function getServiceWorkerScript(): string {
  return loadTemplate().replace('__SW_CACHE_NAME__', SW_CACHE_NAME)
}
