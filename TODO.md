# Tørny — backlog er flyttet til GitHub Issues

Backlogen ligger nå i **[GitHub Issues](https://github.com/jdlarssen/golf-app/issues)** (migrert 2026-05-16).

## Hvor finner du hva

- **Alle åpne oppgaver:** https://github.com/jdlarssen/golf-app/issues
- **Filtrér på område:** `area:scorecard`, `area:leaderboard`, `area:auth`, `area:admin`, `area:scoring`, `area:ui`, `area:pwa`, `area:offline-sync`, `area:mail`, `area:courses`, `area:tee-boxes`
- **Filtrér på type:** `bug`, `enhancement`, `performance`, `security`, `refactor`, `tests`, `design`, `i18n`, `documentation`
- **Filtrér på scope:** `epic`, `needs-brainstorming`, `blocks-club-scale`, `deferred-from-v1`, `post-pilot`
- **Pilot-feedback:** `feedback` (eksisterende — fra pilot eller admin)

## Praktiske filtre

- **Blokkere klubb-skala:** [`label:blocks-club-scale`](https://github.com/jdlarssen/golf-app/issues?q=is%3Aissue+is%3Aopen+label%3Ablocks-club-scale)
- **Trenger brainstorming først:** [`label:needs-brainstorming`](https://github.com/jdlarssen/golf-app/issues?q=is%3Aissue+is%3Aopen+label%3Aneeds-brainstorming)
- **Store features (epics):** [`label:epic`](https://github.com/jdlarssen/golf-app/issues?q=is%3Aissue+is%3Aopen+label%3Aepic)
- **Deferred fra v1.0:** [`label:deferred-from-v1`](https://github.com/jdlarssen/golf-app/issues?q=is%3Aissue+is%3Aopen+label%3Adeferred-from-v1)

## Hvordan legge til ny oppgave

Bruk `gh issue create` eller GitHub-UI:

```bash
gh issue create --repo jdlarssen/golf-app \
  --title "Kort tittel" \
  --body "Beskrivelse — hva, hvorfor, hvor i koden" \
  --label "enhancement,area:scorecard"
```

Velg minst én **type**-label (`enhancement`/`bug`/`performance`/…) og minst én **area**-label hvis det er klart hvilket område som berøres.
