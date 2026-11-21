# lib/supabase — DB-write principles

Client factories live here (`getServerClient`, `getAdminClient`, `getBrowserClient`).
Every write that flows through them must obey the principles below.
Full rationale: `../../docs/bug-prevention.md`. Live-schema reference: `../../docs/schema-ground-truth.md`.
Audit that established these rules: `../../docs/audits/2026-06-17-health-audit.md`.

## Principle #2 — 0-row write = failure, never silence

PostgREST returns `error == null` for an UPDATE/DELETE that matched zero rows.
`#704` peer-approval silently matched 0 rows, reported success, and the game could never be finished.

Use `expectAffected` / `expectOne` from `./affectedRows.ts` after every mutation:

```ts
import { expectOne } from '@/lib/supabase/affectedRows';

const result = await supabase
  .from('game_players')
  .update({ approved_at: now })
  .eq('game_id', gameId)
  .eq('user_id', userId)
  .select('user_id');

const row = expectOne(result, 'approveScorecard'); // throws if 0 or >1 rows affected
```

## Sister of #2 — a short read = failure too: page unbounded reads with `selectAllRows`

PostgREST cuts a SELECT at the project's «Max rows» (1 000 — measured on staging,
`content-range 0-999/1897`) and returns `error == null`. `data` is just shorter.
`#1894`/`#2050`: a 150-player game has ~2 700 score rows, so an unpaged read drops
holes from leaderboards, reminders and mail, and made cup deletion read a played
match as «never played».

A read whose row count grows with players or games (a whole game, a whole cup,
a player's whole history) goes through `selectAllRows` / `selectAllRowsResult`
from `./selectAllRows.ts`. The factory orders on a unique column and applies the
window it is given:

```ts
const scores = await selectAllRows(
  (from, to) =>
    supabase.from('scores').select(SCORES_SELECT).eq('game_id', gameId)
      .order('id').range(from, to).returns<ScoreRow[]>(),
  'loadScores',
);
```

`scoresReadSites.test.ts` holds every `from('scores')` read to this: a new site
either pages or joins its allowlist with a one-line reason why it is bounded.

A build-time read that one Supabase 502/503/504 or fetch failure would fail (#2013) wraps in `withTransientRetry` from `./transientRetry.ts` and passes its signal on with `.abortSignal(signal)` (else Next replays the memoized error) — idempotent reads only, never writes.

## Principle #3 — RLS is the real authz layer; app guards are not enough

A client can call PostgREST directly and bypass every TypeScript guard.
`#670` self-approve and `#671` anon email oracle both exploited this gap.

- Every write path needs a **matching RLS policy**.
- Column-level rules (e.g. a player cannot self-approve or lower their own handicap post-start) require a **trigger** — see `guard_game_players_self_update` (migrations `0103`/`0106`).
- Test each write path against a hostile direct PATCH with the `#440` RLS test rig, not just through the server action.

## Private columns on `users` — e-post and friend code (#2207)

`users.email` and `users.friend_code` are not SELECT-able for `authenticated` or `anon` (column grants, migration 0186), not even on the caller's own row. RLS decides *which rows* a caller sees; the service role fills in the two private fields, and only for:

- **(a) the caller's own row**: `getPrivateUserFields([userId])` (`../users/privateUserFields.ts`), or the verified auth user's `email`;
- **(b) admin surfaces behind `requireAdmin`**: switch that one query to `getAdminClient()` (an admin sees every row anyway, so the gate in the route is the enforcement);
- **(c) server-side mail/notification sends**: `getPrivateUserFields` for the ids your own client's read returned; the value never reaches the browser.

Where a non-admin surface needs to tell people apart, send `maskEmail(...)` (`../users/maskEmail.ts`), never the address.

- A bare `.select()` after `.update()` asks for `select=*` and fails: ask back `id`.
- **A new column on `users` needs its own `grant select (column) on public.users to anon, authenticated`**, or the app cannot see it. `supabase/tests/users_private_columns_test.sql` goes red for a column that is neither granted nor private.
- `userPrivateColumnReads.test.ts` lists every read of the two columns with the client that runs it; a new site joins its allowlist with its class as the reason.
- Match addresses exactly with `.filter('email', 'imatch', emailMatchPattern(x))` (`./emailMatch.ts`), never `.ilike`: there `_` and `%` are wildcards.

## Principle #5 — multi-step creation is atomic or compensated

`#675` cup/liga inserted a parent then children with no rollback, leaving orphan rows on any network blip.

- Wrap multi-insert flows in a **compensating delete** (mirror `startLeagueRoundFlight`) or a single RPC.
- Ensure an `error.tsx` covers the route (`#680`) — never expose Next's raw English 500.

## Typed-client rule (#672)

**Never call `.from()` on an untyped client.** All four factories in this directory are typed as `SupabaseClient<Database>`. A red squiggle on a column name means the live schema disagrees with `database.types.ts` — check the live DB (Supabase MCP or `npm run gen:types`), do not cast it away.

See `../../docs/schema-ground-truth.md` for the authoritative schema snapshot and non-obvious runtime facts (nullable columns, CHECK constraints, trigger guards, RLS policies per actor).

## If you are unsure

Stop and query the live DB before building. The typed client catches column-name drift at compile time; runtime CHECK and RLS gaps are only visible in the live schema. Trust the DB, not your memory or any doc snapshot.

## RLS — hvem ser hvilke scores

> Flyttet ordrett fra CLAUDE.md (#2100).

Strengt håndhevet i Postgres. Spillere ser:
- Sine egne scores
- Alle scores i et aktivt spill de selv er med i: policyen har en gren for både `live` (0121) og `reveal`, og reveal skjuler netto-stillingen i visningen, ikke i RLS (lest fra `pg_policies` på staging 2026-10-04)
- Ingenting av et utkast (`games.status = 'draft'`) de står på: det ser bare arrangøren og global admin (#2445, 0202)
- Alle scores i spill **de selv er med i**, etter `games.status = 'finished'`

⚠️ Merk siste punkt: finished-grenen i `scores select gating per mode` krever
fortsatt deltakelse i DET spillet. Et ferdig spill er altså ikke world-read (#1542).
Flater som med vilje viser resultater til et bredere publikum — cup-sidene
(`getCupSnapshot`), `/spectate/[token]`, og kamp-leaderboardet OG hull-drilldownen
via `getResultReadClient` (#1632, eiervalg B: begge svarer likt), og
resultatbildet (`leaderboard/share-image`) og CSV-eksporten (`leaderboard/export`)
med samme gate som tavla (innlogget + ferdig; delern fra sesjonen, aldri fra URL-en,
#2312) — leser derfor med service-role og holder autorisasjonen på call-site. Det
samme gjør arrangøren som ikke spiller: mens runden pågår, ser hen tavla og
hull-drilldownen via `getResultReadClient` (#2202, eierens valg C). Døra er
`nonPlayerGameDoor` (flaten `board`), og vilkåret er `organiserFollowsLiveBoard`
(`games.created_by` = seeren og `status = 'active'`). Legger du til en slik
flate: gaten i ruta ER håndhevelsen, det finnes ingen RLS bak den.

Et utkast (`games.status = 'draft'`) ser bare arrangøren og global admin, også om du
står på lista (#2445, migrasjon 0202). RLS-laget er lesereglen for `games` og
`is_in_game` (som bærer «game_players select shared game»). Tjenesteklient-dører
spillere når (påmelding, «Finn turneringer», invitasjonskortet ved innlogging,
landingen etter innlogging, kalenderfila, trekk deg) sjekker `status === 'draft'` selv.
Medspiller-avledningen har to hjem som må endres sammen: `is_invite_eligible` i
databasen og `lib/users/getCoPlayerIds.ts` i app-koden. Et utkast gjør bare
arrangøren til medspiller.

Helper functions er `SECURITY DEFINER` for å unngå rekursjons-feller.

## Venner — e-postveien og hvem som teller som venn (0252)

- «Legg til venn på e-post» svarer likt for alle adresser. Oppslaget er `friend_request_by_email`, som bare tjenesterollen kaller, og utfallet forlater aldri serveren: `addByEmail` i `lib/friends/friendActionsCore.ts` svarer `requested` uansett, skriver én rad i `invitations` per adresse og sender varselet eller invitasjonen etter at svaret er gitt. Ikke gi en innlogget klient en funksjon som svarer på om en adresse har konto.
- En forespørsel sendt på e-post (`friendships.by_email`) leses av mottakeren. Avsenderen leser den først når den er godtatt (RLS). Serverlesinger med tjenesterollen ser raden, så lister som bygges for avsenderen, spør `isUnansweredEmailRequestFrom` (`lib/friends/friendGraph.ts`).
- Forespørselen og kvitteringsraden i `invitations` skrives i samme kall og samme transaksjon (`friend_request_by_email`): begge lander, eller ingen.
- Invitasjonsraden til en adresse som alt hadde konto, er bare avsenderens kvittering. Den har et merke i `invitation_receipts`, som bare `friend_request_by_email` setter og bare tjenesterollen leser. Verken kodeforespørselen (`opened_at`-stempelet i `sendLoginCode`) eller innloggingen (`afterLogin`) rører en merket rad; begge spør `lib/auth/invitationConsume.ts`, og kan merkene ikke leses, røres ingen rad uten spill. Aldri avgjør dette ut fra noe en innlogget klient kan skrive (en rad, et tidsstempel). Når forespørselen godtas, merkes kvitteringen godtatt, som når en invitert blir med.
- En invitasjon uten spill skrives av serveren eller av global admin. En innlogget spiller skriver bare spillinvitasjoner til egne spill. Ved hver insert fra en brukerøkt setter databasen `created_at` selv og lar `opened_at` og `accepted_at` stå tomme (`guard_invitations_insert`).
- Bare et godkjent vennskap gjør to personer til venner når et roster fylles. Regelen har to hjem som endres sammen: `is_invite_eligible` i databasen og `getInviteEligibleIds` (`getFriendIds`) i app-koden. `lib/friends/inviteEligibilityRule.test.ts` holder dem like.
- `email_is_registered` og `email_is_in_auth_users` kalles bare av tjenesterollen.
- Fasit: `supabase/tests/friend_requests_by_email_test.sql`.

## Klubber — hvem skriver hva (0248)

- `group_members`: rader skrives bare av RPC-ene (`admin_create_club`, `add_club_member_by_email`, `decide_join_request`, `accept_club_invitations`, `set_club_member_role`). De holder medlemstaket, sluttdatoen og rollereglene. Det finnes ingen INSERT- eller UPDATE-policy for innloggede klienter; ikke legg til en.
- En eier-rad slettes bare av en eier eller global admin (`is_group_owner`). TS-speilet er `lib/clubs/memberRemoval.ts`; de to endres sammen.
- `groups`: bare global admin (eller tjenesteklienten bak `requireAdmin`) oppretter klubber og setter `member_cap` og `valid_until`. Triggeren `guard_groups_locked_fields` låser dem, og `short_id`, `created_by`, `created_at`, `id`, for alle andre.
- En klubb med ligaer eller cuper kan ikke slettes (`ON DELETE RESTRICT` på `leagues.group_id` og `tournaments.group_id`). En liga eller cup uten klubb har et bredere publikum, så slett eller flytt dem først.
- Klubben til en liga eller cup (`group_id`) kan ikke endres av en innlogget klient når den først er satt. Triggeren `guard_club_scope_locked` står på begge tabellene; global admin og tjenesteklienten slipper gjennom.
- Fasit: `supabase/tests/club_roles_and_terms_guard_test.sql`.

## Liga og cup — hvem leser hva (0250)

- `leagues.join_code` og `leagues.spectate_token` kan ikke leses med en innlogget klient (kolonnerettigheter, samme grep som `users.email`). Serveren leser dem med tjenesteklienten bak porten til siden som viser dem: `setLeagueJoinLink`, `setLeagueEmbed` og `getLigaSnapshot`. En skriving spør tilbake `id`, aldri kolonnen, og aldri `*`.
- **En ny kolonne på `leagues` trenger sin egen `grant select (kolonne) on public.leagues to anon, authenticated`**, ellers ser ikke appen den. `supabase/tests/league_cup_read_rules_test.sql` blir rød for en kolonne som verken er gitt eller er en av de to.
- En liga (`leagues`) leses av dem som er med i den: deltakerne, den som opprettet den, ligaens klubb og global admin. `league_players` og `league_rounds` følger ligaen (`can_view_league`). Ligasiden (`/liga/[id]`), bli-med-lenken og tavla til klubbsiden leser med tjenesteklienten bak sin egen port, som før.
- En cup (`tournaments`) leses av dem som er med i den: deltakerne, spillerne i en startet kamp, arrangøren, cupens klubb og global admin. `tournament_participants`, `tournament_plans` og `tournament_side_awards` følger cupen (`can_view_tournament`). De lenke-delte sidene (`/cup/[id]`, `/cup/bli-med/[shortId]`) leser med tjenesteklienten bak sin egen port, som før.
- Kortet bak en celle i ligatabellen åpnes av deltakerne og dem som styrer ligaen (`canOpenLeagueCards` i `lib/league/canViewLeague.ts`). Porten, lenkene på nettsiden og appens liga-rute leser den ene regelen.
- Fasit: `supabase/tests/league_cup_read_rules_test.sql`.

## Runder, egne rader og gjester — hvem skriver hva (0251)

- `games`: arrangøren sletter sin egen runde bare før start (`draft`, `scheduled`). En runde som pågår eller er ferdig, slettes av global admin. Statusen går aldri bakover for en innlogget ikke-admin (`guard_games_status_transition`); gjenåpning er adminens (`reopenGame`).
- `game_players`: arrangøren fjerner en rad bare før start. Etter start trekkes spilleren. Kolonnene systemet skriver (`result_summary`, `signup_source`, `deliver_reminder_sent_at`, og `score_differential` fra 0117) skrives bare med tjenesteklienten. En rad en innlogget klient setter inn, er en ren plass: ingen resultat-, leverings-, trekk- eller betalingskolonner. På egen rad: `tee_gender` er låst etter start, `rejection_reason` kan bare tømmes, `accepted_at` kan ikke tømmes (å skrive den på nytt er lov: appens nye publiseringsforsøk gjør det). Triggeren heter `guard_game_players_system_columns` og står ved siden av `guard_game_players_self_update`.
- `scores`: en ny rad med `client_updated_at` mer enn 5 minutter fram i tid lagres med serverens klokke (`guard_scores_insert_timestamp`). En oppdatering med samme stempel avvises som før (0109).
- `green_pins`: en pinne kommer fra en spiller i en runde som pågår på banen, og hver spiller gir én per hull i vinduet. `saveGreenPin` svarer «takk» på en gjentatt pinne (`23505`).
- `idea_submissions`: en ny idé har tom `status` og `built_at`.
- Gjester: `users.guest_created_by` sier hvem som la inn gjesten (`createGuestUser` krever det). En ikke-admin setter en gjest på en spillerliste bare når hun la inn gjesten selv, eller gjesten alt står i en runde hun har opprettet. Regelen har ett hjem, SQL-funksjonen `guest_usable_by`. Triggeren `guard_game_players_guest_owner` spør den for innloggede klienter. Serverstiene som skriver gjesterader med tjenesteklienten (`createGameInternal`, `updateGameInternal`, `mayAddExistingUser`) og spillervelgerne spør den gjennom `lib/games/guestOwnership.ts`. En ny sti som tar imot en bruker-id og skriver med tjenesteklienten, må spørre den selv.
- `users.guest_created_by` er ikke lesbar for klienter (ingen kolonnerettighet, som `email`), og skrives bare av tjenesteklienten og global admin (`guard_users_guest_created_by`).
- Fasit: `supabase/tests/round_and_own_row_rules_test.sql`.
