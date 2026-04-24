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
  // i18n must be ready before any t() call or renderApp()
  await initI18n()
  mountLangSwitcher()
  setupRealtimeAndHeartbeat()
  renderApp()
}

// ── Reset message ──────────────────────────────────────────────────────────

function showResetMessage(reason: 'game_gone' | 'group_gone' | 'restart'): void {
  // Import t() lazily to avoid circular – i18n is already initialised by boot()
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
  if (!s || s.login_as === 'admin' || s.login_as === '') return

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
  if (!s || s.login_as === 'admin' || s.login_as === '') return
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

  getSupabaseClient()
    .channel(`gruppen-delete:${gameId}`)
    .on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'gruppen',
      filter: `spiel_id=eq.${gameId}`,
    }, () => { void heartbeatTick() })
    .subscribe()
}

// ── Wiring ─────────────────────────────────────────────────────────────────

function setupRealtimeAndHeartbeat(): void {
  const initialSession = getSession()
  if (initialSession && initialSession.login_as !== '') {
    store.set({ session: initialSession, spielId: initialSession.spiel_id, activeTab: 'home' })
  }

  const initialGameId = initialSession?.spiel_id ?? 'default'
  setupRealtime(initialGameId)
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
