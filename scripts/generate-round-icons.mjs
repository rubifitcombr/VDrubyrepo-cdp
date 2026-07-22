#!/usr/bin/env node
/**
 * Gera ícones circulares (favicon, PWA, Google) a partir do símbolo Vyria.
 * Uso: node scripts/generate-round-icons.mjs
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'public/icons/icon-512x512.png')
const outDir = resolve(root, 'public/icons')
const appIcon = resolve(root, 'app/icon.png')

const SIZES = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512]

function circleMask(size) {
  const r = size / 2
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
  )
}

/** Recorta só o emblema (V + raio), sem a palavra VYRIA DELIVERY. */
async function loadSymbolBuffer() {
  const meta = await sharp(source).metadata()
  const width = meta.width ?? 512
  const height = meta.height ?? 512
  const crop = Math.round(width * 0.46)
  const left = Math.round((width - crop) / 2)
  const top = Math.round(height * 0.07)
  return sharp(source)
    .extract({
      left,
      top,
      width: crop,
      height: crop,
    })
    .png()
    .toBuffer()
}

async function roundIcon(symbolBuffer, size) {
  const mask = circleMask(size)
  return sharp(symbolBuffer)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

await mkdir(outDir, { recursive: true })
const symbolBuffer = await loadSymbolBuffer()

for (const size of SIZES) {
  const buf = await roundIcon(symbolBuffer, size)
  const name =
    size === 180
      ? resolve(root, 'public/apple-touch-icon.png')
      : resolve(outDir, `icon-${size}x${size}.png`)
  await writeFile(name, buf)
  if (size === 180) {
    console.log('✓ apple-touch-icon.png')
  } else {
    console.log(`✓ icon-${size}x${size}.png`)
  }
}

await writeFile(resolve(root, 'public/favicon-32x32.png'), await roundIcon(symbolBuffer, 32))
await writeFile(appIcon, await roundIcon(symbolBuffer, 512))
console.log('✓ favicon-32x32.png')
console.log('✓ app/icon.png')
