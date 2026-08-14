# Kontrakt: #1550 — Cup-deltakere kan åpne alle kamper i en ferdigspilt cup

**Issue:** [#1550](https://github.com/jdlarssen/golf-app/issues/1550)
**Branch:** `claude/1550-finished-cup-scores-rls`
**Type:** fix + migrasjon. **Authz-endring + prod-migrasjon → ALDRI auto-merge;
prod-påføring venter på eksplisitt eier-godkjenning (prod-brannmuren #1074).**

## Rotårsak (målt på staging i issuet)

`scores select gating per mode` krever i alle grener at leseren er `game_players` i
DEN kampen (eller eier scoren / same_flight). Finished-grenen:
`games.status='finished' AND EXISTS(game_players gp WHERE gp.user_id=auth.uid())`.
Ingen gren for «kampen hører til en ferdigspilt turnering jeg deltar i» → 9 av 12
lenker på cup-resultatsiden er blindveier for hver deltaker.

## Avgjørelser

- **D1 — policy-veien, ikke admin-klient i leaderboardContent** (issuets anbefaling;
  AGENTS.md felle 3: RLS er authz-laget).
- **D2 — SECURITY DEFINER-helper**, ikke inline EXISTS-kjede: repo-konvensjonen mot
  rekursjons-feller (CLAUDE.md §RLS). Ny funksjon
  `is_participant_of_finished_tournament(p_game_id uuid) returns boolean`:
  - `games.tournament_id` er ikke null
  - `tournaments.status = 'finished'` (verifiser eksakt status-verdi mot live skjema
    ved bygging — `tournaments.status` er text; sjekk faktiske verdier med SELECT DISTINCT)
  - `EXISTS (tournament_participants tp WHERE tp.tournament_id = g.tournament_id AND tp.user_id = auth.uid())`
  Hardening som #1121: `SET search_path = ''` (kvalifiser skjema eksplisitt),
  `STABLE`, eierskap/grants etter mønster fra eksisterende helpers (les en eksisterende
  SECURITY DEFINER-migrasjon først, f.eks. same_flight_or_solo sin).
- **D3 — additiv policy-gren:** utvid `scores select gating per mode` med
  `OR is_participant_of_finished_tournament(game_id)` — én migrasjon
  `supabase/migrations/016X_finished_tournament_scores_select.sql` (løpenummer etter
  #1595-migrasjonen; sjekk origin/main + åpne PR-er). NB: policy-endring krever
  DROP+CREATE av policyen — kopier den eksisterende qual-en NØYAKTIG fra live skjema
  (I1), legg kun til grenen.
- **D4 — utvider IKKE til:** aktive turneringer (spoiler-vernet i cup-presentasjonen
  består), folk utenfor cupen, liga (league-tabellene er egen modell, ikke i scope).
- **D5 — CLAUDE.md-setningen** om finished-synlighet er allerede rettet (#1542-notatet
  står i CLAUDE.md §RLS per HEAD) — ingen doc-endring nødvendig. Verifiser ved bygging;
  avvik → oppdater i samme PR.

## Suksesskriterier

- [x] **S1:** Migrasjon med helper + policy-gren finnes og er påført STAGING.
      **Evidens:** 0161 påført (bokført 20260814172210); Karl-caset: 36/0/0 →
      36/36/18, fremmed 0 (36 finnes), anon 0 uten permission-denied; evaluator
      maskindiffet policy-qual mot fila (fem gamle grener byte-identiske, én ny
      sist) og verifiserte prod urørt.
- [x] **S2:** pgTAP-test (#440-riggen), alle fire scenariene. **Evidens:**
      `scores_finished_tournament_select_rls_test.sql` (plan(12), SECURITY
      INVOKER-probe); `npm run test:rls` PASS 19 filer / 200 tester (builder OG
      evaluator); builder beviste load-bearing (pre-0161-revert flipper nøyaktig
      de to nye assertene). Spoiler-vernet i tillegg staging-simulert av evaluator
      (cup flippet active i transaksjon → 0 rader, helper false, rollback bekreftet).
- [x] **S3:** Ingen app-kode-endring. **KORRIGERT premiss (builder-bevist):**
      hoved-tavla var allerede kurert av #1542 (service-role for finished);
      flatene 0161 faktisk låser opp er «Hull for hull»-drilldownen
      (holes/holesData.ts, brukerens klient) og CSV-eksporten (export/route.ts).
      **Evidens:** kodelesing med fil:linje i builder-rapporten; staging-klikkrunden
      i S5 beviser drilldownen ende-til-ende.
- [x] **S4:** Gates. **Evidens:** `npm run build` exit 0 (pipefail) + test:rls PASS —
      builder og evaluator uavhengig (Node 22.23.0). Ingen .ts/.tsx endret → ingen
      vitest-suite gjelder (sjekket faktum, ikke unnskyldning).
- [x] **S5:** Staging-klikkrunde: logg inn som cup-deltaker, åpne ferdig kamp
      vedkommende IKKE spilte fra cup-resultatsiden → full tabell hull for hull.
      **Evidens:** Playwright 2026-08-14 som Karl (klonet cup): hoved-tavle OK for
      BB1/BB2/Greensome 2, og «Hull for hull»-drilldownen for BB2 + Greensome 2
      viser fulle per-hull-tabeller (skjermbilder; ~50 slag-sifre per side);
      prod-vakt grønn. Bevis-kommentar på PR + label.
- [x] **S6:** PR dokumenterer prod-gaten: migrasjonen IKKE påført prod; venter
      eier-godkjenning. **Evidens:** PR-body «⚠️ Prod-gate»-seksjon; evaluator
      verifiserte read-only at helper/gren ikke finnes i prod.

## Gates

- `npm run test:rls` (skip-forbeholdet gjelder), `npm run build`, Node 22.

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Cup-deltaker, ferdig cup, kamp han ikke spilte | Ser alle scores (ny) |
| Cup-deltaker, AKTIV cup, kamp han ikke spiller | 0 rader — uendret (spoiler-vern) |
| Fremmed bruker, ferdig cup | 0 rader — uendret |
| Kamp i ferdig cup der han SPILTE | Uendret (finished-grenen dekket allerede) |
| Vanlig spill uten tournament_id | Uendret (helper returnerer false) |
| Avledet kamp (source_game_id satt) i splittet cup-dag | Har egen games-rad med tournament_id? Verifiser ved bygging (I1); begge halvdeler skal være lesbare |
| Anonymisert/slettet deltaker i cupen | tp-raden borte → ingen tilgang via den brukeren; andre upåvirket |
| Turnering finished men enkeltkamp ikke finished (datadrift) | Grenen gater på turneringens status — kampen blir lesbar; akseptert (resultatsiden viser den allerede via service-role) |

## Ikke-mål

- Ingen endring i spectate-/public-flater (leser service-role allerede).
- Ingen liga-utvidelse.
- Ingen copy-endringer → ingen humanizer.
- Ingen prod-påføring i denne økten.

## Commit-disiplin

Atomiske commits med `Refs #1550`. Fix-commit trenger `.changes/1550-<slug>.md`
(type: fix).
