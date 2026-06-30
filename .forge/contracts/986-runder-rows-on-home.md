# Kontrakt: «Runder»-rader for avsluttede spill på Hjem

**Issue:** [#986](https://github.com/jdlarssen/golf-app/issues/986)
**Type:** Presentasjonsforbedring + delt-helper-konsolidering (ingen ny flyt, ingen skjema/RLS/auth-endring)
**Berører:** `lib/games/` (ny delt helper + TDD-test), `app/[locale]/page.tsx` (Hjem), `app/[locale]/profile/historikk/page.tsx` (konsumerer samme helper)
**Bump:** MINOR (bruker-synlig forbedring) → én Funksjon-linje i CHANGELOG

## Eier-beslutninger (avklart 2026-06-30)

1. **Scope:** Kun **Hjem**. `/spill-arkiv` beholder dagens måned-grupperte kort uendret.
2. **Datalag:** **Delt rad-bygger-helper** — én kilde for brutto/netto-beregningen som både Hjem og historikk bruker, så de ikke driver fra hverandre.
3. **Hale (default, ikke spurt):** Behold «siste 3 + Se alle»-mønsteret på Hjem.
4. **9-hull/ufullstendige runder (default, ikke spurt):** `GameHistoryRow`-eksisterende oppførsel — «—» for brutto, dropp netto. Ingen ny logikk.

## Nåværende tilstand (grounding)

- `getFinishedGamesForUser` ([lib/games/getFinishedGamesForUser.ts:48-73](lib/games/getFinishedGamesForUser.ts)) returnerer `FinishedGame[]` (id, name, ended_at, game_mode, mode_config, courses{name}, result_summary). **Henter ikke scorer eller `course_handicap`.**
- Hjem `sectionFinished` ([app/[locale]/page.tsx:482-506](app/[locale]/page.tsx)) rendrer `FinishedGameCard` for `finishedGames.slice(0,3)`, «Se alle» → `/spill-arkiv` når `length > 3`.
- `GameHistoryRow` ([components/stats/GameHistoryRow.tsx:3-39](components/stats/GameHistoryRow.tsx)) er rent presentasjonelt. Props: `href, dateLabel, courseName, formatLabel, resultText, resultIsWin, brutto, nettoLabel`. Har render-test ([GameHistoryRow.test.tsx](components/stats/GameHistoryRow.test.tsx)).
- Historikk `roundsContent` ([app/[locale]/profile/historikk/page.tsx:238-250, 434-474](app/[locale]/profile/historikk/page.tsx)) beregner `brutto = Σ strokes` (null hvis ingen hull), `netto = brutto − course_handicap` (null hvis brutto/handicap mangler), og bygger `GameHistoryRow`-props med i18n på kallstedet (`t`/`tModes`/`tFinished`).

## Design

### 1. Delt brutto/netto-helper (ren logikk → TDD, Type A)

Ny modul `lib/games/roundScore.ts` med ren funksjon:

```ts
export function computeRoundScore(
  strokes: number[],            // spillerens strokes for runden (kan være tom)
  courseHandicap: number | null,
): { brutto: number | null; netto: number | null }
```

- `brutto`: `strokes.length > 0 ? sum(strokes) : null`.
- `netto`: `brutto != null && courseHandicap != null ? brutto − courseHandicap : null`.

Dette er den eneste drift-utsatte logikken (samme regel i to flater). i18n forblir på kallstedet (jf. `GameHistoryRow` er presentasjonelt + #572-mønsteret «strukturert data, format på kallstedet»). Helper-en formaterer IKKE strenger.

Historikk-siden refaktoreres til å kalle `computeRoundScore` i stedet for sin inline `bruttoSum`/`nettoSum` (linje 238-250). Atferd uendret — eksisterende historikk-rader ser likt ut.

### 2. Hjem henter scorer + course_handicap for de 3 nyeste

Ny tynn fetch-helper (i `lib/games/`, f.eks. `getRecentRoundScores.ts`, eller en ekstra return-del fra Hjems eksisterende fetch) som for et sett `gameId`-er henter spillerens `scores.strokes` + sin `game_players.course_handicap`. Brukes KUN på `finishedGames.slice(0,3)` på Hjem — billig (3 spill). `getFinishedGamesForUser` beholdes uendret som liste/teller-kilde (for «Se alle»-halen).

Hjem `sectionFinished` rendrer `GameHistoryRow` (samme delte-rad-mønster i ett `Card`) i stedet for `FinishedGameCard`, med:
- `href` → `/games/${id}/leaderboard?from=/` (eller eksisterende Hjem-retur-param)
- `dateLabel` → kort dato (locale)
- `courseName`, `formatLabel` (`tModes`), `resultText`/`resultIsWin` (samme badge-logikk som i dag)
- `brutto`/`nettoLabel` fra `computeRoundScore` + `t('roundNetto', …)`

«Se alle»-halen (siste 3 + lenke til `/spill-arkiv` når `length > 3`) beholdes.

## Suksesskriterier

- [ ] **K1 — Delt helper finnes + TDD.** `lib/games/roundScore.ts::computeRoundScore` finnes med unit-test (`roundScore.test.ts`) som dekker: tom strokes → `brutto=null, netto=null`; strokes uten handicap → `netto=null`; strokes + handicap → korrekt netto; `it.each` for et par cases. Test skrevet før implementasjon (rød → grønn).
- [ ] **K2 — Historikk bruker helper-en.** `profile/historikk/page.tsx` beregner brutto/netto via `computeRoundScore` (ikke inline duplisert). Historikk-rader uendret visuelt/verdimessig.
- [ ] **K3 — Hjem rendrer rader.** `sectionFinished` på Hjem rendrer `GameHistoryRow`-rader (ikke `FinishedGameCard`) for de 3 nyeste avsluttede spillene, med brutto (hero) + netto.
- [ ] **K4 — Datalag henter scorer for top-3.** Hjem henter spillerens strokes + `course_handicap` for de 3 viste spillene (ikke for alle avsluttede). Verifisert: brutto/netto vises korrekt på Hjem mot faktiske scorer på staging.
- [ ] **K5 — «Se alle»-hale beholdt.** «Se alle» → `/spill-arkiv` vises fortsatt når brukeren har > 3 avsluttede spill.
- [ ] **K6 — Ufullstendige runder.** 9-hulls/ufullstendige runder uten full score viser «—» for brutto og dropper netto (GameHistoryRow-default) — ingen krasj.
- [ ] **K7 — Porter grønne + versjon.** `tsc --noEmit` rent, lint rent, co-located tester grønne (`roundScore.test.ts`, `GameHistoryRow.test.tsx`), MINOR-bump + én Funksjon-linje i CHANGELOG.
- [ ] **K8 — Staging-verifikasjon.** På Hjem mot staging vises avsluttede spill som tette rader med korrekt brutto/netto; tap på en rad navigerer til riktig leaderboard.

## Gates

```bash
npx vitest run lib/games/roundScore.test.ts components/stats/GameHistoryRow.test.tsx
npx tsc --noEmit
npm run lint
```

Staging: `preview_start("torny-staging")` → logg inn som spiller med ≥1 avsluttet spill → Hjem → `preview_snapshot`/`preview_screenshot` (verifiser brutto/netto + tap-navigasjon).

## Ikke i scope

- `/spill-arkiv` (beholder kort).
- `FinishedGameCard` (beholdes — fortsatt brukt på `/spill-arkiv`). Ikke slett.
- Endre `GameHistoryRow`-presentasjon eller dens test.
- Nye stat-seksjoner / handicap-kurve (det er #936/#940/#941, allerede shippet).
