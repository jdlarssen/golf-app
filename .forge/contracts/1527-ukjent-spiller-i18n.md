# Kontrakt: «Ukjent spiller» hardkodet norsk — fallback som påkrevd parameter (#1527)

Kilde: kontrakt-kommentar på issue #1527 (kontrakt-smeden, Opus-verifisert mot
e2ce624; kontrakten avviker bevisst fra issue-ens null-design — se Key Decisions
i kommentaren). Re-verifisert mot main ved byggestart 2026-08-14: 14 kode-steder
+ 2 kommentar-treff, eksakt som kontrakten. Bygget av Opus-implementer-subagent,
commit 068b016b.

## Design (bygget)

- lib-helpers tar påkrevd `unknownLabel: string`: `preferredName` +
  `CupPlayerPointsInput` (computeCupPlayerPoints), `computeCupUnderperformer`
  (computeCupAwards), `getCupSnapshot(id, unknownLabel)` inkl. `formatSideLabel`,
  `getCupCandidatePlayers` via `opts.unknownLabel`.
- UI-kallsteder sender `t(...)`: cup-flatene `cup.manage.unknownPlayer`
  (eksisterende nøkkel), liga-tabellen `liga.standings.unknownPlayer`
  (fjerner dublett-kilden), RoundStartClient ny nøkkel
  `liga.player.runde.unknownPlayer` (eneste nye, no+en).
- `planActions.ts` sender norsk konstant m/ kommentar (displayName vises aldri).
- `lib/cup/actions.ts` (×2) henter label via `getTranslations('cup')` —
  verifisert i byggingen: snapshot-navnene konsumeres IKKE av mail/persistering.
- Rundereferat-filene beholder norsk konstant m/ `nb-only by design`-kommentar.

## Success Criteria

- [x] Grep-sluttsjekk: kun roundReport-konstantene + planActions-konstanten igjen.
  **Evidens:** builder-grep viste nøyaktig 3 treff (planActions:193,
  generateRoundReport:17, roundReportFacts:130).
- [x] Engelsk locale viser «Unknown player» på berørte flater.
  **Evidens:** required-param + t()-nøkler; staging-klikk dekker minst én flate
  (se siste checkbox).
- [x] `liga.player.runde.unknownPlayer` i begge locales.
  **Evidens:** catalogParity grønn (28 filer/442 tester i lib/cup+league-kjøring).
- [x] `npm run typecheck` grønn — ekte enumerator-bevis (required param).
  **Evidens:** exit 0. I tillegg vitest app+lib/games: 214 filer/2299 tester.
- [x] lint + vitest grønt; `computeCupPlayerPoints.test.ts` redigert på plass
  (13 kall), også computeCupAwards.test (16) og getCupSnapshot.test (3);
  ingen nye copy-tester.
  **Evidens:** eslint 0 errors (3 pre-eksisterende complexity-warnings, ingen
  nye grener); `npm run build` exit 0.
- [ ] Staging-verifisering før merge: engelsk locale → minst liga-tabellen
  eller cup-deltakerlista med navnløs spiller; lar navnløs seg ikke arrangere →
  VERIFICATION GAP + komponent-bevis fra test.

## Kjente avvik

- `computeCupMvp` fikk IKKE label (leser ferdige displayName-strenger — død
  parameter); dekket av kontraktens «eller»-formulering.
- Rekkefølge-endring i fire komponenter: `getTranslations` await-es før
  `getCupSnapshot` (labelen er nå input) — lokale oppslag, ingen målbar latens.
- Builder-observasjon om getCupSnapshot kompleksitet 66 er allerede sporet i #1522.

## Gates

tsc + lint + vitest + build grønne (builder-kjørt, evaluator reproduserer).
Bruker-synlig → staging-klikk + bevis + label før merge. Notatfil
`.changes/1527-ukjent-spiller-i18n.md`.

## Commits

- 068b016b fix(i18n): unknown-player fallback flows from call sites, not hardcoded nb
