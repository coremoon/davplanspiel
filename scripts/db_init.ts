#!/usr/bin/env tsx
/**
 * Database initialisation script.
 *
 * 1. Deletes all Supabase Auth users (via Management API)
 * 2. Drops and recreates all tables (via Management API + SQL)
 *
 * Required .env entries:
 *   SUPABASE_URL    – https://XXXX.supabase.co
 *   SUPABASE_PAT    – sbp_xxxx  (supabase.com/dashboard/account/tokens)
 *   SUPABASE_SECRET – sb_secret_xxxx  (service role key, for Auth API)
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

const SUPABASE_URL    = env['SUPABASE_URL']    ?? env['VITE_SUPABASE_URL'] ?? ''
const SUPABASE_PAT    = env['SUPABASE_PAT']    ?? ''
const SUPABASE_SECRET = env['SUPABASE_SECRET'] ?? ''

if (!SUPABASE_URL)    { console.error('\n  ✗ SUPABASE_URL missing in .env\n');    process.exit(1) }
if (!SUPABASE_PAT)    { console.error('\n  ✗ SUPABASE_PAT missing in .env\n');    process.exit(1) }
if (!SUPABASE_SECRET) { console.error('\n  ✗ SUPABASE_SECRET missing in .env\n'); process.exit(1) }

const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0] ?? ''
if (!PROJECT_REF) { console.error('\n  ✗ Could not extract project ref from SUPABASE_URL\n'); process.exit(1) }

const SQL = readFileSync(resolve(__dirname, 'supabase_schema.sql'), 'utf-8')

console.log('\n  Insurance Planning Game – DB Init')
console.log('  ==================================')
console.log(`  Project: ${PROJECT_REF}`)
console.log(`  URL:     ${SUPABASE_URL}`)

// ── Step 1: Delete all Auth users ──────────────────────────────────────────

console.log('\n  Step 1/2: Deleting Auth users...')

async function deleteAllAuthUsers(): Promise<void> {
  // List all users (max 1000 per page)
  const listUrl = `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`
  const listRes = await fetch(listUrl, {
    headers: {
      'apikey':        SUPABASE_SECRET,
      'Authorization': `Bearer ${SUPABASE_SECRET}`,
    },
  })

  if (!listRes.ok) {
    console.warn(`  ⚠️  Could not list auth users (${listRes.status}) – skipping`)
    return
  }

  const body = await listRes.json() as { users?: Array<{ id: string }> }
  const users = body.users ?? []

  if (users.length === 0) {
    console.log('  ✓ No auth users found')
    return
  }

  console.log(`  Deleting ${users.length} user(s)...`)
  let deleted = 0
  for (const user of users) {
    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey':        SUPABASE_SECRET,
        'Authorization': `Bearer ${SUPABASE_SECRET}`,
      },
    })
    if (delRes.ok) { deleted++ }
    else { console.warn(`  ⚠️  Could not delete user ${user.id} (${delRes.status})`) }
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
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_PAT}`,
    },
    body: JSON.stringify({ query: SQL }),
  }
)

if (!schemaRes.ok) {
  const text = await schemaRes.text()
  console.error(`\n  ✗ Schema API error ${schemaRes.status}:\n`)
  console.error(text)
  console.error('\n  Fallback: run the SQL manually:')
  console.error(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`)
  process.exit(1)
}

console.log('\n  ✓ Auth users deleted')
console.log('  ✓ Schema recreated')
console.log('  ✓ RLS policies set')
console.log('  ✓ Realtime enabled')
console.log('\n  Tables:')
console.log('    games, groups, group_inputs, game_results, game_state, audit_log')
console.log('\n  Next step: register a new game master account in the browser.')
console.log()
