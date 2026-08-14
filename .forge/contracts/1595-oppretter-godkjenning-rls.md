# Kontrakt: #1595 — Ikke-deltakende oppretter kan ikke godkjenne scorekort (RLS SELECT-blindsone)

**Issue:** [#1595](https://github.com/jdlarssen/golf-app/issues/1595)
**Branch:** `claude/1595-creator-select-rls`
**Type:** fix + migrasjon. **Authz-endring → ALDRI auto-merge; prod-påføring venter på eksplisitt eier-godkjenning (prod-brannmuren #1074).**

## Rotårsak (issue-forfatterens RLS-simulering, re-verifisert mot staging i denne økten)

`game_players select shared game` = `is_admin() OR is_in_game(game_id)` — ingen
oppretter-gren. Postgres krever at rader en UPDATE leser også passerer SELECT-policy;
en ikke-deltakende oppretter ser 0 rader → `adminApproveScorecard`
(`app/[locale]/admin/games/[id]/actions.ts` ~165–215) treffer 0 rader uten feil →
`NoRowsAffectedError` tolkes som «allerede godkjent» → falsk suksess-redirect.

Samme blindsone rammer ALLE oppretter-UPDATEs på `game_players` via sesjonsklienten:
`reopenScorecard` (~347), `adminWithdrawPlayer` (~428), `adminUndoWithdraw` (~479),
`reopenGame` (~560). Policy-nivå-fiksen kurerer alle i ett hjem.

## Avgjørelser

- **D1 — fiks på policy-nivå, additiv.** Ny policy `game_players creator select`
  (SELECT, `to authenticated`). **KORRIGERT under bygging (2026-08-14):** kontraktens
  opprinnelige inline-EXISTS-qual utløste `42P17 infinite recursion` på staging —
  `games select if participant or admin` refererer `game_players` inline, så en
  game_players-SELECT-policy med inline games-referanse lukker syklusen og dreper
  ALLE autentiserte game_players-lesinger. Bevist live og rullet tilbake umiddelbart.
  Endelig qual: `public.is_game_creator_or_admin(game_id)` (eksisterende SECURITY
  DEFINER-helper, 0107-herdet) — samme intensjon, bryter syklusen. Additiv policy
  (OR-semantikk) — rører ikke eksisterende policy. Ingen informasjonslekkasje utover
  intensjon: oppretter-flatene viser allerede roster via service-role
  (`getGameWithPlayers`), dette gir RLS-paritet med UI-et. (Service-role-alternativet
  i issuet forkastes: flytter grensen ut av RLS, AGENTS.md felle 3.)
- **D2 — migrasjonsfil** `supabase/migrations/0160_game_players_creator_select.sql`
  (verifiser løpenummer mot origin/main ved bygging — 0159 er siste per 2026-08-14).
  Følg eksisterende migrasjonsstil; `(SELECT auth.uid())`-innpakning (perf-runden
  #412-414). Påføres STAGING via Supabase MCP i økten; PROD påføres IKKE i denne
  økten (dokumenteres i PR som eier-gate).
- **D3 — hardening i `adminApproveScorecard`:** i `NoRowsAffectedError`-catchen:
  re-les raden via admin-client; er `approved_at` fortsatt null (og raden finnes) →
  IKKE idempotent-suksess, men `?error=db_players`-redirect + `console.error`.
  Beskytter mot fremtidig RLS-drift (I3: fravær av feil ≠ suksess). Kun approve-
  actionen hardnes (issuets forslag); søsknene kureres av D1.
- **D4 — pgTAP-dekning** (#440-riggen): ny `supabase/tests/game_players_creator_select_rls_test.sql`
  etter mønster fra `game_players_update_rls_test.sql`: (a) ikke-deltakende oppretter
  SELECT-er eget spills rader (>0), (b) fremmed bruker ser 0, (c) ikke-deltakende
  oppretters UPDATE (approve-formen) treffer 1 rad etter fiksen.
  `npm run test:rls` — NB: exit 0 med skip-banner teller IKKE som kjørt; mangler
  CLI → skriv `VERIFICATION GAP: test:rls not run`.

## Suksesskriterier

- [x] **S1:** Migrasjonsfil finnes og er påført STAGING; RLS-simulering på staging
      (SET ROLE authenticated + jwt-claims for ikke-deltakende oppretter) viser
      SELECT count > 0 og approve-UPDATE → 1 rad. **Evidens:** 0160 påført staging
      (etter 42P17-korreksjonen, se D1); simulering før: 0/0 rader — etter: 1 synlig
      rad, UPDATE → 1 rad (rullet tilbake); fremmed ser 0; global game_players-lesing
      uten rekursjon (39 rader). Evaluator re-verifiserte policy-dump == fil, alle 9
      gamle policyer uendret, prod har IKKE policyen.
- [x] **S2:** pgTAP-testfil per D4. **Evidens:**
      `supabase/tests/game_players_creator_select_rls_test.sql` (plan(7));
      `npm run test:rls` kjørt REELT av evaluator (Docker + lokal stack):
      PASS 19 filer / 195 tester. Ingen VERIFICATION GAP.
- [x] **S3:** Hardening per D3 i `adminApproveScorecard`. **Evidens:** actions.ts:204–245
      (re-les via admin-client; pending/readError → `?error=db_players` + console.error;
      borte/godkjent → idempotent suksess); co-located rigg fantes og er utvidet —
      actions.test.ts 24/24 grønne, nytt case pinner pending-grenen for oppretter-ruta.
- [x] **S4:** Gates: `npx vitest run` for endrede filer med co-located tester +
      `npm run build`. **Evidens:** vitest 24/24, `npm run build` pipefail exit 0,
      weekly-release dry-run validerer notatfila — kjørt av builder OG re-kjørt av
      evaluator (Node 22.23.0).
- [x] **S5:** Staging-klikkrunde: ikke-admin bruker oppretter spill der de selv IKKE
      deltar (deltaker = den andre e2e-brukeren), deltaker leverer, oppretter
      godkjenner via /games/[id]/spillere → suksess OG `approved_at` faktisk satt
      (verifisert med SQL mot staging). **Evidens:** Playwright 2026-08-14 (spill
      bbbbbbbb-1595-…): oppretter e2eplayer (ikke-admin, ikke-deltaker) fant
      godkjenn-knappen, klikket, `approved_at=16:37:47Z` +
      `approved_by_user_id=252e1a6f` skrevet; prod-vakt grønn. (Rigg-læring: knappen
      krever `require_peer_approval=true` + `.next`-cachen må tømmes etter
      REST-rigging — gwp-cachen overlever server-restart på disk.)
- [x] **S6:** PR dokumenterer prod-gaten eksplisitt: migrasjonen er IKKE påført prod;
      påføring krever eier-godkjenning i økt (approve-prod-sentinel).
      **Evidens:** PR #1627 body-seksjonen «⚠️ Prod-gate (aldri auto-merge)» +
      bevis-kommentar; evaluator verifiserte read-only at policyen ikke finnes i prod.

## Gates

- `npx vitest run` for endrede filer med co-located tester + `npm run build`.
- `npm run test:rls` (med skip-forbeholdet over).
- Node 22 først.

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Oppretter er også deltaker | Uendret (is_in_game-grenen dekket allerede) |
| Oppretter ikke deltaker, eget spill | SELECT ok, approve skriver 1 rad (ny) |
| Fremmed (verken deltaker/oppretter/admin) | 0 rader — uendret |
| Admin | is_admin()-escape — uendret |
| Approve på allerede godkjent scorekort | 0 rader → re-les viser approved_at satt → idempotent suksess (uendret semantikk) |
| Approve der RLS blokkerer (fremtidig drift) | re-les viser approved_at null → feil-redirect (ny) |
| Slettet/anonymisert oppretter | created_by peker på død bruker → ingen auth.uid()-match → ingen endring |
| Tomt spill / ikke-eksisterende rad | NoRowsAffected → re-les finner ingen rad → idempotent-redirect som i dag |

## Ikke-mål

- Ingen endring i reject/withdraw/reopen-actions (kureres av policyen).
- Ingen nye bruker-synlige tekster (gjenbruk `?error=db_players`) → ingen humanizer.
- Ingen prod-påføring i denne økten.

## Commit-disiplin

Atomiske commits med `Refs #1595`. Fix-commit trenger `.changes/1595-<slug>.md`
(type: fix — bruker-synlig: godkjenningen virker nå). Migrasjonsfil + pgTAP i egen
commit er OK.
