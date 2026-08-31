import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Next carrega .env.local sozinho no webServer; o processo do Playwright não —
// carregamos aqui pra que os specs saibam se há DATABASE_URL (skip dos testes
// que exigem contas seedadas: `npm run seed:test-accounts`).
loadEnv({ path: '.env.local' });

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    // Em CI o job roda `npm run build` antes; local reaproveita o dev server.
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
