# CHANGELOG-konvensjoner

Format-regler for `CHANGELOG.md`. Når-regler (PATCH/MINOR/MAJOR-bump) og hook-håndheving står i [CLAUDE.md](../CLAUDE.md) under «Versjonering / CHANGELOG».

Trigger: HTML-kommentaren øverst i `CHANGELOG.md` peker hit. `.githooks/commit-msg` peker også hit når den blokkerer. **Les denne fila før du legger til eller flytter en oppføring** — da holder stilen seg selv om det går måneder mellom hver gang.

## Strukturen i fila

Alt ligger i én fil, men sterkt sammenfoldet så den er lett å skumme:

1. **Nyeste minor-serie står åpen** øverst (`## 1.X.y — [tema]` + intro + oppføringer). Det er det eneste du ser uten å klikke — ferske endringer er alltid synlige.
2. **Alt eldre ligger under `## Tidligere versjoner`**, gruppert i **skuffer** (`<details>`-elementer). Hver skuff samler en epoke. Åpner du en skuff, ser du seriene i den (hver serie er fortsatt sammenfoldet; bare den tekniske detaljen per oppføring er innerst).

Så toppen av fila er nyeste serie + ni skuff-linjer, ikke 80 serier på rad.

## Per-versjon oppføring + kilde-tag (viktig)

Hver versjons-overskrift har formen:

```
### [X.Y.Z] - YYYY-MM-DD · <kilde>
```

`<kilde>` forteller **hvor endringen kom fra**, synlig uten å åpne «Teknisk»:

- **`#N`** — endringen kom fra et GitHub-issue (typisk nyutvikling). Bare `#N` (GitHub auto-lenker det). Flere issues → komma: `· #357, #367`.
- **`bug`** — feilretting som kom fra en rapportert bug, ikke et issue.
- **(ingen tag)** — bevisst tomt for tidlige oppføringer (1.0–1.14, 0.x) som er fra før vi brukte GitHub Issues. Vi gjetter ikke.

Regelen for hvilken som velges: issue navngitt i oppføringen → `#N`. Ellers seriens primær-issue (det første `#N` i serie-introen) → `#N`. Ellers, hvis oppføringen tydelig kun er en feilretting (`#### Fixed`, ingen `#### Added`/`#### Changed`) → `bug`. Ellers ingen tag.

## Skuff-inndeling (epic-først, tiere som fallback)

Skuffene er **sammenhengende versjons-intervaller** navngitt etter det dominerende epic-et i intervallet — eller tema/tiere når det ikke er ett klart epic. Dagens skuffer (nyeste øverst):

| Skuff | Intervall |
|-------|-----------|
| Opprettelse & påmelding (#22, #366, #365) | 1.73–1.76 |
| Flyt-polish, varsler & end-game (#354–377) | 1.60–1.72 |
| Format-katalogen: scramble & matchplay (#270) | 1.43–1.59 |
| Ryder Cup & format-fundament (#47, #270) | 1.38–1.42 |
| Baner, selvreg & sideturnering (#223 m.fl.) | 1.25–1.37 |
| Innboks, handicap & hurtig-oppsett | 1.15–1.24 |
| Spillmodi-grunnmuren & verktøy | 1.5–1.14 |
| Stabil lansering & tee-bokser | 1.0–1.4 |
| Pre-stabil historikk | 0.x |

Skuff-summary: `<summary><strong>[skuff-navn] — N serier</strong></summary>` — **uten** «klikk for å vise» (overflødig; GitHub viser allerede en pil).

Serie-summary inne i en skuff: `<summary><strong>1.X.y — [tema] (N oppføringer)</strong></summary>` — også uten «klikk for å vise», og uten en intern `## 1.X.y`-overskrift (summary-en er etiketten).

## Vedlikehold fremover — slik holder stilen seg selv

To situasjoner, og du trenger ikke korrigere noen av dem:

1. **Hver ny endring:** den nye `### [X.Y.Z]`-linja legges øverst i den åpne serien, med kilde-tag (`· #N`/`· bug`) med én gang. Ferske endringer ser du uten å klikke.
2. **Når en ny minor-serie åpnes** (f.eks. 1.77 → 1.78): den forrige serien lukkes og legges i riktig skuff — epic-skuffen sin hvis den hører til et epic, ellers den nyeste tema-skuffen (eller en ny skuff hvis temaet er nytt). Dette er den eneste gjentakende håndteringen, ~én gang i uka, og den som lager 1.78-oppføringen gjør den.

Voks-grensen: en skuff trenger ikke balanseres — den vokser bare. Når et nytt epic dukker opp, får det sin egen skuff; ellers utvider nyeste tema-skuff seg.

## Per-versjon innhold (tagline + Teknisk)

Under hver `### [X.Y.Z]`-overskrift:

- **Stakeholder-tagline** på vanlig norsk, satt som blockquote (`> …` — ikke bold, fordi lange bold-avsnitt er tunge å lese). Tagline-en forklarer hva endringen betyr for brukeren, ikke hva som ble endret i koden.
- **Teknisk historikk** i et `<details><summary>Teknisk</summary>…</details>`-element under tagline-en, med [Keep a Changelog](https://keepachangelog.com/no/)-underseksjoner (`#### Added`, `#### Changed`, `#### Fixed`, `#### Removed`) og prosa-bullet points.

## Tagline-veiledning

Nyeste øverst, norsk på alt brukerrettet. Når du legger til en ny oppføring: skriv tagline-en *først*. Hvis du sliter med å forklare hva som endret seg på Jørgen-språk («Du kan nå …», «Forhindrer at …», «Hvis X skjer, sier appen nå …»), er det et tegn på at endringen kanskje ikke fortjener egen oppføring — sjekk skip-listen i CLAUDE.md.

## Språk-kvalitet på taglines

Når du skriver en ny tagline (`> …`-blockquote) eller serie-/skuff-summary, kjør `humanizer:humanizer`-skillet (fra `floka-marketplace`) på teksten først — særlig norsk-seksjonen om anglisismer (`entry/features/release/by default`), særskriving, em-dash-kjeder, og «X-spillet»-redundans (`slagspill-spillet` → `slagspillet`, `matchplay-spillet` → `matchen`).

Tekniske `<details>`-seksjoner er utvikler-prosa og trenger ikke samme stramming.

Bakgrunn: [PR #170](https://github.com/jdlarssen/golf-app/pull/170) (2026-05-24) ryddet 39 historiske AI-tells; målet er å holde nye oppføringer på samme nivå.

Full pattern-katalog for bruker-rettet copy: [`docs/copy-style.md`](copy-style.md).
