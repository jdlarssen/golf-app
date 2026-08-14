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

- [ ] **S1:** Migrasjon med helper + policy-gren finnes og er påført STAGING.
      RLS-simulering på staging mot klonet cup (`scripts/clone-cup-to-staging.mjs`,
      default Ryder Cup 2026): Karl-caset fra issuet — deltaker ser nå scores i
      Best ball 2 / Greensome 2 (>0 rader), fremmed bruker ser fortsatt 0.
      **Evidens:** SQL-output før/etter.
- [ ] **S2:** pgTAP-test (#440-riggen): (a) cup-deltaker leser scores i ferdig kamp
      han ikke spilte, (b) fremmed ser 0, (c) AKTIV turnering: deltaker ser IKKE
      andre kampers scores (spoiler-vern), (d) kamp uten tournament_id: uendret
      oppførsel. **Evidens:** fil + `npm run test:rls`-output eller
      `VERIFICATION GAP`-linje.
- [ ] **S3:** Ingen app-kode-endring nødvendig for hovedflyten (kamp-leaderboardet
      leser med brukerens klient og får nå rader) — verifiser at tom-tilstanden
      «Matchen er ikke startet ennå» forsvinner av seg selv på staging. Krever
      flyten likevel kode-endring: dokumentér avviket. **Evidens:**
      staging-klikkrunde.
- [ ] **S4:** Gates: `npm run build` + vitest for evt. endrede filer. **Evidens:** output.
- [ ] **S5:** Staging-klikkrunde: logg inn som cup-deltaker, åpne ferdig kamp
      vedkommende IKKE spilte fra cup-resultatsiden → full tabell hull for hull.
      **Evidens:** bevis-kommentar på PR + label.
- [ ] **S6:** PR dokumenterer prod-gaten: migrasjonen IKKE påført prod; venter
      eier-godkjenning.

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
