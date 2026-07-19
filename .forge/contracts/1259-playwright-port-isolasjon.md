# Kontrakt: Playwright port-isolasjon per worktree (#1259)

## Problem

En lokal Playwright-kjøring kan stille drive **en annen worktrees** dev-server: `playwright.config.ts` har hardkodet `baseURL: 'http://localhost:3000'` + `webServer.port: 3000`, og `reuseExistingServer: !process.env.CI` gjenbruker enhver server som allerede lytter på porten — også en fra en søster-worktree eller nattkjøreren. Resultatet er falskt grønt (eller falskt rødt): flyten passerer uten at branchens egen kode kjørte (dokumentert hendelse under #1142, der cup-specen traff `issue-1145`-worktreens femstegs-veiviser). CI er trygg (`reuseExistingServer: false`); fella rammer kun lokale/agent-kjøringer — nøyaktig der stagingbevis (#1076) skrives.

Eierbeslutning 2026-07-19: **nivå 1 (env-port) + nivå 3 (docs-vakter)** bygges nå; nivå 2 (`/api/health`-identitetssjekk) er utsatt til #1299.

## Research-funn (verifisert mot docs 2026-07-19)

- **Playwright (v1.59, API-ref `TestConfig.webServer`):** `port` er IKKE deprecated. En satt `port` arves automatisk som `baseURL` («port 8080 produces baseURL equal http://localhost:8080»). `reuseExistingServer: true` gjenbruker enhver server på porten; `false` kaster hvis noe lytter.
- **Fallgruve — `webServer.env`:** dokumentert som «Environment variables to set for the command, `process.env` by default» — å sette `env` kan *erstatte* default-arven, ikke utvide den. Velges env-varianten må `...process.env` spres inn; `-p`-flagget i kommandoen er tryggere.
- **Next 16 CLI (docs 16.2.10):** `next dev -p <port>` og `PORT`-env støttes begge. `PORT` kan IKKE settes i `.env`-filer (HTTP-serveren booter før de leses). Med `npm run dev` må flagg videresendes med `--`: `npm run dev -- -p 3100`.

## Tidligere beslutninger

- **#698:** path-only URL-regex matcher aldri (`toHaveURL` sammenligner mot absolutt URL) — de absolutte regexene i specs skal *forbli* absolutte, bare port-deriverte.
- **#1132/#1183:** reporter/trace/timeout/`PW_CHROMIUM_EXECUTABLE_PATH`-blokkene i `playwright.config.ts` og kommentarene deres røres ikke.
- **staging-verify-skillet** har allerede lsof-vakten med #1259-referanse (SKILL.md ~linje 72–74) — nivå 3 der er en justering, ikke en ny seksjon.

## Design

**Nivå 1 — én kilde for porten** øverst i `playwright.config.ts`:

```ts
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
```

- `use.baseURL`: `` `http://localhost:${PORT}` ``
- `webServer.port: PORT`
- `webServer.command` må boote dev-serveren på SAMME port — anbefalt `` `npm run dev -- -p ${PORT}` `` (eksplisitt; unngår env-erstatnings-fella over).
- `reuseExistingServer: !process.env.CI` **beholdes uendret** — gjenbruk av din *egen* server på din *egen* port er hastighets-featuren; isolasjonen kommer fra portvalget.
- En kort kommentar ved konstanten som peker på #1259 (hvorfor porten er env-styrt).
- De to specene med absolutt URL-regex deriverer regexen fra samme port i stedet for hardkodet `localhost:3000`: bruk `baseURL`-fixturen (`async ({ page, baseURL })`) eller les `PLAYWRIGHT_PORT` direkte. Regexen forblir absolutt (#698-lærdommen står i koden — oppdater kommentaren, ikke slett den):
  - `e2e/auth/invitation-flow.spec.ts:197–199`
  - `e2e/signup/self-withdraw.spec.ts:83`
- **CI: null diff.** `PLAYWRIGHT_PORT` settes ikke i CI → default 3000, `reuseExistingServer: false` som før.

**Nivå 3 — docs-vakter:**

- `docs/test-discipline.md`, Type D-seksjonen: nytt kort kulepunkt om fella — lokalt gjenbruker Playwright enhver server på porten (også en fremmed worktrees); kjør worktree-isolert med `PLAYWRIGHT_PORT=<unik port>`, og verifiser eierskap før du stoler på et resultat: `lsof -ti:<port>` → `lsof -a -p <pid> -d cwd`.
- `.claude/skills/staging-verify/SKILL.md` (lsof-avsnittet ~linje 72–74): pek på unik port per worktree (`PLAYWRIGHT_PORT` for e2e-kjøringer / egen port for Playwright-driveren) som *primær* isolasjonsmekanisme; behold lsof-sjekken som verifikasjon. Liten justering av eksisterende kulepunkt, ikke restrukturering.

## Kanttilfeller & vakter

- `PLAYWRIGHT_PORT` satt til ugyldig verdi → kryptiske feil langt unna årsaken. NB: `??` fanger IKKE tom streng — `PLAYWRIGHT_PORT=''` gir `Number('')` = `0`, ikke default 3000. Vakten må derfor avvise alt som ikke er et heltall i 1–65535 (ikke bare `NaN`), og kaste med klar melding.
- To worktrees med **samme** `PLAYWRIGHT_PORT` har fortsatt fella — det er docs-notens jobb å kreve unik port + lsof-verifikasjon; koden kan ikke se det (det er nivå 2 / #1299).
- `scripts/loops/screenshot-routes.ts` (egen `SCREENSHOT_BASE_URL`-env), `.claude/launch.json`/preview-lanen og `discord-pr-card.yml` er egne lanes med egne mekanismer — utenfor scope.
- Ingen endring i `workers`/`retries`/`trace`/`locale`-oppsettet.

## Nøkkelbeslutninger

- **Env-navn: `PLAYWRIGHT_PORT`** (eierbeslutning) — ikke bare `PORT`, som ville kollidert med Next-semantikk i shell-miljøer der `PORT` allerede er satt.
- **Nivå 2 bygges ikke** — utsatt til #1299 (Backlog, scale-triggered: bygges hvis 1+3 ikke holder).
- **Verifikasjonsspec: `e2e/demo/demo.spec.ts`** — offentlig, uinnlogget, ingen Supabase-service-env; relative `goto`-kall som følger baseURL. Billigste ekte ende-til-ende-bevis.
- **Commit-disiplin:** ikke bruker-synlig → prefiks `test(e2e):` for config+specs og `docs(test):` for docs-filene (passerer commit-msg-hooken fritt, ingen version-bump/CHANGELOG). **Hver commit-body må ha `Refs #1259`** (commit-msg-hooken avviser bodyer uten issue-referanse). PR-body: `Closes #1259`. Stagingbevis-porten: kommentér «ikke bruker-synlig — porten gjelder ikke» per skillets steg 0.

**Claude's discretion:**

- Om `use.baseURL` beholdes eksplisitt (anbefalt — dagens config er eksplisitt og det leser tydeligst) eller hviler på ports auto-derivering.
- `-p`-flagg i kommandoen vs. `env: { ...process.env, PORT: String(PORT) }` — begge korrekte, flagget anbefalt.
- Eksakt ordlyd/plassering av docs-kulepunktene og regex-deriverings-hjelperen i specene.

## Suksesskriterier

- [ ] `playwright.config.ts`: én `PORT`-konstant fra `PLAYWRIGHT_PORT` (default 3000) driver `baseURL`, `webServer.port` og dev-kommandoen; ugyldig verdi feiler høyt (kodegjennomlesing + `PLAYWRIGHT_PORT=abc npx playwright test --list` viser klar feilmelding).
- [ ] **Isolasjonsbevis** (rekkefølgen er viktig — Playwright river ned en webServer den selv startet, så serveren må bootes manuelt for å overleve til inspeksjon):
  1. Dekoy på :3000: `python3 -m http.server 3000` (logg til fil).
  2. Boot worktreens egen server i bakgrunnen fra worktree-rota: `npm run dev -- -p 3100 &` (staging-env sourcet først: `set -a && source .env.staging.local && set +a` — jf. #736-fella om at Playwright ikke leser `.env.local` selv); vent til :3100 svarer.
  3. `lsof -a -p "$(lsof -ti:3100 | head -1)" -d cwd` viser byggets egen worktree.
  4. `PLAYWRIGHT_PORT=3100 npx playwright test e2e/demo/demo.spec.ts` er grønn (`reuseExistingServer` gjenbruker serveren fra steg 2).
  5. Dekoy-loggen på :3000 viser ingen app-requests under kjøringen. Rydd opp begge prosessene etterpå.
- [ ] **Default uendret:** uten env er `npx playwright test e2e/demo/demo.spec.ts` grønn mot :3000 som før.
- [ ] `grep -rn "localhost:3000" e2e/` → 0 treff (kode og kommentarer oppdatert).
- [ ] Type D-seksjonen i `docs/test-discipline.md` OG staging-verify-`SKILL.md` nevner begge `PLAYWRIGHT_PORT`/unik-port-mekanismen og lsof-vakten.

## Gates

- [ ] `npm run build` grønt (full gate, jf. bindings §T2)
- [ ] `npm run lint` grønt
- [ ] Co-located vitest: ingen forventet (`playwright.config.ts` og specene har ingen vitest-siblinger — glob bekrefter)

## Filer som trolig berøres

- `playwright.config.ts` — PORT-konstant + baseURL/port/kommando + vakt
- `e2e/auth/invitation-flow.spec.ts` — port-derivert absolutt regex (linje 197–199)
- `e2e/signup/self-withdraw.spec.ts` — port-derivert absolutt regex (linje 83)
- `docs/test-discipline.md` — Type D-kulepunkt om fella
- `.claude/skills/staging-verify/SKILL.md` — unik port som primærmekanisme, lsof som verifikasjon

## Utenfor scope

- Nivå 2 (`/api/health`-identitetssjekk med feil-høyt ved mismatch) → **#1299**
- `scripts/loops/screenshot-routes.ts`, `.claude/launch.json`, `.github/workflows/discord-pr-card.yml` — egne lanes/mekanismer
- Endring av `reuseExistingServer`-semantikken eller CI-oppførsel

## ⚠️ Koordinering mot nattkjøreren (kollisjonsregel)

Flake-arbeidet **#1272/#1288/#1168** kommer trolig også til å røre `playwright.config.ts` (workers/retries/trace-justeringer). Denne kontrakten og en fremtidig flake-kontrakt skal **aldri stå `autonomy:ready` samme natt** — sekvenser: den ene merges før den andre klargjøres (kollisjonsregelen fra nattkjører-preppen; nattkjøreren har ingen cross-branch-bevissthet). Per 2026-07-19 er `autonomy:ready`-køen tom og ingen av flake-issuene har autonomy-labels — #1259 kan trygt stå ready i natt.
