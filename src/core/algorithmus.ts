/**
 * Actuarial game engine.
 *
 * TypeScript port of:
 *   Python: planspiel/core/algorithmus.py
 *   R:      Algorithmus/alg.R
 *
 * Function names: snake_case, associative with the originals.
 * Mathematical formulas: 1:1 identical.
 *
 * NOTE: Interface field names are kept in German to match Supabase column names
 * and the R data.frame schema exactly. All other identifiers use English.
 */

import type { StaticConfig } from './config'
import { lognormalParams, plnorm, qlnorm, qnorm } from './stats'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GameRow {
  Gruppe:                          string
  Jahr:                            number
  Praemie:                         number
  Policenzahl:                     number
  Dividendenausschuettung:         number
  Eigenkapital_anfang:             number
  Beitragseinnahmen:               number
  Kosten:                          number
  Solvenzquote:                    number
  Schaden:                         number
  Versicherungstechnisches_Ergebnis: number
  Kostenquote:                     number
  Schadenquote:                    number
  Kombinierte_Schadenquote:        number
  Eigenkapital_ende:               number
  Dividendenausschuettung_cum:     number
  Zufallszahl_spiel:               number
  Zufallszahl_kundenverhalten:     number
  max_div_next_round:              number
  min_div_next_round:              number
}

export interface GruppeInput {
  Gruppe:                  string
  Praemienanpassung:       number
  Dividendenausschuettung: number
  Jahr:                    number
}

export type GameData  = GameRow[]
export type GroupData = GruppeInput[]

// ── Initial data ───────────────────────────────────────────────────────────

export function get_start_data(groups: string[], cfg: StaticConfig): GameData {
  return groups.map(gruppe => {
    const n  = cfg.policenzahl_start
    const ek = cfg.eigenkapital_start
    const p  = cfg.praemie_start

    const premiumIncome = p * n
    const costs         = cfg.Fixkosten + cfg.Varkosten * n
    const solvency      = ek / (Math.sqrt(n) * cfg.dmg_sd * cfg.Risk_StDev)

    const { loginv_my, loginv_sd } = lognormalParams(n, cfg.dmg_my, cfg.dmg_sd)
    const ran    = plnorm(n * cfg.dmg_my, loginv_my, loginv_sd)
    const loss   = qlnorm(ran, loginv_my, loginv_sd)
    const techResult = premiumIncome - costs - loss

    return {
      Gruppe: gruppe, Jahr: 0,
      Praemie: p, Policenzahl: n,
      Dividendenausschuettung: 0, Eigenkapital_anfang: ek,
      Beitragseinnahmen: premiumIncome, Kosten: costs,
      Solvenzquote: solvency, Schaden: loss,
      Versicherungstechnisches_Ergebnis: techResult,
      Kostenquote: costs / premiumIncome,
      Schadenquote: loss / premiumIncome,
      Kombinierte_Schadenquote: (costs + loss) / premiumIncome,
      Eigenkapital_ende: ek, Dividendenausschuettung_cum: 0,
      Zufallszahl_spiel: 0, Zufallszahl_kundenverhalten: 0.5,
      max_div_next_round: 100_000, min_div_next_round: 0,
    }
  })
}

// ── Core algorithm ─────────────────────────────────────────────────────────

export function kern_algorithmus(
  groupdata:    GroupData,
  gamedata:     GameData,
  rand:         boolean,
  year:         number,
  cfg:          StaticConfig,
  div_null:     boolean = false,
  praemie_null: boolean = false,
): GameData {
  const maxYear = Math.max(...groupdata.map(g => g.Jahr))
  const gd   = [...groupdata.filter(g => g.Jahr === maxYear)]
    .sort((a, b) => a.Gruppe.localeCompare(b.Gruppe))
  const prev = [...gamedata.filter(r => r.Jahr === (year - 1))]
    .sort((a, b) => a.Gruppe.localeCompare(b.Gruppe))
  const n = gd.length

  // ── Premium ───────────────────────────────────────────────────────────────
  const newPremium = gd.map((g, i) =>
    praemie_null
      ? prev[i]!.Praemie
      : (1 + g.Praemienanpassung) * prev[i]!.Praemie
  )

  // ── Customer switching / policy migration ─────────────────────────────────
  //
  // Mirrors kern_algorithmus() lines 40–80 in alg.R.
  // Migration matrix semantics:
  //   willingToSwitch[i]   = number of customers from group i who want to switch
  //   baseDistribution[j]  = share of switchers going to group j
  //   migration[i][j]      = policies moving FROM group i TO group j
  //
  const oldCounts = prev.map(r => r.Policenzahl)
  const oldPremia = prev.map(r => r.Praemie)
  const newPremia = newPremium

  const randomDraws = rand
    ? Array.from({ length: n }, () => Math.random())
    : Array(n).fill(0.5) as number[]
  const noiseTerms = randomDraws.map(u => qnorm(u, 0, cfg.zufall_bei_wechsel))

  const pMax     = Math.max(...newPremia)
  const pMin     = Math.min(...newPremia)
  const maxMinQ  = pMax / pMin
  const maxMinDiff = pMax - pMin

  const slope = Math.min(1, maxMinQ - (n - 1) / n)
             - Math.max(0, (n + 1) / n - maxMinQ)

  // Switching propensity per group: how many own customers want to leave?
  const willingToSwitch = gd.map((_, i) => {
    const propensity = cfg.wechselsockel
      + (newPremia[i]! - oldPremia[i]!) / oldPremia[i]! * cfg.Preiselastizitat
      + (newPremia[i]! / pMin - 1) * cfg.sensitivitaet_wettbewerb
    const clamped = Math.max(
      cfg.rand_bei_wechselfunktion,
      Math.min(1 - cfg.rand_bei_wechselfunktion, propensity)
    )
    return Math.trunc(Math.max(0, Math.min(1, clamped + noiseTerms[i]!)) * oldCounts[i]!)
  })

  // Base distribution: cheaper providers attract a larger share
  const baseDistribution: number[] = maxMinQ === 1
    ? Array(n).fill(1 / n) as number[]
    : (() => {
        const sumP = newPremia.reduce((s, x) => s + x, 0)
        const denom = n * Math.min(1, maxMinQ - (n - 1) / n)
                    - slope / maxMinDiff * (sumP - n * pMin)
        return newPremia.map(p => {
          const numer = Math.min(1, maxMinQ - (n - 1) / n)
                      - slope / maxMinDiff * (p - pMin)
          return numer / denom
        })
      })()

  // Migration matrix: migration[i][j] = from group i to group j
  // Equivalent to: wanderung[i,j] = trunc(max(0, willingToSwitch[i] * baseDistribution[j]))
  // Diagonal (i===j) = 0 (customers do not stay at their own group in the matrix sense)
  const migration: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) =>
      i === j ? 0 : Math.trunc(Math.max(0, willingToSwitch[i]! * baseDistribution[j]!))
    )
  )

  // New policy count = old - outflow + inflow
  // Outflow: row i (all who leave group i)
  // Inflow:  col i (all who join group i)
  const newPolicyCounts = oldCounts.map((old, i) => {
    const outflow = migration[i]!.reduce((s, x) => s + x, 0)
    const inflow  = migration.reduce((s, row) => s + row[i]!, 0)
    return old - outflow + inflow
  })

  // ── Dividends ─────────────────────────────────────────────────────────────
  const dividends  = div_null
    ? Array(n).fill(0) as number[]
    : gd.map(g => g.Dividendenausschuettung)
  const equityStart = prev.map(r => r.Eigenkapital_ende)

  // ── P&L ───────────────────────────────────────────────────────────────────
  const premiumIncome = newPremium.map((p, i) => p * newPolicyCounts[i]!)
  const costs         = newPolicyCounts.map(pol => cfg.Fixkosten + cfg.Varkosten * pol)
  const solvency      = newPolicyCounts.map((pol, i) =>
    (equityStart[i]! - dividends[i]!) / (Math.sqrt(pol) * cfg.dmg_sd * cfg.Risk_StDev)
  )

  // ── Collective loss (lognormal distribution) ──────────────────────────────
  const gameRandom = rand
    ? Array.from({ length: n }, () => Math.random())
    : newPolicyCounts.map(pol => {
        const { loginv_my, loginv_sd } = lognormalParams(pol, cfg.dmg_my, cfg.dmg_sd)
        return plnorm(pol * cfg.dmg_my, loginv_my, loginv_sd)
      })

  const losses = newPolicyCounts.map((pol, i) => {
    const { loginv_my, loginv_sd } = lognormalParams(pol, cfg.dmg_my, cfg.dmg_sd)
    return qlnorm(gameRandom[i]!, loginv_my, loginv_sd)
  })

  const techResults = premiumIncome.map((b, i) => b - costs[i]! - losses[i]!)
  const equityEnd   = techResults.map((vt, i) => vt + equityStart[i]! - dividends[i]!)
  const divCum      = prev.map((r, i) => r.Dividendenausschuettung_cum + dividends[i]!)

  // ── Dividend limits for next round ────────────────────────────────────────
  const maxDiv = equityEnd.map((ek, i) =>
    Math.trunc(Math.max(0, ek - ek / solvency[i]! * cfg.MinSolv))
  )
  const minDiv = equityEnd.map((ek, i) =>
    Math.trunc(Math.max(0, ek - ek / solvency[i]! * cfg.MaxSolv))
  )

  return gd.map((g, i) => ({
    Gruppe: g.Gruppe, Jahr: year,
    Praemie: newPremium[i]!, Policenzahl: newPolicyCounts[i]!,
    Dividendenausschuettung: dividends[i]!, Eigenkapital_anfang: equityStart[i]!,
    Beitragseinnahmen: premiumIncome[i]!, Kosten: costs[i]!,
    Solvenzquote: solvency[i]!, Schaden: losses[i]!,
    Versicherungstechnisches_Ergebnis: techResults[i]!,
    Kostenquote:              costs[i]!   / premiumIncome[i]!,
    Schadenquote:             losses[i]!  / premiumIncome[i]!,
    Kombinierte_Schadenquote: (costs[i]! + losses[i]!) / premiumIncome[i]!,
    Eigenkapital_ende: equityEnd[i]!, Dividendenausschuettung_cum: divCum[i]!,
    Zufallszahl_spiel: gameRandom[i]!, Zufallszahl_kundenverhalten: randomDraws[i]!,
    max_div_next_round: maxDiv[i]!, min_div_next_round: minDiv[i]!,
  }))
}

// ── Game entry point ───────────────────────────────────────────────────────

export function start_algorithmus(
  groupdata:  GroupData,
  gamedata:   GameData | null,
  random:     boolean,
  cfg:        StaticConfig,
  div_null_0: boolean = false,
  praemie_0:  boolean = false,
): GameData {
  const maxYear = Math.max(...groupdata.map(g => g.Jahr))
  const gd      = [...groupdata.filter(g => g.Jahr === maxYear)]
    .sort((a, b) => a.Gruppe.localeCompare(b.Gruppe))
  const groups  = gd.map(g => g.Gruppe)

  if (!gamedata) gamedata = get_start_data(groups, cfg)

  const year    = Math.max(...gamedata.map(r => r.Jahr)) + 1
  const result  = kern_algorithmus(groupdata, gamedata, random, year, cfg, div_null_0, praemie_0)

  // Pre-compute dividend slider limits for the next round
  const expectedGroupdata: GroupData = [
    ...groupdata,
    ...groups.map(g => ({
      Gruppe: g, Praemienanpassung: 0,
      Dividendenausschuettung: 0, Jahr: maxYear + 1,
    })),
  ]
  const expectedGame = kern_algorithmus(
    expectedGroupdata, [...gamedata, ...result], false, year + 1, cfg
  )

  const maxResultYear   = Math.max(...result.map(r => r.Jahr))
  const maxExpectedYear = Math.max(...expectedGame.map(r => r.Jahr))

  return [...gamedata, ...result.map(row => {
    if (row.Jahr !== maxResultYear) return row
    const exp = expectedGame.find(e => e.Gruppe === row.Gruppe && e.Jahr === maxExpectedYear)
    return exp
      ? { ...row, max_div_next_round: exp.max_div_next_round,
                  min_div_next_round: exp.min_div_next_round }
      : row
  })]
}

// ── Winner ranking ─────────────────────────────────────────────────────────

export interface RankingRow {
  rank: number; Gruppe: string
  Dividendenausschuettung_cum: number; Solvenzquote: number
}

export function computeRanking(gamedata: GameData, _cfg: StaticConfig): RankingRow[] {
  const lastYear  = Math.max(...gamedata.map(r => r.Jahr))
  const current   = gamedata.filter(r => r.Jahr === lastYear)
  const solvent   = current.filter(r => r.Solvenzquote >= 1)
    .sort((a, b) => b.Dividendenausschuettung_cum - a.Dividendenausschuettung_cum)
  const insolvent = current.filter(r => r.Solvenzquote < 1)
    .sort((a, b) => b.Dividendenausschuettung_cum - a.Dividendenausschuettung_cum)
  return [...solvent, ...insolvent].map((r, i) => ({
    rank: i + 1, Gruppe: r.Gruppe,
    Dividendenausschuettung_cum: r.Dividendenausschuettung_cum,
    Solvenzquote: r.Solvenzquote,
  }))
}
