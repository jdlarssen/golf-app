# CHANGELOG-konvensjoner

Format-regler for `CHANGELOG.md`. Når-regler (PATCH/MINOR/MAJOR-bump) og hook-håndheving står i [CLAUDE.md](../CLAUDE.md) under «Versjonering / CHANGELOG».

Trigger: HTML-kommentaren øverst i `CHANGELOG.md` peker hit. `.githooks/commit-msg` peker også hit når den blokkerer.

## Tre-lags struktur

`CHANGELOG.md` er designet for å være lesbar for både utvikler og produkteier (Jørgen er stakeholder, ikke utvikler):

1. **Per-minor-serie tema-heading** (`## 0.X.y — [navn på temaet]`) med 1–2 setningers sammendrag av hva som ble gjort i den serien. Kun den nyeste minor-serien står åpen; alle eldre minor-serier wrappes i et `<details>`-element (med `<summary><strong>0.X.y — [tema] (N oppføringer) — klikk for å vise</strong></summary>`) slik at fila kan scrolles raskt.

2. **Per-versjon oppføring** (`### [X.Y.Z] - YYYY-MM-DD`) ledes med en stakeholder-tagline på vanlig norsk, satt som blockquote (`> …` — ikke bold, fordi lange bold-avsnitt er tunge å lese). Tagline-en forklarer hva endringen betyr for brukeren, ikke hva som ble endret i koden.

3. **Teknisk historikk** i et `<details><summary>Teknisk</summary>...</details>`-element under tagline-en, med [Keep a Changelog](https://keepachangelog.com/no/)-underseksjoner (`#### Added`, `#### Changed`, `#### Fixed`, `#### Removed`) og prosa-bullet points. (For oppføringer som ligger inne i en allerede-collapset minor-serie kan du droppe den indre `<details>`-en — den ytre tar seg av kollapsen.)

## Tagline-veiledning

Nyeste øverst, norsk på alt brukerrettet. Når du legger til en ny oppføring: skriv tagline-en *først*. Hvis du sliter med å forklare hva som endret seg på Jørgen-språk («Du kan nå …», «Forhindrer at …», «Hvis X skjer, sier appen nå …»), er det et tegn på at endringen kanskje ikke fortjener egen oppføring — sjekk skip-listen i CLAUDE.md.

## Språk-kvalitet på taglines

Når du skriver en ny tagline (`> …`-blockquote) eller serie-summary, kjør `humanizer:humanizer`-skillet (fra `floka-marketplace`) på teksten først — særlig norsk-seksjonen om anglisismer (`entry/features/release/by default`), særskriving, em-dash-kjeder, og «X-spillet»-redundans (`slagspill-spillet` → `slagspillet`, `matchplay-spillet` → `matchen`).

Tekniske `<details>`-seksjoner er utvikler-prosa og trenger ikke samme stramming.

Bakgrunn: [PR #170](https://github.com/jdlarssen/golf-app/pull/170) (2026-05-24) ryddet 39 historiske AI-tells; målet er å holde nye oppføringer på samme nivå.

Full pattern-katalog for bruker-rettet copy: [`docs/copy-style.md`](copy-style.md).

## Når en ny minor-serie åpnes

Når en ny minor-serie åpnes (f.eks. `1.8.0` → `1.9.0`), pakk den forrige (nå nest-nyeste) serien inn i `<details>` med samme `<summary><strong>…</strong></summary>`-mønster som de eldre. Bare den helt ferskeste minor-serien skal stå åpen.
