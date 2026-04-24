/**
 * Group analysis page.
 */

import { t } from '@i18n'
import type { GameData } from '@core/algorithmus'
import { solvencyColour } from '@core/config'
import { loadGamedata } from '@store/supabase'
import { renderLineChart, renderSparkline, formatEuro, formatPct, type ChartSeries } from '../components/charts'
import { groupSparkboxes, loadingHTML, tableHTML } from '../components/widgets'
import { store } from '../state'

export async function render(root: HTMLElement): Promise<void> {
  root.innerHTML = loadingHTML()

  const { spielId, session, cfg } = store.get()
  if (!cfg || !session) return

  const gamedata = await loadGamedata(spielId)
  if (!gamedata || gamedata.length === 0) {
    root.innerHTML = `<div class="panel"><p>${t('analyse_group.no_data')}</p></div>`
    return
  }

  store.set({ gamedata })

  const groups = [...new Set(gamedata.map(r => r.Gruppe))].sort()

  const selectedGroup = session.login_as === 'admin'
    ? (store.get() as any)['adminViewGroup'] ?? groups[0]!
    : session.gruppe

  root.innerHTML = `
    <div class="page-header">
      <h2>📈 ${t('analyse_group.title')}</h2>
      ${session.login_as === 'admin' ? `
        <div class="select-group-row">
          <label>${t('analyse_group.group_label')}</label>
          <select id="select-gruppe" class="input input-sm">
            ${groups.map(g => `<option value="${g}" ${g === selectedGroup ? 'selected' : ''}>${g}</option>`).join('')}
          </select>
        </div>
      ` : `<div class="group-label">${selectedGroup}</div>`}
    </div>
    <div id="gruppe-content"></div>
  `

  if (session.login_as === 'admin') {
    document.getElementById('select-gruppe')?.addEventListener('change', e => {
      const g = (e.target as HTMLSelectElement).value
      ;(store.get() as any)['adminViewGroup'] = g
      renderGroupContent(document.getElementById('gruppe-content')!, gamedata, g, cfg)
    })
  }

  renderGroupContent(document.getElementById('gruppe-content')!, gamedata, selectedGroup, cfg)
}

function renderGroupContent(
  el:       HTMLElement,
  gamedata: GameData,
  gruppe:   string,
  cfg:      ReturnType<typeof store.get>['cfg'],
): void {
  if (!cfg) return

  const gd = gamedata
    .filter(r => r.Gruppe === gruppe)
    .sort((a, b) => a.Jahr - b.Jahr)

  if (gd.length === 0) {
    el.innerHTML = `<p>${t('analyse_group.no_group_data')}</p>`
    return
  }

  const latest        = gd[gd.length - 1]!
  const totalPolicies = gamedata
    .filter(r => r.Jahr === latest.Jahr)
    .reduce((s, r) => s + r.Policenzahl, 0)
  const marketShare   = latest.Policenzahl / totalPolicies
  const avgProfit     = gd.slice(-cfg.anzahl_jahre)
    .reduce((s, r) => s + r.Versicherungstechnisches_Ergebnis, 0) / cfg.anzahl_jahre

  el.innerHTML = `
    ${groupSparkboxes(marketShare, latest.Solvenzquote, latest.Dividendenausschuettung_cum, avgProfit, cfg.anzahl_jahre, cfg)}
    <div class="chart-grid-2">
      <div class="chart-panel"><div id="chart-praemien"></div></div>
      <div class="chart-panel"><div id="chart-quoten"></div></div>
      <div class="chart-panel"><div id="chart-ek-div"></div></div>
      <div class="chart-panel"><div id="chart-gewinn"></div></div>
    </div>
  `

  setTimeout(() => {
    renderSparklines(gd, latest.Solvenzquote, cfg)
    renderGroupCharts(gamedata, gd, gruppe)
  }, 0)
}

function renderSparklines(gd: GameData, solvency: number, cfg: ReturnType<typeof store.get>['cfg']): void {
  if (!cfg) return
  const solvColor = solvencyColour(solvency, cfg)
  ;[
    ['spark-marktanteil', gd.map(r => r.Policenzahl),                       '#005DB5'],
    ['spark-solvenz',     gd.map(r => r.Solvenzquote),                      solvColor],
    ['spark-div-cum',     gd.map(r => r.Dividendenausschuettung_cum),        '#009D65'],
    ['spark-gewinn',      gd.map(r => r.Versicherungstechnisches_Ergebnis),  '#005DB5'],
  ].forEach(([id, data, color]) => {
    const el = document.getElementById(id as string)
    if (el) renderSparkline(el, data as number[], color as string)
  })
}

function renderGroupCharts(gamedata: GameData, gd: GameData, gruppe: string): void {
  const otherGroups = [...new Set(gamedata.map(r => r.Gruppe))].filter(g => g !== gruppe)

  const premiumEl = document.getElementById('chart-praemien')
  if (premiumEl) {
    const series: ChartSeries[] = [
      { name: t('analyse_group.series_policies'),   data: gd.map(r => ({ x: r.Jahr, y: r.Policenzahl })) },
      { name: t('analyse_group.series_premium'),    data: gd.map(r => ({ x: r.Jahr, y: r.Praemie })) },
      ...otherGroups.map((g, i) => ({
        name: t('analyse_group.series_competitor', { n: i + 1 }),
        data: gamedata
          .filter(r => r.Gruppe === g)
          .sort((a, b) => a.Jahr - b.Jahr)
          .map(r => ({ x: r.Jahr, y: r.Praemie })),
      })),
    ]
    renderLineChart(premiumEl, series, t('analyse_group.chart_premiums'))
  }

  const ratioEl = document.getElementById('chart-quoten')
  if (ratioEl) {
    renderLineChart(ratioEl, [
      { name: t('analyse_group.series_cost_ratio'), data: gd.map(r => ({ x: r.Jahr, y: r.Kostenquote })) },
      { name: t('analyse_group.series_loss_ratio'), data: gd.map(r => ({ x: r.Jahr, y: r.Schadenquote })) },
      { name: t('analyse_group.series_combined'),   data: gd.map(r => ({ x: r.Jahr, y: r.Kombinierte_Schadenquote })) },
      { name: t('analyse_group.series_solvency'),   data: gd.map(r => ({ x: r.Jahr, y: r.Solvenzquote })) },
    ], t('analyse_group.chart_ratios'), true)
  }

  const equityEl = document.getElementById('chart-ek-div')
  if (equityEl) {
    renderLineChart(equityEl, [
      { name: t('analyse_group.series_equity'),  data: gd.map(r => ({ x: r.Jahr, y: r.Eigenkapital_ende })) },
      { name: t('analyse_group.series_cum_div'), data: gd.map(r => ({ x: r.Jahr, y: r.Dividendenausschuettung_cum })) },
    ], t('analyse_group.chart_equity'))
  }

  const profitEl = document.getElementById('chart-gewinn')
  if (profitEl) {
    renderLineChart(profitEl, [
      { name: t('analyse_group.series_result'), data: gd.map(r => ({ x: r.Jahr, y: r.Versicherungstechnisches_Ergebnis })) },
    ], t('analyse_group.chart_result'))
  }
}
