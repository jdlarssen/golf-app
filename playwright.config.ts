import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // On CI: serialize (workers: 1) so authenticated specs don't cluster logins
  // for the same few test users at once, and allow one retry to absorb a
  // transient prod-DB/network blip. Locally these stay at Playwright defaults.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  // #1132: when the @gate serie goes red the rig captured nothing — no trace,
  // no screenshot, no artifact — so a red→green-without-change flake could only
  // be guessed at from the text log. `list` keeps console output; `html` writes
  // an inspectable report to playwright-report/ (uploaded by ci.yml). `open:
  // 'never'` stops the reporter from trying to launch a browser on the headless
  // runner, which would hang/fail the job.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // #1132: capture the failing retry. With retries: 1 on CI, `on-first-retry`
    // traces exactly the retry that also failed (the one that made the job red)
    // without weighting green runs. Screenshot on failure is the cheap companion.
    // Traces/screenshots land in test-results/, collected as a CI artifact.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    baseURL: 'http://localhost:3000',
    // Baseline = norsk enhet. Uten denne arver kontekstene runnerens
    // OS-locale (typisk en-US), og locale-forhandlingen fra i18n Fase 0/1
    // server engelsk til specs som asserter norsk copy. Specs som tester
    // negotiation lager egne kontekster med eksplisitt locale.
    locale: 'nb-NO',
    // Routine-/nattkjører-miljøet har en pre-installert chromium hvis build ikke
    // matcher pinnet Playwright (1194 vs. 1223), så det bundlede registry-oppslaget
    // feiler med «Executable doesn't exist» før noen test kjører (#1183). Peker
    // PW_CHROMIUM_EXECUTABLE_PATH på binæren, brukes den direkte og oppslaget skjer
    // aldri. Usatt (CI, lokal utvikling) → dagens oppførsel, uendret.
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    // #1132: cold-start headroom. Default is 60s for the dev server to answer on
    // the port; a cold/contended Turbopack boot on a shared Actions runner can
    // exceed that and nuke the whole job before the server is reachable. 120s is
    // near-zero-risk and directly guards the leading flake hypothesis.
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
