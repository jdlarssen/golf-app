# Evaluering: #538 cacheComponents-skall
**Verdikt: ACCEPT**
**Dato:** 2026-06-10
**Commit:** `3c8bdd1`

## Kriterium-for-kriterium

| # | Kriterium | Status | Bevis |
|---|-----------|--------|-------|
| K1 | `npm run build` exit 0; 81 ruter `◐` | PASS | Build grønn; `grep -c "◐"` = 81; resterende 9 = 2 API-handlers, apple-icon, 2 ikoner, export-ruter (3), logout, manifest — alle ƒ/○ som forventet |
| K2 | 2990/2990 tester grønne | PASS | `250 passed (250)`, `2990 passed (2990)` — 0 feil, 0 skipped |
| K3 | proxy.ts + server.ts urørt; 0 `'use cache'` | PASS | `git diff origin/main...HEAD --stat -- proxy.ts lib/supabase/server.ts` = tom; grep 'use cache' = 0 treff; getGameWithPlayers uendret |
| K4 | FØR-måling dokumentert i kontrakt | PASS (kode-nivå) | Dokumentert i kontrakt (post-deploy-del gjenstår som eksplisitt post-deploy, ikke blokkerende) |
| K5 | `cacheComponents: true` + rollback-kommentar | PASS | next.config.ts har flagget + «Rollback = remove this line»-kommentar; commit-body gjentar rollback-instruksen |
| K6 | 1.108.5→1.108.6 + CHANGELOG-oppføring | PASS | `package.json` diff viser korrekt bump; CHANGELOG har `[1.108.6] · #538`-oppføring; commit-msg-hook passerte |

## Gates

| Gate | Status |
|------|--------|
| `npm run build` grønn | PASS |
| `npm run test` full suite grønn | PASS |
| `proxy.ts` + `lib/supabase/server.ts` urørt | PASS |
| `'use cache'` = 0 forekomster | PASS |

## Skjulte oppførsels-endringer — hva jeg lette etter, hva jeg fant

**BottomNavGate props-paritet:** BottomNavGate.tsx kaller `getProxyVerifiedUserId()` og sender `userId` videre til `<BottomNav userId={userId} />` — nøyaktig samme kall og prop-kontrakt som layout.tsx brukte direkte. Ingen funksjonell endring, bare at kallet nå skjer ett nivå ned bak Suspense. CLEAN.

**PerfHud bak Suspense:** PerfHud.tsx er `'use client'` med `getServerSnapshot = () => false` (rendrer null på server, tomt på klient med mindre `?perf=1` er satt). Wrapping bak `<Suspense fallback={null}>` er semantisk identisk med tidligere direkte-render — ingen visuell forskjell. CLEAN.

**De 12 `force-dynamic`-strippene:** Sjekket alle 12 filer i diffen. I 10 av filene er eneste endring at `export const dynamic = 'force-dynamic'` (og tilhørende forklarings-kommentar) ble erstattet med en oppdatert kommentar — ingen logikk-endringer. De to API-route-handlerne (`/api/cron/product-update-digest`, `/api/unsubscribe/product-update`) har begge en `GET`-eksport og er dynamiske under cacheComponents by default; direktiv-fjerningen er no-op. Buildoutput bekrefter at begge fortsatt er `ƒ` (Dynamic). CLEAN.

**`finn-turneringer` og `spillformater` — 6-linjediff ikke bare 1:** Begge filer byttet kun kommentarene rundt force-dynamic-direktivet (3 linjer erstattet av 3 linjer) — ingen logikk-endring. Verifisert ved å lese begge filer i sin helhet etter commiten. CLEAN.

**`spillformater` — `Revalidate: 1d` i buildoutput:** Dette er ikke nytt fra denne commiten. Det stammer fra pre-eksisterende `unstable_cache` på `getModeContentMap` i `lib/formats/getModeContent.ts` (revalidate: 86400). Uendret av `3c8bdd1`. CLEAN.

**PwaBoot + InstallPromptCapture i root layout uten Suspense:** Begge er `'use client'`-komponenter. De bruker browser-APIer, ikke Next.js server-runtime-APIer (headers/cookies). De er ikke årsak til «Uncached data outside Suspense»-feil under cacheComponents, og trenger ikke Suspense-wrap. CLEAN.

**Ingen tester asserter på gammel layout-struktur:** `BottomNav.test.tsx` finnes, men tester kun `<BottomNav userId=...>`-komponenten direkte — ingen render av layout.tsx. Restructuringen påvirker ikke testene. CLEAN.

## Funn

Ingen funn som krever handling. Fase 5 (ETTER-TTFB-måling + golden-path live-sjekk) gjenstår post-deploy som kontrakt-definert kode-nivå-unntatt del — ikke blokkerende for ACCEPT.
