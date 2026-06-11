import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    // Baseline = norsk enhet. Uten denne arver kontekstene runnerens
    // OS-locale (typisk en-US), og locale-forhandlingen fra i18n Fase 0/1
    // server engelsk til specs som asserter norsk copy. Specs som tester
    // negotiation lager egne kontekster med eksplisitt locale.
    locale: 'nb-NO',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
