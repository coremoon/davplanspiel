import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: process.env['VITE_BASE_URL'] ?? '/',

  resolve: {
    alias: {
      '@core':  resolve(__dirname, 'src/core'),
      '@store': resolve(__dirname, 'src/store'),
      '@ui':    resolve(__dirname, 'src/ui'),
      '@auth':  resolve(__dirname, 'src/auth'),
      '@i18n':  resolve(__dirname, 'src/i18n'),
    },
  },

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
