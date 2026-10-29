/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Unit tests live next to the code; tests/ is the Playwright persona review.
  test: { include: ['src/**/*.test.ts'] },
})
