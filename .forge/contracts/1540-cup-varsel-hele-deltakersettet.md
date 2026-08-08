# 1540 — Cup-varsel til hele deltaker-settet

**Issue:** [#1540](https://github.com/jdlarssen/golf-app/issues/1540)
**Type:** fix (bruker-synlig)
**Branch:** `claude/golf-app-issue-1540-a188ae`

## Bakgrunn

`loadTournamentParticipantEmails` bygget mottakerlista til cup-varslene med den
request-scopede klienten. RLS-en på `game_players` er
`is_admin() OR is_in_game(game_id)` (verifisert mot live DB, se evidens under), så en
arrangør som ikke er global admin så bare kampene han selv spilte i. Lista kollapset til
arrangørens flight, og siden mail-fan-outen filtreres på samme liste, falt de øvrige
deltakerne ut av både in-app-varselet og mailen.

Målt i generalprøven på staging («Ryder Cup 2026», 12 deltakere, personlig cup):
4 av 12 fikk `cup_finished` — arrangøren pluss de tre han gikk sammen med.

Begge kallstedene delte helperen: `finishTournament` (cupens eneste reveal-signal etter
at per-kamp-varslene ble undertrykt i #1501) og `startTournament`.

## Løsning

Helperen flyttes til egen modul `lib/cup/tournamentParticipants.ts` som selv henter
`getAdminClient()` og bare tar `tournamentId`. Klienten er ikke lenger et parameter, så
feil klient kan ikke gjeninnføres fra et kallsted. Service-role er riktig her fordi begge
kallstedene allerede er gatet av `requireAdminOrClubAdminOfCup` (AGENTS.md trap 3) — samme
grunn `finishTournament` allerede avslutter kampene via admin-klienten.

## Suksesskriterier

- [x] **K1 — Oppslaget går via admin-klienten.** `lib/cup/tournamentParticipants.ts:36`
      kaller `getAdminClient()`; begge spørringene (`games`, `game_players`) bruker den.
- [x] **K2 — Klienten kan ikke sendes inn.** Signaturen er
      `loadTournamentParticipantEmails(tournamentId: string)` — ingen klient-parameter
      (`lib/cup/tournamentParticipants.ts:33`).
- [x] **K3 — Begge kallstedene er oppdatert.** `lib/cup/actions.ts:251` (`startTournament`)
      og `lib/cup/actions.ts:428` (`finishTournament`) kaller
      `loadTournamentParticipantEmails(id)`. `grep -rn "loadTournamentParticipantEmails(supabase" lib app`
      gir null treff.
- [x] **K4 — Kommentarene ved kallstedene er rettet.** Begge sa tidligere at lista var
      «hele deltaker-settet» uten forbehold; de forklarer nå hvorfor admin-klienten er
      nødvendig (`lib/cup/actions.ts:246-250` og `:422-427`).
- [x] **K5 — Én regresjonstest, og den fanger feilen.**
      `lib/cup/tournamentParticipants.test.ts` — 12 deltakere over 3 kamper (P1 i to,
      pluss én e-postløs rad). Asserter hele settet ut, dedup, e-post-skip, at oppslaget
      traff admin-klienten, OG at spørringene er scopet (`eq('tournament_id','T1')` +
      `in('game_id',[…])`). Falsifisert fire ganger, én per lås: request-scoped klient →
      rødt; `eq('tournament_id')` fjernet → rødt; dedup fjernet → rødt; e-post-skip
      fjernet → rødt. Scope-/dedup-/e-post-assertene kom etter evaluator-runde 1, som
      beviste at den første versjonen av testen passerte selv med alle fire strippet.
- [x] **K6 — Versjon + CHANGELOG.** `package.json` 1.230.0 → 1.230.1; én linje under
      Feilrettinger (August 2026, teller 33 → 34).

## Gates

| Gate | Kommando | Resultat |
|---|---|---|
| Co-lokaliserte tester | `npx vitest run lib/cup/tournamentParticipants.test.ts lib/cup/actions.test.ts lib/notifications/events.test.ts` | 3 filer / 26 tester grønne |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors (55 pre-eksisterende warnings) |
| Build | Vercel Preview mot `f1f66e7c` | pass — «Deployment has completed» |
| CI | `gh pr checks 1541` | `verify` 6m5s pass · `e2e` 4m45s pass · `scan` 10s pass |

**Build-gapet er lukket.** Lokalt `npm run build` kom til «Compiled successfully» +
«Finished TypeScript», men avbrøt i `Collecting page data` fordi worktreet mangler
`.env.local` (kopiering nektet av tillatelses-klassifisereren) — miljø, ikke kode.
Vercels preview-deploy for nøyaktig denne SHA-en kjører den ekte produksjonsbygget med
riktige env-variabler og er grønn, så gaten er dekket.

**Ikke staging-verifisert** — eieren bekreftet at generalprøven kjøres i en parallell økt
som allerede har riggen oppe mot `torny-staging`.

## Evidens — rotårsak mot live skjema

```sql
select tablename, policyname, qual from pg_policies
where schemaname='public' and tablename in ('game_players','games') and cmd='SELECT';
```

```
game_players | game_players select shared game | (is_admin() OR is_in_game(game_id))
games        | games select if participant or admin | (is_admin() OR EXISTS (… game_players.user_id = auth.uid()))
games        | games select own created | (created_by = auth.uid())
```
