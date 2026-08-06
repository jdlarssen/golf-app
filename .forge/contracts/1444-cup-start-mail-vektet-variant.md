# Forge-kontrakt — #1444 Cup-start-mail: copy-variant for vektede cuper

**Issue:** [#1444](https://github.com/jdlarssen/golf-app/issues/1444) — «Cup-start-mail trenger copy-variant for vektede cuper (points_to_win = NULL)»
**Branch:** `claude/contract-issue-1444-7fb368`
**Type:** `fix` (PATCH) — retter dokumentert midlertidig atferd fra #1441/D8, ikke ny funksjonalitet. Bruker-synlig → CHANGELOG Feilrettinger-linje.

---

## Problem

Vektede cuper (#1441, D8: egendefinerte `win_points`/`tie_points`) starter med `points_to_win = NULL` — «først til X» finnes ikke for dem, vinneren kåres ved avslutning. `lib/mail/cupStartedNotification.ts` krever `pointsToWin: number` og malen hardkoder «Først til {points} poeng vinner». Midlertidig atferd (dokumentert i [lib/cup/actions.ts:282-292](lib/cup/actions.ts)): hele off-app-mail-fanouten hoppes over når `pointsToWin === null`. Off-app-deltakere i vektede cuper får dermed ingen start-mail; in-app-varselet (#417) fyrer uendret for alle.

## Research / presedens (verifisert i repoet denne økten)

- **Mønsteret finnes ferdig i søster-malen:** `cupFinishedNotification.ts` (linje 74–82) TS-brancher på `winnerTeamName === null` mellom `resultWinner`- og `resultDraw`-katalognøkler. Ingen ICU-select i katalogen — betinget copy løses i TypeScript. Samme bibliotek, samme katalog, samme fil-familie → ekstern doc-oppslag (DeepWiki) bevisst droppet; in-repo fungerende presedens er sterkere sannhetskilde enn generell next-intl-dok.
- **Test-presedens:** `cupFinishedNotification.test.ts` dekker null-varianten med to snapshot-cases: NO (`winnerTeamName: null → «Cupen endte uavgjort»`) og EN (`locale en, uavgjort`). Chrome-låsen forblir ÉN (default-casen).
- **Felle:** `formatNumber(pointsToWin, …)` kalles i dag ubetinget ([cupStartedNotification.ts:63](lib/mail/cupStartedNotification.ts)) — med `null` ville den rendret søppel. Label-utregningen må inn i ikke-null-grenen.

## Design

1. **Param-utvidelse:** `CupStartedNotificationParams.pointsToWin: number | null`.
2. **Katalognøkler** (begge locales, `messages/no.json` + `messages/en.json`, `mail.cupStarted`):
   - `bodyMatchupWeighted`: NO «<strong>{team1}</strong> møter <strong>{team2}</strong>. Vinneren kåres når cupen avsluttes.» / EN «<strong>{team1}</strong> vs <strong>{team2}</strong>. The winner is decided when the cup ends.»
   - `bodyMatchupWeightedText`: samme uten markup.
   Ordlyden over er retningen fra issuet; endelig NO-copy kjøres gjennom `humanizer:humanizer` før commit (byggerens diskresjon på finpuss, ikke på retning).
3. **Mal-branch** (speiler cupFinished): `pointsToWin === null` → weighted-nøklene (uten `points`-param); ellers dagens `bodyMatchup`/`bodyMatchupText` med `formatNumber`-label. Gjelder både HTML- og text-delen.
4. **Fjern skip-logikken:** i `startTournament` ([lib/cup/actions.ts:292](lib/cup/actions.ts)) fjernes `if (pointsToWin !== null)`-gaten og hele ASSUMPTION-kommentarblokken (linje 282–291) — mail-fanouten kjører for alle cuper. `pointsToWin` sendes videre som den er (kan være null).

## Edge cases & guardrails

- Default-vektede cuper (tallverdi): output bit-for-bit uendret — eksisterende snapshots skal passere UTEN `vitest -u`.
- `pointsToWin: null` + `locale: 'en'` → engelsk weighted-linje.
- `resend-contract.test.ts`-fiksturen (pointsToWin: 10) forblir gyldig — ingen endring der.
- Test-helperen `bodyHtml()` matcher to `<p>`-avsnitt — weighted-varianten har fortsatt to (started + matchup) → helper uendret.
- Eneste produksjons-kallsted er `startTournament`; ingen andre konsumenter av params-typen.

## ASSUMPTIONS (autonom økt — ingen interaktiv grå-sone-runde)

- **A1:** Copy-retningen «Vinneren kåres når cupen avsluttes» er tatt fra issue-teksten (eier-godkjent formulering, «e.l.»). Ikke et produktvalg som krever PR-venting — men PR-en får en kort Fordeler/ulemper-blokk per fast form.
- **A2:** `fix`/PATCH, ikke `feat` — issuet retter et dokumentert hull i eksisterende #417-flyt (mailen finnes, den hoppes bare over). Enhancement-labelen på issuet endrer ikke dette.
- **A3:** Nøkkelnavn `bodyMatchupWeighted` (knyttet til D8-semantikken) — teknisk valg, avgjøres her.

## Suksesskriterier

- [ ] **K1** — `pointsToWin: number | null`; malen rendrer weighted-linja når null, i begge locales. _Evidens: to nye snapshot-cases i `cupStartedNotification.test.ts` (NO null: text + bodyHtml; EN null: speiler cupFinished-EN-draw-casen)._
- [ ] **K2** — Eksisterende snapshot-cases (10 / 10,5 / EN / chrome) passerer uendret, ingen `-u`. _Evidens: `npx vitest run lib/mail` grønn uten snapshot-diff på gamle cases._
- [ ] **K3** — Skip-gaten + ASSUMPTION-kommentaren i `startTournament` er borte; mail-fanout kjører ubetinget (fortsatt kun til off-app-deltakere per #417-gating). _Evidens: diff på [lib/cup/actions.ts](lib/cup/actions.ts)._
- [ ] **K4** — Begge katalogene har weighted-nøklene; NO-copy humanizer-kjørt. _Evidens: diff messages/no.json + en.json; humanizer-verdikt i commit-/PR-tekst._
- [ ] **K5** — `fix`-commit med PATCH-bump + CHANGELOG Feilrettinger-linje (jf. docs/changelog-conventions.md). _Evidens: commit passerer commit-msg-hooken._
- [ ] **K6** — Staging-verifisering av berørt flyt: start en vektet cup på staging → ingen feil i server-logg, in-app-varsel opprettet, mail-fanout forsøkt for off-app-deltakere. Selve Resend-leveransen er best-effort by design — kan ikke bekreftes in-session → skriv `VERIFICATION GAP` for leveransen hvis Resend-logg ikke er tilgjengelig, jf. I3.

## Gates

1. `npm run build` (full — fanger tsc-uttømmende + lint, jf. tsc-gate-fella).
2. `npx vitest run lib/mail lib/cup` (co-located for begge berørte mapper).
3. Humanizer-pass på ny NO-copy før commit.
4. Staging-klikkrunde per K6 før merge (staging-verified-label, #1076).

## Filer som endres

- `lib/mail/cupStartedNotification.ts` — param-type + betinget matchup-linje
- `lib/cup/actions.ts` — fjern skip-gate + kommentarblokk
- `messages/no.json` + `messages/en.json` — to nye nøkler under `mail.cupStarted`
- `lib/mail/cupStartedNotification.test.ts` — to nye snapshot-cases
- `package.json` + `package-lock.json` + `CHANGELOG.md` — PATCH-bump + Feilrettinger-linje

## Out of scope

- In-app-varselet (`cup_started`-kind) — allerede korrekt for alle cuper (#417).
- Cup-avslutnings-mailen — takler allerede NULL (#1142).
- Endringer i D8-semantikken (`derivePointsToWinWeighted`) eller «først til X»-UI-gatingen i appen — avgjort i #1441.
- Ny mail-chrome eller strukturendringer i malen — kun matchup-linja brancher.
