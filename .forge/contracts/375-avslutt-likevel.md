# Forge-kontrakt: Avslutt-likevel når en spiller ikke har levert (#375)

**Issue:** [#375](https://github.com/jdlarssen/golf-app/issues/375)
**Branch:** `claude/modest-wilbur-c4cc7b`
**Flyt:** 5 — Kjør og avslutt spill (`docs/flows/05-kjor-og-avslutt-spill*.svg`)
**Bump:** MINOR (ny bruker-synlig admin-feature) → `1.63.0` → `1.64.0`

## Problem

`endGame` (`app/admin/games/[id]/actions.ts:292`) og `endGameWithSideWinners`
(`app/admin/games/[id]/avslutt/actions.ts:131`) blokkerer hardt med
`?error=not_all_submitted` hvis **én** spiller ikke har levert. Det finnes ingen
escape: ingen remove-player-action, og `trekk-fra` virker kun før start. Én
no-show (telefon død, dro etter 9 hull, dukket aldri opp) **låser spillet
permanent** fra å avsluttes. Speilbilde av #360 (peer-godkjenning-lås), men for
levering.

## Beslutning (avklart med bruker 2026-06-01)

- **Egen bekreftelses-side** (ikke popup) — matcher app-mønsteret for tunge
  handlinger (`/slett`, `/avslutt`). Lister hvem som mangler før bekreftelse.
- **«Ikke fullført»-markering kun i admin-flaten** — leaderboardet håndterer
  no-shows som ufullstendige (slik «ikke spilt»-hull fungerer i dag), uten eget
  merke. Ingen endring i de 15+ leaderboard-view/podium-komponentene.

## Designvalg (mine, per «no technical decisions to user»)

1. **Ingen DB-endring.** «Ikke fullført»-tilstand er **avledet**:
   `game.status === 'finished' && submitted_at == null`. `submitted_at` settes
   **aldri** for no-shows (ingen falsk levering). Robust ved gjenåpning: status
   tilbake til `active` → tilstanden forsvinner automatisk.
2. **Escape via opt-in-param, ikke fjernet validering.** Begge end-actions får
   en `allowMissing`-param (default `false`). Default-stien er uendret — escapen
   er eksplisitt. Bevarer dagens validering som default (issue-krav).
3. **Scope = kun levering.** `allowMissing` lemper **kun** submission-sperra.
   `not_all_approved` (submitted-men-ikke-godkjent) forblir en hard sperre —
   det eies av #360. Force-knappen tilbys derfor kun når levering er **eneste**
   blokker (`notSubmittedCount > 0 && pendingApprovalCount === 0`).
4. **Leveringssperra beholdes for godkjente-men-ufullstendige:** force-loopen
   hopper over null-leverere, men beholder approval-gaten for de som faktisk
   leverte.

## Berørte filer

| Fil | Endring |
|---|---|
| `app/admin/games/[id]/actions.ts` | `endGame(gameId, allowMissing = false)` — loop hopper over no-shows når `allowMissing` |
| `app/admin/games/[id]/avslutt/actions.ts` | `endGameWithSideWinners(gameId, allowMissing, formData)` — samme loop-endring |
| `app/admin/games/[id]/avslutt-likevel/page.tsx` | **NY** dedikert bekreftelses-side (ikke-sideturnering) |
| `app/admin/games/[id]/avslutt/page.tsx` | Last spillere, vis mangler-advarsel, send `allowMissing` til action-bind |
| `app/admin/games/[id]/page.tsx` | «Avslutt likevel»-link i end-kortet; per-spiller «Ikke fullført» i roster ved finished; «N spilte ikke ferdig»-sub på Levert-raden |
| `app/admin/games/[id]/actions.test.ts` | Ny test: force-sti avslutter uten å markere no-show som levert |
| `docs/flows/05-kjor-og-avslutt-spill*.svg` + `.png` | Oppdater flyt 5 (avslutt-likevel ikke lenger blindvei) |
| `package.json` + `CHANGELOG.md` | MINOR-bump + oppføring |

## Akseptkriterier

- [ ] **AC1 — Kan avslutte med no-show.** Arrangør kan avslutte et aktivt spill
  selv om én eller flere ikke har levert, via «Avslutt likevel». *(Bevis:
  endGame force-test grønn + manuell/eval-sti.)*
- [ ] **AC2 — Ser hvem som mangler.** Bekreftelses-siden (ikke-sideturnering) og
  `/avslutt`-wizarden (sideturnering) lister navnene på de som ikke har levert
  før arrangøren bekrefter. *(Bevis: `avslutt-likevel/page.tsx` renderer
  mangler-liste; `avslutt/page.tsx` viser advarsel med navn.)*
- [ ] **AC3 — Markeres «ikke fullført», ikke levert.** `submitted_at` forblir
  `null` for no-shows. Roster på finished-spill viser «Ikke fullført» (ikke
  «✓ Levert»/«⏳ Spiller»). *(Bevis: force-test asserter ingen submit-write på
  no-show; `page.tsx`-status-branch finished && !submitted_at.)*
- [ ] **AC4 — Aldri permanent låst.** Det finnes alltid en vei til `finished`
  når levering er eneste blokker. *(Bevis: force-knapp vises når
  `notSubmittedCount > 0 && pendingApprovalCount === 0`.)*
- [ ] **AC5 — Bump + CHANGELOG.** MINOR-bump til `1.64.0` + CHANGELOG-oppføring
  i samme commit som UI-en. *(Bevis: commit-msg-hook passerer.)*
- [ ] **AC6 — Flyt 5 oppdatert.** `05-kjor-og-avslutt-spill`-diagrammet
  reflekterer at avslutt-likevel finnes (ikke lenger ⚠-blindvei). *(Bevis: SVG +
  regenerert PNG i diffen.)*

## Gates (kjør scoped til det som endres)

1. `npx vitest run "app/admin/games/[id]/actions.test.ts"` → grønn
2. `npx tsc --noEmit` → ingen feil
3. `npm run build` → grønn (fanger exhaustive-switch/Record-feil Vercel ellers
   ville feilet på)
4. `.githooks/commit-msg` passerer (bump+CHANGELOG staget på feat-commit)

## Ikke i scope (unngå gold-plating)

- Peer-godkjenning-lås (#360) — egen issue, egen sperre.
- Auto-varsel/purring om levering (#376).
- «Ikke fullført»-merke på det delte leaderboardet (bruker valgte admin-only).
- Remove-player / fjern-fra-roster-action (ikke nødvendig for å låse opp).

## Commit-plan

1. `refactor(admin): thread allowMissing escape through endGame actions` —
   server-action-plumbing + unit-test (default false → ingen bruker-synlig
   endring → ingen bump).
2. `feat(admin): la arrangør avslutte når en spiller ikke har levert` —
   bekreftelses-side + detalj-side-wiring + `/avslutt`-utvidelse + per-spiller
   «Ikke fullført» + bump + CHANGELOG.
3. `docs(flows): reflect avslutt-likevel in flow 5 diagram`.
