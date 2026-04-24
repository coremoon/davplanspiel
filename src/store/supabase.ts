/**
 * Supabase store – schema v2.3
 * Tables: games, groups, group_inputs, game_results, game_state, audit_log
 *
 * Audit events are written exclusively by DB triggers (SECURITY DEFINER).
 * The client never writes to audit_log directly.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { StaticConfig } from '@core/config'
import type { GameData, GruppeInput } from '@core/algorithmus'

// ── Client ─────────────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client
  const url = import.meta.env['VITE_SUPABASE_URL']
  const key = import.meta.env['VITE_SUPABASE_ANON_KEY']
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing')
  _client = createClient(url, key)
  return _client
}

// ── Games ──────────────────────────────────────────────────────────────────

export interface GameMeta {
  id:     string
  title:  string
  config: StaticConfig
  status: string
}

/** Load config of the active (non-archived) game with this ID */
export async function loadConfig(gameId: string): Promise<StaticConfig | null> {
  const { data } = await getSupabaseClient()
    .from('games')
    .select('config')
    .eq('id', gameId)
    .neq('status', 'archived')
    .maybeSingle()
  return data ? (data['config'] as StaticConfig) : null
}

export async function saveConfig(gameId: string, cfg: StaticConfig): Promise<void> {
  await getSupabaseClient()
    .from('games')
    .update({ config: cfg })
    .eq('id', gameId)
    .neq('status', 'archived')
}

export async function createGame(
  gameId: string, ownerId: string, cfg: StaticConfig, title = '',
): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from('games').insert({
    id: gameId, owner_id: ownerId, config: cfg, title, status: 'active',
  })
  if (error) throw new Error(error.message)
  await sb.from('game_state').insert({ game_id: gameId, key: 'run_times', value: 0 })
}

/** List all active (non-archived) games owned by current user */
export async function listMyGames(): Promise<GameMeta[]> {
  const { data: { user } } = await getSupabaseClient().auth.getUser()
  if (!user) return []
  const { data } = await getSupabaseClient()
    .from('games')
    .select('id, title, config, status')
    .eq('owner_id', user.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  return (data ?? []) as GameMeta[]
}

/** Archive a game – releases its 4-word ID for reuse */
export async function archiveGame(gameId: string): Promise<void> {
  await getSupabaseClient()
    .from('games')
    .update({ status: 'archived' })
    .eq('id', gameId)
}

export async function resetSpiel(gameId: string): Promise<void> {
  const sb = getSupabaseClient()
  await Promise.all([
    sb.from('groups').delete().eq('game_id', gameId),
    sb.from('group_inputs').delete().eq('game_id', gameId),
    sb.from('game_results').delete().eq('game_id', gameId),
    sb.from('game_state').delete().eq('game_id', gameId),
  ])
}

// ── Game state ─────────────────────────────────────────────────────────────

export async function getState<T>(gameId: string, key: string, fallback: T): Promise<T> {
  const { data } = await getSupabaseClient()
    .from('game_state').select('value').eq('game_id', gameId).eq('key', key).maybeSingle()
  return data ? (data['value'] as T) : fallback
}

export async function setState(gameId: string, key: string, value: unknown): Promise<void> {
  await getSupabaseClient().from('game_state').upsert({ game_id: gameId, key, value })
}

export async function getRunTimes(gameId: string): Promise<number> {
  return getState(gameId, 'run_times', 0)
}

export async function setRunTimes(gameId: string, n: number): Promise<void> {
  return setState(gameId, 'run_times', n)
}

// ── Groups ─────────────────────────────────────────────────────────────────

export async function getGruppen(gameId: string): Promise<Array<{ name: string }>> {
  const { data } = await getSupabaseClient()
    .from('groups').select('name').eq('game_id', gameId)
  return (data ?? []) as Array<{ name: string }>
}

export async function gruppeExistiert(gameId: string, name: string): Promise<boolean> {
  const { data } = await getSupabaseClient()
    .from('groups').select('name').eq('game_id', gameId).eq('name', name).maybeSingle()
  return !!data
}

export async function createGruppe(gameId: string, name: string, _pwHash: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('groups').insert({ game_id: gameId, name })
  if (error) {
    if (error.code === 'P0001' && error.message.toLowerCase().includes('full'))
      throw new Error('GAME_FULL')
    if (error.code === '23505') throw new Error('GROUP_EXISTS')
    throw new Error(error.message)
  }
}

export async function deleteGruppe(gameId: string, name: string): Promise<void> {
  const sb = getSupabaseClient()
  await Promise.all([
    sb.from('groups').delete().eq('game_id', gameId).eq('name', name),
    sb.from('group_inputs').delete().eq('game_id', gameId).eq('group_name', name),
    sb.from('game_results').delete().eq('game_id', gameId).eq('group_name', name),
  ])
}

// ── Group inputs ───────────────────────────────────────────────────────────

export async function saveGroupadminInput(gameId: string, input: GruppeInput): Promise<void> {
  await getSupabaseClient().from('group_inputs').upsert({
    game_id:            gameId,
    group_name:         input.Gruppe,
    premium_adjustment: input.Praemienanpassung,
    dividend_payment:   input.Dividendenausschuettung,
    round:              input.Jahr,
  })
}

export async function getGroupadminData(gameId: string): Promise<GruppeInput[]> {
  const { data } = await getSupabaseClient()
    .from('group_inputs').select('*').eq('game_id', gameId)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    Gruppe:                  r['group_name'] as string,
    Praemienanpassung:       r['premium_adjustment'] as number,
    Dividendenausschuettung: r['dividend_payment'] as number,
    Jahr:                    r['round'] as number,
  }))
}

export async function gruppenBereitFuerPeriode(
  gameId: string, round: number, groupCount: number,
): Promise<boolean> {
  const { count } = await getSupabaseClient()
    .from('group_inputs').select('*', { count: 'exact', head: true })
    .eq('game_id', gameId).eq('round', round)
  return (count ?? 0) >= groupCount
}

// ── Game results ───────────────────────────────────────────────────────────

export async function saveGamedata(gameId: string, rows: GameData): Promise<void> {
  await getSupabaseClient().from('game_results').upsert(
    rows.map(r => ({ game_id: gameId, group_name: r.Gruppe, year: r.Jahr, data: r }))
  )
}

export async function loadGamedata(gameId: string): Promise<GameData | null> {
  const { data } = await getSupabaseClient()
    .from('game_results').select('data').eq('game_id', gameId).order('year')
  if (!data || data.length === 0) return null
  return data.map((r: Record<string, unknown>) => r['data']) as GameData
}

// ── Realtime ───────────────────────────────────────────────────────────────

export function subscribeToGamedata(gameId: string, callback: (p: unknown) => void): () => void {
  const ch = getSupabaseClient()
    .channel(`game_results:${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results',
      filter: `game_id=eq.${gameId}` }, callback)
    .subscribe()
  return () => { void getSupabaseClient().removeChannel(ch) }
}

export function subscribeToSpielState(gameId: string, callback: (p: unknown) => void): () => void {
  const ch = getSupabaseClient()
    .channel(`game_state:${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state',
      filter: `game_id=eq.${gameId}` }, callback)
    .subscribe()
  return () => { void getSupabaseClient().removeChannel(ch) }
}
