/**
 * Application entry point.
 */

import './ui/styles.css'

import { initI18n } from './i18n'
import { mountLangSwitcher } from './ui/langSwitcher'
import { clearSession, getSession } from '@auth/session'
import {
  getRunTimes,
  getSupabaseClient,
  gruppeExistiert,
  loadConfig,
  subscribeToGamedata,
  subscribeToSpielState,
} from '@store/supabase'
import { renderApp } from './ui/router'
import { store } from './ui/state'

// ── Boot ───────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  await initI18n()
  mountLangSwitcher()
  await validateSession()   // clear stale sessions before rendering
  setupRealtimeAndHeartbeat()
  renderApp()
}

/**
 * Validate the stored session against Supabase Auth.
 * Clears sessionStorage if the JWT is no longer valid
 * (e.g. after make db-init deleted all auth users).
 */
async function validateSession(): Promise<void> {
  const s = getSession()
  if (!s || s.login_as === '') return

  if (s.login_as === 'admin') {
    // Verify Supabase Auth session is still valid
    const { data: { user } } = await getSupabaseClient().auth.getUser()
    if (!user) {
      clearSession()
      store.set({ session: null, activeTab: 'login' })
    }
  }
  // Groups: heartbeat handles validation after boot
}

// ── Reset message ──────────────────────────────────────────────────────────

function showResetMessage(reason: 'game_gone' | 'group_gone' | 'restart'): void {
  import('./i18n').then(({ t }) => {
    const messages: Record<string, string> = {
      game_gone:  t('reset.game_gone'),
      group_gone: t('reset.group_gone'),
      restart:    t('reset.restart'),
    }
    clearSession()
    store.set({ session: null, activeTab: 'login',
                cfg: null, gamedata: null, gruppen: [], runTimes: 0 })

    const app = document.getElementById('app')
    if (!app) { window.location.reload(); return }

    app.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;
        justify-content:center;background:#f4f6f9;font-family:sans-serif;">
        <div style="background:#fff;padding:2rem;border-radius:8px;
          box-shadow:0 4px 12px rgba(0,0,0,.15);text-align:center;max-width:380px;">
          <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
          <h2 style="margin-bottom:.5rem;color:#212529">${t('reset.title')}</h2>
          <p style="color:#6c757d;margin-bottom:1.5rem">${messages[reason]}</p>
          <button onclick="window.location.reload()"
            style="background:#005DB5;color:#fff;border:none;padding:.65rem 1.5rem;
            border-radius:4px;cursor:pointer;font-size:1rem;">
            ${t('reset.btn_back')}
          </button>
        </div>
      </div>
    `
  })
}

// ── Heartbeat ──────────────────────────────────────────────────────────────

let _heartbeatTimer: ReturnType<typeof setInterval> | null = null
let _lastRunTimes = -1

function stopHeartbeat(): void {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null }
}

async function heartbeatTick(): Promise<void> {
  const s = getSession()
  if (!s || s.login_as === '') return

  // Admin: verify Supabase Auth session is still valid
  if (s.login_as === 'admin') {
    const { data: { user } } = await getSupabaseClient().auth.getUser()
    if (!user) {
      clearSession()
      store.set({ session: null, activeTab: 'login' })
      stopHeartbeat()
      renderApp()
    }
    return
  }

  // Group / viewer: verify game and group still exist
  const { spiel_id: gameId, gruppe } = s
  try {
    const cfg = await loadConfig(gameId)
    if (!cfg) { showResetMessage('game_gone'); stopHeartbeat(); return }

    const exists = await gruppeExistiert(gameId, gruppe)
    if (!exists) { showResetMessage('group_gone'); stopHeartbeat(); return }

    const runTimes = await getRunTimes(gameId)
    if (_lastRunTimes > 0 && runTimes === 0) { showResetMessage('restart'); stopHeartbeat(); return }
    _lastRunTimes = runTimes
  } catch {
    // network error – retry on next tick
  }
}

function startHeartbeat(): void {
  stopHeartbeat()
  _lastRunTimes = -1
  const s = getSession()
  if (!s || s.login_as === '') return
  setTimeout(() => {
    void heartbeatTick()
    _heartbeatTimer = setInterval(() => { void heartbeatTick() }, 8_000)
  }, 1_000)
}

// ── Realtime ───────────────────────────────────────────────────────────────

let unsubGamedata:   (() => void) | null = null
let unsubSpielState: (() => void) | null = null

function setupRealtime(gameId: string): void {
  unsubGamedata?.()
  unsubSpielState?.()

  unsubGamedata = subscribeToGamedata(gameId, () => {
    void import('@store/supabase').then(async ({ loadGamedata, getRunTimes: grt }) => {
      const gamedata = await loadGamedata(gameId)
      const runTimes = await grt(gameId)
      store.set({ gamedata, runTimes })
      renderApp()
    })
  })

  unsubSpielState = subscribeToSpielState(gameId, () => {
    void import('@store/supabase').then(async ({ getRunTimes: grt }) => {
      const runTimes = await grt(gameId)
      if (_lastRunTimes > 0 && runTimes === 0) {
        const s = getSession()
        if (s && s.login_as !== 'admin') void heartbeatTick()
      }
      store.set({ runTimes })
      renderApp()
    })
  })
}

// ── Wiring ─────────────────────────────────────────────────────────────────

function setupRealtimeAndHeartbeat(): void {
  const initialSession = getSession()
  if (initialSession && initialSession.login_as !== '') {
    store.set({ session: initialSession, spielId: initialSession.spiel_id, activeTab: 'home' })
  }

  const initialGameId = initialSession?.spiel_id ?? ''
  if (initialGameId) setupRealtime(initialGameId)
  setTimeout(() => startHeartbeat(), 500)

  let lastGameId = initialGameId
  store.subscribe(state => {
    if (state.spielId && state.spielId !== lastGameId) {
      lastGameId = state.spielId
      setupRealtime(state.spielId)
      setTimeout(() => startHeartbeat(), 500)
    }
    if (!state.session || state.session.login_as === '') stopHeartbeat()
  })
}

// ── Start ───────────────────────────────────────────────────────────────────

void boot()
