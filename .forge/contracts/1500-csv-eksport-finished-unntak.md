# Kontrakt: CSV-eksport åpen for hele cup-publikummet på ferdige spill (#1500)

**Issue:** #1500 · **Branch:** `claude/csv-export-1500` (fersk fra origin/main)
**Egen liten fix-PR** — separat fra #1488-oppryddingen.

## Kontekst (ground truth lest i økta)

- `app/[locale]/games/[id]/leaderboard/export/route.ts` returnerer allerede 404 for
  alt annet enn `status='finished'` (linje 99–104). Deltaker/admin-gaten på linje
  106–109 kjører ETTER finished-sjekken — for en innlogget ikke-deltaker på en ferdig
  best_ball-kamp gir den 404-JSON som lastes ned som `.csv` (UI-knappen i
  `State4View.tsx:173,193` vises ubetinget på ferdige spill).
- Leaderboard-siden fikk i #1468 unntaket `!isAdmin && !isParticipant &&
  game.status !== 'finished'` → alle innloggede ser ferdige spill. Ruta skal speile
  samme synlighet.
- Scores-lesing i ruta går via request-klienten — RLS tillater lesing av alle scores
  på ferdige spill (samme sti som #1468-leaderboardet bruker for ikke-deltakere).

## Beslutning

Siden ruta KUN serverer ferdige spill, er deltaker/admin-gaten død kode etter
#1468-synligheten: fjern gaten OG den nå ubrukte `is_admin`-querien i stedet for å
legge til et alltid-sant unntaksledd. Gaten som består: innlogget (401) + spill
finnes (404) + finished (404). Samme synlighet som leaderboard-siden.

## Suksesskriterier (avkrysses KUN med evidens)

- [x] **K1.** Innlogget ikke-deltaker får 200 + `text/csv` med reelt innhold fra
  `/games/<id>/leaderboard/export` for en FERDIG best_ball-kamp. Evidens:
  staging-verifisering (klikk/fetch som ikke-deltaker) med respons-detaljer.
  → Playwright-driver 2026-08-07 mot lokal server + torny-staging: e2eplayer
    (verifisert ikke-deltaker, 4 deltakere i kampen) fikk 200,
    `text/csv; charset=utf-8`, attachment-filnavn, body «﻿Tørny - resultater…»
    med lagrader. Bevis-kommentar på PR #1507.
- [x] **K2.** Ikke-finished spill gir fortsatt 404 (`finishedOnly`), uinnlogget gir
  401. Evidens: kode-lesing (sjekkene består uendret) + staging-sjekk av 401/404-sti
  der det er praktisk.
  → Aktivt spill `9df7b9e0…` ga 404 `{"error":"Eksport er bare tilgjengelig for
    ferdigspilte spill"}` i samme driver-kjøring; `getProxyVerifiedUserId`-401-sjekken
    er uendret i diffen.
- [x] **K3.** `is_admin`-querien er fjernet og ingen ubrukte imports står igjen.
  Evidens: diff + `npm run lint` uten warnings for fila.
  → Diff commit `1d406d50` (−20/+10, Promise.all → enkel getGameWithPlayers);
    `npx eslint` på ruta = 0 funn; tsc/build/full vitest grønne; CI grønn på PR #1507.

**Utfall:** PR #1507 rebase-merget `980f8c79` 2026-08-07; issue #1500 lukket med
closing-kommentar. Oppfølging i samme PR: foreldreløs `noAccess`-nøkkel fjernet
(commit `16ee8fa9`).

## Gates

`npx tsc --noEmit` · `npm run lint` · `npm run build` · full `npx vitest run` før
push (ruta har ingen co-located test — sjekket med glob; e2e `@gate` kjøres av CI).

## Commit-plan

1. `fix(leaderboard)`: åpne CSV-eksporten for alle innloggede på ferdige spill —
   patch-bump + CHANGELOG-linje. `Refs #1500`; PR med `Closes #1500`.
   Staging-bevis + `staging-verified`-label FØR merge (#1076).
