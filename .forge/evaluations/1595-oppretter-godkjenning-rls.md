# Evaluering: #1595 — oppretter-godkjenning RLS (runde 1)

## VERDIKT: ACCEPT

Bygget oppfyller S1–S4 med uavhengig re-verifisert evidens. S5 (staging-klikkrunde
med bevis på PR + label) og S6 (PR-body dokumenterer prod-gaten) er **utestående
og blokkerer merge** — men følger repo-presedens (#1444, #1577: runde-1-ACCEPT,
staging-kriterium grønnes etter PR-opprettelse). PR eksisterer ikke ennå for
branchen. Authz-endring → aldri auto-merge; prod-påføring venter eier-godkjenning.

## Kriterier

### S1 — migrasjon påført staging ✅ (re-verifisert uavhengig)

- `supabase/migrations/0160_game_players_creator_select.sql` finnes; nummer 0160 er
  korrekt neste etter origin/main sin 0159.
- Staging (`snwmueecmfqqdurxedxv`) `pg_policy`-dump: `game_players creator select`
  (SELECT, `to authenticated`, permissive) med qual `is_game_creator_or_admin(game_id)`
  — nøyaktig migrasjonsfilas form (pg normaliserer bort `public.`-prefikset).
  Policy-kommentaren fra fila er også påført. Alle 9 øvrige game_players-policyer
  står uendret med forventet form (shared-select `is_admin() OR is_in_game(game_id)`,
  creator insert/update/delete med inline EXISTS, peer approve, self-policyene).
- Helper verifisert på staging: `is_game_creator_or_admin` er SECURITY DEFINER,
  STABLE, `SET search_path TO 'public'` (0107-herdet).
- **Simuleringer (begin/rollback, staging):**
  - Oppretter (252e1a6f…, is_admin=false, ikke deltaker) mot QA-spill
    `bbbbbbbb-1595-…01`: `count(*)` over HELE game_players = 39 **uten 42P17**
    (rekursjons-regresjonen fra inline-EXISTS-varianten er borte); QA-spillets
    rader = 1. ✅
  - Fremmed (90d03be8…, verken deltaker/oppretter/admin): QA-spillets rader = **0**
    — additiv policy har ikke utvidet noe. ✅
  - Oppretters approve-formede UPDATE (samme filtre som actionen) → **1 rad**
    returnert; rullet tilbake, `approved_at` bekreftet fortsatt null etterpå. ✅
- Prod (`glofubopddkjhymcbaph`) sjekket read-only: policyen finnes IKKE der —
  prod-gaten står, som kontrakten krever.

### S2 — pgTAP-dekning ✅ (kjørt grønt, ingen VERIFICATION GAP)

- `supabase/tests/game_players_creator_select_rls_test.sql`: plan(7), riktig rigg
  (`\ir fixtures/rls_helpers.psql`, seed_active_game + created_by→outsider,
  withdrawn-raden slettet som fremmed-kontroll). Dekker (a) oppretter ser rader
  OG eksakt full roster (4), (b) fremmed 0 rader + 0-rads approve — assertert FØR
  oppretterens approve så kontrollen er reell, (c) approve-UPDATE → TRUE + service-
  role-readback av `approved_at`. Probens filtre speiler actionens UPDATE-form.
- `npm run test:rls` kjørt reelt: **All tests successful. Files=19, Tests=195 —
  Result: PASS** (inkluderer den nye fila). NB: første kjøring ga masse-rødt pga.
  stale lokalt Docker-volum (gammel skjema-tilstand, ingen schema_migrations);
  `supabase db reset` løste det — miljøstøy, ikke branch-feil.

### S3 — hardening i adminApproveScorecard ✅

- `app/[locale]/admin/games/[id]/actions.ts:204–245`: i NoRowsAffectedError-catchen
  re-leses raden via `getAdminClient()` (RLS-fri). `readError` ELLER
  `approved_at === null` → `console.error` + `?error=db_players`-redirect; rad
  borte (`playerRow` null → `undefined === null` er false) eller allerede godkjent
  → idempotent suksess som før. Matcher D3 og edge-case-tabellen punkt for punkt.
- Co-located tester meningsfulle: eksisterende idempotent-case utvidet med
  re-read-mock (`approved_at` satt), ny case pinner pending-grenen
  (`?error=db_players`, ingen notify/audit-log). Mock-riggen leser
  `adminSupabaseMock` ved kall-tid, så per-test-reassignment virker.

### S4 — gates ✅ (re-kjørt selv, Node 22.23.0)

- `npx vitest run "app/[locale]/admin/games/[id]/actions.test.ts"` → **24/24 passed**.
- `npm run build` (pipefail) → exit 0, full rute-tabell.
- `node scripts/weekly-release.mjs --dry-run` → notatet `1595-godkjenn-som-arrangor.md`
  validerer og folder til korrekt CHANGELOG-linje, exit 0.

### S5 — staging-klikkrunde ⏳ UTESTÅENDE (blokkerer merge, ikke runde-verdiktet)

QA-spillet er rigget klart på staging (ikke-admin oppretter utenfor roster, én
levert ugodkjent deltaker-rad) men `approved_at` er fortsatt null → UI-runden er
ikke kjørt. Ingen PR finnes (`gh pr list --head claude/1595-creator-select-rls`
tom), så bevis-kommentar + `staging-verified`-label kan ikke finnes ennå.

### S6 — PR dokumenterer prod-gaten ⏳ UTESTÅENDE (samme årsak: ingen PR ennå)

## Scope / disiplin

- Branch-diff (merge-base `49985cc5`): 6 filer, alle sporbare til #1595 (kontrakt,
  notat, migrasjon, pgTAP, actions.ts + test). Ingen scope-lekkasje.
- Alle 4 commits har `Refs #1595`; `[no-changelog]` korrekt på de to commitene
  uten eget notat; notatet ligger i migrasjonscommiten 8851d3da.
- D1-korreksjonen (inline EXISTS → definer-helper etter 42P17) er dokumentert i
  kontrakt, migrasjonskommentar OG policy-kommentar i basen — én historie, tre hjem
  som stemmer overens.

## Funn

| # | Signatur | Alvorlighet | Vurdering |
|---|---|---|---|
| F1 | PR mangler — S5/S6 | Blokkerende FØR merge | Hovedchatten må opprette PR (med prod-gate-tekst + Fordeler/ulemper-blokk), kjøre staging-klikkrunden og sette label. Aldri auto-merge (authz). |
| F2 | `supabase/tests/README.md` + lokal rigg — stale-volum-felle | Ikke-blokkerende | `supabase start` gjenbruker gammelt volum uten å re-påføre migrasjoner → `test:rls` masse-rødt som ser ekte ut. `supabase db reset` er kuren; README nevner det ikke. Kandidat til egen issue/README-linje. |
| F3 | Sikkerhetsvurdering av admin-grenen i helperen | Ingen funn | `is_game_creator_or_admin` sin admin-halvdel dupliserer `is_admin()`-grenen som allerede står i shared-policyen — harmløs OR, ingen ny eksponering. Ny policy er `to authenticated` (snevrere enn shared-policyens `{-}`/public). |

## Rå gate-resultater

- vitest actions.test.ts: 24 passed / 0 failed
- npm run build: exit 0
- npm run test:rls: PASS (19 filer, 195 tester) — etter `supabase db reset`
- weekly-release dry-run: exit 0
- Staging-simuleringer: oppretter 1 rad lest / 1 rad approve-UPDATE (rollback holdt), fremmed 0 rader, ingen 42P17
- Prod: policy fraværende (som påkrevd)
