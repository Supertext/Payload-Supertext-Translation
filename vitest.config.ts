import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The integration suite boots a real Payload instance on in-memory SQLite.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
