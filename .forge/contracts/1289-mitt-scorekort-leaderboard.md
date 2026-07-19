# Kontrakt: «Mitt scorekort» på leaderboardet for ferdige spill (#1289)

**Issue:** [#1289](https://github.com/jdlarssen/golf-app/issues/1289)
**Branch:** `claude/scorecard-access-bug-ff2138`
**Type:** fix (bruker-synlig → patch-bump + CHANGELOG-linje)

## Problem

Etter avsluttet runde er scorekortet unåelig: alle innganger (Hjem, Spill-arkiv, Historikk)
går rett til leaderboardet, og leaderboardet har ingen videre navigasjon enn tilbake-pila.
Rotårsak-analyse med file:line står i issuet. Bruker-casen som utløste det: føre runden
inn i Golfbox (trenger hull-for-hull-slag).

## Løsning (besluttet i sesjon 2026-07-19, godkjent av eier via «kjør /auto på den»)

Selv-gatende «Mitt scorekort»-CTA i den delte leaderboard-rammen, etter provider-absence-
mønsteret fra `RevansjeCta` (#1020) / `ReactionsProvider` (#943):

- **Ny fil** `app/[locale]/games/[id]/leaderboard/MyScorecardCta.tsx`:
  `MyScorecardCtaProvider` (context med href) + `MyScorecardCta` (rendrer ingenting uten
  provider). Klient-komponent, samme struktur som `RevansjeCta.tsx`.
- **`LeaderboardChrome.tsx`:** monter `<MyScorecardCta />` i CTA-fragmentet (under
  `live`-gaten, sammen med `ShareResultButton` + `RevansjeCta`). Plasseres FØR
  Revansje-pillen — personlig nytte før vekst-CTA.
- **`leaderboard/page.tsx`:** monter provider med `href={`/games/${id}/scorecard`}` når
  gaten passerer:
  `game.status === 'finished' && players.some(p => p.user_id === userId && !p.withdrawn_at)`.
  MERK: INGEN standalone-krav (ulikt Revansje) — cup-/liga-runder har også scorekort, og
  Golfbox-behovet gjelder der òg. Trukket spiller får ikke CTA (scorekort-sida bouncer
  withdrawn til game-home uansett).
- **i18n:** ny nøkkel `leaderboard.common.myScorecardButton` i no + en.
- **Ikke røre:** format-visningene (dekkes via delt shell, #598-mønsteret), spectate-ruta,
  demoen (`live={false}`), holes-drilldownen — ingen av dem monterer provideren.

### Vurdert og forkastet
- Lenke Hjem/Historikk til game-home i stedet: #986-beslutningen står (resultat er riktig
  landingsside).
- Utvide `RevansjeCtaProvider` til objekt-payload: separat provider er renere og lar
  Revansje-testene stå urørt (I4).

### ASSUMPTIONS
- Plassering som sentrert pill i footer-området (samme stil som Revansje) framfor
  fullbredde-kort — minst diff, konsistent med eksisterende CTA-rad. Issuet åpnet for
  begge; pill valgt.
- Admin som IKKE deltok får ikke CTA-en (det finnes ikke noe «mitt» scorekort for dem).

## Suksesskriterier

- [x] **K1:** På leaderboardet til et ferdig spill ser en deltaker en «Mitt scorekort»-knapp som lenker til `/games/{id}/scorecard`. *(Commit 32927467: MyScorecardCta.tsx rendrer LinkButton med provider-href; page.tsx monterer provider med `/games/${id}/scorecard` bak `showMyScorecard`-gaten; unit-test asserterer href — grønn. Endelig UI-bevis i K7.)*
- [x] **K2:** CTA-en rendres IKKE på: aktivt spill, spectate-ruta, demoen, holes-drilldownen, for ikke-deltaker (inkl. admin-tilskuer) og for trukket spiller. *(Gate: `finished` + deltaker + `!withdrawn_at` (page.tsx); provider monteres KUN av authed leaderboard-page — spectate/demo/holes har ingen mount (provider-absence); test «rendrer ingenting uten provider» grønn.)*
- [x] **K3:** Cup- og liga-runder VISER CTA-en (ingen standalone-gate). *(`showMyScorecard` sjekker ikke `tournament_id`/`league_round_id` — kontrast til `showRevansje` rett over i samme fil.)*
- [x] **K4:** i18n-nøkler finnes i både `no` og `en`; ingen hardkodet copy. *(`leaderboard.common.myScorecardButton`: no «Mitt scorekort», en «My scorecard»; komponenten bruker `t('myScorecardButton')`.)*
- [x] **K5:** Unit-test etter sibling-mønsteret (`RevansjeCta.test.tsx`): (a) ingenting uten provider, (b) lenke med riktig href med provider. *(MyScorecardCta.test.tsx: 2 passed; RevansjeCta.test.tsx fortsatt 2 passed.)*
- [x] **K6:** `npm run build` grønn + co-located tester for endrede filer grønne. *(vitest leaderboard-dir: 41 filer / 191 tester passed; `npm run build` exit 0 med full rutetabell.)*
- [x] **K7:** Staging-klikkrunde før merge: leaderboard på ferdig spill → «Mitt scorekort» → scorekortet rendrer med 18 hull. Bevis-kommentar + `staging-verified`-label på PR-en. *(Playwright-driver mot torny-staging 2026-07-19, alle 5 steg OK: login e2eplayer, CTA synlig med riktig href på ferdig spill (fab70b1a), klikk → scorekort med 18 tbody-rader, negativ-sjekk aktivt spill (9df7b9e0) count=0, prod-vakt: alle supabase-kall mot staging-ref. Skjermbilder: leaderboard med CTA + fullt scorekort, footer v1.208.3.)*

## Gates

- `npx vitest run app/[locale]/games/[id]/leaderboard` (co-located, inkl. ny test)
- `npm run build` (fanger tsc + Next-spesifikke feller, jf. minne om tsc-gate)
- Pre-push-hooken (tsc + lint + vitest) får ALDRI `--no-verify`
- Commit-msg-hook: patch-bump + CHANGELOG-linje (Feilrettinger) i samme commit, `Refs #1289`

## Verifikasjonsplan

1. Unit: ny test-fil grønn + eksisterende leaderboard-tester grønne.
2. Build: `npm run build` uten nye feil.
3. Staging (Playwright-via-Bash-driveren, jf. minne): logg inn som E2E-spiller, åpne et
   ferdig spill fra Hjem → verifiser knapp → klikk → scorekort med 18 rader. Skjermbilde
   som bevis på PR. Negativ-sjekk: aktivt spill viser ikke knappen.
4. PR med `Closes #1289`, staging-verified-label, merge `--rebase --delete-branch`.
