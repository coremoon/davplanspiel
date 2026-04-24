/**
 * Statistical helper functions.
 *
 * Replaces scipy.stats (Python) and R's qlnorm/plnorm/qnorm.
 * Implements distribution functions required by the game algorithm.
 */

/**
 * Inverse normal distribution (quantile function).
 * Approximation by Peter Acklam – sufficient accuracy for game purposes.
 * Equivalent to qnorm() in R.
 */
export function qnorm(p: number, mu = 0, sigma = 1): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity

  const a = [-3.969683028665376e1,  2.209460984245205e2,
             -2.759285104469687e2,  1.383577518672690e2,
             -3.066479806614716e1,  2.506628277459239]
  const b = [-5.447609879822406e1,  1.615858368580409e2,
             -1.556989798598866e2,  6.680131188771972e1,
             -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1,
             -2.400758277161838,    -2.549732539343734,
              4.374664141464968,     2.938163982698783]
  const d = [7.784695709041462e-3,  3.224671290700398e-1,
              2.445134137142996,     3.754408661907416]

  const pLow  = 0.02425
  const pHigh = 1 - pLow
  let q: number

  if (p < pLow) {
    const t = Math.sqrt(-2 * Math.log(p))
    q = (((((c[0]!*t+c[1]!)*t+c[2]!)*t+c[3]!)*t+c[4]!)*t+c[5]!) /
        ((((d[0]!*t+d[1]!)*t+d[2]!)*t+d[3]!)*t+1)
  } else if (p <= pHigh) {
    const u = p - 0.5
    const t = u * u
    q = (((((a[0]!*t+a[1]!)*t+a[2]!)*t+a[3]!)*t+a[4]!)*t+a[5]!)*u /
        (((((b[0]!*t+b[1]!)*t+b[2]!)*t+b[3]!)*t+b[4]!)*t+1)
  } else {
    const t = Math.sqrt(-2 * Math.log(1 - p))
    q = -(((((c[0]!*t+c[1]!)*t+c[2]!)*t+c[3]!)*t+c[4]!)*t+c[5]!) /
         ((((d[0]!*t+d[1]!)*t+d[2]!)*t+d[3]!)*t+1)
  }

  return mu + sigma * q
}

/**
 * Cumulative normal distribution (CDF).
 * Equivalent to pnorm() in R.
 */
export function pnorm(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / (sigma * Math.SQRT2)
  return 0.5 * (1 + erf(z))
}

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 +
               t * (-1.453152027 + t * 1.061405429))))
  const result = 1 - poly * Math.exp(-x * x)
  return x >= 0 ? result : -result
}

/**
 * Quantile function of the lognormal distribution.
 * Equivalent to qlnorm(p, meanlog, sdlog) in R.
 */
export function qlnorm(p: number, meanlog: number, sdlog: number): number {
  return Math.exp(meanlog + sdlog * qnorm(p))
}

/**
 * Cumulative lognormal distribution (CDF).
 * Equivalent to plnorm(x, meanlog, sdlog) in R.
 */
export function plnorm(x: number, meanlog: number, sdlog: number): number {
  if (x <= 0) return 0
  return pnorm(Math.log(x), meanlog, sdlog)
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
  const mu  = policyCount * dmg_my
  const varTotal = policyCount * dmg_sd * dmg_sd
  const loginv_my = Math.log(mu * mu / Math.sqrt(mu * mu + varTotal))
  const loginv_sd = Math.sqrt(Math.log(varTotal / (mu * mu) + 1))
  return { loginv_my, loginv_sd }
}
