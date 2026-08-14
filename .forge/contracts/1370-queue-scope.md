# Forge-kontrakt — #1370 Kø-status og submit-sperre teller slag på tvers av spill

**Issue:** [#1370](https://github.com/jdlarssen/golf-app/issues/1370) — «Kø-status og
submit-sperre teller slag på tvers av spill» (HCD-audit F29, P3)
**Type:** `fix` (bruker-synlig → notatfil under `.changes/`)

## Problem

Tre flater leser hele Dexie-synckøen uten gameId-filter:

- `components/sync/SyncBanner.tsx:64–66` — `localDb.syncQueue.toArray()` ufiltrert.
  Banneret rendres fra spill-layouten (`app/[locale]/games/[id]/layout.tsx:30`), så det
  vises alltid i kontekst av ETT spill — men teller alle spills elementer.
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx:468–471` — `pendingCount`
  over hele køen, mates til `SyncStatusLine` (`:1131–1135`).
- `app/[locale]/games/[id]/submit/SubmitForm.tsx:35–40` — global kø-count driver
  `syncing`, som både sperrer submit (`:66`) og disabler «Lever ✓» (`:84`).

Henger et element igjen fra runde A, viser runde B «N slag venter», og «Lever ✓» låses
med «Lagrer slag …» — for slag som ikke tilhører runden. Kø-nøkkelen er
`${gameId}:${userId}:${holeNumber}` (`lib/sync/db.ts:74–80`, `SyncQueueItem.id ===
scoreId`, håndhevet av eneste skriver `lib/sync/writeScore.ts:41,66–67`), så filtrering
er triviell. `ConflictRecord` bærer allerede `gameId` som eget felt (`db.ts:43–51`,
feltet `:45`) — samme kryss-runde-forvirring gjelder konflikt-varslene.

**⚠ Submit-sperren er IKKE rent game-scopet:** på en splittet cup-dag markerer
`submitScorecard` også innsenderens front9-søskenrunde som levert
(`app/[locale]/games/[id]/submit/actions.ts:151–199`, #1466 — `.eq('game_id',
sibling.gameId)` via admin-client; søskenet er en ANNEN gameId, jf.
`lib/games/segmentSibling.ts:186`). Frysingen skjer per `(game_id, user_id)`
(`supabase/migrations/0102_….sql:60–90`), og et frosset kort får `was_applied=false` i
RPC-en — som sync-workeren behandler som suksess og SLETTER kø-elementet
(`lib/sync/syncWorker.ts:83–84,157,162`). Et naivt «kun dette spillet»-filter på
submit-sperren ville altså gjeninnføre nettopp datatapet #668-sperren finnes for.

## Design (Alternativ A — valgt)

1. **Filter-helper i Dexie-fritt modul `lib/sync/queueScope.ts`:**
   `belongsToGame(scoreId: string, gameId: string)` → `scoreId.startsWith(\`${gameId}:\`)`
   (+ evt. utvalgsfunksjoner for banner/sperre). Én definisjon, tre konsumenter. IKKE i
   `db.ts`: ingen test i repoet importerer den reelle `lib/sync/db` (alle mocker den) —
   en Type A-test som gjorde det ville instansiere Dexie under jsdom uten indexedDB.
2. **`SyncBanner` får `gameId`-prop** fra spill-layouten (layouten har `id` fra params,
   `layout.tsx:14`; banneret er montert nøyaktig ett sted — verifisert repo-bredt).
   Aktive elementer (`abandonedAt == null`) filtreres til gjeldende spill —
   venter/feil-copyen og «Prøv igjen» gjelder kun runden brukeren står i.
3. **Strandede slag forblir aldri stille (#668-prinsippet):** abandonerte elementer fra
   gjeldende spill vises som i dag; abandonerte elementer fra ANDRE spill vises som én
   egen, lavmælt linje («N slag fra en annen runde fikk ikke lagret» e.l. — endelig copy
   via humanizer). Aktive (fortsatt-retryende) elementer fra andre spill skjules.
4. **Konflikt-varslene filtreres på `conflict.gameId`** — via Dexie-indeksen
   (`.where('gameId').equals(gameId)`; `conflicts` er indeksert på gameId, `db.ts:67`).
   `syncQueue` har INGEN slik indeks (`db.ts:62,66`) — der er JS-prefiks-filteret riktig.
5. **`HoleClient` filtrerer `pendingCount`** med samme helper (har `gameId` allerede).
   Behold ÉN `toArray()`-lesing filtrert i JS — `HoleClient.test.tsx:96–109` låser
   useLiveQuery-kall-rekkefølgen (3 kall), og mock-fabrikken i `HoleClient.test.tsx:11–25`
   må utvides hvis komponenten importerer nye symboler fra `@/lib/sync/*`.
6. **`SubmitForm` får `blockingGameIds`-prop** (rendres fra `submit/page.tsx:439`;
   `front9Sibling` beregnes allerede i samme `ReviewBody`, `page.tsx:232–240`):
   `[gameId, ...(front9Sibling ? [front9Sibling.gameId] : [])]`. Sperren teller
   ikke-abandonerte elementer fra ALLE spill leveringen kan fryse — dette spillet OG en
   evt. split-cup-søskenrunde (#1466-kaskaden, se Problem). Elementer fra urelaterte spill
   blokkerer ikke lenger «Lever ✓». Mount-drainen (`drainQueue()`, `SubmitForm.tsx:45`)
   drainer fortsatt hele køen. `wasPending`-refresh-logikken (`:51–59`) følger det
   filtrerte tallet.
7. **Nye strenger i meldingskatalogen** (begge locales, namespace `SyncBanner` finnes:
   `messages/no.json:5334` + `en.json:5334`) — ikke hardkodet norsk, så #1355
   (SyncBanner-i18n, egen kontrakt) ikke får større restanse.

`drainQueue`/sync-worker røres ikke — den drainer fortsatt hele køen uansett spill.

## Alternativer (produktvalg)

**Anbefaling:** Alternativ A — filtrer all status til runden du står i, men behold én
lavmælt linje for strandede slag fra andre runder.

**Alternativ A (valgt): filter + lavmælt fremmed-linje for strandede slag**
- Fordeler: statusen stemmer alltid med runden du ser på; «Lever ✓» låses aldri av en
  annen rundes slag; tapte slag forsvinner aldri i stillhet (regelen fra #668 står).
- Ulemper: to banner-varianter å vedlikeholde; linja kan ikke navngi hvilken runde
  slagene tilhører (Dexie lagrer ikke spillnavn — bare id); litt mer copy å oversette.

**Alternativ B: strengt filter — alt fra andre runder skjules helt her**
- Fordeler: enklest mulig kode og copy; null ekstra banner-varianter; fremmede slag
  dukker opp igjen når spilleren åpner den runden de tilhører.
- Ulemper: strandede (abandonerte) slag kan forbli usynlige lenge hvis spilleren aldri
  åpner den gamle runden igjen — et tapt slag blir i praksis stille, i strid med
  #668-prinsippet; arrangøren mister sjansen til å fange det opp mens gjengen er samlet.

**Ombyggingskostnad B:** liten — fjern fremmed-linja og dens katalognøkler; filteret er
felles for begge.
**Reversibilitet:** full — ren visningslogikk, ingen datamodell- eller synk-endring,
ingen datatap ved bytte.

Svar «alternativ B» i PR-en, så bygges det om på samme branch. Ingen hast — PR-en venter
til du svarer eller merger.

## Edge Cases & Guardrails

- **Prefiks-matching er trygg:** gameId er UUID og nøkkelen kolon-delt — `startsWith`
  på `` `${gameId}:` `` (med kolon) kan ikke treffe et annet spill.
- **Fremmed AKTIVT element som senere strander:** dukker opp i fremmed-linja idet
  `abandonedAt` settes — ingen tilstand går tapt ved filtreringen.
- **Banner-tomtilstand:** ingen elementer i dette spillet + ingen fremmede strandede →
  banneret rendrer `null` som i dag.
- **`router.refresh()`-løkka i SubmitForm (`:51–59`):** `wasPending` må følge det
  FILTRERTE tallet, ellers refresher fremmede elementers tømming siden unødig.
- **Split-cup-søsken (#1466):** sperren dekker søskenrundens gameId (design pkt. 6) —
  egen Type A-test på utvalgsfunksjonen: fremmed-men-søsken-element ⇒ fortsatt sperret.
- **Test-disiplin (verifisert tilstand):** SyncBanner og SubmitForm har INGEN tester i
  dag (hver har dermed sin ene Type C-render-test tilgjengelig); `HoleClient.test.tsx`
  finnes — K2 løses via helper-unit-test + utvidelse av den eksisterende testen, ikke en
  ny render-test.

## Key Decisions

- Filtrering skjer i leserne (UI), ikke i køen/skriverne — drain-semantikken er global
  og skal forbli global.
- `belongsToGame`-helperen bor i nytt Dexie-fritt `lib/sync/queueScope.ts` (testbar uten
  indexedDB); nøkkelformatets hjem forblir `scoreKey` i `db.ts` — helperen konsumerer
  formatet, definerer det ikke på nytt.
- Submit-sperren scoper på «spill leveringen kan fryse» (gjeldende + split-cup-søsken),
  ikke naivt på gjeldende gameId — datataps-kaskaden i Problem er grunnen.
- Konflikt-filtreringen tas med (samme prinsipp, feltet finnes allerede og er indeksert)
  — det er del av «status gjenspeiler runden», ikke scope-utvidelse.

## Success Criteria

- [ ] **K1** — Med et kø-element fra spill A i Dexie viser spill Bs banner ingen
  vente-/feil-status for det. _Evidens: unit-test på filter-/utvalgslogikken._
- [ ] **K2** — `SyncStatusLine`-tellingen på hull-siden teller kun denne rundens
  elementer. _Evidens: filtrert `pendingCount` i HoleClient + test der det er naturlig._
- [ ] **K3** — «Lever ✓» er aktiv når køen kun inneholder elementer fra spill leveringen
  IKKE berører; sperren står når egne slag venter — OG når et element tilhører en
  split-cup-søskenrunde (#1466). _Evidens: Type A-tester på utvalgsfunksjonen, inkl.
  fremmed-men-søsken-casen + staging-runde (K7)._
- [ ] **K4** — Strandede slag fra andre runder gir én lavmælt linje (A); strandede i
  gjeldende runde vises som i dag. _Evidens: render-/unit-test etter Type-reglene._
- [ ] **K5** — Konflikt-varsler vises kun i runden de gjelder. _Evidens: filter på
  `conflict.gameId` + test._
- [ ] **K6** — Nye strenger i `messages/no.json` + `en.json`; NO-copy humanizer-kjørt;
  paritetstestene grønne. _Evidens: `npx vitest run messages/`._
- [ ] **K7** — Staging-klikkrunde: legg manuelt inn et kø-element fra et annet spill i
  Dexie (devtools) → åpne aktiv runde → banner/hull-side/Lever ✓ upåvirket; strandet
  fremmed element → lavmælt linje vises. _Evidens: beskrevet runde + skjermbilder på PR._
- [ ] **K8** — `fix`-commit med notatfil under `.changes/` (bruker-synlig) + `Refs #1370`.

## Gates

`npm run typecheck` · `npx vitest run lib/sync components/sync HoleClient messages` ·
`npm run lint` · staging-verifisering (K7) FØR merge.
NB: `components/sync` har i dag NULL testfiler (vitest feiler på tomt filter) — stien er
gyldig først når den nye SyncBanner-testen ligger der; juster filteret deretter.

## Files Likely Touched

- `lib/sync/queueScope.ts` — NY: `belongsToGame` + utvalgsfunksjoner (Dexie-fritt)
- `components/sync/SyncBanner.tsx` — gameId-prop, filter, fremmed-linje, konflikt-filter
  (+ dens ene nye render-test)
- `app/[locale]/games/[id]/layout.tsx` — send `gameId` til SyncBanner
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` — filtrert pendingCount
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.test.tsx` — utvid
  mock-fabrikken (`:11–25`) hvis nye `@/lib/sync/*`-symboler importeres
- `app/[locale]/games/[id]/submit/SubmitForm.tsx` + `submit/page.tsx` —
  `blockingGameIds`-prop (gjeldende + evt. `front9Sibling.gameId`, `page.tsx:232–240`)
- `messages/no.json` + `messages/en.json` — fremmed-linje-copy
- Type A-tester på queueScope-funksjonene

## Out of Scope

- #1367 (sync-motoren startes bare fra hull-siden), #1366 (realtime resubscribe),
  #1368 (LWW-varsling), #1369 (abandonert-alarmens UX), #1355 (full SyncBanner-i18n) —
  alle har egne kontrakter i køen.
- `drainQueue`-/sync-worker-semantikk — drainer fortsatt hele køen.
- Navngiving av fremmed runde i linja (krever lokal spillnavn-lagring — ikke verdt det nå).


---

## Drift-tabell (verifisert mot HEAD 2026-08-14, etter #1355/#1369/#1371/#1367-merger)

| Kontrakt-påstand | Status på HEAD |
|---|---|
| `SyncBanner` mangler `gameId`-prop | **UTDATERT** — proppen finnes (`SyncBanner.tsx:82`, optional), brukes i dag kun av `summarizeQuarantine` |
| Strandede slag fra andre spill trenger NY lavmælt linje + ny copy (design pkt. 3) | **ALLEREDE BYGGET av #1369** — `quarantineOtherGame`-linja med lenke til det andre spillet finnes. Behold den; IKKE bygg ny variant. K4 = verifiser eksisterende oppførsel består |
| `components/sync` har null testfiler | **UTDATERT** — `SyncBanner.test.tsx` finnes. Utvid den; respekter maks-én-render-assertion-disiplinen per ny oppførsel |
| Nye strenger i meldingskatalogen (design pkt. 7 / K6) | **TROLIG UNØDVENDIG** — fremmed-linja finnes; aktiv-filtrering og konflikt-filtrering trenger ingen ny copy. K6 = N/A hvis ingen nye nøkler |
| `SyncBanner.tsx:64–66` ufiltrert kø-lesing | GJELDER — nå `:86–89` (queue) og `:93–96` (conflicts), begge ufiltrerte |
| `HoleClient.tsx:468–471` pendingCount | GJELDER — nå `:472–477` (`abandonedAt == null`-filter, men uten gameId-filter) |
| `SubmitForm.tsx:35–40` global sperre | GJELDER — nå `:36–39` (`localDb.syncQueue.filter((i) => i.abandonedAt == null).count()`) |
| `startSyncListener`-effekt i HoleClient (mock-fabrikk-utvidelse) | **FJERNET av #1367** — mock-fabrikken har ikke lenger `startSyncListener`-nøkkel |
| Kvarantene-grenens `summarizeQuarantine(queue, gameId)` | Får HELE køen ufiltrert — det er RIKTIG og skal bestå (fremmed-linja avhenger av det) |

---

## Bygge-evidens (2026-08-14)

K1–K5, K8: PASS (evaluator runde 1 ACCEPT, uavhengig verifisert — se `.forge/evaluations/1370-queue-scope.md`). K6: N/A per drift-tabellen (ingen nye nøkler, ingen hardkodet norsk). K7: staging-runde gjøres i PR-fasen. Gates: vitest 143/143, lint 0 errors, tsc exit 0, `npm run build` exit 0 (builder-kjøring med pipefail).

K7 (staging): PASS 2026-08-14 — Playwright-driver: fremmed aktivt element sperrer ikke «Lever ✓», #1369-linja består for strandet fremmed element, eget element sperrer fortsatt; 0 server-lekkasje. Bevis: kommentar på PR #1610.
