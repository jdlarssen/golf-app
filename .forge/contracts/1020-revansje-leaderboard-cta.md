# Spec: Revansje-CTA på avsluttet leaderboard (#1020)

**Issue:** [#1020](https://github.com/jdlarssen/golf-app/issues/1020) — «Revansje?» er unåelig fra normal-flyten
**Branch:** `claude/fervent-goldwasser-b968ad`
**Type:** `fix` · area:leaderboard → PATCH-bump + Feilrettinger-linje
**Gray areas:** avgjort av Claude mot kodebasen (autonom kjøring; eierens foreslåtte fiks i issuet er design-ankeret).

## Problem

Avsluttede spill-kort på Hjem lenker rett til leaderboardet med `?from=/` (`components/games/FinishedRoundsSection.tsx:61`), og tilbake-pilen peker til Hjem. Spill-siden — der «Revansje?»-knappen bor (#1007) — hoppes over begge veier. Epicens (#1006) viktigste veksthendelse er dermed usynlig i normal-flyten. Eierens fiks: legg CTA-en OGSÅ på det avsluttede leaderboardet, i footer-området der «Del resultat» bor; behold knappen på spill-siden.

## Research Findings

Ingen eksterne biblioteker — alt bygger på interne, verifiserte mønstre:

- `LeaderboardShell` (`LeaderboardChrome.tsx:39`) er delt ramme for ALLE 44 format-visninger (poeng + matchplay + State4View + holes); `ShareResultButton` monteres der én gang og dekker alle formater (#942-presedens).
- `renderLeaderboardContent` (`leaderboardContent.tsx:96`) deles av autentisert `/leaderboard` (page.tsx) OG offentlig `/spectate/[token]` — alt som rendres ubetinget i shellen lekker til spectate.
- **Provider-presedens (#943):** `ReactionsProvider` er client-context montert i page.tsx rundt server-rendret innhold; `useReactionsContext()` returnerer `null` uten provider → konsument rendrer ingenting, og format-visnings-unit-tester (rendret uten provider) forblir uendret (`ReactionsProvider.tsx:36`).
- `gwp.game` har allerede `tournament_id`/`league_round_id` (select-utvidelse + cache-nøkkel `gwp2` fra #1007, `getGameWithPlayers.ts:180,207`) — ingen ny fetch.
- Authed page.tsx har allerede viewer-kontekst: `userId`, `isAdmin`, deltaker-sjekk (`page.tsx:126–130`).
- Ingen e2e-tester refererer `revansje-button` i dag — testid kan gjenbrukes uten kollisjon.

## Prior Decisions

- **#1007 valgte game-home, IKKE chromen** — med tre begrunnelser: spectate-lekkasje, matchplay-dekning, deltaker-gating. Eieren overstyrer plasseringen i #1020, men de tre bekymringene må løses, ikke ignoreres: (1) spectate → provider monteres kun i authed page.tsx, aldri i spectate-ruta — null lekkasje by construction; (2) matchplay → shellen dekker alle 44 visninger, matchplay inkludert; (3) deltaker-gating → eligibility beregnes server-side i page.tsx.
- **#1007 gate-uttrykk:** `status === 'finished' && !tournament_id && !league_round_id` — identisk her, pluss deltaker-krav (se Key Decisions).
- **#1007 K3:** ingen nye server-actions/endpoints — provider-mønsteret holder det slik (i motsetning til et eligibility-endpoint à la share-image).
- **Én dør (#344/#427):** href er `/opprett-spill?fra=<gameId>` for alle roller, uendret; all authz/validering skjer allerede server-side i `loadRevansjeContext` (ikke-deltaker/cup/liga/ikke-finished → param ignoreres).

## Design

1. **Ny client-context** `RevansjeCtaContext` i `app/[locale]/games/[id]/leaderboard/RevansjeCta.tsx` (provider + konsument i samme fil, à la ReactionsProvider):
   - `RevansjeCtaProvider({ href, children })` — bare en context-provider med `href: string`.
   - `RevansjeCta()` — leser context; `null` uten provider → rendrer ingenting. Med provider: sekundær-stylet lenke-pill til `href`, sentrert, samme container-mønster som ShareResultButton (`flex justify-center px-6 pb-6 pt-2`), ≥44px tap-target, `data-testid="revansje-button"`.
2. **Montering i `LeaderboardShell`** (`LeaderboardChrome.tsx`): `<RevansjeCta />` rett ETTER `<ShareResultButton />` i BEGGE grener (chromeless + full). Del resultat (primær) først, Revansje (sekundær) sist — vekst-CTA som avslutning.
3. **Gating i authed `leaderboard/page.tsx`:** beregn `showRevansje = game.status === 'finished' && !game.tournament_id && !game.league_round_id && gwp.players.some(p => p.user_id === userId)`. Når true: wrap `renderLeaderboardContent(...)`-resultatet i `<RevansjeCtaProvider href={`/opprett-spill?fra=${id}`}>`. Når false: returner innholdet uinnpakket.
4. **Copy:** ny nøkkel `leaderboard.common.revansjeButton` = «Revansje?» (no) / «Rematch?» (en) — speiler `game.home.revansjeButton` (no.json:1520/en.json:1520) eksakt. catalogParity håndhever no+en.
5. **Spill-siden røres ikke** — knappen på game-home består uendret.

## Edge Cases & Guardrails

- **Spectate (`/spectate/[token]`):** monterer aldri provideren → CTA kan ikke rendres der. Verifiser med grep at spectate-ruta ikke importerer noe revansje-relatert.
- **Holes-drilldown (`/leaderboard/holes`):** bruker samme shell men egen page som ikke monterer provider → ingen CTA der (bevisst; eieren ba om leaderboardet).
- **Ikke-deltaker admin på leaderboardet:** ser IKKE CTA-en (deltaker-krav) — `?fra=` ville uansett blitt ignorert av loaderens authz og gitt tom veiviser (stille broken promise).
- **Cup-/liga-spill og aktive spill:** `showRevansje` false → ingen provider → ingen CTA. Reveal-finished-viewet ER finished → får CTA (korrekt).
- **Sideturnerings-Tabs-grenen:** shellen er chromeless inne i main-tab → CTA rendres i main-tabben, samme som Del resultat i dag. Akseptert.
- **Format-visnings-unit-tester:** rendres uten provider → RevansjeCta rendrer null → null snapshot-churn (samme knep som RowReactionsForPlayer).
- **Withdrawn viewer:** fortsatt deltaker (`players`-rad) → ser CTA, paritet med game-home-gaten som heller ikke ekskluderer withdrawn.

## Key Decisions

- **Provider-mønster, ikke ShareResultButton-mønsteret (client-fetch-selvgating):** revansje-eligibility har ingen eksisterende endpoint å pinge, og nytt endpoint bryter #1007-K3. Server-side beregning + context er billigere, testbart og lekkasjefritt.
- **Deltaker-krav i gaten** (strengere enn ren cup/liga-gate): knappen skal aldri love noe loaderen avslår.
- **Samme testid `revansje-button`:** ulike ruter, ingen DOM-kollisjon; e2e-selektorer forblir konsistente på tvers av flater.

**Claude's Discretion:**
- Eksakt sekundær-styling på pillen (LinkButton-varianten vs håndrullet pill som matcher ShareResultButton-vekten) — velg det som ser riktig ut ved siden av Del resultat-pillen.
- Om provider+konsument bor i én fil eller to.

## Success Criteria

- [ ] **K1:** Staging: avsluttet frittstående spill → Hjem-kort → leaderboard viser «Revansje?»-pill nederst (etter Del resultat) med href `/opprett-spill?fra=<id>`; klikk lander i prefilt veiviser med banner. *Bevis: staging-klikkrunde.*
- [ ] **K2:** Cup-/liga-spill og aktive spill viser ingen CTA på leaderboardet. *Bevis: kode-gate (page.tsx) + staging-sjekk på minst én av dem.*
- [ ] **K3:** `/spectate/[token]` for et avsluttet spill rendrer null revansje-referanser. *Bevis: grep i spectate-ruta + staging-fetch av spectate-HTML uten `revansje`.*
- [ ] **K4:** Én fokusert komponent-test (`RevansjeCta.test.tsx`): med provider → lenke med href; uten provider → ingenting. Grønn. Ingen andre nye tester; null churn i format-visnings-tester.
- [ ] **K5:** `catalogParity`-testen grønn (nøkkel i no+en); game-home-knappen uendret (git diff rører ikke `(home)/page.tsx`).
- [ ] **K6:** PATCH-bump + CHANGELOG Feilrettinger-linje; alle commits har `Refs #1020`.

## Gates

```bash
npx tsc --noEmit
npm run lint
npx vitest run app/\[locale\]/games/\[id\]/leaderboard messages/catalogParity.test.ts
npm run build
# Staging-klikkrunde FØR merge (bruker-synlig): K1 + K2 + K3
```

## Files Likely Touched

- `app/[locale]/games/[id]/leaderboard/RevansjeCta.tsx` (+ test) — ny provider + CTA
- `app/[locale]/games/[id]/leaderboard/LeaderboardChrome.tsx` — monter `<RevansjeCta />` i begge grener
- `app/[locale]/games/[id]/leaderboard/page.tsx` — eligibility + provider-wrap
- `messages/no.json` + `messages/en.json` — `leaderboard.common.revansjeButton`
- `package.json`/`package-lock.json`/`CHANGELOG.md` — PATCH + Feilrettinger

## Out of Scope

- CTA på holes-drilldown eller spectate.
- Endringer i `?fra=`-loaderen, game-home-knappen eller flyt-diagrammene (samme logiske kant som #1007; kun ny flate).
- Revansje for cup-/liga-kontekster (eies av deres egen mekanikk).
