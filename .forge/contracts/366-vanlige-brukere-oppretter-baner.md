# Spec: Vanlige brukere kan opprette egne baner

**Issue:** [#366](https://github.com/jdlarssen/golf-app/issues/366)
**Milestone:** Tier 6 — Demokratisert opprettelse
**Branch:** `claude/inspiring-elbakyan-c94396` (denne worktreen)
**Henger sammen med:** #22 (alle lager spill — RLS-epic), #56 (NGF-import), #392 (Klubbhuset — universell nav-fane)

## Problem

Per d.d. kan kun `is_admin = true` (+ en hardkodet trusted-creator-allowlist, #198/#223) opprette baner. En vanlig bruker som mangler hjemmebanen sin i biblioteket har ingen vei inn — banen må legges til av admin. Eier-beslutning (flyt-4-gjennomgang 2026-05-31): en vanlig bruker skal kunne taste inn en egen bane (navn, 18 hull med par + stroke-index, tee-bokser med slope/CR) via det **eksisterende** `CourseForm` + `createCourse`-skjemaet. Sjelden brukt, men det skal være mulig — en escape-hatch som lar brukere bidra baner til det delte biblioteket.

## Prior Decisions (videreført fra tidligere kontrakter)

- **#198 (allowlist-MVP):** ikke-admin-opprettelse bor på en egen rute i `AppShell` (ikke admin-shellen) — game-creation fikk `/opprett-spill`. Vanlige brukere skal aldri inn i Sekretariatet. **Gjelder her:** bane-opprettelse for vanlige brukere bor på en ny `/opprett-bane`-rute i `AppShell`.
- **#223 Fase 4 (trusted i Sekretariatet):** trusted creators fikk `/admin/courses`-subtree + `getAdminClient()`-bypass for writes + `created_by`-ownership-sjekk på delete. **Avvik her:** #366 åpner CREATE for *alle* (ikke 1–2 trusted), så vi bytter create-stien fra service-role-bypass til en ekte RLS-policy. Edit/delete-stiene for trusted forblir uendret (fortsatt `getAdminClient()`-bypass — utenfor #366-scope).
- **#230 (RLS-gap-lærdom):** en test som mocker bort RLS gir falsk trygghet. **Gjelder her:** RLS-policyen MÅ verifiseres mot en faktisk `auth.uid()`-kontekst (SQL med satt JWT-claim), ikke bare via mockede action-tester.
- **Synlighet = delt bibliotek** (eier-beslutning denne runden): bruker-opprettede baner havner i samme bibliotek alle plukker fra. `courses` SELECT forblir `using(true)` — kritisk fordi medspillere må kunne lese banen for å score et spill på den.

## Design

### 1. RLS: ekte insert-own-policy (ikke service-role-bypass)

Ny migrasjon `supabase/migrations/0070_courses_user_create_rls.sql`:

- **INSERT-own** for innloggede brukere på `courses`, `course_holes`, `tee_boxes`. Permissive policies OR-es med eksisterende `*_admin write`-policy, så admin er uberørt:
  ```sql
  create policy "courses authenticated insert own"
    on public.courses for insert to authenticated
    with check (created_by = auth.uid());

  create policy "course_holes owner insert"
    on public.course_holes for insert to authenticated
    with check (exists (
      select 1 from public.courses c
      where c.id = course_holes.course_id and c.created_by = auth.uid()));

  -- tee_boxes: identisk mønster mot parent course
  ```
- **SELECT forblir `using(true)`** — ingen endring (scoring-paritet).
- **INGEN UPDATE/DELETE-own-policy** legges til (create-only — se §4). Edit/delete-RLS er bevisst utelatt; trusted-edit/delete kjører fortsatt via `getAdminClient()`.
- **`created_by` ON DELETE SET NULL:** dagens FK (`courses_created_by_fkey`) har ingen `on delete`-klausul → en bruker med opprettede baner kan ikke slette kontoen sin (FK blokkerer). Endre til `on delete set null` så banen overlever konto-sletting (delt bibliotek — andres spill refererer den). Samme for `updated_by` for symmetri. Verifiser eksakt constraint-navn før ALTER.

Migrasjonen er additiv/tillatende → trygg å `apply_migration` (Supabase MCP) før kode-deploy.

### 2. `createCourse`-action: åpne for alle innloggede

`app/admin/courses/new/actions.ts`:
- **Gate:** bytt `requireAdminOrTrustedCreator(supabase)` → `supabase.auth.getUser()`; `if (!user) redirect('/login')`. `created_by = user.id`.
- **Klient:** dropp `getAdminClient()`-greinen. Bruk request-scoped `supabase` for alle writes — RLS insert-own tillater både admin (via `is_admin()`-policy) og vanlige/trusted (via insert-own-policy). Én klient, ingen forgrening.
- **Parametriserte redirects** (så samme action tjener både admin-ruten og `/opprett-bane`): les `redirect_base` (default `/admin/courses/new`) for error-bounces og `success_redirect` (default `/admin/courses?status=created&name=…`) fra FormData. **Open-redirect-guard:** godta kun verdier som starter med `/` og ikke `//`; ellers fall til default.

### 3. Ny rute `/opprett-bane` (AppShell)

`app/opprett-bane/page.tsx` — speiler `/opprett-spill`-mønsteret men gated til *enhver innlogget bruker*:
- Gate: `getUser()` → redirect `/login` hvis ingen. Ingen admin/trusted-krav.
- `AppShell` + `TopBar backHref="/"`. Rendrer `<CourseForm action={createCourse} submitLabel="Lagre bane" redirectBase="/opprett-bane" successRedirect="/opprett-bane?status=created" />`.
- Håndterer tre banner-tilstander via `?error=` / `?status=created&name=`: feil (gjenbruk `ERROR_MESSAGES`-kartet fra `new/page.tsx`), suksess («Banen «X» er lagret» + CTA «Opprett en til» / «Til forsiden», og «Tilbake til spillet» hvis `?next=` finnes).
- `?next=`-param bevares gjennom error/success så bruker kan returnere til spill-velgeren. (Game-wizard-state går tapt ved navigasjon — akseptert MVP-kant, bane-opprettelse er sjelden.)

`CourseForm` (`app/admin/courses/CourseForm.tsx`): legg til valgfrie props `redirectBase?: string` + `successRedirect?: string`, rendret som skjulte inputs (`name="redirect_base"` / `name="success_redirect"`) kun når satt. Admin-ruten passerer dem ikke → defaults bevarer dagens admin-oppførsel.

### 4. Forvaltning: create-only

Vanlige brukere får **ingen** «mine baner»-liste/edit/delete-flate i #366 (eier-beslutning). Feil rettes av admin (som ser alle baner i Sekretariatet). Derfor ingen UPDATE/DELETE-RLS-policy og ingen ny ikke-admin-rute utover `/opprett-bane`.

### 5. Inngangspunkter

- **Midlertidig hjem-inngang** (`app/page.tsx`): en lavmælt sekundær «Opprett bane»-inngang synlig for *alle innloggede* brukere → `/opprett-bane`. Plassering/stil = Claude's discretion (understated, ikke konkurrer med «Opprett spill»-CTA-en). Dette er den eneste veien inn for vanlige brukere før #392 (de kan ikke lage spill ennå, #22).
- **Kontekst-lenke i spill-velgeren** (`app/admin/games/new/sections/BasicsSection.tsx`, etter `<select>` ~linje 111): «Finner du ikke banen? Opprett ny bane» → `/opprett-bane`. Tjener admin/trusted nå, alle post-#22.

### 6. #392-notat (eier-instruks)

Post en kommentar på #392 som spesifiserer nav-arbeidet som hører dit: når Klubbhuset bygges, flytt den frittstående «Opprett bane»-døren inn i Klubbhus-fanen (universell, rolle-gatede flater) og fjern/rekonsiler den midlertidige hjem-inngangen fra #366. Banen-opprettelse (`/opprett-bane`-ruten + RLS) er ferdig i #366; kun navigasjons-hjemmet flyttes.

## Edge Cases & Guardrails

- **Scoring-paritet:** SELECT må forbli `using(true)`. Hvis den noensinne strammes, brytes scoring for medspillere på bruker-opprettede baner. (Derfor er «kun for oppretteren»-synlighet forkastet.)
- **Konto-sletting:** verifiser `app/profile/slett-konto/`-flyten — ingen app-kode skal slette brukerens baner; `ON DELETE SET NULL` lar banen overleve med `created_by = null`.
- **Open redirect:** `redirect_base`/`success_redirect` er klient-kontrollert FormData → saniter (kun interne `/`-stier, ikke `//`).
- **Direkte action-POST:** `createCourse` self-gater på `getUser()` (ikke bare layout/page). Uinnlogget POST → `/login`.
- **Admin-stien uendret:** `/admin/courses/new` passerer ikke de nye props → defaults gjør at admin-redirects og -oppførsel er identisk. Verifiser via eksisterende admin-test.
- **Trusted create-sti:** trusted creator (`fornes.even@…`) oppretter nå via request-scoped klient + RLS insert-own (ikke lenger `getAdminClient()`). Funksjonelt identisk; oppdater testen som asserterer service-role.
- **Søppel/duplikater i delt bibliotek:** akseptert risiko i #366 (escape-hatch, sjelden brukt; #56 NGF-import fyller biblioteket ordentlig). Ingen moderering/rate-limit i scope.
- **par_total/SI-validering:** uendret — gjenbruker `createCourse`-validering (SI-permutasjon, par 3–6, tee-rating-komplett-sett).

## Key Decisions

- **RLS insert-own framfor service-role-bypass:** når CREATE åpnes for *alle*, er en ekte `with check (created_by = auth.uid())`-policy riktigere enn å rute alle writes gjennom service-role. Selvstendig, trygg skive av #22 sin RLS-jobb — venter ikke på epic-en.
- **Create-only:** ingen edit/delete-UI for vanlige brukere (eier-beslutning). Admin rydder.
- **Delt synlighet:** ny bane → felles bibliotek (gjenbruker `using(true)`; ingen picker-endring).
- **Inngang nå = midlertidig hjem-CTA + kontekst-lenke;** frittstående dør sitt permanente hjem er Klubbhuset (#392).
- **Asymmetri create vs edit/delete-klient** (RLS vs `getAdminClient()`): bevisst og notert; full edit/delete-RLS-migrering hører til #22/opprydding, ikke #366.

**Claude's Discretion:**
- Eksakt plassering/stil på hjem-inngangen i `app/page.tsx` (understated sekundær, alle innlogget).
- Om kontekst-lenken i `BasicsSection` tar `?next=` (trivielt → ta det; ellers dropp, state-tap gjør retur-til-wizard halvgod uansett).
- Suksess-side-CTA-tekster på `/opprett-bane`.
- Om `redirect_base`/`success_redirect`-sanitering bor inline i action eller liten helper.

## Success Criteria

- [x] **K1:** Migrasjon `0070_courses_user_create_rls.sql` finnes og er applisert. Insert-own-policies på `courses`/`course_holes`/`tee_boxes` eksisterer. SELECT-policyen forblir `using(true)`. `courses_created_by_fkey` + `courses_updated_by_fkey` er `ON DELETE SET NULL`.
  - *Evidens:* commit `c37c484`. `apply_migration` → `{success:true}`. `pg_policies`-spørring returnerte alle tre `* authenticated insert own`-policiene; `pg_constraint.confdeltype = 'n'` (SET NULL) for begge FK-ene. SELECT-policiene (`courses select all` osv.) urørt i migrasjonen.
- [x] **K2 (RLS verifisert mot ekte auth, ikke mock):** Via Supabase MCP i rollback-transaksjoner med `set local role authenticated` + `set local request.jwt.claims = '{"sub":"d7aa1db4-…"}'` (ekte ikke-admin: sondre.aa):
  - INSERT `courses` + `course_holes` + `tee_boxes` med egen `created_by` → **lykkes** (`positive-test-completed-no-rls-block`).
  - INSERT `courses` med annen `created_by` → **blokkert** (`42501: new row violates row-level security policy for table "courses"`).
  - INSERT `course_holes` mot en bane brukeren ikke eier → **blokkert** (`42501 … "course_holes"`). Adresserer #230-lærdommen (ingen mock-falsk-trygghet).
- [x] **K3:** `createCourse` gater på `getUser()` (uinnlogget → `/login`), bruker request-scoped `supabase` for alle tre inserts (ingen `getAdminClient`), setter `created_by = user.id`, og respekterer saniterte `redirect_base`/`success_redirect`.
  - *Evidens:* commit `762c291`. [`app/admin/courses/new/actions.ts`](app/admin/courses/new/actions.ts) — `getUser()`-gate, `safeInternalPath`/`appendQuery`-helpere, alle writes på `supabase`. 6/6 tester grønne (`actions.test.ts`): unauth→/login (ingen insert), regular-user-insert (`created_by` = bruker, rekkefølge courses→course_holes→tee_boxes), success/error-redirect honored, external + protocol-relative redirect_base avvist.
- [x] **K4:** `/opprett-bane` finnes, gated til enhver innlogget bruker, rendrer `AppShell` + `CourseForm`. Uinnlogget → `/login`. Viser error/suksess-bannere; bevarer `?next=`.
  - *Evidens:* commit `65dde08`. `npm run build` lister `ƒ /opprett-bane`. **Live (dev-server):** logget-ut GET `/opprett-bane` → fulgte redirect til `/login?next=%2Fopprett-bane` (200, redirected:true), ingen console-errors. *Caveat:* innlogget skjema-rendering kan ikke verifiseres lokalt (OTP-innlogging + ikke-deployet branch) — bygg-verifisert + gjenbruk av bevist `CourseForm`. Visuell prod-verifisering gjøres av eier ved deploy.
- [x] **K5:** `app/page.tsx` viser «Mangler en bane? Legg den til»-inngang for alle innloggede → `/opprett-bane`. `BasicsSection` har «Finner du ikke banen? Opprett ny bane»-lenke → `/opprett-bane`.
  - *Evidens:* commit `65dde08`. `courseCreateLink` (gated på `userId`, ikke `is_admin`) rendret i både empty-state og non-empty home. `BasicsSection.tsx` lenke under bane-`<select>`. Bygg-verifisert; auth-gated visning ikke synlig logget-ut (OTP-caveat som K4).
- [x] **K6:** Hele test-suiten grønn + lint + build.
  - *Evidens:* `npx vitest run` → **2640 passed (217 filer)**. `npx eslint` på alle endrede filer → 0 errors. `npm run build` → clean (typecheck inkludert, full rute-tabell).
- [x] **K7:** Version bumpet `1.73.1` → `1.74.0`. CHANGELOG-oppføring (humanizer-kjørt tagline) lagt til; forrige `1.73.y`-serie wrappet i `<details>`.
  - *Evidens:* commit `65dde08`. `package.json` = `1.74.0`. Ny `## 1.74.y — Baner alle kan legge til`-seksjon åpen; `1.73.y`-serien wrappet i `<details><summary>…(2 oppføringer)…</summary>`. Commit-msg-hook passerte (krever package.json+CHANGELOG for `feat`).
- [x] **K8:** Kommentar postet på #392 med nav-migrerings-spesifikasjonen.
  - *Evidens:* [#392 comment](https://github.com/jdlarssen/golf-app/issues/392#issuecomment-4624987092) — frittstående dør → Klubbhus-fanen, fjern midlertidig hjem-inngang, vurder «mine baner»-flate.

## Gates (kjøres etter hver chunk; scoped underveis, full suite før evaluator)

```bash
npm run lint
npm test            # scoped: npm test -- app/admin/courses app/opprett-bane underveis
npm run build
```

RLS-verifisering (K2) via Supabase MCP `execute_sql` i en rollback-transaksjon.
Frontend-kriterier (K4, K5) verifiseres med Playwright/preview-tools (frontend-filer rørt → obligatorisk).

## Files Likely Touched

- `supabase/migrations/0070_courses_user_create_rls.sql` — NY: insert-own-policies + FK SET NULL
- `app/admin/courses/new/actions.ts` — EDIT: gate→getUser, request-scoped klient, parametriserte+saniterte redirects, dropp getAdminClient
- `app/admin/courses/CourseForm.tsx` — EDIT: valgfrie `redirectBase`/`successRedirect`-props som skjulte inputs
- `app/opprett-bane/page.tsx` — NY: AppShell-rute, any-authenticated gate, error/success/next-bannere
- `app/page.tsx` — EDIT: midlertidig «Opprett bane»-inngang for alle innlogget
- `app/admin/games/new/sections/BasicsSection.tsx` — EDIT: «Finner du ikke banen?»-lenke
- `app/admin/courses/new/actions.test.ts` (+ ev. `[id]/edit/actions.test.ts`) — EDIT/NEW: oppdater trusted/admin-paths, legg til regular-user + unauth + sanitering-tester
- `package.json` + `CHANGELOG.md` — EDIT: 1.74.0 + oppføring

## Out of Scope

- Edit/delete-UI eller -RLS for vanlige brukere (create-only). Trusted-edit/delete uendret.
- Klubbhuset-omdøping/universell nav-fane (#392) — kun notat dit.
- «Kopier eksisterende bane»-forenklet flyt (issue sier full manuell denne omgangen).
- Moderering, rate-limiting, duplikat-deteksjon, kvalitetskontroll på delte baner.
- Notifikasjon/audit-log ved bane-opprettelse.
- NGF-import (#56), games-RLS-revisjon (#22).
- Retur-til-wizard med bevart game-form-state (state-tap akseptert; bane-opprettelse sjelden).
- E2E-test for selve skjema-mekanikken (dekket av eksisterende admin-flyt; ingen ny Playwright-spec utover evaluator-verifisering).
