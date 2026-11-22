import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build: the API serves the built
 * Angular app on :3100 in rules-only mode (deterministic, no LLM needed).
 * Build first: `npm run build` at the repo root.
 */
const chromePath = process.env.PW_CHROME_PATH; // optional: use a system Chrome instead of the Playwright download

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(chromePath ? { launchOptions: { executablePath: chromePath, args: ['--no-sandbox'] } } : {}) },
    },
  ],
  webServer: {
    command: 'node ../server/dist/server.js',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: !process.env.CI,
    env: { PORT: '3100', LLM_ENABLED: 'false', NODE_ENV: 'development', CORS_ORIGINS: 'http://localhost:3100', LOG_LEVEL: 'warn' },
  },
});
