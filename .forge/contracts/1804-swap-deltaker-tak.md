# Kontrakt #1804 — deltaker-taket omgås av spillerbytte i personlig cup

Kilden er kontrakt-kommentaren på issue #1804 (skrevet av kontrakt-smeden,
fersk-kontekst-verifisert mot main `dce755d`). Denne fila er byggerens
bokføring: kriteriene med evidens fra selve kjøringen. Klasse: bruker-synlig.
Produktvalg: JA (A/B i PR-body — PR-en venter på eier, ingen auto-merge).

## Design (Alternativ A — bygget)

Tak-sjekken bor i planfasen: `checkSwapParticipantCap` (lib/cup/actions.ts),
kalt fra `planCupMatchSwap` etter `validateMatchSwap`. Gate `!groupId &&
!actorIsAdmin` speiler `addCupParticipant`; to nye admin-lesinger
(deltakerlista + ut-spillerens rader over alle cupens matcher); ren beslutning
`swapExceedsPersonalPlayerCap` i lib/cup/participantRosterSync.ts (sibling til
planParticipantRosterSync — samme forlater-cupen-semantikk). Feilkode
`too_many_players` gjenbrukes; lese-feil → `swap_failed` (fail-closed).

Byggerens valg (kontrakten ba om notat i PR):
- Hjem for ren fn: participantRosterSync.ts (ikke limits.ts) — cap-tall og
  sammenligning forblir i limits, sett-matematikken bor hos søster-beslutningen.
- Rest-kanten: planfasen GODSKRIVER at ut-spillerens rad fjernes når hun
  forlater cupen helt (kontraktens primærvei; konservativ variant ville brutt
  akseptkriterium 3). Dokumentert i JSDoc på swapExceedsPersonalPlayerCap.
- Refactor: gaten trukket ut som egen funksjon — planCupMatchSwap gikk ellers
  over eslint-komplekstaket (26 > 25).

## Success Criteria

- [x] Type A-test: beslutningsfunksjonen dekker kantene {reserve ny/allerede
      deltaker} × {ut forlater/blir} × {på/under taket} × {admin uncapped}.
      Evidens: lib/cup/participantRosterSync.test.ts, 8 it.each-rader. RED
      observert (`8 failed | 6 passed`) før implementasjon, GREEN etter
      (`14 passed`). Commit 84b30b76.
- [x] `swapCupMatchPlayer` på personlig cup på taket m/ ny reserve →
      `too_many_players`; ingenting skrevet. Evidens: lib/cup/actions.test.ts
      «deltaker-taket vokter planfasen (#1804)», test 1 — asserter 0
      game_players-delete/insert, 0 participant-upsert/delete, ingen redirect.
      RED observert (fikk `swap_failed`, mock-kø forskjøvet) før wiring, GREEN
      etter (`18 passed`). Commit 76f61711.
- [x] Samme bytte der ut-spilleren forlater cupen helt går gjennom som før.
      Evidens: samme describe, test 2 — RedirectError til
      `/admin/cup/cup-1?status=player_swapped` med full skrive-kø. GREEN.
- [x] Ny i18n-nøkkel i begge locales; SwapMatchPlayer viser presis melding.
      Evidens: messages/no.json + messages/en.json
      `cup.swap.errors.too_many_players` med `{cap}`; SwapMatchPlayer.tsx
      special-case-gren før generisk mapping, `{ cap: MAX_PERSONAL_CUP_PLAYERS }`
      (presedens CupParticipantsList). Humanizer kjørt på norsk streng.
      Render-bevis: staging-runden (se Gates).
- [x] `npx tsc --noEmit` + `npx eslint` + `npx vitest run lib/cup` grønne.
      Evidens: tsc exit 0 · eslint exit 0 (0 problems etter refactor) ·
      lib/cup 37 filer / 656 tester grønne.

Ekstra guardrail fra kontrakten (testet): tak-lesing feiler → `swap_failed`,
ingenting skrives, `[cup] swapCupMatchPlayer cap read failed` logges.

## Gates

- [x] Full `npx vitest run`: 517 filer / 6984 tester, exit 0 (også evaluatorens
      egen kjøring: identiske tall, 0 unhandled errors).
- [x] `npm run build`: exit 0.
- [ ] CI grønn på PR (sjekkes etter push av rebasen).
- [x] Staging-klikk av swap-flyten før merge + label. Evidens: Playwright-driver
      mot torny-staging som ikke-admin cup-skaper — avvisning på full cup
      (banner `cup-swap-error-<id>`, {cap}=24 interpolert, deltakere uendret 24,
      0 skrivinger) OG pass-through når frafallet forlater cupen helt (redirect
      `?status=player_swapped`, Match A = reserve+motstander, deltakere 24 med
      frafall ut/reserve inn). Prod-vakt: alle Supabase-kall assertert mot
      staging-ref. Testdata slettet radvis (RETURNING-tellinger). Bevis-kommentar
      + `staging-verified`-label på PR #1808.

## Evaluering

Fersk-kontekst-evaluator (opus): **ACCEPT** — se
`.forge/evaluations/1804-swap-deltaker-tak.md`. Funn F3 (fail-open i
`addCupParticipant` ved lesefeil) filt som eget issue før merge; F7 (rebase)
utført; F4 (over-taket blokkerer nøytrale bytter — kontrakts-foreskrevet) notert
i PR-kommentaren til eieren.

## Out of Scope — respektert

`syncParticipantsAfterSwap` urørt · ingen DB-/RLS-endring · match-taket urørt ·
de tre eksisterende håndhevelsene urørt (diff = kun planlagte filer).
