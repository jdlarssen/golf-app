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
