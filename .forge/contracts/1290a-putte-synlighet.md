# Kontrakt A: Putte-statistikk med synlig utbytte — PPH, panel-redesign, atferdsgate (#1290 del A)

> Del A av to. Denne delen er **natt-trygg**: ren lesing/visning, ingen DB-endring, ingen leaderboard-katalog-filer. Del B (etterfylling) har egen kontrakt og er PARKERT (kollisjon med #1293 + prod-luke).
> Design-fasit: eier-kommentarene på #1290 fra 19.07 kl. 16:21–16:32 — de overstyrer issue-brødteksten der de avviker.

## Problem

Putter har én eneste konsument — «Putte-snitt»-panelet på Profil → Historikk — og `computePuttsStats` teller kun runder med putt på alle 18 hull. Eierens to 17/18-runder ga null synlig utbytte noe sted, og tom-tilstanden forklarer ikke hvor nær man er. I tillegg rendrer panelet alltid, også for spillere som aldri har ført en putt (mas om frivillig statistikk).

## Research-funn (verifisert i økten)

- `lib/stats/puttsStats.ts` (44 linjer): `computePuttsStats(rounds)` filtrerer på `recordedPutts.length === 18`, returnerer `{roundsCounted, avgPuttsPerRound, bestRoundPutts}`. Testfil dekker gaten eksplisitt.
- Panel: `components/stats/PuttsStatPanel.tsx` (presentasjonell `Card`); tom-tilstand = én dempet tekstlinje (`puttsEmpty`-nøkkelen). Rendres fra `app/[locale]/profile/historikk/page.tsx:429-438`; datamapping til `puttsRounds` skjer på `page.tsx:292-307`.
- i18n-nøkler under `messages/no.json:308-313` (`puttsHeading` m.fl.) + engelske søsken.
- 18/18-gaten for per-runde-snittet er bevisst (#939) og skal BESTÅ — kun PPH er gate-fri (eier-kommentar 16:30).

## Design (rammene er eier-låst i kommentarene; dette er destillatet)

**1. `computePuttsStats` utvides (Type A, TDD — test først):** ny returform
`{ pph, holesCounted, roundsCounted, avgPuttsPerRound, bestRoundPutts, nearMiss: { partialRounds, missingHoles } }`
- **PPH (gate-fri):** sum av ALLE registrerte putt-verdier / antall hull med putt-verdi — over samtlige runder, uavhengig av komplettering. Synlig utbytte fra aller første førte hull.
- **Per-runde-snitt + beste runde + runder talt:** uendret 18/18-disiplin.
- **nearMiss:** input-typen utvides med `playedHoles` per runde (antall hull med slag), slik at: en runde teller som «delvis» når `0 < puttedHoles < playedHoles`; `missingHoles` = sum av differansene. En fullput­tet 9-hulls-runde er dermed IKKE delvis (ingen mas), men kvalifiserer heller aldri for 18/18-snittet — det er eksisterende semantikk.

**2. Panel-redesign (`PuttsStatPanel.tsx`):** fire celler — **PPH · snitt/runde · beste runde · runder talt** (eier-spesifisert rekkefølge/panel). PPH med én desimal via eksisterende `formatNumber`-mønster; `tabular-nums`.

**3. Atferdsgate (skjul ved 0):** har spilleren ALDRI ført en putt (`holesCounted === 0`) → panelet rendres ikke i det hele tatt (historikk-siden hopper over det). localStorage-bryteren kan ikke brukes server-side; dataene er signalet (eier-prinsippet 16:32).

**4. Nær-målet-tomtilstand:** når `holesCounted > 0` men `roundsCounted === 0`: erstatt generisk tom-tekst med «Nesten! Du mangler putt på {missingHoles} hull i {partialRounds} runder» (i18n med flertallsformer via ICU). PPH-cellen viser uansett verdi — tomtilstanden gjelder kun snitt/beste/talt-cellene.

**5. Datamapping:** `page.tsx:292-307` utvides til å sende `playedHoles` per runde (finnes allerede i `scoresByGame`-grunnlaget).

## Kanttilfeller (edge-tabellen — hver ikke-N/A-rad blir test)

| Input | Forventet |
|---|---|
| Ingen runder | panel skjult |
| 1 hull ført av 18 spilte | panel vises; PPH = verdien; nearMiss {1, 17} |
| 17/18 (eierens case) | PPH over 17 hull; nearMiss {1, 1}; roundsCounted 0 |
| 18/18 komplett | alle celler; nearMiss {0, 0} |
| Fullputtet 9-hulls-runde | PPH teller 9 hull; IKKE delvis; roundsCounted 0 |
| Blanding komplett + delvis | snitt kun over komplette; PPH over alt; nearMiss kun delvise |
| putts = 0 på et hull | teller som ført (0 er en verdi, ikke mangel) |
| Duplikat/ties | N/A (én rad per hull garantert av unik-constraint) |

## Nøkkelbeslutninger

- **PPH gate-fri, resten gatet** — eier-besluttet 16:30; ikke re-diskuter.
- **Skjul panelet helt ved null putt** — eier-besluttet 16:32 («putte-mas eksisterer ikke for deg»).
- **Ingen ruting-inn/etterfyllings-UI i del A** — alt som skriver eller promper hører til del B.
- **Commit:** `feat(stats)` + minor-bump + CHANGELOG-linje («Putte-panelet viser nå putter per hull fra første førte hull …»). Refs #1290.
- Merk: `messages/*.json` røres også av #1293-kontrakten (reactions-nøkler, andre linjer i fila) — tekstuell konflikt usannsynlig, men nattkjøreren bør ikke bygge begge samme natt hvis det kan unngås; ved rebase-støy: behold begge nøkkelsett.

**Claude's discretion:** celle-layout i panelet (2×2 vs rad); nøkkelnavn; om `holesCounted` eksponeres i UI (f.eks. «over N hull» som undertekst — anbefalt for ærlighet).

## Suksesskriterier

- [ ] `npx vitest run lib/stats/puttsStats.test.ts` grønn med nye caser fra edge-tabellen (skrevet FØR implementasjon — TDD).
- [ ] Panelet viser fire celler for en spiller med komplette runder; PPH vises også når `roundsCounted === 0`. **Bevis:** oppdatert render-test (maks ÉN, Type C — eksisterende testfil utvides, ingen ny fil).
- [ ] Spiller uten putt-føring: panelet finnes ikke i DOM-en på Historikk. **Bevis:** render-test på side-nivå ELLER staging-klikk med e2e-spiller uten putts.
- [ ] 17/18-spilleren ser nær-målet-teksten med riktige tall. **Bevis:** render-test + staging-klikkrunde av Profil → Historikk (`staging-verified`-label + skjermbilde før merge).
- [ ] Ingen filer under `app/[locale]/games/[id]/leaderboard/` eller `supabase/` i diffen. **Bevis:** diff-listing i evaluering.

## Gates

- [ ] `npm run build` + `npm run lint` + co-located vitest (puttsStats, PuttsStatPanel, historikk-page) grønne
- [ ] Humanizer på ny norsk copy; begge locales oppdatert
- [ ] Commit-body `Refs #1290`; PR-body `Part of #1290` (del B gjenstår — IKKE `Closes`)

## Filer som trolig berøres

- `lib/stats/puttsStats.ts` + `puttsStats.test.ts`
- `components/stats/PuttsStatPanel.tsx` (+ ev. testfil)
- `app/[locale]/profile/historikk/page.tsx` — mapping + betinget rendring
- `messages/no.json` + `messages/en.json`
- `package.json`/`package-lock.json`/`CHANGELOG.md`

## Utenfor scope (→ del B / senere)

- All etterfylling (chips, server-action, DB-trigger, migrasjon)
- Kort/promter på lever-steget, leaderboard, scorekort og Historikk-rader
- Putter-kolonne på scorekortet (issue-forslag 1 — ikke i eier-designet 19.07; ligger i backloggen om det gjenoppstår)
