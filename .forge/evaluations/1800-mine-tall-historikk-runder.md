# Forge-runder — #1800 Mine tall → Historikk-huben (natt 2026-09-01)

Bygger: Opus-subagent (nattkjøreren, Fable-orkestrert). Evaluator: Opus i fersk kontekst.

| Runde | Utfall | Funn | Aksjon |
|---|---|---|---|
| 1 | REJECT | `.changes/1800-mine-tall-historikk.md` hadde en lekket `</content>`-tag på siste linje — validatoren i `scripts/weekly-release.mjs` slipper den gjennom, så den ville havnet ordrett i CHANGELOG mandag. Nits: hengende `getMyStats`-referanse i kommentar (historikk/page.tsx), dobbel `countRoundAchievements`-kjøring (ren CPU, ubetydelig). | Tag-linja slettet; kommentar-referansen fjernet. Dobbel-telling-nitten står (bevisst minimal diff — AchievementWall beholder sin datakilde). |
| 2 | — | Re-verifisering: `weekly-release --dry-run` gir ren CHANGELOG-blokk, typecheck/lint grønn. | Videre til kryss-modell-gate (Sonnet). |

Evaluator runde 1 bekreftet eksplisitt (negativfunn, skal ikke re-litigeres):
semantikk-paritet gammel/ny `roundsPlayed`/`grossAverage`/`bestRound` (NULL-strokes-
filteret er no-op — `isPlayed` filtrerer selv), roundHoles-indeksering korrekt,
AchievementWall/sesong-recap upåvirket, død kode fullstendig fjernet, i18n-paritet
eksakt, null nye DB-rundturer, copy uendret.
