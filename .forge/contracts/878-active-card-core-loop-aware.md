# Contract: #878 — «Pågår nå»-kortet på Hjem blir kjerne-løkke-bevisst

Worktree: `.claude/worktrees/nifty-mcnulty-682800` · Branch: `claude/nifty-mcnulty-682800`
Issue: https://github.com/jdlarssen/golf-app/issues/878

## Problem

Det aktive spill-kortet på Hjem (`app/[locale]/page.tsx`, seksjonen «Pågår nå») er tilstands-blindt:
det viser samme generiske «Pågående»-pille + pil uansett om spilleren må spille videre, har levert
scorekortet, eller har trukket seg. Det surfacer heller ikke at noen i flighten venter på at *du*
godkjenner scorekortet deres — flight-låsingen `docs/user-flows.md` punkt 6 advarer om. Og #363-løftet
(løft pågående spill med champagne) er halvt levert: kortet får gull-ramme, men `Section`-etiketten
forblir grå fordi `accent`-propen aldri sendes (`page.tsx:287`).

Hele tilstandsmaskinen finnes allerede i spill-hjem og kan gjenbrukes:
- `app/[locale]/games/[id]/(home)/PrimaryCta.tsx` — `computeState()` + CTA-strenger.
- `app/[locale]/games/[id]/(home)/PendingApprovalsBanner.tsx` — `pendingApprovalsForMe`-beregning
  via `isSingleFlightGame(gameMode, players)` (`lib/games/flightScope.ts`).
- `game_players`-feltene `submitted_at`, `withdrawn_at`, `approved_at`; `games.require_peer_approval`,
  `games.game_mode`.

## Gray areas — avklart med eier (2026-06-22)

1. **Kort-detalj:** Bare tilstands-ord (Fortsett / Levert ✓ / Til godkjenning / Trukket). INGEN
   «X av 18 hull»-teller på kortet.
2. **Trykk-mål:** Trykk på et *aktivt, ikke-levert* kort går RETT inn i runden — neste utastede hull,
   eller lever-siden når alle 18 er tastet. Levert/trukket aktivt kort + alle ikke-aktive kort →
   spill-oversikten `/games/[id]` (dagens oppførsel).
3. **Godkjenn-varsel:** Egen accent-linje RETT UNDER det pågående kortet (søsken-element, ikke nestet
   i kort-lenken) med `game.home.pendingApprovals`-tekst + lenke til `/games/[id]/approve`. Vises kun
   når `require_peer_approval && active && pendingApprovalsForMe > 0`.

## File boundaries

ONLY touch:
- `app/[locale]/page.tsx` (home query + render av «Pågår nå»-kortet + Section accent)
- `lib/games/activeCardState.ts` (NY — ren tilstands-resolver) + `.test.ts`
- `lib/games/getActiveGameCardData.ts` (NY — henter mates + scores for aktive spill, server)
  *(eller inline i page.tsx hvis renere — implementørens valg, men hold logikken testbar)*
- `messages/no.json` + `messages/en.json` (nye `home.*`-kortstrenger)
- `package.json` + `CHANGELOG.md` (MINOR bump — bruker-synlig feature)

Do NOT touch: scoring (`lib/scoring/`), RLS/migrasjoner, auth, spill-hjem-sidene, Dexie/sync,
empty-state/discovery-grenen på Hjem.

## Success criteria

- [ ] **C1 — Query utvidet.** Home `game_players`-spørringen henter `submitted_at, withdrawn_at,
  approved_at`; `games!inner`-joinen henter `require_peer_approval, game_mode`. `GameRow`-typen og
  `activeGames`-mappingen reflekterer feltene. *Evidence: select-string + type i `page.tsx`.*
- [ ] **C2 — Tilstands-resolver (ren + testet).** `lib/games/activeCardState.ts` eksporterer en ren
  funksjon som mapper `{ submitted_at, withdrawn_at, approved_at, require_peer_approval }` →
  `'continue' | 'submitted' | 'pending_approval' | 'withdrawn'`. Unit-test (`it.each`) dekker alle
  fire utfall + grensen peer-approval på/av. *Evidence: `npx vitest run lib/games/activeCardState.test.ts` grønt.*
- [ ] **C3 — Tilstands-etikett på kortet.** «Pågår nå»-kortet viser et tilstands-ord i stedet for den
  generiske `StatusPill`: Fortsett (forest) · Levert ✓ (grønn/success — semantisk «ferdig») · Til
  godkjenning (nøytral/info) · Trukket (dempet). Ikke-aktive kort i «Mine spill» beholder eksisterende
  `StatusPill` uendret. *Evidence: render-gren i `page.tsx` + strenger i no.json/en.json.*
- [ ] **C4 — «Rett inn i runden»-lenke.** Aktivt, ikke-levert, ikke-trukket kort lenker til neste
  utastede hull (`/games/[id]/holes/[n]`), eller `/games/[id]/submit` når alle 18 er tastet. Levert/
  trukket aktivt + alle ikke-aktive kort lenker til `/games/[id]` (dagens). Neste-hull beregnes via ett
  scoped scores-oppslag for de aktive-ikke-leverte spillene (parallelt, ikke N+1). *Evidence: routing-
  logikk + scores-oppslag i `page.tsx`/helper.*
- [ ] **C5 — Peer-godkjenning-nudge.** Egen accent-linje under kortet, kun når `require_peer_approval
  && active && pendingApprovalsForMe > 0`, med `game.home.pendingApprovals`-tekst + `reviewLink` →
  `/games/[id]/approve`. `pendingApprovalsForMe` beregnes med SAMME regel som
  `PendingApprovalsBanner` (gjenbruk `isSingleFlightGame`). Linja er et søsken-element, IKKE nestet i
  kort-`SmartLink`. *Evidence: render + gjenbruk av `isSingleFlightGame` i helper.*
- [ ] **C6 — Fullfør #363.** `<Section label={t('sectionInProgress')} accent>` på `page.tsx:287` —
  etikett + skillelinje får champagne-tone. *Evidence: diff på linje 287.*
- [ ] **C7 — Ingen regresjon.** Empty-state, discovery, «Mine spill», «Finn turneringer», «Avsluttede
  spill» uendret. Ingen schema/auth/RLS-endring. *Evidence: diff scope + gates.*
- [ ] **C8 — Copy humanizer-ren.** Nye norske strenger kjørt gjennom `humanizer`-skillet; en.json-
  paritet (naturlig engelsk). *Evidence: humanizer-pass nevnt i commit.*

## Gates (kjør scoped til endret kode)

- `npx tsc --noEmit` — grønt
- `npm run lint` (eller eslint på endrede filer) — grønt
- `npx vitest run lib/games/activeCardState.test.ts app/[locale]/HomeDiscoverySection.test.tsx` — grønt
- Versjon MINOR-bumpet i `package.json` + CHANGELOG-oppføring (commit-msg-hook håndhever for `feat`)
- Selv-sjekk: les `page.tsx`-render-grenene og bekreft hver C-kriterium mot koden

## Build order (atomiske commits)

1. `feat`: query-utvidelse + `activeCardState.ts` + unit-test (C1, C2)
2. `feat`: tilstands-etikett + «rett inn i runden»-routing + scores-oppslag (C3, C4)
3. `feat`: peer-godkjenning-nudge-linje (C5)
4. `feat`: Section accent (#363) (C6)
5. Bump + CHANGELOG kan ligge i commit 1 eller siste — men hver `feat`-commit må passere hooken
   (samle bump i én commit og hold resten som `refactor`/`feat` som staer pakke-filene, ELLER bump i
   commit 1 og la senere commits være del av samme feature — enklest: bump i commit 1).

## Bevisste beslutninger (ikke bryt)

- #392/#355: ingen create-dører på Hjem; bunn-nav uendret.
- #571: Hjem ≠ arkiv.
- #363: dette FULLFØRER løftet (C6), reverterer det ikke.
- #257: discovery/empty-state urørt.
- Champagne kun på highlight: «Levert ✓» bruker success-grønn (ferdig-semantikk), ikke gull; gull-
  rammen på kortet beholdes for det aktive «Fortsett»-kortet (#363).

## Verifisering før merge (eier/post-build)

Bruker-synlig flyt → klikk gjennom «Pågår nå»-kortet på `torny-staging` (Node 22) i alle fire
tilstander før PR-merge, per CLAUDE.md «Testing — staging, aldri prod».
