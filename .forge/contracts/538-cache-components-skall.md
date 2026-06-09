# Kontrakt: #538 — cacheComponents-skall for å fjerne dynamisk-render-gulvet

**Issue:** [#538](https://github.com/jdlarssen/golf-app/issues/538)
**Branch:** `claude/distracted-colden-97ebc5`
**Skrevet:** 2026-06-10 (etter research + to probe-builds)
**Status:** Aktiv — **GO**

## Bakgrunn og GO-beslutning

Fase 2 av #416: cookie-basert auth gjør hver rute dynamisk (`ƒ`), så ingen HTML kan serveres fra CDN — alt venter på ~250ms+ server-render. Målet er statisk skall (chrome/loading-fallbacks) servert umiddelbart + dynamisk innhold streamet bak Suspense.

**Research-funn som endrer issuets premiss (verifisert i installert Next 16.2.6-dok + to probe-builds):**

1. `cacheComponents: true` er **stabilt toppnivå-flagg** i Next 16 — IKKE eksperimentelt slik issuet antok (det var etterfølgeren `experimental.ppr` som forsvant). Issuets risiko-kalkyle er utdatert.
2. Flagget er **globalt og binært**: hver rute må overholde reglene («Uncached data was accessed outside of `<Suspense>`» feiler builden), ingen per-rute opt-in. Build-en er selv compliance-sjekkeren — feilene kan ikke overses stille.
3. **Probe-build 1** (kun flagget på): 12 filer feiler på `export const dynamic = 'force-dynamic'` (inkompatibelt med flagget; alt er dynamisk by default så direktivet er overflødig).
4. **Probe-build 2** (uten segment-configs): kompilering + TypeScript **grønne**; static generation feiler fail-fast på «Uncached data outside Suspense». Sannsynlig hovedårsak: **root layout** kaller `getProxyVerifiedUserId()` (`headers()`) for BottomNav — det ligger over alle loading-grenser og rammer alle 92 sider.
5. Semantikk-skifte å være obs på: navigasjon bruker React `<Activity>` (ruter skjules i stedet for unmount; effects ryddes ved skjuling — RealtimeMount-cleanup består). SW er network-first på navigasjoner — ingen konflikt.

Eier ba eksplisitt om dette arbeidet (forge-run 2026-06-10) — «tas kun hvis gulvet plager»-forbeholdet i issuet er dermed avklart.

## Design (faser)

### Fase 1 — fjern 12 × `force-dynamic`
`app/admin/liga/{page,[id]/page,[id]/slett/page}`, `app/api/cron/product-update-digest/route`, `app/api/unsubscribe/product-update/route`, `app/finn-turneringer/page`, `app/klubber/[id]/liga/[ligaId]/{page,slett/page}`, `app/liga/[id]/{page,meld-av/page,runde/[roundId]/spill/page}`, `app/spillformater/page`. Under flagget er alt dynamisk by default — direktivet er redundant (for route handlers var det det allerede). Kommentarer som begrunner direktivet fjernes/justeres.

### Fase 2 — root layout: BottomNav bak Suspense
`app/layout.tsx` kaller `getProxyVerifiedUserId()` (runtime-API `headers()`) direkte → blokkerer statisk skall for hele appen. Ekstraher til en async child:

```tsx
// components/ui/BottomNavGate.tsx (server component)
async function BottomNavGate() { const userId = await getProxyVerifiedUserId(); return <BottomNav userId={userId} />; }
// app/layout.tsx: <Suspense fallback={null}><BottomNavGate /></Suspense>
```

`fallback={null}`: BottomNav er fixed bottom — at den dukker opp når streamen committer gir null layout-shift for innholdet. Root layout blir da helt statisk (fonts, html-skall, klient-komponentene PwaBoot/InstallPromptCapture/PerfHud).

### Fase 3 — iterativ build-løkke til grønn
`npm run build` → fiks neste «Uncached data outside Suspense» → repeat. Virkemidler i prioritert rekkefølge:

1. **Ingen endring** — ruter der eksisterende loading-grense (root `app/loading.tsx`, `app/admin/loading.tsx`, #539-grensene) allerede dekker tilgangen.
2. **Ny route-level `loading.tsx`** — riktig-formet, gjenbruk eksisterende skeleton-primitiver/-komponenter. Ikke redesign.
3. **Page-intern `<Suspense>`** rundt den dynamiske delen når en loading-fil ville vært feil form.
4. **`'use cache'` KUN for genuint bruker-uavhengig data** (f.eks. format-katalog). ALDRI på auth-/RLS-avhengig data — cookie-avhengig innhold skal streames, ikke caches.

### Fase 4 — det som IKKE røres
- `lib/games/getGameWithPlayers.ts` beholder `unstable_cache` (deprecated men støttet; konvertering til `'use cache'`+`cacheTag` er egen oppgave hvis builden ikke tvinger det — minimer blast radius).
- `proxy.ts`, `lib/supabase/server.ts`, hele auth-/RLS-modellen: uendret.
- `revalidateTag`-konsumenter: to-arg-formen brukes allerede overalt — kompatibel.
- Dexie/sync, RealtimeMount, SW: uendret.

### Fase 5 — måling + live-verifisering
- Før/etter TTFB på `/login` (umatchet/offentlig) og `/` + `/games/[id]/leaderboard` (innloggede; måles via Chrome DevTools/Network på prod). Dokumenter metodikk + tall i issue-kommentar. Variansen på Hobby-tier er stor — kravet er dokumenterte tall, ikke en lovet prosent.
- Golden-path live-sjekk på prod etter deploy: hjem → avsluttet spill → leaderboard → game-home → «Hull for hull» → scorekort + innboks/profil. Ingen synlig regresjon.

## Bail-out (hard grense)

Hvis fase 3 krever **strukturell omskriving av mer enn ~15 ruter** (utover å legge en loading-fil/Suspense-wrap eller flytte ett kall), eller noe tyder på endret RLS-/auth-oppførsel: STOPP, rapportér funn på issuet, foreslå oppdeling. Ikke press gjennom.

## Suksesskriterier

- [x] **K1:** `cacheComponents: true` committet (`3c8bdd1`); `npm run build` exit 0; **81 av 90 ruter `◐` Partial Prerender**, resterende 9 er route handlers/manifest (`ƒ`/`○`, forventet). Bevis: `/tmp/538-build-r2.log`.
- [x] **K2 (kode-nivå):** vitest 250 filer / 2990 tester grønne etter endringen. Golden-path live-sjekk gjenstår post-deploy (fase 5, obligatorisk før issue lukkes).
- [x] **K3:** `git diff --stat -- proxy.ts lib/supabase/server.ts` = tom; `grep -rn "'use cache'" app/ lib/ components/` = **0 treff** — ingen caching av cookie-/RLS-avhengig data i det hele tatt.
- [x] **K4 (før-halvdel):** FØR-måling prod www (5 samples, 00:40): `/login` TTFB 0.234–0.594s (median ~0.24s), `/legal/privacy` 0.216–0.776s (median ~0.24s). ETTER-måling gjøres post-deploy og dokumenteres i issue-kommentar.
- [x] **K5:** Rollback = fjern config-linja (dokumentert i commit-body + config-kommentar). Fjernede force-dynamic er no-op begge veier — verifisert ved at probe-build 2 (uten flagg-relaterte feil i de 12 filene) kjørte compile+tsc grønt.
- [x] **K6:** 1.108.5→1.108.6 + CHANGELOG `[1.108.6] · #538` i commit `3c8bdd1` (commit-msg-hook passerte).

**Build-løkke-historikk (fase 3):** Runde 1: 2 rapporterte rute-feil → `--debug-prerender` viste at ALLE 51 rapporterte feilkilder pekte på samme linje: `<PerfHud />` i root layout (`usePathname()` = runtime-data). Runde 2 (PerfHud bak Suspense): grønn. Totalt inngrep: 12 strips + BottomNavGate + PerfHud-wrap — langt under bail-out-grensen på 15 strukturelle omskrivinger.

## Gates

1. `npm run build` — grønn, alle 92 sider genererer.
2. `npm run test` — full suite grønn.
3. `npx eslint` på endrede filer — 0 nye feil.
4. `git diff` viser `proxy.ts` + `lib/supabase/server.ts` urørt.
5. `grep -rn "'use cache'" app/ lib/ components/` — hver forekomst begrunnet i commit-melding (forventet: 0–3, kun bruker-uavhengig data).

## Risiko / fallgruver

- **Runtime-oppførsel utenfor test-dekning:** vitest kjører ikke Next-runtime; `<Activity>`-navigasjon og streaming-semantikk verifiseres kun live (fase 5 obligatorisk FØR issue lukkes).
- **`unstable_cache` under flagget:** dokumentert støttet, men om builden likevel krever konvertering → det er en strukturell omskriving som teller mot bail-out-grensen.
- **Fail-fast-builds skjuler totalomfang:** hver build viser bare første feilende rute — løkka kan ta mange runder (~2 min/build). Akseptert kostnad; `--debug-prerender` brukes ved uklare feil.
- **Vercel Hobby:** runtime-LRU for `'use cache'` persisterer ikke mellom invocations — gevinsten er build-time-skallet på CDN, ikke runtime-cache. Forventningsstyring i måle-kommentaren.
