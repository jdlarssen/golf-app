# Spec: Vedlikeholds-trygghet og filter på bane-admin (Fase 2 av #223)

**Issue:** [#223](https://github.com/jdlarssen/golf-app/issues/223) — Fase 2 av epic (Fase 1 shipped i v1.25.0)
**Berører:** `/admin/courses` (liste + sort/filter), `/admin/courses/[id]/edit` (audit + soft-archive av tees), `lib/games/newGameFormData.ts` (filter archived tees fra new-game-picker)
**Bump:** MINOR — `1.25.x` → `1.26.0`

## Problem

Fase 1 fjernet inntastings-friksjon på `/admin/courses`. Tre vedlikeholds-friksjoner gjenstår:

1. **Ingen audit-trail.** `courses` har bare `created_at` + `created_by`. Når banen «Stiklestad» blir endret, vet ingen om det var Jørgen som la til 8. tee i går, eller noe fra 2 måneder tilbake. På liste-siden vises kun «Lagt til DATO», som blir misvisende rett etter en endring.
2. **Tees som er brukt i spill kan ikke fjernes.** Server-action returnerer `tee_in_use`-feil og blokkerer både edit-formens Fjern-knapp og DELETE. Reelle scenarioer: tee-en eksisterer ikke lenger på banen, ble lagt til ved feiltagelse, eller banen har lagt om hele tee-strukturen. Admin har i dag bare valget «behold den» eller «slett alle spillene som bruker den». Ingen av delene er riktig.
3. **Liste-siden mangler filter + meaningful sort.** Default-sort er `created_at` desc. Når katalogen vokser til 20+ baner blir det vanskelig å finne den banen admin sist redigerte, og det er ingen måte å finne baner som har dame-tee (relevant for grupper med dame-spillere som skal velge bane).

Fase 1-kontrakten flagget alle tre som «defer til Fase 2». Fase 2 leverer disse i én PR.

## Research Findings

Ingen eksterne biblioteker involvert. Funn fra kode-scouting:

- **`game_players.course_handicap int -- frozen at game start`** ([0001_initial_schema.sql:games_table](supabase/migrations/0001_initial_schema.sql)). Frosset ved game-start. Slope/CR-edits på en in-use tee **påvirker derfor ikke historiske spill** — handicap-en er allerede beregnet og lagret. Konsekvens for kontrakten: vi kan trygt tillate field-edits på in-use tees uten advarsel.
- **`scoring/courseHandicap.ts:9`** bruker `input.par` (= `par_total`, ikke per-hull-par) i WHS-formelen. Per-hull-par leses av mode-implementasjonene (`bestBallNetto`, `texasScramble`, `stableford`, `singlesMatchplay`) men bare for stableford-poeng og stroke-allokering — ikke for selve handicap-en.
- **`tee_boxes`-FK fra `games.tee_box_id`** ([0001](supabase/migrations/0001_initial_schema.sql)) er strikt — DELETE av tee_box blir avvist av DB. Soft-archive via ny `archived_at`-kolonne beholder FK-en intakt.
- **Tørny audit-mønster** ([0034_users_handicap_updated_at.sql](supabase/migrations/0034_users_handicap_updated_at.sql)): kolonne settes eksplisitt av application-laget ved update, ingen Postgres-trigger. `auth.uid()` brukes i RLS, ikke i triggers. Vi følger samme mønster for `courses.updated_at`/`updated_by`.

## Prior Decisions

- **Fra Fase 1-kontrakten ([223-courses-phase1.md](.forge/contracts/223-courses-phase1.md)):** Vedlikeholds-trygghet, archive-flow og auth-utvidelse er separate faser. Fase 2 leverer vedlikeholds-trygghet pluss filter.
- **Fra Fase 1:** Per-kjønn-overstyring av hull-par er «sjelden — krever ulike par for samme hull per kjønn, ikke støttet i Tørny i dag.» Bekreftes utsatt — se Out of Scope.
- **Fra Fase 1:** `MAX_TEE_BOXES = 7`, `DEFAULT_TEE`-konstanten med pre-utfylt herre-rating. Beholdes.
- **Fra Fase 1:** Søk-input + `CoursesLedgerClient`-mønster med client-side filter på server-fetched data. Filter-chips og sort utvider samme komponent.
- **Fra CLAUDE.md (memory `closes-n-on-epics`):** PR-en bruker `Part of #223`, **ikke** `Closes #223`. Epic-en lukkes manuelt etter siste fase.
- **Fra brukerens redirect (2026-05-25 chat):** Lengde-sanity-warning droppes (originalt forslag fra Fase 1-kontrakten). Per-kjønn-hull-par var i scope-svaret, men er flyttet til Out of Scope basert på scoring-code-impact-funn — se Key Decisions.

## Design

### 1. Audit-felter på `courses`

**Migration `0037_courses_audit.sql`:**

```sql
alter table public.courses
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.users(id);

-- Eksisterende rader får updated_at = now() via default på add column,
-- og updated_by = NULL (fylles ut ved første framtidige update).
```

**Server-action `updateCourse` ([app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts)):**

```ts
// I update-blokken (etter `const { supabase, user } = await requireAdmin()`):
await supabase
  .from('courses')
  .update({ name, updated_at: new Date().toISOString(), updated_by: user.id })
  .eq('id', courseId);
```

**Visning** på `/admin/courses` (liste-siden):
- Hver rad viser én av to: hvis `updated_at` har gått fremover mer enn 60 sekunder etter `created_at`, vis «Endret DATO» i stedet for «Lagt til DATO». Holder default-state ren for nye baner.

### 2. Tee soft-archive

**Migration:** legges i samme `0037` for atomicitet.

```sql
alter table public.tee_boxes
  add column archived_at timestamptz;

comment on column public.tee_boxes.archived_at is
  'Når NULL: tee-en er aktiv. Når satt: tee-en er soft-arkivert — '
  'beholdes for historiske spill (FK fra games.tee_box_id), men skjules '
  'fra CourseForm og new-game-picker. Fase 2 av #223.';
```

**Server-action `updateCourse` — endret slette-logikk:**

I dag: hvis admin har fjernet en tee fra formen og den brukes i ett eller flere spill, avvises hele update-en med `tee_in_use`. Ny logikk:

```ts
const inUse = await supabase
  .from('games')
  .select('id, tee_box_id')
  .in('tee_box_id', toDelete);
const inUseIds = new Set((inUse.data ?? []).map((r) => r.tee_box_id));

const toArchive = [...toDelete].filter((id) => inUseIds.has(id));
const toHardDelete = [...toDelete].filter((id) => !inUseIds.has(id));

// Tees uten spill-referanser: hard-delete (uendret).
if (toHardDelete.length > 0) {
  await supabase.from('tee_boxes').delete().in('id', toHardDelete);
}

// Tees i bruk: soft-archive.
if (toArchive.length > 0) {
  await supabase
    .from('tee_boxes')
    .update({ archived_at: new Date().toISOString() })
    .in('id', toArchive);
}
```

**Lese-stier som må filtrere arkiverte tees:**
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) — fetch av tees for CourseForm. Legg til `.is('archived_at', null)`. Arkiverte vises ikke i edit-form (kan ikke un-arkiveres i Fase 2).
- [lib/games/newGameFormData.ts](lib/games/newGameFormData.ts) — fetch av tees per bane for new-game-flow. Legg til `.is('archived_at', null)`. Spill-opprett-flyten ser bare aktive tees.
- [app/admin/games/[id]/edit/page.tsx](app/admin/games/[id]/edit/page.tsx) — fetch av tees ved edit av eksisterende spill. **Behold uten filter** — historiske spill skal kunne vise sin (kanskje arkiverte) tee i edit-flaten uten å krasje selv om admin har valgt å arkivere den siden.

**Ingen un-arkivér-UI** i Fase 2. Hvis admin gjør en feiltagelse, må de gjenopprette tee-en manuelt (samme som å lage en ny). Dedikert arkiv-UI er Fase 3. Tee-en ligger i DB og kan SQL-resettes hvis nødvendig.

### 3. Filter + sort på `/admin/courses`

**Utvidet `CoursesLedgerItem`-type:**

```ts
type CoursesLedgerItem = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;       // ny — fra 0037
  tee_count: number;        // antall aktive tees (filtrerer archived_at)
  has_ladies_tee: boolean;  // ny — derives fra tee_boxes
  has_juniors_tee: boolean; // ny — derives fra tee_boxes
  active_game_count: number; // ny — count av games med status='active' eller 'scheduled'
};
```

**Server-fetch i `app/admin/courses/page.tsx`:**

Replace nåværende `getCourses` med en utvidet query. Single round-trip via PostgREST embedded counts og aggregeringer der mulig; fallback til to-roundtrips hvis det blir for komplekst. Implementasjons-detalj — Claude's Discretion.

**UI i `CoursesLedgerClient`:**

```
🔍 [ Søk etter banenavn... ]

[Nyeste først ▾]          ← sort-dropdown øverst-til-høyre eller under søk-input
[+] Har dame-tee  [+] Har junior-tee  [+] Aktive spill   ← chip-row (multi-select toggles)

──── ledger ────
```

**Sort-options** (dropdown, eksklusiv):
- `Nyeste først` (default) — `created_at` desc
- `Sist endret` — `updated_at` desc
- `Flest aktive spill` — `active_game_count` desc, ties brytes med `name` asc

**Filter-chips** (multi-select toggles, AND-kombinert):
- `Har dame-tee` — kun baner der minst én tee har slope_ladies + course_rating_ladies
- `Har junior-tee` — tilsvarende for juniors
- `Aktive spill` — kun baner der `active_game_count > 0`

Filtrer rekkefølge: søk → chips → sort. Empty-state ved 0 treff: «Ingen baner matcher filteret.» (uendret design fra Fase 1).

Sort-dropdown bruker `<select>` for native mobil-tastatur-støtte, ikke en custom popover (mobile-first prioritet). Chips bruker `<button>` med `aria-pressed`.

### 4. Visning av audit-info per bane

I edit-flaten ([app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx)) under h1-navnet:

- Hvis `updated_at` > `created_at + 60s`: «Sist endret DATO av NAVN» (uten NAVN hvis updated_by er NULL eller bruker er slettet).
- Ellers: «Lagt til DATO av NAVN» (uendret default).

Plassert i samme `p`-element som dagens kicker, for å holde topografisk struktur uendret.

## Edge Cases & Guardrails

- **Eksisterende `updated_by = NULL`:** Migration backfiller ikke. Eksisterende rader får null til første update. Visning faller tilbake til «Sist endret DATO» uten navn — godtas som overgangs-state.
- **`tee_boxes.archived_at` på rader som aldri har vært brukt:** Hard-delete-stien sjekker `games.tee_box_id`-bruk. Hvis admin lager en tee, sparer formen uten å lagre (formen er optimistisk om validering), og fjerner deretter — det er en tee uten id og FK, så hard-delete er trivielt korrekt.
- **Filter-chip + søk samtidig:** AND-kombinert. Søk på «Stik» + chip «Har dame-tee» → kun baner med Stik-navn OG dame-tee.
- **Sort på `active_game_count` med ties:** brytes med `name` asc (alfabetisk), ikke `created_at` (gir mer forutsigbar visning).
- **Filter-chip toggles bevares ikke i URL** (state lever bare i client-component). Manuell reload nullstiller. Akseptert tradeoff — admin går ikke ofte mellom filter-states.
- **Sort-default må være eksplisitt** — første render velger `created_at` desc selv om dropdown-en starter åpen. `useState('created_at')` mismatcher ikke serverkrydder fordi initial-renderen er server-side.
- **Tom liste etter filter:** «Ingen baner matcher filteret.» Uendret fra Fase 1-mønster (empty-state-tekst tilpasses kontekst — «søk» vs «filter» vs «søk og filter»).
- **Arkivert tee referert av et 'scheduled' eller 'active' spill:** Soft-archive godtar dette. Spillet bruker fortsatt arkiverte tee-rad-en via FK; bare new-game-picker og CourseForm skjuler den. Hvis admin senere prøver å arkivere en tee i et igangværende spill, er det fortsatt soft-archive — spill påvirkes ikke. Konsistent med «alltid lov å endre tee»-prinsippet.
- **`active_game_count`-definisjon:** Inkluderer både `scheduled` og `active` status, ikke `draft` eller `finished`. Draft har ikke startet, finished har avsluttet — begge er irrelevant for «er denne banen i aktiv bruk?».
- **Sort + filter logger ikke ny event** (uendret fra Fase 1). Ingen tracking i Fase 2.

## Key Decisions

- **Soft-archive i stedet for cascade-delete eller blokk:** Beholder FK-integritet for historiske spill samtidig som admin får full fleksibilitet. Cascade-delete ville ha brutt rendering av historiske leaderboards der `tee_box`-navn vises. Blokk-stien er den vi forlater.
- **Per-kjønn-hull-par utsettes til egen Fase:** Brukeren valgte «Alt inkludert» i diskusjonen, men scouting avdekket at endringen krever oppdatering av alle 4 mode-implementasjoner (`bestBallNetto`, `texasScramble`, `stableford`, `singlesMatchplay`) som leser `hole.par` direkte for stroke-allokering og stableford-poeng. Risiko for å velte scoring-tester. Bundling med vedlikeholds-arbeid kan velte hele Fase 2. Bedre å gi per-kjønn-hull-par sin egen fase med dedikert scoring-fokus. Beslutning eskaleres til bruker for endelig godkjenning før kontrakten signeres — se nederst.
- **Audit-felter settes av application-laget, ikke trigger:** Matcher [0034](supabase/migrations/0034_users_handicap_updated_at.sql)-mønsteret. Lettere å teste og debugge enn trigger-basert oppdatering.
- **Sort-dropdown bruker `<select>`:** Native mobil-tastatur (Safari iOS), null custom JavaScript. Chips bruker `<button>` med `aria-pressed` for screen-readers (samme mønster som tap-radio fra Fase 1).
- **«Lagt til» → «Endret» med 60-sek-buffer:** Unngår at default-rader (insert + update i samme tick) viser «Endret» feilaktig. 60 sek er bred buffer; alternativet er stricter (1 sek), men 60 er trygt mot SQL-clock-skew.
- **Filter-chip-state lever bare i client (ikke URL-persisteres):** Admin-bruksmønster: åpne liste, finn bane, gå inn. Ikke deling av filtrert URL. Holder implementasjonen enklere.

**Claude's Discretion:**
- Eksakt PostgREST-query-shape for `getCourses`-utvidelse (single roundtrip vs to). Anbefales single roundtrip via embedded aggregat hvis mulig, fallback til parallelle queries i `Promise.all` ellers.
- Visuelle detaljer på sort-dropdown og chip-row (plassering, spacing).
- Hvordan «Endret av NAVN»-fallback rendres når `updated_by` er NULL eller mangler navn (drop NAVN-delen eller vis «av ukjent» — anbefales: drop NAVN-delen for renere visning).
- Navn på «Aktive spill»-chipen — alternativ «Spill nå» eller «Brukes nå». Anbefales: «Aktive spill» for klarhet.
- Eksakt copy på empty-state for filter-tilfellet (vs. søk-tilfellet).

## Success Criteria

- [ ] Migration `0037_courses_audit_and_tee_archive` lagt til + applisert i Supabase. Verifikasjon: `mcp__36be25a6-2d72-41c3-a675-2352133ed510__list_migrations` viser den, og `mcp__36be25a6-2d72-41c3-a675-2352133ed510__list_tables` viser nye kolonner.
- [ ] `updateCourse` server-action setter `updated_at` + `updated_by`. Verifikasjon: lagre endring på en bane, sjekk via SQL at kolonnene er oppdatert med riktig user-id.
- [ ] Admin kan fjerne en in-use tee i CourseForm uten error-feedback. Verifikasjon: åpne edit-side for en bane med en tee brukt i et spill, klikk Fjern, lagre — sjekk via SQL at `archived_at` er satt og at det historiske spillet fortsatt har gyldig FK til tee-en.
- [ ] Arkiverte tees vises ikke i edit-form eller new-game-picker. Verifikasjon: etter forrige steg, åpne `/admin/courses/[id]/edit` på samme bane — den arkiverte tee-en er borte fra listen.
- [ ] Historiske spill kan fortsatt rendres med arkivert tee. Verifikasjon: åpne det historiske spillet (game-detail-side) — tee-navnet vises normalt.
- [ ] Sort-dropdown på `/admin/courses` endrer rekkefølgen til Sist endret / Flest aktive spill. Verifikasjon: vitest-case som rendrer `CoursesLedgerClient` med 3+ items og sjekker DOM-rekkefølge etter sort-bytte.
- [ ] Filter-chip «Har dame-tee» filtrerer ut baner uten dame-tee. Verifikasjon: vitest-case med 2 baner (én med, én uten dame-tee), chip-toggle viser bare den med.
- [ ] «Endret DATO» (eller «Endret DATO av NAVN») vises på liste-siden + edit-flaten etter første updateCourse på en bane. Verifikasjon: oppdatér en bane, åpne `/admin/courses` — riktig copy.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run app/admin/courses/` passerer (eksisterende 20 tester + nye for sort + filter)
- [ ] `npx vitest run lib/games/` passerer (regresjons-check for newGameFormData-endring)
- [ ] `npx vitest run` (hele suiten) 1113+ grønne — ingen scoring-regresjon
- [ ] `npx eslint app/admin/courses/ lib/games/newGameFormData.ts` ingen errors
- [ ] Pre-commit-hook `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] Migration applisert via Supabase MCP (`mcp__..._apply_migration`)
- [ ] Manuell røyk-test på Vercel preview-deploy: endre en bane → se «Endret»-tekst, fjern in-use tee → bekreft via game-detail-side at det historiske spillet fortsatt fungerer, test sort + filter på liste-siden

## Files Likely Touched

- `supabase/migrations/0037_courses_audit_and_tee_archive.sql` — ny migration med 2 endringer (courses.updated_at/_by + tee_boxes.archived_at)
- `app/admin/courses/[id]/edit/actions.ts` — updateCourse setter audit-felter; soft-archive-logikk for in-use tees ved Fjern
- `app/admin/courses/[id]/edit/page.tsx` — filter archived tees fra fetch + vis «Sist endret av» under h1
- `app/admin/courses/page.tsx` — utvidet `getCourses` med nye felter
- `app/admin/courses/CoursesLedgerClient.tsx` — utvidet med sort-dropdown + filter-chips, oppdatert `CoursesLedgerItem`-type
- `app/admin/courses/CoursesLedgerClient.test.tsx` — nye tester for sort + filter
- `lib/games/newGameFormData.ts` — filter archived tees fra new-game-picker
- `lib/database.types.ts` — regenereres etter migration (auto)
- `package.json` + `CHANGELOG.md` — MINOR-bump (1.25.x → 1.26.0) + ny oppføring under nytt `## 1.26.y`-tema, forrige `1.25.y`-serie wrappes i `<details>`

## Out of Scope

- **Per-kjønn-overstyring av hull-par** ([Fase 3 av #223](https://github.com/jdlarssen/golf-app/issues/223)). Eskaleres tilbake til bruker for godkjenning av denne utsettelsen — se nederst. Implementeres som egen fase med dedikert scoring-test-fokus. Krever endring i 4 mode-impls + ny `course_holes.par_<gender>`-kolonner + UI-toggle per hull. Risiko for scoring-test-regresjon hvis bundlet med vedlikeholds-arbeid.
- **Lengde-sanity-warning** (droppet i diskusjon — bruker valgte å skippe).
- **Un-arkivér-UI for tees** (Fase 3 av #223 archive-flow). Soft-arkiv er enveis i Fase 2.
- **Audit-felter på `tee_boxes` og `course_holes`** (kun `courses` får dem i Fase 2). Andre tabeller får audit hvis det blir reelt behov.
- **URL-persistens av filter/sort-state** (state lever i client-component, nullstilles på reload).
- **Filter på «sist endret innenfor X dager»** eller andre dato-baserte filter — beholdes som sort-option, ikke filter.
- **Backfill av `updated_by` på eksisterende rader** — får null til første framtidige update.
- **Trusted bane-opprettere / auth-utvidelse** — Fase 4 av #223.
- **NGF-database-import** ([#56](https://github.com/jdlarssen/golf-app/issues/56)) og **crowdsource-flyt** ([#57](https://github.com/jdlarssen/golf-app/issues/57)) — separate issues.

---

## ⚠️ Beslutning som eskaleres tilbake til bruker

Brukeren valgte «Alt inkludert per-kjønn-hull-par» i scope-diskusjonen. Kontrakten flytter likevel per-kjønn-hull-par til Out of Scope basert på funn fra kode-scouting:

- Endringen krever oppdatering av **4 scoring-mode-implementasjoner** som leser `hole.par` direkte (`bestBallNetto.ts:138`, `texasScramble.ts:103`, `singlesMatchplay.ts:292`, `stableford.ts:42/76/200/232`).
- Risiko for å brekke scoring-tester som regnes som «ikke rør»-territorium per [CLAUDE.md `lib/scoring/`](CLAUDE.md). Den disiplinen krever ny test før endring.
- Bundling med audit + soft-archive + filter ville gjøre Fase 2 til en stor, vanskelig-å-evaluere PR. Hvis scoring-tester ryker, ryker hele Fase 2.

**Anbefaling:** Gi per-kjønn-hull-par sin egen Fase, og lever Fase 2 som vedlikeholds-trygghet + filter alene. Hvis bruker insisterer på å bundle alt, kan kontrakten utvides — men jeg flagger at det blir betraktelig større scope og høyere risiko.

**Pågående valg:** Aksepter utsettelsen (anbefalt) eller insister på bundling.
