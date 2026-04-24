#!/usr/bin/env tsx
/**
 * Headless simulation (no browser).
 * Mirrors scripts/simulate_game.py from the Python version.
 *
 * Usage:
 *   npm run simulate
 *   npm run sim:quick
 *   npm run sim:full
 *   tsx scripts/simulate.ts --gruppen 6 --perioden 4 --random
 */

import { DEFAULT_CONFIG, type StaticConfig } from '../src/core/config'
import {
  computeRanking,
  start_algorithmus,
  type GameData,
  type GruppeInput,
} from '../src/core/algorithmus'

// ── Simulation strategies ──────────────────────────────────────────────────

type Strategy = (gamedata: GameData | null, gruppe: string, cfg: StaticConfig)
  => { premiumAdjustment: number; dividendShare: number }

const strategyAggressive:    Strategy = () => ({ premiumAdjustment: -0.05, dividendShare: 0.6 })
const strategyDefensive:     Strategy = () => ({ premiumAdjustment:  0.03, dividendShare: 0.0 })
const strategyNeutral:       Strategy = () => ({ premiumAdjustment:  0.00, dividendShare: 0.3 })
const strategyGrowth:        Strategy = () => ({ premiumAdjustment: -0.08, dividendShare: 0.1 })
const strategyProfitMaximise: Strategy = () => ({ premiumAdjustment: 0.02, dividendShare: 0.9 })

const STRATEGIES: Strategy[] = [
  strategyAggressive,
  strategyDefensive,
  strategyNeutral,
  strategyGrowth,
  strategyProfitMaximise,
]

// ── CLI args ───────────────────────────────────────────────────────────────

function getArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 ? (process.argv[idx + 1] ?? fallback) : fallback
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const numGroups  = parseInt(getArg('gruppen',  '4'))
const numRounds  = parseInt(getArg('perioden', '6'))
const numYears   = parseInt(getArg('jahre',    '2'))
const useRandom  = hasFlag('random')
const showReport = hasFlag('report')

// ── Simulation ─────────────────────────────────────────────────────────────

function runSimulation(
  groupCount:  number,
  roundCount:  number,
  yearCount:   number,
  random:      boolean,
): { gamedata: GameData; ranking: ReturnType<typeof computeRanking> } {
  const cfg: StaticConfig = {
    ...DEFAULT_CONFIG,
    anzahl_gruppen:     groupCount,
    anzahl_jahre:       yearCount,
    anzahl_durchlauefe: roundCount,
  }

  const groups     = Array.from({ length: groupCount }, (_, i) => `Gruppe_${String.fromCharCode(65 + i)}`)
  const strategies = groups.map((_, i) => STRATEGIES[i % STRATEGIES.length]!)

  let gamedata: GameData | null = null
  let runTimes = 1

  for (let round = 1; round <= roundCount; round++) {
    process.stdout.write(`\n  Periode ${round}/${roundCount}`)

    const inputs: GruppeInput[] = groups.map((gruppe, i) => {
      const { premiumAdjustment, dividendShare } = strategies[i]!(gamedata, gruppe, cfg)
      let dividend = 0
      if (gamedata) {
        const lastYear  = Math.max(...gamedata.map(r => r.Jahr))
        const current   = gamedata.find(r => r.Gruppe === gruppe && r.Jahr === lastYear)
        if (current) {
          dividend = current.min_div_next_round +
            (current.max_div_next_round - current.min_div_next_round) * dividendShare
        }
      }
      return { Gruppe: gruppe, Praemienanpassung: premiumAdjustment,
               Dividendenausschuettung: dividend, Jahr: runTimes }
    })

    // First year
    gamedata = start_algorithmus(inputs, gamedata, random, cfg, false, false)

    // Subsequent years
    for (let j = 1; j < yearCount; j++) {
      gamedata = start_algorithmus(inputs, gamedata, random, cfg, true, true)
    }

    printRoundSummary(gamedata)
    runTimes++
  }

  return { gamedata: gamedata!, ranking: computeRanking(gamedata!, cfg) }
}

function printRoundSummary(gamedata: GameData): void {
  const lastYear = Math.max(...gamedata.map(r => r.Jahr))
  const current  = [...gamedata.filter(r => r.Jahr === lastYear)]
    .sort((a, b) => a.Gruppe.localeCompare(b.Gruppe))

  console.log()
  console.log(`  ${'Gruppe'.padEnd(12)} ${'Prämie'.padStart(8)} ${'Policen'.padStart(8)} ` +
              `${'Solvenz'.padStart(8)} ${'VT-Erg'.padStart(12)} ${'Div.cum'.padStart(12)}`)
  console.log('  ' + '-'.repeat(64))

  current.forEach(r => {
    const marker = r.Solvenzquote < 1.0 ? ' ⚠' : '  '
    console.log(
      `  ${r.Gruppe.padEnd(12)}` +
      ` ${r.Praemie.toFixed(0).padStart(8)}` +
      ` ${r.Policenzahl.toFixed(0).padStart(8)}` +
      ` ${(r.Solvenzquote * 100).toFixed(1).padStart(7)}%${marker}` +
      ` ${r.Versicherungstechnisches_Ergebnis.toFixed(0).padStart(12)}` +
      ` ${r.Dividendenausschuettung_cum.toFixed(0).padStart(12)}`
    )
  })
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70))
console.log('  Versicherungsplanspiel – Headless Simulation (TypeScript)')
console.log('='.repeat(70))
console.log(`  Groups:  ${numGroups}`)
console.log(`  Rounds:  ${numRounds}`)
console.log(`  Years:   ${numYears}`)
console.log(`  Random:  ${useRandom ? 'yes' : 'no (deterministic)'}`)
console.log('='.repeat(70))

const { gamedata, ranking } = runSimulation(numGroups, numRounds, numYears, useRandom)

console.log('\n' + '='.repeat(70))
console.log('  FINAL RANKING')
console.log('='.repeat(70))
console.log(`  ${'Rank'.padEnd(6)} ${'Group'.padEnd(14)} ${'Cum. Dividend'.padStart(16)} ${'Solvency'.padStart(10)}`)
console.log('  ' + '-'.repeat(50))
ranking.forEach(s => {
  const solvMarker = s.Solvenzquote < 1 ? ' ⚠' : '  '
  console.log(
    `  ${String(s.rank).padEnd(6)}` +
    ` ${s.Gruppe.padEnd(14)}` +
    ` ${s.Dividendenausschuettung_cum.toFixed(0).padStart(16)} €` +
    ` ${(s.Solvenzquote * 100).toFixed(1).padStart(9)}%${solvMarker}`
  )
})

if (showReport) {
  console.log('\n' + '='.repeat(70))
  console.log('  FULL GAME LOG')
  console.log('='.repeat(70))
  const lastYear = Math.max(...gamedata.map(r => r.Jahr))
  for (let j = 1; j <= lastYear; j++) {
    const rows = gamedata.filter(r => r.Jahr === j).sort((a, b) => a.Gruppe.localeCompare(b.Gruppe))
    console.log(`\n  Year ${j}:`)
    rows.forEach(r => {
      console.log(`    ${r.Gruppe}: Premium ${r.Praemie.toFixed(0)} | ` +
                  `Policies ${r.Policenzahl.toFixed(0)} | ` +
                  `Solvency ${(r.Solvenzquote*100).toFixed(1)}% | ` +
                  `Tech result ${r.Versicherungstechnisches_Ergebnis.toFixed(0)}`)
    })
  }
}

console.log()
