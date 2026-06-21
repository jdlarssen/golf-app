# Spec: Atomisk oppretting — chaos-sweep + ekte transaksjon der opprydding ikke holder (#737)

## Problem

#675 la kompenserende sletting på de to verste ikke-atomiske stiene (cup-batch, liga-draft)
men utsatte eksplisitt to ting: (a) en bred sveip av *alle* fler-stegs opprettings-stier — ikke
bare cup/liga — og (b) dobbeltfeil-residualet, der selve opprydding-sletten også kan feile og
etterlate orphans. #680 ga catch-all `error.tsx` (rå-500 løst). Det gjenstår å lukke de
faktiske orphan-hullene og bevise dem med chaos-tester.

En sveip av kodebasen fant **to udekte orphan-hull** utover dem #675 dekket:

- **`createGameInternal`** (`app/[locale]/admin/games/new/actions.ts`): inserter `games`
  (L178) så `game_players` (L239) **uten kompenserende sletting**. Feiler spiller-insert-et,
  står en foreldreløs game-rad igjen. Skaperen *har* DELETE-RLS på egne games (0071), så
  kompenserende sletting holder her.
- **`createCourse`** (`app/[locale]/admin/courses/new/actions.ts`): inserter `courses` (L68)
  → `course_holes` (L81) → `tee_boxes` (L95) **uten rollback**. Verre: en ikke-admin-skaper
  har **ingen DELETE-RLS på `courses`** (kun `courses admin delete`, 0092). En kompenserende
  slett ville blitt blokkert av RLS (0-rad-slett) → orphan består. Dette er nettopp stien der
  «ekte transaksjon» fra #737 scope 3 hører hjemme.

`createCupMatchesFromPlan`, `createLeagueDraft` og `startLeagueRoundFlight` har allerede
fungerende #675-opprydding (skaper/klubb-admin har nødvendig DELETE-RLS) — de trenger kun
chaos-test-dekning, ikke ny rollback-logikk.

## Prior Decisions

- **#675 (cup/liga atomic creation)**: valgte kompenserende sletting framfor ekte transaksjon
  for å holde kolonne-logikken i den typede TS-stien; utsatte dobbeltfeil-residualet (P2).
  Denne kontrakten fullfører det utsatte arbeidet uten å rive opp #675s fungerende rollbacks.
- **#680 (error boundaries)**: catch-all `app/[locale]/error.tsx` dekker alle ruter
  hierarkisk — rå-500 er allerede løst, re-files ikke.
- **Trap #1 (live DB er fasit)**: ny RPC må matche live-skjema for `courses`/`course_holes`/
  `tee_boxes` — verifiser via Supabase MCP før migrasjonen skrives.
- **Trap #3 (RLS er authz-laget)**: en SECURITY DEFINER RPC bypasser RLS → authz må
  håndheves i funksjonskroppen (`created_by = auth.uid()`).
- **Owner-beslutning (2026-06-22)**: «Målrettet» — ekte transaksjon kun der opprydding er
  strukturelt utilstrekkelig (bane-oppretting). Ikke konverter cup/liga til RPC-er.

## Design

### 1. `createCourse` → ekte transaksjon (SECURITY DEFINER RPC)

Erstatt de tre sekvensielle insertene med ett RPC-kall som gjør alt i én Postgres-transaksjon.

Migrasjon `0113_create_course_with_layout.sql`:
```
create function public.create_course_with_layout(
  p_name text, p_holes jsonb, p_tees jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_course_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into courses (name, created_by) values (p_name, v_uid) returning id into v_course_id;
  insert into course_holes (<eksakte kolonner fra live-skjema>)
    select ..., v_course_id from jsonb_to_recordset(p_holes) as h(...);
  insert into tee_boxes (<eksakte kolonner>)
    select ..., v_course_id from jsonb_to_recordset(p_tees) as t(...);
  return v_course_id;
end $$;
```
- Kolonnelistene hentes fra live-skjema (MCP) før migrasjonen skrives — ikke fra hukommelse.
- DB CHECK-constraints (par/hole_number, `tee_boxes.course_rating` #817/0112, osv.) fyrer
  fortsatt inne i transaksjonen → ugyldig payload ruller hele txn tilbake → RPC raise →
  TS fanger → lokalisert feil. Atomisk: feiler holes eller tees, blir det INGEN course-rad.
- TS-action-en beholder ALL parsing/validering (`parseCourseHolesAndTees`, redirect-guards).
  Den bytter kun de tre `.insert()`-blokkene mot `await supabase.rpc('create_course_with_layout',
  { p_name, p_holes, p_tees })`. RPC-feil → `fail('db_course' | 'db_holes' | 'db_tees')` (behold
  eksisterende feilkoder så `/admin/courses/new`-siden mapper dem uendret).
- Grant: `execute` til `authenticated` (alle innloggede kan opprette egen bane, #366).
- Påfør **staging først** (MCP), verifiser, deretter prod (0107-mønsteret). Regenerer
  `lib/database.types.ts` etter migrasjonen.

### 2. `createGameInternal` → kompenserende sletting

Speil #675-mønsteret. Etter `game_players`-insert-et:
```
const { error: gpError } = await supabase.from('game_players').insert(rows);
if (gpError) {
  // Rull tilbake den committede games-raden så en feilet spiller-insert ikke
  // etterlater en foreldreløs game-rad (#737). game_players cascade-ryddes av FK
  // (0001). Skaperen har DELETE-RLS på egne games (0071).
  await supabase.from('games').delete().eq('id', game!.id);
  console.error('[createGameInternal] game_players insert failed', gpError);
  redirect({ href: `${errorBase}?error=db_players`, locale });
}
```
Behold eksisterende `db_players`-feilkode og redirect — kun rollback-sletten legges til.

### 3. Chaos-injection-tester (alle fem stier)

Bruk `buildSupabaseMock` (`tests/serverActionMocks`): FIFO-kø av resultater + `__fromCalls`
(table/method/args) for å inspisere hva som ble kalt. Mønster per sti:

- **Kompenserende-slett-stier** (game, cup, liga-draft, liga-flight): kø opp resultater så det
  mid-sekvens insert-et returnerer `{ error }`. Assert (a) en kompenserende
  `delete()` mot parent-tabellen ble issued i `__fromCalls` (target = innsatt id), og (b)
  en lokalisert feil overflater (RedirectError med `?error=<kode>`, eller `{ error }`-retur).
- **RPC-sti** (course): mock `supabase.rpc('create_course_with_layout', …)` til å returnere
  `{ error }`. Assert (a) ingen `courses.insert` skjedde direkte (kun RPC-kallet), og (b)
  lokalisert feil (`?error=db_course/holes/tees`). Atomisiteten ligger i DB — unit-testen
  beviser at TS-stien bruker RPC-en og feiler rent, ikke at Postgres ruller tilbake.

«Orphan-sweep returnerer 0» oversettes i unit-kontekst til: for compensating-stier asserer vi
at den kompenserende sletten mot parent-id-en ble emittet; for RPC-stien at det ikke fins noe
ikke-atomisk insert å etterlate.

### 4. `docs/bug-prevention.md` trap #5

Oppdater «Enforced»-linja: createCourse på ekte-transaksjon-RPC; createGameInternal + cup/liga
på kompenserende sletting; chaos-injection-tester vokter alle fem stiene. Nevn at courses-stien
trengte RPC fordi ikke-admin-skapere mangler DELETE-RLS.

## Edge Cases & Guardrails

- **Course RPC + admin-sti**: admin oppretter også baner — `created_by = auth.uid()` dekker
  begge. Ingen separat admin-gren i RPC-en.
- **Tom holes/tees**: `parseCourseHolesAndTees` garanterer gyldig form før RPC-kall; RPC-en
  trenger ikke re-validere, kun mappe. Tomt tees-array er lovlig (insert av 0 rader er no-op).
- **`jsonb_to_recordset` kolonne-drift**: hvis en kolonne mangler/feilstaves → migrasjonen
  feiler på staging FØR prod. Verifiser shape mot MCP.
- **Dobbeltfeil på compensating-stier** (insert feiler + slett feiler): for game/cup/liga er
  dette nå en akseptert, logget residual (skaperen HAR DELETE-RLS, så slett-feil = forbigående
  infra-hikke ×2, nesten-umulig). Ikke konverter disse til RPC (owner: målrettet).
- **Ikke rør** `generateRounds`, `startScheduledGame`, eller liga/cup-rollback-logikken —
  kun additive tester der.
- **Ingen nye bruker-strenger**: gjenbruk eksisterende feilkoder. Ingen norsk copy-endring →
  humanizer ikke relevant.

## Key Decisions

- **Course = RPC, game = compensating-delete**: drevet av RLS-asymmetrien (courses mangler
  creator-DELETE; games har den). Hver sti får den letteste tilstrekkelige løsningen.
- **Cup/liga urørt utover tester**: owner valgte målrettet; deres #675-opprydding fungerer.
- **Behold feilkoder + redirects**: ingen UX-endring, kun robusthet bak kulissene.
- **`updateCourse` (partial-rewrite)**: UPDATE-flyt, annen bug-klasse (delvis oppdatering, ikke
  orphan-creation) → utenfor scope, files som oppfølgings-issue.

**Claude's Discretion:**
- Eksakt RPC-navn (`create_course_with_layout` foreslått) og signatur-detaljer.
- Om chaos-testene legges i eksisterende `actions.test.ts`-filer (foretrukket, gjenbruk mock-
  oppsett) eller egne `*.chaos.test.ts`.
- Hvilke N-verdier (hvilket insert i sekvensen) som testes per sti — minst det første barn-
  insert-et per sti; cup-løkka også 2. iterasjon for å bevise batch-rollback.
- Versjon-bump: behaviour-endrende chunk (RPC + game-rollback) bumper patch + CHANGELOG;
  rene test-chunks er `test(...)` uten bump.

## Success Criteria

- [ ] `createCourse` utfører course + holes + tees som én atomisk DB-transaksjon (SECURITY
      DEFINER RPC); barn-insert-feil etterlater 0 orphan `courses`-rader.
      *Evidens:* migrasjonsfil + RPC-kropp; chaos-test som asserter RPC-feil → lokalisert feil + ingen direkte course-insert.
- [ ] `createGameInternal` ruller tilbake `games`-raden (kompenserende slett) når
      `game_players`-insert feiler, og redirecter med lokalisert `db_players`-feil.
      *Evidens:* kode + chaos-test som asserter `games.delete().eq(innsatt id)`.
- [ ] Chaos-injection-tester finnes for alle fem fler-stegs-stier (game, course, cup,
      liga-draft, liga-flight): hver mocker en mid-sekvens-feil og asserter (a) rollback/atomisk
      feil og (b) lokalisert feil overflater. *Evidens:* testfiler + grønn `vitest`-kjøring.
- [ ] Ingen av de testede feilmodusene kan etterlate en orphan parent-rad (game u/players,
      course u/holes-tees, cup u/matcher, liga u/runder-spillere).
      *Evidens:* assertions i chaos-testene (compensating delete mot parent-id, eller atomisk RPC).
- [ ] Course-RPC verifisert mot live-skjema (courses/course_holes/tee_boxes kolonne-shape) —
      ingen skjema-drift (trap #1); migrasjon påført staging. *Evidens:* MCP-skjema-sjekk + staging-apply.
- [ ] `docs/bug-prevention.md` trap #5 oppdatert. *Evidens:* doc-diff.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run` på endrede testfiler passerer (game/course/cup/liga)
- [ ] `npm run lint` på endrede filer passerer
- [ ] Migrasjon `0113` påført staging rent via Supabase MCP før prod
- [ ] `lib/database.types.ts` regenerert etter migrasjon (RPC-funksjonstype til stede)

## Files Likely Touched

- `supabase/migrations/0113_create_course_with_layout.sql` — ny SECURITY DEFINER RPC
- `app/[locale]/admin/courses/new/actions.ts` — bytt 3 inserts mot RPC-kall
- `app/[locale]/admin/games/new/actions.ts` — legg til kompenserende slett
- `app/[locale]/admin/courses/new/actions.test.ts` — chaos-test (RPC-feil)
- `app/[locale]/admin/games/new/actions.test.ts` — chaos-test (gp-feil → rollback)
- `app/[locale]/admin/cup/[id]/generer/actions.test.ts` — chaos-test (batch-rollback)
- `lib/league/actions.test.ts` — chaos-tester (draft + flight rollback)
- `lib/database.types.ts` — regen etter migrasjon
- `docs/bug-prevention.md` — trap #5 «Enforced»-oppdatering
- `package.json` + `CHANGELOG.md` — patch-bump for behaviour-endrende chunk

## Out of Scope

- `updateCourse` partial-rewrite atomisitet (UPDATE-flyt, ikke orphan-creation) → files som
  oppfølgings-issue.
- `submitTeamRegistration` per-slot-partial (by design — tillater delvis lagbygging).
- Konvertere cup-/liga-oppretting til RPC-er (owner: målrettet; #675-opprydding fungerer).
- Bruker-synlig copy / nye feiltekster.
