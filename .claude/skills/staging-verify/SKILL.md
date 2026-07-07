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
Ikke fortsett uansett.

## Steg 4 — Verifiser hvert akseptansepunkt med tre uavhengige orakler

Driv flyten med `preview_click`/`preview_fill`. Per punkt kreves ALLE tre:

1. **Struktur-orakel:** `preview_snapshot`-assertion på `data-testid`/rolle som
   beviser effekten (aldri tekst-matching på norsk copy). Mangler appen en
   testid for å kunne asserte → legg den til i PR-branchen (legitim iterasjon).
2. **Feillogg-orakel:** `preview_console_logs` (level=error) tom og
   `preview_network` (filter=failed) tom for flytens requests.
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
