import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // On CI: serialize (workers: 1) so authenticated specs don't cluster logins
  // for the same few test users at once, and allow one retry to absorb a
  // transient prod-DB/network blip. Locally these stay at Playwright defaults.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
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
