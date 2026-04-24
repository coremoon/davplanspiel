#!/usr/bin/env tsx
/**
 * Database initialisation script.
 *
 * Reads credentials from .env, then executes scripts/supabase_schema.sql
 * via the Supabase Management API using a Personal Access Token (PAT).
 *
 * Required .env entries:
 *   SUPABASE_URL   – https://XXXX.supabase.co
 *   SUPABASE_PAT   – sbp_xxxx  (from supabase.com/dashboard/account/tokens)
 *
 * Usage:
 *   make db-init
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env ──────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '..', '.env')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (match) env[match[1]!.trim()] = match[2]!.trim()
  }
  return env
}

const env = loadEnv()

const SUPABASE_URL = env['SUPABASE_URL'] ?? env['VITE_SUPABASE_URL'] ?? ''
const SUPABASE_PAT = env['SUPABASE_PAT'] ?? ''

if (!SUPABASE_URL) {
  console.error('\n  ✗ SUPABASE_URL missing in .env\n')
  process.exit(1)
}
if (!SUPABASE_PAT) {
  console.error('\n  ✗ SUPABASE_PAT missing in .env')
  console.error('  Get one at: https://supabase.com/dashboard/account/tokens\n')
  process.exit(1)
}

// Extract project ref from URL: https://XXXX.supabase.co → XXXX
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0] ?? ''
if (!PROJECT_REF) {
  console.error('\n  ✗ Could not extract project ref from SUPABASE_URL\n')
  process.exit(1)
}

// ── Load SQL ───────────────────────────────────────────────────────────────

const sql = readFileSync(resolve(__dirname, 'supabase_schema.sql'), 'utf-8')

// ── Execute via Management API ─────────────────────────────────────────────

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

console.log('\n  Versicherungsplanspiel – DB Init')
console.log('  =================================')
console.log(`  Project: ${PROJECT_REF}`)
console.log(`  URL:     ${SUPABASE_URL}`)
console.log('\n  Dropping and recreating all tables...\n')

const response = await fetch(url, {
  method:  'POST',
  headers: {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SUPABASE_PAT}`,
  },
  body: JSON.stringify({ query: sql }),
})

if (!response.ok) {
  const text = await response.text()
  console.error(`\n  ✗ API error ${response.status}:\n`)
  console.error(text)
  console.error('\n  Fallback: run the SQL manually in the Supabase SQL editor:')
  console.error(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`)
  process.exit(1)
}

console.log('  ✓ Schema created successfully')
console.log('  ✓ RLS policies set')
console.log('  ✓ Realtime enabled')
console.log('\n  Tables:')
console.log('    games          – game sessions (owned by auth users)')
console.log('    groups         – anonymous players')
console.log('    group_inputs   – per-round decisions')
console.log('    game_results   – algorithm output')
console.log('    game_state     – key-value runtime state')
console.log('\n  Next steps:')
console.log('  1. Supabase Dashboard → Authentication → URL Configuration')
console.log(`     https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration`)
console.log('     Add: http://localhost:5173')
console.log('  2. make dev')
console.log()
