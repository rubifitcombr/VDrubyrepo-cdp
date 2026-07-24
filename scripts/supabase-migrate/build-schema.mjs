#!/usr/bin/env node
/** Gera um SQL único com todas as migrações — colar no SQL Editor do projeto NOVO. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCombinedMigrationsSql } from './lib.mjs'

const dir = resolve(process.cwd(), '.migration-export')
mkdirSync(dir, { recursive: true })
const out = resolve(dir, '00-schema-all-migrations.sql')
const sql = buildCombinedMigrationsSql()
writeFileSync(out, sql, 'utf8')
console.log(`Schema combinado: ${out} (${sql.length} chars)`)
