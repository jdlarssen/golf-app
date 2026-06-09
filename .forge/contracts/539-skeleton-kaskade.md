# Kontrakt: #539 — Én skeleton-form per inngangssti til leaderboard

**Issue:** [#539](https://github.com/jdlarssen/golf-app/issues/539)
**Branch:** `claude/distracted-colden-97ebc5`
**Skrevet:** 2026-06-10
**Status:** Aktiv

## Problem

Deep-link inn på et avsluttet spills leaderboard viser en kaskade av mismatchende loading-skeletons:

- **SPA-trykk fra hjem (primær flyt): 3 former** — `GameLoading` (game-home-form, feil) → `LeaderboardSkeleton` → `LeaderboardBodySkeleton`.
- **Hard reload av leaderboard-URL: 2 former** — `LeaderboardSkeleton` → `LeaderboardBodySkeleton`.

Begge stier live-verifisert på prod (v1.108.4, 2026-06-09). Skjelettene er hver for seg godt laget — problemet er sekvensen av ulike former, ikke estetikken. **Ikke redesign skjelettene.**

## Root cause (korrigert — se issue-kommentar 2026-06-09T22:00Z)

1. **Trinn #1 (GameLoading på leaderboard-URL):** Next 16-prefetch for dynamiske ruter henter «layout to first loading boundary». Første loading-grense under `games/[id]/` er `games/[id]/loading.tsx` (GameLoading) — den er den prefetchede instant-staten ved klikk, **uavhengig av layoutens await**. Issue-beskrivelsens opprinnelige fix #1 (gjøre layout-gating ikke-blokkerende) ville IKKE fjernet den — feil mekanisme, forkastet.
2. **Trinn #2→#3 (skjelett-til-skjelett-hopp):** `leaderboard/page.tsx` returnerer KUN `<Suspense fallback={<LeaderboardBodySkeleton/>}>` — null egen chrome. Den indre grensen bytter bare ett skjelett mot et annet uten reell streaming-gevinst.

## Design (vedtatt)

### A. Route group `(home)`

Flytt `app/games/[id]/page.tsx` + `app/games/[id]/loading.tsx` → `app/games/[id]/(home)/page.tsx` + `(home)/loading.tsx`. URL uendret (route groups strippes). Effekt: GameLoading dekker kun game-home; første loading-grense på leaderboard-stien blir `leaderboard/loading.tsx` → riktig form fra første frame.

- **Kun de to filene flyttes.** Co-located moduler (`ScheduledWaitingRoom.tsx`, `actions.ts`, `confirmActions.ts`, `RealtimeMount.tsx`, osv.) blir liggende på `[id]/`-nivå; relative imports i flyttet `page.tsx` justeres (`./ScheduledWaitingRoom` → `../ScheduledWaitingRoom`, `./trekk-fra/actions` → `../trekk-fra/actions`).
- `games/[id]/layout.tsx` (RealtimeMount-gating + SyncBanner) blir liggende og gjelder fortsatt alle undersider — ingen oppførsels-endring.

### B. Fjern indre Suspense-grense i leaderboard

I `leaderboard/page.tsx`: render `<LeaderboardBody …/>` direkte (uten `<Suspense fallback={<LeaderboardBodySkeleton/>}>`), og **slett** `LeaderboardBodySkeleton`-funksjonen (linje ~922). `leaderboard/loading.tsx` (`LeaderboardSkeleton`) dekker hele ventetiden. Ubrukte imports (`Suspense`) ryddes.

### C. Nye loading-grenser for undersider som mister arvet GameLoading

Etter A har `holes/[holeNumber]/` og `scorecard/` ingen loading-grense (i dag «arver» de GameLoading — feil form der også).

- **`holes/[holeNumber]/loading.tsx` (PÅKREVD):** enkel, hull-tasting-formet skeleton (AppShell + Skeleton-primitivene fra `components/ui/Skeleton`, samme stil som eksisterende skeletons). Hull-tasting er hotteste mid-runde-flyt.
- **`scorecard/loading.tsx` (BESLUTTET INKLUDERT):** scorekort-formet minimal skeleton. Begrunnelse: scorecard-nav har i dag instant feedback (om enn feil form); etter A ville den hatt null — det er en regresjon denne PR-en selv innfører.
- **Øvrige undersider** (`submit/`, `approve/`, `avslutt/`, `spillere/`, `rediger/`, `slett/`, `trekk-fra/`): får IKKE nye loading-filer. SPA-nav beholder gammel side til ny er klar (akseptabelt; sjeldne deep-links). Dokumentert, bevisst kutt.
- **`leaderboard/holes/` («Hull for hull»):** dekkes av `leaderboard/loading.tsx` — beslektet form, akseptabelt. Ingen egen fil.

### Eksplisitt IKKE i scope

- Layout-awaiten på `getGameWithPlayers` (mikro-opt, tag-cachet og som regel varm — fotnote i issuet, ikke kjerne).
- Redesign/sammenslåing av `LeaderboardSkeleton`-komponentens estetikk.
- `app/loading.tsx` / `app/admin/loading.tsx` (urørt).
- #538 (cacheComponents) — egen kontrakt.

## Suksesskriterier

- [ ] **K1:** SPA-navigasjon fra hjem til avsluttet spills leaderboard viser nøyaktig ÉN skjelett-form (leaderboard-formet). Verifiseres live på prod etter deploy (kald nav, skjermbilde-sekvens).
- [ ] **K2:** Hard reload av leaderboard-URL viser maks én skjelett-form. Verifiseres live etter deploy.
- [ ] **K3:** Game-home-navigasjon viser fortsatt GameLoading (ikke regressert). Kode-bevis: `(home)/loading.tsx` eksisterer i route-treet; build-manifest viser `/games/[id]` urørt URL.
- [ ] **K4:** `holes`-navigasjon har umiddelbar loading-feedback med hull-formet skeleton (ny `holes/[holeNumber]/loading.tsx`); scorecard tilsvarende.
- [ ] **K5:** RealtimeMount-gating fungerer som før — `layout.tsx` uendret (diff-bevis) eller verifisert ekvivalent.
- [ ] **K6:** `LeaderboardBodySkeleton` slettet, ingen døde referanser (`grep` = 0 treff). Ingen visuell endring på selve leaderboard-innholdet.
- [ ] **K7:** Patch-bump + CHANGELOG-oppføring i samme commit (fix-prefiks → hooken håndhever).

## Gates

1. `npm run build` — grønn (fanger route-tree-feil, tsc, manglende imports). Build-output skal vise `/games/[id]` og `/games/[id]/leaderboard` som ruter (URL uendret etter route group).
2. `npm run test` — full vitest-suite grønn (stabil etter #506-fiksen).
3. `npx eslint` på endrede filer — 0 nye feil.
4. `grep -rn "LeaderboardBodySkeleton" app/ components/` → 0 treff etter B.

K1/K2 (visuell sekvens) kan ikke verifiseres lokalt (auth-gated, prod-only-testing-modell) — verifiseres live via Claude in Chrome etter merge+deploy; hvis Chrome-økt ikke er tilgjengelig autonomt, flagges til eier med eksakt verifikasjonsoppskrift.

## Risiko / fallgruver

- **Route group-kollisjon:** `(home)/page.tsx` og en ev. annen `page.tsx` på samme URL-nivå ville kollidert — det finnes ingen annen, sjekket.
- **Import-stier:** flyttet `page.tsx` har 2 relative imports som må justeres (`./ScheduledWaitingRoom`, `./trekk-fra/actions`). e2e-spec refererer kun i kommentarer.
- **Prefetch-cache:** SmartLink prefetcher loading-UI; etter endringen prefetches LeaderboardSkeleton for leaderboard-lenker. Ingen kodeendring nødvendig i SmartLink.
- **Stale-soner:** ingen — ingen data-/cache-endringer, kun presentasjonsstruktur.
