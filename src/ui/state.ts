/**
 * Reactive UI state.
 *
 * No framework (no React/Vue) – simple observer pattern.
 * Mirrors the combination of lokal$* + global$* from the R original,
 * but cleanly separated: session (local) and game state (loaded from Supabase).
 */

import type { GameData, GruppeInput } from '@core/algorithmus'
import type { StaticConfig } from '@core/config'
import type { Session } from '@auth/session'

// ── State types ────────────────────────────────────────────────────────────

export interface AppState {
  // Session (local, sessionStorage)
  session:         Session | null

  // Game state (from Supabase)
  spielId:         string
  cfg:             StaticConfig | null
  runTimes:        number
  gamedata:        GameData | null
  groupadminData:  GruppeInput[]
  gruppen:         string[]

  // UI
  activeTab:       TabId
  loading:         boolean
  error:           string | null
  notification:    Notification | null
}

export type TabId =
  | 'login'
  | 'home'
  | 'analyse-gruppe'
  | 'analyse-markt'
  | 'overview'
  | 'sieger'

export interface Notification {
  type:    'success' | 'error' | 'info' | 'warning'
  text:    string
  timeout: number
}

// ── Initial state ──────────────────────────────────────────────────────────

function getInitialGameId(): string {
  const hash = window.location.hash.replace('#', '')
  const params = new URLSearchParams(hash)
  const fromUrl = params.get('spiel')
  if (fromUrl) {
    localStorage.setItem('planspiel_id', fromUrl)
    return fromUrl
  }
  return localStorage.getItem('planspiel_id') ?? 'default'
}

const initialState: AppState = {
  session:        null,
  spielId:        getInitialGameId(),
  cfg:            null,
  runTimes:       0,
  gamedata:       null,
  groupadminData: [],
  gruppen:        [],
  activeTab:      'login',
  loading:        false,
  error:          null,
  notification:   null,
}

// ── Store ──────────────────────────────────────────────────────────────────

type Listener = (state: AppState) => void

class Store {
  private state:     AppState = { ...initialState }
  private listeners: Set<Listener> = new Set()

  get(): AppState {
    return this.state
  }

  set(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.state)   // call immediately with current state
    return () => this.listeners.delete(fn)
  }

  private notify(): void {
    this.listeners.forEach(fn => fn(this.state))
  }
}

export const store = new Store()

// ── Helper functions ───────────────────────────────────────────────────────

export function setTab(tab: TabId): void {
  store.set({ activeTab: tab })
}

export function showNotification(
  type: Notification['type'],
  text: string,
  timeout = 3500,
): void {
  store.set({ notification: { type, text, timeout } })
  setTimeout(() => store.set({ notification: null }), timeout)
}

export function setLoading(loading: boolean): void {
  store.set({ loading })
}

export function setError(error: string | null): void {
  store.set({ error })
}
