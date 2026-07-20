# Kontrakt #1301 — Discord PR-kort for docs-only-PR-er: dispatch + vent i kort-workflowen

**Issue:** [#1301](https://github.com/jdlarssen/golf-app/issues/1301)
**Eierbeslutning:** Nivå 3 — «kortet venter selv» — valgt av eier i interaktiv økt 2026-07-20
(alternativene nivå 1/3/4 fra kontrakt-smedens gråsone-kommentar ble lagt frem; eieren valgte 3).
**Branch:** `claude/dok-avstemmer-pr-merge-zy0sji`

## Problem (verifisert)

Docs-only-PR-er får aldri Discord-kort med merge-knapp:

1. `ci.yml` L20–23: `paths-ignore: '**.md', 'docs/**', '.forge/**'` (#1195) → docs-PR-er kjører ingen CI.
2. `discord-pr-card.yml` L14–16 trigges kun av `workflow_run: [CI]` → uten CI-kjøring, ingen kort.
3. «Bare dispatch rett etter `gh pr create`» alene taper tidsracen: `classifyChecks`
   (`lib/loops/prCard.ts` L61–66) returnerer `'pending'` både for tom check-liste og
   uferdige Vercel-checks, og decide-steget gir da opp uten kort. `workflow_dispatch`
   re-fyrer ikke når checkene senere blir grønne.

## Løsning (nivå 3)

Vente-logikken får ETT hjem: kort-workflowens decide-steg.

1. **`lib/loops/prCard.ts`:** ny ren, testbar `waitForChecksToSettle({ fetchRuns, maxAttempts, sleep, log })`
   som poller `classifyChecks` til utfallet ikke lenger er `'pending'`, eller forsøkene er brukt opp.
   Injisert `fetchRuns`/`sleep` → Type A-testbar uten HTTP-mocks.
2. **`scripts/loops/decide-pr-card.ts`:** når env `WAIT_FOR_CHECKS=true`, brukes helperen
   (30 s intervall, maks 21 forsøk ≈ 10 min) i stedet for dagens engangs-klassifisering.
   `workflow_run`-stien er UENDRET (engangs-sjekk som før).
3. **`discord-pr-card.yml`:** decide-steget får `WAIT_FOR_CHECKS: true` kun ved
   `workflow_dispatch`, og `timeout-minutes` som rommer ventingen.
4. **`dok-skjema.sh`:** etter `gh pr create` → `gh workflow run discord-pr-card.yml -f pr=<N>`.
   Best-effort (`::warning` ved feil, ikke `fail_closed`) — docs-PR-en er allerede levert,
   og morgenbriefen er backstop for et tapt kort. `dok-skjema.yml` får `actions: write`
   (GITHUB_TOKEN kan dispatche `workflow_dispatch` — unntaket fra ikke-rekursjons-regelen).
5. **Docs:** `docs/loops/discord-pr-kort.md` (dispatch-vent-semantikk + produsent-konvensjon:
   «produsenter av docs-only-PR-er dispatcher kortet selv rett etter PR-opprettelse»),
   `docs/loops/morgenbriefen.md` (arkiv-PR-en dispatcher kortet på samme måte).

## Utenfor scope

- `workflow_run`-stien (kode-PR-er) endres ikke.
- Morgenbrief-routinens cloud-prompt kan ikke endres fra repoet — dekkes kun som
  dokumentert konvensjon i `morgenbriefen.md`.
- Kvote-trimmen #1195 røres ikke (nivå 4 ble vraket).

## Aksepterte kanter

- PR som lukkes/merges MENS decide venter: kortet kan postes for en lukket PR.
  Mottaker-endepunktet (#1124) re-verifiserer ved trykk, så knappen er ufarlig.
- Dobbeltkort-restrisikoen fra #1159 (to samtidige fyringer) er uendret — dedup-labelen står.

## Akseptansekriterier

1. `waitForChecksToSettle` har grønne Type A-tester (grønn straks, poller-til-grønn,
   rød underveis, gir opp som pending).
2. `workflow_dispatch` av kort-workflowen mot en ekte, åpen docs-PR (#1311) poster kort
   med merge-knapp i Discord.
3. Ingen dobbeltkort på PR-er som også trigger CI (dedup-label + uendret workflow_run-sti).
4. `docs/loops/discord-pr-kort.md` dokumenterer produsent-konvensjonen.

## Verifisering

- Unit: `npx vitest run lib/loops` grønn.
- Live: dispatch mot #1311 fra branchen (workflow-YAML-en hentes fra dispatch-ref;
  NB: loop-skriptene pinnes til main i workflowen (#1181), så selve vente-løkka er
  først aktiv i en dispatch ETTER merge).
- VERIFICATION GAP: hele kjeden dok-skjema → dispatch → vent → kort bevises først av
  neste ukentlige dok-skjema-kjøring (søndag 04:00 UTC). Feiler den, fanges det av
  workflowens failure-alarm + morgenbriefen.
