/**
 * Game configuration parameters.
 */
export interface StaticConfig {
  // Game structure
  anzahl_gruppen:     number   // 2–8
  anzahl_jahre:       number   // 1–5
  anzahl_durchlauefe: number   // 1–11

  // Solvency limits for dividend payments
  MinSolv: number              // Default 1.5
  MaxSolv: number              // Default 3.0

  // Cost structure
  Fixkosten: number            // Default 80_000
  Varkosten: number            // Default 120

  // Loss parameters (lognormal collective loss)
  dmg_my:      number          // Expected loss per policy, default 600
  dmg_sd:      number          // Standard deviation per policy, default 2_100
  Risk_StDev:  number          // Risk capital factor, default 5

  // Starting values
  eigenkapital_start: number   // Default 450_000
  praemie_start:      number   // Default 820
  policenzahl_start:  number   // Default 1_000

  // Customer switching behaviour
  zufall_bei_wechsel:         number   // Default 0.01
  rand_bei_wechselfunktion:   number   // Default 0.05
  wechselsockel:              number   // Default 0.10
  sensitivitaet_wettbewerb:   number   // Default 0.10
  Preiselastizitat:           number   // Default 0.80

  // Solvency traffic-light thresholds
  SolvAmpel_rot:   number      // Default 1.00
  SolvAmpel_gelb:  number      // Default 1.50
}

export const DEFAULT_CONFIG: StaticConfig = {
  anzahl_gruppen:    4,
  anzahl_jahre:      2,
  anzahl_durchlauefe: 6,
  MinSolv: 1.5,
  MaxSolv: 3.0,
  Fixkosten: 80_000,
  Varkosten: 120,
  dmg_my:     600,
  dmg_sd:     2_100,
  Risk_StDev: 5,
  eigenkapital_start: 450_000,
  praemie_start:      820,
  policenzahl_start:  1_000,
  zufall_bei_wechsel:       0.01,
  rand_bei_wechselfunktion: 0.05,
  wechselsockel:            0.10,
  sensitivitaet_wettbewerb: 0.10,
  Preiselastizitat:         0.80,
  SolvAmpel_rot:  1.00,
  SolvAmpel_gelb: 1.50,
}

/** Returns traffic-light colour for a solvency ratio – mirrors solvenz_farbe() in config.py */
export function solvencyColour(solvency: number, cfg: StaticConfig): string {
  if (solvency > cfg.SolvAmpel_gelb) return '#62fc03'
  if (solvency > cfg.SolvAmpel_rot)  return '#fcba03'
  return '#fc0303'
}

export const DIF_COLS = [
  '#005DB5', '#009D65', '#8CD4E9', '#8999A8',
  '#F0825A', '#E1D719', '#1B6148', '#19AAD2',
  '#B22222', '#8FBC8F', '#9932CC', '#FFA500', '#D2691E',
]
