# Kontrakt #675 — Atomisk(-nok) cup/liga-oppretting (kompenserende rollback)

**Issue:** [#675](https://github.com/jdlarssen/golf-app/issues/675) · **Branch:** `claude/relaxed-brahmagupta-ee8cb3` (Bølge 1) · **Audit 2026-06-17**

## Problem

To opprettings-stier setter inn flere rader uten transaksjon. Feiler en innsetting halvveis, blir
halvbygde turneringer liggende som den ikke-tekniske eieren ikke kan rydde via SQL — samme symptom som
#641 («1 foreldreløs game-rad, 0 spillere»).

1. **Cup-match-generering** (`app/[locale]/admin/cup/[id]/generer/actions.ts:180-225`): en JS-for-løkke
   inserter `games` + `game_players` per match. Feiler match N, er alle tidligere matchers rader allerede
   committet, og match N sin `games`-rad kan stå igjen uten spillere.
2. **`createLeagueDraft`** (`lib/league/actions.ts:143-208`): inserter `leagues` → `league_rounds` →
   `league_players` i separate steg. Feiler runde- eller spiller-inserten, blir `leagues`-raden liggende.

## Tilnærming — kompenserende rollback (ikke RPC)

Issue-en rangerer en SECURITY DEFINER plpgsql-RPC som førstevalg. **Jeg velger bevisst den kompenserende
sletten** (issue-ens opsjon 2, gjort fullstendig), av fire grunner:

1. **Løser symptomet fullt ut.** For cup: samle ALLE innsatte `gameId`-er og slett dem på enhver feil
   (`games.delete().in('id', ids)`) — `game_players` har `on delete cascade` (0001), så de ryddes
   automatisk. For liga: slett `leagues`-raden (`league_rounds`/`league_players` har `on delete cascade`,
   0080). Ingen foreldreløse rader igjen etter en feil midt i flyten.
2. **Speiler eksisterende repo-mønster.** `startLeagueRoundFlight` (`lib/league/actions.ts:649-663`) ruller
   allerede tilbake en halvbygd flight på samme måte. Vi følger en etablert konvensjon, ikke en ny.
3. **Holder kolonne-logikken i den typede TS-stien.** En plpgsql-RPC måtte re-implementere alle
   insert-kolonnene for hånd i et utypet språk — nøyaktig den skjema-koblingen som *samme audit* (#672)
   pekte på som rotårsaken til de siste prod-havariene (#641/#642/#647). En RPC ville lagt til drift-flate,
   ikke fjernet den.
4. **Ingen migrasjon.** Lavere risiko for en P2-robusthetsfiks.

**Klient:** bruk request-scopet `supabase` (samme som inserten + presedensen). DELETE-policyene finnes
(`games`: 0071 `created_by = auth.uid()`; `leagues`: 0092 admin/club-admin), og oppretteren eier nettopp
radene. **Residual:** en sjelden dobbeltfeil (selve slette-kallet feiler også) kan fortsatt etterlate
rader; ekte DB-transaksjoner ville dekket det. Akseptert for P2 og notert.

## Suksesskriterier

- [x] **K1 (cup)** `generer/actions.ts`: `insertedGameIds`-array + `rollbackBatch`-closure; `gameErr` OG
      `gpErr` kaller `await rollbackBatch()` (sletter `games.in('id', ids)`, cascade) før `insert_failed`.
      `push(gameId)` etter vellykket game-insert. Tom array → guard hopper over delete.
- [x] **K2 (liga)** `lib/league/actions.ts`: `await supabase.from('leagues').delete().eq('id', leagueId)`
      lagt til på BÅDE `rounds_failed`- og `players_failed`-grenen før `return`.
- [x] **K3 (cup-test)** Ny describe «rollback on mid-loop failure (#675)»: gp-insert feiler på match 2 →
      assert `games.delete` + `.in('id', ['game-1','game-2'])` + resultat `insert_failed`. Grønn.
- [x] **K4 (liga-test)** Ny describe «rollback on insert failure (#675)»: rounds-insert feiler → assert
      `leagues.delete` + `.eq('id','L1')` + resultat `rounds_failed`. Grønn.
- [x] **K5** Happy-path uendret: alle eksisterende cup-/league-tester fortsatt grønne (14/14 totalt).
- [x] **K6** Gates: `tsc --noEmit` → exit 0; vitest (begge action-filer) → 14/14; `npm run build` → exit 0.

## Gates

```bash
npx tsc --noEmit
npx vitest run "app/[locale]/admin/cup/[id]/generer/actions.test.ts" lib/league/actions.test.ts
npm run build
```

## Ikke i scope

- SECURITY DEFINER plpgsql-RPC for ekte transaksjonell atomisitet (utsatt + begrunnet over).
- Dobbeltfeil-edge (kompenserende delete feiler også).
- Endring av insert-kolonner/-former (uberørt; allerede korrekt etter #641/#647).

## Versjon

PATCH → 1.132.8 (admin-synlig robusthet: ingen halvbygde turneringer ved feil). CHANGELOG under åpent tema.
Monotone bumps innad i Bølge 1 (#680 = 1.132.7) for konfliktfri samlet PR.
