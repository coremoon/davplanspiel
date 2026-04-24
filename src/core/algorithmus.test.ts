/**
 * Tests for the algorithm core (TypeScript/Vitest).
 * Imports: relative paths (more robust than aliases in Vitest).
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type StaticConfig } from './config'
import {
  computeRanking,
  get_start_data,
  kern_algorithmus,
  start_algorithmus,
  type GameData,
  type GruppeInput,
} from './algorithmus'
import { lognormalParams, plnorm, qlnorm, qnorm, pnorm } from './stats'

const cfg: StaticConfig = { ...DEFAULT_CONFIG }
const groups = ['Gruppe_A', 'Gruppe_B', 'Gruppe_C', 'Gruppe_D']

function makeGroupdata(
  year        = 1,
  adjustments = [0, 0, 0, 0],
  dividends   = [0, 0, 0, 0],
): GruppeInput[] {
  return groups.map((g, i) => ({
    Gruppe:                  g,
    Praemienanpassung:       adjustments[i] ?? 0,
    Dividendenausschuettung: dividends[i]   ?? 0,
    Jahr:                    year,
  }))
}

// ── Statistics ──────────────────────────────────────────────────────────────

describe('stats', () => {
  it('qnorm(0.5) = 0', () => {
    expect(qnorm(0.5)).toBeCloseTo(0, 5)
  })

  it('qnorm(0.975) ≈ 1.96', () => {
    expect(qnorm(0.975)).toBeCloseTo(1.96, 2)
  })

  it('pnorm(0) = 0.5', () => {
    expect(pnorm(0)).toBeCloseTo(0.5, 5)
  })

  it('plnorm / qlnorm are inverses', () => {
    const { loginv_my, loginv_sd } = lognormalParams(1000, 600, 2100)
    const x = 650_000
    const p = plnorm(x, loginv_my, loginv_sd)
    expect(qlnorm(p, loginv_my, loginv_sd)).toBeCloseTo(x, 0)
  })

  it('lognormalParams: loginv_sd > 0', () => {
    const { loginv_my, loginv_sd } = lognormalParams(1000, 600, 2100)
    expect(loginv_sd).toBeGreaterThan(0)
    expect(isNaN(loginv_my)).toBe(false)
  })
})

// ── Start data ──────────────────────────────────────────────────────────────

describe('get_start_data', () => {
  const start = get_start_data(groups, cfg)

  it('returns 4 rows', () => {
    expect(start).toHaveLength(4)
  })

  it('all groups present', () => {
    expect(start.map(r => r.Gruppe).sort()).toEqual([...groups].sort())
  })

  it('Jahr = 0', () => {
    expect(start.every(r => r.Jahr === 0)).toBe(true)
  })

  it('starting parameters correct', () => {
    start.forEach(r => {
      expect(r.Praemie).toBe(cfg.praemie_start)
      expect(r.Policenzahl).toBe(cfg.policenzahl_start)
      expect(r.Eigenkapital_ende).toBe(cfg.eigenkapital_start)
    })
  })

  it('solvency ratio positive', () => {
    expect(start.every(r => r.Solvenzquote > 0)).toBe(true)
  })

  it('no NaN values', () => {
    start.forEach(r =>
      Object.values(r).forEach(v => {
        if (typeof v === 'number') expect(isNaN(v)).toBe(false)
      })
    )
  })
})

// ── Core algorithm ──────────────────────────────────────────────────────────

describe('kern_algorithmus', () => {
  const start = get_start_data(groups, cfg)
  const gd    = makeGroupdata()

  it('returns 4 rows', () => {
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    expect(result).toHaveLength(4)
  })

  it('year number correct', () => {
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    expect(result.every(r => r.Jahr === 1)).toBe(true)
  })

  it('equity balance: EK_ende = EK_anfang - dividend + tech_result', () => {
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    result.forEach(r => {
      const expected = r.Eigenkapital_anfang
                     - r.Dividendenausschuettung
                     + r.Versicherungstechnisches_Ergebnis
      expect(r.Eigenkapital_ende).toBeCloseTo(expected, 6)
    })
  })

  it('tech_result = premium_income - costs - losses', () => {
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    result.forEach(r => {
      const expected = r.Beitragseinnahmen - r.Kosten - r.Schaden
      expect(r.Versicherungstechnisches_Ergebnis).toBeCloseTo(expected, 6)
    })
  })

  it('combined ratio = loss ratio + cost ratio', () => {
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    result.forEach(r => {
      expect(r.Kombinierte_Schadenquote).toBeCloseTo(
        r.Schadenquote + r.Kostenquote, 6
      )
    })
  })

  it('solvency ratio formula correct', () => {
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    result.forEach(r => {
      const expected = (r.Eigenkapital_anfang - r.Dividendenausschuettung)
                     / (Math.sqrt(r.Policenzahl) * cfg.dmg_sd * cfg.Risk_StDev)
      expect(r.Solvenzquote).toBeCloseTo(expected, 6)
    })
  })

  it('div_null forces dividend = 0', () => {
    const gdWithDiv = makeGroupdata(1, [0, 0, 0, 0], [50_000, 50_000, 50_000, 50_000])
    const result    = kern_algorithmus(gdWithDiv, start, false, 1, cfg, true)
    result.forEach(r => expect(r.Dividendenausschuettung).toBe(0))
  })

  it('praemie_null keeps old premium', () => {
    const gdWithAdj = makeGroupdata(1, [0.1, 0.1, 0.1, 0.1])
    const result    = kern_algorithmus(gdWithAdj, start, false, 1, cfg, false, true)
    result.forEach(r => expect(r.Praemie).toBeCloseTo(cfg.praemie_start, 4))
  })

  it('deterministic with rand=false', () => {
    const r1 = kern_algorithmus(gd, start, false, 1, cfg)
    const r2 = kern_algorithmus(gd, start, false, 1, cfg)
    r1.forEach((row, i) => {
      expect(row.Schaden).toBeCloseTo(r2[i]!.Schaden, 6)
      expect(row.Policenzahl).toBeCloseTo(r2[i]!.Policenzahl, 6)
    })
  })

  it('no NaN values', () => {
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    result.forEach(r =>
      Object.values(r).forEach(v => {
        if (typeof v === 'number') expect(isNaN(v)).toBe(false)
      })
    )
  })
})

// ── Policy migration ────────────────────────────────────────────────────────

describe('policy migration', () => {
  it('most expensive groups lose policies, cheapest gains', () => {
    const start = get_start_data(groups, cfg)
    // A significantly cheaper (-10%), B/C/D significantly more expensive (+10%)
    const gd: GruppeInput[] = [
      { Gruppe: 'Gruppe_A', Praemienanpassung: -0.10, Dividendenausschuettung: 0, Jahr: 1 },
      { Gruppe: 'Gruppe_B', Praemienanpassung:  0.10, Dividendenausschuettung: 0, Jahr: 1 },
      { Gruppe: 'Gruppe_C', Praemienanpassung:  0.10, Dividendenausschuettung: 0, Jahr: 1 },
      { Gruppe: 'Gruppe_D', Praemienanpassung:  0.10, Dividendenausschuettung: 0, Jahr: 1 },
    ]
    const result  = kern_algorithmus(gd, start, false, 1, cfg)
    const byGroup = Object.fromEntries(result.map(r => [r.Gruppe, r.Policenzahl]))
    expect(byGroup['Gruppe_B']).toBeLessThan(cfg.policenzahl_start)
    expect(byGroup['Gruppe_C']).toBeLessThan(cfg.policenzahl_start)
    expect(byGroup['Gruppe_D']).toBeLessThan(cfg.policenzahl_start)
    expect(byGroup['Gruppe_A']).toBeGreaterThan(cfg.policenzahl_start)
  })

  it('total policy count stays roughly constant (±1%)', () => {
    const start  = get_start_data(groups, cfg)
    const gd     = makeGroupdata()
    const result = kern_algorithmus(gd, start, false, 1, cfg)
    const before = start.reduce((s, r) => s + r.Policenzahl, 0)
    const after  = result.reduce((s, r) => s + r.Policenzahl, 0)
    expect(Math.abs(before - after) / before).toBeLessThan(0.01)
  })
})

// ── start_algorithmus ───────────────────────────────────────────────────────

describe('start_algorithmus', () => {
  it('returns start data + period 1 (8 rows)', () => {
    const result = start_algorithmus(makeGroupdata(), null, false, cfg)
    expect(result).toHaveLength(8)
  })

  it('max_div >= min_div for all groups', () => {
    const result  = start_algorithmus(makeGroupdata(), null, false, cfg)
    const lastYear = Math.max(...result.map(r => r.Jahr))
    result
      .filter(r => r.Jahr === lastYear)
      .forEach(r => {
        expect(r.max_div_next_round).toBeGreaterThanOrEqual(r.min_div_next_round)
        expect(r.max_div_next_round).toBeGreaterThanOrEqual(0)
      })
  })

  it('two periods in sequence: 12 rows', () => {
    let gd = start_algorithmus(makeGroupdata(1), null, false, cfg)
    gd     = start_algorithmus(makeGroupdata(2), gd,   false, cfg)
    expect(gd).toHaveLength(12)
  })
})

// ── Ranking ─────────────────────────────────────────────────────────────────

describe('computeRanking', () => {
  it('solvent groups ranked before insolvent', () => {
    const gamedata: GameData = [
      { Gruppe: 'A', Jahr: 1, Solvenzquote: 2.0,
        Dividendenausschuettung_cum: 100_000,
        Praemie: 820, Policenzahl: 1000, Dividendenausschuettung: 0,
        Eigenkapital_anfang: 450_000, Beitragseinnahmen: 820_000,
        Kosten: 200_000, Schaden: 500_000,
        Versicherungstechnisches_Ergebnis: 120_000,
        Kostenquote: 0.24, Schadenquote: 0.61,
        Kombinierte_Schadenquote: 0.85, Eigenkapital_ende: 570_000,
        Zufallszahl_spiel: 0.5, Zufallszahl_kundenverhalten: 0.5,
        max_div_next_round: 50_000, min_div_next_round: 0 },
      { Gruppe: 'B', Jahr: 1, Solvenzquote: 0.5,
        Dividendenausschuettung_cum: 500_000,
        Praemie: 820, Policenzahl: 1000, Dividendenausschuettung: 0,
        Eigenkapital_anfang: 450_000, Beitragseinnahmen: 820_000,
        Kosten: 200_000, Schaden: 800_000,
        Versicherungstechnisches_Ergebnis: -180_000,
        Kostenquote: 0.24, Schadenquote: 0.98,
        Kombinierte_Schadenquote: 1.22, Eigenkapital_ende: 270_000,
        Zufallszahl_spiel: 0.9, Zufallszahl_kundenverhalten: 0.5,
        max_div_next_round: 0, min_div_next_round: 0 },
    ]
    const ranking = computeRanking(gamedata, cfg)
    expect(ranking.find(s => s.Gruppe === 'B')!.rank).toBe(2)
    expect(ranking.find(s => s.Gruppe === 'A')!.rank).toBe(1)
  })

  it('rank 1 has highest dividend among solvent groups', () => {
    const gd      = makeGroupdata(1, [0, -0.05, 0.03, 0], [10_000, 0, 5_000, 20_000])
    const data    = start_algorithmus(gd, null, false, cfg)
    const ranking = computeRanking(data, cfg)
    const solvent = ranking.filter(s => s.Solvenzquote >= 1)
    if (solvent.length > 0) {
      const rank1  = ranking.find(s => s.rank === 1)!
      const maxDiv = Math.max(...solvent.map(s => s.Dividendenausschuettung_cum))
      expect(rank1.Dividendenausschuettung_cum).toBe(maxDiv)
    }
  })
})
