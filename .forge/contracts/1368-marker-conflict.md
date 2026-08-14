# Kontrakt: Konflikt-varsel også når du førte for en medspiller (#1368)

## Problem

Konflikt-varselet fra #688 skrives bare når
`score.enteredBy === score.userId` (`lib/sync/syncWorker.ts:114–117`) — altså
kun for din egen score. I golf fører ofte én i flighten for de andre
(markør-rollen): alle kø-elementer på din enhet har `enteredBy = deg`, men
`userId = medspilleren` (`HoleClient.tsx` `onSetScore` setter alltid
`enteredBy: myUserId`). Taper din innføring LWW-kampen mot medspillerens egen
enhet, overskrives tallet du tastet helt stille — stikk i strid med intensjonen
dokumentert i `lib/sync/db.ts:37–42` («the overwrite is never silent»). Ingen
av partene får sjansen til å oppdage at to ulike tall ble tastet for samme hull.

## Design (Alternativ A — valgt)

1. **Riktig gate** (`syncWorker.ts`): hent innlogget brukers id én gang per
   drain via `supabase.auth.getSession()` (klienten finnes allerede i
   `drainQueue`; `getSession` leser lokalt lager og virker offline — `getUser`
   gjør nettverkskall og ville feilet akkurat når featuren trengs; samme
   figur som `realtimeChannel.ts:57–62`). Skriv ConflictRecord når
   `strokesChanged && score.enteredBy === currentUserId` — altså «tastet på
   denne enheten», uavhengig av hvem scoren gjelder.
   Belt-og-seler-fallback: er sesjonen borte (`currentUserId == null`), bruk
   dagens proxy `score.enteredBy === score.userId` (i praksis nesten
   uoppnåelig — uten sesjon feiler RPC-en før konflikt-grenen — men det koster
   én linje).
2. **Skill egen/andres i varselet**: nytt valgfritt felt
   `forOwnScore?: boolean` på `ConflictRecord` (`lib/sync/db.ts`) —
   non-indeksert, altså INGEN Dexie-versjonsbump (samme mønster som `putts` og
   `abandonedAt`; udefinert på gamle rader tolkes som egen score).
3. **Copy** (`SyncBanner.tsx` + `messages/no.json`/`en.json`): behold dagens
   `conflictNotice` for egen score; ny nøkkel for medspiller-tilfellet, f.eks.
   «Hull {holeNumber}: tallet du førte for en medspiller ble endret fra deres
   enhet» (nb, humanizer-runde før commit). Dismiss-flyten er uendret.

## Alternativer (produktvalg)

**Anbefaling:** Alternativ A — generisk «for en medspiller»-varsel. Fanger
gapet nå, uten nye data-avhengigheter i offline-stien.

**Alternativ A — varsel uten navn (bygget)**
- Fordeler: hele fiksen bor i sync-laget (offline-trygt, ingen nettverkskall);
  liten diff i filer som alt er godt testet; varselet kommer alltid, også
  offline.
- Ulemper: sier ikke HVEM det gjaldt — i en flight der du fører for to andre må
  dere sjekke hullet sammen; noe mindre presist enn issue-forslaget.

**Alternativ B — varsel med medspillerens navn («Hull 7 for Kari …»)**
- Fordeler: umiddelbart klart hvem som må sjekkes; matcher issue-forslaget
  ordrett.
- Ulemper: navn finnes ikke i Dexie — krever enten navne-oppslag over nett i
  konflikt-øyeblikket (kan feile offline, akkurat når konflikter oppstår) eller
  at navn begynner å lagres lokalt (ny lokal persistens å vedlikeholde).
- Ombyggingskostnad: middels — A-koden gjenbrukes, men navnekilden må bygges.

**Reversibilitet:** Høy — feltet er non-indeksert og additivt; copy kan byttes
fritt.

Eieren svarer i natt-PR-en («alternativ B») hvis A ikke er riktig, så bygges det
om på samme branch. Ingen hast — PR-en venter til svar eller merge.

## Edge Cases & Guardrails

- `strokes` like men `putts` ulike → fortsatt ingen varsel (`strokesChanged`
  gater, bevisst uendret semantikk — putts er sekundærdata).
- Begge fører for hverandre samtidig: hver enhet varsler om radene DEN tastet —
  riktig per design.
- Sesjon utløpt under drain: fallback-proxyen over; aldri kast.
- IKKE endre LWW-semantikken (`resolveConflict`), RPC-kallet eller
  karantene-logikken (#668) — kun konflikt-gaten + record-feltet + copy.
- Dexie-versjonsnummeret røres ikke (feltet er non-indeksert); databasen
  `'golf-app'` renames aldri.
- i18n: `catalogParity`-testen krever nøkkelen i begge kataloger.
- Koordinering: #1355 (kontraktert, i natt-køen) oversetter SyncBanner-copy og
  #1369 bygger om banner-meldingene — samme filer. Nattkjøreren bør ikke bygge
  disse tre samme natt på separate brancher; først-inn vinner, resten rebaser.

## Key Decisions

- «Tastet på denne enheten» defineres som `enteredBy === currentUserId` (ikke
  `enteredBy === userId`) — det er selve bug-fiksen. Bonus: den lukker også en
  kryssbruker-falsk-positiv på delte enheter (gjenglemte kø-rader fra bruker A
  kan i dag varsle bruker B; med ny gate matcher de ikke — relevant for #1404).
- TDD (Type A): ny test FØRST som reproduserer markør-tilfellet (lokal rad med
  `enteredBy = meg`, `userId = medspiller`, server-wins med endrede strokes →
  ConflictRecord skrives med `forOwnScore: false`). `drainQueue` har i dag
  ingen egen test-fil — legg `lib/sync/syncWorker.test.ts`. Mønstre som finnes:
  `vi.mock('./db', …)` med in-memory Maps (`writeScore.test.ts:19–44` — repoet
  bruker IKKE fake-indexeddb) + supabase-klient-mock
  (`realtimeChannel.test.ts:7–9`). drainQueue trenger en større db-mock-flate
  (syncQueue orderBy/update/delete, scores get/update, conflicts put) —
  trekk ut delt db-mock-helper framfor kopier-lim (kan røre writeScore.test.ts).

## Success Criteria

1. Ny unit-test: markør-scenarioet over gir ConflictRecord (feiler på dagens
   kode, grønn etter fiks).
2. Egen-score-scenarioet fra #688 er uendret dekket (regresjonstest).
3. SyncBanner viser medspiller-varianten når `forOwnScore === false`
   (maks én render-assertion, Type C-regelen).
4. Staging: markørens enhet OFFLINE (flymodus) mens markøren fører avvikende
   tall for en medspiller; medspilleren taster og synker sitt eget tall; markør
   går online → markørens enhet viser varselet. NB: er begge online hele tiden
   pre-empter realtime-merget (`lib/sync/realtime.ts:20–33` overskriver lokal
   rad uten å slette kø-elementet → `resolveConflict` gir 'equal') konflikt-
   grenen helt — det er et pre-eksisterende #688-hull som gjelder egen score
   like mye; builderen filer det som eget issue, det fikses ikke her.

## Gates

- `tsc` + `lint` + `vitest` (pre-push + CI) grønne; e2e `@gate` mot staging.
- Bruker-synlig → staging-verifisering (punkt 4) før merge.
- Commit: `fix`-prefix, patch-bump + CHANGELOG-linje, `Refs #1368`.
- Ny norsk copy → humanizer-skillet.

## Files Likely Touched

- `lib/sync/syncWorker.ts` (+ ny `lib/sync/syncWorker.test.ts`)
- `lib/sync/db.ts` (ConflictRecord-felt)
- `components/sync/SyncBanner.tsx` (+ ny `SyncBanner.test.tsx`, maks én
  render-assertion)
- `messages/no.json` + `messages/en.json`
- evt. `lib/sync/writeScore.test.ts` (utrekk av delt db-mock-helper)
- `package.json`/`package-lock.json` + `CHANGELOG.md` (patch-bump, hook-krav)

## Out of Scope

- Navne-oppslag i varselet (Alternativ B).
- Kø-/banner-forbedringene for karantene-elementer (#1369, egen kontrakt).
- SyncBanner-oversettelse generelt (#1355, egen kontrakt i køen).


---

## Drift-tabell (verifisert mot HEAD 2026-08-14)

| Kontrakt-påstand | Status på HEAD |
|---|---|
| Gate på `syncWorker.ts:114–117` | GJELDER — nå `:133–136` (`enteredByCurrentUser = score.enteredBy === score.userId`) |
| «drainQueue har ingen egen test-fil — legg `lib/sync/syncWorker.test.ts`» | **UTDATERT** — fila FINNES (#1457-tester, med komplett in-memory db-mock: scores/syncQueue/conflicts). UTVID den; ikke lag ny. Delt db-mock-helper-utrekk er dermed unødvendig med mindre du selv ser gjenbruksgevinst |
| «ny SyncBanner.test.tsx» | **UTDATERT** — fila finnes (fra #1369/#1370-æraen). Utvid; maks én render-assertion for medspiller-varianten |
| `realtimeChannel.ts:57–62` getSession-figur som forbilde | **UTDATERT** — pre-warm-en er fjernet der (#1366-ombygging). Bruk `supabase.auth.getSession()` direkte i drainQueue; klienten finnes allerede |
| «patch-bump + CHANGELOG-linje» i Gates | **UTDATERT (#1562)** — `.changes/1368-<slug>.md`-notatfil i stedet (type fix, issue 1368) |
| `conflictNotice`-nøkkel + dismiss-flyt | GJELDER — `no.json:5353`, rendring i `SyncBanner.tsx:326` |
| ConflictRecord uten `forOwnScore` | GJELDER — feltet finnes ikke; non-indeksert tillegg uten versjonsbump |
| Koordinering #1355/#1369 | AVKLART — begge er merget; PR #1610 (#1370) er åpen og filtrerer conflicts-lesingen i SyncBanner (annen region enn notice-rendringen). Først-inn vinner, den andre rebaser |

---

## Bygge-evidens (2026-08-14)

S1–S3 + adversarial a–h: PASS (evaluator runde 1 ACCEPT — `.forge/evaluations/1368-marker-conflict.md`). Red-test-bevis: 3 failed / 5 passed FØR implementasjon, 93/93 etter. S4 (staging): PR-fasen. Gates: vitest 93/93, lint 0 errors, tsc exit 0, build exit 0 (builder). Avvik (godkjent av evaluator): fallback-grenen stempler forOwnScore=true — grenen kan kun matche egen-score-rader.

S4 (staging): PASS 2026-08-14 — Playwright-driver: markør-varsel synlig (variant=marker), ConflictRecord forOwnScore=false, medspillers tall består, testdata ryddet. Bevis: kommentar på PR #1612.
