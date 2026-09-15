# .changes/ — én notatfil per bruker-synlig endring

Hver `feat`/`fix`/`perf`-commit legger igjen én fil her i stedet for å bumpe
`package.json` og redigere `CHANGELOG.md`. Mandag morgen samler ukerutinen
(`.github/workflows/ukesversjon.yml`) alle notatene i **én** versjon og skriver
oppføringene inn i changeloggen. Da rører ingen PR de to filene alle andre PR-er
rører — som var kilden til de faste rebase-konfliktene.

`.githooks/commit-msg` blokkerer en `feat`/`fix`/`perf`-commit uten en ny fil her.
Er endringen intern (test-only, refactor, tooling), skriv `[no-changelog]` i
commit-body-en i stedet — som før.

## Filnavn

`<issue>-<kort-slug>.md`, for eksempel `1463-cupliste-alle.md`. Issue-løse
endringer bruker `x-<slug>.md`. Flere notater fra samme issue får ulik slug.
Navnet må være unikt — det er det som gjør at to økter aldri kolliderer.

## Mal

```markdown
---
type: feat
issue: 1463
title: Cupene dine samlet på ett sted
link: /admin/cup
cta: Åpne cupene
---
Cup-lista i Klubbhuset viser nå alle cupene du er med i, ikke bare dem du har satt opp selv.
```

En retting er kortere — `title`/`link`/`cta` hører kun til `feat`:

```markdown
---
type: fix
issue: 1539, 1551
---
Best ball i en cup gir deg nå de slagene du skal ha.
```

## Feltene

| Felt | Krav |
|------|------|
| `type` | `feat`, `fix` eller `perf`. Påkrevd. |
| `issue` | Ett nummer, eller en kommaliste (`1539, 1551`) når rettingen dekker flere. Utelates kun på `[no-issue]`-endringer. |
| `title` | Kun `feat`. Påkrevd der. ≤120 tegn — kort substantiv-frase, utgivelsens tema. |
| `link` | Kun `feat`. Intern sti som starter med `/` — dit brukeren ser det nye. |
| `cta` | Kun `feat`. ≤40 tegn, action-verb. Følger alltid `link`: begge eller ingen. |
| brødtekst | Linja(e) etter frontmatteren. ≤400 tegn, sikt på én setning. |

Ingen andre nøkler er tillatt, og ingen kommentarer på feltlinjene — ett ugyldig
notat stopper hele ukesslippet (fail-closed, med filnavnet i varselet).

`link` + `cta` utelates bevisst når funksjonen ikke har noen naturlig destinasjon
— en ren visuell endring uten egen side. Ellers tar du dem alltid med: det er de
som gjør oppføringen klar til å publiseres som in-app-lansering med ett klikk.

## Stemme

Brødteksten er changelog-linja. Samme regler som før: sporty kompis-energi,
action-verb, du-form, presens, «bare det en bruker ville merke». Full
format- og stemme-referanse: [`docs/changelog-conventions.md`](../docs/changelog-conventions.md).

## Tørrkjør før du er i tvil

```bash
node scripts/weekly-release.mjs --dry-run
```

Den viser hvilken versjon uka ville fått og nøyaktig hvilken CHANGELOG-diff
notatene dine gir — uten å skrive noe eller slette noe.

## Versjonering / CHANGELOG — regelen

> Flyttet ordrett fra CLAUDE.md (#2100); bare lenkemålene er justert til denne mappa.

Hver bruker-synlig commit (`feat`/`fix`/`perf`) MÅ legge igjen én **notatfil** under `.changes/` — og skal hverken bumpe `package.json` eller redigere `CHANGELOG.md`. Mandag morgen folder ukerutinen (`.github/workflows/ukesversjon.yml` + `scripts/weekly-release.mjs`) alle ukas notater til **én** versjon og skriver oppføringene inn i changeloggen som ukas blokk (`feat` → en funksjonsrad, `fix`/`perf` → en linje i blokkas rettinger-skuff). Footeren (`AppVersionFooter.tsx`) viser dermed ett versjonsnummer per uke, ikke ett per commit. Når ukes-PR-en er merget, gir `.github/workflows/ukeslipp-release.yml` versjonen en git-tag (`v1.236.0`) og en release på GitHubs slipp-side med ukas blokk som tekst — uten håndgrep (#2019). **Intern** endring som likevel shippes som `fix` (test-only, refactor, tooling) → ingen notatfil; skriv `[no-changelog]` i commit-body-en.

Hvorfor: `package.json` + `CHANGELOG.md` var to filer alle PR-er rørte — altså garantert rebase-konflikt mellom parallelle økter. Notatfilene har unike navn og kan ikke kollidere. Deploy-rytmen er uendret: merge til `main` deployer fortsatt rett til prod.

**Håndheves av `.githooks/commit-msg`** — den blokkerer feat/fix/perf-commits uten en ny fil under `.changes/` (og uten `[no-changelog]`), OG alle commits unntatt `chore(release)` som endrer `version`-feltet i `package.json`. Feltet eies av ukerutinen.

- **Notatfil:** `.changes/<issue>-<slug>.md` (issue-løs: `x-<slug>.md`), frontmatter `type` + `issue`, og for `feat` også `title`/`link`/`cta`. Mal og feltgrenser: [`.changes/README.md`](README.md). Ett ugyldig notat stopper hele ukesslippet (fail-closed), så hold deg til malen.
- **Tørrkjøring:** `node scripts/weekly-release.mjs --dry-run` viser hvilken versjon uka ville fått og nøyaktig hvilken CHANGELOG-diff notatene gir — uten å skrive noe.
- **Ikke bruker-synlig?** Bytt prefix til `docs/refactor/test/chore/style/ci/build` — de passerer fritt.
- **CHANGELOG-format:** [`docs/changelog-conventions.md`](../docs/changelog-conventions.md) (les FØR du skriver et notat). Én ukeblokk per slipp under `## Ukeslipp` (funksjonsrader + rettinger-skuff), én linje per endring; ingen Teknisk-blokk (den bor i issue-closing-kommentaren), ingen humanizer påkrevd.
- Aldri `--no-verify` for å omgå hooken (bash-guard blokkerer den uansett).
