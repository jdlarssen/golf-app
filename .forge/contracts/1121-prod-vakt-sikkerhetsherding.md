# Forge-kontrakt: #1121 — Sikkerhetsherding fra prod-vaktas første kjøring

**Issue:** #1121 — security-advisories fanget av prod-vakta (loop 8, epic #1073), triagert av eier samme dag.
**Type:** Security hardening — ren SQL (migrasjon) + pgTAP-tester + baseline-oppdatering + docs. Ingen app-kode, ingen bruker-synlig endring.
**Grunnsannhet:** live katalog-introspeksjon på staging (`snwmueecmfqqdurxedxv`) + prod (`glofubopddkjhymcbaph`, read-only) 2026-07-07. Advisor-snapshot: prod 75 lints / staging 73 lints. Kall-steder + RLS-policies gjennomgått per funksjon.

---

## Mål

Prod-vaktas første kjøring flagget fire advisory-klasser utenfor baseline. For at neste dispatch skal bli **ren mot ny baseline** må hver nøkkel enten **fikses** (forsvinner fra advisoren) eller **baselines** (bevisst unntak, begrunnet). To klasser krever reell gjennomgang; to er trivielle.

| Klasse | Antall (prod) | Utfall |
|---|---|---|
| `function_search_path_mutable` | 6 | **Fikses** — lås `search_path` via migrasjon |
| `anon_security_definer_function_executable` | 22 | Per-funksjon: **16 revokes** + **6 baselines** |
| `authenticated_security_definer_function_executable` | 41 | Per-funksjon: **10 revokes** + **31 baselines** |
| `rls_enabled_no_policy` | 5 | Allerede i baseline (uendret) |
| `auth_leaked_password_protection` | 1 | **Baselines** (eier-beslutning: OTP-only, ingen passord) |

**IKKE en blind revoke-sweep** — det er feilklassen fra #641-klyngen. Hver revoke er evidens-forankret (kall-sted + policy-referanse verifisert live).

---

## Klasse 1 — `function_search_path_mutable` (6 funksjoner → FIKS)

Alle seks er `SECURITY INVOKER` (ikke DEFINER) og skjema-kvalifiserer allerede sine `public.`-referanser (verifisert via `pg_get_functiondef`), så `SET search_path = ''` (strengest) er atferds-bevarende. `ALTER FUNCTION … SET search_path = ''` — rører ikke kropp eller ACL.

| Funksjon | Kropp refererer | search_path |
|---|---|---|
| `generate_friend_code()` | `public.users` (kval.) + pg_catalog | `''` |
| `generate_game_short_id()` | `public.games` (kval.) | `''` |
| `generate_group_short_id()` | `public.groups` (kval.) | `''` |
| `set_updated_at()` | `now()` (pg_catalog) | `''` |
| `slugify_course_name(text)` | kun pg_catalog (sql immutable) | `''` |
| `upsert_score_if_newer(...)` | `public.scores` (kval.) | `''` |

→ Advisoren forsvinner helt for alle 6 (cache_key inneholder kropp-hash, men mutable-flagget faller bort). Ingen baseline.

---

## Klasse 2 — SECURITY DEFINER EXECUTE-flate (per-funksjon gjennomgang)

Nøkkel-innsikt: **`anon` har fulle tabell-grants på nesten alle tabeller** (standard Supabase — RLS er eneste port). Derfor MÅ enhver helper referert av en `{public}`-policy beholde anon-EXECUTE, ellers feiler anon-spørringer med «permission denied for function» før RLS rekker å nekte. ACL-detalj: de fleste funksjonene har **PUBLIC-grant (`=X`) OG eksplisitte rolle-grants**, så «revoke fra anon» alene er utilstrekkelig der PUBLIC finnes — PUBLIC må også revokes, og eksplisitt `authenticated`/`service_role`-grant bevarer legitim tilgang.

### 2a. Trigger-/event-trigger-funksjoner → REVOKE PUBLIC, anon, authenticated (fjerner hele RPC-flaten)

Returnerer `trigger`/`event_trigger`; kalles KUN av trigger-mekanismen, som **ikke** sjekker kallerens EXECUTE-privilegium. Revoke fjerner dem fra `/rest/v1/rpc` mens triggere fyrer uendret. `postgres` (eier) + `service_role` (eksplisitt grant) beholdes.

`guard_game_players_invite_eligibility`, `guard_game_players_score_differential`, `guard_game_players_self_update`, `guard_group_join_requests_self_update`, `guard_group_members_last_owner_delete`, `guard_invitations_self_update`, `guard_scores_self_update`, `guard_users_self_update`, `handle_new_auth_user`, **`rls_auto_enable`** (event trigger, prod-only — guardes med existence-check).

→ Klarerer BEGGE klasser for disse (anon + authenticated).

### 2b. consume_admin_rate_limit → REVOKE PUBLIC, anon (behold authenticated + service_role)

`consume_admin_rate_limit(text,integer,integer)` har TO legitime kaller-klasser (e2e-gate avslørte den andre — #641-lærdommen i praksis):
1. **service-role**: login- og self-reg-rate-limits (`lib/auth/loginRateLimit.ts`, `registrationRateLimit.ts` via `getAdminClient()`).
2. **authenticated**: admin-invite-rate-limit (`lib/admin/rateLimit.ts` ← `app/[locale]/admin/spillere/actions.ts`) kaller via den innloggede admins EGEN klient. Revoke av authenticated fail-opnet limiteren (advarsel «permission denied for function consume_admin_rate_limit» i e2e-loggen).

Derfor: revoke PUBLIC + anon (anon er aldri kaller — pre-login-limiteren er service-role), behold authenticated + service_role. `authenticated_`-nøkkelen baselines. Follow-up: rut admin-limiteren via service-role, så kan authenticated også revokes.

### 2c. Authenticated-RPC/-helper → REVOKE anon (behold authenticated)

| Funksjon | Hvorfor anon-revoke trygt | PUBLIC-grant? |
|---|---|---|
| `create_course_with_layout(text,jsonb,jsonb)` | authenticated server-action bak `auth.getUser()`-gate | nei → `REVOKE FROM anon` |
| `email_is_registered(text)` | kun authenticated kall-steder (invite + admin/spillere). **Fikser drift**: #671 hevdet 0009 anon-revoket, men live-grant viste `anon=X` | nei → `REVOKE FROM anon` |
| `can_react_in_game(uuid)` | RLS-helper kun i `{authenticated}` reactions-policy | ja → `REVOKE FROM public, anon` |
| `league_group_id(uuid)` | RLS-helper kun i `{authenticated}` league-policies | ja → `REVOKE FROM public, anon` |
| `same_flight(uuid,uuid)` | referert av INGEN policy/funksjonskropp (død helper — `same_flight_or_solo` brukes nå) | ja → `REVOKE FROM public, anon` |

### 2d. anon-nødvendige helpers → BEHOLD + baseline (referert av `{public}`-policy)

`is_admin` (mange `{public}`-policies), `same_flight_or_solo` (scores `{public}` SELECT), `can_score_for` (scores `{public}` INSERT/UPDATE), `is_in_game` (game_players `{public}` SELECT), `is_game_creator_or_admin` (game_registration_requests `{public}`), `email_is_invited` (login-gate, anon MÅ beholde).

### 2e. authenticated-baseline (30 funksjoner)

Alle DEFINER-funksjoner som signed-in brukere legitimt kaller (RLS-helpers + bruker-RPC-er, hver med intern authz) — minus de 11 revoke-PUBLIC-funksjonene i 2a/2b. Baselines samlet med klasse-begrunnelse.

---

## Migrasjon

Fil: `supabase/migrations/0137_harden_prod_vakt_advisories.sql` (0136 er siste på origin/main — verifisert).
Rekkefølge: **staging (MCP) → verifiser → prod (KUN etter eksplisitt eier-godkjenning; prod-brannmuren #1074 håndhever `touch .claude/approve-prod`)**.

## Baseline

`docs/loops/prod-vakta-baseline.txt`: legg til 6 anon-kept + 30 authenticated-kept + `auth_leaked_password_protection`, gruppert under `#`-begrunnelses-blokker (prod-vakt.sh strto `^#`). Eksakte cache_keys hentet verbatim fra prod-advisor-snapshot (inkl. mellomrom i arg-signaturer).

## Gates (scoped)

1. **`npm run test:rls`** (supabase test db, CLI 2.105.0 finnes) — pgTAP hostile-rig (#440). Ny fil `supabase/tests/prod_vakt_hardening_1121_test.sql` + eksisterende guard-/RLS-tester bekrefter at triggere fortsatt fyrer etter revoke. Skip-trap: output må vise pgTAP-resultat, ikke «[skipped]».
2. **`npm run e2e:gate`** (playwright `--grep @gate` mot staging) — login (anon `email_is_invited`), scoring (`upsert_score_if_newer`, `can_score_for`, guard-triggere), cup-/liga-smoke ende-til-ende.
3. **Post-migrasjon advisor-diff** (MCP `get_advisors` staging) — bekreft at klarerte nøkler er borte og gjenstående = ny baseline (minus `rls_auto_enable`, ikke på staging).
4. **`has_function_privilege`-verifikasjon** (MCP execute_sql staging) — positiv bekreftelse per rørt funksjon at ACL endte som spesifisert (I3: 0-effekt-revoke = stille no-op).
5. **`npm run build`** — ingen app-kode rørt, men skal være grønt.

---

## Success Criteria

- [ ] `0137`-migrasjon: 6 × `ALTER FUNCTION SET search_path=''` + revokes per matrise (2a–2c), med existence-guard for `rls_auto_enable`.
- [ ] Migrasjon påført **staging** via MCP; `has_function_privilege`-verifikasjon bekrefter: 6 fns har search_path; guards+handle+rls_auto = anon+authd false; create_course/email_is_registered/can_react/league_group_id/same_flight = anon false, authd true; `consume_admin_rate_limit` = anon false, authd true, svc true; kept-helpers anon+authd true.
- [ ] `prod_vakt_hardening_1121_test.sql` skrevet; `npm run test:rls` grønt med reelle pgTAP-resultater (ellers VERIFICATION GAP dokumentert).
- [ ] `npm run e2e:gate` grønt mot staging (login + scoring + cup + liga).
- [ ] Post-migrasjon staging-advisorer: 0 nye nøkler utenfor ny baseline (minus rls_auto_enable).
- [ ] `docs/loops/prod-vakta-baseline.txt` oppdatert med 38 nye nøkler (6 anon + 31 authenticated + 1 auth-config) + begrunnelses-blokker.
- [ ] `npm run build` grønt.
- [ ] Prod-apply KUN etter eksplisitt eier-godkjenning i økten; deretter prod-advisor-diff bekrefter ren dispatch.
- [ ] PR mot main (`Closes #1121`), `Refs #1121` i commits, `chore(security):`-prefiks (ingen version-bump, ingen CHANGELOG — intern).
- [ ] Follow-up-issues opprettet: `same_flight` død-kode; `rls_auto_enable` staging/prod-drift.
- [ ] Closing-kommentar (Teknisk + Funksjonell) på #1121.

## Ikke i scope (funn → egne issues)

- `same_flight`-helperen er død (ingen referanser) — kandidat for `DROP`, egen issue.
- `rls_auto_enable` finnes på prod men ikke staging (defense-in-depth event-trigger mangler på staging) — schema-drift, egen issue.
