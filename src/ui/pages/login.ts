/**
 * Login page – two-step group flow:
 *   Step 1: Company name + Game ID → submit
 *   Step 2a: Group is NEW  → generate PIN, show once, join game
 *   Step 2b: Group EXISTS  → show PIN field, verify, log in
 */

import { t, getLang } from '@i18n'
import { generateSessionToken, setSession } from '@auth/session'
import {
  createGruppe, getGruppen, getRunTimes, gruppeExistiert,
  loadConfig, verifyGroupPin, generatePin, hashPin,
} from '@store/supabase'
import { getSupabaseClient } from '@store/supabase'
import { parseGameId, renderGameId, indicesToKey, type LangCode } from '@core/gameId'
import { alertHTML } from '../components/widgets'
import { navigate } from '../router'
import { store } from '../state'

// ── CAPTCHA ────────────────────────────────────────────────────────────────

const CAPTCHA_ENABLED  = import.meta.env['VITE_CAPTCHA_ENABLED'] === 'true'
const HCAPTCHA_SITEKEY = import.meta.env['VITE_HCAPTCHA_SITEKEY'] ?? ''
let _hcaptchaWidgetId: string | null = null

function loadHCaptchaScript(): Promise<void> {
  if ((window as any).hcaptcha) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit'
    s.async = true
    s.onload  = () => resolve()
    s.onerror = () => reject(new Error('hCaptcha failed to load'))
    document.head.appendChild(s)
  })
}

async function renderHCaptcha(): Promise<void> {
  if (!CAPTCHA_ENABLED) return
  await loadHCaptchaScript()
  const container = document.getElementById('hcaptcha-container')
  if (!container) return
  if (_hcaptchaWidgetId !== null) {
    try { (window as any).hcaptcha.reset(_hcaptchaWidgetId) } catch {}
    return
  }
  _hcaptchaWidgetId = (window as any).hcaptcha.render('hcaptcha-container', {
    sitekey: HCAPTCHA_SITEKEY, size: 'normal', theme: 'light',
  })
}

function getCaptchaToken(): string {
  if (!CAPTCHA_ENABLED || _hcaptchaWidgetId === null) return ''
  try { return (window as any).hcaptcha.getResponse(_hcaptchaWidgetId) ?? '' } catch { return '' }
}

function resetCaptcha(): void {
  if (!CAPTCHA_ENABLED || _hcaptchaWidgetId === null) return
  try { (window as any).hcaptcha.reset(_hcaptchaWidgetId) } catch {}
}

let _switchToLogin: ((prefillEmail?: string) => void) | null = null

// ── Render ─────────────────────────────────────────────────────────────────

export function render(root: HTMLElement): void {
  _hcaptchaWidgetId = null
  _switchToLogin    = null
  root.innerHTML    = getLoginHTML()
  attachListeners(root)
}

function getLoginHTML(): string {
  return `
    <div class="login-page">
      <div class="login-box">
        <div class="login-logo">📊</div>
        <h1 class="login-title">${t('login.title')}</h1>
        <p class="login-subtitle">${t('login.subtitle')}</p>
        <hr/>
        <div class="tab-bar" id="login-tabs">
          <button class="tab-btn active" data-role="admin">${t('login.tab_admin')}</button>
          <button class="tab-btn" data-role="group">${t('login.tab_group')}</button>
          <button class="tab-btn" data-role="viewer">${t('login.tab_viewer')}</button>
        </div>
        <div id="login-form-area">${adminFormHTML('login')}</div>
        <div id="login-error"></div>
        <div id="login-info"></div>
      </div>
    </div>
  `
}

// ── Admin forms ────────────────────────────────────────────────────────────

function captchaWidget(): string {
  return CAPTCHA_ENABLED ? `<div id="hcaptcha-container" style="margin:.5rem 0"></div>` : ''
}

function adminFormHTML(mode: 'login' | 'register'): string {
  const isRegister = mode === 'register'
  return `
    <form id="login-form" class="login-form" autocomplete="off" data-mode="${mode}">
      <div class="form-group">
        <label for="admin-email">${t('login.admin_email')}</label>
        <input type="email" id="admin-email" class="input"
          placeholder="name@example.com" autocomplete="email" required/>
      </div>
      <div class="form-group">
        <label for="admin-pw">${t('login.admin_password')}</label>
        <input type="password" id="admin-pw" class="input" placeholder="••••••••"
          autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="8" required/>
      </div>
      ${captchaWidget()}
      <button type="submit" class="btn btn-primary btn-full">
        ${isRegister ? t('login.admin_register') : t('login.admin_login')}
      </button>
      <div class="login-toggle">
        ${isRegister
          ? `${t('login.admin_has_account')} <a href="#" id="toggle-mode">${t('login.admin_login')}</a>`
          : `${t('login.admin_no_account')} <a href="#" id="toggle-mode">${t('login.admin_register')}</a>`
        }
      </div>
    </form>
  `
}

// ── Group forms ────────────────────────────────────────────────────────────

/** Step 1: name + game ID only */
function groupStep1HTML(): string {
  return `
    <form id="login-form" class="login-form" autocomplete="off" data-step="1">
      <div class="form-group">
        <label for="group-name">${t('login.group_name')}</label>
        <input type="text" id="group-name" class="input"
          placeholder="${t('login.group_name_hint')}" maxlength="40"/>
      </div>
      <div class="form-group">
        <label for="group-gameid">${t('login.group_gameid')}</label>
        <input type="text" id="group-gameid" class="input"
          placeholder="${t('login.group_gameid_hint')}" autocomplete="off"/>
        <div class="form-help" id="gameid-feedback"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">${t('login.group_btn')}</button>
    </form>
  `
}

/** Step 2: PIN entry for existing group */
function groupPinFormHTML(name: string, gameId: string): string {
  return `
    <form id="login-form" class="login-form" autocomplete="off" data-step="2"
      data-name="${encodeURIComponent(name)}" data-gameid="${gameId}">
      <div class="alert alert-info" style="margin-bottom:.75rem">
        <strong>${name}</strong> – ${t('login.group_pin_hint')}
      </div>
      <div class="form-group">
        <label for="group-pin">${t('login.group_pin')}</label>
        <input type="text" id="group-pin" class="input input-sm"
          inputmode="numeric" pattern="[0-9]{4}" maxlength="4"
          placeholder="••••" autocomplete="off"/>
      </div>
      <button type="submit" class="btn btn-primary btn-full">${t('login.group_btn_login')}</button>
      <div style="margin-top:.5rem;text-align:center">
        <a href="#" id="back-to-step1" style="font-size:.8rem;color:var(--color-muted)">← ${t('login.game_id_change')}</a>
      </div>
    </form>
  `
}

/** PIN reveal screen for new groups */
function pinRevealHTML(pin: string, name: string, gameId: string): string {
  return `
    <div class="pin-reveal" data-name="${encodeURIComponent(name)}" data-gameid="${gameId}">
      <h3>${t('login.pin_reveal_title')}</h3>
      <p style="margin:.75rem 0">${t('login.pin_reveal_body')}</p>
      <div class="pin-display">${pin}</div>
      <p style="margin:.5rem 0;font-size:.8rem;color:var(--color-muted)">${t('login.pin_reveal_hint')} <strong>${pin}</strong></p>
      <button class="btn btn-primary btn-full" id="btn-pin-confirm" style="margin-top:1rem">
        ${t('login.pin_reveal_btn')}
      </button>
    </div>
  `
}

// ── Viewer form ────────────────────────────────────────────────────────────

function viewerFormHTML(): string {
  return `
    <form id="login-form" class="login-form" autocomplete="off">
      <div class="form-group">
        <label for="viewer-group">${t('login.viewer_group')}</label>
        <input type="text" id="viewer-group" class="input" placeholder="${t('login.viewer_group')}"/>
      </div>
      <div class="form-group">
        <label for="viewer-gameid">${t('login.viewer_gameid')}</label>
        <input type="text" id="viewer-gameid" class="input" placeholder="${t('login.group_gameid_hint')}"/>
      </div>
      <button type="submit" class="btn btn-primary btn-full">${t('login.viewer_btn')}</button>
    </form>
  `
}

// ── Feedback ───────────────────────────────────────────────────────────────

function showError(msg: string): void {
  document.getElementById('login-error')!.innerHTML = alertHTML('error', msg)
  document.getElementById('login-info')!.innerHTML  = ''
}

function showInfo(msg: string): void {
  document.getElementById('login-info')!.innerHTML  = alertHTML('info', msg)
  document.getElementById('login-error')!.innerHTML = ''
}

function clearFeedback(): void {
  document.getElementById('login-error')!.innerHTML = ''
  document.getElementById('login-info')!.innerHTML  = ''
}

function attachGameIdFeedback(inputId: string): void {
  const input    = document.getElementById(inputId) as HTMLInputElement | null
  const feedback = document.getElementById('gameid-feedback')
  if (!input || !feedback) return
  input.addEventListener('input', () => {
    const val  = input.value.trim()
    const lang = getLang() as LangCode
    if (!val) { feedback.textContent = ''; return }
    const result = parseGameId(val, lang)
    if (!result) {
      feedback.style.color = 'var(--color-danger)'
      feedback.textContent  = t('login.error_game_id_invalid')
      return
    }
    feedback.style.color = 'var(--color-success)'
    const corrections = result.corrections
      .map(c => t('gameid.corrected', { input: c.input, matched: c.matched })).join(' · ')
    feedback.textContent = `✓ ${renderGameId(result.indices, lang)}${corrections ? '  (' + corrections + ')' : ''}`
  })
}

// ── Listeners ─────────────────────────────────────────────────────────────

function attachListeners(root: HTMLElement): void {
  let activeRole: 'admin' | 'group' | 'viewer' = 'admin'
  let adminMode:  'login' | 'register'          = 'login'

  function showArea(html: string): void {
    const area = document.getElementById('login-form-area')
    if (area) area.innerHTML = html
  }

  function switchAdmin(mode: 'login' | 'register', prefillEmail?: string): void {
    adminMode = mode
    _hcaptchaWidgetId = null
    showArea(adminFormHTML(mode))
    if (prefillEmail) {
      const el = document.getElementById('admin-email') as HTMLInputElement | null
      if (el) el.value = prefillEmail
    }
    attachToggle()
    void renderHCaptcha()
    attachAdminFormListener(mode)
  }

  _switchToLogin = (prefillEmail?: string) => switchAdmin('login', prefillEmail)

  function attachToggle(): void {
    document.getElementById('toggle-mode')?.addEventListener('click', e => {
      e.preventDefault(); clearFeedback()
      switchAdmin(adminMode === 'login' ? 'register' : 'login')
    })
  }

  root.querySelectorAll<HTMLButtonElement>('.tab-btn[data-role]').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      activeRole = btn.dataset['role'] as typeof activeRole
      clearFeedback()
      if (activeRole === 'admin')  { switchAdmin(adminMode) }
      if (activeRole === 'group')  { showArea(groupStep1HTML()); attachGameIdFeedback('group-gameid'); attachGroupStep1Listener() }
      if (activeRole === 'viewer') { showArea(viewerFormHTML()); attachViewerListener() }
    })
  })

  attachToggle()
  void renderHCaptcha()
  attachAdminFormListener(adminMode)
}

// ── Admin auth ─────────────────────────────────────────────────────────────

function attachAdminFormListener(mode: 'login' | 'register'): void {
  const form = document.getElementById('login-form')
  if (!form) return
  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFeedback()
    await (mode === 'login' ? loginAdmin() : registerAdmin())
  })
}

async function registerAdmin(): Promise<void> {
  const email = (document.getElementById('admin-email') as HTMLInputElement | null)?.value?.trim() ?? ''
  const pw    = (document.getElementById('admin-pw')    as HTMLInputElement | null)?.value ?? ''
  if (!email) { showError(t('login.error_email_required'));    return }
  if (!pw)    { showError(t('login.error_password_required')); return }
  const captchaToken = getCaptchaToken()
  if (CAPTCHA_ENABLED && !captchaToken) { showError('Please complete the CAPTCHA.'); return }
  const { error } = await getSupabaseClient().auth.signUp(
    captchaToken ? { email, password: pw, options: { captchaToken } } : { email, password: pw }
  )
  if (error) { showError(error.message); resetCaptcha(); return }
  _switchToLogin?.(email)
  showInfo('✅ Registration successful – please enter your password and log in.')
}

async function loginAdmin(): Promise<void> {
  const email = (document.getElementById('admin-email') as HTMLInputElement | null)?.value?.trim() ?? ''
  const pw    = (document.getElementById('admin-pw')    as HTMLInputElement | null)?.value ?? ''
  if (!email) { showError(t('login.error_email_required'));    return }
  if (!pw)    { showError(t('login.error_password_required')); return }
  const captchaToken = getCaptchaToken()
  if (CAPTCHA_ENABLED && !captchaToken) { showError('Please complete the CAPTCHA.'); return }
  const { data, error } = await getSupabaseClient().auth.signInWithPassword(
    captchaToken ? { email, password: pw, options: { captchaToken } } : { email, password: pw }
  )
  if (error || !data.user) { showError(t('login.error_wrong_password')); resetCaptcha(); return }
  const token = await generateSessionToken('admin', '', data.user.id)
  setSession({ login_as: 'admin', gruppe: '', token, spiel_id: '' })
  store.set({ session: { login_as: 'admin', gruppe: '', token, spiel_id: '' }, activeTab: 'home' })
  navigate('home')
}

// ── Group: Step 1 (name + game ID) ────────────────────────────────────────

function attachGroupStep1Listener(): void {
  const form = document.getElementById('login-form')
  if (!form) return
  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFeedback()
    await handleGroupStep1()
  })
}

async function handleGroupStep1(): Promise<void> {
  const lang  = getLang() as LangCode
  const name  = (document.getElementById('group-name')   as HTMLInputElement | null)?.value?.trim() ?? ''
  const rawId = (document.getElementById('group-gameid') as HTMLInputElement | null)?.value?.trim() ?? ''

  if (!name || name.length > 40) { showError(t('login.error_name_required'));   return }
  if (!rawId)                     { showError(t('login.error_gameid_required')); return }

  const parsed = parseGameId(rawId, lang)
  if (!parsed) { showError(t('login.error_game_id_invalid')); return }

  const canonicalId = indicesToKey(parsed.indices)
  const cfg = await loadConfig(canonicalId)
  if (!cfg) { showError(t('login.error_game_not_found')); return }

  const exists = await gruppeExistiert(canonicalId, name)

  if (exists) {
    // Group already registered → show PIN entry
    const area = document.getElementById('login-form-area')
    if (area) area.innerHTML = groupPinFormHTML(name, canonicalId)
    attachGroupPinListener(name, canonicalId, cfg)
  } else {
    // New group → check capacity, generate PIN, show reveal screen
    const gruppen = await getGruppen(canonicalId)
    if (gruppen.length >= cfg.anzahl_gruppen) { showError(t('login.error_game_full')); return }

    const pin     = generatePin()
    const pinHash = await hashPin(pin)

    try {
      await createGruppe(canonicalId, name, pinHash)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'GAME_FULL')    { showError(t('login.error_game_full')); return }
      if (msg === 'GROUP_EXISTS') {
        // Race: another device registered same name – fall through to PIN screen
        const area = document.getElementById('login-form-area')
        if (area) area.innerHTML = groupPinFormHTML(name, canonicalId)
        attachGroupPinListener(name, canonicalId, cfg)
        return
      }
      showError(msg || 'Error joining game.'); return
    }

    // Show PIN reveal screen
    const area = document.getElementById('login-form-area')
    if (area) area.innerHTML = pinRevealHTML(pin, name, canonicalId)
    attachPinRevealListener(name, canonicalId, cfg)
  }
}

// ── Group: PIN reveal (new group) ─────────────────────────────────────────

function attachPinRevealListener(name: string, canonicalId: string, cfg: any): void {
  document.getElementById('btn-pin-confirm')?.addEventListener('click', async () => {
    await completeGroupLogin(name, canonicalId, cfg)
  })
}

// ── Group: Step 2 (PIN entry for existing group) ──────────────────────────

function attachGroupPinListener(name: string, canonicalId: string, cfg: any): void {
  document.getElementById('back-to-step1')?.addEventListener('click', e => {
    e.preventDefault()
    const area = document.getElementById('login-form-area')
    if (area) area.innerHTML = groupStep1HTML()
    attachGameIdFeedback('group-gameid')
    attachGroupStep1Listener()
  })

  const form = document.getElementById('login-form')
  if (!form) return
  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFeedback()
    const pin = (document.getElementById('group-pin') as HTMLInputElement | null)?.value?.trim() ?? ''
    if (!pin) { showError(t('login.error_pin_required')); return }

    const ok = await verifyGroupPin(canonicalId, name, pin)
    if (!ok) { showError(t('login.error_wrong_pin')); return }

    await completeGroupLogin(name, canonicalId, cfg)
  })
}

// ── Shared: complete group session ────────────────────────────────────────

async function completeGroupLogin(name: string, canonicalId: string, cfg: any): Promise<void> {
  const token    = await generateSessionToken('groupadmin', name, canonicalId)
  const runTimes = await getRunTimes(canonicalId)
  setSession({ login_as: 'groupadmin', gruppe: name, token, spiel_id: canonicalId })
  store.set({ session: { login_as: 'groupadmin', gruppe: name, token, spiel_id: canonicalId },
              cfg, runTimes, activeTab: 'home' })
  navigate('home')
}

// ── Viewer ─────────────────────────────────────────────────────────────────

function attachViewerListener(): void {
  const form = document.getElementById('login-form')
  if (!form) return
  form.addEventListener('submit', async e => { e.preventDefault(); clearFeedback(); await loginViewer() })
}

async function loginViewer(): Promise<void> {
  const lang  = getLang() as LangCode
  const name  = (document.getElementById('viewer-group')  as HTMLInputElement | null)?.value?.trim() ?? ''
  const rawId = (document.getElementById('viewer-gameid') as HTMLInputElement | null)?.value?.trim() ?? ''
  if (!name || !rawId) { showError(t('login.error_gameid_required')); return }

  const parsed = parseGameId(rawId, lang)
  if (!parsed) { showError(t('login.error_game_id_invalid')); return }

  const canonicalId = indicesToKey(parsed.indices)
  const cfg = await loadConfig(canonicalId)
  if (!cfg) { showError(t('login.error_game_not_found')); return }
  if (!await gruppeExistiert(canonicalId, name)) { showError(t('login.error_game_not_found')); return }

  const token    = await generateSessionToken('viewer', name, canonicalId)
  const runTimes = await getRunTimes(canonicalId)
  setSession({ login_as: 'viewer', gruppe: name, token, spiel_id: canonicalId })
  store.set({ session: { login_as: 'viewer', gruppe: name, token, spiel_id: canonicalId },
              cfg, runTimes, activeTab: 'home' })
  navigate('home')
}
