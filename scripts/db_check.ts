#!/usr/bin/env tsx
/**
 * Database status check.
 * Searches for .env in current dir, then in ../planspiel-js (dev repo).
 *
 * Usage: make db-check
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv(): Record<string, string> {
  // Search order: repo root, then sibling dev repo
  const candidates = [
    resolve(__dirname, '..', '.env'),
    resolve(__dirname, '..', '..', 'davplanspiel', 'planspiel-js', '.env'),
    resolve(__dirname, '..', '..', 'planspiel-js', '.env'),
  ]
  const envPath = candidates.find(p => existsSync(p))
  if (!envPath) {
    console.error('\n  ✗ .env not found. Searched:')
    candidates.forEach(p => console.error(`    ${p}`))
    console.error('\n  Create a .env file with SUPABASE_URL, SUPABASE_PAT, SUPABASE_SECRET\n')
    process.exit(1)
  }
  console.log(`  Using: ${envPath}`)
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (match) env[match[1]!.trim()] = match[2]!.trim()
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL    = env['SUPABASE_URL']    ?? env['VITE_SUPABASE_URL'] ?? ''
const SUPABASE_PAT    = env['SUPABASE_PAT']    ?? ''
const SUPABASE_SECRET = env['SUPABASE_SECRET'] ?? ''
const PROJECT_REF     = SUPABASE_URL.replace('https://', '').split('.')[0] ?? ''

if (!SUPABASE_URL || !SUPABASE_PAT || !SUPABASE_SECRET) {
  console.error('\n  ✗ SUPABASE_URL, SUPABASE_PAT, SUPABASE_SECRET must be set in .env\n')
  process.exit(1)
}

console.log('\n  Insurance Planning Game – DB Status')
console.log('  =====================================')
console.log(`  Project: ${PROJECT_REF}`)
console.log(`  URL:     ${SUPABASE_URL}\n`)

// ── Auth users ─────────────────────────────────────────────────────────────

async function getAuthUsers(): Promise<Array<{ id: string; email: string; created_at: string }>> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { 'apikey': SUPABASE_SECRET, 'Authorization': `Bearer ${SUPABASE_SECRET}` },
  })
  if (!res.ok) return []
  const body = await res.json() as { users?: Array<{ id: string; email: string; created_at: string }> }
  return body.users ?? []
}

// ── Table counts ───────────────────────────────────────────────────────────

async function queryCount(table: string): Promise<number> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_PAT}` },
      body:    JSON.stringify({ query: `SELECT COUNT(*)::int AS n FROM ${table}` }),
    }
  )
  if (!res.ok) return -1
  const rows = await res.json() as Array<{ n: number }>
  return rows[0]?.n ?? 0
}

// ── Run ────────────────────────────────────────────────────────────────────

const [users, games, groups, inputs, results, state, audit] = await Promise.all([
  getAuthUsers(),
  queryCount('games'),
  queryCount('groups'),
  queryCount('group_inputs'),
  queryCount('game_results'),
  queryCount('game_state'),
  queryCount('audit_log'),
])

const pad = (s: string) => s.padEnd(14)

console.log('  Auth')
console.log(`    ${pad('game masters')} ${users.length}`)
for (const u of users) {
  const date = new Date(u.created_at).toLocaleDateString('de-DE')
  console.log(`      – ${u.email}  (created ${date})`)
}

console.log('\n  Tables')
console.log(`    ${pad('games')}       ${games  < 0 ? 'error' : games}`)
console.log(`    ${pad('groups')}      ${groups < 0 ? 'error' : groups}`)
console.log(`    ${pad('group_inputs')} ${inputs < 0 ? 'error' : inputs}`)
console.log(`    ${pad('game_results')} ${results < 0 ? 'error' : results}`)
console.log(`    ${pad('game_state')}  ${state  < 0 ? 'error' : state}`)
console.log(`    ${pad('audit_log')}   ${audit  < 0 ? 'error' : audit}`)

const total = [games, groups, inputs, results, state, audit]
  .filter(n => n > 0).reduce((a, b) => a + b, 0)
console.log(`\n  Total rows: ${total}`)

if (total === 0 && users.length === 0) {
  console.log('  ✅ Database is completely clean.')
} else if (total === 0) {
  console.log('  ✅ Tables empty – auth users still present (expected after db-init).')
} else {
  console.log('  ⚠️  Data present.')
}
console.log()
