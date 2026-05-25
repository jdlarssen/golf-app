# Spec: Archive-UI + URL-state + backfill (Fase 3 av #223)

**Issue:** [#223](https://github.com/jdlarssen/golf-app/issues/223) — Fase 3 av epic (Fase 1 + Fase 2 shipped i v1.25.0 / v1.26.0+1.26.1)
**Berører:** `/admin/courses/[id]/edit` (ny inline `ArchivedTeesSection` + `restoreTee`-action), `/admin/courses` (URL-persistens av sort/filter/søk i `CoursesLedgerClient`), ny `supabase/migrations/0038_courses_backfill_updated_by.sql`
**Bump:** MINOR — `1.26.x` → `1.27.0`

## Problem

Fase 2 introduserte soft-archive (en-veis) for tees som har spill-referanser, samt `updated_at`/`updated_by`-audit på `courses`. Tre opphengs-punkter står igjen:

1. **Ingen un-arkivér-UI.** Hvis admin arkiverer en tee ved feiltagelse eller endrer mening senere, må de SQL-resette `archived_at` manuelt — som er en barriere bruker uten kode-erfaring ikke kommer over. Soft-arkiv burde være en reversibel handling i selve admin-flaten.
2. **Filter/sort/søk-state lever bare i klient-komponentens minne.** Admin har klubb-skala-katalog (20+ baner) og kombinerer ofte søk + chips + sort for å finne riktig bane. Manuell reload eller deling av URL nullstiller alt. URL-state ville også gjøre F5 / browser-back idiomatisk forutsigbart.
3. **Eksisterende rader har `updated_by = NULL`** etter migration 0037 (backfill ble eksplisitt utsatt). Liste-siden og edit-flaten viser «Sist endret DATO» uten navn for rader som ble endret før admin la til en tee igjen — funksjonelt OK, men gir et tomrom som blir mer synlig jo flere baner som har vært igjennom edit-flyten siden 0037 ble applied.

Fase 2-kontrakten flagget alle tre som «defer». Fase 3 leverer dem i én PR.

## Research Findings

Ingen eksterne biblioteker. Funn fra kode-scouting:

- **`tee_boxes` har ingen `unique (course_id, name)`-constraint** ([0001](supabase/migrations/0001_initial_schema.sql), [0028](supabase/migrations/0028_tee_box_gender.sql), [0029](supabase/migrations/0029_tee_box_multi_rating.sql)). En restore som gir navne-kollisjon med en aktiv tee er ikke DB-blokkert. UX-håndteringen er: tillat begge, admin renamer manuelt om de vil.
- **`courses.created_by` er nullable** ([0001:31](supabase/migrations/0001_initial_schema.sql)). Backfill kan ikke anta NOT NULL — må skrives som `where updated_by is null and created_by is not null`. Rader med begge NULL forblir NULL.
- **`MAX_TEE_BOXES`-fellen fra v1.26.1** ([memory `use-client-exports-to-server`](../../memory/feedback_use_client_exports_to_server.md)): konstanter eksportert fra `'use client'`-moduler blir throw-funksjoner ved server-import. CourseForm.tsx eksporterer fortsatt fra `'use client'`-modulen, men `MAX_TEE_BOXES` lever nå i `constants.ts` (server-safe). Vi legger ingen nye konstanter på client→server-grensen.
- **`CoursesLedgerClient.tsx:99-103`** holder state i `useState`. URL-state-løsningen leser via `useSearchParams` + skriver via `router.replace` med ny URLSearchParams. `next/navigation` (Next.js 16) eksponerer disse uten Suspense-boundary-krav siden komponenten allerede er `'use client'`.
- **Edit-page er en server-component** ([page.tsx:175](app/admin/courses/[id]/edit/page.tsx)) som fetcher data og rendrer `CourseForm`. Vi legger inn en ny server-rendret `ArchivedTeesSection` under `CourseForm` — ingen client-state, ingen 'use client'-krysning. Restore-knappen er en form med `formAction={restoreTee}` (server-action), så hele runden er server-side.
- **`updateCourse` mønster for audit-bump**: oppdaterer `courses.updated_at` + `updated_by` ved hver mutasjon ([edit/actions.ts:199-206](app/admin/courses/[id]/edit/actions.ts)). `restoreTee` følger samme mønster — restore er en bane-endring og fortjener audit-bumpen.

## Prior Decisions

- **Fra Fase 2-kontrakten** ([223-courses-phase2-vedlikehold-og-filter.md](.forge/contracts/223-courses-phase2-vedlikehold-og-filter.md)): Soft-archive er en-veis i Fase 2. Un-arkivér-UI defer til Fase 3. URL-persistens og backfill listed under Out of Scope.
- **Fra Fase 2 closing-comment**: «Tees som aldri har vært i bruk slettes helt» — restore-pathen gjelder derfor kun arkiverte rader (de som ble soft-archived ved updateCourse). Hard-deleted tees finnes ikke å gjenopprette.
- **Fra brukerens diskusjon (2026-05-25)**: Inline-seksjon under aktive tees, separat `restoreTee`-server-action (umiddelbar), tillatt navne-konflikt med aktiv tee. Bundling: alle tre items (un-arkivér + URL-state + backfill) i én PR.
- **Fra [memory `closes-n-on-epics`](../../memory/feedback_closes_n_on_epics.md)**: PR-en bruker `Part of #223`, **ikke** `Closes #223`. Epic-en lukkes manuelt.
- **Fra [memory `use-client-exports-to-server`](../../memory/feedback_use_client_exports_to_server.md)**: Ingen nye konstanter eksportert fra `'use client'`-moduler til server-actions. Hvis vi trenger en delt konstant for restore-flyten, lever den i en server-safe modul.
- **Fra [memory `rebase-after-merge`](../../memory/feedback_rebase_after_merge.md)**: Lokal branch er allerede rebased på `origin/main` (verifisert ved start av Fase 3).
- **Fra Fase 2 v1.26.1-fix-lærdom**: Smoke-test save-flyten end-to-end (form-submission, ikke bare code-inspection) er eksplisitt success criterion i Fase 3. Forge-evaluatoren i Fase 2 fanget ikke en regresjon som først manifesterte ved POST. Fase 3 må evalueres mot faktisk form-submission via Playwright.

## Design

### 1. Un-arkivér-UI: `ArchivedTeesSection` + `restoreTee`-action

**Plassering:** Inline-seksjon i `app/admin/courses/[id]/edit/page.tsx`, rendert UNDER `CourseForm` (utenfor formen, så ingen interferens med form-state). Sticky struktur:

```
<h1>{courseName}</h1>
<p>Sist endret … av …</p>

<CourseForm ... />

{archivedTees.length > 0 && (
  <ArchivedTeesSection
    courseId={courseId}
    archivedTees={archivedTees}
  />
)}
```

`ArchivedTeesSection` er en server-component med en `<details>`-wrapper:

```tsx
<details className="mt-8 rounded-lg border border-border bg-surface p-4">
  <summary className="cursor-pointer font-serif text-lg">
    Arkiverte tees ({archivedTees.length})
  </summary>
  <p className="mt-3 text-sm text-text-muted">
    Disse tee-ene er fjernet fra aktiv visning, men beholdes for spill som
    bruker dem. Du kan gjenåpne en arkivert tee — den vil igjen vises i edit-formen
    og i nytt-spill-velgeren.
  </p>
  <ul className="mt-4 space-y-2">
    {archivedTees.map((tee) => (
      <li key={tee.id} className="flex items-center justify-between rounded border border-border-subtle bg-bg p-3">
        <div>
          <div className="font-medium">{tee.name}</div>
          <div className="text-xs text-text-muted">
            Arkivert {formatDate(tee.archived_at)}
            {tee.length_meters != null && ` • ${tee.length_meters} m`}
            {tee.has_active_name_conflict && (
              <span className="ml-2 inline-block rounded bg-warning-bg px-2 py-0.5 text-warning">
                Navne-kollisjon med aktiv tee
              </span>
            )}
          </div>
        </div>
        <form action={restoreTee.bind(null, courseId, tee.id)}>
          <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm text-bg">
            Gjenåpne
          </button>
        </form>
      </li>
    ))}
  </ul>
</details>
```

**Server-action `restoreTee` ([app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts))**:

```ts
export async function restoreTee(
  courseId: string,
  teeId: string,
  _formData?: FormData,
) {
  const { supabase, user } = await requireAdmin();
  const editPath = `/admin/courses/${courseId}/edit`;

  // Verifiser at tee-en tilhører riktig bane (avviser triks fra hånd-skrevet POST).
  const { data: tee, error: loadError } = await supabase
    .from('tee_boxes')
    .select('id, course_id, archived_at')
    .eq('id', teeId)
    .single();
  if (loadError || !tee) redirect(`${editPath}?error=tee_not_found`);
  if (tee.course_id !== courseId) redirect(`${editPath}?error=tee_not_found`);
  if (tee.archived_at === null) redirect(`${editPath}?error=tee_not_archived`);

  const { error: restoreError } = await supabase
    .from('tee_boxes')
    .update({ archived_at: null })
    .eq('id', teeId);
  if (restoreError) redirect(`${editPath}?error=db_tees`);

  // Restore er en bane-endring → bump audit-feltene på courses.
  const { error: courseUpdateError } = await supabase
    .from('courses')
    .update({
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('id', courseId);
  if (courseUpdateError) redirect(`${editPath}?error=db_course`);

  redirect(`${editPath}?status=restored`);
}
```

**Status-banner**: nytt `status=restored`-tilfelle i edit-page sin URL-parameter-håndtering rendrer «Tee gjenåpnet — den vises i listen igjen» som en grønn `Banner`. Bruker eksisterende banner-mønster fra `?status=updated`-tilfellet.

**Navne-kollisjons-flagg** (visual cue, ingen DB-blokk): `has_active_name_conflict` deriveres server-side i page.tsx (sammenligning mellom archived tees og active tees på samme bane). Vises som chip i rad-en, så admin vet at en restore vil gi to tees med samme navn (kan deretter rename manuelt via CourseForm).

### 2. URL-persistens av sort/filter/søk på `/admin/courses`

**`CoursesLedgerClient.tsx`** utvides med:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useTransition } from 'react';

export function CoursesLedgerClient({ items }: { items: CoursesLedgerItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Les fra URL — fallback til defaults.
  const query = searchParams.get('q') ?? '';
  const sortBy: SortBy = (searchParams.get('sort') as SortBy) ?? 'created_at';
  const filters: Filters = {
    ladiesTee: searchParams.get('ladies') === '1',
    juniorsTee: searchParams.get('juniors') === '1',
    activeGames: searchParams.get('active') === '1',
  };

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false });
    });
  }

  // Handlers oppdaterer URL i stedet for lokal state.
  // setQuery → updateParams({ q: value || null })
  // setSortBy → updateParams({ sort: value === 'created_at' ? null : value })
  // toggleFilter → updateParams({ ladies: filters.ladiesTee ? null : '1' }) etc.
}
```

**Encoding-konvensjon** (kompakt og lesbart):
- Søk: `?q=stik`
- Sort: `?sort=updated_at` eller `?sort=active_games` (default `created_at` utelates)
- Chips: `?ladies=1`, `?juniors=1`, `?active=1` (utelates når av)

Eksempel kombinert: `/admin/courses?q=stik&sort=updated_at&ladies=1`

**`router.replace`, ikke `push`** — å bake hvert tastetrykk inn i history-stacken er en ergonomi-katastrofe.

**`{ scroll: false }`** — å hoppe til toppen på hver filter-endring er ergonomi-katastrofe #2.

**`startTransition`** — keystrokes i søkefeltet blir lavprioritet, så UI-en holder seg responsiv.

**Søk-input debouncing:** ikke eksplisitt; `startTransition` + Next.js sin `router.replace` er tilstrekkelig flat for raske keystrokes. Hvis det viser seg å være jank i prod, kan vi legge til en 200ms `useDeferredValue` senere. Defer for nå.

**Initial-render-konsistens:** Server-component (`page.tsx`) leser ikke `searchParams` — den fetcher alle baner uansett. Klient gjør all filtrering. Dette betyr at hvis admin åpner `/admin/courses?q=stik`, vises hele listen for en kort blink før klienten kicker inn og filtrerer. Akseptert tradeoff — alternativet er å duplisere filter-logikken serverside, som er mer kompleksitet enn det er verdt.

### 3. Backfill av `updated_by` for eksisterende rader

**Migration `0038_courses_backfill_updated_by.sql`:**

```sql
-- Backfill av courses.updated_by for rader som ble migrert i 0037 uten
-- updated_by-verdi. Setter updated_by = created_by der det er trygt
-- (created_by NOT NULL); lar resten stå som NULL (ingen kilde-data).
--
-- Bakgrunn: 0037 satte updated_at = now() via default på add column, men lot
-- updated_by stå som NULL siden vi ikke ville anta at created_by = updated_by
-- på det tidspunktet. Etter en uke i prod er det klart at fallback til
-- created_by er korrekt: ingen andre brukere har redigert disse banene før
-- 0037 ble applied.

update public.courses
set updated_by = created_by
where updated_by is null
  and created_by is not null;

comment on column public.courses.updated_by is
  'Hvem (auth user id) endret raden sist. NULL kun for legacy-rader fra før '
  '0037 hvor created_by også var NULL. Backfilt fra created_by i 0038.';
```

Ingen DB-rader endrer mening ved backfill — rader hvor `updated_at` var nær `created_at` viser fortsatt «Lagt til DATO» (60-sek-buffer på liste-siden), bare med fyllt-ut `updated_by` som kun blir relevant hvis raden senere får en ekte update.

### 4. Visuelt design og copy

**Banner ved `status=restored`** (edit-page):
> «Tee gjenåpnet. Den vises i listen igjen og kan velges for nye spill.»

**Banner ved error-tilfeller**:
- `error=tee_not_found`: «Tee ikke funnet — kanskje den er allerede slettet?»
- `error=tee_not_archived`: «Tee er ikke arkivert.» (defensiv; bør aldri trigges fra UI)

**`<summary>` for `ArchivedTeesSection`**: «Arkiverte tees (N)» — ren count i parens, ingen ikoner.

**Per-rad-tekst**: «Arkivert DD.MM.YYYY • 5670 m» (lengde valgfri, kun hvis tilstede).

**Knappe-tekst**: «Gjenåpne» (én knapp per rad, ingen multi-select i Fase 3).

**Navne-kollisjons-chip**: «Navne-kollisjon med aktiv tee» (warning-fargene, ikke error-fargene — det er ikke en blokker).

## Edge Cases & Guardrails

- **Restore en tee uten å være admin**: `requireAdmin()` redirecter til `/login` eller `/`. Ingen state-endring.
- **Restore en tee som ikke tilhører banen**: Server-action validerer `tee.course_id === courseId`. Redirect med `error=tee_not_found`.
- **Restore en tee som ikke er arkivert** (race condition eller hånd-skrevet POST): redirect med `error=tee_not_archived`.
- **Restore en tee og deretter klikker «Lagre» i CourseForm**: CourseForm gjorde sin GET før restore. Etter restore vil neste page-load vise tee-en i form-en — men hvis admin gjør save uten å reloade først, blir den nyrestaurerte tee-en NOT i `formIds` (fordi den ikke var i edit-form-en), dermed havner den i `toDelete` og blir re-arkivert. **Mitigering**: `restoreTee` redirecter alltid til edit-page, så admin lander på en frisk reload. Akseptert flyt.
- **Concurrent restore på samme tee** (2 admin-faner): Andre kall får `archived_at` allerede satt til NULL, ingen DB-feil. Ekstra audit-bump på `courses` er harmløst (idempotent visuelt).
- **Restore-bumpen på courses oppdaterer audit-feltene**: ja, dette er en bane-endring (tee gjenåpnes for nye spill) og fortjener audit-bump. «Sist endret av»-visning vil flippe til den admin som restoret.
- **URL-state og hopp inn fra eksterne lenker**: `/admin/courses?q=stik&ladies=1` → klient leser params og initialiserer state. Bookmarks fungerer.
- **URL-state og browser-back-knapp**: `router.replace` betyr at hver state-endring overskriver, så back-knappen tar admin ut av siden (ikke gjennom filter-historikk). Tradeoff: enklere mental modell vs. tap av tilbake-til-forrige-filter. Vi velger enkelhet.
- **Backfill og scheduled games**: Backfill rører ikke `games` eller `tee_boxes` — bare `courses.updated_by`. Ingen risiko for live-spill.
- **Backfill kjørt to ganger**: Idempotent (`where updated_by is null` filtrerer ut rader som allerede er backfilt).
- **Bane uten arkiverte tees**: `ArchivedTeesSection` rendres ikke (conditional render basert på `archivedTees.length > 0`). Edit-page ser nøyaktig ut som før Fase 3.
- **URL-state-encoding ved ugyldig sort-verdi**: `sort=foo` → fallback til `created_at` (defensive cast med `?? 'created_at'` der sort-options sjekkes).
- **`useSearchParams` i Next.js 16 client-component**: trenger ikke Suspense-boundary fordi komponenten allerede er full-client. Hvis Next.js 16 endrer på dette i en patch-release, oppdager vi det i vitest + smoke-test.

## Key Decisions

- **Restore som separat server-action (ikke del av CourseForm-save)**: Form-saven er en stor batch-mutation. Bundling med restore ville kompliserte både UI-state (skille queued-restore fra ekte tee-add) og server-action (skille intent fra felt-endringer). Separat server-action holder hver flyt enkel — admin klikker Gjenåpne, side reloader, ferdig.
- **Inline `<details>` istedenfor egen side**: Arkiv-flyten er sjelden, men når den brukes vil admin allerede være i edit-flaten for å rydde i banen. Inline = ingen ekstra navigasjon. `<details>` er kollapset by default så normal-bruken (ingen arkiverte tees, eller ignorer dem) er uberørt.
- **Navne-konflikt tillatt uten blokk**: DB har ikke unique-constraint og legge til en nå ville bryte historiske data. Manuell navne-konflikt med visuelt chip-flagg er forutsigbart for admin og enkelt å rydde i (rename via CourseForm).
- **URL-replace, ikke push**: Filter-state er ikke en historikk-aktivitet — bruker forventer ikke å trykke tilbake gjennom filtrer-endringer.
- **`startTransition` istedenfor explicit debouncing**: Next.js 16 har god innebygget batching for `router.replace`. Hvis det viser seg å være jank, legger vi til debouncing — men ikke før vi vet det trengs.
- **Backfill via SQL-migration, ikke application-laget**: One-shot operasjon, mer eksplisitt audit-trail, idempotent (kan kjøres flere ganger uten skade).
- **Audit-bump på `courses` ved restore**: Ja — restore er en bane-endring som påvirker hvilke tees som er aktive. Behandle som en update.
- **Smoke-test som eksplisitt success criterion**: Fase 2 v1.26.1-fixen lærte oss at code-inspection + isolerte vitests ikke fanger Next.js 16-runtime-feiler. Fase 3 må ha en smoke-test som åpner edit-flaten, klikker Gjenåpne, og verifiserer redirect + nytt state.

**Claude's Discretion:**
- Eksakt CSS-styling på `ArchivedTeesSection` (spacing, dividers, badge-farge). Anbefales å gjenbruke eksisterende `Banner`/`Card` primitives så designet er konsistent.
- Visningen av navne-kollisjon — chip vs. tekstlig advarsel. Anbefales chip for visuell symmetri med StatusChip-mønsteret.
- URL-param-navn (`q` vs. `query`, `ladies` vs. `ladiesTee`). Korte navn anbefales for kompakt URL.
- Hvordan vi rendrer dato i archived-tee-rad. Anbefales `formatDate`-helper hvis den finnes; ellers `Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' })`.
- Empty-state hvis en bane bare har arkiverte tees (alle aktive ble fjernet). Dette kan ikke skje i normal flyt fordi `updateCourse` har `if (teeBoxes.length === 0) redirect(error=tee_required)`. Defensiv: rendre arkiverte under en banner som forklarer at banen står uten aktive tees.

## Success Criteria

- [ ] Migration `0038_courses_backfill_updated_by.sql` lagt til og applisert via Supabase MCP. Verifikasjon: `list_migrations` viser den, `execute_sql('select count(*) from courses where updated_by is null and created_by is not null')` returnerer 0.
- [ ] `restoreTee` server-action eksportert fra `app/admin/courses/[id]/edit/actions.ts`. Verifikasjon: TypeScript-import fra page.tsx kompilerer.
- [ ] Klikk «Gjenåpne» på en arkivert tee setter `tee_boxes.archived_at = NULL` og bumper `courses.updated_at`/`updated_by`. Verifikasjon: vitest-case for restoreTee med mocked supabase-client + SQL-verifisering at archived_at flippet til NULL post-restore.
- [ ] Den restaurerte tee-en vises i CourseForm + new-game-picker igjen. Verifikasjon: åpne edit-side for samme bane etter restore — tee-en er i listen. Åpne `/admin/games/new` på samme bane — tee-en kan velges.
- [ ] `ArchivedTeesSection` rendres ikke for baner uten arkiverte tees. Verifikasjon: åpne edit-side for en bane uten arkivert tee, ingen `<details>`-seksjon i DOM.
- [ ] Navne-kollisjons-chip vises når restore ville gi to tees med samme navn. Verifikasjon: arkiver tee «Gul», opprett ny aktiv tee «Gul», åpne edit-side — arkiv-rad-en viser chip.
- [ ] `/admin/courses?q=stik&sort=updated_at&ladies=1` initialiserer søk + sort + chips fra URL. Verifikasjon: vitest-case som mocker `useSearchParams` og rendrer komponenten, verifiserer at riktig sort er aktiv og chip er på.
- [ ] Endring av sort i dropdown oppdaterer URL via `router.replace`. Verifikasjon: vitest-case som spier på `router.replace`-kall etter sort-bytte.
- [ ] **Smoke-test (Playwright):** åpne edit-flate, klikk Gjenåpne, verifiser at side reloader til samme path med `?status=restored`, og at tee-en nå er i `CourseForm`-listen. Forhindre at en `'use client'`-felle som v1.26.1-bugen slipper gjennom.
- [ ] **Smoke-test (Playwright):** åpne `/admin/courses`, kombiner søk + chip + sort, verifiser at URL oppdateres uten side-reload.
- [ ] Eksisterende baner har `updated_by` satt til `created_by` etter migrasjon. Verifikasjon: `execute_sql` viser at backfilt rader har riktig user-id.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run app/admin/courses/` passerer (eksisterende + nye for ArchivedTeesSection, restoreTee, URL-state)
- [ ] `npx vitest run lib/games/` passerer (ingen regresjon i new-game-flyten)
- [ ] `npx vitest run` (hele suiten) — alle eksisterende tester grønne, ingen scoring-regresjon
- [ ] `npx eslint app/admin/courses/ supabase/migrations/` ingen errors
- [ ] Pre-commit-hook `.githooks/pre-commit` ingen humanizer-advarsler på nye norske strenger
- [ ] Migration applisert via Supabase MCP (`mcp__..._apply_migration`)
- [ ] **Playwright-smoke-test passerer**: full restore-flyten (klikk → redirect → tee i CourseForm) OG URL-state-syncing (filter-endring → URL oppdatert → reload viser samme filtrert state).
- [ ] Manuell røyk-test på Vercel preview-deploy: opprett bane, arkiver en tee (fjern + lagre på en tee i bruk), åpne edit-side igjen — se arkivert seksjon, klikk Gjenåpne — bekreft at tee er tilbake i form-listen og i new-game-picker. Test URL-bookmark av filtrert liste-side.

## Files Likely Touched

- `supabase/migrations/0038_courses_backfill_updated_by.sql` — ny one-shot backfill
- `app/admin/courses/[id]/edit/actions.ts` — ny `restoreTee` server-action
- `app/admin/courses/[id]/edit/page.tsx` — fetch archived tees, render `ArchivedTeesSection`, banner-handler for `?status=restored` / `?error=tee_not_found` etc.
- `app/admin/courses/[id]/edit/ArchivedTeesSection.tsx` — ny server-component med `<details>`-wrapper og restore-form per rad
- `app/admin/courses/[id]/edit/actions.test.ts` — nye vitest-cases for `restoreTee` (success, wrong course, not archived, not admin)
- `app/admin/courses/[id]/edit/ArchivedTeesSection.test.tsx` — render-tester (count, navne-kollisjon-chip, no-render-when-empty)
- `app/admin/courses/CoursesLedgerClient.tsx` — refaktor `useState` → `useSearchParams` + `router.replace` + `startTransition`. Behold pure-helpers (`applySortAndFilter`, `rowKicker`) — kun state-bridge endres.
- `app/admin/courses/CoursesLedgerClient.test.tsx` — nye tester for URL-init + URL-write etter sort/filter/søk-endring (mock `useSearchParams` + `useRouter`)
- `e2e/admin-courses-archive.spec.ts` (eller utvidet eksisterende Playwright-suite) — full end-to-end smoke-test for restore + URL-state
- `lib/database.types.ts` — ingen endring (backfill rører ikke schema)
- `package.json` + `CHANGELOG.md` — MINOR-bump (`1.26.x` → `1.27.0`) med stakeholder-tagline. Forrige `1.26.y`-serie wrappes i `<details>`.

## Out of Scope

- **Per-kjønn-overstyring av hull-par** — Fortsetter som egen Fase når det blir reelt smerte-punkt. Krever endring i 4 scoring-mode-impls.
- **Multi-select restore** — Bulk-restore (markere flere arkiverte tees med checkbox + restore alle på én gang). Sjeldent bruk; defer til hvis det blir reelt behov.
- **Hard-delete-knapp for arkiverte tees** — Å permanent slette en arkivert tee krever cascade-delete på `games.tee_box_id`-FK, som ville slettet historiske spill. Akseptert: arkiverte tees lever i DB for alltid (eller til en bane slettes via deleteCourse, som fortsatt blokkerer ved ANY game-referanse).
- **URL-persistens for CourseForm-state** — Hvilken tee-rating-blokk som er åpen, etc. Ikke verdt URL-støy.
- **Audit-felter på `tee_boxes` (når ble den arkivert + av hvem)** — Kun `courses` har audit i Fase 2/3. Hvis vi senere får behov for «hvem arkiverte denne tee-en?», legger vi til `tee_boxes.archived_by` i en egen fase.
- **Notifikasjon til spillere ved tee-restore** — Det er ren admin-handling, ingen spillere skal varsles.
- **Audit av URL-history på filter-state** — `router.replace` er bevisst valgt for å unngå.
- **Trusted bane-opprettere / auth-utvidelse** — Fase 4 av #223.

---

## Smoke-test-disiplin (fra Fase 2 v1.26.1-lærdom)

Forge-evaluatoren i Fase 2 verifiserte alle success criteria + gates via code-inspection og isolert vitest. Det fanget ikke en bug som først manifesterte ved end-to-end form-submission på Vercel (Next.js 16-`'use client'`-eksport-fellen).

For Fase 3 er **Playwright-smoke-test eksplisitt et success criterion**. Evaluatoren MÅ kjøre faktisk POST mot restore-flyten OG faktisk URL-update mot liste-siden — ikke bare lese koden. Hvis Playwright-MCP ikke er tilgjengelig i evaluator-konteksten, må evaluator nektes ACCEPT og flagge til bruker.

Spesifikt:

1. **Restore-flyten**: navigér til edit-side for en bane med arkivert tee → klikk Gjenåpne → verifiser redirect til `?status=restored` → verifiser at tee-en er i CourseForm-listen → verifiser at samme tee kan velges i `/admin/games/new`.
2. **URL-state**: navigér til `/admin/courses` → endre sort i dropdown → verifiser at URL fikk `?sort=...` → endre filter-chip → verifiser at URL fikk `?ladies=1` → kopier URL → naviger til den i ny fane → verifiser at sort + chip er aktiv.
3. **CourseForm-save (regresjon-test fra v1.26.1)**: redigér en eksisterende bane → klikk Lagre → verifiser redirect til `/admin/courses?status=updated`. Forhindrer at vi gjeninnfører `'use client'`-eksport-feilen.
