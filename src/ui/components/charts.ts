/**
 * ApexCharts wrapper.
 * Mirrors Charts/Linechart.R, Barchart.R, Piechart.R from the R original.
 */

import ApexCharts from 'apexcharts'
import { DIF_COLS } from '@core/config'

export interface ChartSeries {
  name: string
  data: Array<{ x: number | string; y: number }>
}

// ── Line chart ─────────────────────────────────────────────────────────────

export function renderLineChart(
  el:       HTMLElement,
  series:   ChartSeries[],
  title:    string  = '',
  yPct:     boolean = false,
  height:   number  = 280,
): ApexCharts {
  const chart = new ApexCharts(el, {
    chart:  { type: 'line', height, toolbar: { show: false }, animations: { enabled: false } },
    series: series.map((s, i) => ({
      name: s.name,
      data: s.data.map(d => ({ x: d.x, y: d.y })),
      color: DIF_COLS[i % DIF_COLS.length],
    })),
    stroke:   { width: 2, curve: 'smooth' },
    markers:  { size: 4 },
    title:    { text: title, align: 'left', style: { fontSize: '13px' } },
    xaxis:    { type: 'numeric', title: { text: 'Year' }, labels: { formatter: (v: string) => String(Math.round(Number(v))) } },
    yaxis:    { labels: { formatter: yPct
      ? (v: number) => `${(v * 100).toFixed(1)}%`
      : (v: number) => formatNumber(v) } },
    tooltip:  { shared: true, intersect: false,
      y: { formatter: yPct
        ? (v: number) => `${(v * 100).toFixed(1)}%`
        : (v: number) => formatNumber(v) } },
    legend:   { position: 'bottom' },
    grid:     { padding: { left: 10, right: 10 } },
  })
  chart.render()
  return chart
}

// ── Bar chart ──────────────────────────────────────────────────────────────

export function renderBarChart(
  el:     HTMLElement,
  labels: string[],
  values: number[],
  title:  string  = '',
  yPct:   boolean = false,
  height: number  = 250,
): ApexCharts {
  const chart = new ApexCharts(el, {
    chart:  { type: 'bar', height, toolbar: { show: false }, animations: { enabled: false } },
    series: [{ name: title, data: values }],
    xaxis:  { categories: labels },
    colors: DIF_COLS.slice(0, labels.length),
    plotOptions: { bar: { distributed: true, columnWidth: '50%' } },
    legend: { show: false },
    title:  { text: title, align: 'left', style: { fontSize: '13px' } },
    yaxis:  { labels: { formatter: yPct
      ? (v: number) => `${(v * 100).toFixed(1)}%`
      : (v: number) => formatNumber(v) } },
    tooltip: { y: { formatter: yPct
      ? (v: number) => `${(v * 100).toFixed(1)}%`
      : (v: number) => formatNumber(v) } },
    grid: { padding: { left: 10, right: 10 } },
  })
  chart.render()
  return chart
}

// ── Pie / donut chart ──────────────────────────────────────────────────────

export function renderPieChart(
  el:     HTMLElement,
  labels: string[],
  values: number[],
  title:  string = '',
  height: number = 280,
): ApexCharts {
  const chart = new ApexCharts(el, {
    chart:  { type: 'donut', height, toolbar: { show: false } },
    series: values,
    labels,
    colors: DIF_COLS.slice(0, labels.length),
    title:  { text: title, align: 'left', style: { fontSize: '13px' } },
    legend: { position: 'bottom' },
    tooltip: { y: { formatter: (v: number) => `${(v * 100).toFixed(1)}%` } },
    plotOptions: { pie: { donut: { size: '55%' } } },
  })
  chart.render()
  return chart
}

// ── Sparkline ──────────────────────────────────────────────────────────────

export function renderSparkline(
  el:     HTMLElement,
  values: number[],
  color:  string = '#005DB5',
): ApexCharts {
  const chart = new ApexCharts(el, {
    chart:  { type: 'line', height: 50, sparkline: { enabled: true },
              animations: { enabled: false } },
    series: [{ data: values }],
    stroke: { width: 2, curve: 'smooth' },
    colors: [color],
    tooltip: { fixed: { enabled: false }, x: { show: false } },
  })
  chart.render()
  return chart
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** Short format: 1,234,567 → "1.23 Mio." – mirrors short_format() in R */
export function formatNumber(v: number, digits = 2): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e9)  return `${sign}${(abs / 1e9).toFixed(digits)} Mrd.`
  if (abs >= 1e6)  return `${sign}${(abs / 1e6).toFixed(digits)} Mio.`
  if (abs >= 1e3)  return `${sign}${(abs / 1e3).toFixed(digits)} Tsd.`
  return `${sign}${abs.toFixed(digits)}`
}

export function formatEuro(v: number): string {
  return `${formatNumber(v)} €`
}

export function formatPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`
}
