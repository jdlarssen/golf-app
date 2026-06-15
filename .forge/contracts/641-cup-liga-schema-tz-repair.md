# Forge-kontrakt: Cup + Liga skjema-/tidssone-reparasjon (P1 prod)

**Issues:** #641, #642, #647, #648
**Branch:** `claude/bold-wilson-8b330f`
**Type:** Bug-fix cluster (prod-blocker, P1)
**Opprettet:** 2026-06-15 etter QA-sweep mot prod (v1.129.7 / `0113c9b`)

---

## Problem

QA-sweepen 2026-06-15 (Chrome, mobil, admin = Jørgen) avdekket at **både Cup og Liga er ikke-funksjonelle ende-til-ende i prod**. Fire P1-bugger, alle klassiske skjema-/tidssone-mismatcher der koden er skrevet mot kolonner/constraints/tidssone-antakelser som ikke matcher prod. To av rotårsakene er **duplisert på tvers av cup- og liga-stien**, så de fikses koordinert for ikke å la en landmine ligge igjen.

| # | Symptom | Rotårsak | Stier rammet |
|---|---------|----------|--------------|
| #641 | Cup-match-generering oppretter 0 spillere | `game_players`-insert med `status: 'active'` (kolonnen finnes ikke) **+ latent:** `team_number` satt uten `flight_number` bryter `game_players_team_flight_consistency` | `app/[locale]/admin/cup/[id]/generer/actions.ts:206-216` |
| #642 | Cup-detalj + offentlig leaderboard 500 | `getCupSnapshot` selekterer `course_holes.par` (droppet i migrasjon 0040 → `par_mens/ladies/juniors`) | `lib/cup/getCupSnapshot.ts:159-181` |
| #647 | Liga-flight-start feiler + sesong-tabell 500 | Bug1: `status: 'active'`-insert · Bug2: `team_number: 1` uten `flight_number` (solo skal ha `team_number: null`) · Bug3: `getLigaSnapshot` selekterer `course_holes.par` | `lib/league/actions.ts:625-635` + `lib/league/getLigaSnapshot.ts:179-239` |
| #648 | Liga-runde-vinduer 2t forskjøvet | `datetime-local`-streng lagres rått som naiv UTC (ingen Oslo→UTC-konvertering); visning viser UTC-timer; gating sammenligner reell instant → visning ≠ faktisk åpning | `lib/league/actions.ts` (add/update/override round) + `app/[locale]/admin/liga/[id]/LigaRoundRow.tsx:22-35` |

**Verifisert prod-skjema:**
- `game_players`-kolonner: `game_id, user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, approved_by_user_id, rejection_reason, tee_gender, withdrawn_at, withdrawn_by_user_id, deliver_reminder_sent_at, accepted_at, result_summary` — **ingen `status`**.
- Constraint `game_players_team_flight_consistency`: `CHECK ((team_number IS NULL) OR (flight_number IS NOT NULL))`.
- `course_holes`-kolonner (post-0040): `course_id, hole_number, stroke_index, par_mens, par_ladies, par_juniors` — **ingen `par`**.

---

## Beslutninger (fra gray-area-diskusjon med eier)

1. **Scope = alle fire** (#641, #642, #647, #648) i ett løp / én PR. Gjenoppretter Cup + Liga ende-til-ende. Buggene er små, mekaniske, og deler rotårsak.
2. **Cup-match-spillere = umiddelbart aktive.** Admin har bevisst satt opp matchene med valgte spillere → `accepted_at = now` for alle rader. Ingen «Ikke bekreftet»-friksjon. (Issue #641s anbefaling; avviker bevisst fra #463-mønsteret for invitasjoner, som ikke gjelder admin-generte cup-matcher.)
3. **Par-mapping (teknisk, eiers delegering):** Følg den fungerende scoring-stien (`lib/scoring/buildModeResultForGame.ts`): map `par: row.par_mens` som topp-nivå-default. Per-spiller-tee-par er ikke nødvendig for netto-standings her — `par_mens` er konvensjonell bane-par og er det aggregeringen allerede bruker.
4. **Tidssone-approach (teknisk, eiers delegering):** Full korrekthet (issue-forslag (a)) ved å **gjenbruke `parseOsloDateTimeLocal()`** (`lib/games/gamePayload.ts`) for lagring — samme helper spill-tee-off allerede bruker. Konsistens med spill-stien vinner over naiv-Oslo (b).

---

## Endringer

### #641 — Cup match-insert (`app/[locale]/admin/cup/[id]/generer/actions.ts`)
Bytt insert-objektet (linje 206-212) til:
```ts
const acceptedAt = new Date().toISOString();
const playerRows = [
  ...match.side1.map((uid) => ({ uid, team: 1 })),
  ...match.side2.map((uid) => ({ uid, team: 2 })),
].map(({ uid, team }) => ({
  game_id: gameId,
  user_id: uid,
  team_number: team,
  flight_number: 1,        // én match = én spillegruppe; oppfyller team_flight_consistency
  tee_gender: teeGenderOf(genderById.get(uid) ?? null),
  accepted_at: acceptedAt, // admin-generert → umiddelbart aktiv (beslutning 2)
}));
```
- Fjern `status: 'active'`.
- Legg til `flight_number: 1` (uten den bryter `team_number: 1/2` constraint-en etter at `status` er fjernet — den latente Bug 2 fra #647 gjelder også cup).

### #642 — Cup snapshot par-select (`lib/cup/getCupSnapshot.ts`)
- Select (~161): `'course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index'`.
- Row-type (~156): bytt `par: number` → `par_mens: number; par_ladies: number; par_juniors: number`.
- Mapping (~173): `par: row.par_mens`.

### #647 — Liga flight-insert (`lib/league/actions.ts`, `startLeagueRoundFlight`)
- Fjern `status: 'active'` (~631).
- `team_number: null` (var hardkodet `1`; liga = solo → `null` oppfyller constraint uavhengig av `flight_number`).
- Behold `accepted_at: acceptedAtForActor(...)` (#463-semantikk for liga er korrekt og uberørt).

### #647 — Liga snapshot par-select (`lib/league/getLigaSnapshot.ts`)
- Select (~181): per-kjønn-kolonner som over.
- Row-type (~232) + consumption (~239): `par: h.par_mens`.

### #648 — Liga tidssone (`lib/league/actions.ts` + `LigaRoundRow.tsx` + ny helper)
- **Lagring:** kjør ALLE `league_rounds.opens_at`/`closes_at`-skrivere (`addLeagueRound`, `updateLeagueRound`, `overrideRoundWindow`, og evt. liga-create-veiviser hvis den seeder runder) gjennom `parseOsloDateTimeLocal()`. Tom/utelatt verdi → uendret (ikke kall helperen på tom streng).
- **Ny helper** (inverse, UTC→Oslo wall-clock) i `lib/games/gamePayload.ts` (ved siden av `parseOsloDateTimeLocal`):
  `formatOsloDateTimeLocal(iso: string): string` → `'YYYY-MM-DDTHH:mm'` i Oslo-tid (Intl med `timeZone: 'Europe/Oslo'`).
- **Visning** (`LigaRoundRow.tsx`): `toDatetimeLocal` → `formatOsloDateTimeLocal`; `formatWindowDate` → gjenbruk Oslo-helpere fra `lib/i18n/format.ts` (`formatTeeOffTimeLocale` for HH:MM) i stedet for `getUTCHours()`.
- **Gating:** ingen endring nødvendig — `startLeagueRoundFlight`/ÅPEN-KOMMER-badge sammenligner `Date.now()` mot `new Date(opens_at)`; når lagring er korrekt Oslo→UTC blir gaten automatisk riktig.

---

## Suksesskriterier

- [x] **K1 (#641):** `createCupMatchesFromPlan` skriver `game_players`-rader UTEN `status`, MED `flight_number: 1`, `accepted_at` satt, og `team_number` 1/2 bevart. N matcher → N games. *Evidens: `generer/actions.ts:206-221` (kode); `actions.test.ts` happy-path asserter no-`status`/flight=1/accepted_at + 2 games + 2 game_players-inserts — 11/11 grønn.*
- [x] **K2 (#641):** Insert-shapen bryter ikke `game_players_team_flight_consistency`. *Evidens: Supabase MCP — constraint = `CHECK ((team_number IS NULL) OR (flight_number IS NOT NULL))`; `(team=1, flight=1)` → `cup_shape_ok=true`.*
- [x] **K3 (#642):** `getCupSnapshot` selekterer per-kjønn-par, ikke bar `par`, mapper `par: par_mens`. *Evidens: `getCupSnapshot.test.ts` grønn (select-kontrakt); Supabase MCP — `course_holes` har ingen `par`, korrigert select resolver (`course_holes_rows_ok=1`).*
- [x] **K4 (#647 Bug1+2):** `startLeagueRoundFlight` skriver `game_players` UTEN `status`, MED `team_number: null`. *Evidens: `actions.ts:625-639` (kode); `lib/league/actions.test.ts` asserter no-`status`/team=null + #463-accepted_at — grønn.*
- [x] **K5 (#647 Bug3):** `getLigaSnapshot` selekterer per-kjønn-par, ikke bar `par`, mapper `par: par_mens`. *Evidens: `getLigaSnapshot.test.ts` grønn; Supabase MCP samme som K3.*
- [x] **K6 (#648 lagring):** Alle tre `league_rounds`-vindu-skrivere konverterer via `parseOsloDateTimeLocal`. *Evidens: `actions.ts` add/update/override (kode); `gamePayload.test.ts` round-trip `format∘parse = identitet` — grønn.*
- [x] **K7 (#648 visning):** `LigaRoundRow` viser Oslo wall-clock (prefill via `formatOsloDateTimeLocal`, label via `formatShortOsloDayMonthLocale` + `formatTeeOffTimeLocale`). *Evidens: `LigaRoundRow.tsx:22-35` (kode); `format.test.ts` + `gamePayload.test.ts` Oslo-cases — grønn.*
- [x] **K8 (gating-konsekvens):** Gaten (`startLeagueRoundFlight:563-566`) bruker `Date.now()` mot `new Date(round.opens_at)` — uendret. Når lagring er korrekt Oslo→UTC blir instanten riktig, så «åpner 06:00» flipper kl. 06:00 lokal. *Evidens: kode + resonnement.*
- [x] **K9 (regresjon dekket):** 6 berørte test-filer (cup-snapshot, cup-match-gen, liga-flight, liga-snapshot, gamePayload, format). *Evidens: `npx vitest run <6 filer>` → 380/380 grønn.*
- [x] **K10 (gates):** `npx tsc --noEmit` → exit 0; berørte vitest grønn; `npx eslint <7 endrede filer>` → exit 0.
- [~] **K11 (disiplin):** `package.json` 1.129.7 → 1.129.11 + 4 CHANGELOG-oppføringer (én per issue, patch under åpent 1.129.y-tema). Closing-kommentarer (Teknisk + Funksjonell) postes ved merge — gjenstår.

---

## Gates (kjør scoped til det som er endret)

```bash
npm install                       # worktree mangler node_modules (use-intl resolve-felle ellers)
npx vitest run <berørte test-filer>
npx tsc --noEmit                  # eller: npm run build
npx eslint <endrede filer>
```
Pluss verifikasjon via **Supabase MCP** (`execute_sql`, prosjekt `glofubopddkjhymcbaph`, read-only): bekreft `par_mens`/`par_ladies`/`par_juniors` resolver på `course_holes`, at `status` IKKE finnes på `game_players`, og constraint-definisjonen.

---

## Utenfor scope (ikke gold-plate)

- **#637** (tee-off vises i UTC app-wide) — kun liga-visningen fikses her. Den nye `formatOsloDateTimeLocal`-helperen er gjenbrukbar, men ingen sweep av spill-flatene.
- **Full Playwright e2e** (cup/liga-livssyklus create→flight→18 hull→avslutt→standings) — anbefalt av issues, men tungt. Dekkes av fokuserte integrasjonstester (supabase-mock) + live prod-verifikasjon. Noteres som oppfølging hvis evaluator krever det.
- **Data-migrasjon** for eksisterende feil-lagrede liga-runde-vinduer i prod — liga har aldri fungert ende-til-ende, QA-data er kastbar. Ingen backfill.
- **Per-spiller-tee-par** — `par_mens`-default matcher eksisterende aggregering (beslutning 3).
- **#634/#635/#640** og andre QA-funn — egne issues.

---

## Notater / feller

- **Worktree:** sett `git config --worktree core.hooksPath .githooks` før første commit (version-bump-hook bypasses ellers).
- **Versjon:** nåværende 1.129.7. Patch-bumps under åpent tema (memory: «patch bugfix nests under any open theme»).
- **Cup-mode:** cup-matcher er matchplay-familie (Singel/Fourball/Foursomes). `flight_number: 1` = hele matchen som én gruppe; `team_number` 1/2 = sider. Stemmer med signup-matchplay-stien (som setter begge sammen).
- **Liga solo:** `team_number: null` oppfyller constraint uten `flight_number` (memory #543: «flight-uten-team lovlig»).
