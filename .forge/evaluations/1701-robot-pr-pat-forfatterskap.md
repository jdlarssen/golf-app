# Evaluering — #1701 robot-PR PAT-forfatterskap

**Verdikt: ACCEPT** for kriterium 1–4 og alle kjørbare porter.
**Kriterium 5: NOT VERIFIABLE (tidsbundet)** — bevis kommer 2026-08-23/24.

⚠️ **Metode-forbehold (VERIFICATION GAP).** Dette er en **selv-evaluering**, ikke
den vanlige uavhengige fersk-kontekst-evaluatoren. Auto-modusens sikkerhets-
klassifiserer var nede gjennom hele økta, og `Agent`-verktøyet gikk gjennom den:
fire spawn-forsøk ble avvist med «temporarily unavailable». Sjekkene under er
kjørt, og kommando-utdataene er ekte — men de er kjørt av samme økt som bygde
koden, så den uavhengige lesningen mangler. Ønskes den, kjør `/forge:evaluate`
på nytt når klassifisereren er tilbake.

## Kriterier

| # | Status | Bevis |
|---|---|---|
| 1 | ✅ | `PR_AUTHOR_PAT`-env: `.github/workflows/ukesversjon.yml:55`, `.github/workflows/dok-skjema.yml:53`. PAT-gren + to fallback-grener med `::warning::`: `.github/scripts/robot-pr.sh:41–53`. Kall: `ukesversjon.sh:161`, `dok-skjema.sh:217`. `bash -n` × 3 → exit 0. |
| 2 | ✅ | `grep -rn "gh workflow run" .github/scripts/` → **0 treff**. `grep -c "actions:" .github/workflows/{ukesversjon,dok-skjema}.yml` → **0 / 0**. |
| 3 | ✅ | Detektor `robot-pr.sh:93–147`, kalt fra `ukesversjon.sh:174` + `dok-skjema.sh:229`. Klassifiseringen er faktorert til `robot_pr_classify_checks` (stdin-JSON → ett ord) og testet i 13 input-klasser, se under. Exit-kode ved parkert målt til **0**. |
| 4 | ✅ | `docs/loops/discord-pr-kort.md`: ny seksjon «Robot-åpnede PR-er må ha menneskelig forfatter (#1701)» + eier-oppskrift (fire-stegs) + fix-protokoll-punkt. Design-spec `:58` og `:103` peker til #1701. |
| 5 | ⏳ | **Tidsbundet.** Første planlagte robot-PR: dok-skjema søndag 2026-08-23 (ved skjema-diff), ellers ukesversjon mandag 2026-08-24. Issuet står åpent til det er observert; PR-en bruker `Refs`, ikke `Closes`. |

## Klassifiserer-batteri (13 klasser, kjørt under `set -u`)

| input | utfall |
|---|---|
| én `action_required` blant flere | `parked` |
| **ekte** JSON fra grønn SHA på `origin/main` | `ok` |
| alle `conclusion: null` (kjører ennå) | `ok` |
| alle grønne | `ok` |
| tomt rollup (0 runs) | `unknown` |
| ugyldig JSON | `unknown` |
| API-feilobjekt `{"message":"Not Found"}` | `unknown` |
| `total_count` UTEN `check_runs` | `unknown` |
| tom input | `unknown` |
| `{}` | `unknown` |
| `[]` (array, ikke objekt) | `unknown` |
| `check_runs: null` eksplisitt | `unknown` |

Ingen input ga tom eller flerords-utskrift. `ok` gis kun når kjøringer faktisk er
synlige i lista — alt annet er `unknown` og eskalerer som parkert (fail-loud).

## Porter

- `bash -n` × 3 (`robot-pr.sh`, `ukesversjon.sh`, `dok-skjema.sh`) → exit 0.
- `npx vitest run lib/loops` → 4 filer, **226 tester grønne** (Node 22).
- `npm run lint` → `56 problems (0 errors, 56 warnings)`. Null feil = porten.
  Alle 56 er forhåndseksisterende kompleksitets-advarsler i `.ts`-filer denne
  greina ikke rører (den legger ingen TypeScript til).
- `shellcheck` → **ikke installert lokalt, hoppet over** (kontrakten tillater det).
- Ingen staging-verifisering (ingen bruker-synlig flate) · ingen `.changes/`-notat.

## Funn som ble fikset i økta

1. **(Alvorlig — ville brutt varslingen)** `robot_pr_create` skrev `::warning::` til
   **stdout**, som kalleren fanger i `PR_URL=$(…)`. Warninget hadde dermed forsvunnet
   fra Actions-loggen OG korrumpert PR-URL-en som går inn i detektorens issue-body.
   Fikset: begge degraderings-warnings til stderr (`robot-pr.sh:47,49`), verifisert med
   stubbet `gh` — fanget verdi er nå ren URL. Commit `b7cbf50f`.
2. **(Alvorlig — falsk grønn)** Klassifisereren leste `total_count` med
   `.check_runs | length` som fallback, så `{"total_count":3}` uten liste ble lest som
   «tre kjøringer, ingen parkert» → `ok`. Det er nøyaktig den stille-grønne oppførselen
   kontrakten forbyr. Fikset: teller kun det som faktisk står i `check_runs`
   (`type == "array"`, ellers `-1` → `unknown`), `robot-pr.sh:80–92`.

## Andre kontroll-punkter

- **Sourcing-kontrakten holder:** `open_or_note_issue` er definert før `source` i
  begge kallere (`ukesversjon.sh:31` → source `:64` → kall `:174`;
  `dok-skjema.sh:53` → source `:108` → kall `:229`). `REPO`/`BRANCH`/`RUN_URL` er
  satt i toppen av begge (`ukesversjon.sh:19–23`, `dok-skjema.sh:24–28`).
- **`set -u`-trygt:** hele batteriet og detektor-testen kjørte under `set -u` uten
  abort; valgfrie variabler leses som `${PR_AUTHOR_PAT:-}` / `${4:-45}`.
- **PAT-verdien lekker ikke:** kun NAVNET `PR_AUTHOR_PAT` finnes i logg, issue-body
  og Discord-tekst. Verdien brukes utelukkende som `GH_TOKEN="$PR_AUTHOR_PAT"` på
  `gh pr create`.
- **Utenfor scope er urørt:** endrede filer er de 8 kontrakten peker på;
  `lib/loops/prCard.ts` er IKKE blant dem, så `action_required` forblir rødt.

## Ikke verifisert

- **Kriterium 5** (tidsbundet, se over) — og dermed heller ikke at `gh pr create`
  med en ekte PAT faktisk gir `triggering_actor: jdlarssen`. Det krever at eieren
  legger inn secreten først; ingen PAT finnes i Actions i dag.
- **Uavhengig evaluator-lesning** — se metode-forbeholdet øverst.

## Etterskrift 2026-08-29 — kriterium 5 observert: FULL ACCEPT

Eieren la inn `PR_AUTHOR_PAT` 23. august. Første planlagte kjøringer (mandag
2026-08-24) beviste hele kjeden, avlest via API 2026-08-29:

- PR #1740 (ukesversjon) head `f2850b74`: CI + CI (docs no-op) + Secret scan alle
  `run_attempt=1`, `conclusion=success`, `triggering_actor=jdlarssen`;
  `mergedBy: app/github-actions`; label `discord:merge-kort`.
- PR #1743 (dok-skjema) head `570f184d`: samme bilde.

Ingen `action_required` på noen attempt — parkeringen fra juni-endringen er borte.
Kriterium 5 ✅ → kontrakten er fullt oppfylt, #1701 lukkes.
