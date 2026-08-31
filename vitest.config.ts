import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the PWA plugin does not run for tests.
// Everything under test is pure logic, so the node environment is enough —
// storage.ts already falls back safely when localStorage is absent.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
