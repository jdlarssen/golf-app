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

- [ ] **K1 — Delt nøkkel parametrisert.** `common.after18Holes` → ny dynamisk nøkkel (f.eks. `afterNHoles`: «Etter {holes} hull» / «After {holes} holes») i begge kataloger; alle ~9 konsumenter sender `{holes}`. *Evidens: grep viser 0 gjenværende `after18Holes`-kall uten parameter; file:line per konsument.*
- [ ] **K2 — Bespoke subtitles parametrisert.** `bestBall`, `soloStrokeplay`, `soloStableford`, `teamStableford`, `texasScramble` sine `subtitle` + `podiumSubtitle` bruker `{holes}` i stedet for «18»; konsumentene sender tallet. *Evidens: grep «18 hull»/«18 holes» i no/en.json viser ingen treff i disse nøklene; file:line.*
- [ ] **K3 — Spillvidt holesPlayed beregnet og tråded.** `page.tsx` beregner max-holes-played én gang og sender til hver berørt View/Podium. *Evidens: file:line på beregning + minst stikkprøve på 3 formater.*
- [ ] **K4 — Live OG ferdig korrekt.** Både live-leaderboard-undertittel og ferdig-podium-undertittel viser faktisk antall hull (verifiser via render-test eller komponent-lesning at samme `holesPlayed`-prop brukes i begge stier).
- [ ] **K5 — Fullt 18-hulls spill uendret.** Når alle 18 er spilt → «Etter 18 hull» (regresjons-sjekk: eksisterende snapshot/tester for 18-hulls fixtures grønne).
- [ ] **K6 — Katalog-paritet.** `no.json` og `en.json` har samme nøkler (catalogParity-test grønn).
- [ ] **K7 — Norsk copy humanized.** Nye/endrede norske strenger kjørt gjennom humanizer-mønstrene.

## Gates (scoped til endrede filer)

- `npm run build` (tsc — ny GameMode/exhaustive-felle gjelder ikke her, men prop-typing må stemme) — grønt.
- `npm test` — alle leaderboard-view/podium-tester + catalogParity grønne.
- `npm run lint` på endrede filer — grønt.

## Notater

- Bug-fix → PATCH-bump + CHANGELOG (commit-msg-hook).
- Mange filer (~20 komponenter) → vurder implementer-subagent (sonnet) for den mekaniske feiingen med denne kontrakten som spec, deretter review. Atomiske commits.
- Test-disiplin: maks én render-test per komponent; ikke re-asserter tall fra Type-A. Copy-endring → `npx vitest -u` for snapshots, review diff visuelt.
