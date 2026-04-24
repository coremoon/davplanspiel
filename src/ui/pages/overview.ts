/**
 * Overview page (admin only).
 */

import { t } from '@i18n'
import type { GameRow } from '@core/algorithmus'
import { getGroupadminData, loadGamedata } from '@store/supabase'
import { loadingHTML, tableHTML } from '../components/widgets'
import { store } from '../state'
import { getSession } from '@auth/session'

export async function render(root: HTMLElement): Promise<void> {
  const session = getSession()
  if (session?.login_as !== 'admin') {
    root.innerHTML = `<div class="panel"><p>${t('overview.no_access')}</p></div>`
    return
  }

  root.innerHTML = loadingHTML()

  const { spielId } = store.get()
  const gd       = await getGroupadminData(spielId)
  const gamedata = await loadGamedata(spielId)

  root.innerHTML = `
    <div class="page-header"><h2>🔍 ${t('overview.title')}</h2></div>

    <div class="panel">
      <h3>${t('overview.group_inputs')}</h3>
      ${gd.length > 0
        ? tableHTML(
            [t('overview.col_group'), t('overview.col_premium_adj'),
             t('overview.col_dividend'), t('overview.col_round')],
            gd.map(r => [
              r.Gruppe,
              `${(r.Praemienanpassung * 100).toFixed(1)}%`,
              r.Dividendenausschuettung.toFixed(0),
              String(r.Jahr),
            ]),
          )
        : `<p>${t('overview.no_inputs')}</p>`
      }
    </div>

    <div class="panel">
      <h3>${t('overview.game_data')}</h3>
      ${gamedata && gamedata.length > 0
        ? tableHTML(
            [t('overview.col_group'), t('overview.col_year'), t('overview.col_premium'),
             t('overview.col_policies'), t('overview.col_solvency'),
             t('overview.col_result'), t('overview.col_cum_div')],
            gamedata
              .sort((a, b) => a.Jahr - b.Jahr || a.Gruppe.localeCompare(b.Gruppe))
              .map(r => [
                r.Gruppe,
                String(r.Jahr),
                r.Praemie.toFixed(2),
                r.Policenzahl.toFixed(0),
                `${(r.Solvenzquote * 100).toFixed(1)}%`,
                r.Versicherungstechnisches_Ergebnis.toFixed(0),
                r.Dividendenausschuettung_cum.toFixed(0),
              ]),
          )
        : `<p>${t('overview.no_data')}</p>`
      }
      ${gamedata && gamedata.length > 0 ? `
        <div class="btn-row" style="margin-top:1rem">
          <button class="btn btn-secondary" id="btn-download-zv">${t('overview.btn_download_random')}</button>
          <button class="btn btn-secondary" id="btn-download-all">${t('overview.btn_download_all')}</button>
        </div>
      ` : ''}
    </div>
  `

  if (gamedata && gamedata.length > 0) {
    document.getElementById('btn-download-zv')?.addEventListener('click', () => {
      downloadCSV(
        gamedata as unknown as Record<string, unknown>[],
        ['Gruppe', 'Jahr', 'Zufallszahl_spiel', 'Zufallszahl_kundenverhalten'],
        ['group', 'year', 'random_game', 'random_customer'],
        'random_numbers.csv',
      )
    })
    document.getElementById('btn-download-all')?.addEventListener('click', () => {
      const fieldMap: Array<[keyof GameRow, string]> = [
        ['Gruppe',                            'group'],
        ['Jahr',                              'year'],
        ['Praemie',                           'premium'],
        ['Policenzahl',                       'policy_count'],
        ['Dividendenausschuettung',           'dividend'],
        ['Eigenkapital_anfang',               'equity_start'],
        ['Beitragseinnahmen',                 'premium_income'],
        ['Kosten',                            'costs'],
        ['Schaden',                           'losses'],
        ['Versicherungstechnisches_Ergebnis', 'tech_result'],
        ['Kostenquote',                       'cost_ratio'],
        ['Schadenquote',                      'loss_ratio'],
        ['Kombinierte_Schadenquote',          'combined_ratio'],
        ['Eigenkapital_ende',                 'equity_end'],
        ['Dividendenausschuettung_cum',       'dividend_cum'],
        ['Solvenzquote',                      'solvency_ratio'],
        ['Zufallszahl_spiel',                 'random_game'],
        ['Zufallszahl_kundenverhalten',       'random_customer'],
        ['max_div_next_round',                'max_div_next'],
        ['min_div_next_round',                'min_div_next'],
      ]
      downloadCSV(
        gamedata as unknown as Record<string, unknown>[],
        fieldMap.map(([f]) => f),
        fieldMap.map(([, h]) => h),
        'game_data.csv',
      )
    })
  }
}

function downloadCSV(
  data:     Record<string, unknown>[],
  fields:   string[],
  headers:  string[],
  filename: string,
): void {
  const header = headers.join(',')
  const rows   = data.map(r => fields.map(f => String(r[f] ?? '')).join(','))
  const csv    = [header, ...rows].join('\n')
  const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}
