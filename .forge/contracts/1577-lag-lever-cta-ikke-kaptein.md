# Kontrakt: #1577 — Lever-CTA i lag-modus for ikke-kaptein

**Issue:** [#1577](https://github.com/jdlarssen/golf-app/issues/1577)
**Branch:** `claude/1577-team-submit-cta`
**Type:** fix (bruker-synlig → `.changes/`-notat + staging-verifisering før merge)

## Rotårsak (verifisert mot HEAD i denne økten)

I lag-kollapsede modus (scramble-familien, alternate-shot-matchplay, patsome fra hull 7)
eies lagets `scores`-rader av lag-kapteinen (lex-min `user_id`, `teamScoreOwnerId` i
`lib/games/teamCaptain.ts`). Fullførings-settet som driver lever-CTA-en leser derimot
KUN viewerens rader, tre steder:

1. **Server-selecten** i `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx`
   (`myScoredHolesRes`, destrukturert ~linje 292, mappet ~linje 439) — `eq('user_id', userId)`.
2. **Dexie-queryen** i `HoleClient.tsx` ~linje 457–465 (`localScoredRows`,
   `[gameId+userId] = [gameId, myUserId]`).
3. **Submit-siden** `app/[locale]/games/[id]/submit/page.tsx` ~linje 250–255
   (`eq('user_id', currentUserId)`) — samme mønster: ikke-kaptein ser 18 «manglende» hull
   og en advarsel i confirm-dialogen, selv når lagkortet er komplett.

`scoredHoles = union(server, Dexie)` (HoleClient ~466) → `roundComplete` (~849) blir
aldri sann for ikke-kapteiner → bunn-CTA-en bytter aldri til lever-varianten.

## Avgjørelser (bevist, ikke antatt)

- **D1 — ikke-kaptein SKAL kunne levere.** `submitScorecard`
  (`app/[locale]/games/[id]/submit/actions.ts` ~100–120, #1453) er allerede lag-bred:
  hvem som helst på laget leverer, oppdateringen treffer hele lagets rader
  (`eq('team_number', …)`). Fiksen er altså å gjøre telleren lag-bevisst, ikke å
  sperre CTA-en. Ingen produktvalg — leveringsmodellen er allerede besluttet i #1453.
- **D2 — én eier-regel, ett hjem.** Ny ren helper i `lib/games/` (f.eks.
  `scoreOwnerForHole(mode, holeNumber, viewerId, teamOwnerId)`): eier = lag-eier når
  `modeCollapsesToTeamCard(mode, holeNumber)`, ellers viewer. Patsome er poenget:
  hull 1–6 eies av spilleren selv, hull 7–18 av kapteinen — fullføring er per-hull-eiers
  rad, ikke en blind union.
- **D3 — submit-siden er i scope.** Samme defektmønster (T2 søsken-modul); uten den er
  CTA-fiksen en blindvei (ikke-kaptein lander på «18 hull mangler»). Avvik fra
  issue-scope nevnes i closing-kommentaren.
- **D4 — ikke i scope:** #1352-fail-safen i hull-stripa beholdes som den er; #1606
  (adopter `modeCollapsesToTeamCard` for kollaps-regelen i HoleClient) er eget
  refactor-issue og røres ikke; godkjennings-listene og Hjem-kortet (#1538, ferdig)
  røres ikke.

## Suksesskriterier

- [x] **S1:** Ny ren helper med eier-regelen finnes i `lib/games/` med Type A-tester
      skrevet FØRST (TDD): solo-modus → viewer; scramble/alternate-shot → lag-eier alle
      hull; patsome → viewer hull 1–6, lag-eier hull 7–18; withdrawn kaptein → lex-min
      av aktive (via `teamScoreOwnerId`); tomt lag → viewer-fallback.
      **Evidens:** `lib/games/scoreOwner.ts` (scoreOwnerForHole:22, scoreOwnerUserIds:45)
      + `scoreOwner.test.ts`; test-commit dba13013 (rød: modul fantes ikke) FØR
      impl-commit 6b007967; `npx vitest run lib/games/scoreOwner` → 89/89 grønne
      (re-kjørt av evaluator).
- [ ] **S2:** Hull-sidens fullførings-sett bygges per-hull-eier: server-selecten henter
      eierens rader (begge id-enes rader når eier ≠ viewer), og Dexie-queryen speiler
      det. `roundComplete` blir sann for ikke-kaptein når lagkortet (+ egne
      patsome-hull 1–6) er komplett.
      **Evidens:** commit 684915c8 — page.tsx:264 (eier-oppløsning), :333
      (`.in('user_id', scoreOwnerUserIds(...))`), :456 (per-hull-filter);
      HoleClient.tsx:472/:478 (Dexie `anyOf` over begge id-er) /:487 (eier-filter);
      render-testgruppe «deliver CTA for a non-captain (#1577)» i HoleClient.test.tsx
      (texas ikke-kaptein → «Lever lagets scorekort», patsome-blanding, negativt
      4BBB-case). Evaluator: begge datakilder bruker samme helper-par.
- [x] **S3:** Submit-siden regner `missingHoles`/scorekort-rader per-hull-eier — en
      ikke-kaptein med komplett lagkort ser 0 manglende hull.
      **Evidens:** submit/page.tsx:276 (`.in('user_id', …)`) /:292 (`ownedScores`
      per-hull-filter → scoreByHole/enteredByIds/missingHoles); putt-prompten kan ikke
      fyre i kollapsede modus (formatCapturesPutts=false, dokumentert :360).
      Ende-til-ende-bevis = S6.
- [x] **S4:** Kaptein-opplevelsen er uendret (eier == viewer ⇒ effektivt samme datasett
      som i dag). **Evidens:** scoreOwnerUserIds returnerer `[viewerId]` når eier ==
      viewer; alle pre-eksisterende tester grønne uendret (1321 → 1324, kun additivt;
      evaluator: testdiff 0 slettinger).
- [x] **S5:** Gates grønne: `npx vitest run` for alle endrede filer med co-located tester
      + `npm run build`. **Evidens:** vitest 68 filer / 1324 grønne + `npm run build`
      exit 0 (pipefail) — kjørt av builder OG re-kjørt uavhengig av evaluator
      (Node v22.23.0).
- [ ] **S6:** Staging-klikkrunde: scramble-spill med 2 spillere, logg inn som
      IKKE-kaptein, fyll lagkortet komplett → lever-CTA vises på hull-siden, /submit
      viser 0 manglende, levering lykkes og lagets rader markeres levert.
      **Evidens (fylles ved verifisering):** staging-bevis-kommentar på PR + label.

## Gates

- `npx vitest run app/[locale]/games/[id]/holes/[holeNumber] app/[locale]/games/[id]/submit lib/games`
- `npm run build` (full gate, §T2 — tsc alene er ikke nok)
- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`) før alt.

## Edge-case-tabell (T1 steg 4)

| Input-klasse | Forventet |
|---|---|
| Tomt (ingen scores) | CTA disabled «Skriv inn score» — uendret |
| Ett hull scoret på lagkort | «Neste hull»-CTA — uendret |
| Alle segment-hull på lagkort, viewer = ikke-kaptein | Lever-CTA (ny oppførsel) |
| Patsome: lagkort 7–18 komplett, egne 1–6 mangler ett | IKKE roundComplete |
| Patsome: egne 1–6 + lag 7–18 komplett | roundComplete |
| Kaptein withdrawn (admin-sti) | eier = lex-min av aktive (teamScoreOwnerId) |
| Duplikat server+Dexie samme hull | Set-union, teller én gang |
| Samtidig: makker taster siste hull på sin enhet | realtime-merge skriver Dexie-rad på eier-id → useLiveQuery re-fyrer → CTA dukker opp live |
| Timezone | N/A: ingen dato-logikk |

## Ikke-mål

- Ingen endring i `submitScorecard`-actionen (allerede riktig).
- Ingen endring i godkjennings-flater, Hjem-kortet, hull-stripas #1352-fail-safe.
- Ingen copy-endringer (eksisterende labels gjenbrukes) → ingen humanizer-runde.
- Ingen flyt-diagram-endring (ingen steg/skjerm endres — kun at eksisterende CTA
  faktisk vises for flere).

## Commit-disiplin

Atomiske commits med `Refs #1577` i body. Fix-commiten trenger `.changes/1577-<slug>.md`
(type: fix). Test-commit FØR impl-commit for S1 (TDD).
