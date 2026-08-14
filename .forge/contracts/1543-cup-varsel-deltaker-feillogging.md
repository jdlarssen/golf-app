# Kontrakt: Cup-varsel — stille tom mottakerliste hvis deltaker-oppslaget feiler (#1543)

Kilde: kontrakt-kommentar på issue #1543 (kontrakt-smeden, verifisert mot main @ e2ce624).
Re-verifisert mot main @ b123ef41 ved byggestart 2026-08-14: defekten sto fortsatt
(kun `data` destrukturert i begge spørringene).

## Problem

`loadTournamentParticipantEmails` (`lib/cup/tournamentParticipants.ts`) destrukturerte
kun `data` fra `games`- og `game_players`-spørringene. En transient feil ga `null` →
`recipients = []` → avslutningen fullførte med null varsler og ingen loggslinje.
Kallstedene (`lib/cup/actions.ts:251/:428`) står ugatet — kast er ikke et alternativ.

## Design (bygget)

- Destrukturer `error` fra begge spørringene; ved feil: `console.error` med
  `[cup]`-prefiks og `{ tournamentId, error }`-payload, deretter `return []`.
- Kode-kommentar markerer grenene som bevisst best-effort (mønster fra
  `lib/mail/gameFinishedRecipients.ts`).
- Ekte tomhet (data `[]`, error `null`) uendret — ingen logg.

## Success Criteria

- [x] Nye cases i `lib/cup/tournamentParticipants.test.ts` via `buildSupabaseMock`:
  (a) games-feil → `[]` + `console.error('[cup] participant lookup: games failed', …)`
  + game_players aldri spurt (assertet via `__fromCalls`-filter, testlinje 106–108;
  gren-skillet feil-vs-tomhet bevises av `toHaveBeenCalledWith`-assertionen);
  (b) game_players-feil → tilsvarende; (c) happy-path uendret grønn.
  **Evidens:** `npx vitest run lib/cup` → 25 filer / 436 tester grønne (2026-08-14);
  begge nye tester var RØDE før fiksen (2 failed | 1 passed) — TDD-sekvens bekreftet.
- [x] Docblock i testfila oppdatert til å dekke feil-casene («Én test, fordi …» erstattet).
  **Evidens:** testfilas hode nevner nå #1543-feilcasene eksplisitt.
- [x] Ingen endring i retur-typen eller kallstedene.
  **Evidens:** diff rører kun helper-kroppen + testfila; `Promise<TournamentParticipant[]>` består.
- [x] `npm run typecheck` + `npm run lint` + `npx vitest run lib/cup` grønt.
  **Evidens:** tsc exit 0; lint 0 errors (55 pre-eksisterende warnings);
  vitest 436/436. I tillegg `npm run build` exit 0 (§T2-full-gate).

## Gates

tsc + lint + vitest grønne. Ikke bruker-synlig → ingen staging-klikkrunde;
`[no-changelog]` i commit-body. VERIFICATION GAP (akseptert i kontrakten):
selve prod-feilscenarioet (transient nettverksfeil) kan ikke framprovoseres
ende-til-ende — dekket av Type A-test med mocket feil.

## Commits

- 9431066f fix(cup): log participant lookup failures instead of returning silently
