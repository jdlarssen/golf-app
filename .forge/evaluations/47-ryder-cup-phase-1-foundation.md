# Evaluation: Ryder Cup fase 1 — cup-grunnmur (#47)

**Branch:** `claude/romantic-chaum-f100ee`
**Contract:** `.forge/contracts/47-ryder-cup-phase-1-foundation.md`
**Evaluator-runde:** 2026-05-26
**Verdict:** **ACCEPT med merknad** (én CHANGELOG-historikk-regresjon å rette før merge)

---

## Gates

| Gate | Resultat | Bevis |
| --- | --- | --- |
| `npx tsc --noEmit` | Passerer | Stille exit, ingen output |
| `npx vitest run lib/cup/computeCupLeaderboard.test.ts` | Passerer | `Tests 11 passed (11)` |
| `npx vitest run` (full suite) | Passerer | `Test Files 101 passed (101)`, `Tests 1175 passed (1175)`, 11,5 s |
| `npx eslint lib/cup/ app/admin/cup/ app/cup/ lib/mail/cupStartedNotification.ts lib/mail/cupFinishedNotification.ts` | Passerer | Ingen output |
| `npm run build` | Passerer | Routes registrert: `/admin/cup`, `/admin/cup/new`, `/admin/cup/[id]`, `/admin/cup/[id]/slett`, `/cup/[id]` |
| `npm test -- cupActions` (contract-gate) | Mangler | Ingen dedikert action-test-fil (se merknad 2 nedenfor) |

---

## Success Criteria — verifisering

### 1. Migrasjon `0039_tournaments.sql` + types regenerert — VERIFISERT

- `supabase/migrations/0039_tournaments.sql` (1–63): `tournaments`-tabell med alle CHECK-constraints fra kontrakten, FK `games.tournament_id` med `ON DELETE SET NULL` (linje 42–43), indeks `tournaments_status_created_at` (linje 30), RLS `enable row level security` + `tournaments_select_authenticated`-policy (linje 57–62).
- `lib/database.types.ts:701–750` har `tournaments: { Row, Insert, Update, Relationships }`. `games.tournament_id` finnes på linje 345/368/391 med FK på linje 417–418.
- Merknad: migrasjons-filen heter `0039` (ikke `0037` som i kontrakt-utkastet) — forventet drift siden #92/#166 har tatt mellomliggende slots.

### 2. Admin kan opprette cup via `/admin/cup/new` — VERIFISERT

- `app/admin/cup/new/page.tsx:56`: `<form action={createTournamentDraft}>` med riktige form-felt (`name`, `team_1_name`, `team_2_name`, `points_to_win`).
- `lib/cup/actions.ts:63–98` (`createTournamentDraft`): validerer navn-lengde, lag-navn-lengde, duplikat-lag-navn, parser komma-decimal til number, insertes via `requireAdmin`, redirecter til `/admin/cup/${data.id}?status=created`.
- Norske komma håndteres via `parsePointsToWin` (linje 17–24).

### 3. Cup-detalj viser lag-roster, matches-liste, master-leaderboard-preview — VERIFISERT

- `app/admin/cup/[id]/page.tsx`:
  - Master-leaderboard-preview (linje 117–150): point-totaler i `font-serif text-4xl tabular-nums`, link til offentlig `/cup/[id]`.
  - Lag-roster (linje 152–191): to kolonner med team_1_name og team_2_name, tomt-state-tekst hvis 0 spillere.
  - Matches-liste (linje 193–249): viser match-label, deltakere, og resultat-formatting («3&2 til Per», «Halvert (AS)»).
- Roster bygges fra `getCupSnapshot` (linje 188–210) som henter distinct `(user_id, team_number)` på tvers av alle matches — uten egen roster-tabell, som kontrakt-beslutning krevde.

### 4. «Opprett ny match» pre-fills `game_mode='singles_matchplay'` + `tournament_id` — VERIFISERT

- Cup-detalj-side har link: `<Link href={`/admin/games/new?tournament_id=${id}`}>` (linje 199–200).
- `app/admin/games/new/page.tsx:108–126` (`loadCupContext`): henter cup-rad, regner ut `nextMatchLabel: 'Singles N+1'` basert på match-count.
- `app/admin/games/new/page.tsx:164–175`: `initialValues` settes til `{ game_mode: 'singles_matchplay', team_size: 1, lock_game_mode: true, tournament_id, tournament_match_label, name }`.
- `app/admin/games/new/GameWizard.tsx:269–286`: `ModeSelector` og `TeamSizeSelector` får `disabled={state.lockGameMode}`, og hjelpetekst «Kan ikke endres etter spill-start» rendres.
- `app/admin/games/new/GameWizard.tsx:432–445` (`FormDataInputs`): `tournament_id` og `tournament_match_label` som hidden inputs.
- `app/admin/games/new/actions.ts:97–116`: validerer at tournament-en finnes før FK settes (defensiv mot manipulerte URL-er).
- `actions.ts:145–146`: persisterer både `tournament_id` og `tournament_match_label` i `games`-insert.

### 5. Master-leaderboard renderer korrekt for ulike statuser — VERIFISERT

- `app/cup/[id]/page.tsx`:
  - Ikke-avgjort: viser «Først til X point vinner» (linje 45–49).
  - Vinner deklarert (status finished): champagne-gold-accent-styling på vinner-lagets card (linje 55–96), «{winner} vant» i header (linje 37–41).
  - Uavgjort finished: «Uavgjort» (linje 42–44).
  - Halvert match: rendrer «Halvert (AS)» (linje 148–149) og point-fordeling `0,5–0,5`.
  - In-progress match: viser «Spilles» (linje 130–131) uten point-celler.
- Layout matcher kontrakt-mockup (linje 116–143): store point-totaler `font-serif text-5xl tabular-nums`, matches-liste i kort, samme score-formattering som admin-detalj-siden gjenbruker.

### 6. `computeCupLeaderboard` ≥ 8 grønne tester — VERIFISERT

- `lib/cup/computeCupLeaderboard.test.ts`: **11 tester**, alle grønne. Dekker:
  1. Cup uten matches (0-0, winner=null)
  2. 1 point til vinner ved finished match
  3. 0,5 hver ved halvert (AS)
  4. 0 ved in-progress + draft
  5. Blandet portefølje (1+1+0,5+pending = 1,5-1,5)
  6. Vinner-deklarering når point-mål nås
  7. Eksplisitt `winner_team` fra DB respekteres ved finished cup
  8. Lag-navn + point-mål returneres
  9. Match-rekkefølge bevares
  10. `finishedMatches`/`remainingMatches` rapporteres
  11. Flytende-komma-presisjon (3 × 0,5 = 1,5 nøyaktig)
- Aggregator-implementasjon (`lib/cup/computeCupLeaderboard.ts:53–60`): `pointsForMatch` returnerer 0 hvis `status !== 'finished' || result === null`, ellers 1/0/0,5 per `winnerSide`. Rounding-fix på linje 81–82 håndterer flyt-presisjon.

### 7. Cup-status flow virker: draft → active (≥2 matches) → finished — VERIFISERT (via lesning)

- `startTournament` (`lib/cup/actions.ts:141–205`):
  - Linje 149–155: telles matches via `count: 'exact'`, redirecter til `?error=too_few_matches` hvis < 2.
  - Linje 157–165: krever `status === 'draft'`, ellers `?error=wrong_status`.
  - Linje 167–174: oppdaterer til `active` + `started_at: now()`.
  - Linje 177–199: best-effort mail-fan-out via `Promise.allSettled`.
- `finishTournament` (`lib/cup/actions.ts:207–280`):
  - Linje 216–218: avviser hvis allerede finished.
  - Linje 222–228: utleder `winner_team` ved point-sammenligning fra `getCupSnapshot.leaderboard`.
  - Linje 230–241: oppdaterer til `finished` + `finished_at` + `winner_team`.
- UI-binding på admin-detalj-side (`app/admin/cup/[id]/page.tsx:91`): `canStart = status === 'draft' && matches.length >= 2`. Knapp deaktiveres, hint-banner vises hvis < 2 matches.
- Merknad 2: **ingen dedikert `cupActions.test.ts`**. Kontrakt-gate `npm test -- cupActions` matcher ingen test-fil. Logikken er verifisert ved lesning, ikke ved kjøring. Se merknad nedenfor.

### 8. Mail-notifikasjon best-effort på cup-start og cup-finish — VERIFISERT

- `lib/mail/cupStartedNotification.ts` (132 linjer): full HTML + text-fallback, `Resend.emails.send`, subject «Cup-en har startet — {{name}}», link til `/cup/[id]`. Norsk komma-formattering på points (linje 36–37).
- `lib/mail/cupFinishedNotification.ts`: tilsvarende, med vinner-lag + point-snapshot.
- Best-effort: `Promise.allSettled` brukt i både `startTournament` (linje 179–196) og `finishTournament` (linje 252–271). Hver `rejected` logges via `console.error` med prefiks `[cup]`. Mail-feil aborterer aldri DB-oppdateringen — riktig disiplin per CLAUDE.md.

### 9. Cup-slett dedikert konfirmasjons-side — VERIFISERT

- `app/admin/cup/[id]/slett/page.tsx` (147 linjer): dedikert rute, viser cup-navn, lag-navn, status-spesifikk warning-banner («Cupen pågår nå …» / «Cupen er avsluttet …»), match-count info («N matches forblir som frittstående spill»), to knapper (Slett-rød / Avbryt-link).
- `deleteTournament` (`lib/cup/actions.ts:282–307`): kjører `DELETE FROM tournaments WHERE id = ?`. FK på `games.tournament_id` har `ON DELETE SET NULL` (migrasjon linje 43) — historiske matches frosses som frittstående spill, ikke slettet. Verifisert i migrasjons-SQL.

---

## Merknader (ikke blokkerende — men en bør håndteres før merge)

### Merknad 1: CHANGELOG-historikk overskrevet (REGRESSJON — bør rettes)

**Problem:** Cup-feature er bumpet til `1.29.0`, men `1.29.0` eksisterer allerede på `main` (commit `4681862 feat(auth): self-registration via /login behind env flag`). Diff-en `main..HEAD` på `CHANGELOG.md` viser at både `1.29.0` (self-registration) og `1.28.1` (Lanseringer-flis) er fjernet og erstattet med cup-oppføringen.

**CLAUDE.md-referanse:** Memory `feedback_changelog_version_conflict_on_rebase` foreskriver: «bump til neste minor og re-wrap previous series in `<details>`» når parallelt PR-arbeid har tatt versjons-nummeret. Korrekt versjon her skulle vært `1.30.0`.

**Fix:** Bump `package.json` fra `1.29.0` til `1.30.0`, gjenopprett de slettede `1.28.1` + `1.29.0`-entries fra `git show main:CHANGELOG.md`, plasser ny cup-entry som `1.30.y — Ryder Cup-stil cuper` over dem, og wrap `1.29.y`-serien i `<details>` per disiplin.

**Risiko hvis ikke fikset:** `feat`-commiten passerer commit-msg-hooken (siden package.json + CHANGELOG.md ER staget med endringer), men prod-footeren vil vise «v1.29.0» mens den faktisk inneholder en helt annen feature enn det som ble shipped 2026-05-26 morgen. Audit-trail brytes.

### Merknad 2: Ingen dedikert `cupActions.test.ts` (kontrakt-gate ikke 100% oppfylt)

Kontrakt-gate på linje 240 lister `npm test -- computeCupLeaderboard cupActions`. Det finnes ingen action-test-fil for `lib/cup/actions.ts`. Status-flyt-logikken (`startTournament` krever ≥2 matches; `finishTournament` utleder winner_team) er kun verifisert ved kode-lesning, ikke ved kjørbar test.

Dekker den 7. Success Criterion («Verifikasjon: integrasjonstest stubber matches og verifiserer statustransisjon»)? Strengt tatt nei. Praktisk sett dekkes vinner-beregningen via `computeCupLeaderboard`-tester. Action-laget er primært gating + DB-call + revalidate, som ikke har egen testbar logikk utover gating-betingelsene.

**Anbefaling:** Aksepter for fase 1 siden den rene aggregatoren er full-testet og UI-bindingen håndhever ≥2-matches-regelen. Men noter som fase-2-prereq-issue («Add cupActions.test.ts: start/finish/delete status transition tests») slik at fase 2 kan utvide statusflyten trygt.

### Merknad 3: `getCupSnapshot` bruker admin-client (RLS-bypass)

`lib/cup/getCupSnapshot.ts:97` bruker `getAdminClient()` (service-role). Forsvart i JSDoc (linje 22–26) med plan om fremtidig `unstable_cache`-wrapping. Authz på admin-detalj-side håndheves separat via `requireAdmin(supabase)` (linje 81) og på offentlig `/cup/[id]` av proxy-en (auth-gated, ikke admin-only — bevisst per kontrakt linje 215).

Dette er korrekt arkitektur for nåværende fase, men det er en stille foot-gun hvis noen senere kopierer fetcher-mønsteret. Vurder kommentar-strenging i fase 2.

### Merknad 4: Ingen `revalidateTag('tournament-${id}')` fra `endGame`-action

Når en individuell cup-match avsluttes, oppdaterer ikke `app/admin/games/[id]/avslutt/actions.ts` cup-leaderboardet via `revalidateTag('tournament-${id}', ...)`. Akseptabelt fordi `getCupSnapshot` IKKE er cache-wrapped (verifisert via grep: ingen `unstable_cache` i `lib/cup/`), så hver request fetcher friskt. Hvis fase 2 introduserer caching her, må endGame oppdateres parallelt.

### Merknad 5: «Forsvarende lag»-regel ikke implementert

Eksplisitt out-of-scope per kontrakt (linje 152), men antydet i sub-tekst på cup-create-form (linje 80). Brukere kan oppdage uavgjorthet-håndteringen som halv-ferdig — fase 1 viser bare «Uavgjort» når point-totalene er like (`app/cup/[id]/page.tsx:42–44`). Ingen blocker; bare nevnt for senere oppfølger-issue (fase 4 templates passer trolig).

---

## Manuelle røyk-tester (utenfor evaluator-scope)

Følgende kan ikke verifiseres her — overlatt til bruker-testing:

- Opprett cup med 2 lag à 2 spillere på preview
- Opprett 4 singles-matches fra cup-siden
- Spille gjennom 2 matches (1 vunnet av hvert lag) — leaderboard viser 1-1
- Spille 1 til halvert — leaderboard viser 1,5-1,5
- Avslutt cup manuelt
- Sjekk Resend-dashboard for mail-utsendelse
- Vercel preview-deploy + spot-sjekk i Safari mobil

---

## Konklusjon

Alle ni Success Criteria er teknisk innfridd. Gates (typecheck, vitest, eslint, build) er grønne. Implementasjonen er stram, godt kommentert, og følger Tørny-konvensjoner (norsk copy, AdminShell/TopBar/BrassRibbon-konsistens, atomic commits, `Promise.allSettled` for mail-fan-out, dedikert slett-konfirmasjons-side).

**Verdict: ACCEPT** — med ett anbefalt fiks før merge:

1. **Bump til `1.30.0`** og gjenopprett de slettede `1.28.1` + `1.29.0`-CHANGELOG-oppføringene. Wrap `1.29.y`-serien i `<details>` per CLAUDE.md-disiplin. (Se Merknad 1.)

Hvis denne fikses, kan PR-en merges direkte. Action-test-laget (Merknad 2) kan utsettes til fase 2.
