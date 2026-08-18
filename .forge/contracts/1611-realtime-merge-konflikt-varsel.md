# Kontrakt: Konflikt-varsel også når begge enheter er på nett (#1611)

## Problem

Konflikt-varselet fra #688/#1368 («Hull 7 ble endret av en medspiller …»)
skrives i dag bare i drain-en (`lib/sync/syncWorker.ts:144–187`): når RPC-en
avviser den lokale skrivingen (`was_applied=false`) og server-raden har annet
slag-tall. Det dekker flymodus-tilfellet. Med nett på begge enheter kommer
varselet aldri — av to grunner som begge er «samme mønster, annet sted»:

1. **Pre-emption (issuets bokstavelige beskrivelse).** `mergeIncoming`
   (`lib/sync/realtime.ts:19–36`) LWW-er den innkommende realtime-raden rett
   inn i Dexie — inkludert `clientUpdatedAt` — uten å røre kø-elementet for
   samme nøkkel. Drain-en leser så en rad med server-tidsstempel, RPC-en
   avviser, `resolveConflict` sier `'equal'`, og konflikt-grenen kjører aldri.
   Vinduet er lite (HoleClient kaller `drainQueue` rett etter `writeScore`),
   men opptil 30 s hvis en drain alt var i lufta (`inFlight`-vakta).
2. **Det dominerende på-nett-tilfellet.** Markøren fører 5 for Kari; tallet
   når serveren. Ti sekunder senere taster Kari 4 selv. Realtime-eventet
   overskriver markørens lokale 5 med 4 — helt stille. Ingen kø, ingen drain,
   ingen varsel. Samme stillhet i `catchUp` (`RealtimeMount.tsx:24–39`, kjører
   på mount/focus/online — dvs. akkurat når iOS-PWA-en våkner) og i hull-
   sidens seed (`HoleClient.tsx:413–443`).

Konsekvens: intensjonen dokumentert i `lib/sync/db.ts:37–42` («the overwrite
is never silent») holder bare i offline-scenarioet. Eieren har valgt
(2026-08-18) at varselet skal bety: **«et tall du tastet på denne telefonen
ble byttet ut med et annet tall fra en annen telefon»** — uansett nett-status
og uansett om tallet ditt rakk serveren først.

## Research Findings

- **Dexie 4.4.2 — PrematureCommit.** Å `await`-e et ikke-Dexie-løfte (f.eks.
  `supabase.auth.getSession()`) inne i `localDb.transaction(...)` committer
  transaksjonen for tidlig og kaster `PrematureCommitError`
  (`node_modules/dexie/dist/dexie.js:4746`). ⇒ `currentUserId` MÅ løses opp
  FØR transaksjonen åpnes — nøyaktig slik `drainQueue` alt gjør (getSession
  én gang, deretter RPC og transaksjon).
- **Dexie-transaksjoner serialiserer på overlappende tabeller** (IndexedDB-
  garanti). Dagens `mergeIncoming` gjør `get` → `put` UTEN transaksjon; en
  `writeScore` (som er transaksjonell) kan skyte inn en NYERE lokal rad
  mellom lese- og skrivesteget, og merge-en klistrer så en eldre server-rad
  over brukerens ferske tast — kø-elementet peker da på feil rad. Latent
  data-tap; helperen under lukker det ved å ta beslutning + skriving i én
  rw-transaksjon over `scores` + `syncQueue` + `conflicts`.
- **Supabase Realtime `postgres_changes`** leverer skriverens egne endringer
  tilbake (ekko). Dagens `>=`-vakt dropper ekkoet fordi server-raden har
  samme `client_updated_at` som lokal rad — vakta beholdes uendret og er
  ekko-svaret på kontrakt-smedens spørsmål 2. `payload.old` på DELETE bærer
  bare PK-kolonner (REPLICA IDENTITY default); dagens felt-vakt i
  `subscribeGameScores` (`realtime.ts:53–55`) beholdes.
- **Ingen server-side slag-skriving utenfor RPC-en.** Eneste andre skriving
  mot `scores` er putts-backfill etter ferdig spill
  (`games/[id]/putter/actions.ts:88–94`) — rører ikke `client_updated_at`, så
  realtime-eventet droppes av `>=`-vakta. Alle slag-endringer som når
  helperen kommer altså fra en annen enhets tast (via `upsert_score_if_newer`,
  strikt `>` — `supabase/migrations/0123_add_scores_putts.sql:77`).

## Prior Decisions

- #688: LWW er bevisst; varselet er kun et signal, data konvergerer alltid til
  server-verdien. `resolveConflict`-semantikken og RPC-en røres ikke.
  Realtime/catch-up sin `>=`-vakt var «out of scope» i #688 — den ER fortsatt
  uendret her; det som legges til er hva som skjer *når* vakta slipper
  gjennom.
- #1368: «tastet på denne enheten» = `enteredBy === currentUserId` (fallback
  `enteredBy === userId` uten sesjon); `forOwnScore` skiller egen/medspiller-
  copy; `strokesChanged` gater (putts-endring alene varsler ikke). Alle tre
  gjenbrukes ordrett — de blir nå ÉN regel med ett hjem (se Design).
- #1457: drain-ens transaksjon avbryter med `'edited-mid-flight'` når lokal
  rad har fått nytt `clientUpdatedAt` under RPC-en. Merge-helperen spiller
  sammen med den: overskriver realtime raden mid-flight, ser drain-en avviket
  og rører ingenting — én ConflictRecord, aldri to (id = score-nøkkel, `put`).
- #1370/#1391: SyncBanner viser konflikter kun i spill-skopet instans; global
  instans hopper over. Uendret.

## Design

**Én merge-helper i `lib/sync/` for alle server→lokal-overskrivinger.**
Ny modul (navn: Claude's discretion, f.eks. `lib/sync/mergeServerScore.ts`)
med én eksportert funksjon som tar en server-formet rad (gameId, userId,
holeNumber, strokes, putts, enteredBy, clientUpdatedAt, serverUpdatedAt) og
`currentUserId: string | null`, og gjør — i ÉN Dexie rw-transaksjon over
`scores` + `syncQueue` + `conflicts`:

1. `existing = scores.get(id)`. Er `existing.clientUpdatedAt >= incoming` →
   returner uendret (dagens vakt; dekker ekko og eldre events).
2. Ellers er innkommende nyere:
   - Finnes `existing` OG `existing.strokes !== incoming.strokes` OG raden ble
     tastet her (delt regel fra #1368) → `conflicts.put({... localStrokes:
     existing.strokes, serverStrokes: incoming.strokes, forOwnScore, resolvedAt
     })` — samme record-form som drain-en skriver i dag.
   - `scores.put(incoming)`.
   - `syncQueue.delete(id)` — et ventende lokalt kø-element (også et
     karantene-satt, `abandonedAt`) gjaldt en verdi som nå har tapt LWW; å
     la det ligge gir enten en bortkastet RPC → `'equal'` → dequeue, eller et
     stående «kunne ikke lagres»-varsel for en rad som faktisk er i synk.
     Speiler drain-ens server-wins-dequeue.
3. Returverdi som gjør utfallet testbart (f.eks. `'kept' | 'applied' |
   'applied-with-conflict'`) — Claude's discretion på navn.

**Regelen får ett hjem.** «Tastet på denne enheten» + `forOwnScore` +
`strokesChanged` flyttes ut av `syncWorker.ts:156–172` til en delt, ren
funksjon (naturlig hjem: `lib/sync/conflict.ts`, som alt eier
`resolveConflict`) — f.eks. `conflictRecordFor(existing, incoming,
currentUserId): ConflictRecord | null`. Både drain-en og merge-helperen kaller
den. Ingen kopi av sammenligningen får overleve i to filer (trap 4).

**Tre kallesteder rutes gjennom helperen:**
- `lib/sync/realtime.ts` — `mergeIncoming` erstattes av helper-kall.
- `app/[locale]/games/[id]/RealtimeMount.tsx` — `catchUp`-løkka.
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` — seed-effekten.
  Den mangler `entered_by` fra serveren og skriver `enteredBy: ''` i dag; det
  er greit (`''` matcher aldri en bruker-id → aldri «tastet her»), men seed-en
  MÅ gjennom helperen: kjører den før `catchUp` på sidelast, overskriver den
  ellers raden uten deteksjon og `catchUp` ser like tidsstempler — samme
  bug ett nivå ned.

**`currentUserId` løses opp av kalleren, utenfor transaksjonen** (PrematureCommit
over). Én `getSession()` per subscribe / per catchUp-kjøring / per seed-kjøring
er nok; leses lokalt og virker offline. Aldri kast hvis oppslaget feiler —
`null` → fallback-proxyen.

**Ingen copy-endring.** `conflictNotice` / `conflictNoticeMarker`
(`messages/no.json:5384–5385`) er alt formulert generisk («ble endret av en
medspiller. Det nyeste tallet gjelder nå») og passer både offline- og på-nett-
tilfellet. Live-visning på samme hull varsler også (eierens valg) — ingen
«er du på dette hullet»-unntak.

## Edge Cases & Guardrails

Edge-tabell (T1 steg 4 — hver ikke-N/A-rad blir en test):

| Input-klasse | Forventet |
|---|---|
| Innkommende eldre/lik (ekko av egen skriving) | uendret rad, ingen record, kø urørt |
| Ingen lokal rad | put, ingen record |
| Lokal rad tastet her, ulikt slag, kø-element venter (issuets pre-emption) | record + overskriv + kø-element slettet |
| Lokal rad tastet her, ulikt slag, alt synket (dominerende på-nett) | record + overskriv |
| Lokal rad tastet her, likt slag, ulik putts | overskriv, ingen record |
| Lokal rad tastet av andre (`enteredBy` = medspiller eller `''` fra seed) | overskriv, ingen record |
| `currentUserId == null` | fallback `enteredBy === userId`; `forOwnScore` som i drain-en |
| Markør-rad (`userId` = medspiller, `enteredBy` = meg) | record med `forOwnScore: false` |
| Slag `5 → null` eller `null → 5` | teller som endret (som drain-en) |
| Kø-element med `abandonedAt` | slettes ved overskriving |
| Samme bruker fra to enheter | varsler på den første (samme regel; sjeldent, akseptert) |
| Klokkeskjevhet mellom enheter | LWW som før; maks én record per nøkkel (`put` på id) |

Guardrails:
- IKKE endre `resolveConflict`, RPC-en, migrasjoner, `>=`-vakta, karantene-
  klassifiseringen (#668) eller SyncBanner-rendringen. Databasen `'golf-app'`
  renames aldri; ingen Dexie-versjonsbump (ingen skjema-endring).
- Aldri `await` noe annet enn Dexie inne i transaksjonen.
- `lib/sync`-suiten (104 tester i 8 filer, hvorav `syncWorker.test.ts` 8) skal være grønn
  uendret i semantikk; drain-ens `'edited-mid-flight'`-sti forblir som den er.
- Kø-sletting i helperen må skje i samme transaksjon som `scores.put` — aldri
  et vindu der raden er overskrevet men kø-elementet står igjen.

## Key Decisions

- **Varsel-regel (eier, 2026-08-18): bred.** Beskjed hver gang et tall tastet
  på denne enheten byttes ut med et annet tall fra en annen enhet — online
  eller offline, før eller etter at det nådde serveren. Alternativ «bare
  kappløp-tap» (issuets bokstav) forkastet: dekker ikke det vanlige tilfellet.
- **Live-visning (eier, 2026-08-18): varsle alltid**, også når spilleren står
  på hullet og ser tallet skifte. Ingen posisjons-avhengig unntak.
- Ekko: løst av eksisterende `>=`-vakt — ingen ny tilstand.
- Kø-håndtering: helperen sletter kø-elementet selv (speiler drain-ens
  server-wins), framfor å la drain-en rydde via `'equal'`.
- TDD (Type A): rød test først for pre-emption OG for synket-så-overskrevet.
  Delt in-memory Dexie-mock: `syncWorker.test.ts` og `writeScore.test.ts` har
  hver sin kopi i dag; en tredje kopi er forbudt (CLAUDE.md test-disiplin) —
  trekk ut delt helper (f.eks. `lib/sync/testing/fakeDb.ts`) og bruk den i
  syncWorker-testen + den nye. Migrering av writeScore.test.ts er valgfri.

**Claude's Discretion:**
- Modul-/funksjonsnavn, returverdi-form, hvor `getSession` kalles (per
  subscribe vs per event) så lenge det skjer utenfor transaksjonen.
- Om drain-ens server-wins-overskriving også rutes gjennom merge-helperen
  (den er alt inne i en transaksjon; Dexie nøster) eller bare deler
  regel-funksjonen. Kravet er ÉN regel-definisjon, ikke én overskrivings-sti.
- Om seed-en i HoleClient begynner å sende `entered_by` fra page.tsx (liten
  forbedring) eller beholder `''`.

## Success Criteria

1. Ny unit-test: lokal rad tastet her med ventende kø-element, innkommende
   nyere rad med annet slag → ConflictRecord skrives, rad overskrives,
   kø-element borte. Rød på dagens kode (dagens `mergeIncoming` skriver ingen
   record), grønn etter.
2. Ny unit-test: lokal rad tastet her, alt synket (ingen kø), innkommende
   nyere rad med annet slag → ConflictRecord. Rød før, grønn etter.
3. Ny unit-test: innkommende eldre/lik → ingen skriving i noen tabell.
4. `grep -rn "localDb.scores.put"` utenfor `writeScore.ts` og merge-helperen
   gir null treff i `app/` + `lib/` (realtime.ts, RealtimeMount.tsx,
   HoleClient.tsx går alle via helperen).
5. Konflikt-regelen (`enteredBy`-sammenligning + `forOwnScore`) finnes på
   nøyaktig ETT sted; `syncWorker.ts` importerer den. Eksisterende `lib/sync`-suite
   (104 tester) grønn.
6. Staging (begge på nett, Playwright-driver — samme rigg som PR #1612):
   markør-kontekst fører 5 for medspiller og RPC-en er bekreftet;
   medspiller-kontekst taster 4; markørens side viser
   `[data-testid=conflict-notice][data-conflict-variant=marker]`; Dexie har
   `{localStrokes: 5, serverStrokes: 4, forOwnScore: false}`; SQL: raden står
   med `strokes 4`, `entered_by` = medspiller. Testdata ryddes; prod-vakt.
7. `.changes/1611-<slug>.md` (type `fix`, issue 1611) — ingen bump.

## Gates

- `npx tsc --noEmit` · `npm run lint` · `npx vitest run lib/sync
  components/sync` grønne (pre-push + CI); e2e `@gate` mot staging.
- `npm run build` (GameMode-/cacheComponents-feller fanges kun der).
- Bruker-synlig → staging-bevis (kriterium 6) + `staging-verified`-label FØR
  merge. Commit-prefix `fix`, `Refs #1611` i body.
- PR-body: «Fordeler/ulemper»-blokk (fix-PR). Produktvalget er tatt av eieren i
  denne økta — ingen `## Alternativer (produktvalg)`-seksjon; PR-en kan
  auto-merges når portene er grønne.

## Files Likely Touched

- `lib/sync/mergeServerScore.ts` (ny) + `lib/sync/mergeServerScore.test.ts` (ny)
- `lib/sync/conflict.ts` + `conflict.test.ts` — delt regel-funksjon
- `lib/sync/realtime.ts` — `mergeIncoming` → helper
- `lib/sync/syncWorker.ts` — bruk delt regel (+ evt. helper); `syncWorker.test.ts` — bytt til delt mock
- `lib/sync/testing/fakeDb.ts` (ny, navn valgfritt) — delt in-memory Dexie-mock
- `app/[locale]/games/[id]/RealtimeMount.tsx` — `catchUp` → helper
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` — seed → helper
- `lib/sync/db.ts` — kun doc-kommentaren på `ConflictRecord` (bredere betydning)
- `.changes/1611-<slug>.md`

## Out of Scope

- Copy-endringer i SyncBanner (nøklene dekker); navn i varselet (#1368 alt. B).
- Putts-konflikter; endringer i RPC/migrasjoner; `>=`-vakta.
- Karantene-/kø-banner-UX (#1369) — kø-slettingen her er en konsekvens av
  LWW, ikke en UX-endring.
- Leaderboard-realtime (`LeaderboardRealtime.tsx`, `PreRoundLeaderboard.tsx`)
  — de skriver ikke til Dexie.
- «Ikke varsle når jeg står på hullet» — eieren valgte bort.

---

## Verifikasjon (bygge-økt 2026-08-18)

| # | Kriterium | Bevis |
|---|---|---|
| 1 | Pre-emption: kø-element venter, nyere rad med annet slag → record + overskriv + kø tømt | `lib/sync/mergeServerScore.test.ts` «pre-emption: an incoming row that beats the drain still writes the notice». RØD mot dagens oppførsel (stub-kjøring: `expected 'applied' to be 'applied-with-conflict'`), grønn etter. |
| 2 | Synket, så overskrevet fra annen telefon → record | Samme fil, «already synced, then overwritten from another phone: notice». RØD før, grønn etter. |
| 3 | Innkommende eldre/lik → ingen skriving noe sted | Samme fil, «an older-or-equal row (the echo of my own write) touches nothing» — rad, kø og conflicts uendret. |
| 4 | `scores.put` kun i writeScore + merge-helperen | `grep -rn "scores\.put(" app lib components` (uten tester) → `lib/sync/writeScore.ts:64`, `lib/sync/mergeServerScore.ts:72`. |
| 5 | Konflikt-regelen ett sted; eksisterende suite grønn | `conflictRecordFor` i `lib/sync/conflict.ts`, importert av `syncWorker.ts` og `mergeServerScore.ts`. `npx vitest run lib/sync components/sync` → 11 filer / 145 tester grønne. |
| 6 | Staging, begge på nett | Playwright-driver mot `torny-staging` fra denne branchens dev-server (port 3141, `lsof`-verifisert cwd = worktreen). Alle steg grønne — bevis-tabellen ligger som kommentar på PR #1705, og evaluatoren kjørte driveren om igjen uavhengig med samme utfall. |
| 7 | `.changes`-notat, ingen bump | `.changes/1611-konfliktvarsel-pa-nett.md` (`type: fix`, `issue: 1611`); `weekly-release.mjs --dry-run` viser linja i ukeblokka. |

Porter: `npx tsc --noEmit` rent · `npm run lint` 0 errors (56 pre-eksisterende warnings) ·
`npx vitest run lib/sync components/sync` 145/145 · `npm run build` exit 0.
