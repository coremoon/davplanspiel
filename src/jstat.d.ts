declare module 'jstat' {
  export const jStat: {
    normal: {
      cdf(x: number, mu: number, sigma: number): number
      inv(p: number, mu: number, sigma: number): number
      pdf(x: number, mu: number, sigma: number): number
    }
    lognormal: {
      cdf(x: number, mu: number, sigma: number): number
      inv(p: number, mu: number, sigma: number): number
      pdf(x: number, mu: number, sigma: number): number
    }
  }
}
