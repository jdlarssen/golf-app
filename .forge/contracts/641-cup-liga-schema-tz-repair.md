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

- [ ] **K1 (#641):** `createCupMatchesFromPlan` skriver `game_players`-rader UTEN `status`, MED `flight_number: 1`, `accepted_at` satt, og `team_number` 1/2 bevart. N planlagte matcher → N `games`-rader, hver med riktig antall spillere. *Evidens: regresjonstest + kode.*
- [ ] **K2 (#641):** Insert-shapen bryter ikke `game_players_team_flight_consistency` mot prod-skjema. *Evidens: Supabase MCP — bekreft constraint-def + at `(team_number=1, flight_number=1)` er lovlig.*
- [ ] **K3 (#642):** `getCupSnapshot` selekterer per-kjønn-par-kolonner, refererer ikke bar `par`, og mapper `par: par_mens`. *Evidens: regresjonstest + Supabase MCP-bekreftelse at selecten resolver (ingen 42703).*
- [ ] **K4 (#647 Bug1+2):** `startLeagueRoundFlight` skriver `game_players` UTEN `status`, MED `team_number: null`. *Evidens: regresjonstest + kode.*
- [ ] **K5 (#647 Bug3):** `getLigaSnapshot` selekterer per-kjønn-par, ikke bar `par`, mapper `par: par_mens`. *Evidens: regresjonstest + Supabase MCP.*
- [ ] **K6 (#648 lagring):** Alle `league_rounds`-vindu-skrivere konverterer `datetime-local` via `parseOsloDateTimeLocal`. 06:00 lokal sommertid lagres som `04:00:00+00`. *Evidens: Type A round-trip-test (`parseOsloDateTimeLocal` → `formatOsloDateTimeLocal` = identitet) + kode på hver skriver.*
- [ ] **K7 (#648 visning):** `LigaRoundRow` viser Oslo wall-clock (datetime-local-prefill OG window-label), ikke UTC-timer. *Evidens: Type A-test for `formatOsloDateTimeLocal` + kode.*
- [ ] **K8 (gating-konsekvens):** Etter lagrings-fix flipper en runde satt til «åpner 06:00» til ÅPEN kl. 06:00 lokal, ikke 08:00. *Evidens: resonnement + kode (gaten bruker `new Date(opens_at)` mot `Date.now()`, begge nå korrekte instants).*
- [ ] **K9 (regresjon dekket):** Nye co-located/fokuserte tester for `createCupMatchesFromPlan` (utvid eksisterende `generer/actions.test.ts`), `getCupSnapshot`, `getLigaSnapshot`, `startLeagueRoundFlight`, og Oslo-helper-round-trip. *Evidens: `npx vitest run` grønn på de berørte filene.*
- [ ] **K10 (gates):** `npx tsc --noEmit` (eller `next build`) ren; berørte + co-located vitest grønn; ingen nye ESLint-feil på endrede filer.
- [ ] **K11 (disiplin):** `package.json` + `CHANGELOG.md` bumpet for de bruker-synlige fixene (patch under åpent tema); closing-kommentar (Teknisk + Funksjonell) på hver av #641/#642/#647/#648 ved merge.

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
