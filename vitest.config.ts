import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@core':  resolve(__dirname, 'src/core'),
      '@store': resolve(__dirname, 'src/store'),
      '@ui':    resolve(__dirname, 'src/ui'),
      '@auth':  resolve(__dirname, 'src/auth'),
    },
  },
  test: {
    environment: 'node',
    include:     ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
