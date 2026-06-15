# Forge-kontrakt: #639 — Fold modus-kontekst-bannere inn i hull-headeren

**Issue:** [#639](https://github.com/jdlarssen/golf-app/issues/639) — Round Robin: segment-banner tar egen rad og dytter 4. spillerkort til folden
**Branch:** `claude/suspicious-feistel-740c2f`
**Type:** UI-layout-polish (bruker-synlig) → PATCH-bump + CHANGELOG
**Flyt:** Kjernesløyfa, «spill»-fasen (taste slag på hull-skjermen).

## Problem

På hull-skjermen (`app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx`) rendres
modus-kontekst-bannerne som **frittstående full-bredde, padded, rundede kort-rader** mellom
`HoleHero`-headeren og spillerkortene:

- Round Robin: «Segment X/3 · Du spiller med A mot B + C» (`RoundRobinBadge.tsx`, `data-testid="round-robin-badge"`)
- Wolf: «Wolf: X — partner: Y» (inline i HoleClient, `data-testid="wolf-badge"`)
- Florida Scramble: step-aside-påminnelse (inline, `data-testid="florida-step-aside-reminder"`)
- Skins: «N skins på spill» (+ evt. carried-in-underlinje) (inline, `data-testid="skins-banner"`)

Hver er ca. 44px høy (`padding: 10px 14px` + `margin: 0 14px 8px` + border/radius). Med 4 spillere
(Round Robin er alltid 4; Wolf 3–5; Skins opptil 16) spiser banneret en hel rad og dytter
4. spillerkort under folden på mobil — man må scrolle for å se/taste det.

Eier-observert i visuell QA (2026-06-14, prod). Eiers forslag: flytt kontekst-teksten «ett hakk
opp» — inn i hull-header-zonen (`HoleHero`) som en liten underrad — så den ikke spiser en hel rad.

## Beslutninger (gray-area-avklaringer)

1. **Scope = de 3 navngitte + Skins.** Eier valgte å inkludere Skins-banneret (samme rad-mønster,
   verst fold ved opptil 16 spillere) for konsistens — all modus-kontekst skal bo samme sted.
2. **WD-banneret (`withdrawn-banner`) er UTENFOR scope.** Det er semantisk en fare-/advarsel-rad
   med angre-lenke, ikke modus-kontekst — beholder sin fremtredende plassering og styling.
3. **Tilnærming:** Én delt, kompakt kontekst-linje rutet inn i **midt-kolonnen av `HoleHero`**
   (mellom hull-tallet og Par/indeks). Den tucker teksten inn i den ledige høyden ved siden av det
   44px store hull-tallet, så den legger til ~0px i stedet for en egen rad. De fire bannerne ruter
   gjennom den. Bannerne er gjensidig utelukkende per `gameMode`, så høyst én vises om gangen.
   *(Eier-avklaring 2. runde: valgte issue-ets FØRSTE opsjon — «på samme linje som hull-nummeret /
   Par-headeren» — framfor en underrad under headeren, fordi den gjenvinner mest vertikal plass.)*
4. **Akseptanse-tolkning:** Målet er å gjenvinne den dedikerte banner-raden, ikke en piksel-perfekt
   «null scroll på alle enheter»-garanti (enhetshøyder varierer). Verifiseres visuelt at 4. RR-kort
   kommer vesentlig høyere opp / er nåbart uten den frittstående banner-raden.

## Tilnærming (implementasjon)

- Ny delt komponent `components/hole/HoleContextLine.tsx`: liten, sentrert inline-tekst (font 11.5,
  line-height 1.3, wrapper innenfor tall-høyden), med en `accent`-variant (champagne-tekst
  `--accent-deep` for RR/Wolf/Skins) og en nøytral variant (muted, Florida). Tar `testId` + `children`.
- `HoleHero.tsx`: nytt valgfritt `contextLine?: ReactNode`-prop. Rendres som en midt-kolonne
  (`flex:1, minWidth:0`) mellom venstre (HULL + tall) og høyre (Par/indeks); left/right får
  `flexShrink:0`. Ingen midt-kolonne når prop-en er undefined.
- `RoundRobinBadge.tsx`: render gjennom `HoleContextLine` (chromeless-tekst i stedet for eget kort),
  behold `data-testid="round-robin-badge"` og null-retur ved ukjent spiller.
- `HoleClient.tsx`: bygg én `holeContextLine`-node (wolf/skins/florida-tekst eller `<RoundRobinBadge>`)
  og send den til `HoleHero contextLine={…}`; fjern de fire frittstående banner-`<div>`-ene. Behold
  samme `data-testid`-er og tekst-innhold (inkl. Skins carried-in-underlinje). `OnboardingBanner`
  tilbake rett etter `HoleHero`.

## Suksesskriterier

- [x] **K1 — RR foldet:** Round Robin segment-linja rendres IKKE lenger som frittstående full-bredde,
      padded, rundet kort-rad over spillerkortene; den vises i **midt-kolonnen av HoleHero**, mellom
      hull-tallet og Par/indeks. *Evidens: `RoundRobinBadge.tsx` returnerer nå
      `<HoleContextLine testId="round-robin-badge" accent>` (chromeless) i stedet for `badgeStyle`-kortet;
      `HoleClient.tsx` bygger `holeContextLine` og sender den til `<HoleHero contextLine={…}>`;
      `HoleHero.tsx` rendrer den som `centerStyle` midt-kolonne mellom left/right.*
- [x] **K2 — Wolf/Florida/Skins foldet:** Samme for Wolf-banneret, Florida step-aside-påminnelsen og
      Skins-banneret (inkl. carried-in-underlinje når > 0). *Evidens: `HoleClient.tsx` — de tre `<div>`-
      bannerne erstattet med `<HoleContextLine>`-instanser (wolf/skins accent, florida nøytral),
      plassert flush under `<HoleHero>`; Skins carried-in som `<span style={{display:'block'}}>`.*
- [x] **K3 — Innhold + testid-er bevart:** Den foldede linja beholder informasjonen
      (segment/partner/motstandere; wolf+valg; step-aside-tekst; skins-at-stake + carried-in) og
      `data-testid`-ene `round-robin-badge`, `wolf-badge`, `florida-step-aside-reminder`,
      `skins-banner`. *Evidens: testid-ene videreført som `testId`-prop; `RoundRobinBadge.test.tsx`
      grønn (segment/partner/motstander-assertions + null-render); `HoleClient.test.tsx` 22/22 grønn.*
- [x] **K4 — 4-spiller-RR fitter bedre (strukturelt tilfredsstilt):** Kontekst-teksten i midt-kolonnen
      tucker inn i den ledige høyden ved siden av det 44px store hull-tallet og legger til ~0px — hele
      den dedikerte banner-raden er gjenvunnet (sterkere enn underrad-varianten). *Evidens: kode-diff
      (banner-`<div>`-ene fjernet, ingen egen rad igjen) + faithful før/etter-mock ved mobil-bredde
      (forest-paletten, eksakte element-høyder) viste 4. RR-kort klare folden i «etter». Live Playwright
      var infeasible (gjenskapt worktree uten `.env.local`/seeded RR-spill); piksel-bekreftelse på enhet
      utsatt til eiers prod-preview-sjekk, jf. K4-avgrensningen.*
- [x] **K5 — WD uendret:** WD-banneret (`withdrawn-banner`) er uendret — fortsatt egen fremtredende
      fare-rad med angre-lenke. *Evidens: WD-blokken i `HoleClient.tsx` er urørt i diff-en (kun
      Wolf/Skins/RR/Florida + OnboardingBanner-rekkefølge endret).*
- [x] **K6 — Tester grønne:** `RoundRobinBadge.test.tsx`, `HoleHero.test.tsx` og evt. ny/oppdatert
      test for `HoleContextLine` er grønne; ingen nye tester utover Type C-grensen (maks én render-test
      per komponent). *Evidens: `vitest run` — HoleContextLine 1, HoleHero 3, RoundRobinBadge 1
      (3 filer / 5 tester) + HoleClient 22/22, alle grønne.*
- [x] **K7 — Bygg grønt:** `npx tsc --noEmit` (eller `npm run build`) passerer; ingen nye TS-feil fra
      endrede props/exhaustive maps. *Evidens: `npx tsc --noEmit; echo $?` → `tsc EXIT=0`.*

## Gates (scoped til det som endres)

1. `npx tsc --noEmit` — typecheck.
2. `npx vitest run components/hole/HoleHero.test.tsx components/hole/HoleContextLine.test.tsx app/\[locale\]/games/\[id\]/holes/\[holeNumber\]/RoundRobinBadge.test.tsx` — touched-fil-tester.
3. Visuell: Claude in Chrome / Playwright på et live RR-spill ved 390px bredde — bekreft 4 kort + kompakt kontekst-linje.

## Utenfor scope

- WD-banner-relokering (K5: uendret).
- De andre QA-sweep-funnene (#636, #638, #640).
- Piksel-perfekt «null scroll på alle enheter»-garanti.
- Endring av selve tekstene/i18n-nøklene (gjenbrukes 1:1 — ingen ny norsk copy, så humanizer ikke utløst).

## Versjonering

PATCH-bump (bruker-synlig layout-polish) + CHANGELOG-oppføring under åpen tema-serie. Ingen nye
bruker-rettede strenger.
