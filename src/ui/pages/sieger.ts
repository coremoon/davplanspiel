/**
 * Ranking / winner page.
 * Mirrors sieger_ui.R + sieger_server.R
 */

import { computeRanking } from '@core/algorithmus'
import { loadGamedata } from '@store/supabase'
import { formatEuro, formatPct } from '../components/charts'
import { loadingHTML, tableHTML } from '../components/widgets'
import { store } from '../state'

export async function render(root: HTMLElement): Promise<void> {
  root.innerHTML = loadingHTML()

  const { spielId, cfg } = store.get()
  if (!cfg) return

  const gamedata = await loadGamedata(spielId)
  if (!gamedata || gamedata.length === 0) {
    root.innerHTML = '<div class="panel"><p>Noch keine Spieldaten vorhanden.</p></div>'
    return
  }

  const ranking = computeRanking(gamedata, cfg)
  const winner  = ranking[0]!

  root.innerHTML = `
    <div class="page-header"><h2>🏆 Platzierung</h2></div>

    <div class="panel sieger-panel">
      ${tableHTML(
        [' Platz ', ' Gruppe ', ' Kum. Dividendenausschüttung ', ' Solvenzquote '],
        ranking.map(s => [
          `<strong>${s.rank}</strong>`,
          s.Gruppe,
          formatEuro(s.Dividendenausschuettung_cum),
          `<span style="color:${s.Solvenzquote < 1 ? '#fc0303' : 'inherit'}">${formatPct(s.Solvenzquote)}</span>`,
        ]),
      )}
    </div>

    <div class="sieger-message">
      🎉 Herzlichen Glückwunsch <strong>${winner.Gruppe}</strong>!
      Sie haben von allen Versicherungen am besten performt!
    </div>
  `
}
