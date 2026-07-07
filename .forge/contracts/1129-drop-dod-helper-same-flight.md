# Spec: Drop død helper same_flight(uuid,uuid)

**Issue:** #1129 · **Branch:** claude/1129-drop-dod-helper-same-flight

## Problem

`public.same_flight(p_game_id uuid, p_other_user uuid)` (SECURITY DEFINER, definert i `supabase/migrations/0002_rls_policies.sql:19`, sist hardnet i `0104_harden_security_definer_functions.sql:84`) er død kode. Alle RLS-policyene som en gang refererte den er skrevet om:

- **SELECT** «scores select gating» → droppet og gjenskapt som «scores select gating per mode» med `same_flight_or_solo` i `0031_solo_visibility_rls.sql:43-76` (senere `0092`, `0121`).
- **INSERT/UPDATE** «scores insert/update by flight» → skrevet om til `can_score_for` i `0088_coscore_flightless_small_games.sql:70-101`.
- **Reveal-klausulen** i `0025_reveal_active_scores_visibility.sql:49` ble erstattet av 0031-omskrivingen.

Grep med ordgrense (`same_flight\b`, ekskl. `same_flight_or_solo`) bekrefter: ingen levende policy, funksjon eller app-kode kaller den. Eneste app-treff er den genererte typen i `lib/database.types.ts:1908`. #1121 (`0137_harden_prod_vakt_advisories.sql:93`) revokerte allerede anon/PUBLIC-EXECUTE og noterte eksplisitt (0137:88-89) at funksjonen er «referenced ... by no policy at all — superseded by same_flight_or_solo». Neste steg er å droppe den helt.

## Design

1. **Ny migrasjon `supabase/migrations/0138_drop_dead_same_flight.sql`.** (Bekreft først at 0138 ikke er tatt på `origin/main` — sjekk migrasjonsnummerering før du skriver.) Innhold: kommentar-header som forklarer hvorfor (død helper, superseded av `same_flight_or_solo`/`can_score_for`, jf. #1121/0137), deretter:
   ```sql
   drop function if exists public.same_flight(uuid, uuid);
   ```
   **Ikke** `cascade` — en naken DROP feiler høylytt hvis noe uventet avhenger av funksjonen, i stedet for å rive med seg policyer stille. Feiler den → «død»-antakelsen er feil → STOPP og diagnostiser (T4), ikke legg til `cascade`.

2. **Påfør staging → verifiser → prod (0107-mønsteret, prod-brannmur #1074).**
   - Staging via Supabase MCP `apply_migration`.
   - **Verifiserings-SELECT** (0-rad-bekreftelse — I3, absence-of-error ≠ suksess):
     ```sql
     select count(*) as n from pg_proc p
     join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public' and p.proname = 'same_flight';
     -- EXPECT: n = 0
     ```
   - Prod KUN etter eksplisitt eier-godkjenning i økten: `touch .claude/approve-prod`, deretter samme migrasjon via MCP, deretter samme verifiserings-SELECT mot prod. Får du ikke godkjenning i økten → påfør staging, verifiser, og la prod-steget + type-regen stå til eier åpner luken.

3. **Oppdater pgTAP-testene som asserterer på `same_flight` (T2 change-propagation — begge feiler når funksjonen er borte):**
   - `supabase/tests/prod_vakt_hardening_1121_test.sql:98-100` — EXECUTE-privilegie-asserten. Erstatt med en «funksjonen finnes ikke lenger»-assert (behold `plan(28)`), f.eks. `hasnt_function('public', 'same_flight', array['uuid','uuid'], '#1129: same_flight droppet — død helper, superseded av same_flight_or_solo')`. Alternativt fjern asserten og sett `plan(27)`.
   - `supabase/tests/security_definer_hardening_test.sql:75-83` — search_path-i-proconfig-asserten (#671). Denne kan ikke lenger gjelde en ikke-eksisterende funksjon: fjern blokka, sett `plan(8)`→`plan(7)`, og oppdater «5 RLS helpers»-kommentaren (linje 60) + nummereringen «4–8» til å reflektere fire gjenværende helpers. (Eller konverter til `hasnt_function` og behold `plan(8)` — byggerens valg, men hold én tydelig linje.)

4. **Regenerer typer etter prod-apply:** `npm run gen:types` (leser prod read-only) fjerner `same_flight`-blokka i `lib/database.types.ts:1908-1911`. Diffen skal være akkurat de fire linjene — ingen annen reordering smugles inn. Kjøres først når prod-migrasjonen er påført (ellers viser prod-skjemaet fortsatt funksjonen). Ingen app-kode konsumerer typen, så en gjenstående stale-entry er ufarlig hvis prod ikke rekkes i økten.

5. **PR:** commits med `Refs #1129` i body, PR-body med `Closes #1129`. **Ingen version-bump / CHANGELOG** — ikke bruker-synlig; bruk prefiks `refactor` (eller `chore`) så commit-msg-hooken slipper den fritt uten bump.

## Edge Cases & Guardrails

- **DROP feiler på avhengighet:** betyr en levende referanse vi ikke fant → STOPP, ikke tving med `cascade`. Grep på nytt (`same_flight\b`) og diagnostiser (T4).
- **Migrasjonsnummer-kollisjon:** sjekk `origin/main` før du velger 0138 (kjent felle — parallelle branches kan ha tatt nummeret).
- **pgTAP-plan-drift:** endrer du antall assertions, MÅ `plan(n)` oppdateres i samme fil, ellers rød suite.

## Key Decisions

- **Naken DROP, ikke CASCADE** — begrunnet over: fail-loud er ønsket sikkerhetsnett når hele premisset er «ingenting avhenger av denne».
- **Testene oppdateres i samme PR som droppen** — «en regel har ett hjem» (AGENTS.md trap 4): funksjonen og assertene om den endres atomisk.
- **Ingen version-bump** — ren backend-opprydding uten observerbar brukereffekt.

**Claude's Discretion:** Nøyaktig form på test-oppdateringene (`hasnt_function`-assert vs. fjern-og-dekrementer-plan), ordlyd i migrasjons-kommentaren, og hvorvidt de rent kosmetiske `same_flight`-omtalene i kommentarer/fixtures (`supabase/tests/scores_write_rls_test.sql:19`, `supabase/tests/fixtures/rls_helpers.psql:26,133,187`, `supabase/tests/README.md:114`) friskes opp i samme PR eller lates urørt — de er kommentarer, ikke assertions, og påvirker ikke grønn/rød.

## Success Criteria

- [ ] Migrasjon `supabase/migrations/0138_drop_dead_same_flight.sql` dropper `public.same_flight(uuid, uuid)` uten `cascade`.
- [ ] Verifiserings-SELECT mot staging returnerer `n = 0` for `same_flight` i `pg_proc`.
- [ ] `supabase/tests/prod_vakt_hardening_1121_test.sql` og `supabase/tests/security_definer_hardening_test.sql` refererer ikke lenger den droppede funksjonen, og `plan(...)` matcher faktisk antall assertions i hver fil.
- [ ] `supabase test db` kjører grønt (når Supabase CLI + lokal stack er tilgjengelig).
- [ ] Etter prod-apply: `lib/database.types.ts` inneholder ingen `same_flight`-Functions-entry (kun `same_flight_or_solo` gjenstår).
- [ ] `npm run build` + `npm run lint` grønt.

## Gates

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run test:rls` (kjører `supabase test db` — de to oppdaterte pgTAP-filene MÅ passere; hopp ikke over ved å la CLI-en mangle)
- [ ] Staging verifiserings-SELECT (`n = 0`) før prod-apply

## Files Likely Touched

- `supabase/migrations/0138_drop_dead_same_flight.sql` — ny migrasjon, dropper funksjonen
- `supabase/tests/prod_vakt_hardening_1121_test.sql` — fjern/erstatt EXECUTE-privilegie-assert (linje 98-100)
- `supabase/tests/security_definer_hardening_test.sql` — fjern/erstatt search_path-assert (linje 75-83) + plan/kommentar
- `lib/database.types.ts` — regenerert etter prod-apply; fjerner `same_flight`-entry (linje 1908-1911)
- (valgfritt, kosmetisk) `supabase/tests/scores_write_rls_test.sql`, `supabase/tests/fixtures/rls_helpers.psql`, `supabase/tests/README.md` — stale kommentar-omtaler av `same_flight`

## Out of Scope

- `same_flight_or_solo` og `can_score_for` — de levende helperne røres ikke.
- Ingen endring i faktisk RLS-atferd eller hvilke rader noen ser (ren dead-code-fjerning).
- Ingen endring av `scores_write_rls_test.sql`-testlogikk (fixtures plasserer spillere i samme flight, så `can_score_for`/`same_flight_or_solo` relaterer dem uendret) — kun evt. kommentar-oppfriskning.
- Ingen bruker-synlige endringer, ingen CHANGELOG/version-bump, ingen full staging-klikkrunde.
