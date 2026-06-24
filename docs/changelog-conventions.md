# CHANGELOG-konvensjoner

Format-regler for `CHANGELOG.md`. Når-regler (PATCH/MINOR-bump) og hook-håndheving står i [CLAUDE.md](../CLAUDE.md) under «Versjonering / CHANGELOG».

Trigger: HTML-kommentaren øverst i `CHANGELOG.md` peker hit. `.githooks/commit-msg` peker også hit. **Les denne fila før du legger til en oppføring.**

## Hva changeloggen er (og ikke er)

Changeloggen er et tynt, lesbart **hva-er-nytt-feed** for deg som eier og for app-brukerne — ikke et utviklerarkiv. Den tekniske historikken (hvilke filer, hvilken approach) bor i **issue-ets closing-kommentar** (`## Teknisk`) og i **commit-meldingene** (`Refs #N`). Ikke dupliser den her — det var nettopp den duplikatet som gjorde fila uleselig (10 000+ linjer). Én linje per endring, det er alt.

## Strukturen i fila

Tre seksjoner, nyeste øverst:

1. **`## Funksjoner`** — én sammenleggbar rad per utgivelse (det `feat`-en som åpnet en minor). Sammendraget er `versjon · tittel`; bretter du ut, ser du brødteksten. Alle foldet som standard.
2. **`## Feilrettinger`** — alle `fix`/`perf` som korte én-linjere, gruppert i måneds-skuffer (`<details>` per måned), nyeste måned øverst.
3. **`## Før 1.0 — alfa-historikk`** — 0.x-historikken, bevart i gammelt format, foldet bort. Røres ikke.

## Funksjon-oppføring (de fire Lanserings-feltene)

En funksjon bærer de samme fire feltene som `/admin/lanseringer`-skjemaet (`product_updates`), så den kan limes rett inn og publiseres som en in-app-lansering:

```
<details>
<summary><strong>1.142 · Et ryddigere oppsett</strong></summary>

Spill-oppsettet ligger i panel du bretter ut når du trenger dem, og et publisert spill viser spillformen som et lite kort.

↳ /opprett-spill · «Sett opp en runde»

[#909](https://github.com/jdlarssen/golf-app/issues/909)
</details>
```

| Felt | Lansering-felt | Grense | Hentes fra |
|------|----------------|--------|------------|
| Tittel (i `<summary>`, etter `versjon ·`) | `title` | ≤120 | utgivelsens tema, kort substantiv-frase |
| Brødtekst (avsnittet) | `body` | ≤400 (sikt på én setning) | hva du nå kan gjøre, invitérende |
| `↳ /lenke` | `link` | intern, starter med `/` | valgfri dyplenke til featuren |
| `«cta»` (etter lenka) | `cta_label` | ≤40, kun med lenke | valgfri knapp-tekst |

**Lenke + cta er valgfrie** — ta dem med når funksjonen har en naturlig dyplenke å lansere mot. Historiske funksjoner (før denne omleggingen) har kun tittel + brødtekst; de fylles ikke med lenker i etterkant.

## Feilrettings-oppføring

Én linje under inneværende måneds-skuff:

```
- `1.142.1` · [#924](https://github.com/jdlarssen/golf-app/issues/924) — Liga-runder med en frist som alt har vært stoppes med en gang.
```

- `versjon` i backticks (tabulær), så issue-lenke, så `—` og **én kort setning** som beskriver den forbedrede tilstanden («Lange navn dytter ikke lenger …»), ikke «Fikset at …».
- Issue-løs retting (sjelden, pre-issue-æra): dropp lenka — `- \`1.0.1\` — …`.
- Ny måned → åpne en ny `<details>`-skuff øverst i `## Feilrettinger` (`<summary><strong>Juli 2026 · N rettinger</strong></summary>`).

## Hvem havner hvor

Versjonsdisiplinen avgjør det nesten alene: `feat` → minor → **Funksjoner**; `fix`/`perf` → patch → **Feilrettinger**. En patch som la til en liten capability (`#### Added` i en `.y`) hører likevel i Feilrettinger — Funksjoner-lista skal være én ren linje per utgivelse. Vil du headline en spesielt stor patch-funksjon, løft den manuelt opp som egen Funksjon-rad.

## Bare det en bruker ville merke

Skriv kun en oppføring for endringer en bruker faktisk merker. Rene interne fikser (test-only, refactor som shippes som `fix`, åpenbar tooling) får **ingen** linje — bruk `[no-changelog]` i commit-body-en så hooken slipper deg forbi. Sliter du med å skrive linja på Jørgen-språk, er det et tegn på at endringen ikke fortjener en oppføring.

## Stemme

Brand-stemme: sporty kompis-energi, action-verb, du-form, presens. Funksjon = «her er hva som er nytt»; retting = «dette er bedre nå». Norske idiomer, «»-anførsel, ingen særskriving, behold Tørny-termene (banehandicap, slagspill, stableford, sideturnering, scorekort). Humanizer-skillet er **ikke** lenger påkrevd på oppføringer — én ren setning trenger det ikke.

## Den gamle Teknisk-historikken

Før denne omleggingen bar hver oppføring en `<details><summary>Teknisk</summary>`-blokk. Den er fjernet fra fila, men ikke tapt: den ligger i git-historikken (commit før omleggingen, [#952](https://github.com/jdlarssen/golf-app/issues/952)) og i issue-enes closing-kommentarer. Trenger du den, `git show` den gamle fila.
