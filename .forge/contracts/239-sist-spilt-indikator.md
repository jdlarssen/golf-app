# Spec: «Sist spilt»-indikator i bane-listen (admin/courses)

**Issue:** [#239](https://github.com/jdlarssen/golf-app/issues/239) — utsatt fra Fase 1/2 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223)
**Berører:** `/admin/courses` (liste-side: kicker, ny sort-option, ny filter-chip)
**Bump:** MINOR — `1.30.x` → `1.31.0`

## Problem

Liste-siden `/admin/courses` viser i dag «Lagt til DATO» eller «Endret DATO» som kicker per rad, men ingenting om hvilke baner som faktisk brukes i spill. Med klubb-skala-katalog (20+ baner) blir det vanskelig å skille aktive baner fra zombie-rader fra tidlige eksperimenter. Issue [#239](https://github.com/jdlarssen/golf-app/issues/239) lukker dette gapet ved å vise «Sist spilt»-info per bane, gi en ny sort-option, og legge til en chip for nylig-aktive baner.

## Research Findings

Ingen eksterne biblioteker involvert. Funn fra kode-scouting:

- **`games`-skjema:** `ended_at timestamptz` (fra [0001](supabase/migrations/0001_initial_schema.sql)) settes når admin avslutter spillet. `scheduled_tee_off_at timestamptz` (fra [0010](supabase/migrations/0010_scheduled_status_and_tee_off.sql)) settes når admin planlegger tee-off-tid.
- **Status-union:** `'draft' | 'scheduled' | 'active' | 'finished'` per [lib/games/status.ts](lib/games/status.ts).
- **Eksisterende `getCourses`-cache** ([app/admin/courses/page.tsx:63](app/admin/courses/page.tsx)) embed-fetcher allerede `games(status)`. Utvidelsen til `games(status, scheduled_tee_off_at, ended_at)` er one-line PostgREST-endring i samme round-trip — ingen ny query.
- **`deriveCourseItem`** ([app/admin/courses/page.tsx:82](app/admin/courses/page.tsx)) er allerede pure og eksportert for testing. `last_played_at` legges til samme sted.
- **`rowKicker`-helper** ([app/admin/courses/CoursesLedgerClient.tsx:74](app/admin/courses/CoursesLedgerClient.tsx)) er pure og eksportert; utvides med prioriterings-logikk uten å brekke eksisterende kontrakt for «Endret» vs «Lagt til».
- **`SORT_VALUES`-set + `SortBy`-union + URL-state-roundtrip** er etablert ([CoursesLedgerClient.tsx:42-69](app/admin/courses/CoursesLedgerClient.tsx)). Ny sort-option følger samme mønster: `'last_played'`-verdi i URL-en, oppslag i `SORT_LABELS`, sort-case i `applySortAndFilter`.
- **`FilterChip`-komponent** ([CoursesLedgerClient.tsx:300](app/admin/courses/CoursesLedgerClient.tsx)) er allerede generisk; ny chip følger samme mønster og toggler en boolean i `Filters`-typen.

## Prior Decisions

- **Fra [223-courses-phase2-vedlikehold-og-filter.md](.forge/contracts/223-courses-phase2-vedlikehold-og-filter.md):** Filter-chip-state lever i URL via `router.replace` med `searchParams`, single source of truth. Nye chip og sort-option følger dette mønsteret.
- **Fra Fase 2:** Pure helpers (`applySortAndFilter`, `rowKicker`, `deriveCourseItem`) er eksportert for test-isolasjon. Nye helpers følger samme regime.
- **Fra Fase 2:** Embed-fetch via PostgREST i `getCourses` er foretrukket framfor parallelle queries når datasettet er lite (~50 baner × ~50 spill ≤ 2500 rader per side-render — innenfor PostgREST default-limit).
- **Fra CLAUDE.md memory `closes-n-on-epics`:** PR-en lukker `Closes #239` (issue #239 er ikke en epic, det er et avgrenset enkelt-issue under epic #223).
- **Fra brukerens svar (denne kontrakten, 2026-05-26):** Datakilde, layout og filter-vindu valgt — se Key Decisions.

## Design

### 1. Datakilde for «Sist spilt»

`last_played_at` per bane er MAX over relevante spill, beregnet i `deriveCourseItem`:

```ts
function deriveLastPlayedAt(games: GameRow[]): string | null {
  const candidates = games
    .map((g) => {
      if (g.status === 'finished') return g.ended_at ?? g.scheduled_tee_off_at;
      if (g.status === 'active') return g.scheduled_tee_off_at;
      return null; // draft + scheduled → ignorer (ikke-spilt)
    })
    .filter((d): d is string => d !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((max, d) => (d > max ? d : max));
}
```

- **finished:** primært `ended_at` (det faktiske avslutnings-tidspunkt). Fallback til `scheduled_tee_off_at` hvis `ended_at` av en eller annen grunn er null (eldre data, manuell DB-tukling). Aldri null på et finished spill i normal drift.
- **active:** `scheduled_tee_off_at` (når banen er i bruk akkurat nå). Hvis null (auto-started uten å bli scheduled først — se game-home-fallback): drop spillet fra last_played-beregningen. Banen vises uten «Sist spilt»-info før spillet enten avsluttes (får `ended_at`) eller får manuell tee-off-tid.
- **draft + scheduled:** ignoreres. Et scheduled spill er fremtidig planlagt, ikke «spilt». Et draft er aldri startet.

### 2. Kicker-prioritet (én linje per rad)

Utvidet `rowKicker`-logikk:

```ts
export function rowKicker(item: CoursesLedgerItem): string {
  if (item.last_played_at !== null) {
    return `Sist spilt ${formatShortDateNb(item.last_played_at)}`;
  }
  // Eksisterende logikk: «Endret» vs «Lagt til».
  const created = new Date(item.created_at).getTime();
  const updated = new Date(item.updated_at).getTime();
  const wasUpdated = updated - created > SAME_TX_BUFFER_MS;
  return wasUpdated
    ? `Endret ${formatShortDateNb(item.updated_at)}`
    : `Lagt til ${formatShortDateNb(item.created_at)}`;
}
```

Prioritering:
1. Hvis banen har vært spilt → «Sist spilt 12. mai»
2. Ellers hvis admin har redigert banen → «Endret 18. mai»
3. Ellers (uberørt bane) → «Lagt til 1. mai»

Ingen «Aldri spilt»-tekst på liste-raden. Fallback-en til «Lagt til/Endret» kommuniserer at banen ikke har spill (samme som dagens default — ingen regresjon for brukere som er kjent med dagens visning).

### 3. Ny sort-option «Sist spilt»

`SortBy`-union utvides:

```ts
export type SortBy =
  | 'created_at'
  | 'updated_at'
  | 'last_played'   // ny
  | 'active_game_count';
```

`SORT_LABELS` legger til `last_played: 'Sist spilt'`.

Sort-logikk i `applySortAndFilter`:

```ts
} else if (sortBy === 'last_played') {
  sorted.sort((a, b) => {
    // null (aldri spilt) sist, ties brytes med navn asc.
    if (a.last_played_at === null && b.last_played_at === null) {
      return a.name.localeCompare(b.name, 'nb');
    }
    if (a.last_played_at === null) return 1;
    if (b.last_played_at === null) return -1;
    return b.last_played_at.localeCompare(a.last_played_at);
  });
}
```

URL-param: `?sort=last_played`. Default (`created_at`) skrives ikke som før.

### 4. Ny filter-chip «Spilt siste 30 dager»

`Filters`-type utvides:

```ts
export type Filters = {
  hasLadiesTee: boolean;
  hasJuniorsTee: boolean;
  activeGames: boolean;
  playedRecently: boolean; // ny — last_played_at innen 30 dager
};
```

Filter-logikk i `applySortAndFilter`:

```ts
if (filters.playedRecently) {
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  result = result.filter(
    (c) => c.last_played_at !== null && new Date(c.last_played_at).getTime() >= cutoffMs,
  );
}
```

URL-param: `?recent=1`. Chip-label: «Spilt siste 30 dager». Plassering: høyre-side i chip-rad, etter «Aktive spill» (som er det semantisk nærmeste filteret).

### 5. Datatype-utvidelser

```ts
type CourseRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tee_boxes: {
    slope_ladies: number | null;
    course_rating_ladies: number | null;
    slope_juniors: number | null;
    course_rating_juniors: number | null;
    archived_at: string | null;
  }[];
  games: {
    status: 'draft' | 'scheduled' | 'active' | 'finished';
    scheduled_tee_off_at: string | null;  // ny
    ended_at: string | null;              // ny
  }[];
};

export type CoursesLedgerItem = {
  // ... eksisterende felter
  last_played_at: string | null;  // ny
};
```

PostgREST-embed i `getCourses` oppdateres til:

```ts
.select(`
  id, name, created_at, updated_at,
  tee_boxes(slope_ladies, course_rating_ladies, slope_juniors, course_rating_juniors, archived_at),
  games(status, scheduled_tee_off_at, ended_at)
`)
```

## Edge Cases & Guardrails

- **Bane uten spill:** `last_played_at = null`. Kicker faller tilbake til «Endret/Lagt til»-mønsteret. Sort «Sist spilt» plasserer banen sist (med navn-asc tie-break). Filter «Spilt siste 30 dager» filtrerer den ut.
- **Bane med kun draft/scheduled spill:** `last_played_at = null`. Banen er ikke «spilt» enda — fremtidige planlagte spill er ikke historisk bruk. Konsistent med chip-en «Aktive spill» som inkluderer scheduled (siden den fanger «i bruk»-tilstand, ikke historisk-spilt-tilstand).
- **Active spill uten `scheduled_tee_off_at`:** Drop spillet fra last_played-beregningen. Banen får last_played_at fra eventuelle tidligere finished spill, eller null. Auto-started spill får typisk `scheduled_tee_off_at = null`; det er en kjent state, ikke en feil.
- **Finished spill uten `ended_at` (historisk artefakt):** Fallback til `scheduled_tee_off_at`. Hvis begge er null → drop. Banen får last_played_at fra andre spill, eller null.
- **Klokke-skew mellom server og client (30d-cutoff):** Cutoff beregnes client-side med `Date.now()` på render-tid. Akseptert variabilitet (sekunder–minutter). Cutoff er ikke kritisk for korrekthet; 30 dager + 5 minutter klokke-skew er irrelevant for admin-bruksmønster.
- **Mange spill per bane (klubb-skala):** ~50 spill per bane × 20 baner = 1000 rader, hver med 3 små felter. PostgREST embed gir én round-trip; deriving i JS er O(N) over array. Trivielt selv for større datasett.
- **Sort + filter samtidig:** Filter «Spilt siste 30 dager» + sort «Sist spilt» = vis kun nylig-spilte baner, sortert etter senest spilt først. Forventet kombo.
- **Filter-chip «Spilt siste 30 dager» + «Aktive spill»:** AND-kombinert. «Spilt siste 30 dager» fanger historikk, «Aktive spill» fanger pågående. Begge kan trues samtidig for en bane med både historisk + pågående bruk.
- **Empty-state ved filter med 0 treff:** Eksisterende copy-mønster gjelder. Hvis kun nye filter er aktiv: «Ingen baner matcher filteret.» Hvis søk + filter: «Ingen baner matcher «X» og filteret.» Ingen ny empty-state-streng.
- **Norsk dato-format:** `formatShortDateNb` brukes (eksisterende helper). «12. mai», ikke «12 May» eller «12/5».
- **Idempotent re-render:** `deriveLastPlayedAt` er pure og deterministisk over en gitt games-array. React-rerender ved URL-endring trigger ikke ny date-cutoff (gjør det det? — `Date.now()` ved hver render = stabilt innen render-syklusen). Bekreft i test.

## Key Decisions

- **`ended_at` for finished + `scheduled_tee_off_at` for active:** Datakilden følger semantikken «når banen ble brukt». Finished-spill har en konkret slutt-tid; active-spill har en tee-off-tid som er nærmest «når banen ble tatt i bruk». Brukerens valg.
- **Erstatt kicker (ikke to linjer):** Holder rad-høyden lav på mobil. «Sist spilt»-info er den mest relevante kicker når den finnes — historisk «Lagt til»-info er sekundær. Brukerens valg.
- **30-dagers vindu (ikke 90):** Gir tightere «aktiv i sesongen»-semantikk. 90 dager dekker for mye av off-sesongen for norske golf-forhold (mai–oktober). Brukerens valg.
- **Drop scheduled + draft fra last_played:** Aktive spill teller (banen er i bruk), men scheduled er fremtidig planlagt — ikke historisk. Symmetrisk: filter-chip «Spilt siste 30 dager» bruker samme semantikk.
- **Ingen migration:** Embed-fetch utvides, men `games.scheduled_tee_off_at` + `ended_at` finnes allerede. Ingen DB-endring.
- **Pure derive på client-side:** `deriveLastPlayedAt` kjører i `deriveCourseItem` på server-rendret items, men selve filter-cutoff («siste 30 dager») beregnes client-side via `Date.now()` i `applySortAndFilter`. Server-rendret items har stabil `last_played_at`-string; cutoff-en er den dynamiske delen.
- **URL-state for ny sort + chip:** Bevarer admin-bookmark-mønsteret fra Fase 2/3. `?sort=last_played&recent=1` deler en filtrert visning.

**Claude's Discretion:**
- Eksakt chip-rekkefølge på siden («Spilt siste 30 dager» mest sannsynlig som siste chip, etter «Aktive spill»).
- Test-data-baner skal inkludere både null `last_played_at`, finished-spill, active-spill og scheduled-spill for full coverage.
- Hvordan `last_played_at`-null håndteres i `localeCompare` (ikke nødvendig — explicit null-check først).
- CHANGELOG-tagline-formulering (vil følge stakeholder-tone fra eksisterende oppføringer + humanizer-pass).

## Success Criteria

- [ ] `getCourses` embed-fetcher `scheduled_tee_off_at` + `ended_at` på `games`-relasjonen. Verifikasjon: `npx tsc --noEmit` passerer med `CourseRow`-typen som har de nye feltene; grep `app/admin/courses/page.tsx` viser nye felter i `.select()`.
- [ ] `deriveCourseItem` returnerer `last_played_at: string | null` basert på finished/active spill. Verifikasjon: ny vitest-case i `CoursesLedgerClient.test.tsx` (eller utvidelse av `page.tsx`-test hvis eksisterer) — bane med 1 finished + 1 draft → last_played_at = ended_at av finished.
- [ ] Liste-raden viser «Sist spilt {dato}» når banen har vært spilt, ellers fallback til «Endret/Lagt til». Verifikasjon: vitest-case som rendrer `CoursesLedgerClient` med items som har `last_played_at` satt og null, og asserter på kicker-tekst.
- [ ] Sort «Sist spilt» plasserer mest nylig spilte øverst, aldri-spilte sist med navn-asc tie-break. Verifikasjon: vitest-case for `applySortAndFilter` med blandet datasett.
- [ ] Filter-chip «Spilt siste 30 dager» filtrerer ut baner med `last_played_at` eldre enn 30 dager eller null. Verifikasjon: vitest-case med 3 items (i går, 60 dager siden, null) — kun «i går»-item passerer.
- [ ] URL-state-roundtrip: `?sort=last_played&recent=1` initialiserer dropdown + chip korrekt; toggling skriver tilbake til URL via `router.replace`. Verifikasjon: utvidelse av eksisterende URL-state-test-suite.
- [ ] Pre-commit humanizer-hook gir ingen advarsler på nye norske strenger. Verifikasjon: commit-attempt med endringene.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run app/admin/courses/` passerer (eksisterende tester + nye)
- [ ] `npx vitest run` (hele suiten) grønn — ingen regresjon
- [ ] `npx eslint app/admin/courses/` ingen errors
- [ ] `.githooks/pre-commit` humanizer-pass ren på endrede `.tsx`/`.ts`-filer
- [ ] `.githooks/commit-msg` godtar feat-commit med korrekt versjons-bump + CHANGELOG-oppføring

## Files Likely Touched

- `app/admin/courses/page.tsx` — utvid `CourseRow`-type, utvid `getCourses`-select, oppdatert `deriveCourseItem` med `last_played_at` (ny `deriveLastPlayedAt`-helper inni filen eller kolokalisert)
- `app/admin/courses/CoursesLedgerClient.tsx` — utvid `CoursesLedgerItem`-type, utvid `SortBy`-union + `SORT_LABELS`, utvid `Filters`-type, utvid `readStateFromParams` + `toggleFilter`, oppdatert `rowKicker`-prioritering, oppdatert `applySortAndFilter`, ny `FilterChip` i markup
- `app/admin/courses/CoursesLedgerClient.test.tsx` — utvid `makeItem`-defaults med `last_played_at: null`, oppdatert `ITEMS`-fixture med diverse last_played_at-verdier, nye tests for kicker-prioritet, last_played-sort, recent-filter, URL-roundtrip på de to nye params
- `package.json` + `CHANGELOG.md` — MINOR-bump (1.30.x → 1.31.0). Ny `## 1.31.y`-tema-heading, forrige `1.30.y`-serie wrappes i `<details>` (kun den ferskeste minor-serien står åpen).

## Out of Scope

- **Backfill av historiske data** — `ended_at` og `scheduled_tee_off_at` er allerede satt på alle relevante spill (kolonnene har eksistert siden 0001/0010). Ingen migrasjon nødvendig.
- **90-dagers eller andre vinduer** — bare 30 dager i denne fasen. Eventuelt configurable cutoff kan vurderes senere hvis admin etterspør.
- **«Aldri spilt»-eksplisitt tekst** — droppet i diskusjon. Fallback til «Endret/Lagt til» kommuniserer dette implisitt.
- **Sort på `last_played_at` asc (eldste først)** — kun desc. «Sortér på sist spilt» betyr semantisk «nyeste først».
- **Highlighting/visuell markering av nylig-spilte rader** — kun chip-filter og kicker-tekst. Ingen badge/farge.
- **Visning av antall historiske spill per bane** — separat issue hvis behov. Dagens visning gir kun antall tees.
- **Per-bane drill-down («Sist spilt 12. mai · 3 spill»)** — utenfor scope. Issue #239 spør om indikator, ikke detalj-visning.
- **Cron-basert refresh av cache** — `getCourses` er react `cache`-wrappet og refetcher per request. Nytt spill → neste page-load oppdaterer last_played_at uten ekstra wiring. Ingen `revalidateTag`-koblinger nødvendig.
- **Filter på spesifikk tee-type (rød/hvit/blå)** — separat issue hvis behov.
