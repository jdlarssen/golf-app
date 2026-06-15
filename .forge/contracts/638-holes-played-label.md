# Forge-kontrakt: #638 — «Etter X hull»-label reflekterer faktisk antall spilte hull

**Issue:** [#638](https://github.com/jdlarssen/golf-app/issues/638) — «Etter 18 hull»-label vises selv når færre hull er spilt
**Branch:** `claude/practical-kepler-bd9c4a`
**Type:** bug (kosmetisk men misvisende), `area:leaderboard`

## Problem

Leaderboard- og podium-undertittelen sier hardkodet «Etter 18 hull» / «After 18 holes» selv når runden ble avsluttet tidlig (f.eks. «Avslutt likevel» etter 2 hull). Radene viser korrekt antall spilte hull, men header-en lyver.

Kilden er hardkodet «18» i i18n-katalogene (`messages/no.json` + `en.json`):
- **Delt status-nøkkel:** `common.after18Holes` («Etter 18 hull») — brukt av ~9 detalj-format-views (Nassau, Skins, Wolf, Nines, Acey, BBB, RoundRobin, Shamble, Patsome) som ferdig/status-label.
- **Bespoke subtitle/podiumSubtitle-nøkler med «18»:** `bestBall.subtitle`, `soloStrokeplay.subtitle`+`.podiumSubtitle`, `soloStableford.subtitle`+`.podiumSubtitle`, `teamStableford.subtitle`+`.podiumSubtitle`, `texasScramble.subtitle`+`.podiumSubtitle`.

## Gråsoner — beslutninger

- **Hvilket tall:** spillvidt = **max antall spilte hull på tvers av spillere** (den som har kommet lengst). Ved tidlig avslutning stoppet alle samtidig → lik for alle. Matchplay gjør allerede dette dynamisk (`MatchplayDuelCard` + `leaderboard.duel.liveLeadingSub`), så matchplay er **utenfor scope**.
- **Datakilde:** beregn én gang i `app/[locale]/games/[id]/leaderboard/page.tsx` fra `rawScoresRows` (max per-spiller antall hull med `gross != null`), tråd inn som ny prop `holesPlayed: number` til hver score/poeng-View + -Podium. Uniformt og format-agnostisk (per-spiller feltnavn varierer: `holesPlayed`/`holesScored`).
- **0 hull:** `{holes}`-substitusjon gir «Etter 0 hull». Akseptert (svært sjelden — avsluttet før noen score). Ikke over-engineer med ICU =0 i de lange bespoke-strengene.
- **Utenfor scope (ulik semantikk — beskriver format/config, ikke «etter X spilt»):** format-guide-prosa (`long`/`example`/`summary`), `total18Heading`/`totalHull` (Nassau-seksjonsnavn = «hele 18 samlet»), `holeCount`, `spiltHullOf18`/`ctaHolesFilled` («/18»-nevner — egen latent 9-hulls-bug, ikke denne), achievement-labels (`bestNetto18`, `noDoublePlusRound`), matchplay `tiedSubtext`.

## Success-kriterier

- [x] **K1 — Delt nøkkel parametrisert.** `common.after18Holes` → `common.afterNHoles` = «Etter {holes} hull» / «After {holes} holes» ([no.json:1828](../../messages/no.json), [en.json:1828](../../messages/en.json)); alle 10 konsumenter (9 views + ShamblePodium) sender `{ holes: holesPlayed }`. *Evidens: `grep -rln after18Holes app lib messages` = 0 treff.*
- [x] **K2 — Bespoke subtitles parametrisert.** `soloStrokeplay`, `soloStableford`, `teamStableford`, `texasScramble` sine `subtitle` + `podiumSubtitle` bruker `{holes}` (begge språk). *Evidens: grep «subtitle/podiumSubtitle» + «18 hull» = kun den foreldreløse `bestBall.subtitle` (linje 1857, ingen konsument — best ball rendres via `renderStableford`→TeamStableford-viewet), bevisst urørt.*
- [x] **K3 — Spillvidt holesPlayed beregnet og tråded.** `maxHolesPlayed(rawScoresRows)` i [holesPlayed.ts](../../lib/scoring/holesPlayed.ts), beregnet i hver av 12 render-helpere i [page.tsx](../../app/[locale]/games/[id]/leaderboard/page.tsx). *Evidens: `grep -c maxHolesPlayed page.tsx` = 13 (import + 12), `grep -c "holesPlayed={holesPlayed}"` = 28 instansieringer (live + ferdig).*
- [x] **K4 — Live OG ferdig korrekt.** Samme `holesPlayed`-prop brukes i View (live) og Podium (ferdig); ny render-test beviser partial-tilfellet: `SoloStrokeplayView` med `holesPlayed={2}` → undertittel «Etter 2 hull» (SoloStrokeplayView.test.tsx, 14/14 grønn).
- [x] **K5 — Fullt 18-hulls spill uendret.** Alle eksisterende view/podium-tester bruker `holesPlayed: 18`-fixtures → output forblir «Etter 18 hull»; suiten grønn.
- [x] **K6 — Katalog-paritet.** Full vitest-suite 3529/3529 grønn (catalogParity inkludert).
- [x] **K7 — Norsk copy.** Endringen er placeholder-bytte («18»→«{holes}») i allerede kanoniske, godkjente strenger; eneste nye streng «Etter {holes} hull» er ren bokmål uten AI-tells. CHANGELOG-tagline skrevet med parens i stedet for em-dash-kjede.

## Gates (scoped til endrede filer)

- `npm run build` (tsc — ny GameMode/exhaustive-felle gjelder ikke her, men prop-typing må stemme) — grønt.
- `npm test` — alle leaderboard-view/podium-tester + catalogParity grønne.
- `npm run lint` på endrede filer — grønt.

## Notater

- Bug-fix → PATCH-bump + CHANGELOG (commit-msg-hook).
- Mange filer (~20 komponenter) → vurder implementer-subagent (sonnet) for den mekaniske feiingen med denne kontrakten som spec, deretter review. Atomiske commits.
- Test-disiplin: maks én render-test per komponent; ikke re-asserter tall fra Type-A. Copy-endring → `npx vitest -u` for snapshots, review diff visuelt.
