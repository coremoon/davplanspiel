/**
 * Market analysis page.
 */

import { t } from '@i18n'
import { loadGamedata } from '@store/supabase'
import { renderBarChart, renderLineChart, renderPieChart } from '../components/charts'
import { loadingHTML } from '../components/widgets'
import { store } from '../state'

export async function render(root: HTMLElement): Promise<void> {
  root.innerHTML = loadingHTML()

  const { spielId } = store.get()
  const gamedata = await loadGamedata(spielId)

  if (!gamedata || gamedata.length === 0) {
    root.innerHTML = `<div class="panel"><p>${t('analyse_market.no_game_data')}</p></div>`
    return
  }

  const lastYear = Math.max(...gamedata.map(r => r.Jahr))
  const current  = gamedata.filter(r => r.Jahr === lastYear)
  const groups   = current.map(r => r.Gruppe).sort()

  root.innerHTML = `
    <div class="page-header"><h2>🌍 ${t('analyse_market.title_market_analysis')}</h2></div>
    <div class="chart-grid-2">
      <div class="chart-panel"><div id="chart-marktanteile"></div></div>
      <div class="chart-panel"><div id="chart-dividenden"></div></div>
      <div class="chart-panel"><div id="chart-solvenz"></div></div>
      <div class="chart-panel"><div id="chart-gewinne"></div></div>
    </div>
    <div class="chart-panel chart-full">
      <div id="chart-mean-praemie"></div>
    </div>
    <div class="chart-panel chart-full">
      <div id="chart-markt-quoten"></div>
    </div>
  `

  setTimeout(() => {
    // Market shares (pie)
    const totalPolicies = current.reduce((s, r) => s + r.Policenzahl, 0)
    const sharesPie     = document.getElementById('chart-marktanteile')
    if (sharesPie) {
      renderPieChart(
        sharesPie,
        groups,
        groups.map(g => current.find(r => r.Gruppe === g)!.Policenzahl / totalPolicies),
        'Marktanteile',
      )
    }

    // Cumulative dividends (pie)
    const totalDiv = current.reduce((s, r) => s + r.Dividendenausschuettung_cum, 0)
    const divPie   = document.getElementById('chart-dividenden')
    if (divPie && totalDiv > 0) {
      renderPieChart(
        divPie,
        groups,
        groups.map(g => current.find(r => r.Gruppe === g)!.Dividendenausschuettung_cum / totalDiv),
        'Gesamte Dividendenausschüttungen',
      )
    } else if (divPie) {
      divPie.innerHTML = '<p class="chart-empty">Noch keine Dividenden ausgeschüttet.</p>'
    }

    // Solvency ratios (bar)
    const solvBar = document.getElementById('chart-solvenz')
    if (solvBar) {
      renderBarChart(
        solvBar,
        groups,
        groups.map(g => current.find(r => r.Gruppe === g)!.Solvenzquote),
        'Solvenzquoten', true,
      )
    }

    // Technical results (bar)
    const profitBar = document.getElementById('chart-gewinne')
    if (profitBar) {
      renderBarChart(
        profitBar,
        groups,
        groups.map(g => current.find(r => r.Gruppe === g)!.Versicherungstechnisches_Ergebnis),
        'Versicherungstechnisches Ergebnis',
      )
    }

    // Average market premium (line)
    const premiumEl = document.getElementById('chart-mean-praemie')
    if (premiumEl) {
      const years = [...new Set(gamedata.map(r => r.Jahr))].sort((a, b) => a - b)
      const avgPremiums = years.map(y => {
        const rows        = gamedata.filter(r => r.Jahr === y)
        const totalPol    = rows.reduce((s, r) => s + r.Policenzahl, 0)
        const weightedPrem = rows.reduce((s, r) => s + r.Praemie * r.Policenzahl, 0)
        return { x: y, y: totalPol > 0 ? weightedPrem / totalPol : 0 }
      })
      renderLineChart(
        premiumEl,
        [{ name: 'Durchschnittsprämie', data: avgPremiums }],
        'Durchschnittsprämie im Versicherungsmarkt',
      )
    }

    // Market ratios (line)
    const ratioEl = document.getElementById('chart-markt-quoten')
    if (ratioEl) {
      const years = [...new Set(gamedata.map(r => r.Jahr))].sort((a, b) => a - b)
      const marketRatio = (field: keyof typeof gamedata[0]) =>
        years.map(y => {
          const rows     = gamedata.filter(r => r.Jahr === y)
          const totalBE  = rows.reduce((s, r) => s + r.Beitragseinnahmen, 0)
          const totalVal = rows.reduce((s, r) => s + (r[field] as number), 0)
          return { x: y, y: totalBE > 0 ? totalVal / totalBE : 0 }
        })

      renderLineChart(
        ratioEl,
        [
          { name: 'Schadenquote',                    data: marketRatio('Schaden') },
          { name: 'Kostenquote',                     data: marketRatio('Kosten') },
          { name: 'Kombinierte Schaden-Kosten-Quote',
            data: years.map(y => {
              const rows = gamedata.filter(r => r.Jahr === y)
              const be   = rows.reduce((s, r) => s + r.Beitragseinnahmen, 0)
              const sk   = rows.reduce((s, r) => s + r.Schaden + r.Kosten, 0)
              return { x: y, y: be > 0 ? sk / be : 0 }
            }),
          },
        ],
        'Quoten des Versicherungsmarktes', true,
      )
    }
  }, 0)
}
