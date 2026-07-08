# Spec: Skjermbilder av GUI-endringer på PR-kortet (#1159, Del B)

**Issue:** #1159 · **Branch:** claude/1159-del-b-skjermbilder (stacket på Del A / PR #1160) ·
**Milestone:** 13 · Eier-valg 2026-07-08: **bred dekning** (statiske sider + seedede
fiksturer for spill/leaderboard, bane, klubb/cup/liga og admin).

Bygger på Del A. Lukker #1159 (`Closes #1159` på denne PR-en).

## Problem

Del A gir merge-knapp på alle grønne PR-er, men for en GUI-endring vil eieren **se**
flaten, ikke bare lese en tagline. Del B: rører diffen en visuell flate, kjør
Playwright mot **staging**, ta skjermbilde(r) av berørt(e) rute(r), og fest dem på
det samme Discord-kortet ved siden av merge-knappen.

## Research Findings

- **Boot-oppskriften finnes:** `e2e`-jobben i `ci.yml` kjører `npm run dev`
  (localhost:3000) pekt mot **torny-staging** Supabase via repo-secrets
  (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `E2E_ADMIN_EMAIL`, `E2E_PLAYER_EMAIL`), + `npx playwright install --with-deps
  chromium` + Turbopack-binding-guard (#1095). Del B speiler dette.
- **Login gjenbrukes:** `signInViaOtp(page, email)` i `e2e/_helpers/games.ts` minter
  OTP via service-role `admin.generateLink` og driver verify-steget på `/login`.
  Fikstur-seedere finnes òg (`seedActiveStablefordGame`, `createTestGame`, cleanup).
- **Aldri prod:** Vercel Preview er ikke wiret til staging enda («Fase 2 PENDING»),
  så preview kan backe mot prod → vi booter appen i CI mot staging i stedet.
- **Rutekart** (fra `find app/[locale] -name page.tsx`): statiske (`/`, `/login`,
  `/demo`, `/baner`, `/legal/*`, admin-indekser) + dynamiske (`/games/[id]/*`,
  `/baner/[slug]`, `/cup/[id]`, `/liga/[id]`, `/klubber/[id]`, `/admin/**/[id]`).
- **check_suite → `github.sha` = PR-head**, så `actions/checkout` henter koden under
  review. Workflow-DEFINISJONEN er alltid default-branch (check_suite pinner den);
  scripts/app fra PR-head. Solo-repo → å kjøre PR-head-kode med staging-secrets er trygt.

## Design

### 1. `lib/loops/prScreenshots.ts` (ny, ren logikk — vitest)
- `isVisualChange(files): boolean` — sann hvis noen fil matcher `app/[locale]/**/*.tsx`
  eller `components/**/*.tsx` (ekskl. `*.test.tsx`).
- `type RouteTarget = { path; auth: 'admin'|'player'|'none'; label }`.
- `deriveTargetsFromChangedFiles(files, fixtures): RouteTarget[]`:
  - **Page-endringer** (`app/[locale]/<segs>/page.tsx`): strip `[locale]` + route-grupper
    `(...)`; map dynamiske segmenter til fikstur-verdier (`[slug]`→courseSlug,
    `[id]` under games/→gameId, cup/→cupId, liga/→ligaId, klubber/→clubId,
    admin/spillere/→playerId, `[holeNumber]`→1); auth = `admin` under `admin/`,
    `none` for public-settet (`/`, `/login`, `/demo`, `/baner[/*]`, `/legal/*`,
    `/embed/*`), ellers `player`. Segment uten fikstur → dropp ruten.
  - **Komponent-endringer** (`components/<dir>/…`): kuratert `COMPONENT_ROUTE_MAP`
    for høyverdi-familier (leaderboard, scorecard, hull/holes, game-home, wizard,
    podium) → seedet game-rute. Ukjent → ingen target.
  - Dedupe på path, prioriter page-derivert, **cap 3**. Ingen target men
    `isVisualChange` → fallback `/` (forsiden).
- Fiksturer injiseres (rene funksjoner testes med plain objekt).

### 2. `scripts/loops/decide-pr-card.ts` (ny, tsx — INGEN npm ci)
Gate (åpen · CI grønn · ikke kortet — gjenbruker `lib/loops/prCard`) + `isVisualChange`
+ `deriveTargetsFromChangedFiles` (med placeholder-fiksturer). Skriver `pr-card-plan.json`
(`{ shouldCard, isGui, pr, targets }`) og `should_card`/`is_gui` til `$GITHUB_OUTPUT`.
Endrede filer via `GET /repos/{r}/pulls/{n}/files`.

### 3. `scripts/loops/screenshot-routes.ts` (ny, Playwright — npm ci)
Kjøres kun når `is_gui`. Resolver ekte fiksturer mot staging (seed ett game via
`seedActiveStablefordGame`; query første course/club/cup/liga; playerId = E2E_PLAYER),
substituerer i targets, logger inn (admin + player-kontekst via `signInViaOtp`),
navigerer, `page.screenshot()` → `pr-shots/<n>.png` (mobil 390×844, light). Rydder
seedet game i finally. Best-effort per rute (én feil dropper ruten, ikke jobben).

### 4. `scripts/loops/post-pr-card.ts` (endres)
Leser `pr-card-plan.json` hvis den finnes (ellers dagens Del A-oppførsel). Finnes
PNG-er i `pr-shots/` → post kortet som **multipart/form-data** (`payload_json` +
`files[n]`) så bildene henger på meldingen ved siden av merge-knappen; ellers JSON
som før. Dedup-label uendret (post-så-label).

### 5. `.github/workflows/discord-pr-card.yml` (endres)
checkout (PR-head) → setup-node → **decide** (`npx --yes tsx decide-pr-card.ts`) →
if `is_gui && should_card`: npm ci + Turbopack-guard + playwright install + boot
`npm run dev` (staging-env, bakgrunn, vent på :3000) + `screenshot-routes.ts` →
if `should_card`: **post** (`post-pr-card.ts`). Staging-secrets som i `e2e`-jobben.
Failure-alarm beholdes.

## Edge Cases & Guardrails
- **Aldri prod:** skjermbilder tas mot staging-bootet app; seed/cleanup scoped med
  `TEST-`-prefiks (games.ts-mønster).
- **Best-effort:** manglende fikstur/nav-feil/boot-timeout dropper skjermbilder, men
  kortet postes uansett (merge-knappen er primærverdien). Playwright-feil aldri rød jobb.
- **Idempotens:** dedup-labelen fra Del A styrer ett kort per PR; decide gater før boot.
- **Ikke-visuell PR** (backend/docs): `is_gui=false` → hopper boot, poster Del A-kort.
- **Cap 3 skjermbilder** — kortet forblir lesbart; droppede rapporteres i logg.
- **PR-head-kode med secrets:** solo-repo, ingen fork-PR-er (dokumentert antakelse).

## Key Decisions
- Mobil-viewport (390×844) — appens primærcase (iPhone Safari).
- Boot app i CI mot staging (ikke Vercel-preview) — «aldri prod» til Preview-Fase-2.
- Rute-resolusjon mekanisk fra page-sti + fikstur-substitusjon (bred), liten kuratert
  komponent-map, forsiden som siste fallback (per issue «ellers forsiden»).
- Én seedet game dekker alle `/games/[id]/*` + game-komponent-familiene.

**Claude's Discretion:** fil-/funksjonsnavn, viewport-tall, component-map-innhold, boot-wait-detaljer.

## Success Criteria
- [ ] **B1** `lib/loops/prScreenshots.ts` + Type A-tester: `isVisualChange`,
  page→route-derivasjon (statisk, dynamisk m/fikstur, admin-auth, dropp uten fikstur),
  komponent-map, cap 3, forsiden-fallback. `npx vitest run lib/loops/prScreenshots` grønn.
- [ ] **B2** `decide-pr-card.ts` mot ekte PR (dry): skriver `pr-card-plan.json` med
  riktig `isGui` + targets — verifisert lokalt mot en ekte PR.
- [ ] **B3** `screenshot-routes.ts` kjørt LOKALT mot staging (Node 22, `.env.staging.local`):
  booter/logger inn/navigerer/skriver minst ett ekte `pr-shots/*.png`. (Bevis-artefakt.)
- [ ] **B4** `post-pr-card.ts` multipart-sti bygget + enhets-/dry-verifisert (payload_json
  + files); JSON-stien uendret når ingen PNG-er.
- [ ] **B5** `.github/workflows/discord-pr-card.yml` utvidet (decide→betinget screenshot→post);
  gyldig YAML.
- [ ] **B6** Fulle gates grønne (typecheck · test · lint · build · guard.test.sh).
- [ ] **B7** Docs (`docs/loops/discord-pr-kort.md`) oppdatert med Del B.
- [ ] **B8 (CI-aktivering, post-merge — ikke blokkerende for ACCEPT):** en ekte GUI-PR
  utløser skjermbilder festet på Discord-kortet. Full Playwright-i-CI-sti bevises først
  når workflowen ligger på main + staging-secrets (finnes alt fra e2e-jobben).

## Gates
- [ ] `npm run typecheck` · `npm test` · `npm run lint` · `npm run build` · `bash tests/hooks/guard.test.sh`

## Out of Scope
- Auto-merge (uendret — menneske-porten står).
- Video/interaktiv preview; Vercel-preview-lenke (til Preview-Fase-2 er wiret).
- Diff-region-annotering / visuell regresjon (kun rå skjermbilder v1).
