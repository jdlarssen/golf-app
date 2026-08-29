# Kontrakt: #1802 — diagnose av «discord:merge-kort uten sporbar kort» på PR #1791

**Issue:** [#1802](https://github.com/jdlarssen/golf-app/issues/1802)
**Branch:** `claude/forge-auto-1802-72cf11`
**Type:** diagnose/false-alarm-avklaring (ingen kodefiks)

## Bakgrunn

CI-vakta fant at PR #1791 bar `discord:merge-kort`-labelen uten at noen
`discord-pr-card`-kjøring for head-SHA `cbb1ff1a` kunne spores til et postet kort.
Kontrakt-smeden klassifiserte issuet som gråsone: utfallet avhang av
issue-timelinen (hvem satte labelen?), som smeden ikke hadde tilgang til.

ASSUMPTION (autonom økt, jf. I6): smedens beslutningstre var «eier-handling →
lukk» / «automasjonsbug → egen fix-kontrakt». Undersøkelsen ga et tredje utfall —
automasjonen virket korrekt, rapporten var falsk alarm pga. søkemetoden — så
fix-kontrakt er uaktuelt. Denne kontrakten dekker diagnosen + forebyggende
docs-notat, uten interaktiv gråsone-diskusjon (gråsonene ble avgjort av evidens).

## Funn (evidens)

1. Labelen ble satt av `github-actions[bot]` 2026-08-29T22:04:08Z
   (issue-timeline for PR #1791, `labeled`-event).
2. Relé-kjøringen [33277571345](https://github.com/jdlarssen/golf-app/actions/runs/33277571345)
   (`workflow_run`, opprettet 22:02:25 da CI-run 33277292275 for `cbb1ff1a`
   fullførte grønt 22:02:23) logget:
   - `[decide-pr-card] PR #1791: outcome=card (endrer fil på aldri-lista), isGui=true (45 filer).`
   - `[post-pr-card] PR #1791: knapp-kort postet (0 skjermbilde(r)).` (22:04:09)
   Rekkefølgen matcher koden: post først, label etterpå.
3. Den kansellerte kjøringen 33277312485 (21:56:02–22:02:43, jobb ferdig
   22:02:41) var det dokumenterte #1572-stafettbyttet — relékjøringen tok over,
   som designet. (Issue-teksten oppga 22:02:38; runs-API-et er fasit.)
4. Hvorfor rapportøren bommet: `workflow_run`-utløste kjøringer listes under
   **main** sin head-SHA (`48aa2177` = main HEAD da, verifisert med
   `gh api .../runs/33277571345` → `head_branch: main`), ikke PR-ens SHA. Søk
   på `cbb1ff1a` finner dem derfor aldri.
5. PR #1791 ble merget av eieren 22:30:36 — kortflyten fullførte hele veien.

## Success Criteria

- [x] Labelens opphav er identifisert med timeline-evidens (aktør + tidsstempel)
      — Funn 1: `github-actions[bot]` @ 22:04:08Z, `gh api repos/jdlarssen/golf-app/issues/1791/timeline`.
- [x] Kjøringen som postet kortet er identifisert, med logglinjer som viser både
      decide-utfall og post — Funn 2: run 33277571345, begge logglinjer sitert over.
- [x] SHA-forklaringen (hvorfor søket bommet) er verifisert mot runs-API-et —
      Funn 4: `head_branch: main`, `head_sha: 48aa2177` = main HEAD (`git log -1 48aa2177`).
- [x] Forebyggende notat i `docs/loops/discord-pr-kort.md` («Dedup & race»):
      hvordan spore en kort-kjøring — aldri via PR-head-SHA, bruk PR-nummer i
      Decide-loggen eller label-tidsstempelet. — Commit 070d5299.
- [x] Issue #1802 lukkes med Teknisk + Funksjonell closing-kommentar som
      inkluderer hele evidenskjeden. — Kommentar postet:
      <https://github.com/jdlarssen/golf-app/issues/1802#issuecomment-5465574896>;
      selve lukkingen skjer via `Closes #1802` når PR #1807 merges.

## Gates

Docs-only-endring — ingen kode berørt. Gates: commit-hooks (commit-msg `Refs #N`,
pre-commit) + at PR-en består no-op-tvillingen. Ingen vitest/tsc påkrevd.

## Avgrensning

- INGEN endring i `scripts/loops/` / `lib/loops/` — dedup-mekanismen er
  verifisert korrekt; å «forbedre» den er utenfor scope.
- Ingen endring i ci-vakta.md — regelen får ett hjem (discord-pr-kort.md er
  fix-protokollen begge peker på).
