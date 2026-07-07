# Spec: Rut admin-invite rate-limit via service-role, revoke authenticated på consume_admin_rate_limit

**Issue:** #1131 · **Branch:** claude/1131-rut-admin-invite-rate-limit-via-service-role

## Problem

`consume_admin_rate_limit(text,integer,integer)` beholder i dag `authenticated`-EXECUTE
(baselinet under #1121, migrasjon `supabase/migrations/0137_harden_prod_vakt_advisories.sql:78`,
kommentar linje 66–76). Grunnen: admin-invite-rate-limiteren
(`lib/admin/rateLimit.ts:48,53`) kaller RPC-en via den innloggede adminens **egen**
klient (`supabase`-parameteren sendes inn fra `app/[locale]/admin/spillere/actions.ts:58–62`
og `:113–117`), ikke via service-role. Login- og self-reg-limiterne kaller den derimot
allerede via `getAdminClient()` (`lib/auth/loginRateLimit.ts:50,54,59` og
`lib/auth/registrationRateLimit.ts:62,66,71,76`).

Konsekvens (pre-eksisterende, ikke innført av #1121): enhver innlogget bruker kan kalle
RPC-en med vilkårlig `p_bucket`. Bucket-nøklene inneholder IDer (`selfreg:user:<id>`,
`invite-admin:<id>`), så en angriper som kjenner en annens ID kan mette offerets bucket og
fail-close-e legitime handlinger (griefing). Fiksen er å rute admin-invite-limiteren
gjennom service-role-klienten, akkurat som de to andre limiterne, og deretter revoke
`authenticated`-EXECUTE helt.

Verifisert mot live prod-katalog (read-only, 2026-07-07):
ACL = `{postgres=X/postgres, service_role=X/postgres, authenticated=X/postgres}`.
`service_role` har en **egen eksplisitt** EXECUTE-grant (fra Supabase default privileges),
så en `revoke ... from authenticated` lar service-role-kallet (og login/self-reg) stå
urørt — post-state blir `{postgres=X, service_role=X}`.

## Design

1. **Rut limiteren via service-role** — `lib/admin/rateLimit.ts`.
   - Dropp `supabase`-feltet fra `consumeAdminInviteRateLimit`-opts (linje 27). Importer og
     kall `getAdminClient()` internt (`import { getAdminClient } from '@/lib/supabase/admin';`),
     mønster identisk med `lib/auth/loginRateLimit.ts:50`. Bytt `supabase.rpc(...)` (linje 48,53)
     til `admin.rpc(...)`.
   - Fjern de nå-ubrukte type-importene `SupabaseClient` (linje 3) og `Database` (linje 4) —
     de refereres kun av `supabase`-feltet på linje 27. Uten dette feiler `npm run lint` på
     `no-unused-vars`. (`loginRateLimit.ts`/`registrationRateLimit.ts` importerer ingen av dem.)
   - Oppdater JSDoc-en (linje 6–25): fjern «via the signed-in admin's own client»-premisset;
     forklar at kallet nå går via service-role (samme begrunnelse som `loginRateLimit.ts:12–16`:
     bucket-nøkkelen er eneste angriper-påvirkede input og behandles som opak tekst av RPC-en).
   - Behold fail-open-semantikken (returner `true` ved RPC-feil/kast) uendret — dokumentert
     i JSDoc linje 21–24.

2. **Fjern `supabase`-argumentet på begge call-sites** — `app/[locale]/admin/spillere/actions.ts`.
   - `sendInvitation`: fjern `supabase,` i `consumeAdminInviteRateLimit`-kallet (linje 59).
   - `resendInvitation`: fjern `supabase,` i kallet (linje 114).
   - `supabase` fra `loadAdminContext()` brukes fortsatt til `email_is_invited`,
     `invitations`-insert og resend-select, så importen/destruktureringen består. Ingen ubrukt
     variabel oppstår — verifiser med `npm run lint`.

3. **Oppdater co-located unit-test** — `lib/admin/rateLimit.test.ts` (T5: signaturendring på
   symbol med test → oppdater i samme PR, ikke ny test).
   - Erstatt `makeSupabase`-helperen (som injiserer en fake `supabase`) med mocking av
     `@/lib/supabase/admin` etter mønsteret i `lib/auth/loginRateLimit.test.ts:9–13`
     (`vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ rpc: rpcMock }) }))`).
   - Fjern `supabase`-argumentet fra alle fem `consumeAdminInviteRateLimit(...)`-kallene.
     Behold assertion-innholdet (begge buckets parallelt, block ved uttømt admin/ip-bucket,
     fail-open ved RPC-error, custom limits/window). Bruk `beforeEach(() => vi.clearAllMocks())`.

4. **Ny migrasjon** — `supabase/migrations/0138_revoke_authenticated_consume_admin_rate_limit.sql`
   (neste løpenummer; siste er 0137). Én DDL-setning + forklarende kommentar-header som
   refererer #1131 og at admin-invite-limiteren nå er service-role-rutet:
   ```sql
   revoke execute on function public.consume_admin_rate_limit(text, integer, integer) from authenticated;
   ```
   - **Rekkefølge (T3):** hovedchatten påfører staging (`snwmueecmfqqdurxedxv`) via Supabase MCP
     FØRST, verifiserer, DERETTER prod (`glofubopddkjhymcbaph`) — prod KUN etter eksplisitt
     eier-godkjenning i økten (prod-brannmuren: `touch .claude/approve-prod`).
   - **Verifiserings-SELECT** (kjør på staging etter apply, forvent auth=false, svc=true, anon=false):
     ```sql
     select
       has_function_privilege('authenticated','public.consume_admin_rate_limit(text,integer,integer)','EXECUTE') as auth_exec,
       has_function_privilege('service_role','public.consume_admin_rate_limit(text,integer,integer)','EXECUTE') as svc_exec,
       has_function_privilege('anon','public.consume_admin_rate_limit(text,integer,integer)','EXECUTE') as anon_exec;
     ```
     `EXPECT: auth_exec=false, svc_exec=true, anon_exec=false`. (DDL/REVOKE, ikke data-skriv —
     0-rad-skriv-fella er ikke relevant; `has_function_privilege` er positiv bekreftelse på ACL.)

5. **Oppdater pgTAP-assertion** — `supabase/tests/prod_vakt_hardening_1121_test.sql:75–81`.
   Assertion-en «anon-revoked, authenticated kept» (linje 79–81) stemmer ikke lenger etter 0138.
   Flip til at `authenticated` NÅ er revoked (`not has_function_privilege('authenticated', ...)`)
   og oppdater kommentaren (linje 75–78) til at admin-invite-limiteren nå går via service-role
   (ref #1131). La service_role-assertion (linje 82–83) stå — den er fortsatt sann.

6. **Fjern baseline-nøkkelen** — `docs/loops/prod-vakta-baseline.txt`.
   Slett nøkkel-linjen 63
   (`authenticated_security_definer_function_executable_public_consume_admin_rate_limit_...`)
   og oppdater kommentaren linje 59–62 til at limiteren nå er service-role-rutet (#1131), så
   advisoren ikke lenger er et bevisst-beholdt unntak. Behold resten av fila urørt.

7. **PR** — commits med `Refs #1131` i body; PR-body `Closes #1131`. Se Key Decisions for
   commit-prefiks/versjonering. Staging-verifiser (steg 4 + invite-flyt-røyktest) FØR merge.

## Edge Cases & Guardrails

- **service_role må overleve revoke.** Bekreftet via live-katalog: service_role har egen
  eksplisitt grant, ikke arvet via PUBLIC (PUBLIC ble fjernet i 0137). Verifiserings-SELECT
  i steg 4 er guarden — hvis `svc_exec` blir `false` etter apply, STOPP (da ville login og
  self-reg også vært brutt) og gå til T8.
- **Fail-open bevares.** Etter endringen kaller limiteren service-role. Ved RPC-feil returneres
  fortsatt `true` (invite-flyten fail-opens rate-limiten heller enn å låse admin ute) — uendret
  oppførsel, kun klient-rollen byttes.
- **Ingen ny env-avhengighet i test.** `getAdminClient()` kaster hvis
  `SUPABASE_SERVICE_ROLE_KEY` mangler; derfor MÅ testen mocke `@/lib/supabase/admin` (steg 3),
  ellers feiler suiten i CI der nøkkelen ikke er satt.

## Key Decisions

- **Ikke bruker-synlig → ingen version-bump, ingen CHANGELOG.** Admin-invite-flyten oppfører seg
  identisk (rate-limiten gjelder fortsatt); kun DB-grant og intern klient-rolle endres. Bruk et
  ikke-bumpende commit-prefiks (`refactor(security)` eller `chore(security)`) som passerer
  `commit-msg`-hooken fritt. Unngå `feat/fix/perf` (de tvinger bump).
- **Migrasjonen påføres av hovedchatten, ikke bygger-subagenten.** Bygger skriver `.sql`-fila,
  oppdaterer test + baseline + kode; selve staging/prod-applyen (og prod-brannmur-luken) er en
  hovedchat-/eier-styrt operasjon.

**Claude's Discretion:** eksakt ordlyd i migrasjons-header og JSDoc-oppdateringer; om
`rateLimit.test.ts` beholder en lokal `makeCalls`-oppsamler eller inspiserer `rpcMock.mock.calls`
direkte; presis commit-prefiks blant de ikke-bumpende alternativene.

## Success Criteria

- [ ] `consumeAdminInviteRateLimit` kaller RPC-en via `getAdminClient()`; `opts` har ikke lenger
      et `supabase`-felt.
- [ ] Begge call-sites i `app/[locale]/admin/spillere/actions.ts` sender ikke lenger `supabase`;
      ingen ubrukt variabel/import.
- [ ] `lib/admin/rateLimit.test.ts` mocker `@/lib/supabase/admin` og passerer med den nye
      signaturen (alle fem cases beholdt).
- [ ] Migrasjon `0138_*.sql` revoker `authenticated`-EXECUTE; verifiserings-SELECT på staging gir
      `auth_exec=false, svc_exec=true, anon_exec=false`.
- [ ] pgTAP-assertion i `prod_vakt_hardening_1121_test.sql` reflekterer at `authenticated` nå er
      revoked (og service_role fortsatt har EXECUTE).
- [ ] Baseline-nøkkelen for `consume_admin_rate_limit` er fjernet fra
      `docs/loops/prod-vakta-baseline.txt` med oppdatert kommentar.
- [ ] Admin-invite-flyten fungerer ende-til-ende på staging etter at migrasjonen er påført der
      (invitasjon sendes; rate-limit slår fortsatt inn ved burst).

## Gates

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npx vitest run lib/admin/rateLimit.test.ts`
- [ ] Staging: påfør 0138 via MCP + kjør verifiserings-SELECT (steg 4) → forvent
      `auth=false/svc=true/anon=false`
- [ ] Staging-verify av admin-invite-flyten (e2e `e2e/auth/invitation-flow.spec.ts` /
      `e2e/admin/spillere.spec.ts`, eller manuell klikkrunde) FØR merge

## Files Likely Touched

- `lib/admin/rateLimit.ts` — kall via service-role, dropp `supabase`-param, JSDoc
- `app/[locale]/admin/spillere/actions.ts` — fjern `supabase`-arg på to call-sites
- `lib/admin/rateLimit.test.ts` — mock `getAdminClient`, ny signatur
- `supabase/migrations/0138_revoke_authenticated_consume_admin_rate_limit.sql` — ny migrasjon
- `supabase/tests/prod_vakt_hardening_1121_test.sql` — flip authenticated-assertion
- `docs/loops/prod-vakta-baseline.txt` — fjern baselinet nøkkel + oppdater kommentar

## Out of Scope

- Endre login-/self-reg-limiterne (`lib/auth/loginRateLimit.ts`,
  `registrationRateLimit.ts`) — de bruker allerede service-role.
- Endre selve `consume_admin_rate_limit`-funksjonskroppen, bucket-nøkkel-formatet eller
  rate-limit-defaults (0026) — kun EXECUTE-grant og kaller-rolle røres.
- Bredere revoke-sweep av andre baselinede advisory-nøkler — separat oppfølging.
- prod_vakt-baseline-formatet eller `docs/loops/prod-vakta.md` — kun én nøkkel fjernes.
