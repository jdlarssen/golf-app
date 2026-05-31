# Forge-kontrakt: Ryder Cup fase 4 — match-templating + format-presets (#219)

**Issue:** [#219](https://github.com/jdlarssen/golf-app/issues/219) · **Parent:** #47 · **Branch:** `claude/vigilant-haibt-17974f`
**Type:** feature (MINOR bump) · **Area:** `area:admin` (cup)
**Anchor-doc:** `.forge/contracts/47-phase-4-templating-anchor.md` (stale på arkitektur — se nedenfor)

---

## Kontekst — arkitektur slik den FAKTISK er (mai 2026)

Anker-doc-en antok et enkelt `createTournamentMatch`-batch-API. Det stemmer ikke lenger. Reell tilstand etter fase 1–3 + cup-konsolidering (#345–#347):

- **En match = en `games`-rad** med `tournament_id`-FK + `tournament_match_label` (1–60 tegn, kolonne fra `0039`). Spillere via `game_players` med `team_number` (1/2) + `course_handicap`. `games.status = 'active'`.
- **Match-opprettelse går i dag gjennom opprett-spill-wizarden** (`/admin/games/new?intent=cup&tournament_id=<id>&game_mode=<format>`), én match om gangen. Server-action `createGame` ([app/admin/games/new/actions.ts](app/admin/games/new/actions.ts)) gjør: valider → last tee-box (slope/rating/par) + course_holes → `computeCourseHandicap` per spiller → `createGameModeConfig(mode, formData)` → insert `games` + `game_players` → `redirect`.
- **Cup-roster er DERIVERT fra matchene.** [lib/cup/getCupSnapshot.ts](lib/cup/getCupSnapshot.ts) bygger roster som unionen av spillere på tvers av matchene, bøttet på `team_number`. Det finnes **ingen** `tournament_players`/`tournament_teams`-tabell i bruk og **ingen** roster-administrasjons-UI («Roster fylles fra matches»).
- **Cup-eligible matchplay-formater:** `singles_matchplay` (1v1) + `fourball_matchplay`, `foursomes_matchplay`, `greensome_matchplay`, `chapman_matchplay`, `gruesome_matchplay` (alle 2v2).
- **Handicap:** `users.hcp_index numeric(4,1) not null default 54.0` (aldri null). Course handicap via WHS-formel.
- **Allowance-default per format** (fra `createGameModeConfig`): singles 100, fourball 90, foursomes/greensome/chapman/gruesome 50. Kan reproduseres server-side med `createGameModeConfig(format, new FormData())`.

**Konsekvens for scope:** Templating-feature-en må selv eie (a) roster-input (hvem er på hvert lag), (b) felles bane/tee, (c) preset/paring, (d) batch-opprettelse av `games`-rader. Dette er større enn ankerets «3–4 dager, mest UI». Den manuelle per-format-stien beholdes urørt.

## Gray-area-beslutninger (avklart med bruker + arkitektur-tvang)

1. **Cup-modell:** Bruker: «det må være representativt for en ordentlig cup … uavhengig om det er Ryder Cup, Presidents Cup». → **Sesjons-basert modell:** en preset er en ordnet liste av sesjoner (format + antall matcher). Innen én sesjon spiller hver spiller maks én match; **på tvers av sesjoner gjenbrukes spillere** (foursomes-økt → four-ball-økt → single-økt), akkurat som en ekte cup. Roster derives fortsatt fra matchene — sesjoner er kun et **genererings-tids-konsept** (ingen ny DB-kolonne).
2. **Presets (bruker: «du vet hva som er best»):** `Klassisk cup` (foursomes → four-ball → singler), `Four-ball + singler`, `Bare singler`, `Tilpasset` (admin bygger egen sesjonsliste). Antall matcher per sesjon **derives fra lagstørrelse** (2v2-format: `floor(teamSize/2)` matcher; singles: `teamSize` matcher) så presetene skalerer fra 2-per-lag til klubb-skala.
3. **Paring (bruker valgte):** `Tilfeldig` (stokk innen hvert lag) + `Handicap-balansert` (seed på `hcp_index`). Alltid redigerbar per match før bekreft.
4. **Juster-UX:** per-match spiller-nedtrekk (ikke drag-drop) — mobil-først, tap-target ≥44px, gjenbruker eksisterende mønstre.
5. **Tekniske valg (mine, per «No technical decisions to user»):** ny wizard på egen rute `/admin/cup/[id]/generer`; ren paring-motor i `lib/cup/`; batch-action gjenbruker en uttrukket insert-kjerne fra `createGame`.

---

## Scope — hva som bygges

### A. Ren logikk (TDD, Type A)

- **`lib/cup/cupTemplates.ts`** — preset-bibliotek:
  - `CupSessionFormat = 'foursomes_matchplay' | 'fourball_matchplay' | 'singles_matchplay'`
  - `CupPreset = { id, name (no), description (no), sessions: CupSessionFormat[], minPerTeam }`
  - `CUP_PRESETS: CupPreset[]` — de tre over (Tilpasset representeres som tom sesjonsliste bygget i UI).
  - `buildSessions(preset, teamSize) → { format, matchCount }[]` — deriverer antall per sesjon fra lagstørrelse; dropper sesjoner som ikke får plass (matchCount 0).
- **`lib/cup/cupPairing.ts`** — ren, deterministisk paring-motor:
  - `generateCupPlan({ team1, team2, sessions, strategy, rng? }) → PlannedMatch[]`
    - `team1`/`team2`: `{ userId, name, hcpIndex }[]`
    - `PlannedMatch = { id, format, label, side1: userId[], side2: userId[] }`
    - Innen en sesjon: hver spiller maks én gang; 2v2 tar 2 per side, singles 1 per side. Overskytende spillere i en sesjon = bye (utelates fra den sesjonen, ikke feil).
    - `strategy='handicap'`: sorter hvert lag på `hcpIndex` (stigende); par seeded (lavest mot lavest for singles; høy+lav innen side for 2v2).
    - `strategy='random'`: stokk innen hvert lag via injiserbar `rng` (default `Math.random`) — testbar med seedet rng.
  - `cupMatchLabel(format, n) → string` — «Singel {n}», «Four-ball {n}», «Foursome {n}».

### B. Batch-opprettelse (server-action + test)

- Trekk ut delt insert-kjerne fra `createGame` (uten `redirect`): `insertCupMatch(supabase, { tournamentId, courseId, teeBox, courseHoles, format, label, side1, side2, hcpById })` → inserter én `games`-rad + `game_players`. `createGame` refaktoreres til å bruke samme kjerne (oppførsel uendret — dekkes av eksisterende `actions.test.ts`).
- **`createCupMatchesFromPlan(input)`** i `app/admin/cup/[id]/generer/actions.ts`:
  - `requireAdmin` + cup må være `status='draft'` (ellers returner feilkode).
  - Last tee-box + course_holes **én gang**, slå opp `hcp_index` for alle deltakere **én gang**, regn course handicap per spiller.
  - Loop over `PlannedMatch[]` → `insertCupMatch` per match, `mode_config` via `createGameModeConfig(format, new FormData())`.
  - `revalidatePath('/admin/cup/${id}')` → `redirect('/admin/cup/${id}?status=matches_generated')`.

### C. Wizard-UI (`/admin/cup/[id]/generer`)

Stegvis (mobil-først, eksisterende `components/ui/`-primitiver, palett/typografi per CLAUDE.md):
1. **Lag-roster** — velg deltakere fra registrerte brukere, tilordne hver til Lag 1 / Lag 2. Validér ≥ `minPerTeam` for valgt preset; advar ved skjev lagstørrelse.
2. **Bane + tee** — felles for alle matcher (gjenbruk course/tee-velger-mønster).
3. **Oppsett** — preset-valg (m/ live forhåndsvisning av antall matcher per format gitt rostersize) + paring-strategi (radio: Tilfeldig / Handicap-balansert). Tilpasset: legg-til-sesjon (format + antall).
4. **Forhåndsvis & juster** — genererte matcher gruppert per sesjon; per match spiller-nedtrekk for å bytte; «Generer på nytt»-knapp.
5. **Bekreft** — kall `createCupMatchesFromPlan` → cup-detalj med suksess-banner.

- **Inngang:** knapp «Generer matcher» på `/admin/cup/[id]` (kun `status='draft'`). De manuelle «+ Singles/Fourball/…»-lenkene beholdes for engangsmatcher.

### D. Tester (per `docs/test-discipline.md`)

- **Type A (TDD):** `cupPairing.test.ts` (no-repeat-innen-sesjon, gjenbruk-på-tvers, handicap-seeding-rekkefølge, determinisme med seedet rng, odde-roster-bye, tom-sesjon) + `cupTemplates.test.ts` (sesjons-antall per preset per lagstørrelse, minPerTeam).
- **Action:** `createCupMatchesFromPlan` — authz (ikke-admin avvist), ikke-draft avvist, happy path (mocket supabase, følg eksisterende `actions.test.ts`-mønster): N `games` + korrekte `game_players` (team_number + course_handicap).
- **Type C:** maks én render-test for forhåndsvis-steget (viser genererte matcher).
- **Type D (E2E):** golden path hvis tid — flagges, ikke blokkerende.

---

## Build-status (as-built, v1.62.0)

**Alle K1–K7 oppfylt.** Gates grønne: `npx tsc --noEmit` → 0 feil; full `npx vitest run` → exit 0 (alle grønne, inkl. 26 cup-pure-logic + 9 batch-action + 1 wizard render-test); `npm run build` → «Compiled successfully». Commits: `chore(cup)` preset+pairing → `chore(cup)` batch-action → `feat(cup)` wizard+UI (v1.62.0 + CHANGELOG).

**Arkitektur-avvik fra opprinnelig kontrakt (forventet — anker-doc var stale):**
- Batch-action-en (`createCupMatchesFromPlan`) ble **selvstendig**, ikke et uttrekk av en `insertGameWithPlayers`-kjerne fra game-create. Den reelle `createGameInternal` er for sammenvevd (publish/draft, trusted-creator-client-routing, side-tournaments, notify) til en ren deling. Den manuelle stien er derfor **urørt** (K6).
- Cup-matcher opprettes som `status='scheduled'` med `course_handicap=null` (fryses ved rundestart) — identisk med den manuelle per-match-stien, **ikke** `'active'` med ferdig-beregnet handicap. Derfor ingen course-handicap-beregning i batchen.
- `mode_config`-allowance per format leses fra cup-radens `fourball_allowance_pct` / `foursomes_allowance_pct` (verifisert mot prod-shapes via SQL).
- `GameModeConfig`-typen bor i `lib/scoring/modes/types.ts` (ikke `lib/games/modeConfig.ts`).
- Wizard-rute: `app/admin/cup/[id]/generer/` (page + `GenerateMatchesWizard` + render-test). Inngang: «Generer matcher»-knapp på cup-detalj (kun `status='draft'`); de manuelle «+ format»-lenkene beholdt.

## Suksesskriterier (evidens før avhuking)

- [ ] **K1 — Preset-bibliotek finnes og skalerer.** `lib/cup/cupTemplates.ts` eksporterer `CUP_PRESETS` (Klassisk cup, Four-ball + singler, Bare singler) + `buildSessions`. _Evidens:_ `cupTemplates.test.ts` grønn; viser f.eks. Klassisk cup @ teamSize 4 → 2 foursomes + 2 four-ball + 4 singler.
- [ ] **K2 — Paring-motor er ren, deterministisk og korrekt.** `generateCupPlan` partisjonerer riktig, ingen spiller-repetisjon innen sesjon, gjenbruk på tvers, handicap-seeding + seedet random. _Evidens:_ `cupPairing.test.ts` grønn (alle case-grupper over).
- [ ] **K3 — Batch-action oppretter alle matchene i én operasjon.** `createCupMatchesFromPlan` oppretter N `games` + `game_players` med korrekt `team_number`, `course_handicap`, `mode_config`-allowance per format, `tournament_match_label`. _Evidens:_ action-test grønn + `insertCupMatch`-kjerne delt med `createGame` (eksisterende `actions.test.ts` fortsatt grønn).
- [ ] **K4 — Authz + status-gate.** Ikke-admin og ikke-draft-cup avvises. _Evidens:_ test-case + manuell lesing av action.
- [ ] **K5 — Wizard fungerer ende-til-ende.** Fra `/admin/cup/[id]` → «Generer matcher» → roster → bane/tee → preset+strategi → forhåndsvis/juster → bekreft → matcher synlige på cup-detalj. _Evidens:_ Playwright MCP-gjennomgang (evaluator) ELLER skjermbilde-flyt; render-test for forhåndsvis-steget.
- [ ] **K6 — Manuell sti urørt + ingen regresjon.** Eksisterende per-format-lenker virker fortsatt; `npm run build` grønn (exhaustive switches/Records dekket); hele vitest-suiten grønn. _Evidens:_ gate-output.
- [ ] **K7 — Versjon + CHANGELOG.** MINOR-bump (`1.61.0` → `1.62.0`) + CHANGELOG-oppføring per `docs/changelog-conventions.md`; norsk copy kjørt gjennom humanizer-skillet. _Evidens:_ diff + hook passerer.

---

## Gates (kjøres scoped til endring, så full før «done»)

```bash
npx tsc --noEmit                                   # hele prosjektet (ikke filtrer pre-existing)
npx vitest run lib/cup/ app/admin/cup/ app/admin/games/new/   # ren logikk + actions + ingen regresjon på createGame
npm run build                                       # Vercel-paritet: exhaustive switch/Record-maps
npm run lint                                        # hvis definert
```

## Out of scope (utsettes / egne issues ved funn)

- Brukerdefinerte lagrede presets (UI for lagre/edit) — fase 5+.
- Multi-cup-templating, statistikk-baserte paringer, cross-tournament-spiller-tracker (anker).
- Drag-drop-paring (bruker nedtrekk).
- Redigering av allerede-opprettede matcher via wizarden (eksisterende manuell edit dekker).
- Ny DB-tabell for roster/sesjoner (roster forblir derivert).

## Risiko / merknader

- **Refaktor av `createGame`:** uttrekk av `insertCupMatch` rører en mye-brukt sti. Eksisterende `app/admin/games/new/actions.test.ts` må forbli grønn — det er regresjons-vakten. Hold oppførsel bit-identisk.
- **Determinisme i tester:** random-paring tar injiserbar `rng`; produksjon bruker `Math.random`, tester bruker seedet sekvens.
- **Skala:** dette er et flerdagers-feature med ren-logikk + action + ny wizard. Bygges i committede chunks (A → B → C → D), substansielle chunks via subagent per CLAUDE.md.
