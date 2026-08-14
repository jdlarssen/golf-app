# Evaluering: #1368 markør-konfliktvarsel

**Verdikt: ACCEPT**

Evaluert 2026-08-14 mot kontrakten `.forge/contracts/1368-marker-conflict.md`
(inkl. drift-tabellen) og diffen `origin/main..HEAD` (én commit, 8fb543ae).
Alle gates kjørt selv på Node 22.

## Kriterier

| Kriterium | Status | Bevis |
|---|---|---|
| S1 — ny unit-test reproduserer markør-tilfellet | PASS | `lib/sync/syncWorker.test.ts` «markør-rad som taper LWW …»: `enteredBy='me'`, `userId='mate'`, server-wins med endrede strokes → `fakeConflicts.get(ID)` matcher `{forOwnScore: false}`. Gammel gate (`enteredBy === score.userId`, diffens minus-linje `syncWorker.ts:147`) gir `'me' !== 'mate'` → ingen record → `toMatchObject` på `undefined` feiler. Testen ville altså vært rød på gammel kode; commit-body dokumenterer rød-først-kjøring (3 røde). |
| S2 — #688 egen-score-regresjon | PASS | Test «egen score som taper LWW varsler fortsatt (#688-regresjon)»: `userId='me'`, `enteredBy='me'` → record med `forOwnScore: true`. |
| S3 — SyncBanner viser markør-varianten | PASS | Én ny render-test med nøyaktig én assertion (Type C overholdt) på `forOwnScore: false` → `conflictNoticeMarker`-teksten. Rendringen er ternær på `forOwnScore === false`, så både `true` OG `undefined` (legacy-rader) faller til dagens `conflictNotice` — verifisert i `SyncBanner.tsx:328–331`. |
| S4 — staging-verifisering (flymodus-scenarioet) | DEFERRED | Utsatt til PR-fasen per oppdrag; `staging-verified`-label kreves før merge (#1076). |
| a — getSession-feil kaster aldri / blokkerer aldri synken | PASS | `syncWorker.ts:29–35`: try/catch rundt `getSession`, fallback `null`. Test «sesjons-oppslag som feiler kaster ikke …» asserter `res.rejected === 1` (server-wins fortsatt prosessert) og ingen record. |
| b — fallback (`currentUserId == null`) stempler `forOwnScore: true` | PASS | Builder-resonnementet holder: fallback-gaten er `enteredBy === userId`, og kø-rader på denne enheten skrives alltid med `enteredBy = innlogget bruker` (HoleClient) — en matchende rad er dermed radeierens egen tasting på egen enhet. Markør-rader matcher aldri fallbacken (testet: ingen record ved sesjonsfeil + markør-rad). |
| c — kun putts endret → ingen record | PASS | `strokesChanged`-gaten uendret; test «like slag men ulike putts gir fortsatt ingen varsel» (serverWins(5, 2)) → `fakeConflicts.has(ID) === false`. |
| d — resolveConflict/RPC/karantene urørt | PASS | Diffen i `syncWorker.ts` rører kun kommentarer, getSession-blokken, gate-uttrykket og `forOwnScore`-feltet. `lib/sync/conflict.ts`, RPC-kallet (`:54–67`) og #668-karantenegrenen (`:46`, `:69–96`) er ikke i diffen. |
| e — ingen Dexie-versjonsbump, DB-navn urørt | PASS | `lib/sync/db.ts`-diffen er doc-kommentar + valgfritt non-indeksert felt; ingen `version()`-endring, `'golf-app'` urørt. |
| f — nøkkel i begge kataloger, ellers urørt | PASS | Én linje (`conflictNoticeMarker`) i både `messages/no.json` og `messages/en.json`; ingen andre nøkler rørt. `catalogParity` grønn i vitest-kjøringen. |
| g — conflicts-READ-regionen i SyncBanner urørt | PASS | Lesingen (`SyncBanner.tsx:93–94`, `localDb.conflicts.toArray()`) er utenfor diffen; eneste hunk er notice-rendringen (`:323–331`). Ingen kollisjon med PR #1610. |
| h — getSession én gang per drain | PASS | Kalles på `syncWorker.ts:31`, før `for`-løkka på `:42` — én gang per drain, ikke per item. |

## Gates (kjørt selv)

- `npx vitest run lib/sync components/sync messages` → **9 filer, 93/93 grønne**.
- `npm run lint` → **0 errors** (55 pre-eksisterende warnings, ingen i berørte filer).
- `npx tsc --noEmit` → **exit 0**.
- `node scripts/weekly-release.mjs --dry-run` → noten `1368-markor-konflikt-varsel.md` validerer (type fix, issue 1368).
- **`npm run build` re-kjøres IKKE her — begrunnelse:** diffen er klient-side lib + klient-komponent + to katalog-linjer; ingen ruter, ingen `export const runtime`, ingen nye union-medlemmer som treffer exhaustive switches (det fanger `tsc --noEmit` uansett, og den er grønn). CI kjører full build på PR-en.

## Commit-hygiene

- Én atomisk commit `fix(sync): warn when a score you kept for a flight-mate is overwritten` — riktig prefix, `Refs #1368` i body, `.changes/`-noten i samme commit (drift-tabellens #1562-krav oppfylt; ingen version-bump/CHANGELOG-redigering).

## Funn

Ingen.
