# Kontrakt #670 — RLS: blokker selv-godkjenning + selv-handicap-endring på `game_players`

**Issue:** [#670](https://github.com/jdlarssen/golf-app/issues/670) — *Sikkerhet: en spiller kan selv-godkjenne eget scorekort eller endre eget course_handicap via direkte PostgREST PATCH*
**Alvor:** P1 · **Flyt:** kjør-en-runde → avslutt · **Branch:** `issue-670-rls-self-approve-handicap`
**Type:** RLS / database-integritet (rører prod-RLS — konservativ tilnærming).

---

## 1. Problemet (verifisert mot koden)

`game_players self submit`-UPDATE-policyen (`0092_rls_policy_perf.sql:396-398`, uendret form siden `0002`) gater bare på `is_admin() OR user_id = auth.uid()` — **ingen kolonne-restriksjon, ingen guard-trigger**. En autentisert ikke-admin-spiller kan derfor sende en rå PostgREST `PATCH` mot sin egen `game_players`-rad og skrive *hvilken som helst* kolonne, inkludert:

- `approved_at` + `approved_by_user_id` → **selv-godkjenne eget scorekort**, forbi peer/admin-godkjennings-flyten.
- `course_handicap` → **senke eget handicap for å vinne** (leses av `getGameWithPlayers.ts:159`, mater netto-leaderboarden).

App-laget (`submit`/`approve`/`startGame`) gjør det rette, men RLS er eneste backstop, og den er vidåpen.

### Hvorfor en ren kolonne-GRANT IKKE holder

Issue-ets «Option B» foreslo kolonne-GRANT (revoke blanket UPDATE, grant kun `submitted_at`/`rejection_reason`) + SECURITY DEFINER-RPC-er for resten. Men kode-utforskning avdekket at **både** `approveScorecard` og `rejectScorecard` (`app/[locale]/games/[id]/approve/actions.ts`) skriver `approved_at`/`approved_by_user_id`/`submitted_at` via **bruker-klienten** (`getServerClient()`, `authenticated`-rolle, RLS-sjekket) — ikke admin-klient eller RPC. Autorisasjonen (samme-flight/peer) gjøres i app-laget i `loadAndAuthorize`.

En kolonne-GRANT skiller ikke «skriv `approved_at` på en ANNENS rad» (lovlig peer-godkjenning) fra «skriv `approved_at` på EGEN rad» (selv-godkjenning). Det krever sammenligning av rad-eierskap mot `auth.uid()` — som RLS `WITH CHECK` ikke kan på en måte som tillater peer-godkjenning, og som heller ikke kan se OLD vs NEW for handicap-endring.

**Derfor: en `BEFORE UPDATE`-trigger** (samme defense-in-depth-mønster som `0073`/`0102` allerede etablerer for `scores`). Triggeren ser OLD, NEW og `auth.uid()`, og avviser kun de to forbudte mutasjonene for ikke-admin-aktører.

---

## 2. Lovlige skrive-stier som IKKE må brytes (verifisert)

| Sti | Klient (rolle) | Skriver kolonner | Mot rad | Må fortsatt virke |
|-----|----------------|------------------|---------|-------------------|
| `submitScorecard` | `getServerClient()` (`authenticated`) | `submitted_at`, `rejection_reason` | egen | ✅ |
| `approveScorecard` (peer) | `getServerClient()` (`authenticated`) | `approved_at`, `approved_by_user_id`, `rejection_reason` | **annens** | ✅ |
| `rejectScorecard` (peer) | `getServerClient()` (`authenticated`) | `submitted_at`, `approved_at`, `approved_by_user_id`, `rejection_reason` | **annens** | ✅ |
| Admin handicap-just. (`admin/games/[id]/actions.ts:243`) | `getServerClient()` + `requireAdmin()` (`authenticated`, men `is_admin()`=true) | `course_handicap` | hvilken som helst | ✅ |
| `startGame` / signup | `getAdminClient()` (`service_role`, RLS-bypass) | `course_handicap` m.m. | — | ✅ (bypasser RLS + trigger uansett) |
| flight/foursomes/patsome | bland (`service_role` for flight, `authenticated` for foursomes/patsome) | `flight_number`, `team_number` | egen/annens | ✅ (utenfor scope) |

`service_role`-klienten (`getAdminClient`) bypasser RLS; triggeren slipper den gjennom via en eksplisitt rolle-sjekk slik at admin-app-stier (`startGame`, signup, flight-join) ikke rammes.

---

## 3. Fiks — forbudt-vs-tillatt-matrise (det triggeren håndhever)

For en **ikke-admin** aktør (`auth.uid()` peker på en ikke-`is_admin`-bruker), på `BEFORE UPDATE OF` `game_players`:

| Mutasjon | Mot EGEN rad (`NEW.user_id = auth.uid()`) | Mot ANNENS rad |
|----------|-------------------------------------------|----------------|
| Sette/endre `approved_at` (ny verdi ≠ gammel) | ❌ **AVVIST** (selv-godkjenning) | ✅ tillatt (peer-godkjenning) |
| Sette/endre `approved_by_user_id` | ❌ **AVVIST** | ✅ tillatt |
| Endre `course_handicap` (ny ≠ gammel) når spillet er startet (`status IN ('active','finished')`) | ❌ **AVVIST** | ✅ tillatt (peer-stier rører den ikke; ingen lovlig peer-sti finnes, men ikke triggerens jobb å gate) |
| Endre `course_handicap` før start (`status IN ('draft','scheduled')`) | ✅ tillatt | ✅ tillatt |
| Sette `submitted_at` / `rejection_reason` på egen rad | ✅ tillatt (`submitScorecard`) | — |

**Admin** (`is_admin()`=true) og **`service_role`**: triggeren no-op-er — alle mutasjoner tillatt. RLS-USING/`WITH CHECK` på `game_players self submit` beholdes uendret (triggeren er additiv defense-in-depth, ikke en erstatning).

«Etter start» = `games.status IN ('active','finished')`. «Før start» = `draft`/`scheduled` (matcher self-register-policyene `0043`/`0092`).

### Implementasjons-detaljer
- `SECURITY DEFINER`-trigger-funksjon `public.guard_game_players_self_update()` i `public`-skjema (mirror `is_admin`/`same_flight`-mønsteret).
- Rolle/admin-escape først: `if public.is_admin() then return new; end if;` og slipp `service_role` (current_setting('role') / auth.uid() IS NULL → service-kontekst) gjennom. Konkret: bruk `auth.uid()` — er den NULL (service-rollen har ingen JWT-sub) eller `is_admin()`, returner NEW uendret.
- Sammenlign med `is distinct from` (NULL-trygt) på `approved_at`/`approved_by_user_id`/`course_handicap`.
- Reis `insufficient_privilege` (SQLSTATE `42501`) ved brudd — samme feilklasse som RLS-rejecter, så probe-helperne (`try_update_score`-mønsteret) kan fange det.
- `BEFORE UPDATE` på `public.game_players`, ingen `OF`-kolonneliste (vi sjekker selv hvilke felt som endret — enklere å resonere om enn å stole på trigger-kolonne-filteret).

---

## 4. Test (pgTAP, speiler `scores_write_rls_test.sql`)

Ny fil `supabase/tests/game_players_update_rls_test.sql` + utvidelse av fixtures med `try_self_approve`/`try_set_handicap`/`try_peer_approve`-prober i `torny_rls`-skjemaet (gjenbruker `seed_active_game`, `as_user`, `as_service`).

Asserts (forbudt → REJECTED, lovlig → PASS):

1. ❌ ikke-admin spiller kan IKKE sette `approved_at` på egen rad (selv-godkjenning).
2. ❌ ikke-admin spiller kan IKKE sette `approved_by_user_id` på egen rad.
3. ❌ ikke-admin spiller kan IKKE endre `course_handicap` på egen rad i et aktivt spill.
4. ✅ ikke-admin spiller KAN sette `submitted_at` på egen rad (`submitScorecard`-stien).
5. ✅ ikke-admin spiller KAN godkjenne en FLIGHT-KOMPIS' rad (`approved_at` på annens rad — peer-godkjenning).
6. ✅ admin KAN sette `course_handicap` på en spillers rad (admin-handicap-just.).
7. ✅ admin KAN godkjenne hvilken som helst rad.
8. Negativ kontroll: `service_role` (seeding) bypasser triggeren (sanity — beviser at `authenticated`-assertene er ekte).

Triggeren må ikke endre `scores_write_rls_test.sql`-resultatet (de 19 assertene står).

---

## 5. Suksesskriterier

- [ ] Migrasjon `supabase/migrations/0103_block_self_approval_and_handicap_edits.sql` lager `BEFORE UPDATE`-trigger på `game_players` per matrisen i §3.
- [ ] Triggeren er `SECURITY DEFINER`, no-op-er for `is_admin()` + `service_role`, og rammer kun de to forbudte selv-mutasjonene.
- [ ] Lovlige stier intakte: submit (egen `submitted_at`), peer-approve (annens `approved_at`), admin-handicap, pre-start self-handicap, service-role-skrivinger.
- [ ] Ny pgTAP-test `game_players_update_rls_test.sql` med de 8 assertene over; fixtures utvidet med game_players-update-prober.
- [ ] `npx tsc --noEmit` grønn (ingen TS rørt, men gate kjøres).
- [ ] Versjon bumpet `1.132.11 → 1.132.12`; CHANGELOG-oppføring under åpen tema `## 1.132.y — Småfunn fra modus-gjennomgangen` (tagline om integritet/rettferdighet, ikke skummel sjargong) + `<details>`-Teknisk.
- [ ] Atomiske commits, `Refs #670` i body; migrasjon-commit har `fix(rls):`-prefiks.
- [ ] PR åpnet mot `main`, `Closes #670`, med eksplisitt note: **migrasjon 0103 IKKE applisert til prod** — orchestrator applikerer via Supabase MCP etter review.

## 6. Gates (kjøres før done)

- `npx tsc --noEmit` — kjøres her.
- pgTAP `game_players_update_rls_test.sql` — krever lokal Postgres/Supabase CLi. I fersk worktree finnes det sannsynligvis ikke → testen er **skrevet, men må kjøres av orchestrator via Supabase MCP** mot en branch/prod. Ikke fabrikér en pass.

## 7. Avgrensninger

- Triggeren gater IKKE `flight_number`/`team_number`/`withdrawn_at`/`accepted_at` selv-skriving — de har egne lovlige selv-skrive-stier (flight-join, signup) og er utenfor #670-scope. Issue-et nevner dem som «kan skrives», men de to integritets-kritiske er `approved_*` og `course_handicap`; resten er adferds-nøytrale eller har egne policy-gater.
- `scores`-tabellen har INGEN approved/submitted/locked-kolonner — hele scorekort-livssyklusen ligger på `game_players`. «Selv-godkjenne eget scorekort» = `approved_at` på egen `game_players`-rad. Fiksen er korrekt scopet til `game_players`.
