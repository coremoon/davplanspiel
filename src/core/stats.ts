/**
 * Statistical helper functions.
 *
 * Uses jStat for distribution functions (normal, lognormal).
 * Replaces scipy.stats (Python) and R's qlnorm/plnorm/qnorm.
 */

import jStatModule from 'jstat'
const jStat = (jStatModule as any).jStat ?? jStatModule

/**
 * Inverse normal distribution (quantile function).
 * Equivalent to qnorm() in R.
 */
export function qnorm(p: number, mu = 0, sigma = 1): number {
  return jStat.normal.inv(p, mu, sigma)
}

/**
 * Cumulative normal distribution (CDF).
 * Equivalent to pnorm() in R.
 */
export function pnorm(x: number, mu = 0, sigma = 1): number {
  return jStat.normal.cdf(x, mu, sigma)
}

/**
 * Quantile function of the lognormal distribution.
 * Equivalent to qlnorm(p, meanlog, sdlog) in R.
 */
export function qlnorm(p: number, meanlog: number, sdlog: number): number {
  return jStat.lognormal.inv(p, meanlog, sdlog)
}

/**
 * Cumulative lognormal distribution (CDF).
 * Equivalent to plnorm(x, meanlog, sdlog) in R.
 */
export function plnorm(x: number, meanlog: number, sdlog: number): number {
  return jStat.lognormal.cdf(x, meanlog, sdlog)
}

/**
 * Computes mu_ln and sigma_ln of the collective loss (lognormal approximation).
 * Equivalent to loginv_my / loginv_sd in kern_algorithmus() (alg.R).
 */
export function lognormalParams(
  policyCount: number,
  dmg_my: number,
  dmg_sd: number,
): { loginv_my: number; loginv_sd: number } {
  const mu       = policyCount * dmg_my
  const varTotal = policyCount * dmg_sd * dmg_sd
  const loginv_my = Math.log(mu * mu / Math.sqrt(mu * mu + varTotal))
  const loginv_sd = Math.sqrt(Math.log(varTotal / (mu * mu) + 1))
  return { loginv_my, loginv_sd }
}
