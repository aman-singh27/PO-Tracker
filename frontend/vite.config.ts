import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    // jsdom costs ~30s to boot on Windows here, which overruns the pool's
    // worker-startup timeout once several files queue behind it. Only the
    // component test needs a DOM, so it opts in via a @vitest-environment
    // docblock and the pure-logic suites stay on the node environment.
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})