# Evaluering: #1370 kø-scoping

**Verdikt: ACCEPT**

Evaluert mot kontrakten inkl. drift-tabellen (som vinner der de spriker). Gates kjørt
selv på Node v22.23.0: `npx vitest run lib/sync components/sync "app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.test.tsx" messages`
→ 11 filer, 143 tester grønne · `npm run lint` → 0 errors (55 pre-eksisterende warnings,
ingen nye i berørte filer) · `npm run typecheck` → exit 0 · `node scripts/weekly-release.mjs --dry-run`
→ notatet `1370-kostatus-per-runde.md` validerer (minor-bump beregnet). `npm run build`
IKKE re-kjørt: diffen legger til én ren TS-modul + prop-trådning — ingen nye deps,
ingen route-/runtime-config, ingen server/client-grense-endring; tsc+lint+vitest dekker
feilmodusene, og byggeren kjørte build.

## Kriterier

- **K1 — PASS.** `lib/sync/queueScope.test.ts` («aktivt element fra en annen runde
  teller ikke») + `SyncBanner.test.tsx` («aktivt slag fra en annen runde gir ingen
  status her») — aktivt g2-element med lastError → tomt DOM med `gameId="g1"`.
  Diskriminerende: på origin/main ga samme fixture `hasErrors=true` → banner.
- **K2 — PASS.** `HoleClient.tsx:479–481` filtrerer med `isActiveForGame(item, gameId)`;
  fortsatt ÉN `toArray()`-lesing. 3-kall-rekkefølgen består (localRows → localScoredRows
  → syncQueue, verifisert i kilden: `:442/:457/:478`); ny test bruker samme modulo-3-
  kontrakt og ville feilet på gammel kode (pendingCount=1 → sync-dot via `:1141`).
- **K3 — PASS.** `isBlockingItem`-tester dekker eget slag (sperrer), split-cup-søsken
  (sperrer), urelatert runde (sperrer ikke), karantene (sperrer ikke), tom liste.
  `submit/page.tsx:444–447` sender `[gameId, ...(front9Sibling ? [front9Sibling.gameId] : [])]`
  — nøyaktig kontraktens uttrykk; `front9Sibling` beregnes kun for back9-vert med
  turnering, som før.
- **K4 — PASS.** `SyncBanner.tsx:169`: `summarizeQuarantine(queue, gameId ?? null)` får
  fortsatt HELE køen ufiltrert; `abandoned`-filteret (`:128`) er uendret. Pre-eksisterende
  #1369-test «fremmed rundes karantene får egen linje med lenke til runden» består grønn.
- **K5 — PASS.** `SyncBanner.tsx:96–102`: `localDb.conflicts.where('gameId').equals(gameId)`
  — Dexie-indeksen (`db.ts:67`) gjør filtreringen. Ingen egen unit-test på selve
  where-kallet: callbacken lever bak useLiveQuery-mocken, og en test ville enten
  instansiere Dexie under jsdom (som kontrakten selv forbyr) eller bare asserte
  mock-form. Kode-verifisert; akseptabelt etter repoets test-disiplin.
- **K6 — N/A** (per drift-tabellen). `messages/` urørt i diffen; ingen nye nøkler trengtes
  og ingen hardkodet norsk bruker-copy lagt til (kun kommentarer/testnavn).
  Paritetstestene (messages-suiten) grønne i kjøringen over.
- **K7 — DEFERRED** til PR-fasen (staging-klikkrunde utenfor evaluators scope).
- **K8 — PASS.** `4a678f04` (fix) inneholder `.changes/1370-kostatus-per-runde.md`
  (`type: fix`, `issue: 1370`, én linje — dry-run-validert); begge commits har
  `Refs #1370` i body.

Adversarielle sjekker: (a) prefiks-sikkerhet testet eksplisitt (`g1` vs `g11`, begge
retninger — kolonet i `${gameId}:` gjør treffet eksakt; uuid-er er kolonfrie);
(b) `gameId` udefinert → ufiltrert i begge ternaries (`SyncBanner.tsx:98–100,:133–135`),
og banneret monteres i dag kun fra spill-layouten MED gameId (`layout.tsx:32`; TopBar
refererer bare z-index i kommentar); (c) `showRetry = active.length > 0` følger det
scopede settet — kun fremmede aktive elementer → banner `null`, og retry-drain skjer
uansett globalt via sync-workeren; (d) `wasPending`/`router.refresh()` følger `syncing`
som følger det filtrerte tallet (`SubmitForm.tsx:74–82`), og Dexie-dep-en er
verdi-stabil via `blockingKey`; (e) de 4 konverterte HoleClient-testene endrer KUN
mock-oppsettet (assertions uendret i diff-konteksten), gjenbruker filens
pre-eksisterende `useLiveQueryImplWithLocalRows` (origin/main:118), og konverteringen
var NØDVENDIG: med `mockReturnValue` fikk kø-slottet score-rader uten `scoreId` →
`belongsToGame(undefined, …)` → TypeError under render; ingen adferd maskeres
(testene asserter aldri sync-dot); (f) `syncWorker.ts`/drain urørt — mount-drainen i
SubmitForm og handleRetry drainer fortsatt hele køen.

## Funn

Ingen.
