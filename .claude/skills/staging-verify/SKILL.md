---
name: staging-verify
description: Verifiser en bruker-synlig PR ende-til-ende på torny-staging og post beviset på PR-en. Bruk når en feat/fix-PR skal merges, når noen sier «staging-verifiser PR #N», eller som obligatorisk sluttsteg i autonome bygge-loops (#1073). Tar PR-nummer som argument.
---

# Stagingbevis-porten (#1076)

Du skal bevise — ikke anta — at PR-ens bruker-synlige endring virker ende-til-ende
på staging, og etterlate beviset på PR-en. Fail-closed: «fikk ikke verifisert» er
et eksplisitt utfall med label og kommentar, aldri fravær av signal.

**Harde regler:** aldri prod (kun staging-ref `snwmueecmfqqdurxedxv`), aldri
merge, aldri assertions på norsk copy (bruk `data-testid`/rolle), aldri stille
exit. Prod-brannmuren (#1074) er aktiv og stopper feilskjær — men ikke test den.

## Steg 0 — Preconditions (fail-closed)

Noter starttidspunkt (45-min-taket måles mot dette). Sjekk:

- PR-en finnes og er åpen: `gh pr view <N> --json title,body,state,headRefName`
- **Er endringen bruker-synlig?** Docs/chore/refactor/test-PR → si det eksplisitt
  i en PR-kommentar («ikke bruker-synlig — porten gjelder ikke»), sett INGEN
  label, ferdig.
- `.env.staging.local` finnes i arbeidstreet, Node 22 aktiv (`nvm use 22`),
  `torny-staging` finnes i `.claude/launch.json`.

Mangler en precondition → label `needs-manual-qa` + norsk kommentar om hva som
manglet. Aldri fortsett på antagelser om miljøet.

## Steg 1 — Akseptansepunkter

- Finn `Closes #N` i PR-body → hent issuets ferdig-kriterier/kontrakt
  (`gh api repos/{owner}/{repo}/issues/N/comments` — kontrakt-kommentarer har
  headeren «Forge-kontrakt tilgjengelig»).
- Ingen kontrakt/kriterier → utled 1–4 akseptansepunkter fra PR-diffen og
  CHANGELOG-linjen, og skriv i sluttkommentaren at punktene er utledet.
- Hvert punkt formuleres verifiserbart: «når <handling> så <observerbar effekt>».

## Steg 2 — Boot og innlogging

- `gh pr checkout <N>` i arbeidstreet.
- `preview_start("torny-staging")`.
- Logg inn autonomt via OTP-mint-oppskriften i CLAUDE.md («Autonom login»):
  admin = `E2E_ADMIN_EMAIL`, spiller = `E2E_PLAYER_EMAIL`. Flyter som krever
  begge roller: kjør admin-delen først, logg ut, kjør spiller-delen.

## Steg 3 — Prod-vakt (før første skriv)

`preview_network`: assert at samtlige Supabase-kall går mot
`snwmueecmfqqdurxedxv`. Ser du prod-ref → **hard stopp**: avbryt alt, opprett
security-issue (label `security`, milestone 9) med det du så, kommenter PR-en.
Ikke fortsett uansett. (Punkter som drives med Playwright-driveren dekker denne
vakten i scriptet — se steg 4.)

## Steg 4 — Verifiser hvert akseptansepunkt med tre uavhengige orakler

**Klassifiser hvert punkt først — to kjørefelt (#1219):**

- **Statisk/ukontrollert:** render, lenker, mount-effekter, og server-action-
  skjemaer som leser FormData (f.eks. login). Driv med `preview_click`/
  `preview_fill` som før.
- **Interaktivt (React onChange/state-drevet UI):** preview-MCP kan IKKE fyre
  React-events — DOM-verdien settes, men appen re-renderer aldri (verifisert
  #1173/#1219, gjelder også kjent-gode knapper). IKKE bruk budsjett på å prøve;
  driv punktet med en **Playwright-driver via Bash** (ekte browser-events):

  - Engangs-script (`.mjs`) i scratchpad, kjørt fra worktree-ROTA:
    `node --input-type=module --eval "$(cat <scratchpad>/driver.mjs)"`
    (playwright + chromium ligger klare i repoet).
  - Driv `http://localhost:<port>` — ALDRI `127.0.0.1` (Next 16 blokkerer
    cross-origin dev-ressurser; hydreringen dør stille og alle klikk er døde).
  - **FØR du stoler på noe resultat:** bekreft at serveren på porten er DENNE
    worktreen (`lsof -ti:<port>` → `lsof -a -p <pid> -d cwd`) — falsk-grønt-
    fella #1259 (en søster-worktrees server svarer ellers stille).
  - Login i scriptet: gå rett til `/login?step=verify&email=…&next=<målside>`,
    `waitForLoadState('networkidle')` FØR utfylling (hydrerings-race), så
    `pressSequentially(<OTP>)` — 8-sifret kode auto-submitter, IKKE klikk
    submit etterpå; fallback `press('Enter')` i catch. Ikke vent på action-
    redirecten (kan henge i minutter): vent på login-POST-ens 303, deretter
    `page.goto(<målside>)` direkte.
  - På app-sider: `domcontentloaded` + eksplisitt `waitForSelector` — aldri
    `networkidle` (realtime holder forbindelser åpne, den settler aldri).
  - Etter et skriv: ikke vent på redirect — poll DB-en via service-role til
    beviset er der (skriv + revalidering skjer FØR redirecten i action-ene).
  - **Oraklene bor i scriptet:** `page.on('console')` (errors) +
    `page.on('requestfailed')` (feillogg-orakel), `page.on('request')` som
    prod-vakt (assert HVERT Supabase-kall mot staging-ref — steg 3 for dette
    feltet), `locator('[data-testid=…]')`-assertions (struktur-orakel).
    Skriv resultatet som JSON, én rad per steg.

Per punkt kreves ALLE tre orakler, uansett kjørefelt:

1. **Struktur-orakel:** assertion på `data-testid`/rolle som beviser effekten
   (`preview_snapshot` eller Playwright-locator; aldri tekst-matching på norsk
   copy). Mangler appen en testid for å kunne asserte → legg den til i
   PR-branchen (legitim iterasjon).
2. **Feillogg-orakel:** console-errors tomme og failed requests tomme for
   flytens requests (`preview_console_logs`/`preview_network`, eller
   `page.on`-fangsten i driveren).
3. **SQL-orakel:** SELECT mot staging-DB (Supabase MCP) som bekrefter at
   skrivingen faktisk traff — antall rader og nøkkelverdier. Husk 0-rader-fella:
   tomt resultat der du forventet rader er FEIL, aldri suksess.

Testdata kjøringen oppretter navngis med `E2E-`-prefiks.

## Steg 5 — Fiks-loop

Rødt orakel → diagnostiser (les kode, logger) → fiks i PR-branchen → commit med
`Refs #N` → re-verifiser fra steg 3. Endring av test-assertions krever
begrunnelse i commit-body. Maks **5 iterasjoner eller 45 minutter** — det som
inntreffer først.

## Steg 6 — Grønt: post beviset

- Bygg kommentar i temp-fil og post med `gh pr comment <N> --body-file …`:

  ```markdown
  ## ✅ Staging-verifisert

  | Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
  |---|---|---|---|
  | <punkt> | `<testid-assertion>` ✅ | tom ✅ | <n> rader ✅ |

  Prod-vakt: alle kall mot staging-ref ✅. Testdata (E2E-…) slettet.
  <evt.: Akseptansepunktene er utledet fra diff — ingen kontrakt på issuet.>
  ```

- `gh pr edit <N> --add-label staging-verified`
- Rydd testdata: slett KUN rader denne kjøringen opprettet (E2E-prefiks +
  navnene du selv valgte) via SQL mot staging. Aldri bredt sveip.

## Steg 7 — Ikke grønt: eskaler

- `gh pr edit <N> --add-label needs-manual-qa`
- Norsk PR-kommentar: feiltilstand, hvilket steg/orakel som feilet (med
  logglinjer), hva som ble prøvd per iterasjon, og ÉN hypotese formulert så
  eieren kan svare A eller B uten å lese kode.
- La PR-en stå — aldri merge, aldri fjern delarbeid.
