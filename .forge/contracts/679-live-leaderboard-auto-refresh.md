# Kontrakt: #679 — Live leaderboard auto-refresh på alle format-visninger

## Problem

`docs/user-flows.md` Funn #4 («Leaderboard er ikke realtime») er fortsatt
substansielt knekt for formatene spillerne faktisk bruker. Realtime-refresh
(`PreRoundLeaderboardRealtime` → `router.refresh()` på en `scores`-INSERT) er
montert i kun 2 av ~16 leaderboard-grener (brutto/team-statene i `page.tsx`).
Alle format-spesifikke grener — stableford, strokeplay, skins, wolf, nassau,
BBB, round robin, acey-deucey m.fl. — rendrer UTEN realtime. Per-hull-siden
(`leaderboard/holes/page.tsx`) har ingen montering i det hele tatt. Layout-
nivåets `RealtimeMount` skriver kun til Dexie og kaller aldri `router.refresh()`,
så den gjør ingenting for de server-rendrede leaderboardene. Netto: en spiller
ser frosne tall mens flight-medspillere taster, til hen manuelt drar for å
oppdatere.

## Suksesskriterier

- [x] En refresher montert ÉN gang i den delte `LeaderboardShell`, så alle
      ~14 format-visningene arver live auto-refresh uten at de 19 visnings-
      filene røres.
- [x] Per-hull-siden (`holes/page.tsx`, som ikke bruker `LeaderboardShell`) får
      sin egen montering, dekker alle format-grener + generisk drilldown.
- [x] Refresher abonnerer på `scores`-INSERT for spillet og kaller
      `router.refresh()` (debounced) → server re-evaluerer mot fersk Postgres.
- [x] Gatet til aktivt spill: per-hull sender `active={isActive}`; et avsluttet
      spill setter ikke opp WebSocket der.
- [x] Følger eksisterende realtime-mønster (`subscribeRealtimeChannel`) — ingen
      ny WebSocket-oppkobling oppfunnet; `setAuth`-quirken håndteres av helperen.
- [x] Én co-located render-/oppførsels-test (per «maks én render-test»).
- [x] Eksisterende leaderboard-tester (37 filer / 186 tester) fortsatt grønne.

## Gates

- `npx vitest run app/[locale]/games/[id]/leaderboard/` → 37 filer grønne.
- `npx tsc --noEmit` → ingen feil i `LeaderboardRealtime.tsx`,
  `LeaderboardChrome.tsx`, `holes/page.tsx` eller test-filen.

## Tilnærming

Ny `'use client'`-komponent `LeaderboardRealtime` (kopierer
`PreRoundLeaderboardRealtime`-mønsteret):

- `useRouter().refresh()` på `scores`-INSERT, 300ms debounce kollapser en byge
  (helt scorekort levert på én gang) til én refresh.
- `subscribeRealtimeChannel('leaderboard-live:<id>', …)` eier **setAuth-
  quirken**: WebSocket-transporten plukker ikke opp cookie-sesjonen
  automatisk, så helperen kaller `supabase.realtime.setAuth(access_token)` før
  `subscribe()` + gjør lekk-resistent opprydding. Gjenbrukt, ikke gjenoppfunnet.
- **Spill-ID:** `gameId`-prop når gitt (per-hull-siden har den server-side),
  ellers parses den fra `window.location.pathname` (`/games/<id>/…`).
  Bevisst IKKE `useParams`: de eksisterende format-visnings-testene mocker bare
  `useRouter` på `next/navigation`, så en hook-avhengighet til ruten ville
  sprengt ~14 co-located tester uten å røre selve visningene.
- `active=false` → ingen abonnent (per-hull-gaten).

Montering:
- `LeaderboardChrome.tsx`: `<LeaderboardRealtime />` i begge `LeaderboardShell`-
  grenene (chromeless + full).
- `holes/page.tsx`: `withRealtime(body)`-wrapper rundt hver format-gren,
  `<LeaderboardRealtime gameId={id} active={isActive} />`.

## Bevis

- Co-located test `LeaderboardRealtime.test.tsx` grønn (1/1): abonnerer når
  aktiv + leser ID fra URL, registrerer `scores`-INSERT-handler med riktig
  filter, debounced `router.refresh` fyrer, og INGEN abonnent når `active=false`.
- Hele `leaderboard/`-suiten grønn: 37 filer / 186 tester.
- `tsc --noEmit`: 0 feil i de berørte filene.

## Avvik / risiko

- Avsluttede podier rendrer også gjennom `LeaderboardShell` → der står `active`
  på default `true`. Et avsluttet spill produserer ingen `scores`-INSERT, så
  abonnementet er inert (idle WebSocket, ingen funksjonell effekt). Et ekte
  status-gate i shellen ville krevd å endre de 19 call-sitene — utenfor scope.
  Per-hull-siden har det ekte gatet (`active={isActive}`).
