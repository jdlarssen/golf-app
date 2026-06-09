# Evaluering: #539 skeleton-kaskade
**Verdikt: ACCEPT**
**Dato:** 2026-06-10

## Kriterium-for-kriterium

### K1 — Indre Suspense fjernet fra leaderboard/page.tsx (PASS)

`grep -n "Suspense" app/games/[id]/leaderboard/page.tsx` gir 2 treff, begge kommentarer (linje 182 og 275). Ingen JSX `<Suspense>`. Filen importerer ikke `Suspense` fra react. `LeaderboardBody` rendres direkte på linje 279 uten wrapper. (home)/loading.tsx finnes.

### K2 — Kun én loading-grense på leaderboard-stien (PASS)

`app/games/[id]/loading.tsx` eksisterer ikke lenger (bekreftet via `ls app/games/[id]/`). `app/games/[id]/(home)/loading.tsx` eksisterer — dekker kun game-home. Første loading-grense på `/games/[id]/leaderboard` er nå `leaderboard/loading.tsx`. Live-verifisering gjenstår post-deploy (akseptert per kontrakt).

### K3 — Build-manifest viser (home)/page, URL uendret (PASS)

```
node -e "const m=require('./.next/server/app-paths-manifest.json'); ..."
(home)/page present: true
Plain /games/[id]/page (bad): false
```

Build kjørt på HEAD etter fix-commit (`npm run build` grønn — "✓ Compiled successfully in 5.7s"). Manifest var 3 minutter eldre enn fix-commit, så nytt build ble kjørt og bekreftet K3.

### K4 — holes/[holeNumber]/loading.tsx og scorecard/loading.tsx opprettet (PASS)

`app/games/[id]/holes/[holeNumber]/loading.tsx`: default export `HoleLoading`, bruker `Skeleton` og `SkeletonCircle` fra `@/components/ui/Skeleton`. Inneholder header-rad, hull-stripe (12 brikker med delay), hero-seksjon og score-felt. Korrekt form.

`app/games/[id]/scorecard/loading.tsx`: default export `ScorecardLoading`, bruker `AppShell`, `Card`, `Skeleton` og `ScorecardTableSkeleton` fra `./TableSkeleton`. Chrome (TopBar-erstatning) + tee-box-kort + tabell-skeleton. Konsistent med sidens egne chrome.

`app/games/[id]/scorecard/TableSkeleton.tsx`: ny fil, eksporterer `ScorecardTableSkeleton` som named export. `scorecard/page.tsx` importerer fra `./TableSkeleton` (linje 11) og bruker den i indre `<Suspense fallback={<ScorecardTableSkeleton />}>` (linje 159). Den gamle lokale `ScorecardTableSkeleton`-funksjonen (som lå på linje 735 i d286dd5-versjonen) er borte — `grep -n "function.*Skeleton" scorecard/page.tsx` gir 0 treff.

### K5 — layout.tsx urørt (PASS)

```
git diff e993fd5~1..e993fd5 -- "app/games/[id]/layout.tsx"
```
Ingen output — tom diff. Layout uendret.

### K6 — 0 treff på LeaderboardBodySkeleton; ingen døde Suspense/Skeleton-imports (PASS)

```
grep -rn "LeaderboardBodySkeleton" app/ components/ lib/
(ingen treff, exit 1)
```

`Suspense` finnes ikke som import i `leaderboard/page.tsx` (kun i kommentarer). `Skeleton` finnes heller ikke som import der — aldri brukt i den filen.

### K7 — Version bump 1.108.4→1.108.5 og CHANGELOG-oppføring (PASS)

```
git show e993fd5 -- package.json | grep version
-  "version": "1.108.4",
+  "version": "1.108.5",
```

`CHANGELOG.md` inneholder `### [1.108.5] - 2026-06-10 · #539` med tagline og `<details>`-seksjon i samme commit. commit-msg-hooken passerte (ingen `--no-verify`).

## Gates

| Gate | Resultat |
|------|----------|
| `npm run test` | **250 filer / 2990 tester grønne** (31.15s) |
| `npm run build` | **Grønn** — "✓ Compiled successfully in 5.7s" |
| `npx eslint` på 6 endrede filer | **0 feil, 1 pre-eksisterende warning** (`Button` unused i (home)/page.tsx — kjent, ikke introdusert her) |
| `grep LeaderboardBodySkeleton` | **0 treff** |

## Funn

### Stale kommentar i e2e (ikke blokkerende)

`e2e/signup/self-withdraw.spec.ts` linje 63 refererer `app/games/[id]/page.tsx:416` i en kommentar. Filen heter nå `app/games/[id]/(home)/page.tsx`. Linje-nummeret kan ha endret seg. Kommentaren har ingen funksjonell påvirkning, men er teknisk utdatert. Kan ryddes opp i en separat `chore`-commit.

### Stale kommentar i lib/games/scorecardTitle.ts (ikke blokkerende)

`lib/games/scorecardTitle.ts` linje 13 refererer `app/games/[id]/page.tsx` i en doc-kommentar. Samme situasjon — kommentar-only, ingen funksjonell konsekvens.

### Stale kommentar i lib/admin/gameErrorMessages.ts (ikke blokkerende)

Linje 13 og 107 refererer `app/admin/games/[id]/page.tsx` — dette er admin-ruten som *ikke* ble flyttet. Korrekt referanse.

### Ingen Suspense-wrap i scorecard/page.tsx — avvik fra kontrakt-design? (ikke blokkerende)

Kontrakten (C.K4) sier "scorecard/loading.tsx (chrome + delt TableSkeleton)". Scorecard/page.tsx beholder sin indre `<Suspense fallback={<ScorecardTableSkeleton />}>` rundt datahenting. Dette er riktig: scorecard har en indre async-komponent som drar data; den indre Suspense-grensen gir progressiv rendering av tabellen, mens `loading.tsx` dekker initial-ventetiden. Skjelettformene er nå konsistente (begge bruker `ScorecardTableSkeleton`). Ikke et avvik — dette er korrekt design.

## Live prod-verifisering (2026-06-10 00:35, Claude in Chrome, tornygolf.no v1.108.5 · 0663f11)

- **K1 LIVE PASS:** SPA-trykk fra hjem på «Byneset North 7. juni» (avsluttet) → første frame er LeaderboardSkeleton (podium + compact-rader, «‹ LEADERBOARD»-header) — riktig form, ingen GameLoading. Innhold (Skins-duellvisning) committer direkte fra samme form. Skjermbilde-sekvens: ss_71586n2yl → ss_949610anz.
- **K2 LIVE PASS:** cmd+R på leaderboard-URL → innhold rendres direkte (varm path), ingen skjelett-kaskade observert. Maks én form.
- **K3 LIVE PASS:** Direkte navigasjon til game-home → riktig innhold, alle CTA-er til stede, ingen regresjon.
