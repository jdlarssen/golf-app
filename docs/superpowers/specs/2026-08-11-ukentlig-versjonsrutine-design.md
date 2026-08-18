# Ukentlig versjonsrutine — design

> **Utdatert på ett punkt:** rendering-formatet under er erstattet av ukeblokker — se [#1702](https://github.com/jdlarssen/golf-app/issues/1702) / `.forge/contracts/1702-changelog-ukeslipp.md`. Resten av dokumentet står som det ble skrevet.

**Issue:** [#1562](https://github.com/jdlarssen/golf-app/issues/1562) · **Dato:** 2026-08-11 · **Status:** design godkjent av eier i økt (retning A av tre presenterte alternativer)

## Mål

I prioritert rekkefølge fra eier-økta 2026-08-11:

1. **Fjerne systematiske rebase-konflikter** mellom parallelle økter: i dag MÅ hver bruker-synlig commit bumpe `package.json` og legge en linje i `CHANGELOG.md` — to filer alle PR-er rører, altså garantert konflikt ved parallellarbeid.
2. **Ryddigere versjonsbilde:** ett versjonsnummer per uke i footeren (`AppVersionFooter.tsx`), ikke flere bump daglig.
3. **Uendret changelog-kvalitet:** samme format, samme stemme, samme lanserings-flyt (`/admin/lanseringer` leser de fire feltene fra Funksjon-rader).

## Ikke-mål (eksplisitt avgrenset)

- **Deploy-rytmen røres ikke.** Merge til `main` deployer fortsatt rett til prod. Versjonsnummeret blir et ukestempel, ikke et deploystempel.
- Eierens øvrige mål fra økta — «mindre risiko i prod» og «samlet ukentlig testing» — er **fase 2** (hybrid-tog: feature-slipp via eget staging-miljø, feilrettinger direkte). Vurderes i eget issue etter at denne rutinen har virket noen uker. Fullt release-tog (alt venter på ukesslipp) ble frarådet og valgt bort så lenge appen har ekte brukere i prod.

## Løsning

Tre deler: notatfiler, ukerutine, hook-omskriving.

### 1. `.changes/`-notatfiler

Hver bruker-synlig commit (`feat`/`fix`/`perf`) legger igjen én markdown-fil i `.changes/` i stedet for å røre `package.json`/`CHANGELOG.md`:

```markdown
---
type: feat            # feat | fix | perf
issue: 1463           # utelates kun ved [no-issue]-commits
title: Cupene dine samlet på ett sted   # kun feat, ≤120 tegn
link: /admin/cup      # kun feat; utelates kun per unntaksregelen i changelog-conventions
cta: Åpne cupene      # kun feat, ≤40 tegn, kun sammen med link
---
Cup-lista i Klubbhuset viser nå alle cupene du er med i, ikke bare dem du har satt opp selv.
```

- **Filnavn:** `<issue>-<kort-slug>.md` (f.eks. `1463-cupliste-alle.md`); issue-løse commits bruker `x-<slug>.md`. Unikt navn per endring — to økter skriver hver sin fil og kan ikke kollidere. Flere notater fra samme issue får ulik slug.
- **Brødteksten** følger samme regler som dagens CHANGELOG-linjer (`docs/changelog-conventions.md`): én setning på Jørgen-språk, brand-stemme, «bare det en bruker ville merke».
- **Interne endringer:** `[no-changelog]` i commit-body som i dag → ingen notatfil.
- `.changes/README.md` (committes sammen med mappa) forklarer formatet kort og peker på `docs/changelog-conventions.md`.

### 2. Ukerutinen

`.github/workflows/ukesversjon.yml` + `scripts/weekly-release.mjs`, samme mønster som `dok-skjema.yml` (cron + `workflow_dispatch`, fail-closed: rød kjøring → Discord-varsel + alert-issue med milestone 9).

- **Cron:** `0 3 * * 1` — mandag 03:00 UTC = 05:00 Oslo sommertid / 04:00 vintertid. Eiervalg: mandag tidlig morgen, før morgenbriefen.
- **Steg:**
  1. Sjekk ut `main`. Finnes ingen notatfiler → exit 0 (ingen tom versjon).
  2. Valider alle notatfiler (frontmatter-felt, grenser). Ugyldig fil → fail-closed med filnavn i alert-issuet.
  3. Bump-type: minst ett `feat`-notat → `minor`, ellers `patch`. `npm version <type> --no-git-tag-version` (stager også `package-lock.json`).
  4. Render CHANGELOG i dagens format:
     - Hvert `feat`-notat → egen Funksjon-rad øverst: `<details><summary><strong>X.Y · {title}</strong></summary>` + `[#N] — {brødtekst}` + `↳ {link} · «{cta}»`. Flere feats samme uke deler ukas `X.Y`.
     - Hvert `fix`/`perf`-notat → én linje i inneværende måneds skuff under Feilrettinger: `- \`X.Y.Z\` · [#N](…) — {brødtekst}` med ukas fulle versjon. Ny måned → ny `<details>`-skuff; skuffens teller («… · N rettinger») oppdateres.
  5. Slett notatfilene.
  6. Commit `chore(release): vX.Y.Z — uke <ISO-uke>` og åpne PR mot `main` med body som sier at dette er ren bokføring (ingen produktvalg-heading → Discord-PR-kortet auto-merger når sjekkene er grønne).
- **Løst i #1701 (fella var feildiagnostisert her):** PR-er opprettet med `github.token` får kjøringene sine *parkert* som `action_required` («Approve and run») etter GitHubs endring 11. juni 2026 — de mangler ikke, de venter på et klikk. Produsentene åpner derfor PR-en med `PR_AUTHOR_PAT`, og #1469-dispatch-fallbacken er fjernet som død kode. Regel + eier-oppsett: `docs/loops/discord-pr-kort.md`, «Robot-åpnede PR-er må ha menneskelig forfatter (#1701)».

### 3. Hook-omskriving (`.githooks/commit-msg`)

- `feat`/`fix`/`perf`-commits: krav om **minst én ny fil under `.changes/`** i commiten (`git diff --cached --name-only --diff-filter=A`), ELLER `[no-changelog]` i body. Feilmeldingen viser notatfil-malen.
- **Nytt vern:** `feat`/`fix`/`perf` (og alle andre typer unntatt `chore(release)`) skal IKKE endre `version`-feltet i `package.json` — det eies av ukerutinen. Blokker med forklaring.
- **Bump-type-vakta** (feat→minor, fix/perf→patch) fjernes fra hooken; logikken bor nå i `weekly-release.mjs` steg 3.
- Issue-referanse-regelen (`Refs #N` / `[no-issue]`) er uendret. `.githooks/pre-commit` sin CHANGELOG-kilde-tag-sjekk står uendret (manuelle CHANGELOG-rettelser forekommer fortsatt, f.eks. tekst-korreksjoner).

## Versjonssemantikk etter omleggingen

- Én versjon per uke *med innhold*; tomme uker gir ingen versjon.
- Funksjon-rader bruker to-delt form i summary (`1.232 · Tittel`), Feilrettinger full form (`` `1.232.0` ``) — som i dag, men delt på tvers av ukas endringer.
- CHANGELOG-headerens SemVer-omtale justeres: versjonen følger semver-form, men bumpes ukentlig samlet, ikke per endring.
- Mellom to mandager viser footeren forrige ukes nummer selv om nye endringer er deployet — akseptert av eier (det er selve målet «ryddigere versjonsnummer»).

## Dokument-oppdateringer (samme PR som koden)

| Fil | Endring |
|---|---|
| `CLAUDE.md` → «Versjonering / CHANGELOG» | Omskrives til notatfil-regimet (hva en commit skal gjøre, hva hooken håndhever, peker til ukerutinen) |
| `docs/changelog-conventions.md` | Nytt avsnitt om notatfil-formatet + justert versjonssemantikk; oppføringsformatene står |
| `docs/agent-discipline/bindings.md` §T6 | Metadata-reglene (prefix → bump) erstattes med prefix → notatfil |
| `docs/loops/nattkjoreren.md` (~linje 139) | «versjonsbump/CHANGELOG per commit» → notatfil per commit |
| `docs/loops/kontrakt-smeden.md` | Klassifiseringsregelen beholdes i substans; ordlyden «ville fått en CHANGELOG-linje» → «ville fått en notatfil (= CHANGELOG-linje ved ukesslipp)» |

Utroperen og morgenbriefen er uberørt: begge leser `CHANGELOG.md` på `main` som før — oppføringene kommer bare i ukentlige puljer.

## Overgang

- Ingen migrering av eksisterende CHANGELOG-innhold. Gjeldende versjon (1.231.2 per 2026-08-11) står i footeren til første ukesslipp.
- Åpne PR-er skrevet under gammelt regime må ved rebase konvertere bump+CHANGELOG-linje → notatfil (engangs; nevnes i implementasjons-PR-ens body).
- Rutinen aktiveres ved merge; første reelle kjøring påfølgende mandag. Før merge tørrkjøres skriptet lokalt med syntetiske notater (`workflow_dispatch` kan ikke brukes før workflowen ligger på `main`); etter merge verifiseres første kjøring manuelt via `workflow_dispatch` (se Testing).
- **Kappløp med samtidige merges:** ukes-PR-en sletter kun notatfilene den leste. Et notat som merges mens ukes-PR-en er åpen er en annen fil, gir ingen konflikt, og blir med i neste ukes slipp.

## Testing

- **Type A** (ren logikk, vitest + fixtures): notat-parsing/validering, bump-valg (feat/fix-miks, tom uke), CHANGELOG-innsetting — inkl. månedsskuff-rollover, teller-oppdatering og fler-feat-uker. `weekly-release.mjs` struktureres så render-logikken er importerbar og testbar uten git/nettverk.
- **Hook:** manuelle røyk-tester i bygge-økta (commit med/uten notatfil, med `[no-changelog]`, med utilsiktet version-endring) — dokumenteres som bevis i PR-en, ikke som automatiske tester.
- Ingen UI-/e2e-endringer.

## Risiko og reversibilitet

- **Reversibelt uten datatap:** gjeninnfør gammel hook + slett workflow; CHANGELOG-formatet er uendret så historikken er intakt.
- **Konfliktvinduet** krymper fra «alle PR-er mot alle» til «ukes-PR-en mot det som merges akkurat da» — én kort eksponering per uke.
- **Verifiseringspunkt første kjøring:** at kjøringene på bokførings-PR-en starter uten «Approve and run» (#1701, PAT-forfatterskap) og at Discord-PR-kortet auto-merger den.
