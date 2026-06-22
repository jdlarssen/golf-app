# Spec: updateCourse — atomisk redigering + eierskaps-sjekk (#846)

## Problem

`updateCourse` (`app/[locale]/admin/courses/[id]/edit/actions.ts`) rewriter en bane i
mange ikke-atomiske steg: UPDATE `courses` → DELETE alle `course_holes` → INSERT nye holes
→ per-tee UPDATE/INSERT-løkke → hard-delete ubrukte tees → arkiver tees i bruk. Feiler et steg
midtveis, står banen i en inkonsistent tilstand. Verste tilfelle: mellom holes-DELETE og
holes-INSERT har banen **null hull** — feiler insert-et, krasjer leaderboards (#642-klasse) og
banen er ødelagt. Ingen kompenserende slett kan fikse dette: en redigering har ingen parent å
slette for å angre — bare en ekte transaksjon ruller tilbake til forrige tilstand.

Søsken-funn fra #737. Under scouting fant jeg også en authz-asymmetri: `updateCourse` (og
`restoreTee`) lar en trusted-creator (ikke-admin på e-post-allowlista, `lib/admin/trustedCreators.ts`
— minst én reell bruker) redigere/gjenopprette **hvilken som helst** bane, mens `deleteCourse`
begrenser ikke-admin til kun egne baner. Eier valgte (2026-06-22) å stramme inn i samme arbeid.

## Prior Decisions

- **#737 (createCourse atomisk)**: 0113-mønsteret — flytt fler-stegs-skriv inn i én RPC for
  atomisitet. Der ble RPC-en **SECURITY DEFINER** fordi en ikke-admin-skaper manglet DELETE-RLS
  og RPC-en måtte tvinge `created_by = auth.uid()`. Feilkoder kollapset til én (alle mappet til
  samme melding). Kolonne-shape verifisert mot live-skjema (trap #1).
- **Hvorfor SECURITY INVOKER her, ikke DEFINER**: «trusted creator» finnes IKKE i databasen —
  det er en TS-e-post-allowlist (`isTrustedCreator`, #198). En SECURITY DEFINER RPC kunne derfor
  ikke selv-authz-e trusted-rollen uten å bli et hull (trap #3: direkte PostgREST-kall fra en
  vilkårlig innlogget bruker). Med **SECURITY INVOKER** forblir RLS authz-laget for direkte
  JWT-kall (courses/holes/tees skrive-policyer er `is_admin()`-only, 0092 → en ikke-admin blokkeres),
  mens trusted-stien går via service-role-klienten (TS-gatet + ny eierskaps-sjekk) akkurat som i dag.
- **deleteCourse-mønsteret** (samme fil, L252–261): ikke-admin → les `courses.created_by`, avvis
  med `?error=not_owned` hvis ikke egen. Eierskaps-sjekken her speiler det.

## Design

### 1. Atomisitet — SECURITY INVOKER RPC (executor, TS beholder diff-en)

Behold den velprøvde diff-logikken i TS (eksisterende tees-read + games-FK-oppslag som splitter
fjernede tees i hard-delete vs arkiver). Beregn planen i TS, send den til én RPC som påfører ALT i
én transaksjon.

Migrasjon `0114_update_course_with_layout.sql` (SECURITY INVOKER, default):
```
create function public.update_course_with_layout(
  p_course_id uuid, p_name text, p_updated_by uuid, p_holes jsonb,
  p_tee_updates jsonb,         -- [{id, name, length_meters, slope_*, course_rating_*, par_total_*}]
  p_tee_inserts jsonb,         -- samme uten id
  p_tee_hard_delete uuid[],    -- slettes
  p_tee_archive uuid[]         -- archived_at = now()
) returns void language plpgsql security invoker set search_path = public as $$
begin
  update courses set name = p_name, updated_at = now(), updated_by = p_updated_by where id = p_course_id;
  delete from course_holes where course_id = p_course_id;
  insert into course_holes (course_id, hole_number, par_mens, par_ladies, par_juniors, stroke_index)
    select p_course_id, h.* from jsonb_to_recordset(p_holes) as h(hole_number int, par_mens int, par_ladies int, par_juniors int, stroke_index int);
  update tee_boxes t set name = u.name, length_meters = u.length_meters, ... from jsonb_to_recordset(p_tee_updates) as u(id uuid, name text, ...) where t.id = u.id and t.course_id = p_course_id;
  insert into tee_boxes (course_id, name, ...) select p_course_id, i.* from jsonb_to_recordset(p_tee_inserts) as i(name text, ...);
  delete from tee_boxes where id = any(p_tee_hard_delete) and course_id = p_course_id;
  update tee_boxes set archived_at = now() where id = any(p_tee_archive) and course_id = p_course_id;
end $$;
grant execute on function public.update_course_with_layout(...) to authenticated;
```
- **SECURITY INVOKER** — RLS gjelder for direkte JWT-kall (admin passerer, ikke-admin blokkeres).
- Kolonne-shape verifisert mot live prod-skjema (samme som 0113: course_holes komposit-PK ingen id;
  tee_boxes.course_rating_* numeric). DB-CHECK-constraints fyrer inne i txn → rollback på brudd.
- `and t.course_id = p_course_id` på tee-update/delete/archive: defense-in-depth mot kryss-bane-id.
- Påfør **staging først** (MCP), smoke-test atomisitet (inject feil midtveis → holes uendret),
  DERETTER prod (0107-mønsteret). Regenerer `lib/database.types.ts`.

**TS `updateCourse`-endringer:** behold gate + `parseCourseHolesAndTees` + eksisterende-tees-read
(`db_load`) + games-FK-diff (`db_load`). Beregn `p_tee_updates` (tees med id) og `p_tee_inserts`
(uten id). Erstatt course-UPDATE + holes delete/insert + tee-løkke + hard-delete + arkiv med ETT
`writeClient.rpc('update_course_with_layout', {...})`-kall. `writeClient`-splitten beholdes
(admin = request-klient, trusted = service-role). RPC-feil → én feilkode (`db_course`; de tre
gamle write-kodene mappet til samme melding — speiler #737). Reads beholder `db_load`.

### 2. Eierskaps-sjekk (eier-beslutning)

Etter gaten, før skriv, i BÅDE `updateCourse` og `restoreTee` (samme authz-flate, ellers
inkonsistent guard): hvis `!role.isAdmin`, les `courses.created_by` via request-klient og avvis med
`?error=not_owned` hvis ikke egen. Speiler `deleteCourse` (L252–261). Admin upåvirket.
`restoreTee` har allerede et tee-tilhører-bane-read (L178) — eierskaps-sjekken legges på course.

## Edge Cases & Guardrails

- **0-holes-vinduet forsvinner**: holes-DELETE + INSERT skjer nå i samme txn — banen har aldri
  null hull synlig for andre transaksjoner.
- **uuid[]-params**: verifiser at supabase-js sender `string[]` som coerces til `uuid[]` (ellers
  bytt til jsonb + `jsonb_array_elements_text`). Test på staging.
- **Tom hard-delete/arkiv**: `any('{}')` = ingen rader, no-op. Trygt.
- **Trusted-creator skriver fortsatt via service-role**: selv egen bane krever service-role (RLS
  er admin-only på courses/holes/tees). Eierskaps-sjekken er app-laget guard (RLS håndhever det
  ikke for trusted-stien) — samme arkitektur som #198/#366.
- **TOCTOU uendret**: TS leser eksisterende tees + games-refs FØR RPC-en (som i dag). Samtidig-
  redigering er ikke en ny risiko — #846 gjelder skrive-atomisitet, ikke samtidighet. Ikke utvid.
- **Ikke rør** `deleteCourse` (har allerede eierskaps-sjekk) eller `parseCourseHolesAndTees`.

## Key Decisions

- **SECURITY INVOKER, ikke DEFINER**: trusted-rollen finnes ikke i DB → DEFINER kunne ikke
  authz-e den. INVOKER lar RLS gate direkte kall; trusted-stien er TS-gatet + service-role som i dag.
- **TS beholder diff-en (executor-RPC)**: diff-logikken (arkiver vs hard-delete via games-FK) er
  subtil og testet — flytt den ikke til SQL. RPC-en er en dum atomisk eksekutor.
- **Eierskaps-sjekk på updateCourse + restoreTee**: eier valgte å stramme inn nå; restoreTee tas
  med for konsistent flate (begge er «rediger andres bane»-stier).
- **Feilkode-kollaps** til `db_course` for write-feil; `db_load` beholdes for pre-write-reads.

**Claude's Discretion:**
- Eksakt RPC-navn/signatur; uuid[] vs jsonb for delete/arkiv-lister (test på staging).
- Om `not_owned` trenger ny melding i edit-namespacet (legg til NO+EN, kjør humanizer hvis ny streng).
- Versjon-bump (atferdsendrende → patch + CHANGELOG); test-only-chunks = `test(...)`.

## Success Criteria

- [ ] `updateCourse` påfører course-update + holes-replace + alle tee-ops som én atomisk DB-
      transaksjon (RPC); en feil midtveis etterlater banen uendret (holes-count bevart, ingen
      delvis tee-tilstand). *Evidens:* migrasjon + RPC-kropp; staging smoke-test som injiserer feil
      midt i txn og asserter holes/tees uendret.
- [ ] `updateCourse` kaller RPC-en i stedet for de sekvensielle skrivene; `writeClient`-splitten
      (admin=request, trusted=service-role) bevart. *Evidens:* kode + test.
- [ ] Ikke-admin (trusted) som redigerer en bane de IKKE eier → `?error=not_owned`, ingen skriv;
      gjelder både `updateCourse` og `restoreTee`. Admin upåvirket. *Evidens:* tester.
- [ ] Chaos-injection-test: RPC-feil → lokalisert feil, ingen delvis skriv lekker. Eksisterende
      `updateCourse`/`restoreTee`-tester oppdatert til RPC-stien. *Evidens:* testfiler + grønn vitest.
- [ ] RPC verifisert mot live-skjema, påført staging + prod; `lib/database.types.ts` regenerert.
      *Evidens:* MCP-skjema-sjekk + apply + funksjonstype i types-fila.

## Gates

- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run "app/[locale]/admin/courses/[id]/edit/actions.test.ts"` passerer
- [ ] `npx eslint` på endrede filer passerer
- [ ] Migrasjon `0114` påført staging rent + atomisitet smoke-testet før prod
- [ ] `lib/database.types.ts` regenerert (RPC-funksjonstype til stede)

## Files Likely Touched

- `supabase/migrations/0114_update_course_with_layout.sql` — ny SECURITY INVOKER RPC
- `app/[locale]/admin/courses/[id]/edit/actions.ts` — RPC-kall + eierskaps-sjekk (updateCourse + restoreTee)
- `app/[locale]/admin/courses/[id]/edit/actions.test.ts` — RPC-sti + eierskaps-tester + chaos-test
- `lib/database.types.ts` — regen
- `messages/no.json` + `messages/en.json` — `not_owned`-melding i edit-namespacet hvis den mangler
- `docs/bug-prevention.md` — felle #5 (oppdater med updateCourse-RPC)
- `package.json` + `CHANGELOG.md` — patch-bump

## Out of Scope

- `deleteCourse` (har allerede eierskaps-sjekk + cascade-atomisk delete).
- Lukke TOCTOU-vinduet (samtidig-redigering) — egen bekymring, ikke skrive-atomisitet.
- Konvertere diff-logikken til SQL (executor-RPC beholder TS-diffen bevisst).
- Andre fler-stegs-stier (dekket av #737).
