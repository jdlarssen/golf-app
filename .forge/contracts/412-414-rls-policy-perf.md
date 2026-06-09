# Contract: #412 + #414 — RLS-policy-perf på hot-tabeller (kombinert)

## Goal
Fjerne to Supabase performance-advisor-klasser uten å endre tilgangs-semantikk med en eneste rad:
- **#412 `auth_rls_initplan`** (~32 policyer, 14 på hot-tabeller): direkte `auth.uid()`/`auth.role()`/`auth.jwt()`/`current_setting()` i USING/WITH CHECK re-evalueres per rad. Wrap i `(select …)` så Postgres kjører dem én gang per query (initplan).
- **#414 `multiple_permissive_policies`** (~85 advarsler): flere permissive policyer for samme (tabell, handling, rolle) OR-es og evalueres alle per query. Slå sammen **kun der det er beviselig ekvivalent**.

Én migrasjon: `supabase/migrations/0092_rls_policy_perf.sql`.

## Sikkerhetsmodell (ikke-forhandlbar)
RLS er prod-sikkerhet. Hver endring må være **beviselig semantikk-bevarende**:
- **#412-regel:** `(select auth.uid())` returnerer nøyaktig samme skalar som `auth.uid()`. Mekanisk substitusjon, ingen logikk-endring. Gjelder alle direkte auth.*-kall. SECURITY DEFINER-helpere (`is_admin()`, `is_in_game()`, `can_score_for()`, `same_flight_or_solo()`, `is_group_admin()` osv.) røres **ikke** — de er ikke auth.*-kall og advisoren flagger dem ikke under denne klassen.
- **#414-regel:** Postgres OR-er permissive policyer. Å slå sammen N policyer for samme (tabell, cmd, **rolle**) til én med `USING (q1 OR … OR qN)` + `WITH CHECK (c1 OR … OR cN)` er identisk per konstruksjon. **Krav:** kun slå sammen policyer med **samme rolle**. Ved rolle-mismatch (`public` vs `authenticated`): IKKE slå sammen (ville utvide/innsnevre rolle-settet) — la stå, dokumentér hvorfor. En `ALL`-policy ekspanderes til de fire cmd-ene før sammenligning.
- **Forbudt:** rolle-normalisering (public→authenticated), å droppe en cmd-gren, eller en hvilken som helst merge som ikke er ren OR av samme-rolle-policyer. Hvis en konsolidering ikke er beviselig ekvivalent → hopp over den og dokumentér. Bedre å la en advarsel stå enn å løsne sikkerhet.

## #414 konsoliderings-kandidater (per inventar 2026-06-09)
Tabeller med standalone `<x> admin write`/`_admin_all` (ALL, `is_admin()`) som overlapper per-cmd-policyer: `course_holes`, `courses`, `formats`, `format_intent_mapping`, `tee_boxes` (SELECT er `true`/`auth.role()` → admin-ALL er ren redundans for lesing; behold admin kun for skrive-cmd-ene den faktisk trengs), `games`, `game_players`, `invitations`, `game_side_winners`.
Tilnærming per tabell: erstatt den brede `ALL is_admin()`-policyen med `is_admin() OR <eksisterende self/participant-qual>` foldet inn i per-cmd-policyene **når de deler rolle**, og behold en målrettet admin-policy kun for cmd-er uten en egen self-policy. Der rolle ikke matcher → la stå.
**Detaljert per-tabell-diff produseres i bygget og verifiseres mot verbatim pg_policies-dump (før/etter).**

## Gates / Verification
1. **Lokal Postgres** (samme rigg som #440 brukte: Docker + Supabase CLI, eller bar Postgres + alle migrasjoner via psql): kjør `supabase/tests/scores_write_rls_test.sql` (#440-riggen) — **må forbli 19/19 grønt** etter 0092.
2. **Utvid riggen** med pgTAP-asserts for de høyest-risiko konsoliderte tabellene som ikke dekkes i dag: `games` SELECT (deltaker vs ikke-deltaker vs admin), `game_players` SELECT/INSERT, `invitations` SELECT (egen incoming vs andres). Gjenbruk `fixtures/rls_helpers.psql`.
3. **Verbatim pg_policies før/etter-diff:** dump alle public-policyer før og etter, vis at access-settet per (tabell, cmd, rolle) er uendret (kun antall policy-rader + initplan-wrapping endres).
4. `npm run build` grønt (ingen app-kode rørt).
5. **Prod-apply gates på eier-go** (som #413). Etter apply: `get_advisors(performance)` skal vise `auth_rls_initplan`-funn → 0 og `multiple_permissive_policies` redusert; rapportér eksakt hvor mange som gjenstår (de rolle-mismatch-blokkerte) + hvorfor.

## Success Criteria
- [ ] #412: alle direkte `auth.uid/role/jwt()`/`current_setting()` i public-policyer wrappet i `(select …)`. Verifisert via pg_policies-dump.
- [ ] #414: alle beviselig-ekvivalente konsolideringer gjort; ikke-trygge dokumentert i migrasjons-kommentar med grunn.
- [ ] #440-riggen 19/19 grønt etter 0092 + nye asserts for games/game_players/invitations grønne.
- [ ] Verbatim før/etter pg_policies-diff viser uendret access-sett.
- [ ] `npm run build` grønt. PATCH-bump + CHANGELOG (perf-tema).
- [ ] PR mot `main` med `Closes #412`, `Closes #414`. **Migrasjon IKKE anvendt mot prod før eier-go.**

## Avvik / risiko å rapportere
- Hvilke #414-konsolideringer ble hoppet over pga. rolle-mismatch (advarsler som med vilje står igjen).
- Test-dekning: rig dekker scores + (nye) games/game_players/invitations; øvrige tabeller verifisert via policy-ekvivalens-resonnement + advisor, ikke live-test.
