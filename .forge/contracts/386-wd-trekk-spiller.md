# Forge-kontrakt: WD / trekk spiller — hold trukne spillere ute av rangeringen (#386)

**Issue:** [#386](https://github.com/jdlarssen/golf-app/issues/386)
**Branch:** `issue-386-wd-trekk-spiller`
**Flyt:** 5 — Kjør og avslutt spill
**Søsken:** #375 (avslutt-likevel, shipped v1.64.0) · #360 (peer-godkjenning-lås)
**Bump:** MINOR → `1.64.1` → `1.65.0` (ny bruker-synlig feature: datamodell + admin/spiller-handling + leaderboard)

## Problem

Det finnes ingen måte å markere at en spiller **trakk seg / dro / aldri møtte opp** midt i et aktivt spill. Scorene de rakk å taste teller fortsatt i rangeringen, og selv-uttrekk (`trekk-fra`) virker bare før start (sletter rosterraden). #375 lar deg avslutte med no-shows som *teller* («ikke levert»); denne lar deg ta noen helt *ut* av rangeringen (WD).

## Modell (tre slutt-tilstander, avklart med bruker)

| Tilstand | Scorene teller? | Merke | Kilde |
|---|---|---|---|
| Levert | Ja | «Levert» | finnes |
| Spilte, leverte ikke | Ja | «Ikke levert» | #375 + #385 |
| **Trukket / WD** | **Nei** | **«Trukket»** | denne |

## Beslutninger (avklart med bruker 2026-06-01)

1. **Hvem trekker:** både arrangør og spiller (under aktivt spill).
2. **Admin-flate:** to steder — per-spiller på admin-rosteret under spill, OG per-spiller-valg i avslutt-likevel-bekreftelsen.
3. **Leaderboard-visning:** vis trukne som «Trukket» uten plassering, i **én delt «Trukket»-seksjon** under leaderboarden (view-agnostisk — ikke inline i hver av de 15+ mode-viewene).
4. **Angre:** både admin og spiller kan gjeninnsette (nulle WD), kun mens spillet er `active`.
5. **Spillerens eget scorekort ved WD:** låses read-only, viser «Du har trukket deg» + angre-knapp.
6. **Format-omfang v1:** WD tilbys kun for individuell-ball-totalformat (se §Format-scope). Andre format faller tilbake på «ikke levert».

### Bakte-inn gråsoner (mine beslutninger)

- **WD ↔ avslutt-gate:** en trukket spiller hoppes over i BÅDE leverings- og godkjenning-sjekken i `endGame`/`endGameWithSideWinners`. Konsekvens: trekk en no-show → spillet blir vanlig avsluttbart igjen. «Levert scorekort X/Y» og `everyPlayerReady` teller trukne ut av nevneren.
- **`submitted_at` beholdes:** hadde spilleren levert og så trekker seg, nulles ikke `submitted_at` — `withdrawn_at` overstyrer for rangering.
- **Avslutt-likevel-default:** per manglende spiller er default «tell scorene» (ikke levert); «trukket» er eksplisitt opt-in.
- **Out-of-scope-format konsistens:** for format uten WD-støtte vises WD verken for admin eller spiller; begge faller tilbake på «ikke levert».
- **Varsling:** best-effort varsel til spilleren ved admin-WD, gjenbruk eksisterende notify-infra, ingen ny type. Lav prioritet.

## Datamodell

Migrasjon i `supabase/migrations/` (neste ledige nummer), additiv + nullable (null-risiko — alle eksisterende rader = ikke trukket):

```sql
ALTER TABLE public.game_players
  ADD COLUMN withdrawn_at timestamptz,
  ADD COLUMN withdrawn_by_user_id uuid REFERENCES public.users(id);
```

- `withdrawn_at` satt = WD. Avledet tilstand, ingen status-enum.
- `withdrawn_by_user_id` = hvem trakk (self vs admin), for audit + admin-klarhet.
- Angre = sett begge til `null`.
- **RLS:** policy som lar `auth.uid() = user_id` sette/nulle egne `withdrawn_at` mens `games.status = 'active'` (self-WD/angre); admin gjør det via admin-klient i server-action.
- Etter migrasjon: regenerer `lib/database.types.ts` (Supabase MCP `generate_typescript_types`) eller hånd-legg til de to kolonnene.

## Format-scope

Predikat `supportsWithdrawal(mode: GameMode): boolean` (ny, i `lib/scoring/` med exhaustiveness-`never`-sjekk + Type-A-test):

- **In-scope (WD tilbys, ekskluderes fra rangering):** `best_ball`, `stableford`, `modified_stableford`, `solo_strokeplay` — individuell-ball-totalformat der eksklusjon endrer rangeringen.
- **Out-of-scope (WD ikke tilbudt, faller tilbake på «ikke levert»):** alle øvrige 18 modes. Begrunnelse: scramble/shamble/patsome bruker delt lag-kort (WD = ingen scoring-effekt, kosmetisk), matchplay-familien + pott-format (wolf/nassau/skins/nines/bbb/acey-deucey/round-robin) har walkover/carryover-semantikk = egen kan-orm per format, spores som oppfølging.

## Komponenter

1. **Migrasjon + types** — kolonner + RLS-policy + regenererte types.
2. **Scoring-eksklusjon** (`app/games/[id]/leaderboard/page.tsx` + ev. `lib/scoring`): filtrer trukne spillere ut av `ctx.players` og scorene deres FØR `computeLeaderboard`. Best ball: laget fortsetter med gjenværende medlem; begge trukket → laget faller ut. Bygg en separat `withdrawnPlayers`-liste til visning.
3. **Delt «Trukket»-seksjon** — én komponent rendret av leaderboard-rammen (under mode-viewet), lister navn + «Trukket»-merke, ingen plass. Vises kun når listen er ikke-tom.
4. **Self-WD** — utvid `withdrawFromGame` (`app/games/[id]/withdrawActions.ts`): pre-start beholder DELETE; under `active` (og kun for `supportsWithdrawal`-modes) setter `withdrawn_at`. `trekk-fra`-siden vises også under aktivt spill med tilpasset copy. Spiller-angre-vei på game-home.
5. **Scorekort-lås** — når innlogget spiller har `withdrawn_at`, blir scorekort/hull-tasting read-only med «Du har trukket deg» + angre.
6. **Admin-WD (roster)** — per-spiller «Trekk»-handling på `app/admin/games/[id]/page.tsx` under aktivt spill, dedikert bekreftelses-side (à la `/slett`), server-action setter `withdrawn_at` + `withdrawn_by_user_id`. Admin-angre fra roster.
7. **Admin-WD (avslutt-likevel)** — per manglende spiller et valg «tell scorene» (default) vs «trukket» i avslutt-likevel/avslutt-flyten.
8. **Avslutt-gate-integrasjon** — `endGame` + `endGameWithSideWinners` hopper over trukne i leverings- OG godkjenning-loopen. Admin-detalj-siden teller trukne ut av `notSubmittedCount`/`pendingApprovalCount`/`everyPlayerReady`/«Levert X/Y».
9. **Sideturnering** — ekskluder trukne fra LD/CTP-vinner-nedtrekk.
10. **Flyt 5-diagram** + **CHANGELOG** + **bump**.

## Akseptkriterier

- [ ] **AC1 — Spiller kan trekke seg under aktivt spill** (in-scope-format): `withdrawn_at` settes, rosterrad + scorer består. Pre-start beholder slette-oppførsel. *(server-action-test + migrasjon)*
- [ ] **AC2 — Arrangør kan trekke en spiller** fra roster under spill (dedikert bekreftelse) og i avslutt-likevel (per-spiller, default «tell scorene»). *(action-test + UI)*
- [ ] **AC3 — Trukne ekskluderes fra rangeringen:** scorene teller ikke; best ball fortsetter med gjenværende medlem; begge trukket → laget ute. *(Type-A scoring-test)*
- [ ] **AC4 — Trukne vises som «Trukket» uten plass** i delt seksjon under leaderboarden. *(render-test, maks én)*
- [ ] **AC5 — Angre virker** for både admin og spiller (nuller WD), kun `active`. *(action-test)*
- [ ] **AC6 — Scorekortet låses** read-only for en trukket spiller, med «Du har trukket deg» + angre. *(UI)*
- [ ] **AC7 — Avslutt-gate hopper over trukne:** trekk en no-show → `everyPlayerReady` blir sann, spillet vanlig avsluttbart; «Levert X/Y» teller trukne ut. *(action-test + page-logikk)*
- [ ] **AC8 — Format-scope håndhevet:** `supportsWithdrawal` true kun for de 4 in-scope-modene (exhaustiveness); WD-UI skjult for resten. *(Type-A-test)*
- [ ] **AC9 — Bump + CHANGELOG + flyt 5-diagram oppdatert.**

## Gates (scoped til det som endres)

1. `npx vitest run` på nye/endrede co-located tester (scoring-eksklusjon, `supportsWithdrawal`, withdraw-actions, endGame-gate) → grønt
2. `npx tsc --noEmit` → rent (nye kolonner i types må matche migrasjonen)
3. `npm run build` → grønt (exhaustive switch/Record for ny predikat + ev. nye mode-grener)
4. `.githooks/commit-msg` passerer på feat-commit (bump + CHANGELOG)

## Ikke i scope (unngå gold-plating)

- WD-semantikk for matchplay-familien (walkover) + pott-format (skins/wolf/nassau/nines/bbb/acey-deucey/round-robin) — egne oppfølginger.
- Inline «Trukket»-merking i hver lag-rad (delt seksjon dekker v1).
- Peer-godkjenning-lås (#360).
- Auto-purring (#376) / avslutnings-varsel (#377).

## Deploy-ordre (operasjonelt, utenfor build-loop)

Additiv nullable migrasjon → trygg å kjøre FØR kode-deploy (eksisterende kode rører ikke kolonnen; ny kode trenger den). Plan: apply migrasjon (Supabase MCP, verifiser med `list_tables`) → regenerer types → merge kode-PR → Vercel deployer. Migrasjons-apply skjer som et bevisst, verifisert steg (ikke stille inne i bygge-løkka).

## Commit-plan (atomiske)

1. `feat(db)` migrasjon + types + RLS + `supportsWithdrawal`-predikat + Type-A-test.
2. `feat(scoring)` leaderboard-eksklusjon + delt «Trukket»-seksjon + tester.
3. `feat(games)` self-WD (withdrawFromGame aktiv-gren) + scorekort-lås + spiller-angre.
4. `feat(admin)` admin-WD (roster + avslutt-likevel) + angre + avslutt-gate-integrasjon.
5. `docs(flows)` flyt 5-diagram + `feat`-bump/CHANGELOG i den bruker-synlige commiten.
