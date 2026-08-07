# Verdikt: ACCEPT

Uavhengig verifisert 2026-08-07 mot branch `claude/auto-1489-3bdbdb` (PR #1493, issue #1489). Alle avkryssinger etterprøvd — ingen avvik funnet. Ingen DB-skriv utført; staging-kriteriet vurdert mot PR-bevis per instruks.

## Success Criteria

1. **Type A-tester (gruppering/ekspansjon + GIR-utfolding)** — PASS
   `lib/cup/sideAwardRows.test.ts` (14 it/it.each-blokker: grenser `hole 0/19`, `points 0/-1`, `winnerCount 10`, ugyldig kind, desimal `points:1.5` linje 21) + GIR-fold i `getCupSnapshot.test.ts:293` («ctp-slots får slotCount, GIR foldes til lag-innslag med desimalpoeng»).

2. **saveSideAwardConfig-tester (ny input-type + utvidet registrert-gate)** — PASS
   `sideAwardActions.test.ts:75` (ekspandert insert-assertion: slot 1..2 + gir slot 1, linje 104–106), `:231` (gir-teller blokkerer re-konfig → `winners_already_registered`), `:258` (rollback tar med slot- + gir-kolonner).

3. **registerGirCounts-tester** — PASS
   `describe` `sideAwardActions.test.ts:408`: happy path (`:409`, `{gir_team1_count:2, gir_team2_count:0}`), counts>maks avvist (`:445`), ctp/ld-rad avvist → `not_found` (`:466`), 0-rader → `save_failed` (`:491`). Authz-gaten (`requireAdminOrClubAdminOfCup`) kalt i happy path.

4. **Snapshot slotCount + GIR-fold; computeCupLeaderboard UENDRET** — PASS
   `getCupSnapshot.test.ts:288–293`. `git diff origin/main...HEAD -- lib/cup/computeCupLeaderboard.ts` = KUN `kind: 'ctp'|'ld'` → `'ctp'|'ld'|'gir'` + docblock. Motoren rørt = 0 linjer.

5. **Panel: maks ÉN ny render-test (Type C)** — PASS
   `SideAwardsPanel.test.tsx`: 2 eksisterende tester oppdatert (props-refaktor + slot/gir-felter), ÉN ny test «slots + gir (#1489)» (linje ~88). Ingen tredje render-test.

6. **i18n begge locales + omformulert duplicate** — PASS
   `messages/no.json` + `en.json`: 8 nye nøkler (`kindGir`, `winnersColumnLabel`, `winnersHelp`, `winnerCountSuffix`, `girMaxSuffix`, `slotOfCount`, `girTeamCountLabel`, `girRegistered`) + `errors.invalidCounts` + omformulert `errors.duplicate` (peker nå på «Vinnere»-feltet). Identiske nøkkelsett i begge.

7. **Migrasjon 0156 på staging, typer fra staging, prod urørt** — PASS (via PR-bevis)
   `supabase/migrations/0156_side_awards_slots_and_gir.sql` er høyeste lokale migrasjon (etter 0155). `lib/database.types.ts`-diff har de 4 nye kolonnene (slot NOT NULL default, gir_* nullable) — konsistent med staging-regenerering. Ingen DB-skriv utført av evaluatoren; staging-anvendelse bekreftet av PR #1493-kommentarens SQL-orakel.

8. **package.json minor-bump + CHANGELOG** — PASS
   `1.224.0 → 1.225.0`; CHANGELOG «1.225 · Flere sidepoeng-vinnere og GIR» med issue-lenke + ↳-rute.

9. **Staging-klikkrunde med bevis + label** — PASS
   PR #1493-kommentar (jdlarssen, owner): tabell med tre orakler (struktur/feillogg/SQL) per akseptansepunkt, sum «Sidepoeng: 5–2» på offentlig side (2 + 2×1,5 = 5 mot 2), GIR-rad på **1,5 p** dekker Amendment-kravet, prod-ref bekreftet staging (`snwmueecmfqqdurxedxv`), testdata slettet. `staging-verified`-label BEKREFTET på PR (ikke draft, OPEN).

## Kontraktens spesialkrav

| Krav | Resultat | Bevis |
|---|---|---|
| computeCupLeaderboard uendret bortsett fra kind + docblock | PASS | diff = 5 linjer, kun union + kommentar |
| Duplikat config-nivå; DB-unique = (tid, kind, hole, slot) | PASS | `sideAwardActions.ts` seen-Set på `kind#hole`; migrasjon `unique (tournament_id, kind, hole_number, slot)` |
| winners_already_registered også ved gir-tellere ≠ null | PASS | `sideAwardActions.ts:113` `winner_user_id!==null \|\| gir_team1_count!==null \|\| gir_team2_count!==null` |
| registerSideAwardWinner avviser gir-rader | PASS | award-oppslag → `kind==='gir' → not_found` |
| registerGirCounts avviser ctp/ld + counts utenfor 0..maks | PASS | `award.kind!=='gir' → not_found`; `validCount` 0..max → `invalid_counts` |
| Rollback-insert tar med slot + gir-kolonner | PASS | `sideAwardActions.ts:149–152` (slot, gir_max_per_team, gir_team1/2_count) |
| Desimalpoeng (1,5) gyldig + bevart i ekspansjon | PASS | `isValidSideAward` krever `points>0` (ikke integer); `expandSideAwardConfig` sender `points` uendret; test linje 21/106 |
| Panel maks ÉN ny render-test | PASS | 2 oppdatert + 1 ny |

## Gates

- **vitest** (5 filer): `Test Files 5 passed (5) · Tests 78 passed (78)` — grønn.
- **npm run build**: fullført (full rute-tabell + PPR-legende skrevet — `next build` printer kun ved suksess). Ingen feil.
- **npm run lint**: `✖ 58 problems (0 errors, 58 warnings)`, exit 0. Alle 58 er pre-eksisterende complexity/max-depth-advarsler i urørte filer (league, mail, scoring, wizard, notifications) — ingen i #1489-berørte filer.

## Funn utenfor kriteriene (ikke-blokkerende)

- `CupManagement.tsx` (+2 props: `team1Name`/`team2Name`) og `cup/[id]/page.tsx` (+`data-testid="cup-side-award-points"`) er endret uten å stå i «Files Likely Touched». Begge er legitim wiring: panelet krever nå lagnavnene til GIR-teller-feltene, og test-id-en er akseptanse-orakelet staging-runden leser. Ikke scope-creep.
- `groupSideAwardRows`/snapshot bruker defensive `?? 1`-fallbacks på `maxPerTeam` — ufarlig gitt at DB-CHECK-en (0156) garanterer non-null `gir_max_per_team` for gir-rader.
