# Spec: #943 — Emoji-reaksjoner på leaderboard-rader (banter-lag MVP)

## Problem

Halve gleden ved en kompis-runde er tøyset, men i appen finnes ingen vei å si noe.
All spiller-kommunikasjon er enveis system-varsler + e-post (22 varsel-typer) —
ingen tråd, ingen reaksjon, ingen banter. Et leaderboard føles som en kalkulator,
ikke en hangout, og gruppen holder en parallell WhatsApp-tråd ved siden av.

Dette er det første, letteste skrittet i epic #951 (live + sosial turneringsfølelse):
**emoji-reaksjoner på en spillers leaderboard-rad.** Lav risiko, høy banter-verdi,
og fundamentet for et senere fritekst-banter-lag — uten å bygge full chat nå.

## Research Findings

Ingen ekstern bibliotek-research er nødvendig: hele stacken denne featuren trenger
(Supabase RLS, realtime, varsel-helper) er allerede battle-testet i repoet. Å
importere en ny tilnærming ville lagt til risiko, ikke fjernet den. Funn fra
kodebase-scout (alle med `file:line`):

- **Realtime-mønster (gjenbruk, ikke gjenoppfinn):** `subscribeRealtimeChannel()`
  i `lib/sync/realtimeChannel.ts:49-80` eier `setAuth`-quirken (WebSocket-transporten
  plukker ikke opp cookie-sesjonen selv) + lekk-resistent opprydding.
  `LeaderboardRealtime.tsx:55-103` abonnerer på `scores` INSERT/UPDATE filtrert på
  `game_id`, debouncer 300ms, og kaller `router.refresh()` → server re-rendrer.
- **Leaderboards er server-rendret.** Hver av ~16 format-visninger
  (`app/[locale]/games/[id]/leaderboard/*View.tsx`) rendrer egne rader; **ingen delt
  rad-primitiv finnes.** Live-oppdatering skjer via `router.refresh()`, ikke client-state.
- **RLS-mønster:** `SECURITY DEFINER`-helpere (`is_admin()`, `same_flight()`,
  `can_score_for()` i `0002`/`0104`) med `set search_path = public, pg_catalog`
  (0104-herding). Deltaker-sjekk = `exists(select 1 from game_players where
  game_id=… and user_id=auth.uid())`.
- **Varsel-helper:** `notify()` i `lib/notifications/notify.ts:27-84` + `kind`-union i
  `lib/notifications/types.ts`. Brukes **bevisst ikke** i denne MVP-en (stille).
- **Synlighet:** `lib/games/visibility.ts:7-14` — `score_visibility` ('live'|'reveal')
  × `status`. Leaderboardet er synlig live ved 'live', ellers ved 'finished'.
- Neste migrasjon: **0119**.

## Prior Decisions

- **#679 (live leaderboard):** Gjenbruk `subscribeRealtimeChannel` + monteringen i
  `LeaderboardRealtime`. `setAuth`-quirken håndteres av helperen. Leaderboards er
  server-rendret + `router.refresh()`-drevet — reaksjons-tall rendres derfor
  server-side, ikke som isolert client-fetch.
- **#598/#610 (delt leaderboard-chrome):** Nye visninger IMPORTERER delte primitiver,
  kopierer ikke. → `RowReactions` blir den delte reaksjons-primitiven hver
  individuell-spiller-visning importerer (én linje per visning), ikke duplisert logikk.
- **0104/0107/0109 (RLS-herding):** Nye `SECURITY DEFINER`-helpere MÅ ha
  `set search_path`. Kolonne-immutabilitet håndheves via triggere **for UPDATE**.
  Reaksjoner er **insert/delete-only** (toggle = delete+insert), ingen UPDATE-policy
  → ingen immutabilitets-trigger nødvendig.
- **Test-disiplin:** maks én render-test per komponent (`RowReactions.test.tsx`);
  Type A ren-logikk-test for reaksjons-aggregatoren; ikke re-asserter tall på tvers
  av format-visninger.

## Design

### Datamodell — `reactions` (migrasjon 0119)

```sql
create table public.reactions (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references public.games(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,   -- hvem reagerer
  target_user_id  uuid not null references public.users(id) on delete cascade,   -- hvis rad
  emoji           text not null,                                                 -- må være i paletten (CHECK)
  created_at      timestamptz not null default now(),
  unique (game_id, user_id, target_user_id, emoji)   -- én reaksjon per (reagent, mål, emoji) per spill
);
```

- **Palett-lås i DB:** `check (emoji in ('👏','🔥','😂','💪','⛳','🐦'))` — DB er
  ytterste vakt mot vilkårlige emoji via direkte PATCH (jf. AGENTS.md «RLS er
  ekte authz»). Samme palett er single source of truth i en delt TS-konstant
  (`lib/games/reactions/palette.ts`) som både UI, server-action og en `gen`-kommentar
  i migrasjonen refererer — én regel, ett hjem (AGENTS.md trap #4).
- **Toggle-modell (Slack-stil):** én reaksjon per `(user, target, emoji)`. Klikk på
  egen aktiv emoji = fjern (DELETE). Tellingen = antall distinkte brukere på den emojien.
- **Self-reaksjon:** tillatt (lav skade, unngår ekstra RLS-gren; «hype deg selv» er grei banter).

### RLS

```sql
alter table public.reactions enable row level security;

-- deltaker-sjekk (SECURITY DEFINER, search_path-herdet)
create function public.can_react_in_game(p_game_id uuid) returns boolean
  language sql security definer stable set search_path = public, pg_catalog as $$
    select exists(select 1 from public.game_players
                  where game_id = p_game_id and user_id = auth.uid()
                    and withdrawn_at is null);
  $$;

-- SELECT: enhver deltaker i spillet ser reaksjonene (samme gating som leaderboardet selv;
--         reaksjoner lekker ingen score — bare «X reagerte 🔥 på Y»)
create policy "reactions select if participant" on public.reactions for select
  using (public.is_admin() or exists(
    select 1 from public.game_players gp
    where gp.game_id = reactions.game_id and gp.user_id = auth.uid()));

-- INSERT: bare egen user_id, må være deltaker, mål må også være deltaker i samme spill
create policy "reactions insert own" on public.reactions for insert
  with check (user_id = auth.uid()
    and public.can_react_in_game(game_id)
    and exists(select 1 from public.game_players gp
               where gp.game_id = reactions.game_id and gp.user_id = reactions.target_user_id));

-- DELETE: bare egne reaksjoner
create policy "reactions delete own" on public.reactions for delete
  using (user_id = auth.uid());
-- (ingen UPDATE-policy → raden er uforanderlig etter insert)
```

### Hvor reaksjonene henger (granularitet = per spiller-rad, individuelle format)

Kun format der **én rad = én `user_id`**: strokeplay, stableford, skins, wolf,
nassau, bingo-bango-bongo, acey-deucey, round robin, nines. Bygg-regelen er semantisk,
ikke en hardkodet liste: legg `<RowReactions>` på en visning **kun hvis raden mapper
til nøyaktig én spiller**. Lag-scramble-familien (rad = lag) og matchplay-familien
(rad = duell) er eksplisitt UTENFOR scope (egen oppfølging) — disse visningene røres ikke.

`RowReactions` (ny `'use client'`-øy, importert per visning):
- Props: `gameId`, `targetUserId`, `initialCounts` (per emoji), `myReactions` (sett av
  emoji denne brukeren har gitt målet), `disabled` (offline/draft).
- Rendrer en kompakt rad med de 6 palett-emojiene; hver viser telling når > 0.
  Trykk = optimistisk toggle + server-action `toggleReaction`; ved feil → reverter +
  diskré toast.
- Tap-target ≥44px, `tabular-nums` på tellinger, palett-emoji har `aria-label` (no/en).
- Tom tilstand: en lavmælt trigger (palett synlig, alle tellinger skjult til > 0) —
  ingen «0»-støy.

### Dataflyt

- **Server (`leaderboard/page.tsx`):** hent reaksjonene for spillet som en slank
  direkte-call **parallelt** med den cachede `getGameWithPlayers` (samme mønster som
  ucachede `courses(...)`-joins). Aggreger til `{ [targetUserId]: { [emoji]: count } }`
  + den innloggedes egne reaksjoner; send ned til visningene. Ingen ny cache-tag —
  `router.refresh()` re-kjører siden og re-henter.
- **Server-action `toggleReaction(gameId, targetUserId, emoji)`:** validér emoji ∈ palett,
  så insert-eller-delete (toggle). RLS håndhever autz. Ingen `revalidateTag` —
  reagentens egen optimistiske UI gir umiddelbar feedback; andre får det via realtime.
- **Realtime (live under spill):** utvid `LeaderboardRealtime`-abonnementet med
  `reactions` INSERT + DELETE filtrert på `game_id` på samme kanal → samme debouncede
  `router.refresh()`. Én monteringspunkt, arver alle visninger.

## Edge Cases & Guardrails

- **Direkte hostile PATCH/POST (AGENTS.md):** ikke-deltaker kan ikke inserte;
  `user_id != auth.uid()` avvises; mål utenfor spillet avvises; emoji utenfor palett
  avvises av CHECK. Verifiseres med anon/service-role REST-probe mot staging.
- **0-rad-skriv:** server-action asserterer at insert/delete faktisk traff en rad
  (`.select()` / `expectAffected` i `lib/supabase/affectedRows.ts`) — PostgREST
  returnerer `error == null` på 0 treff.
- **Draft-spill:** intet leaderboard → ingen reaksjoner. `can_react_in_game` +
  fravær av leaderboard dekker dette; `disabled` på øya som ekstra UI-vakt.
- **Uttrukne spillere (`withdrawn_at`):** `WithdrawnPlayersSection` får IKKE reaksjoner
  i MVP — kun aktive rader.
- **Reveal-synlighet mid-game:** reaksjoner rendres bare på rader som faktisk vises,
  så ingen «motflight»-reaksjoner lekker i UI. SELECT-policyen (deltaker) lekker uansett
  ingen score.
- **Rask dobbel-trykk / kappløp:** unique-constraint gjør insert idempotent; optimistisk
  state + server-reconciliation håndterer sprett.
- **Offline:** reaksjoner er online-only best-effort (ikke i Dexie-køen). Offline →
  `disabled` / stille feil + toast. (Bevisst: lav-innsats sosialt, ikke verdt sync-kompleksitet.)

## Key Decisions

- **Granularitet:** per spiller-rad, kun individuelle-spiller-format — *valgt av eier*.
  Lag/matchplay utsatt (uklar target-semantikk, egen oppfølging).
- **Tidsvindu:** live under spill + etter avslutning — *valgt av eier*. Arver
  leaderboardets synlighets-gating.
- **Palett:** fast 6-emoji golf-sett `👏 🔥 😂 💪 ⛳ 🐦` — *valgt av eier* (fast sett).
  Eksakt utvalg er Claudes forslag; eier kan justere før/ved bygg.
- **Varsling:** ingen — *valgt av eier*. Reaksjoner lever kun på boardet.
- **Toggle-modell:** Slack-stil, én per (bruker, mål, emoji), klikk igjen = fjern.
  Telling = distinkte brukere. Forhindrer spam, standard mental modell.
- **Realtime-kost:** `router.refresh()` per reaksjon er litt tungt i et 150-spillers
  klubbspill, men reaksjoner er lav-frekvente og 300ms-debouncet. Akseptabelt for MVP;
  en lettere count-only-oppdatering er en bevisst utsatt optimalisering.

**Claude's Discretion:**
- Eksakt plassering av `RowReactions` i hver rad (under kortet vs i kort-foten) —
  velg det som er minst påtrengende og konsistent på tvers av de 9 visningene.
- Form på `lib/games/reactions/`-modulen (palette-konstant, aggregator, fetch, action).
- i18n-nøkler for `aria-label`/toast.
- Om `toggleReaction` bor i ny `leaderboard/actions.ts` eller eksisterende action-fil.

## Success Criteria

- [x] **Migrasjon 0119** oppretter `reactions` (med palett-CHECK + unique) + RLS
      (select=deltaker, insert=egen+deltaker+gyldig-mål, delete=egen, ingen update) +
      `can_react_in_game` med `set search_path`. **Bevis:** påført staging
      (`apply_migration` → `{success:true}`); catalog-probe bekrefter kolonner
      `id,game_id,user_id,target_user_id,emoji,created_at`, constraints
      `reactions_emoji_palette (c)` + unique + 3 FK, policies
      `insert own [a] / delete own [d] / select if participant [r]` (ingen UPDATE),
      `can_react_in_game` finnes, `rls_enabled=true`.
- [ ] **Hostile-probe mot staging** (anon/service-role REST): ikke-deltaker avvises,
      `user_id ≠ self` avvises, mål utenfor spill avvises, emoji utenfor palett avvises.
      Verifiser: probe-kall returnerer 401/403/CHECK-feil, 0 rader skrevet.
- [ ] Hver **individuell-spiller-rad** (strokeplay, stableford, skins, wolf, nassau,
      BBB, acey-deucey, round robin, nines) viser palett + per-emoji-telling;
      **lag-scramble + matchplay-visninger er uendret**. Verifiser: render-test +
      staging-skjermbilde.
- [ ] **Toggle virker:** trykk legger til egen reaksjon (optimistisk + persistert),
      trykk igjen fjerner; telling = distinkte brukere. Verifiser: staging klikk-runde
      + `RowReactions`-oppførselstest.
- [ ] **Live for andre under spill:** `LeaderboardRealtime` abonnerer på `reactions`
      INSERT/DELETE på spillets kanal → debouncet refresh. Verifiser: oppførselstest på
      abonnementet (+ resonnert/2-sesjons staging-sjekk).
- [ ] **Stille:** ingen `notify()`/varsel i reaksjons-stien. Verifiser: grep viser
      ingen notify-call i `reactions`-modulen/action.
- [ ] **Gates grønne** (under). Inkl. eksisterende `leaderboard/`-suite fortsatt grønn.

## Gates

- [ ] `npx tsc --noEmit` — ingen feil.
- [ ] `npm run build` — grønn (fanger uttømmende-switch/Record-feller på tvers av de
      berørte format-visningene).
- [ ] `npm run lint` — ren.
- [ ] `npx vitest run app/[locale]/games/[id]/leaderboard/ lib/games/reactions/` —
      eksisterende 37 filer + ny `RowReactions.test.tsx` + aggregator-test grønne.
- [ ] **Staging:** påfør 0119 via Supabase MCP, verifiser, klikk-runde av reaksjons-flyten
      på et ekte spill (aktivt + avsluttet). **0 prod-skriv.**

## Files Likely Touched

- `supabase/migrations/0119_game_reactions.sql` — ny tabell + RLS + `can_react_in_game`.
- `lib/games/reactions/palette.ts` — delt 6-emoji-konstant (single source of truth).
- `lib/games/reactions/` — aggregator (Type A-testet) + server-fetch.
- `app/[locale]/games/[id]/leaderboard/RowReactions.tsx` (+ `.test.tsx`) — client-øy.
- `app/[locale]/games/[id]/leaderboard/actions.ts` — `toggleReaction` server-action
  (med `expectAffected`-assert).
- `app/[locale]/games/[id]/leaderboard/page.tsx` — hent + aggreger reaksjoner, send ned.
- `app/[locale]/games/[id]/leaderboard/LeaderboardRealtime.tsx` — legg til
  `reactions`-abonnement.
- De 9 individuell-spiller-visningene — importer + plasser `<RowReactions>` per rad.
- `messages/no.json` + `messages/en.json` — `aria-label`/toast-nøkler.
- `package.json` + `package-lock.json` + `CHANGELOG.md` — `feat` → minor-bump + én
  Funksjon-rad.

## Out of Scope

- **Lag-scramble + matchplay-reaksjoner** (rad = lag/duell) — egen oppfølgings-issue.
- **Full fritekst-chat / tråder / DM** — resten av #943 / epic #951.
- **Varsler for reaksjoner** (inbox/push) — bevisst utsatt.
- **Offline/Dexie-sync av reaksjoner** — online-only.
- **Fri emoji-velger** — fast palett valgt.
- **Tilskuer-synlighet** (ikke-deltakere) — avhenger av #938 (spectate-modus).
- **Count-only lett-refresh-optimalisering** — utsatt; MVP bruker `router.refresh()`.
