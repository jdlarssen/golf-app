# Kontrakt — #1701: robot-åpnede PR-er (ukesversjon, dok-skjema) blir stående — åpne dem med PAT

Kilde: [#1701](https://github.com/jdlarssen/golf-app/issues/1701) + kontrakt-smedens
to kommentarer (2026-08-17). Kontrakt-økt 2026-08-18 med eier (to AskUserQuestion-svar
under «Key Decisions»). Klasse: teknisk (loop-infrastruktur, Epic #1073). Produktvalg: nei.
Eier-handling kreves (Actions-secret) — PR-en rører `.github/**` og går uansett til
knapp-kort (aldri-lista), ikke auto-merge.

## Problem

De to Actions-produsentene som åpner PR-er mot `main` — `ukesversjon.yml` (mandag) og
`dok-skjema.yml` (søndag) — åpner dem med `github.token`. Siden **GitHubs
plattformendring 11. juni 2026** («Bot-created pull requests can run workflows if
approved») blir `pull_request`-kjøringene for slike PR-er **opprettet, men parkert som
`action_required`** («Approve and run») til en med skrivetilgang klikker. Verifisert i
Actions-API-et: 3 av 3 robot-PR-er de siste tre ukene (#1699, #1681, #1552 — og #1335 fra
26.7) har attempt 1 = `action_required` av `github-actions[bot]`, attempt 2 = manuelt av
eier.

Konsekvens-kjeden:

1. Checkene står parkerte → branch protection nekter merge, og kortets `classifyChecks`
   ser `action_required` ∈ `BAD_CONCLUSIONS` → `red` → `noCard('CI red')`. Issuets
   løsning A (produsent-dispatch av kortet) no-op-er derfor umiddelbart.
2. Selv etter eierens manuelle «Approve and run» kom det ingen `discord-pr-card`-kjøring
   (workflow_run-kjeden fra en `github.token`-startet PR fyrer ikke) — brudd 2 i issuet.
3. #1469-fallbacken i `ukesversjon.sh:160–173` («tomt check-rollup → dispatch ci.yml
   selv») redder ingenting: guarden teller check-runs som *eksisterer* (de parkerte
   finnes → «Checks fyrte av seg selv»), og workflowen mangler uansett `actions: write`
   (dispatch → 403). Latent død kode.

Netto: hver robot-PR trenger to manuelle klikk av eieren, stikk i strid med
`docs/loops/discord-pr-kort.md` («kortet kommer av seg selv, som for alle andre PR-er»)
og ukesversjon-designets forutsetning (auto-merge på grønt).

## Research Findings

- **GitHub changelog 2026-06-11** — «Bot-created pull requests can run workflows if
  approved»: PR-er opprettet av `github-actions[bot]` får nå workflow-kjøringer, men i
  approval-required-tilstand. Ingen repo-/org-innstilling skrur kravet av.
  <https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved/>
- **docs.github.com › GITHUB_TOKEN**: «When workflows using `GITHUB_TOKEN` create or
  update pull requests, the resulting `pull_request` event enters an approval-required
  state for the `opened`, `synchronize`, or `reopened` activity types.» Anbefalt
  omvei, ordrett: «use a GitHub App installation access token or a personal access
  token instead of `GITHUB_TOKEN` when creating or updating the pull request.»
  <https://docs.github.com/en/actions/concepts/security/github_token>
- **Community #199292** (staff-svar 2026-06-18): utrulling 10.–17. juni, gjelder også
  branches i samme repo (ikke bare forks). Bekreftede omveier: PAT eller GitHub App.
  <https://github.com/orgs/community/discussions/199292>
- **Repo-innstillinger (API, 2026-08-18):** `can_approve_pull_request_reviews: true`,
  fork-approval-policy `first_time_contributors`, `default_workflow_permissions: read`.
  Ingen av dem påvirker bot-PR-parkeringen. Ingen PAT-secret finnes i Actions i dag
  (`gh secret list`: kun Discord/Supabase/E2E-secrets).
- **Eksisterende PAT-presedens:** `GITHUB_LOOP_PAT` (fine-grained, kun dette repoet:
  Issues RW + PR RW + Actions RO + Contents RW) ligger i Vercel for Discord-knappen
  (`app/api/discord/interactions/route.ts:29–33`) — IKKE i Actions. Eieren valgte et
  nytt, smalere token (se Key Decisions).

## Prior Decisions

- **#1483** (`1301-discord-kort-docs-pr-dispatch-vent.md` → avviklet): produsenter skal
  IKKE dispatche kortet; no-op-tvillingen dekker docs-only hendelsesdrevet. **Står.**
  Denne kontrakten gjeninnfører ingen produsent-dispatch — PAT-forfatterskap gjør
  hendelseskjeden identisk med menneske-PR-ene, som virker daglig.
- **#1406** (`1406-auto-merge-pr-kortet.md`): `.github/**` er på aldri-lista → denne
  PR-en får knapp-kort og merges av eieren. Forventet, ikke en feil.
- **#1516** (`1516-draft-forst-okt-pr-flyt.md`): draft = «jobber fortsatt». Robot-PR-ene
  åpnes ferdige (ikke draft) — uendret.
- **#1520/#1623**: `classifyChecks`/`BAD_CONCLUSIONS` og valg-markøren røres ikke.
  `action_required` SKAL fortsatt være rødt for kortet (fail-closed) — fiksen ligger hos
  produsenten, ikke i klassifisereren.
- **#1562** (ukesversjon-designet, `docs/superpowers/specs/2026-08-11-…`): «kjent felle»
  om `github.token`-PR-er var skrevet før juni-endringen var forstått — oppdateres.

## Design

**Prinsipp:** robot-produsenten åpner PR-en som eieren (PAT), alt annet forblir
`github.token`. Da er `pull_request: opened` sendt av en bruker med write → CI,
`CI (docs no-op)` og `Secret scan` starter uten godkjenning → `workflow_run` fyrer →
kortet decide-r → auto-merge (ingen produktvalg-heading, ikke aldri-liste) → kvittering
+ `discord:merge-kort` + main-verify-dispatch. Nøyaktig menneske-PR-kjeden.

### 1. Ny Actions-secret: `PR_AUTHOR_PAT` (eier-handling, én gang)

Fine-grained PAT, kun `jdlarssen/golf-app`, **Pull requests: Read and write** +
**Contents: Read-only** (Metadata: read følger automatisk). Ikke Contents write — pushen
skjer fortsatt med `github.token`. Utløp: maks GitHub tillater (12 måneder); robotene
sier selv fra når det er utløpt (pkt. 4). Oppskriften i eierens språk går i
`docs/loops/discord-pr-kort.md` (ny seksjon, se pkt. 5) og i PR-body/første kommentar.

### 2. Produsent-workflowene sender secreten inn

`ukesversjon.yml` og `dok-skjema.yml`: `PR_AUTHOR_PAT: ${{ secrets.PR_AUTHOR_PAT }}` som
env til skript-steget. `GH_TOKEN` forblir `github.token` (issues, labels, gh api).
Permissions uendret (`contents: write, issues: write, pull-requests: write`) — vi legger
IKKE til `actions: write` (dispatch-fallbacken fjernes, se pkt. 3). Header-kommentaren
«Ops-forutsetning: Allow GitHub Actions to create and approve pull requests» erstattes
med: PAT-en er forutsetningen; innstillingen trengs kun for github.token-fallbacken.

### 3. Skriptene: PR-opprettelse med PAT + ærlig fallback

Felles oppførsel i begge skript (`ukesversjon.sh:156–158`, `dok-skjema.sh:212–214`):

```
if PR_AUTHOR_PAT satt:
  PR_URL=$(GH_TOKEN="$PR_AUTHOR_PAT" gh pr create …)      # forfatter = eier
  feilet → ::warning:: «PR_AUTHOR_PAT avvist (utløpt/ugyldig?) — prøver github.token»
          → PR_URL=$(gh pr create …)                       # github.token, parkeres
ellers:
  ::warning:: «PR_AUTHOR_PAT ikke satt — PR-en åpnes med github.token og CI parkeres
              til eieren godkjenner»
  PR_URL=$(gh pr create …)
begge feilet → fail_closed «gh pr create feilet» (som i dag)
```

Deretter **erstattes** #1469-fallbacken (`ukesversjon.sh:160–173`) med en
**parkerings-detektor** (i begge skript): `sleep 45` → hent
`repos/$REPO/commits/$SHA/check-runs` → finnes minst én med
`conclusion == "action_required"` (eller null check-runs) → `::warning::` +
Discord-varsel + dedupet issue (`open_or_note_issue`) med tittel
`«<Rutine>: PR-en står med «Approve and run» — PAT mangler eller er utløpt»` og body
som sier hva eieren gjør nå (godkjenn kjøringene på PR-en) og hva som fikser det varig
(forny `PR_AUTHOR_PAT`, peker til doc-seksjonen). Exit 0 — PR-en finnes og er
gyldig; det er kortet/CI som ikke kommer av seg selv. Ingen `gh workflow run ci.yml`
lenger (død sti; PAT-forfatterskap gjør den overflødig).

DRY: to skript med identisk PR-blokk og detektor. Claude's discretion om det legges i en
liten delt fil (`.github/scripts/robot-pr.sh` som sources, à la `discord-notify.sh`)
eller dupliseres med lockstep-kommentar — begge er akseptable, delt fil foretrukket hvis
det ikke roter til fail_closed/issue-tittel-håndteringen (titlene er rutine-spesifikke).

### 4. Observérbarhet ved PAT-utløp

Ingen stille degradering: manglende/avvist PAT → warning i loggen + Discord + dedupet
issue (pkt. 3). Issue-teksten er eierens neste-steg. Ingen ny alarm-workflow.

### 5. Dokumentasjon (ett hjem for regelen)

- `docs/loops/discord-pr-kort.md`: ny seksjon **«Robot-åpnede PR-er må ha menneskelig
  forfatter (#1701)»** rett etter «Docs-only-PR-er …»: hva GitHub endret i juni 2026,
  hvorfor `github.token`-PR-er parkeres (og hvorfor kortet ser rødt), regelen
  («produsenter i Actions åpner PR-en med `PR_AUTHOR_PAT`; pushen kan fortsatt gå med
  github.token; ALDRI push til robot-branchen med github.token ETTER at PR-en er åpnet —
  `synchronize` parkeres like fullt»), og eier-oppsettet av `PR_AUTHOR_PAT` i
  fire-stegs-malen (Hvor / Hva / Forvent / Hvis ikke). Presiser at «Produsenter skal
  IKKE legge til dispatch» fortsatt gjelder. Nytt punkt i fix-protokollen: «Robot-PR
  står med Approve and run → PAT mangler/utløpt, se seksjonen».
- `docs/superpowers/specs/2026-08-11-ukentlig-versjonsrutine-design.md:58` og `:103`:
  erstatt «kjent felle»-avsnittet med én setning som peker til #1701 og kort-doccen.
- Kommentarer i begge yml + begge sh oppdatert (fjern #1469-referansen som løsning;
  behold som historikk der det hjelper).

## Edge Cases & Guardrails

- **PAT mangler** (eieren har ikke rukket å legge den inn før søndag): PR åpnes med
  github.token som i dag + warning + issue. Ikke fail_closed — bokføringen/snapshotet
  skal fortsatt eksistere.
- **PAT utløpt/ugyldig:** `gh pr create` med PAT feiler (401/403) → fallback github.token
  → detektoren fanger parkeringen → issue. Aldri to PR-er: fallback kjøres kun når
  første kall feilet, og `gh pr create` er idempotent-avvisende på samme head.
- **Detektor-race:** 45 s er nok for at GitHub oppretter (parkerte eller ekte)
  check-runs; 0 check-runs etter 45 s behandles som «uavklart» → samme warning/issue som
  parkert (fail-loud), ikke som grønt.
- **Ikke rør `lib/loops/prCard.ts`:** `action_required` skal forbli rødt.
- **Ingen `actions: write`** i produsentene — least privilege; ingen dispatch-sti igjen
  som trenger det.
- **PAT-en er den eneste hemmeligheten som gis videre** — aldri `echo`, aldri i
  issue-body/Discord. Fallback-varselet nevner navnet `PR_AUTHOR_PAT`, aldri verdien.
- **Ferdig-kriteriet er tidsbundet:** eieren valgte å IKKE kjøre en midt-uke-release som
  bevis. Bevis = søndag 23.8 (dok-skjema, hvis skjema-diff) og mandag 24.8 (ukesversjon,
  tre notater ligger klare). Uten skjema-diff åpnes ingen dok-skjema-PR; da er mandag
  det første beviset.
- **Blandet PR (ukesversjon):** rører `.changes/*.md` + `CHANGELOG.md` (docs-noop) og
  `package.json` (ci.yml) — begge fyrer, kortets concurrency per head-SHA håndterer det
  som i dag. Ingen endring.

## Key Decisions

- **Løsning B (PAT-forfattet PR), ikke A/C:** A no-op-er beviselig (checks parkert →
  rødt), C fikser ikke godkjenningsgaten. B gjør robot-PR-ene identiske med
  menneske-PR-ene og løser begge bruddene i ett — bekreftet av GitHubs egne docs.
- **Nytt, smalt PAT (eier-svar 2026-08-18):** eget fine-grained token med kun PR RW +
  Contents R, secret `PR_AUTHOR_PAT`. Ikke gjenbruk av `GITHUB_LOOP_PAT` (bredere
  rettigheter; verdien ligger i Vercel, ikke nødvendigvis tilgjengelig).
- **Bevis ved neste planlagte kjøring, ikke midt-uke-release (eier-svar 2026-08-18):**
  ingen ekstra versjonsnummer i footeren. Kontrakten aksepteres først når kriterium 5
  er observert (søndag/mandag), eller eksplisitt av eier.
- **PAT ikke GitHub App:** App er også en gyldig omvei, men krever tre eier-artefakter
  (app, private key, installasjon). Solo-repo → PAT. Reversibelt: bytt secret-innhold og
  navn senere uten kodeendring utover env-linja.
- **Push forblir github.token:** minst mulig makt til PAT-en; `push`-eventet trigger
  ingen workflows her (ci.yml/secret-scan er `pull_request`-only, main-verify kun main).
- **Fallback framfor fail_closed når PAT mangler:** PR-en er verdifull selv parkert;
  issue + Discord gjør degraderingen synlig (I3, «aldri stille grønn»).

**Claude's Discretion:**
- Delt hjelpefil vs. duplisert blokk med lockstep-kommentar (se Design pkt. 3).
- Nøyaktig ordlyd i warnings/issue-body (norsk, eierens språk, fire-stegs-malen).
- Om `sleep 45` beholdes eller justeres (30–60 s) — begrunn i kommentar.
- Commit-type: `ci(loops): …` eller `fix(ci): … [no-changelog]` — ingen `.changes/`-notat
  (intern tooling, ikke bruker-synlig).

## Success Criteria

- [x] **1.** Begge produsent-workflows sender `PR_AUTHOR_PAT` som env, og begge skript
      åpner PR-en med `GH_TOKEN="$PR_AUTHOR_PAT"` når satt, med github.token-fallback +
      `::warning::` når den mangler/avvises. **Evidens:** `grep -n PR_AUTHOR_PAT
      .github/workflows/*.yml .github/scripts/*.sh` viser env-linje i begge yml og
      PAT-bruk + fallback-gren i begge sh; `bash -n` på begge skript exit 0.
- [x] **2.** #1469-dispatch-fallbacken er borte fra `ukesversjon.sh` (ingen
      `gh workflow run ci.yml`/`secret-scan.yml`), og ingen produsent har fått
      `actions: write`. **Evidens:** `grep -rn "gh workflow run" .github/scripts/` = 0
      treff; `grep -n "actions:" .github/workflows/{ukesversjon,dok-skjema}.yml` = 0.
- [x] **3.** Parkerings-detektoren finnes i begge skript: `action_required` (eller 0
      check-runs) etter PR-opprettelse → `::warning::` + Discord + dedupet issue med
      «Approve and run»-tittel; exit 0. **Evidens:** kode-lesing (`file:line`) + to
      lokale kjøringer av selve klassifiserings-biten (faktorér den til en funksjon som
      tar check-runs-JSON på stdin, så den kan testes uten nett): (a) fabrikkert JSON
      med én `action_required`-run → «parkert»; (b) ekte JSON fra en grønn SHA på main
      (`gh api repos/jdlarssen/golf-app/commits/$(git rev-parse origin/main)/check-runs`)
      → «ok». Builder limer inn kommandoutdata i PR-en. (Attempt-1-konklusjonene på
      #1699/#1681 er overskrevet av eierens re-kjøring, så en ekte parkert SHA finnes
      ikke å teste mot.)
- [x] **4.** Dokumentasjonen: ny seksjon i `docs/loops/discord-pr-kort.md` med
      eier-oppskrift for `PR_AUTHOR_PAT` (fire-stegs-malen) + fix-protokoll-punkt;
      design-spec `:58/:103` peker til #1701. **Evidens:** `grep -n "PR_AUTHOR_PAT\|#1701"
      docs/loops/discord-pr-kort.md docs/superpowers/specs/2026-08-11-*.md`.
- [x] **5. (tidsbundet, etter merge + secret på plass)** Første planlagte robot-PR
      (dok-skjema søndag 2026-08-23 ved skjema-diff, ellers ukesversjon mandag
      2026-08-24) får `pull_request`-kjøringer som starter uten `action_required`,
      kortet fyrer, PR-en auto-merges med `discord:merge-kort` og kvittering — uten
      manuelt klikk. **Evidens:** `gh api repos/…/actions/runs?head_sha=<sha>` viser
      attempt 1 `success` med `triggering_actor: jdlarssen`; `gh pr view N --json
      mergedBy,labels` viser `app/github-actions` + labelen. Er secreten ikke lagt inn
      før da: kriteriet er ikke oppfylt, og detektor-issuet skal ha åpnet seg (det er
      da beviset for kriterium 3 i produksjon).

## Gates

- [x] `bash -n .github/scripts/ukesversjon.sh .github/scripts/dok-skjema.sh` (+ evt. delt
      fil) → exit 0; `shellcheck` hvis tilgjengelig lokalt (`command -v shellcheck`), ellers
      noter at den ble hoppet over.
- [x] `npx vitest run lib/loops` → grønn (uendret kode, regresjonsvakt).
- [x] `npm run lint` → 0 errors (yml/sh er ikke lint-omfattet; kjøres for helhet).
- [x] Ingen staging-verifisering (ikke bruker-synlig flate); ingen `.changes/`-notat.
- [x] PR-body: kort «Fordeler/ulemper»-blokk (obligatorisk for fix-PR-er) + eierens
      PAT-oppskrift øverst i produktspråk. PR-en havner på knapp-kort (`.github/**`) —
      eieren merger.

## Files Likely Touched

- `.github/workflows/ukesversjon.yml` — `PR_AUTHOR_PAT`-env, header-kommentar
- `.github/workflows/dok-skjema.yml` — samme
- `.github/scripts/ukesversjon.sh` — PAT-PR-opprettelse + fallback; §6 → detektor
- `.github/scripts/dok-skjema.sh` — PAT-PR-opprettelse + fallback; detektor; kommentar
  `:216–218` oppdatert
- (valgfritt) `.github/scripts/robot-pr.sh` — delt PR-opprettelse + detektor
- `docs/loops/discord-pr-kort.md` — ny seksjon + fix-protokoll-punkt
- `docs/superpowers/specs/2026-08-11-ukentlig-versjonsrutine-design.md` — `:58`, `:103`

## Out of Scope

- Endringer i `lib/loops/prCard.ts` / `decide-pr-card.ts` / kortets triggere
  (`action_required` forblir rødt; ingen schedule-fallback C).
- GitHub App som identitet (kan byttes til senere uten kodeendring utover env).
- Morgenbriefens arkiv-PR (sky-routine, ikke Actions — bruker sitt eget token; hvis den
  også viser seg parkert, eget issue).
- Å approve parkerte kjøringer via API fra produsenten (ville trengt PAT uansett, og
  løser ikke workflow_run-kjeden).
- Automatisk PAT-rotasjon/utløpsvarsel før utløp (detektoren varsler etter første
  feilede kjøring — godt nok for solo-drift).

## Round 1 — bygge-bevis (2026-08-18)

Kriterium 1–4 og alle automatiske porter er verifisert i bygge-økta. **Kriterium 5
står med vilje åpent:** det er tidsbundet til første planlagte kjøring (dok-skjema
søndag 2026-08-23 ved skjema-diff, ellers ukesversjon mandag 2026-08-24) og kan
ikke observeres før da. Issuet #1701 forblir derfor åpent etter merge — PR-en
bruker `Refs`, ikke `Closes`.

| # | Bevis |
|---|---|
| 1 | `PR_AUTHOR_PAT`-env: `ukesversjon.yml:55`, `dok-skjema.yml:53`. PAT-bruk + to fallback-grener med `::warning::`: `robot-pr.sh:36–47`. Kall: `ukesversjon.sh:161`, `dok-skjema.sh:217`. `bash -n` × 3 → exit 0. |
| 2 | `grep -rn "gh workflow run" .github/scripts/` → **0 treff**. `grep -c "actions:" .github/workflows/{ukesversjon,dok-skjema}.yml` → **0 / 0**. |
| 3 | Detektor: `robot-pr.sh:88–137`, kalt fra `ukesversjon.sh:174` og `dok-skjema.sh:229`, `exit 0` i alle grener. Klassifiseringen er faktorert til `robot_pr_classify_checks` (stdin-JSON → ett ord), testet i 6 klasser: fabrikkert `action_required` → `parked`; ekte grønn `origin/main`-SHA → `ok`; 0 runs → `unknown`; ugyldig JSON → `unknown`; alle `conclusion:null` → `ok`; API-feilobjekt → `unknown`. |
| 4 | `docs/loops/discord-pr-kort.md`: ny seksjon «Robot-åpnede PR-er må ha menneskelig forfatter (#1701)» + eier-oppskrift (fire-stegs) + fix-protokoll-punkt (6 × `PR_AUTHOR_PAT`-treff). Design-spec `:58` og `:103` peker nå til #1701. |
| 5 | **ÅPEN — tidsbundet.** Bevis kommer 23./24. august. |

## Round 2 — kriterium 5 observert (2026-08-29)

Begge planlagte robot-PR-er fra mandag 2026-08-24 gikk hele kjeden uten manuelt klikk:

- **PR #1740** (ukesversjon, v1.234.0): head-SHA `f2850b74` — `actions/runs?head_sha=`
  viser CI, CI (docs no-op) og Secret scan alle med `run_attempt=1`,
  `conclusion=success`, `triggering_actor=jdlarssen`. `gh pr view 1740` →
  `mergedBy: app/github-actions`, label `discord:merge-kort`. Åpnet 03:54, merget 04:02.
- **PR #1743** (dok-skjema): head-SHA `570f184d` — samme bilde (attempt 1 success,
  `triggering_actor=jdlarssen`), `mergedBy: app/github-actions`, `discord:merge-kort`.

Ingen `action_required` på noen attempt-1-kjøring. Kriterium 5 oppfylt → kontrakten
er komplett og #1701 lukkes.

**Porter:** `bash -n` × 3 exit 0 · `npx vitest run lib/loops` 4 filer / 226 tester
grønne · `npm run lint` `0 errors` (56 forhåndseksisterende advarsler i urørte
`.ts`-filer) · `shellcheck` **ikke installert lokalt — hoppet over** (kontrakten
tillater det eksplisitt) · ingen staging-verifisering (ingen bruker-synlig flate)
· ingen `.changes/`-notat (intern tooling).

**Avvik fra kontrakten:** ingen. Delt hjelpefil ble valgt framfor duplisert blokk
(kontraktens foretrukne variant); `sleep 45` beholdt uendret med begrunnelse i
kommentar. Issue-filingen ligger hos kalleren, siden labelen er rutine-spesifikk
(`bug` for ukesversjon, `documentation` for dok-skjema).
