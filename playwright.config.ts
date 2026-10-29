import { defineConfig, devices } from '@playwright/test'

// Persona review gate (docs/REVIEW-PERSONAS.md): every check runs on a phone and a laptop.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'en-IN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } },
  ],
})
