/**
 * Home page – Game Master / Group / Viewer
 */

import { t, getLang } from '@i18n'
import { DEFAULT_CONFIG, type StaticConfig } from '@core/config'
import { start_algorithmus } from '@core/algorithmus'
import {
  getGroupadminData, getGruppen, getRunTimes, gruppenBereitFuerPeriode,
  loadConfig, loadGamedata, archiveGame, saveConfig, saveGamedata,
  saveGroupadminInput, setRunTimes, createGame, listMyGames,
} from '@store/supabase'
import {
  alertHTML, attachSliderDisplay, loadingHTML,
  metricCard, periodBadge, sliderHTML, tableHTML,
} from '../components/widgets'
import { formatEuro } from '../components/charts'
import { navigate } from '../router'
import { showNotification, store } from '../state'
import {
  generateGameId, indicesToKey, keyToIndices, renderGameId, renderCompact,
  type LangCode,
} from '@core/gameId'
import { getSupabaseClient } from '@store/supabase'

let _pollTimer: ReturnType<typeof setInterval> | null = null
function stopPolling(): void {
  if (_pollTimer !== null) { clearInterval(_pollTimer); _pollTimer = null }
}

export function render(root: HTMLElement): void {
  stopPolling()
  const { session } = store.get()
  if (!session) return
  if (session.login_as === 'admin')           void renderAdmin(root)
  else if (session.login_as === 'groupadmin') void renderGroupAdmin(root)
  else                                        void renderViewer(root)
}

// ── Game ID banner ─────────────────────────────────────────────────────────

function gameIdBannerHTML(gameId: string): string {
  const indices = keyToIndices(gameId)
  if (!indices) return ''
  const lang    = getLang() as LangCode
  const words   = renderGameId(indices, lang)
  const compact = renderCompact(indices)
  return `
    <div class="game-id-banner">
      <div class="game-id-banner__label">🎮 ${t('gameid.display_hint')}</div>
      <div class="game-id-banner__words" id="game-id-words">${words}</div>
      <div class="game-id-banner__compact">
        <code>${compact.toUpperCase()}</code>
        <button class="btn-copy" id="btn-copy-id" title="${t('home.btn_copy')}">📋</button>
      </div>
    </div>
  `
}

// ── Admin ──────────────────────────────────────────────────────────────────

async function renderAdmin(root: HTMLElement): Promise<void> {
  root.innerHTML = loadingHTML()

  const { session } = store.get()
  if (!session) return

  const myGames = await listMyGames()
  if (myGames.length === 0) { renderCreateGame(root); return }

  const activeGame   = myGames[0]!
  const gameId       = activeGame.id
  const cfg          = activeGame.config as StaticConfig
  const runTimes     = await getRunTimes(gameId)
  const gruppen      = await getGruppen(gameId)
  const gd           = await getGroupadminData(gameId)
  const ready        = await gruppenBereitFuerPeriode(gameId, runTimes, cfg.anzahl_gruppen)
  const periodGd     = gd.filter((g: any) => g.Jahr === runTimes)
  const readyCount   = periodGd.length
  const pollInterval = parseInt(localStorage.getItem('planspiel_poll_interval') ?? '5')

  store.set({ spielId: gameId, cfg, runTimes, gruppen: gruppen.map((g: any) => g.name) })

  root.innerHTML = `
    ${gameIdBannerHTML(gameId)}

    <div class="page-header">
      <h2>⚙️ ${t('home.title_admin')}</h2>
      ${periodBadge(runTimes, cfg.anzahl_durchlauefe)}
      <div class="poll-status">
        <span id="poll-indicator" class="poll-dot"></span>
        <span id="poll-countdown" class="poll-text"></span>
        <label class="poll-interval-label">
          ${t('home.refresh')}
          <select id="poll-interval-select" class="input input-xs">
            ${[3,5,10,15,30].map(s =>
              `<option value="${s}" ${s === pollInterval ? 'selected' : ''}>${s}s</option>`
            ).join('')}
            <option value="0" ${pollInterval === 0 ? 'selected' : ''}>${t('home.refresh_off')}</option>
          </select>
        </label>
      </div>
    </div>

    <div class="metrics-row">
      ${metricCard(t('home.metric_round'),        runTimes > 0 ? String(runTimes) : '–')}
      ${metricCard(t('home.metric_groups'),        String(gruppen.length))}
      ${metricCard(t('home.metric_max_rounds'),    String(cfg.anzahl_durchlauefe))}
      ${metricCard(t('home.metric_groups_ready'),  runTimes > 0 ? `${readyCount}/${cfg.anzahl_gruppen}` : '–')}
    </div>

    <div id="perioden-panel">
      ${periodenPanelHTML(runTimes, ready, readyCount, cfg, periodGd)}
    </div>

    <details class="panel" ${runTimes === 0 ? 'open' : ''}>
      <summary><strong>🎛️ ${t('home.settings_title')}</strong></summary>
      <div class="settings-form">${settingsFormHTML(cfg)}</div>
    </details>

    <div id="gruppen-panel">${gruppenPanelHTML(gruppen)}</div>

    <div class="panel panel-danger">
      <h3>${t('home.danger_zone')}</h3>
      <p style="margin-bottom:.75rem;font-size:.875rem;color:var(--color-muted)">
        ${t('home.danger_zone_hint')}
      </p>
      <div class="btn-row">
        <button class="btn btn-outline-danger" id="btn-new-game">${t('home.btn_new_game')}</button>
        <button class="btn btn-outline-danger" id="btn-archive-game">${t('home.btn_archive_game')}</button>
      </div>
    </div>
  `

  attachAdminListeners(cfg, gameId, runTimes)
  attachCopyButton(gameId)
  startPolling(gameId, cfg, runTimes, pollInterval)
}

// ── Create game ────────────────────────────────────────────────────────────

function renderCreateGame(root: HTMLElement): void {
  const indices = generateGameId()
  const gameId  = indicesToKey(indices)
  const lang    = getLang() as LangCode
  const words   = renderGameId(indices, lang)
  const compact = renderCompact(indices)

  root.innerHTML = `
    <div class="page-header"><h2>${t('home.new_game_title')}</h2></div>

    <div class="panel panel-success">
      <h3>${t('home.new_game_id_title')}</h3>
      <p style="margin-bottom:.75rem;color:var(--color-muted)">${t('home.new_game_id_hint')}</p>
      <div class="game-id-preview">
        <div class="game-id-preview__words">${words}</div>
        <div class="game-id-preview__meta">
          <code class="game-id-preview__compact">${compact.toUpperCase()}</code>
          <button class="btn-copy" id="btn-copy-preview" title="${t('home.btn_copy')}">📋</button>
        </div>
      </div>
      <p style="margin-top:.5rem;font-size:.8rem;color:var(--color-muted)">${t('home.new_game_id_random')}</p>
    </div>

    <details class="panel" open>
      <summary><strong>🎛️ ${t('home.settings_title')}</strong></summary>
      <div class="settings-form">${settingsFormHTML(DEFAULT_CONFIG)}</div>
    </details>

    <div class="btn-row" style="margin-top:1rem">
      <button class="btn btn-primary btn-lg" id="btn-create-game">${t('home.btn_start_game')}</button>
      <button class="btn btn-secondary"      id="btn-regenerate-id">${t('home.btn_new_id')}</button>
    </div>
    <div id="create-error"></div>
  `

  document.getElementById('btn-copy-preview')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(words)
    const btn = document.getElementById('btn-copy-preview')
    if (btn) { btn.textContent = '✅'; setTimeout(() => { btn.textContent = '📋' }, 1500) }
  })

  document.getElementById('btn-regenerate-id')?.addEventListener('click', () => {
    const target = document.getElementById('app') ?? document.body
    renderCreateGame(target)
  })

  document.getElementById('btn-create-game')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-create-game') as HTMLButtonElement | null
    if (btn) { btn.disabled = true; btn.textContent = t('home.btn_creating') }

    const newCfg = readConfigFromForm(DEFAULT_CONFIG)
    const { data: { user } } = await getSupabaseClient().auth.getUser()
    if (!user) { showNotification('error', t('home.not_logged_in')); return }

    await createGame(gameId, user.id, newCfg)
    await setRunTimes(gameId, 1)

    store.set({ spielId: gameId, cfg: newCfg, runTimes: 1 })
    showNotification('success', t('home.game_created', { words }))
    navigate('home')
  })

  attachAllSliderDisplays()
}

function attachCopyButton(gameId: string): void {
  document.getElementById('btn-copy-id')?.addEventListener('click', () => {
    const indices = keyToIndices(gameId)
    if (!indices) return
    void navigator.clipboard.writeText(renderGameId(indices, getLang() as LangCode))
    const btn = document.getElementById('btn-copy-id')
    if (btn) { btn.textContent = '✅'; setTimeout(() => { btn.textContent = '📋' }, 1500) }
  })
}

// ── Period panel ───────────────────────────────────────────────────────────

function periodenPanelHTML(
  runTimes: number, ready: boolean, readyCount: number,
  cfg: StaticConfig, periodGd: any[],
): string {
  if (runTimes === 0) return ''
  return `
    <div class="panel ${ready ? 'panel-success' : ''}">
      <h3>▶️ ${t('home.period_control', { round: runTimes })}</h3>
      ${ready
        ? `<p style="margin-bottom:.75rem">${t('home.all_ready', { count: cfg.anzahl_gruppen })}</p>`
        : `<p style="margin-bottom:.75rem">${t('home.waiting', { ready: readyCount, total: cfg.anzahl_gruppen })}</p>`
      }
      ${periodGd.length > 0
        ? tableHTML(
            [t('overview.col_group'), t('overview.col_premium_adj'), t('overview.col_dividend')],
            periodGd.map((g: any) => [
              g.Gruppe,
              `${(g.Praemienanpassung * 100).toFixed(1)}%`,
              formatEuro(g.Dividendenausschuettung),
            ]),
          )
        : ''
      }
      <div style="margin-top:1rem">
        <button class="btn btn-primary btn-lg" id="btn-starte-algorithmus" ${ready ? '' : 'disabled'}>
          ${t('home.btn_run_algorithm')}
        </button>
        ${!ready ? `<p class="form-help" style="margin-top:.5rem">
          ${t('home.btn_run_disabled', { count: cfg.anzahl_gruppen - readyCount })}
        </p>` : ''}
      </div>
    </div>
  `
}

function gruppenPanelHTML(gruppen: Array<{ name: string }>): string {
  if (gruppen.length === 0) return ''
  return `
    <div class="panel">
      <h3>${t('home.groups_registered')}</h3>
      ${tableHTML([t('overview.col_group')], gruppen.map(g => [g.name]))}
      <div class="form-group" style="margin-top:1rem">
        <label>${t('home.btn_delete_group')}:</label>
        <div class="input-row">
          <select id="select-delete-gruppe" class="input">
            ${gruppen.map(g => `<option value="${g.name}">${g.name}</option>`).join('')}
          </select>
          <button class="btn btn-danger" id="btn-delete-gruppe">${t('home.btn_delete_group')}</button>
        </div>
      </div>
    </div>
  `
}

// ── Settings form ──────────────────────────────────────────────────────────

function settingsFormHTML(cfg: StaticConfig): string {
  return `
    <div class="settings-grid">
      <div>
        <h4>${t('home.settings_structure')}</h4>
        ${sliderHTML({ id: 'cfg-gruppen',  label: t('home.cfg_groups'),  min: 2,  max: 8,  value: cfg.anzahl_gruppen,     step: 1 })}
        ${sliderHTML({ id: 'cfg-jahre',    label: t('home.cfg_years'),   min: 1,  max: 5,  value: cfg.anzahl_jahre,       step: 1 })}
        ${sliderHTML({ id: 'cfg-perioden', label: t('home.cfg_rounds'),  min: 1,  max: 11, value: cfg.anzahl_durchlauefe, step: 1 })}
        <label class="checkbox-label">
          <input type="checkbox" id="cfg-random" checked/>
          ${t('home.settings_random')}
        </label>
      </div>
      <div>
        <h4>${t('home.settings_expert')}</h4>
        <label class="checkbox-label">
          <input type="checkbox" id="cfg-experten"/>
          ${t('home.settings_expert_show')}
        </label>
        <div id="expert-params" style="display:none">
          ${sliderHTML({ id: 'cfg-ek',      label: t('home.cfg_equity_start'),   min: 300_000, max: 600_000, value: cfg.eigenkapital_start,     step: 10_000 })}
          ${sliderHTML({ id: 'cfg-praemie', label: t('home.cfg_premium_start'),  min: 400,     max: 1_240,   value: cfg.praemie_start,          step: 10 })}
          ${sliderHTML({ id: 'cfg-policen', label: t('home.cfg_policies_start'), min: 500,     max: 1_500,   value: cfg.policenzahl_start,      step: 10 })}
          ${sliderHTML({ id: 'cfg-minsolv', label: t('home.cfg_minsolv'),        min: 50,      max: 250,     value: cfg.MinSolv * 100,          step: 1, suffix: '%' })}
          ${sliderHTML({ id: 'cfg-maxsolv', label: t('home.cfg_maxsolv'),        min: 100,     max: 500,     value: cfg.MaxSolv * 100,          step: 1, suffix: '%' })}
          ${sliderHTML({ id: 'cfg-fixk',    label: t('home.cfg_fixcost'),        min: 40_000,  max: 120_000, value: cfg.Fixkosten,              step: 1_000 })}
          ${sliderHTML({ id: 'cfg-vark',    label: t('home.cfg_varcost'),        min: 60,      max: 180,     value: cfg.Varkosten,              step: 1 })}
          ${sliderHTML({ id: 'cfg-dmg-my',  label: t('home.cfg_dmg_mean'),       min: 300,     max: 900,     value: cfg.dmg_my,                 step: 1 })}
          ${sliderHTML({ id: 'cfg-dmg-sd',  label: t('home.cfg_dmg_sd'),         min: 1_000,   max: 3_200,   value: cfg.dmg_sd,                 step: 1 })}
          ${sliderHTML({ id: 'cfg-risk',    label: t('home.cfg_risk'),           min: 1,       max: 9,       value: cfg.Risk_StDev,             step: 0.1 })}
          ${sliderHTML({ id: 'cfg-elast',   label: t('home.cfg_elasticity'),     min: 50,      max: 150,     value: cfg.Preiselastizitat * 100, step: 1, suffix: '%' })}
        </div>
      </div>
    </div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="btn btn-secondary" id="btn-save-default">💾 ${t('home.btn_save_default')}</button>
    </div>
  `
}

function readConfigFromForm(current: StaticConfig): StaticConfig {
  const v = (id: string): number =>
    parseFloat((document.getElementById(id) as HTMLInputElement | null)?.value ?? '0')
  const expertOn = (document.getElementById('cfg-experten') as HTMLInputElement | null)?.checked ?? false
  return {
    ...current,
    anzahl_gruppen:     v('cfg-gruppen') || current.anzahl_gruppen,
    anzahl_jahre:       v('cfg-jahre')   || current.anzahl_jahre,
    anzahl_durchlauefe: v('cfg-perioden')|| current.anzahl_durchlauefe,
    ...(expertOn ? {
      eigenkapital_start: v('cfg-ek'),
      praemie_start:      v('cfg-praemie'),
      policenzahl_start:  v('cfg-policen'),
      MinSolv:            v('cfg-minsolv') / 100,
      MaxSolv:            v('cfg-maxsolv') / 100,
      Fixkosten:          v('cfg-fixk'),
      Varkosten:          v('cfg-vark'),
      dmg_my:             v('cfg-dmg-my'),
      dmg_sd:             v('cfg-dmg-sd'),
      Risk_StDev:         v('cfg-risk'),
      Preiselastizitat:   v('cfg-elast') / 100,
    } : {}),
  }
}

function attachAllSliderDisplays(): void {
  ;['cfg-gruppen','cfg-jahre','cfg-perioden','cfg-ek','cfg-praemie',
    'cfg-policen','cfg-fixk','cfg-vark','cfg-dmg-my','cfg-dmg-sd',
  ].forEach(id => attachSliderDisplay(id))
  attachSliderDisplay('cfg-minsolv', '%')
  attachSliderDisplay('cfg-maxsolv', '%')
  attachSliderDisplay('cfg-elast',   '%')
  attachSliderDisplay('cfg-risk',    '')
}

// ── Polling ────────────────────────────────────────────────────────────────

function startPolling(gameId: string, cfg: StaticConfig, runTimes: number, intervalSecs: number): void {
  stopPolling()
  if (intervalSecs === 0) {
    const dot = document.getElementById('poll-indicator')
    if (dot) dot.classList.add('poll-dot-off')
    return
  }
  let countdown = intervalSecs
  const tick = (): void => {
    const el = document.getElementById('poll-countdown')
    if (el) el.textContent = `(${countdown}s)`
    countdown--
    if (countdown < 0) { countdown = intervalSecs; void refreshPeriodenPanel(gameId, cfg, runTimes) }
  }
  tick()
  _pollTimer = setInterval(tick, 1_000)
}

async function refreshPeriodenPanel(gameId: string, cfg: StaticConfig, runTimes: number): Promise<void> {
  const [gruppen, gd, ready] = await Promise.all([
    getGruppen(gameId),
    getGroupadminData(gameId),
    gruppenBereitFuerPeriode(gameId, runTimes, cfg.anzahl_gruppen),
  ])
  const periodGd   = gd.filter((g: any) => g.Jahr === runTimes)
  const readyCount = periodGd.length

  const panel = document.getElementById('perioden-panel')
  if (panel) {
    panel.innerHTML = periodenPanelHTML(runTimes, ready, readyCount, cfg, periodGd)
    document.getElementById('btn-starte-algorithmus')?.addEventListener('click', async () => {
      await runAlgorithm(gameId, cfg, runTimes)
    })
  }
  const gPanel = document.getElementById('gruppen-panel')
  if (gPanel) { gPanel.innerHTML = gruppenPanelHTML(gruppen); attachGroupListeners(gameId) }

  const dot = document.getElementById('poll-indicator')
  if (dot) { dot.classList.add('poll-dot-pulse'); setTimeout(() => dot.classList.remove('poll-dot-pulse'), 400) }
}

// ── Listeners ─────────────────────────────────────────────────────────────

function attachGroupListeners(gameId: string): void {
  document.getElementById('btn-delete-gruppe')?.addEventListener('click', async () => {
    const sel  = document.getElementById('select-delete-gruppe') as HTMLSelectElement | null
    const name = sel?.value
    if (!name || !confirm(t('home.confirm_delete_group', { name }))) return
    const { deleteGruppe } = await import('@store/supabase')
    await deleteGruppe(gameId, name)
    showNotification('success', t('home.notify_group_deleted', { name }))
    navigate('home')
  })
}

function attachAdminListeners(cfg: StaticConfig, gameId: string, runTimes: number): void {
  attachAllSliderDisplays()

  document.getElementById('cfg-experten')?.addEventListener('change', e => {
    const el = document.getElementById('expert-params')
    if (el) el.style.display = (e.target as HTMLInputElement).checked ? 'block' : 'none'
  })

  document.getElementById('btn-save-default')?.addEventListener('click', async () => {
    const newCfg = readConfigFromForm(cfg)
    await saveConfig(gameId, newCfg)
    store.set({ cfg: newCfg })
    showNotification('success', t('home.notify_saved'))
  })

  document.getElementById('btn-starte-algorithmus')?.addEventListener('click', async () => {
    await runAlgorithm(gameId, cfg, runTimes)
  })

  attachGroupListeners(gameId)

  // Archive game – releases the 4-word ID for reuse, navigates to create-game screen
  document.getElementById('btn-archive-game')?.addEventListener('click', async () => {
    if (!confirm(t('home.confirm_archive'))) return
    stopPolling()
    await archiveGame(gameId)
    store.set({ spielId: '', cfg: null, runTimes: 0, gamedata: null, gruppen: [] })
    showNotification('info', t('home.notify_archived'))
    navigate('home')
  })

  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    const root = document.getElementById('page-content') ?? document.getElementById('app')
    if (root) renderCreateGame(root)
  })

  document.getElementById('poll-interval-select')?.addEventListener('change', e => {
    const secs = parseInt((e.target as HTMLSelectElement).value)
    localStorage.setItem('planspiel_poll_interval', String(secs))
    startPolling(gameId, cfg, runTimes, secs)
  })
}

async function runAlgorithm(gameId: string, cfg: StaticConfig, runTimes: number): Promise<void> {
  stopPolling()
  const btn = document.getElementById('btn-starte-algorithmus') as HTMLButtonElement | null
  if (btn) { btn.textContent = t('home.computing'); btn.disabled = true }

  const gd       = await getGroupadminData(gameId)
  const gamedata = await loadGamedata(gameId)
  const random   = (document.getElementById('cfg-random') as HTMLInputElement | null)?.checked ?? true
  const periodGd = gd.filter((g: any) => g.Jahr === runTimes)

  let result = start_algorithmus(periodGd, gamedata, random, cfg, false, false)
  for (let j = 1; j < cfg.anzahl_jahre; j++) {
    result = start_algorithmus(periodGd, result, random, cfg, true, true)
  }

  await saveGamedata(gameId, result)
  await setRunTimes(gameId, runTimes + 1)
  store.set({ gamedata: result, runTimes: runTimes + 1 })
  showNotification('success', t('home.notify_period_done', { round: runTimes }))
  navigate('home')
}

// ── Group admin ────────────────────────────────────────────────────────────

async function renderGroupAdmin(root: HTMLElement): Promise<void> {
  root.innerHTML = loadingHTML()
  const { session } = store.get()
  if (!session) return

  const spielId  = session.spiel_id
  const cfg      = (await loadConfig(spielId)) ?? DEFAULT_CONFIG
  const runTimes = await getRunTimes(spielId)
  const gamedata = await loadGamedata(spielId)
  store.set({ spielId, cfg, runTimes })

  const gruppe = session.gruppe

  if (runTimes === 0) {
    root.innerHTML = `
      <div class="page-header"><h2>📋 ${gruppe}</h2></div>
      ${alertHTML('info', t('home.game_not_started'))}
    `
    return
  }

  if (runTimes > cfg.anzahl_durchlauefe) {
    root.innerHTML = `
      <div class="page-header"><h2>📋 ${gruppe}</h2></div>
      ${alertHTML('success', t('home.game_finished'))}
      <button class="btn btn-primary" id="btn-goto-sieger">${t('home.btn_goto_ranking')}</button>
    `
    document.getElementById('btn-goto-sieger')?.addEventListener('click', () => navigate('sieger'))
    return
  }

  let oldPremium = cfg.praemie_start, oldDividend = 0, maxDiv = 100_000, minDiv = 0
  if (gamedata) {
    const lastYear = Math.max(...gamedata.map(r => r.Jahr))
    const current  = gamedata.find(r => r.Gruppe === gruppe && r.Jahr === lastYear)
    if (current) {
      oldPremium  = current.Praemie
      oldDividend = current.Dividendenausschuettung
      maxDiv      = current.max_div_next_round
      minDiv      = current.min_div_next_round
    }
  }

  root.innerHTML = `
    <div class="page-header">
      <h2>📋 ${t('home.title_group')} – ${gruppe}</h2>
      ${periodBadge(runTimes, cfg.anzahl_durchlauefe)}
    </div>
    <div class="panel">
      <div class="form-section">
        ${sliderHTML({ id: 'inp-praemie', label: t('home.input_premium'),
          min: -10, max: 10, value: 0, step: 1, suffix: '%',
          help: t('home.input_premium_hint', { value: oldPremium.toFixed(2) }) })}
        <div class="neue-praemie-info">
          ${t('home.new_premium')} <strong id="neue-praemie-display">${oldPremium.toFixed(2)} €</strong>
        </div>
      </div>
      <div class="form-section">
        ${sliderHTML({ id: 'inp-dividende', label: t('home.input_dividend'),
          min: Math.floor(minDiv),
          max: Math.max(Math.ceil(maxDiv), Math.floor(minDiv) + 1_000),
          value: Math.floor(minDiv), step: 1_000, suffix: ' €',
          help: t('home.input_dividend_hint', {
            old: oldDividend.toFixed(0),
            min: minDiv.toFixed(0),
            max: maxDiv.toFixed(0),
          }) })}
      </div>
      <button class="btn btn-primary btn-lg btn-full" id="btn-save-inputs">
        ${t('home.btn_save_inputs')}
      </button>
      <div id="save-result"></div>
    </div>
  `

  const premiumSlider = document.getElementById('inp-praemie') as HTMLInputElement | null
  const newDisplay    = document.getElementById('neue-praemie-display')
  premiumSlider?.addEventListener('input', () => {
    const newVal = oldPremium * (1 + parseFloat(premiumSlider.value) / 100)
    if (newDisplay) newDisplay.textContent = `${newVal.toFixed(2)} €`
  })
  attachSliderDisplay('inp-praemie', '%')
  attachSliderDisplay('inp-dividende', ' €', v => Math.round(v / 1000) * 1000)

  document.getElementById('btn-save-inputs')?.addEventListener('click', async () => {
    const pct      = parseFloat((document.getElementById('inp-praemie')   as HTMLInputElement).value) / 100
    const dividend = parseFloat((document.getElementById('inp-dividende') as HTMLInputElement).value)
    await saveGroupadminInput(spielId, {
      Gruppe: gruppe, Praemienanpassung: pct,
      Dividendenausschuettung: dividend, Jahr: runTimes,
    })
    const res = document.getElementById('save-result')
    if (res) res.innerHTML = alertHTML('success', t('home.inputs_saved'))
    setTimeout(() => { if (res) res.innerHTML = '' }, 3000)
  })
}

// ── Viewer ─────────────────────────────────────────────────────────────────

async function renderViewer(root: HTMLElement): Promise<void> {
  const { session } = store.get()
  if (!session) return
  const spielId  = session.spiel_id
  const cfg      = (await loadConfig(spielId)) ?? DEFAULT_CONFIG
  const runTimes = await getRunTimes(spielId)
  store.set({ spielId, cfg, runTimes })
  root.innerHTML = `
    <div class="page-header"><h2>👁️ ${t('home.title_viewer')} – ${session.gruppe}</h2></div>
    <div class="panel">
      ${runTimes === 0
        ? alertHTML('info', t('home.game_not_started'))
        : `<div class="metrics-row">
             ${metricCard(t('home.metric_round'), String(runTimes))}
             ${metricCard(t('home.metric_max_rounds'), String(cfg.anzahl_durchlauefe))}
           </div>
           ${alertHTML('info', t('home.viewer_info'))}`
      }
    </div>
  `
}
