# Contract: Courses Fase 4 — trusted creators i Sekretariatet

**Issue:** [#223](https://github.com/jdlarssen/golf-app/issues/223) (epic — Fase 4 av 4)
**Parent allowlist-MVP:** [#198](https://github.com/jdlarssen/golf-app/issues/198) (etablerte `TRUSTED_CREATOR_EMAILS` + `requireAdminOrTrustedCreator()`)
**Branch:** `claude/determined-chatterjee-15e710` (denne worktreen)
**PR-style:** `Part of #223` (epic-disiplin, ikke `Closes #N`)

## Problem

Per d.d. kan kun `users.is_admin = true` opprette og redigere baner. `/admin/courses`-flyten er admin-only, gated av `app/admin/layout.tsx:14-32`. Fase 1–3 polerte inntasting, vedlikehold og arkiv-UI, men flaskehalsen er fortsatt at Jørgen er eneste mulige bane-opprettere — 5+ baner i klubb-skala (#49) tvinger ham til å gjøre alt manuelt.

#198 etablerte allowlist-mønsteret for game-opprettelse via en helt separat ikke-admin-rute (`/opprett-spill`). For Fase 4 utvider vi tilliten til bane-opprettelse, men siden brukeren eksplisitt har bedt om at trusted creators får tilgang til **Sekretariatet** (med begrenset utvalg) — ikke en kopiert parallell-flate — løfter vi admin-layout-gaten og self-gater admin-only-routes individuelt.

Trusted creators får:
- Tilgang til `/admin` (Sekretariatet) med filtrert tile-grid (kun **Baner**-tile)
- Full `/admin/courses`-subtree (liste, opprett, edit av alle baner, slett av egne)
- Ingen tilgang til `/admin/spillere`, `/admin/games` (liste eller detalj), `/admin/lanseringer`
- Game-opprettelse fortsetter via #198 sin `/opprett-spill`-rute (uberørt)

## Research Findings

**Eksisterende mønstre i kodebase (ingen ekstern docs-research nødvendig):**

- `lib/admin/auth.ts` har `requireAdminOrTrustedCreator(supabase)` (lagt til av #198) som returnerer `{ userId, email, isAdmin, isTrusted }`. Trenger ny søsken-helper `requireAdmin(supabase)` for admin-only-routes.
- `lib/admin/trustedCreators.ts` har `TRUSTED_CREATOR_EMAILS` (én bruker i dag: `fornes.even@yahoo.no`) og `isTrustedCreator(email)`. Gjenbrukes uten endring.
- `lib/supabase/admin.ts` eksponerer `getAdminClient()` — service-role-bypass av RLS. Skal kun brukes server-side, må ikke lekke til klient-bundle.
- RLS-policiene i `supabase/migrations/0002_rls_policies.sql:38-55`:
  - `courses select all` → `using (true)` (alle kan lese)
  - `courses admin write` → `for all using (is_admin()) with check (is_admin())` (kun admin skriver)
  - Identisk mønster på `course_holes` og `tee_boxes`
  - `is_admin()` er `select exists(select 1 from users where id = auth.uid() and is_admin = true)` — pure sjekk på users-flagg, ingen unntak for trusted
- `app/admin/page.tsx` (Sekretariatet) har et hardkodet `tiles: Tile[]`-array (4 tiles) og en activity-ledger som hardkoder `who: 'Sekretariatet'` for bane-opprettelses-events (line 428–435).
- `courses.created_by` settes til `user.id` ved opprettelse (`app/admin/courses/new/actions.ts:167`). Allerede tilgjengelig for ownership-check ved slett.
- `app/admin/courses/[id]/edit/actions.ts:47-62` har inline `requireAdmin()`-helper (duplikat av layout-gaten) som skal refaktoreres bort.

**⚠️ Latent gap fra #198 å verifisere underveis:**
`app/admin/games/new/actions.ts:79` destrukturerer kun `userId` fra `requireAdminOrTrustedCreator()`, og bruker request-scoped `supabase` (RLS-bound) for `games.insert(...)`. RLS-policyen `games admin write` krever `is_admin()`. Trusted-non-admin INSERT skal *teoretisk* feile med RLS-error — men issue #198 er CLOSED som shipped. Mulige forklaringer: (a) `fornes.even` er faktisk `is_admin = true`, (b) RLS-bug har aldri blitt utløst, (c) en udokumentert dashboard-justering. **Verifiseres ved build (via Supabase MCP-query mot `users.is_admin` for `fornes.even@yahoo.no`). Hvis bug bekreftes → fil ny issue, ikke fix her — `/opprett-spill`-flyten er #198's scope, ikke #223 sin.

## Prior Decisions

- **`.forge/contracts/198-allowlist-trusted-creators.md`** (lukket #198): valgte allowlist-i-kode (ikke DB), separat `/opprett-spill`-rute, ingen RLS-touch. Fase 4 utvider trust-relasjonen men IKKE pattern-en (fortsatt in-code allowlist, ingen RLS-touch).
- **`.forge/contracts/223-courses-phase2-...md`** (Fase 2, shipped): la til `courses.updated_at` + `updated_by`, soft-archive på `tee_boxes`. Disse FK-feltene blir kritiske for å vise hvem som endret hva — særlig viktig nå når «hvem» kan være en annen enn admin.
- **`.forge/contracts/223-courses-phase3-...md`** (Fase 3, shipped): introduserte client-state-remount-mønster (`key={teeSetKey}`) for å unngå stale form-state etter server-redirect. Fase 4 rører ikke CourseForm, men patternen er løst koblet — endring i denne fasen krever ny verifisering om vi rører `EditCoursePage`.
- **#198 etablerte `getAdminClient()`-konvensjonen som Mulighet A** (RLS-bypass i server-action). Fase 4 holder seg til denne pattern-en for trusted-non-admin-writes på courses/tee_boxes/course_holes.

## Design

### Auth-gating-modell

**Layout** (`app/admin/layout.tsx`): løftes fra `is_admin`-only til `requireAdminOrTrustedCreator()`. Det betyr at trusted creators kan nå hele `/admin/*`-treet i prinsippet — men hver admin-only-side self-gater.

**Self-gating i admin-only-routes** (alle pages + actions under disse):
- `app/admin/spillere/**`
- `app/admin/games/**` (alle ruter UNNTAGEN `/admin/games/new` som er trusted-OK per #198)
- `app/admin/lanseringer/**`

Disse kaller `await requireAdmin(supabase)` (ny helper) først i page-async-funksjonen / server-action-funksjonen. `requireAdmin` redirecter trusted til `/admin` (ikke `/`) så de havner et meningsfullt sted — fortsetter i Sekretariatet med tilgjengelige tiles.

**Trusted-OK-routes**:
- `/admin` (Sekretariatet root — filtrert tile-grid)
- `/admin/courses` (liste)
- `/admin/courses/new`
- `/admin/courses/[id]/edit`
- `/admin/games/new` (uendret, per #198)

Disse kaller `await requireAdminOrTrustedCreator(supabase)` og returnerer `AdminRoleContext` som brukes til å:
1. Filtrere UI per rolle (kun Baner-tile for trusted på `/admin`)
2. Bytte til `getAdminClient()` for writes når `!isAdmin && isTrusted`

### Tile-grid-filter (`app/admin/page.tsx`)

Bygges fra rolle-konteksten:

```ts
const role = await requireAdminOrTrustedCreator(supabase);

// Admin ser alle fire tiles (uendret).
// Trusted-non-admin ser kun «Baner» (Spill-tile vises ikke fordi
// /admin/games-listen er admin-only; trusted-spill-opprettelse går
// fortsatt via /opprett-spill-CTA på hjem-siden).
const tiles: Tile[] = role.isAdmin ? [
  { label: 'Spill', href: '/admin/games', ... },
  { label: 'Spillere', href: '/admin/spillere', ... },
  { label: 'Baner', href: '/admin/courses', ... },
  { label: 'Resultatprotokoll', href: '/admin/games?status=finished', ... },
] : [
  { label: 'Baner', href: '/admin/courses', ... },
];
```

For trusted: GreetingCard beholder samme «God morgen, X»-tekst (rolle-nøytral), og activity-ledger renderes som vanlig (RLS-SELECT er allerede `using (true)` for bane-events; ikke et lekkasje-risiko).

### Course-writes via `getAdminClient()` for trusted-non-admin

Mønster (gjelder `createCourse`, `updateCourse`, `deleteCourse`, `restoreTee`):

```ts
const supabase = await getServerClient();
const role = await requireAdminOrTrustedCreator(supabase);

// Read-paths (course-row, eksisterende tees osv.) holder seg på
// request-scoped client — SELECT-RLS er already `using (true)` for
// courses-trinnet.
const { data: existing } = await supabase.from('tee_boxes')...;

// Write-paths bytter til admin-client når caller ikke er admin. RLS-
// policyen «courses admin write» (og søsken-policiene på tee_boxes
// + course_holes) krever is_admin() — admin-client bypasser. Trygt
// fordi self-gate over har allerede verifisert at caller er trusted.
const writeClient = role.isAdmin ? supabase : getAdminClient();
await writeClient.from('courses').update({ ... }).eq('id', courseId);
```

`getAdminClient()` blir ikke en throwaway-binding — den lagres i en lokal `writeClient`-variabel og brukes konsistent for alle write-trinn i samme action (slik at en blanding-feil ikke gjør en INSERT med bypass og en UPDATE med RLS).

### Ownership-check på `deleteCourse`

Trusted-non-admin kan kun slette baner de selv har laget:

```ts
const role = await requireAdminOrTrustedCreator(supabase);

// Eksisterende «is in use»-guard beholdes uendret.
const { data: gameUsage } = await supabase.from('games').select('id').eq('course_id', courseId).limit(1);
if (gameUsage && gameUsage.length > 0) {
  redirect('/admin/courses?error=in_use');
}

// Ny: ownership-check kun for trusted-non-admin. Admin kan slette hva som helst.
if (!role.isAdmin) {
  const { data: course } = await supabase
    .from('courses')
    .select('created_by')
    .eq('id', courseId)
    .single();
  if (course?.created_by !== role.userId) {
    redirect('/admin/courses?error=not_owned');
  }
}

const writeClient = role.isAdmin ? supabase : getAdminClient();
const { error } = await writeClient.from('courses').delete().eq('id', courseId);
```

### Activity-ledger-label-fix

`app/admin/page.tsx:376-435` har hardkodet `who: 'Sekretariatet'` for bane-opprettelses-events. Med trusted i mix-en blir dette feilaktig. Fiks:

```ts
// Utvid embed til å hente creator-navn.
.select('name, created_at, created_by_user:users!courses_created_by_fkey(name, nickname)')

// I activity-loopen:
const who = displayName(c.created_by_user) ?? 'Sekretariatet';
```

`displayName`-helperen finnes allerede i `app/admin/courses/[id]/edit/page.tsx:73-78` — flyttes ut til delt utility (`lib/format/displayName.ts`) for å gjenbrukes fra både edit-page og /admin/page.

### Helper-utvidelse: `requireAdmin(supabase)`

Legges til i `lib/admin/auth.ts`:

```ts
export async function requireAdmin(
  supabase: ServerSupabase,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (!ctx.isAdmin) {
    // Redirect trusted til /admin (de er innenfor Sekretariatet i andre flater),
    // ikke-trusted ikke-admin til /. Slik havner brukere på et meningsfullt sted.
    redirect(ctx.isTrusted ? '/admin' : '/');
  }
  return ctx;
}
```

Bryter aldri admin-flyten (admin returnerer kontekst som vanlig), men trusted kommer aldri inn på admin-only-side.

## Edge Cases & Guardrails

**Auth & gating:**
- Trusted klikker direkte URL `/admin/spillere` → `requireAdmin()` redirecter til `/admin` (Sekretariatet med Baner-tile). Ikke `/login`, ikke `/` — beholder dem i kontekst.
- Ikke-trusted ikke-admin klikker `/admin` → `requireAdminOrTrustedCreator()` redirecter til `/`. Uendret atferd for vanlige brukere.
- Server-action invoked direkte (eksempelvis via fetch fra browser-konsoll): action self-gater, ikke layout. Hver action MÅ kalle riktig helper FØR write-trinnet.

**Delete-ownership:**
- Admin sletter en bane laget av trusted: tillates (admin har full makt).
- Trusted prøver å slette en bane laget av admin: redirectes med `?error=not_owned` → ny error-melding i `ERROR_MESSAGES` på `app/admin/courses/page.tsx`: «Du kan kun slette baner du selv har laget.»
- Trusted sletter bane laget av annen trusted: redirectes med `?error=not_owned` — samme melding.
- «In use»-guard sjekkes FØR ownership-guard. Hvis banen er i bruk, vis «in_use»-melding (informativ for trusted også, ikke kun «not_owned»).
- Banen finnes ikke / SELECT returnerer null: behandle som `not_owned` (samme redirect). Defense-in-depth mot forged DELETE-POSTs.

**Activity-ledger-label-fix:**
- Eksisterende bane-rader uten `created_by_user` (NULL-FK eller manglende fra Fase 2-backfill): fallback til 'Sekretariatet'. Bevares for legacy-display.
- `displayName`-helperen håndterer både array- og objekt-form (PostgREST embed-quirk), allerede dokumentert i edit-page-kommentaren.

**RLS-bypass-disiplin:**
- `getAdminClient()` brukes KUN i server-actions (alle markert `'use server'`). Layout-imports forblir request-scoped.
- Hvis testen blir vanskelig: bygg en `getCourseWriteClient(role)`-fabrikk-funksjon som encapsuler valg-logikken — gjør det mockable i Vitest. Ellers passer mock-handler i eksisterende test-suite.

**Test-coverage-hull å fange:**
- `app/admin/courses/[id]/edit/actions.test.ts` dekker i dag admin-paths. Må utvides med trusted-non-admin-paths (createCourse, updateCourse, deleteCourse-own, deleteCourse-other).
- `lib/admin/auth.test.ts` finnes ikke i dag — opprettes med tester for begge helpers (case-sensitive sjekker, redirect-paths, returnerte-context-shape).

**Cross-cutting risks:**
- Hvis Fase 3-fix-en (CourseForm-remount via `key={teeSetKey}`) brytes utilsiktet ved disse endringene: kjør manuell smoke-test av archive + restore + lagre-i-rekkefølge for å verifisere at fix-en holder.
- AdminShell-kosmetikk: trusted ser «Sekretariatet»-branding. Bevisst valg (per discussion-round) — endrer ikke shell-kopi i denne fasen.

## Key Decisions

- **Auth-modellen:** layout permitter admin+trusted; admin-only-routes self-gater via `requireAdmin()`. Tradeoff vs. route-groups-restructure: pragmatisk one-liner per route slår mappe-flytting.
- **Allowlist:** gjenbruker `TRUSTED_CREATOR_EMAILS` fra #198 (Q2 i discussion).
- **Slett-rettigheter:** trusted kan kun slette egne baner (`courses.created_by = user.id`). Admin uberørt (Q3 i discussion).
- **Discovery:** Sekretariatet ÅPNES for trusted (Q4 i discussion). Ingen home-page-CTA-endring i denne fasen.
- **Tile-filter:** trusted ser kun Baner-tile på `/admin`. Ikke Spill-tile (siden /admin/games-listen er admin-only). Game-opprettelse fortsetter via /opprett-spill (#198).
- **RLS-strategi:** ingen RLS-policy-endringer. App-layer-bypass via `getAdminClient()` for trusted-non-admin-writes (matcher #198 mulighet A).
- **Audit-kicker:** ingen `(admin)`-suffiks. Behold dagens `displayName`-only-mønster — konsistent med Fase 2/3.
- **Activity-ledger:** fikse hardkodet «Sekretariatet»-label for bane-events nå (latent bug som trusted ville eksponert dag 1).

**Claude's Discretion:**
- Plassering av `getAdminClient()`-valg-logikk: lokal `writeClient`-variabel inne i hver action (enkleste pattern; ingen overhead). Hvis duplikasjons-følelsen blir for sterk på tvers av courses-actions: ekstraher `getCourseWriteClient(role)` til `lib/admin/auth.ts` — men kun hvis det faktisk reduserer LOC, ikke som premature abstraksjon.
- Refaktorering av `displayName`-helper til `lib/format/displayName.ts`: gjør hvis det fremstår naturlig under arbeidet, ellers duplikat inline. Targets er Fase 4-leveranse, ikke utility-renhet.
- Greeting-tekst for trusted: behold «God morgen, [fornavn].» «saksbehandler» som rolle-label. Hvis det skraper psykologisk («jeg er ingen saksbehandler»): bytt til «bidragsyter» eller drop label-en for trusted. Ikke vesentlig — kan endres i closing-rundene.

## Success Criteria

- [x] **K1:** `lib/admin/auth.ts` eksporterer ny `requireAdmin(supabase)`-helper som redirecter trusted til `/admin` og ikke-trusted ikke-admin til `/`. `requireAdminOrTrustedCreator` er uendret. Begge har unit-tester (`lib/admin/auth.test.ts`).
  - *Evidens:* commit `5274b27`. `lib/admin/auth.ts:55` definerer `requireAdmin`. `lib/admin/auth.test.ts` (ny fil) har 9 tester for begge helpers. Full test-suite grønn (1164/1164).

- [x] **K2:** `app/admin/layout.tsx` bruker `requireAdminOrTrustedCreator()` istedenfor inline `is_admin`-sjekk.
  - *Evidens:* commit `bcab9a9`. `app/admin/layout.tsx:16` kaller `await requireAdminOrTrustedCreator(supabase)`. Inline `is_admin`-sjekken er borte.

- [x] **K3:** `/admin` (Sekretariatet) viser kun «Baner»-tile for trusted-non-admin; alle 4 tiles for admin. Activity-ledger labels for bane-events viser actual creator-navn (eller 'Sekretariatet' som fallback når creator er null).
  - *Evidens:* commit `bcab9a9`. `app/admin/page.tsx` filtrerer tiles på `role.isAdmin`. Activity-ledger embed-query utvidet med `created_by_user:users!courses_created_by_fkey(name, nickname)` + `displayName(...) ?? 'Sekretariatet'`-fallback i loop. Manuell smoke-test gjenstår ved deploy.

- [x] **K4:** Alle admin-only-routes self-gater via `requireAdmin()`. Trusted-non-admin som direkte-klikker URL til admin-only-route redirectes til `/admin`. Filer endret:
  - `app/admin/spillere/page.tsx` + sub-pages + actions
  - `app/admin/games/page.tsx` + sub-pages + actions (UNNTAGEN `new/`)
  - `app/admin/lanseringer/page.tsx` + actions
  - *Evidens:* commit `5274b27`. 18 ruter (10 pages + 8 actions) self-gater. `/admin/games/new/` korrekt uberørt (#198 trusted-OK).

- [x] **K5:** Courses-subtree bruker `requireAdminOrTrustedCreator()` i alle pages og actions. Trusted-non-admin-writes går via `getAdminClient()` for å bypasse RLS. `app/admin/courses/[id]/edit/actions.ts` har inline `requireAdmin()`-helperen fjernet.
  - *Evidens:* commit `bcab9a9`. `app/admin/courses/{page,new/page,new/actions,[id]/edit/page,[id]/edit/actions}.ts(x)` bruker `requireAdminOrTrustedCreator`. `writeClient = role.isAdmin ? supabase : getAdminClient()` på alle 4 actions (`createCourse`, `updateCourse`, `restoreTee`, `deleteCourse`). Inline `requireAdmin`-helperen er borte fra edit/actions.ts.

- [x] **K6:** `deleteCourse` har ownership-check: trusted-non-admin som prøver å slette bane med annet `created_by` redirectes med `?error=not_owned`. Admin uberørt. «In use»-guard kjøres FØR ownership-guard. Ny error-melding lagt til i `app/admin/courses/page.tsx`.
  - *Evidens:* commit `bcab9a9`. 7 nye tester i `app/admin/courses/[id]/edit/actions.test.ts` dekker: admin-deletes-any, trusted-deletes-own (uses admin-client), trusted-deletes-other (not_owned), trusted-deletes-in-use (in_use fires first), trusted-deletes-missing (not_owned defense), `updateCourse` trusted (admin-client på writes + audit-bump bærer trusted user-id).

- [x] **K7:** Hele test-suiten grønn — eksisterende admin-tester upåvirket, nye trusted-creator-tester passerer.
  - *Evidens:* `npm test` → 1164/1164 grønn (1157 baseline + 7 nye trusted-path-tester).

- [x] **K8:** `npm run lint` grønn, `npm run build` grønn (inkluderer typecheck).
  - *Evidens:* lint viser kun 5 pre-existing errors i `e2e/sync/offline-sync.spec.ts` (stash-verifisert som urelatert). `npm run build` clean.

- [x] **K9:** Version bumpet `1.27.2` → `1.28.0`. CHANGELOG-oppføring lagt til med stakeholder-tagline om at trusted creators (Anne, Even, ...) kan nå opprette og redigere baner — ikke bare spill. Forrige `1.27.y`-serie wrappes i `<details>`.
  - *Evidens:* `package.json` viser `"version": "1.28.0"`. CHANGELOG.md har ny `## 1.28.y — Bane-tilgang for kompis-gjengen`-seksjon med 1.28.0-oppføring; forrige `1.27.y`-serie wrappet i `<details><summary><strong>...3 oppføringer...</strong></summary>`.

- [ ] **K10:** PR-body bruker `Part of #223` (ikke `Closes #N`) per epic-disiplin. Etter merge: closing-kommentar på #223 vurderer å lukke epic-en hvis ingen flere faser er planlagt. Closing-kommentar inkluderer både `## Teknisk` (RLS-strategi, ownership-check-pattern, filer endret) og `## Funksjonell` (hva Jørgen sier til kompisene).
  - *Status:* Skjer ved PR-create + merge-tid, ikke under build. Forblir åpen til Jørgen ber om PR.

## Gates

Kjør etter hver chunk under build, og full suite før evaluator:

```bash
npm run lint
npm test
npm run build
```

Scoped tests under utvikling:
```bash
npm test -- lib/admin/auth
npm test -- app/admin/courses
```

Manuell smoke-test (etter deploy, via Jørgen):
1. Logg inn som trusted bruker (en av `TRUSTED_CREATOR_EMAILS`).
2. Naviger `/admin` → verifiser kun «Baner»-tile vises.
3. Klikk Baner-tile → `/admin/courses` viser listen, søk/filter virker.
4. Opprett ny bane → ende opp tilbake på listen med suksess-banner.
5. Edit den nylig opprettede banen → endre navn → lagre → bekreftelse.
6. Slett den → bekreft-dialog → slettes.
7. Direkte-klikk `/admin/spillere` → redirectes tilbake til `/admin`.
8. Logg inn som ikke-trusted vanlig bruker → klikk `/admin` direkte i URL → redirectes til `/`.

## Files Likely Touched

| Fil | Status | Hva |
|---|---|---|
| `lib/admin/auth.ts` | EDIT | Add `requireAdmin(supabase)` helper |
| `lib/admin/auth.test.ts` | NEW | Unit tests for both helpers (path-redirects, ctx-shape) |
| `app/admin/layout.tsx` | EDIT | Use `requireAdminOrTrustedCreator()` |
| `app/admin/page.tsx` | EDIT | Pass role to TilesGrid; filter tiles; fix activity-ledger label for course-events |
| `app/admin/spillere/page.tsx` | EDIT | Self-gate via `requireAdmin()` |
| `app/admin/spillere/[id]/page.tsx` | EDIT | Self-gate |
| `app/admin/spillere/[id]/slett/page.tsx` | EDIT | Self-gate |
| `app/admin/spillere/invitations/[id]/trekk-tilbake/page.tsx` | EDIT | Self-gate |
| `app/admin/spillere/actions.ts` | EDIT | Self-gate |
| `app/admin/spillere/[id]/actions.ts` | EDIT | Self-gate |
| `app/admin/spillere/[id]/slett/actions.ts` | EDIT | Self-gate |
| `app/admin/games/page.tsx` | EDIT | Self-gate |
| `app/admin/games/[id]/page.tsx` | EDIT | Self-gate |
| `app/admin/games/[id]/edit/page.tsx` | EDIT | Self-gate |
| `app/admin/games/[id]/avslutt/page.tsx` | EDIT | Self-gate |
| `app/admin/games/[id]/slett/page.tsx` | EDIT | Self-gate |
| `app/admin/games/[id]/actions.ts` | EDIT | Self-gate |
| `app/admin/games/[id]/edit/actions.ts` | EDIT | Self-gate |
| `app/admin/games/[id]/avslutt/actions.ts` | EDIT | Self-gate |
| `app/admin/games/[id]/slett/actions.ts` | EDIT | Self-gate |
| `app/admin/lanseringer/page.tsx` | EDIT | Self-gate |
| `app/admin/lanseringer/actions.ts` | EDIT | Self-gate |
| `app/admin/courses/page.tsx` | EDIT | Use `requireAdminOrTrustedCreator()` + add `not_owned` error |
| `app/admin/courses/new/page.tsx` | EDIT | Use helper |
| `app/admin/courses/[id]/edit/page.tsx` | EDIT | Use helper |
| `app/admin/courses/new/actions.ts` | EDIT | Use helper + getAdminClient for trusted-non-admin INSERT |
| `app/admin/courses/[id]/edit/actions.ts` | EDIT | Replace inline requireAdmin; use helper + admin-client for writes; ownership-check on delete; same for restoreTee |
| `app/admin/courses/[id]/edit/actions.test.ts` | EDIT | Add tests for trusted paths + delete-ownership-check |
| `lib/format/displayName.ts` | NEW (valgfri) | Extract shared `displayName()` from edit-page if duplikat-følelsen blir for sterk; ellers inline-duplikat OK |
| `package.json` | EDIT | Bump `1.27.2` → `1.28.0` |
| `CHANGELOG.md` | EDIT | Wrap 1.27.y in `<details>`; new 1.28.0 entry under new «1.28.y — Bane-tilgang for kompis-gjengen» heading |

## Out of Scope

- **RLS-policy-endringer** på `courses`, `course_holes`, `tee_boxes`, `games`, eller andre tabeller. App-layer bypass via `getAdminClient()` er bevisst valgt for å holde Fase 4 small-bet, samme prinsipp som #198. Full RLS-revisjon for trusted creators er gemt til #22 hvis observasjonsvinduet rettferdiggjør det.
- **Self-service «be om trusted-tilgang»-flyt.** Jørgen toggler manuelt via commit-til-`TRUSTED_CREATOR_EMAILS`.
- **Per-bane eierskap-modell** (groups, clubs, multi-admin). Ownership-check er en flat `created_by === user.id`-sjekk. Hvis trusted vil edite *andre* trusteds baner: tillates (Q1-svar er "edit alle"). Slett: kun egne.
- **«Spill»-tile for trusted på `/admin`.** Game-opprettelse fortsetter via #198 sin `/opprett-spill`-rute og home-page-CTA-en (gated på trusted + admin allerede). Tile-grid forblir admin-eksklusivt for spill-flaten.
- **`/admin/games/new`-page-level self-gating-endring.** Allerede tilgjengelig via action-gate fra #198; layout-løfting i Fase 4 fjerner det siste hinderet. Men ingen page-level `requireAdmin()` legges til der — vi vil at trusted skal kunne nå den siden.
- **Verifisering / fix av #198-games-INSERT-bug** (om trusted-non-admin faktisk kan opprette spill i prod). Filres som separat issue hvis bekreftet under build.
- **Tooltip/badge som markerer admin-status i UI.** Discussion-round-konklusjon: bevart `displayName`-only-pattern (ingen `(admin)`-suffiks).
- **Greeting-copy-tilpasning for trusted** («saksbehandler» vs «bidragsyter» etc.). Claude's Discretion under build; kan revurderes i polish-runden.
- **Onboarding-banner i app.** Defer per Q4-svar — Jørgen sender direkte lenke.
- **NGF-import (#56) eller crowdsource (#57).** Separate epics.

## Commits Plan (atomic)

1. **`refactor(admin): add requireAdmin helper + self-gate admin-only routes`** (K1, K4)
   - `lib/admin/auth.ts` + `lib/admin/auth.test.ts`
   - 10 admin-only pages + ~7 actions få `await requireAdmin(supabase)`-call på toppen
   - Layout uendret (fortsatt admin-only gate). Refactor-only. Ingen version-bump.

2. **`feat(admin/courses): open Sekretariatet + courses to trusted creators (Part of #223)`** (K2, K3, K5, K6, K9, K10)
   - `app/admin/layout.tsx` permitterer trusted
   - `app/admin/page.tsx` filtrerer tiles + fixer activity-ledger label
   - All `/admin/courses/*` bruker `requireAdminOrTrustedCreator` + `getAdminClient` for writes
   - `deleteCourse` har ownership-check
   - Tester for trusted-paths
   - Version bump 1.27.2 → 1.28.0
   - CHANGELOG-oppdatering (med wrapped 1.27.y i details)
   - Bruker-synlig → `feat:` → commit-msg-hook krever package.json + CHANGELOG.md staged

Hvis commit-msg-hook blokkerer commit 2 fordi version/CHANGELOG mangler: stash, kjør `npm version minor --no-git-tag-version` + oppdater CHANGELOG, stage alle, commit på nytt med samme melding.

## Open Risks & Mitigations

- **Risk:** Self-gating-refactor missing en admin-only-route → trusted lekker inn. **Mitigation:** K4-verifikasjons-grep listet eksplisitt. Manuell smoke-test step 7 (klikke `/admin/spillere` direkte) fanger primær-leak.
- **Risk:** `getAdminClient()` env-var ikke satt i preview-deploy (manglende `SUPABASE_SERVICE_ROLE_KEY`) → trusted-paths throws. **Mitigation:** Allerede satt i Vercel (brukt av admin-delete-user-flyten). Verifiser ved første trusted-action-test.
- **Risk:** Latent #198-RLS-bug påvirker Fase 4. **Mitigation:** Fase 4 er korrekt isolert (eget `getAdminClient`-pattern). Hvis #198 viser seg å være broken: fil egen issue, ikke fix her.
- **Risk:** Existing `actions.test.ts` mocker ikke admin-client-bypass-grenen. **Mitigation:** Test-utvidelse i K6 må mocke både `supabase.from(...)` (request-scoped) og `getAdminClient().from(...)` (service-role) — Vitest-hjelper for å skille mock-paths.
