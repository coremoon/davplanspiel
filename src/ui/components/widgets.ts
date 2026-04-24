/**
 * Reusable UI building blocks.
 * Return HTML strings or DOM elements.
 */

import { formatEuro, formatNumber, formatPct } from './charts'
import type { StaticConfig } from '@core/config'
import { solvencyColour } from '@core/config'

// ── Spark box ──────────────────────────────────────────────────────────────

/** KPI tile with sparkline placeholder – mirrors sparkBoxOutput() in R */
export function sparkboxHTML(
  id:       string,
  label:    string,
  value:    string,
  bgColor:  string = '#F8F8F8',
): string {
  return `
    <div class="sparkbox" style="background:${bgColor}">
      <div class="sparkbox-value">${value}</div>
      <div class="sparkbox-label">${label}</div>
      <div id="spark-${id}" class="sparkbox-chart"></div>
    </div>
  `
}

/** Spark boxes for group analysis – mirrors the 4 sparkBoxOutput() in gruppenanalyse_ui.R */
export function groupSparkboxes(
  marketShare:  number,
  solvency:     number,
  divCum:       number,
  avgProfit:    number,
  numYears:     number,
  cfg:          StaticConfig,
): string {
  const solvColor = solvencyColour(solvency, cfg)
  return `
    <div class="sparkbox-row">
      ${sparkboxHTML('marktanteil', 'Market share', formatPct(marketShare))}
      ${sparkboxHTML('solvenz', 'Solvency ratio', formatPct(solvency), solvColor)}
      ${sparkboxHTML('div-cum', 'Cum. dividends paid', formatEuro(divCum))}
      ${sparkboxHTML('gewinn',
        numYears > 1 ? `Avg. profit (${numYears}Y)` : 'Profit',
        formatEuro(avgProfit))}
    </div>
  `
}

// ── Tables ─────────────────────────────────────────────────────────────────

export function tableHTML(
  headers: string[],
  rows:    string[][],
  striped: boolean = true,
): string {
  const ths = headers.map(h => `<th>${h}</th>`).join('')
  const trs = rows.map(row =>
    `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
  ).join('')
  return `
    <div class="table-wrapper">
      <table class="tbl${striped ? ' striped' : ''}">
        <thead><tr>${ths}</tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `
}

// ── Metrics ────────────────────────────────────────────────────────────────

export function metricCard(label: string, value: string, delta?: string): string {
  const deltaHTML = delta
    ? `<div class="metric-delta">${delta}</div>`
    : ''
  return `
    <div class="metric-card">
      <div class="metric-value">${value}</div>
      <div class="metric-label">${label}</div>
      ${deltaHTML}
    </div>
  `
}

// ── Slider ─────────────────────────────────────────────────────────────────

export function sliderHTML(opts: {
  id:      string
  label:   string
  min:     number
  max:     number
  value:   number
  step:    number
  suffix?: string
  help?:   string
}): string {
  const { id, label, min, max, value, step, suffix = '', help = '' } = opts
  return `
    <div class="form-group">
      <label for="${id}">
        ${label}
        <span class="slider-value" id="${id}-display">${value}${suffix}</span>
      </label>
      <input
        type="range" id="${id}" name="${id}"
        min="${min}" max="${max}" value="${value}" step="${step}"
        class="slider"
      />
      ${help ? `<div class="form-help">${help}</div>` : ''}
    </div>
  `
}

/** Connects slider input to live display */
export function attachSliderDisplay(id: string, suffix = '', transform = (v: number) => v): void {
  const input   = document.getElementById(id) as HTMLInputElement | null
  const display = document.getElementById(`${id}-display`)
  if (!input || !display) return
  const update = (): void => {
    display.textContent = `${transform(parseFloat(input.value)).toFixed(0)}${suffix}`
  }
  input.addEventListener('input', update)
  update()
}

// ── Alerts ─────────────────────────────────────────────────────────────────

export function alertHTML(type: 'success' | 'error' | 'info' | 'warning', text: string): string {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' }
  return `<div class="alert alert-${type}">${icons[type]} ${text}</div>`
}

// ── Loading indicator ──────────────────────────────────────────────────────

export function loadingHTML(text = 'Loading…'): string {
  return `<div class="loading"><div class="spinner"></div> ${text}</div>`
}

// ── Period status badge ────────────────────────────────────────────────────

export function periodBadge(runTimes: number, totalRounds: number): string {
  if (runTimes === 0)
    return `<span class="badge badge-grey">Not started</span>`
  if (runTimes > totalRounds)
    return `<span class="badge badge-green">Game over</span>`
  return `<span class="badge badge-blue">Round ${runTimes} / ${totalRounds}</span>`
}
