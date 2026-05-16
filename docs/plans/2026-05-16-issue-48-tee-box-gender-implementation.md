# Issue #48 — Kjønn-tag på tee-bokser — implementasjonsplan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tagge tee-bokser med kjønn (`mens`/`ladies`/`juniors`) og la herrer/damer spille fra ulike tees i samme spill med korrekt course handicap.

**Architecture:** `tee_boxes.gender` (NOT NULL, default `mens`) splitter samme fysiske tee i én rad pr. kjønn med eget slope/CR. `game_players.tee_box_id` (nullable override) lar pr.-spiller-tee resolveres ved spill-publish. Admin setter `tee_for_men` + `tee_for_ladies` på game-nivå og toggler M/D pr. spiller; toggle resolveres til tee_box_id ved save.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + RLS, TypeScript, Vitest.

**Design doc:** [docs/plans/2026-05-16-issue-48-tee-box-gender-design.md](2026-05-16-issue-48-tee-box-gender-design.md)

**Issue:** https://github.com/jdlarssen/golf-app/issues/48

---

## Atomic commits (planlagt struktur)

Hver `feat`-commit bumper version per CLAUDE.md-disiplin og staget CHANGELOG. Sluttilstand: v1.1.10 → v1.1.13 (eller v1.2.0 hvis vi vil markere mixed-gender som minor-feature, vurderes på slutten).

1. `build(db): tee_box_gender enum + game_players.tee_box_id` — schema only, ingen bump
2. `feat(admin/courses): kjønn-tag på tee-bokser + diff-basert edit-flyt` — bump
3. `feat(admin/games): dame-tee + M/D-toggle + course handicap pr. spiller` — bump
4. `feat(games): vis tee på scorekort + begge tees på game-detalj` — bump

---

### Task 1: Migrasjon — `tee_boxes.gender` + `game_players.tee_box_id`

**Files:**
- Create: `supabase/migrations/0028_tee_box_gender.sql`

**Step 1: Skriv migrasjon**

```sql
-- supabase/migrations/0028_tee_box_gender.sql
-- Tag tee-boxes med kjønn (mens/ladies/juniors) og tillat per-player override
-- av tee_box_id på game_players. Backfill av eksisterende tee_boxes til 'mens'
-- skjer via DEFAULT (alle eksisterende tees er herretees per dagens datasett).

create type tee_box_gender as enum ('mens', 'ladies', 'juniors');

alter table public.tee_boxes
  add column gender tee_box_gender not null default 'mens';

alter table public.game_players
  add column tee_box_id uuid references public.tee_boxes(id);

-- Ingen RLS-endringer:
-- - tee_boxes arver fra courses-policy
-- - game_players.tee_box_id leses/skrives som del av eksisterende game_players-policy
```

**Step 2: Apply migrasjon via Supabase MCP**

```
mcp__36be25a6...__apply_migration({
  project_id: "glofubopddkjhymcbaph",
  name: "tee_box_gender",
  query: <innholdet over>
})
```

Expected: success, ingen errors.

**Step 3: Regen types**

```
mcp__36be25a6...__generate_typescript_types({
  project_id: "glofubopddkjhymcbaph"
}) → skriv resultatet til lib/database.types.ts
```

Verifiser at `tee_boxes.Row` har `gender: 'mens' | 'ladies' | 'juniors'` og at `game_players.Row` har `tee_box_id: string | null`.

**Step 4: Verifiser typer kompilerer**

Run: `npx tsc --noEmit`
Expected: 0 errors.

**Step 5: Commit**

```bash
git add supabase/migrations/0028_tee_box_gender.sql lib/database.types.ts
git commit -m "build(db): tee_box_gender enum + game_players.tee_box_id

Refs #48"
```

---

### Task 2: Bane-admin — gender-select pr. tee-rad

**Files:**
- Modify: `app/admin/courses/CourseForm.tsx` (TeeBoxData + form-rendering)
- Modify: `app/admin/courses/new/actions.ts` (lese `gender` fra formData)
- Modify: `app/admin/courses/[id]/edit/page.tsx` (load `gender` inn i initial state)
- Modify: `app/admin/courses/[id]/edit/actions.ts` (skriv `gender` ved insert/update — håndteres i task 3 sammen med diff-flyt)

**Step 1: Utvid `TeeBoxData`-typen + DEFAULT_TEE**

I `app/admin/courses/CourseForm.tsx:16-22`, legg til `gender`-felt:

```tsx
export type TeeBoxData = {
  name: string;
  slope: string;
  course_rating: string;
  par_total: string;
  length_meters: string;
  gender: 'mens' | 'ladies' | 'juniors';
};
```

I `app/admin/courses/CourseForm.tsx:47-53`:

```tsx
const DEFAULT_TEE: TeeBoxData = {
  name: '',
  slope: '113',
  course_rating: '70.0',
  par_total: '72',
  length_meters: '',
  gender: 'mens',
};
```

**Step 2: Render segmented control for gender pr. tee-rad**

I `app/admin/courses/CourseForm.tsx`, inni `teeBoxes.map((tee, index) => ...)`-blokken, FØR navn-feltet:

```tsx
<fieldset>
  <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
    For hvem
  </legend>
  <div className="mt-2 grid grid-cols-3 gap-2">
    {(['mens', 'ladies', 'juniors'] as const).map((g) => (
      <label
        key={g}
        className={`flex items-center justify-center rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${
          tee.gender === g
            ? 'border-accent bg-accent/10 text-text font-medium'
            : 'border-border bg-surface text-muted hover:text-text'
        }`}
      >
        <input
          type="radio"
          name={`tee_${index}_gender`}
          value={g}
          checked={tee.gender === g}
          onChange={() => updateTee(index, { gender: g })}
          className="sr-only"
        />
        {g === 'mens' ? 'Herrer' : g === 'ladies' ? 'Damer' : 'Junior'}
      </label>
    ))}
  </div>
</fieldset>
```

**Step 3: Lese `gender` i create-action**

I `app/admin/courses/new/actions.ts`, finn tee-loopen (samme mønster som `0..5` med `formData.get(\`tee_${i}_slope\`)`). Legg til:

```ts
const genderRaw = String(formData.get(`tee_${i}_gender`) ?? 'mens');
const gender: 'mens' | 'ladies' | 'juniors' =
  genderRaw === 'ladies' || genderRaw === 'juniors' ? genderRaw : 'mens';
```

Inkluder `gender` i tee-objektet som inserts til `tee_boxes`.

**Step 4: Lese eksisterende `gender` i edit-page**

I `app/admin/courses/[id]/edit/page.tsx`, finn select-statementen som laster tee_boxes (rundt linje 80-100). Legg `gender` til select-listen. I `teeBoxes`-mappingen som bygger `CourseFormInitialData`, sett `gender: t.gender`.

**Step 5: Test manuelt — opprett bane med dame-tee**

Kjør `npm run dev`, gå til `/admin/courses/new`, opprett en bane med to tees (herre + dame), verifiser at de lagres med riktig `gender` ved å se i Supabase Dashboard → Table Editor → tee_boxes.

**Step 6: Commit (sammen med Task 3 — se under)**

Ikke commit ennå — slå sammen med diff-basert edit-flyt for én sammenhengende `feat`-commit.

---

### Task 3: Bane-edit — diff-basert tee-update

**Files:**
- Modify: `app/admin/courses/CourseForm.tsx` (skjult `id`-input pr. tee-rad)
- Modify: `app/admin/courses/[id]/edit/page.tsx` (carry `id` inn i `TeeBoxData`)
- Modify: `app/admin/courses/[id]/edit/actions.ts` (erstatt delete-all + insert-all med diff)

**Step 1: Utvid `TeeBoxData` med valgfri `id`**

I `app/admin/courses/CourseForm.tsx`, legg til:

```tsx
export type TeeBoxData = {
  id?: string;  // present for existing rows, absent for new
  name: string;
  // ... resten
};
```

Render som hidden input inni tee-kortet:

```tsx
{tee.id && (
  <input type="hidden" name={`tee_${index}_id`} value={tee.id} />
)}
```

**Step 2: Mapp `id` fra edit-page sin loader**

I `app/admin/courses/[id]/edit/page.tsx`, hvor `teeBoxes` mappes til `CourseFormInitialData`: legg `id: t.id` på hvert element.

**Step 3: Skriv ny diff-basert update i edit-action**

Erstatt blokken `app/admin/courses/[id]/edit/actions.ts:95-147` (guard + delete-tees + insert-tees) med:

```ts
// Diff-basert update: rader med id UPDATE, uten id INSERT, eksisterende rader
// som ikke lenger er i formen DELETE (hvis ingen FK-refs).

const formTees = teeBoxes.map((t, i) => ({
  ...t,
  id: String(formData.get(`tee_${i}_id`) ?? '') || null,
}));

const { data: existingTees, error: existingTeesError } = await supabase
  .from('tee_boxes')
  .select('id')
  .eq('course_id', courseId);
if (existingTeesError) redirect(`${editPath}?error=db_load`);

const existingIds = new Set((existingTees ?? []).map((t) => t.id));
const formIds = new Set(formTees.filter((t) => t.id).map((t) => t.id!));
const toDelete = [...existingIds].filter((id) => !formIds.has(id));

// Sjekk om noen sletninger blokkeres av game-refs (games eller game_players).
if (toDelete.length > 0) {
  const [{ data: gameRefs }, { data: gamePlayerRefs }] = await Promise.all([
    supabase.from('games').select('id').in('tee_box_id', toDelete).limit(1),
    supabase
      .from('game_players')
      .select('game_id')
      .in('tee_box_id', toDelete)
      .limit(1),
  ]);
  if ((gameRefs?.length ?? 0) > 0 || (gamePlayerRefs?.length ?? 0) > 0) {
    redirect(`${editPath}?error=tee_in_use`);
  }
}

// Course-navn-update (samme som før)
const { error: courseUpdateError } = await supabase
  .from('courses')
  .update({ name })
  .eq('id', courseId);
if (courseUpdateError) redirect(`${editPath}?error=db_course`);

// Hole-replacement er fortsatt delete-and-insert (ingen FK fra games til
// course_holes — scores bruker hole_number-int, ikke FK).
const { error: deleteHolesError } = await supabase
  .from('course_holes')
  .delete()
  .eq('course_id', courseId);
if (deleteHolesError) redirect(`${editPath}?error=db_holes`);

const holesToInsert = holes.map((h) => ({ ...h, course_id: courseId }));
const { error: insertHolesError } = await supabase
  .from('course_holes')
  .insert(holesToInsert);
if (insertHolesError) redirect(`${editPath}?error=db_holes`);

// Tees: UPDATE eksisterende, INSERT nye, DELETE fjernede.
for (const tee of formTees) {
  const row = {
    course_id: courseId,
    name: tee.name,
    slope: Number(tee.slope),
    course_rating: Number(tee.course_rating),
    par_total: Number(tee.par_total),
    length_meters: tee.length_meters
      ? Number(tee.length_meters)
      : null,
    gender: (tee as TeeBoxData & { gender: string }).gender as
      | 'mens'
      | 'ladies'
      | 'juniors',
  };
  if (tee.id) {
    const { error } = await supabase
      .from('tee_boxes')
      .update(row)
      .eq('id', tee.id);
    if (error) redirect(`${editPath}?error=db_tees`);
  } else {
    const { error } = await supabase.from('tee_boxes').insert(row);
    if (error) redirect(`${editPath}?error=db_tees`);
  }
}

if (toDelete.length > 0) {
  const { error } = await supabase
    .from('tee_boxes')
    .delete()
    .in('id', toDelete);
  if (error) redirect(`${editPath}?error=db_tees`);
}
```

**Step 4: Sjekk at error-tekst `tee_in_use` rendres i edit-page**

Søk i `app/admin/courses/[id]/edit/page.tsx` etter eksisterende error-mapping (typisk en switch på `searchParams.error`). Bekreft at `tee_in_use` har en lesbar tekst (eks. «Kan ikke fjerne tee — den brukes i ett eller flere spill.»). Hvis ikke, legg den til.

**Step 5: Test manuelt — edit-flyt med ferdigspilt spill**

1. I prod-DB (eller lokal): finn en bane med minst ett ferdigspilt spill.
2. Naviger til `/admin/courses/{id}/edit`.
3. Endre slope på en eksisterende tee → submit.
4. Forventet: success-redirect (ingen `tee_in_use`-feil), endringen er lagret.

**Step 6: Test manuelt — sletting blokkeres for brukt tee**

1. På samme bane: fjern tee-en som er referert.
2. Forventet: redirect tilbake til edit med `error=tee_in_use`.

**Step 7: Bump version + CHANGELOG**

Kjør:
```bash
npm version patch --no-git-tag-version
```

Forventet: `package.json` går fra 1.1.10 → 1.1.11.

Rediger `CHANGELOG.md`, legg til ny entry på toppen under «### [1.1.11] - 2026-05-16»:

```markdown
### [1.1.11] - 2026-05-16

**Du kan nå tagge tee-bokser med kjønn (herre/dame/junior) i bane-admin, og redigere baner selv om det er ferdigspilte spill på dem.**

<details>
<summary>Teknisk</summary>

#### Added
- `tee_box_gender` enum (`mens`/`ladies`/`juniors`) i Postgres
- `tee_boxes.gender` (NOT NULL, default `'mens'`) — backfill av eksisterende rader via default
- «For hvem»-segmented control pr. tee-rad i bane-formen (`CourseForm.tsx`)

#### Changed
- Bane-edit (`courses/[id]/edit/actions.ts`) bruker nå diff-basert tee-update i stedet for delete-all + reinsert-all. Editering av slope/CR/navn/gender er tillatt uansett om tees er referert av spill — bare sletting blokkeres hvis tee-en er i bruk.

#### Migrations
- `0028_tee_box_gender.sql`

</details>
```

**Step 8: Commit**

```bash
git add app/admin/courses/CourseForm.tsx \
        app/admin/courses/new/actions.ts \
        app/admin/courses/[id]/edit/page.tsx \
        app/admin/courses/[id]/edit/actions.ts \
        package.json package-lock.json CHANGELOG.md
git commit -m "feat(admin/courses): kjønn-tag på tee-bokser + diff-basert edit-flyt

Lar admin tagge hver tee-rad med 'For hvem' (herrer/damer/junior) og
redigere baner som har ferdigspilte spill. Sletting av tees er fortsatt
blokkert hvis de er referert av spill.

Refs #48"
```

---

### Task 4: Game-form — dame-tee-dropdown + M/D-toggle pr. spiller

**Files:**
- Modify: `app/admin/games/new/GameForm.tsx` (UI: ny `tee_box_id_ladies`-dropdown + M/D-toggle pr. spiller)
- Modify: `app/admin/games/new/page.tsx` (load tees inkl. `gender`)
- Modify: `app/admin/games/new/actions.ts` (resolve `tee_box_id` pr. spiller fra M/D)
- Modify: `app/admin/games/[id]/edit/page.tsx` (load dame-tee + per-player tee + rekonstruér M/D)
- Modify: `app/admin/games/[id]/edit/actions.ts` (mirror new/actions.ts-endringer)
- Modify: `lib/games/gamePayload.ts` + `gamePayload.test.ts` hvis tee-id ligger der

**Step 1: Lese tees med gender i game-formens loader**

I `app/admin/games/new/page.tsx:62`, utvid select:

```ts
.select('id, name, tee_boxes(id, name, gender)')
```

Mapp gjennom til `CourseOption.tee_boxes`-typen — utvid typen i `GameForm.tsx`:

```tsx
export type CourseOption = {
  id: string;
  name: string;
  tee_boxes: { id: string; name: string; gender: 'mens' | 'ladies' | 'juniors' }[];
};
```

**Step 2: Rendre to tee-dropdowns**

I `app/admin/games/new/GameForm.tsx`, erstatt dagens enkle tee-dropdown (linje 535-560) med to dropdowns:

```tsx
{/* Tee for herrer — viser tees med gender ∈ {mens, juniors} eller "ukjent" */}
<div>
  <label htmlFor="tee_box_id" className="block text-sm font-medium text-text mb-1.5">
    Tee for herrer
  </label>
  <select
    id="tee_box_id"
    name="tee_box_id"
    value={teeBoxId}
    onChange={(e) => setTeeBoxId(e.target.value)}
    disabled={!selectedCourse}
    required
    className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
  >
    <option value="">{selectedCourse ? 'Velg tee-boks…' : 'Velg bane først'}</option>
    {availableTees
      .filter((t) => t.gender !== 'ladies')
      .map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({genderLabel(t.gender)})
        </option>
      ))}
  </select>
</div>

{/* Tee for damer — valgfri; tom betyr "alle bruker herre-teen" */}
<div>
  <label htmlFor="tee_box_id_ladies" className="block text-sm font-medium text-text mb-1.5">
    Tee for damer <span className="text-muted text-xs font-normal">(valgfri)</span>
  </label>
  <select
    id="tee_box_id_ladies"
    name="tee_box_id_ladies"
    value={teeBoxIdLadies}
    onChange={(e) => setTeeBoxIdLadies(e.target.value)}
    disabled={!selectedCourse}
    className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
  >
    <option value="">— ingen separat dame-tee —</option>
    {availableTees
      .filter((t) => t.gender === 'ladies')
      .map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} (dame)
        </option>
      ))}
  </select>
</div>
```

Med en helper øverst i fila:

```tsx
function genderLabel(g: 'mens' | 'ladies' | 'juniors'): string {
  return g === 'mens' ? 'herre' : g === 'ladies' ? 'dame' : 'junior';
}
```

Legg til state `const [teeBoxIdLadies, setTeeBoxIdLadies] = useState<string>(initialValues?.tee_box_id_ladies ?? '')`.

I `InitialValues`-typen, legg til:

```tsx
tee_box_id_ladies?: string;
```

Course-change-handleren må også nullstille begge:

```tsx
onChange={(e) => {
  setCourseId(e.target.value);
  setTeeBoxId('');
  setTeeBoxIdLadies('');  // nullstill dame-tee også
  setPlayerGenders({});   // M/D-toggle nullstilles til M
}}
```

**Step 3: M/D-toggle pr. spiller (skjult hvis ingen dame-tee)**

I `GameForm.tsx`, finn spiller-listen (rundt `playerAssignments.map`). For hver spiller-rad, legg til en M/D-knapp som synlig kun når `teeBoxIdLadies !== ''`:

```tsx
{teeBoxIdLadies && (
  <div className="flex gap-1" role="group" aria-label="Tee for spiller">
    {(['M', 'D'] as const).map((g) => (
      <button
        key={g}
        type="button"
        onClick={() =>
          setPlayerGenders((prev) => ({ ...prev, [player.id]: g }))
        }
        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
          (playerGenders[player.id] ?? 'M') === g
            ? g === 'M'
              ? 'bg-primary text-white'
              : 'bg-accent text-text'
            : 'bg-surface border border-border text-muted hover:text-text'
        }`}
      >
        {g}
      </button>
    ))}
    <input
      type="hidden"
      name={`player_${player.id}_gender`}
      value={playerGenders[player.id] ?? 'M'}
    />
  </div>
)}
```

Legg til state:

```tsx
const [playerGenders, setPlayerGenders] = useState<Record<string, 'M' | 'D'>>(
  initialValues?.player_genders ?? {},
);
```

I `InitialValues`-typen, legg til:

```tsx
player_genders?: Record<string, 'M' | 'D'>;
```

**Step 4: Resolve `tee_box_id` pr. spiller i create-action**

I `app/admin/games/new/actions.ts`, finn der `game_players` rows insertes (sannsynligvis via `gamePayload.ts` eller direkte i actionen). For hver spiller, hent gender fra formData:

```ts
const teeBoxIdLadies = String(formData.get('tee_box_id_ladies') ?? '') || null;

// Pr. spiller:
const playerGender = String(formData.get(`player_${userId}_gender`) ?? 'M');
const playerTeeBoxId =
  playerGender === 'D' && teeBoxIdLadies ? teeBoxIdLadies : null;
// NULL = bruk spillets default (= games.tee_box_id = herre-tee)
```

Inkluder `tee_box_id: playerTeeBoxId` i game_players-insertet.

**Validering:**
- Hvis `teeBoxIdLadies` er satt: verifiser at den tilhører samme course og har `gender = 'ladies'`.
- Hvis ingen spillere er D-merket: ignorér `teeBoxIdLadies` (tom NULL på alle game_players).

**Step 5: Last data + rekonstruér state i edit-page**

I `app/admin/games/[id]/edit/page.tsx`:

- Utvid game-loaderens `tee_boxes(...)`-select med `gender` (linje 202).
- Utvid select-listen som henter `games`-row med å inkludere noe som hjelper oss å vite dame-teen. Men dame-teen er IKKE lagret på `games`-raden — vi må derive den fra `game_players.tee_box_id` (de som er overstyrt).

Konkret:
```ts
// Last game_players inkl. tee_box_id
const { data: players } = await supabase
  .from('game_players')
  .select('user_id, team_number, flight_number, tee_box_id')
  .eq('game_id', gameId);

// Derive ladies-tee: første unike non-null tee_box_id på en spiller-rad er dame-teen
const ladiesTeeId =
  players?.find((p) => p.tee_box_id && p.tee_box_id !== game.tee_box_id)
    ?.tee_box_id ?? null;

// Bygg playerGenders-map: M for spillere uten override, D for spillere med ladies-tee
const playerGenders: Record<string, 'M' | 'D'> = {};
for (const p of players ?? []) {
  playerGenders[p.user_id] = p.tee_box_id === ladiesTeeId ? 'D' : 'M';
}

// Pass til form:
const initialValues: InitialValues = {
  // ... eksisterende felter
  tee_box_id_ladies: ladiesTeeId ?? undefined,
  player_genders: playerGenders,
  players: (players ?? []).map((p) => ({
    user_id: p.user_id,
    team_number: p.team_number,
    flight_number: p.flight_number,
  })),
};
```

**Step 6: Mirror endringene i edit-action**

Samme resolver-logikk i `app/admin/games/[id]/edit/actions.ts` som i `new/actions.ts`. Når en `game_players`-rad oppdateres, sett `tee_box_id` basert på gender + dame-tee.

**Step 7: gamePayload.ts oppdatering hvis nødvendig**

Sjekk `lib/games/gamePayload.ts` — hvis den bygger game_players-rader, må den ta dame-tee-id og player_genders som input og resolve pr. spiller. Oppdater `gamePayload.test.ts` deretter (TDD: skriv ny test først som verifiserer at en D-merket spiller får `tee_box_id` satt; kjør → fail; implementer → pass).

Hvis `gamePayload.ts` IKKE håndterer game_players (de kan inserts direkte i action), så er ingen endring her — bare i actions.

**Step 8: Test manuelt — opprett blandet spill**

1. `npm run dev`
2. Logg inn som admin
3. Opprett bane med både herre- og dame-tee (sjekk Task 2-flyten igjen at den fortsatt funker)
4. Opprett spill: velg banen, velg herre-tee, velg dame-tee
5. Legg til 2 spillere
6. Marker den ene som D
7. Publiser
8. Verifiser i Supabase Table Editor: `game_players` har korrekt `tee_box_id` (NULL for M, dame-tee-id for D)

**Step 9: Course handicap — utled pr. spillers tee**

Endre `app/admin/games/[id]/actions.ts:114-130` (`startScheduledGame` / publish-publishen). Erstatt enkel `tee!.slope`-bruk med pr. spiller:

```ts
// Last tees som spillerne kan bruke (game-tee + evt. dame-tee).
const teeIds = new Set<string>([game!.tee_box_id]);
for (const row of gamePlayers!) {
  if (row.tee_box_id) teeIds.add(row.tee_box_id);
}

const { data: tees, error: teesError } = await supabase
  .from('tee_boxes')
  .select('id, slope, course_rating, par_total')
  .in('id', [...teeIds]);
if (teesError || !tees) redirect(`${detailPath}?error=db_tees`);

const teeById = new Map(tees.map((t) => [t.id, t]));

// Freeze course handicap pr. spiller fra sin egen tee (fallback til spillets).
for (const row of gamePlayers!) {
  if (!row.users) continue;
  const playerTee = teeById.get(row.tee_box_id ?? game!.tee_box_id)!;
  const raw = calculateCourseHandicap({
    hcpIndex: Number(row.users.hcp_index),
    slope: playerTee.slope,
    courseRating: Number(playerTee.course_rating),
    par: playerTee.par_total,
  });
  const allowed = applyAllowance(raw, game!.hcp_allowance_pct);
  const { error: updateError } = await supabase
    .from('game_players')
    .update({ course_handicap: allowed })
    .eq('game_id', gameId)
    .eq('user_id', row.user_id);
  if (updateError) redirect(`${detailPath}?error=db_players`);
}
```

Husk å utvide game_players-select-statementen tidligere i samme action til å inkludere `tee_box_id` på row.

**Step 10: Unit-test for tee-resolusjon**

Create: `lib/games/__tests__/teeResolution.test.ts`

```ts
import { describe, it, expect } from 'vitest';

// Helper som skal bo i lib/games/teeResolution.ts (lag den i denne tasken).
import { resolvePlayerTeeId } from '../teeResolution';

describe('resolvePlayerTeeId', () => {
  it('returns null when gender is M (uses game default)', () => {
    expect(resolvePlayerTeeId('M', 'ladies-tee-id')).toBe(null);
  });

  it('returns ladies tee id when gender is D and ladies tee is set', () => {
    expect(resolvePlayerTeeId('D', 'ladies-tee-id')).toBe('ladies-tee-id');
  });

  it('returns null when gender is D but no ladies tee is configured', () => {
    expect(resolvePlayerTeeId('D', null)).toBe(null);
  });
});
```

Run: `npx vitest run lib/games/__tests__/teeResolution.test.ts`
Expected: FAIL (helper finnes ikke).

Create: `lib/games/teeResolution.ts`

```ts
export function resolvePlayerTeeId(
  gender: 'M' | 'D',
  ladiesTeeId: string | null,
): string | null {
  if (gender === 'D' && ladiesTeeId) return ladiesTeeId;
  return null;
}
```

Bruk den fra både `new/actions.ts` og `edit/actions.ts` for konsistens.

Run: `npx vitest run lib/games/__tests__/teeResolution.test.ts`
Expected: PASS.

**Step 11: Type-sjekk + full test-suite**

```bash
npx tsc --noEmit
npm test
```

Expected: 0 type-errors, alle tester grønne.

**Step 12: Bump version + CHANGELOG**

```bash
npm version patch --no-git-tag-version
```

→ 1.1.12.

CHANGELOG:

```markdown
### [1.1.12] - 2026-05-16

**Du kan nå arrangere spill der herrer og damer spiller fra ulike tees i samme runde — alle får riktig course handicap.**

<details>
<summary>Teknisk</summary>

#### Added
- `game_players.tee_box_id` (nullable) som overstyrer spillets default-tee per spiller
- «Tee for damer»-dropdown i `GameForm` (valgfri; tom = ingen separat dame-tee)
- M/D-toggle pr. spiller i game-formen — synlig kun når dame-tee er valgt
- `lib/games/teeResolution.ts` med `resolvePlayerTeeId(gender, ladiesTeeId)` helper + 3 unit-tester

#### Changed
- Course handicap freezes ved publish bruker nå spillerens egen tee (`tee_box_id ?? game.tee_box_id`)
- Edit-flyten rekonstruerer M/D-state fra `game_players.tee_box_id` — appen husker forrige valg

</details>
```

**Step 13: Commit**

```bash
git add app/admin/games/ \
        lib/games/teeResolution.ts \
        lib/games/__tests__/teeResolution.test.ts \
        package.json package-lock.json CHANGELOG.md
git commit -m "feat(admin/games): dame-tee + M/D-toggle + course handicap pr. spiller

Refs #48"
```

---

### Task 5: Vis tee på scorekort + begge tees på game-detalj

**Files:**
- Modify: `lib/games/getGameWithPlayers.ts` (join tee_boxes pr. game_player)
- Modify: `app/games/[id]/scorecard/page.tsx` (vis spillerens tee)
- Modify: `app/admin/games/[id]/page.tsx` (vis begge tees når dame-tee er satt)

**Step 1: Utvid `getGameWithPlayers` med tee-info pr. spiller**

I `lib/games/getGameWithPlayers.ts:78-90`, utvid `PlayerForHole`:

```ts
export type PlayerForHole = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  tee_box_id: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  users: { name: string | null; nickname: string | null } | null;
  tee_box: {
    name: string;
    slope: number;
    course_rating: number;
    par_total: number;
    gender: 'mens' | 'ladies' | 'juniors';
  } | null;
};
```

Oppdater select-statementen i `fetchGameWithPlayers` (linje 109-115):

```ts
.select(
  'user_id, team_number, flight_number, course_handicap, tee_box_id, ' +
  'submitted_at, approved_at, rejection_reason, ' +
  'users!game_players_user_id_fkey(name, nickname), ' +
  'tee_box:tee_boxes!game_players_tee_box_id_fkey(name, slope, course_rating, par_total, gender)',
)
```

Verifiser at FK-navnet matcher faktisk schema-navn — Supabase kan trenge eksplisitt alias hvis det er ambiguity. Kjør spørringen lokalt mot db for å bekrefte.

NB: For spillere uten override (tee_box_id = NULL), vil `tee_box` være `null`. Konsumenten faller tilbake til spillets default-tee — det betyr at vi også må joine spillets default-tee på selve game-objektet.

Utvid `GameForHole` med:
```ts
tee_box: { name: string; slope: number; course_rating: number; par_total: number; gender: 'mens' | 'ladies' | 'juniors' };
```

Utvid select i game-querien:
```ts
.select(
  'id, name, status, course_id, tee_box_id, score_visibility, ' +
  'require_peer_approval, scheduled_tee_off_at, side_tournament_enabled, ' +
  'side_ld_count, side_ctp_count, ' +
  'tee_box:tee_boxes!games_tee_box_id_fkey(name, slope, course_rating, par_total, gender)',
)
```

**Step 2: Vis spillerens tee øverst på scorekortet**

I `app/games/[id]/scorecard/page.tsx`, etter `const me = players.find(...)` (linje 60), legg til:

```tsx
const playerTee = me.tee_box ?? game.tee_box;
```

I JSX, før `<Suspense>` (rundt linje 72):

```tsx
<Card className="px-4 py-3">
  <div className="text-xs text-muted">
    Du spiller fra
  </div>
  <div className="font-serif text-base text-text">
    {playerTee.name}
    <span className="ml-1.5 text-muted text-sm">
      ({genderLabelShort(playerTee.gender)})
    </span>
  </div>
  <div className="text-xs text-muted tabular-nums">
    Slope {playerTee.slope} / CR {Number(playerTee.course_rating).toFixed(1)}
  </div>
</Card>
```

Med helper:
```ts
function genderLabelShort(g: 'mens' | 'ladies' | 'juniors'): string {
  return g === 'mens' ? 'herre' : g === 'ladies' ? 'dame' : 'junior';
}
```

**Step 3: Vis begge tees på admin/games/[id]**

I `app/admin/games/[id]/page.tsx`, finn blokken som rendrer tee-info (rundt linje 451-457):

```tsx
{game.tee_boxes && (
  <>
    <Row label="Tee for herrer" value={`${game.tee_boxes.name} (${genderLabelShort(game.tee_boxes.gender)})`} />
    <Row label="Par" value={`${game.tee_boxes.par_total}`} />
    <Row
      label="Rating"
      value={`${Number(game.tee_boxes.course_rating).toFixed(1)} / ${game.tee_boxes.slope}`}
    />
  </>
)}

{/* Hvis noen spillere har tee-override, vis også dame-teen */}
{game.ladies_tee && (
  <>
    <Row label="Tee for damer" value={`${game.ladies_tee.name} (dame)`} />
    <Row
      label="Rating (dame)"
      value={`${Number(game.ladies_tee.course_rating).toFixed(1)} / ${game.ladies_tee.slope}`}
    />
  </>
)}
```

Vi har ikke `game.ladies_tee` på `games`-tabellen direkte — derive den ved å se på `game_players.tee_box_id`. Enklere: legg til en separat query for å hente unike override-tees i page-loaderen:

```ts
const { data: overrideTees } = await supabase
  .from('game_players')
  .select('tee_box_id, tee_boxes!game_players_tee_box_id_fkey(name, slope, course_rating, par_total, gender)')
  .eq('game_id', gameId)
  .not('tee_box_id', 'is', null);

const ladiesTee = overrideTees?.[0]?.tee_boxes ?? null;
```

Pass `ladiesTee` til JSX-rendering.

**Step 4: Test manuelt — sjekk visning**

1. Åpne det blandede spillet fra Task 4
2. Naviger til `/admin/games/{id}` — verifiser at både herre- og dame-tee vises
3. Logg inn som en D-merket spiller, naviger til `/games/{id}/scorecard` — verifiser «Du spiller fra»-banner med riktig tee + slope/CR
4. Logg inn som en M-merket spiller — verifiser at banner viser herre-teen

**Step 5: Bump version + CHANGELOG**

```bash
npm version patch --no-git-tag-version
```

→ 1.1.13.

CHANGELOG:

```markdown
### [1.1.13] - 2026-05-16

**Spillere ser nå hvilken tee de spiller fra på scorekortet, og admin ser begge tees på spill-detalj-siden når et spill har separat dame-tee.**

<details>
<summary>Teknisk</summary>

#### Added
- «Du spiller fra»-banner øverst i `/games/[id]/scorecard` med tee-navn, kjønn-merkelapp og slope/CR
- Begge tees vises på `/admin/games/[id]` når dame-tee er konfigurert

#### Changed
- `getGameWithPlayers` joiner nå `tee_boxes` pr. game_player og på selve spillet, så scorekortet kan rendre riktig info uten ekstra round-trip

</details>
```

**Step 6: Commit**

```bash
git add lib/games/getGameWithPlayers.ts \
        app/games/[id]/scorecard/page.tsx \
        app/admin/games/[id]/page.tsx \
        package.json package-lock.json CHANGELOG.md
git commit -m "feat(games): vis spillerens tee på scorekort + begge tees på admin-detalj

Refs #48"
```

---

### Task 6: Verifiseringsfase — full ende-til-ende-test i prod

**Step 1: Push branchen + opprett PR**

```bash
git push origin claude/serene-gauss-21c1c7
gh pr create --base main \
  --title "feat: kjønn-tag på tee-bokser + mixed-gender spill" \
  --body "Closes #48

Lar admin tagge tee-bokser med kjønn (herre/dame/junior) og arrangere
spill der herrer og damer spiller fra ulike tees i samme runde — alle får
riktig course handicap.

Forhåndsvis design: docs/plans/2026-05-16-issue-48-tee-box-gender-design.md"
```

**Step 2: Sjekk Vercel preview-deploy**

Vent på Vercel preview-URL i PR. Åpne i Safari på iPhone.

**Step 3: Manuell E2E-flyt på preview**

1. **Bane-admin:** edit eksisterende bane → bekreft at edit-flyten funker (ingen «tee_in_use»-feil for ferdigspilte spill)
2. **Legg til ny tee:** opprett en dame-tee på testbanen
3. **Spill-opprett:** opprett nytt spill med både herre og dame
4. **M/D-toggle:** marker én spiller som D
5. **Publish:** sjekk at det funker uten error
6. **Detalj-side:** sjekk at begge tees vises
7. **Scorekort:** log inn som D-spiller, sjekk «Du spiller fra»-banner
8. **Avslutt spill:** sjekk at course handicap er ulik for M og D-spillere på leaderboard

**Step 4: Hvis alt OK — merge**

```bash
gh pr merge --rebase --delete-branch
```

**Step 5: Verifiser i prod**

Vent på Vercel prod-deploy (~1 min). Åpne `tornygolf.no/admin/courses/{id}/edit` og bekreft at gender-felt rendres. Bekreft footer-versjon på `tornygolf.no` viser v1.1.13.

**Step 6: Lukk issue med kommentar**

```bash
gh issue comment 48 --body "## Teknisk

- Migrasjon \`0028_tee_box_gender.sql\` — \`tee_box_gender\` enum + \`tee_boxes.gender\` (default 'mens') + \`game_players.tee_box_id\` (nullable override).
- Bane-edit flyt (\`app/admin/courses/[id]/edit/actions.ts\`) byttet fra delete-all + reinsert-all til diff-basert update. Sletting fortsatt blokkert hvis tee er referert av spill (games eller game_players).
- Game-form: dame-tee-dropdown (valgfri) + M/D-toggle pr. spiller (skjult hvis ingen dame-tee). Helper \`resolvePlayerTeeId\` i \`lib/games/teeResolution.ts\` med 3 unit-tester.
- Course handicap freezes nå pr. spillerens egen tee (\`game_players.tee_box_id ?? games.tee_box_id\`).
- \`getGameWithPlayers\` joiner tee-info på både game og pr. spiller. Scorekortet viser «Du spiller fra»-banner med slope/CR.
- Admin/games/[id] viser begge tees når dame-tee er satt.

Avvik fra design: ingen.

Oppfølger-issue #92 opprettet for \`users.gender\` + \`users.level\` (auto-default for M/D-toggle).

PR: <pr-url>
Commits: <commit-list>

## Funksjonell

Du kan nå tagge tee-bokser med kjønn (herre/dame/junior) i bane-admin. Når du har lagt inn både en herre-tee og en dame-tee på en bane, kan du arrangere spill der herrer og damer spiller fra ulike tees i samme runde — alle får utregnet riktig course handicap basert på sin egen tee.

I admin-flyten ser du nå et nytt «For hvem»-valg på hver tee-boks. I spill-oppsettet kan du velge både en herre-tee og en valgfri dame-tee. Hvis du velger en dame-tee, får hver spiller en liten M/D-knapp ved navnet sitt — sett D på damene i flighten, og appen ordner resten.

Spillerne ser øverst på scorekortet hvilken tee de spiller fra, så det er enkelt å bekrefte at admin har satt opp riktig.

Du kan også nå redigere baner selv om det er ferdigspilte spill på dem — den tidligere blokkeringen er fjernet. Sletting av tees er fortsatt blokkert hvis de er i bruk."
```

---

## Reviewer-handoff (etter Task 5, før Task 6)

Per CLAUDE.md → bruk subagent-driven-development med:

1. **spec-compliance-reviewer (Sonnet)** — verifiserer mot design-doc
2. **code-quality-reviewer (Opus)** — gjennomgår for clean code, edge cases, redundans

Funn som ikke fixes i samme PR → opprett GitHub Issues før merge.

---

## Suksesskriterier

- [ ] Migrasjonen kjørt og typer regenert
- [ ] Bane-admin viser «For hvem»-felt pr. tee-boks
- [ ] Bane-edit fungerer på baner med ferdigspilte spill
- [ ] Game-form har «Tee for damer»-dropdown (valgfri)
- [ ] M/D-toggle vises pr. spiller når dame-tee er valgt
- [ ] Course handicap kalkuleres pr. spillers egen tee ved publish
- [ ] Scorekort viser «Du spiller fra»-banner
- [ ] Admin/games/[id] viser begge tees når dame-tee er konfigurert
- [ ] Unit-test for `resolvePlayerTeeId` grønn
- [ ] Type-sjekk + full test-suite grønn
- [ ] PR merget + prod-deploy bekreftet på v1.1.13
- [ ] Issue lukket med Teknisk + Funksjonell-kommentar
