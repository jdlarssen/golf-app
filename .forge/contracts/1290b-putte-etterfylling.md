# Kontrakt B: Putte-etterfylling — chips ved levering og fra Historikk, post-finish server-action med DB-vakt (#1290 del B)

> ⚠️ **PARKERT — skal IKKE ha `autonomy:ready` nå.** To grunner: (1) rører `app/[locale]/games/[id]/leaderboard/`-katalogen som #1293-kontrakten (allerede ready) også rører — aldri samme natt / vent til #1293 er merget; (2) migrasjonen krever prod-påføring bak eier-luka (`.claude/approve-prod`) — staging-først, prod parkeres til en eier-økt. Køes av eier/hovedchat senere.
> Design-fasit: eier-kommentarene på #1290 fra 19.07 kl. 16:29 og 16:32. Forutsetter at del A (kontrakt 1290a) er merget — nearMiss-datastrukturen gjenbrukes.

## Problem

Etter avsluttet spill er scores fryst, så et glemt putt-tall kan aldri etterfylles — runden faller permanent ut av statistikken; manuell service-role-SQL var eneste utvei for eierens to runder. Eieren vil kunne oppdage og etterfylle i én bevegelse: chips (0–5+) for manglende hull ved levering, og etterpå fra ferdig-runde-flatene og Historikk. Aldri push/varsler — pull der motivasjonen oppstår.

## Research-funn (verifisert i økten)

- **Frysingen har to lag:** RLS-policyene på `scores` krever `g.status = 'active'` (`0002_rls_policies.sql:106-131`) — etter finish feiler INSERT/UPDATE for vanlige brukere ubetinget. RPC-en `upsert_score_if_newer` har i tillegg no-op-vakter for submitted/withdrawn (`0073`, `0102`) men sjekker IKKE `g.status` — hel-spill-frysen håndheves kun av RLS.
- `putts`-kolonnen: nullable int, CHECK 0–10, bevisst IKKE koblet til strokes (`0123_add_scores_putts.sql`).
- Ved levering er spillet fortsatt `active` → eksisterende `writeScore`-vei (`lib/sync/writeScore.ts`, merge-semantikk: `putts` alene bevarer strokes) fungerer uendret for lever-stegets chips.
- Lever-steget: `app/[locale]/games/[id]/submit/page.tsx` — oppsummerings-`Card` (linje ~341-350) er naturlig hjem for «Putter ført på X av Y»-linjen + chips.
- Ferdig-flater: `MyScorecardCta`-mønsteret (context-provider fra leaderboard-page, rendret i `LeaderboardChrome`) er presedensen for å vise noe KUN på autentisert leaderboard — lekker aldri til spectate/embed/demo.
- Historikk-rader: `GameHistoryRow` er hel-rad-lenke — sekundær-CTA må være egen tappbar flate (chip), ikke nested link.
- `PuttsField` (`components/hole/PuttsField.tsx`, MAX_PUTTS = 10) er eksisterende stepper-primitiv.

## Design

**1. DB-laget (trap 3 — regelen bor i databasen):** én migrasjon (`supabase/migrations/<neste-løpenr>_putts_backfill.sql`):
- **Ny permissiv RLS UPDATE-policy** på `scores`: egen rad (`user_id = auth.uid()`), spillet `finished`, og spilleren ikke withdrawn.
- **BEFORE UPDATE-trigger (kolonnevakt):** når spillet er `finished` og `auth.uid()` er satt (autentisert bruker — service_role har null og er unntatt for ops-fikser): avvis endring av ALLE kolonner unntatt `putts` (`NEW` = `OLD` for hver øvrig kolonne, ellers `raise exception`). Dette gjør at policy+trigger sammen tillater «putts-only på egne rader i ferdige spill» — også mot fiendtlig direkte PostgREST-PATCH (trap 3).
- Merk: eksisterende `is_admin()`-gren i update-policyen slipper i dag admin gjennom på ferdige spill — triggeren strammer dette til putts-only også for admin-UI-veier; dokumentér i migrasjonskommentar.
- **Staging først via MCP → verifiser → prod KUN bak eier-luka.** TS-typer: generer mot staging-ref eller hånd-utvid med `// TODO: regen after prod apply` (bindings §T3).

**2. Server-action `backfillPutts(gameId, entries: {holeNumber, putts}[])`:** autentisert klient (RLS+trigger er vakten — ingen admin-klient), oppdaterer kun egne rader, `expectAffected`-sjekk per rad (0-rows = feil, trap 2), revaliderer `game-${id}`-taggen. Kun for `finished`-spill; aktive spill bruker writeScore-veien.

**3. UI — tre innganger, samme chip-komponent (`PuttsChips`: 0/1/2/3/4/«5+» der 5+ åpner `PuttsField`-stepper 5–10):**
- **Ved levering** (billigst, fersk hukommelse): i oppsummerings-kortet på submit-siden, KUN når runden har ≥1 ført putt og mangler noen (atferdsgaten fra del A): «Putter ført på X av Y hull» + inline chips per manglende hull med knagg «Hull 9 (par 4) — du brukte 9 slag». Skriver via `writeScore` (spillet er aktivt). Avvisbar — blokkerer aldri levering.
- **Ferdig-runde-flate:** lite kort via `MyScorecardCta`-provider-mønsteret (kun autentisert leaderboard + eget scorekort): «Putte-statistikken venter på N hull» → lenker til etterfyllingssiden. Vises kun for egen ufullstendig putte-føring (≥1 ført).
- **Historikk / hel runde:** ny rute `app/[locale]/games/[id]/putter/page.tsx` — 18 rader (hull · par · slag som knagg) + chips, delvis utfylling OK, lagre via `backfillPutts`. Inngang: chip på `GameHistoryRow` (egen tappbar flate ved siden av hel-rad-lenken) KUN når runden har delvis putte-føring — 0-putt-runder promper aldri (eier-prinsippet), men hel-runde-siden er nåbar for dem via… ingen inngang; ASSUMPTION: 0-putt-runder får inngang KUN fra Putte-panelets kontekst på statistikk-sida (eier: «hel-runde-etterfylling kun synlig der motivasjonen faktisk oppstår — statistikk-sida») — én diskret lenke i panelet.

## Kanttilfeller & vakter

- Fiendtlig PATCH: strokes-endring på ferdig spill med egen rad → avvist av trigger; annen spillers rad → avvist av policy. pgTAP-test (kopiér `game_players_update_rls_test.sql`-mønsteret; `npm run test:rls` — SKIP uten CLI = `VERIFICATION GAP`, skriv den).
- Hull uten scores-rad (ikke spilt): etterfylling gjelder kun eksisterende rader — `expectAffected` fanger forsøk.
- putts > 10 → DB-CHECK; chips kan ikke produsere det, men action validerer likevel (rule-home: CHECK er fasit).
- Samtidig etterfylling fra to enheter: last-write-wins er akseptabelt (samme semantikk som scoring ellers).
- Offline på etterfyllingssiden: ingen Dexie-kø for ferdige spill — action feiler synlig med norsk melding; ingen stille tap.
- Aldri innboks/push (eier-låst); ingen prompts for 0-putt-runder noe sted.

## Nøkkelbeslutninger

- **Policy + kolonnevakt-trigger fremfor SECURITY DEFINER-RPC** — eier-skissen sa trigger; vakten virker da også mot direkte PostgREST, og server-actionen kan bruke vanlig autentisert klient. service_role unntas i triggeren (ops-fikser).
- **Chips 0–5+ med stepper bak 5+** — eier-UX; MAX 10 består.
- **Commit:** `feat(scorecard)` + minor-bump + CHANGELOG-linje. Refs #1290; PR-body `Closes #1290` (del A brukte `Part of`).

**Claude's discretion:** eksakt kort-/chip-utforming; i18n-nøkler; om submit-stegets chips gjenbruker `PuttsChips` med annen layout; rekkefølgen policy vs trigger i migrasjonen.

## Suksesskriterier

- [ ] pgTAP: putts-only på egen rad i ferdig spill OK; strokes-endring avvist; annen spillers rad avvist; aktivt spill uendret oppførsel. **Bevis:** `npm run test:rls`-output med pgTAP-resultater (ikke skip-banner).
- [ ] Vitest på `backfillPutts` (mock ved systemgrense) + edge-tabell-testene.
- [ ] Staging-klikkrunde: lever med manglende putt → chips vises og skriver; avslutt spill → kort på leaderboard/scorekort → etterfyll → Putte-panelet (del A) oppdateres. **Bevis:** Playwright-via-Bash (#1219) + skjermbilder + `staging-verified`-label.
- [ ] Spectate/embed/demo viser ALDRI etterfyllings-UI. **Bevis:** provider-mønster-gjennomlesing + curl/klikk-sjekk på spectate-token.
- [ ] Migrasjonen er påført STAGING og verifisert; prod-påføring er IKKE gjort (parkert til eier-luka — noteres som eksplisitt rest-steg i PR + `needs-manual-qa`).

## Gates

- [ ] `npm run build` + `npm run lint` + co-located vitest grønne; humanizer på ny copy
- [ ] Migrasjonsnummer sjekket mot `origin/main` (bindings §T3)

## Filer som trolig berøres

- `supabase/migrations/<n>_putts_backfill.sql` — NY (policy + trigger)
- `supabase/tests/scores_putts_backfill_rls_test.sql` — NY (pgTAP)
- `app/[locale]/games/[id]/putter/page.tsx` (+ actions) — NY
- `app/[locale]/games/[id]/submit/page.tsx` — chips-seksjon
- `app/[locale]/games/[id]/leaderboard/` — kort via provider-mønsteret (⚠️ #1293-katalogen)
- `components/stats/`/`components/hole/` — `PuttsChips` + panel-lenke; `GameHistoryRow` — chip-inngang
- `messages/*.json`, `lib/database.types.ts`, `package.json`/`CHANGELOG.md`

## Utenfor scope

- Endring av 18/18-gaten eller PPH (del A eier statistikk-semantikken)
- Etterfylling av STROKES (kun putts — aldri)
- Påminnelser/varsler av noe slag; andre spilleres putter (`enteredBy`-deling gjelder ikke putts-etterfylling — kun egne)
