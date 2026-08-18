import { defineConfig, devices } from '@playwright/test';
import { egressFromEnv } from './playwright.egress';

// #1259: én kilde for e2e-porten. Lokalt gjenbruker Playwright enhver
// dev-server som allerede lytter på porten (reuseExistingServer) — også en
// fremmed worktrees, som gir falskt grønt/rødt. Å styre porten med
// PLAYWRIGHT_PORT lar hver worktree kjøre isolert uten å redigere denne fila.
// Usatt → 3000 som før; CI setter den aldri, så CI-oppførselen er uendret.
// NB: `??` fanger ikke tom streng — PLAYWRIGHT_PORT='' gir Number('') = 0 —
// så vakten avviser alt utenfor 1–65535, ikke bare NaN.
const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
if (
  !Number.isInteger(PLAYWRIGHT_PORT) ||
  PLAYWRIGHT_PORT < 1 ||
  PLAYWRIGHT_PORT > 65535
) {
  throw new Error(
    `PLAYWRIGHT_PORT må være et heltall i 1–65535, fikk «${process.env.PLAYWRIGHT_PORT}».`,
  );
}

export default defineConfig({
  testDir: './e2e',
  // On CI: serialize (workers: 1) so authenticated specs don't cluster logins
  // for the same few test users at once, and allow one retry to absorb a
  // transient prod-DB/network blip. Locally these stay at Playwright defaults.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  // #1272: on CI give each `expect` web-assertion 10s (local keeps the 5s
  // default). A cold/contended Turbopack compile on the shared Actions runner
  // routinely pushes a first paint past 5s, which tripped toBeVisible/enabled
  // waits across unrelated @gate specs — extra headroom, no behavior change.
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
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
    baseURL: `http://localhost:${PLAYWRIGHT_PORT}`,
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
    // #1581: nattkjørerens VM sender utgående HTTPS gjennom en agent-proxy med
    // privat CA. Node arver det oppsettet, Chromium gjør det ikke — og
    // scoring-golden-path er den ene @gate-specen som må nå staging-Supabase rett
    // fra nettleseren (sync-motorens score-upsert). Speilingen leser HTTPS_PROXY/
    // NO_PROXY og NODE_EXTRA_CA_CERTS/SSL_CERT_FILE. Usatt (CI, lokal utvikling)
    // → tomt objekt, og denne blokka er bit-for-bit som før.
    ...egressFromEnv(process.env),
  },
  webServer: {
    // #1441: on CI, run the PRODUCTION server (`next build && next start`).
    // Next dev's cacheComponents machinery (renderWithRestartOnCacheMissInDev)
    // aborts in-flight fetches on cache-miss restarts under load; supabase-js
    // swallows the AbortError into `res.error`, which surfaced as clean 404s
    // (error/absence conflation, now fixed) and error-boundary renders across
    // the @gate suite. A prod server has no compile/restart machinery, so that
    // transient window doesn't exist — and it matches what staging/prod
    // actually run. Locally: keep `next dev` + reuse for fast iteration.
    // -p binder serveren til SAMME port som baseURL. Eksplisitt flagg
    // framfor `env: { PORT }`, som ville erstatte process.env-arven (#1259).
    command: process.env.CI
      ? `npm run build && npx next start -p ${PLAYWRIGHT_PORT}`
      : `npm run dev -- -p ${PLAYWRIGHT_PORT}`,
    port: PLAYWRIGHT_PORT,
    reuseExistingServer: !process.env.CI,
    // #1441: pipe the server's stdout into the job log (stderr pipes by
    // default, stdout was ignored). The request log with statuses + timing
    // breakdowns lives on stdout — without it a red run shows only the
    // client-side symptom, and the server-side cause has to be guessed.
    stdout: 'pipe',
    stderr: 'pipe',
    // CI: headroom for `next build` on a contended shared runner + prod-server
    // boot. Local keeps the #1132 cold-dev-boot headroom (default was 60s; a
    // cold/contended Turbopack boot can exceed it and nuke the run before the
    // server is reachable).
    timeout: process.env.CI ? 600_000 : 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
