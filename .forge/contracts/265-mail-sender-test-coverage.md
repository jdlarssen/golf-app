# Forge-kontrakt: Test-dekning på 3 mail-sendere (#265)

**Issue:** [#265](https://github.com/jdlarssen/golf-app/issues/265) — Audit: cup×2 + scorecardSubmitted-sendere mangler test-dekning
**Branch:** `claude/cool-meitner-f9ff72`
**Type:** `test` + `refactor` (test-only, ingen bruker-synlig oppførsel)

## Bakgrunn

Tre mail-sendere i `lib/mail/` har source-filer men ingen test-filer. De ble ekskludert fra Resend-kontrakt-tabellen i [PR #264](https://github.com/jdlarssen/golf-app/pull/264) fordi de manglet test-infrastruktur. Alle tre er **i aktiv prod-bruk** (verifisert — ikke dead code):

| Sender | Source | Call-site |
| --- | --- | --- |
| `sendScorecardSubmittedNotification` | `lib/mail/scorecardSubmittedNotification.ts` | `app/games/[id]/submit/actions.ts:182` |
| `sendCupStartedNotification` | `lib/mail/cupStartedNotification.ts` | `lib/cup/actions.ts:238` |
| `sendCupFinishedNotification` | `lib/mail/cupFinishedNotification.ts` | `lib/cup/actions.ts:311` |

Steg 1 i issue-en (slett dead code) gjelder ikke — alle tre trenger dekning.

## Mål

Bring de tre senderne opp på samme Type B-dekning som de 7 eksisterende: per-modul approval-snapshots (subject + text + body-HTML) + rad i den delte strukturelle Resend-kontrakten.

## Approach (Type B — per `lib/mail/AGENTS.md`)

Referanse-template: `lib/mail/gameFinishedNotification.test.ts` (kanonisk Type B fra PR #260). Match disiplinen, ikke kopier strukturen.

Per ny testfil:
- Module-level Resend-mock (capture send-payload, ingen nettverk).
- `send()`-helper som dynamisk importerer senderen og returnerer `sendMock.mock.calls[0][0]`.
- Per case: snapshot `subject` + `text` + **én** ekstrahert body-region (regex på unik styling i template-en).
- **Én** full-HTML chrome-lås på default-case — ikke per case.
- Ingen strukturell Resend-kontrakt per modul (det hører i den delte fila).

Body-extractor per template (ulik styling per mail):
- **scorecardSubmitted:** body-line-paragraf med `margin:0 0 24px` (samme som gameFinished-mønsteret).
- **cupStarted:** to body-paragrafer med `margin:0 0 16px` — ekstraher main-body-regionen (begge `<p>`).
- **cupFinished:** result-line (`margin:0 0 8px`) + score-line (20px serif, `margin:0 0 24px`) — ekstraher begge.

## Suksesskriterier

- [ ] **K1.** `lib/mail/scorecardSubmittedNotification.test.ts` finnes, med cases for: (a) default m/`adminFirstName`, (b) `adminFirstName: null` → «Hei!», (c) HTML-escaping av `playerName`/`gameName`. Inkl. én chrome-lås.
- [ ] **K2.** `lib/mail/cupStartedNotification.test.ts` finnes, med cases for: (a) default m/`playerFirstName` + heltall-point, (b) `playerFirstName: null` → «Hei!», (c) desimal-point (`1.5` → `1,5` via `formatPoints`). Inkl. én chrome-lås.
- [ ] **K3.** `lib/mail/cupFinishedNotification.test.ts` finnes, med cases for: (a) default m/vinner + heltall-point, (b) `winnerTeamName: null` → «Cupen endte uavgjort», (c) desimal-point på begge lag. Inkl. én chrome-lås.
- [ ] **K4.** `lib/mail/__tests__/resend-contract.test.ts` `senders[]` utvidet med de 3 nye senderne (fixtures matcher per-modul base-params). `it.each` verifiserer error-propagation + from-format + call-count for alle 10.
- [ ] **K5.** Alle snapshots populert med `vitest -u` og verifisert stabile på re-run uten `-u`. Snapshots reflekterer faktisk eksisterende copy (ingen source-endring).
- [ ] **K6.** `lib/mail/AGENTS.md` referanse-tall oppdatert («alle 7 aktive mail-sendere» → «alle 10»).
- [ ] **K7.** Ingen source-fil endret, med mindre en test avdekker en faktisk bug — i så fall flagges den eksplisitt (egen fix-commit + nevnt i closing-kommentar).

## Gates

Scoped til det som endres:
- `npx vitest run lib/mail/` — alle grønne (eksisterende + nye).
- `npx tsc --noEmit` (eller `npm run typecheck`) — ingen type-feil i nye filer.
- `npx eslint lib/mail/` — ingen lint-feil i nye filer.

## Out of scope

- Migrere de eksisterende 6 mail-test-filene til `_helpers.ts` (egen follow-up).
- Endre copy/HTML i source-filene (kun bug-fixes som tester avdekker).
- Versjons-bump / CHANGELOG — test-only, ingen bruker-synlig endring. Commits prefikses `test(mail):` / `docs(mail):`.

## Beslutninger (gray-area resolution)

- **Filplassering:** colocated `lib/mail/xxx.test.ts` (matcher eksisterende konvensjon — tester ligger ved siden av source, ikke i `__tests__/`).
- **Case-antall:** ~3 per sender, kun reelle template-branches (salutation, winner/uavgjort, desimal-formatering, escaping). Ikke gold-plating utover branch-dekning.
- **`—` i cupFinished score-line:** bevisst scoreboard-separator (`Lag1 3 — 2 Lag2`), ikke AI-tell em-dash. Bevares i snapshot.
- **Ingen humanizer-kjøring:** ingen ny bruker-rettet copy skrives; eksisterende copy låses as-is.
