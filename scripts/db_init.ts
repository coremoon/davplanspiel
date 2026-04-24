#!/usr/bin/env tsx
/**
 * Database initialisation script.
 *
 * 1. Deletes all Supabase Auth users
 * 2. Drops and recreates all tables
 *
 * Searches for .env in repo root, then sibling dev repo.
 *
 * Usage: make db-init
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv(): Record<string, string> {
  const candidates = [
    resolve(__dirname, '..', '.env'),
    resolve(__dirname, '..', '..', 'davplanspiel', 'planspiel-js', '.env'),
    resolve(__dirname, '..', '..', 'planspiel-js', '.env'),
  ]
  const envPath = candidates.find(p => existsSync(p))
  if (!envPath) {
    console.error('\n  ✗ .env not found. Searched:')
    candidates.forEach(p => console.error(`    ${p}`))
    process.exit(1)
  }
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

if (!SUPABASE_URL)    { console.error('\n  ✗ SUPABASE_URL missing\n');    process.exit(1) }
if (!SUPABASE_PAT)    { console.error('\n  ✗ SUPABASE_PAT missing\n');    process.exit(1) }
if (!SUPABASE_SECRET) { console.error('\n  ✗ SUPABASE_SECRET missing\n'); process.exit(1) }

const SQL = readFileSync(resolve(__dirname, 'supabase_schema.sql'), 'utf-8')

console.log('\n  Insurance Planning Game – DB Init')
console.log('  ==================================')
console.log(`  Project: ${PROJECT_REF}`)
console.log(`  URL:     ${SUPABASE_URL}`)

// ── Step 1: Delete all Auth users ──────────────────────────────────────────

console.log('\n  Step 1/2: Deleting Auth users...')

async function deleteAllAuthUsers(): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { 'apikey': SUPABASE_SECRET, 'Authorization': `Bearer ${SUPABASE_SECRET}` },
  })
  if (!res.ok) { console.warn(`  ⚠️  Could not list auth users (${res.status}) – skipping`); return }

  const body = await res.json() as { users?: Array<{ id: string }> }
  const users = body.users ?? []

  if (users.length === 0) { console.log('  ✓ No auth users found'); return }

  console.log(`  Deleting ${users.length} user(s)...`)
  let deleted = 0
  for (const user of users) {
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method:  'DELETE',
      headers: { 'apikey': SUPABASE_SECRET, 'Authorization': `Bearer ${SUPABASE_SECRET}` },
    })
    if (del.ok) deleted++
    else console.warn(`  ⚠️  Could not delete user ${user.id} (${del.status})`)
  }
  console.log(`  ✓ ${deleted}/${users.length} auth users deleted`)
}

await deleteAllAuthUsers()

// ── Step 2: Recreate schema ────────────────────────────────────────────────

console.log('\n  Step 2/2: Recreating database schema...')

const schemaRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_PAT}` },
    body:    JSON.stringify({ query: SQL }),
  }
)

if (!schemaRes.ok) {
  const text = await schemaRes.text()
  console.error(`\n  ✗ Schema API error ${schemaRes.status}:\n`)
  console.error(text)
  console.error(`\n  Fallback: https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`)
  process.exit(1)
}

console.log('\n  ✓ Auth users deleted')
console.log('  ✓ Schema recreated')
console.log('  ✓ RLS policies set')
console.log('  ✓ Realtime enabled')
console.log('\n  Run make db-check to verify.')
console.log('  Then register a new game master account in the browser.')
console.log()
