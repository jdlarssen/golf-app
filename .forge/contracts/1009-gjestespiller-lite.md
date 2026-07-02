# Contract: #1009 — Gjestespiller-lite: delta med navn og handicap, uten konto

**Issue:** https://github.com/jdlarssen/golf-app/issues/1009 (del 3 av 4 i epic #1006 — siste del)
**Branch:** `claude/quizzical-montalcini-f49b63` (kontrakten ble skrevet på `claude/golf-app-issue-1006-n0bjm5`, postet som issue-kommentar 4870843283 2026-07-02 — issue-kommentaren er sannhets-ankeret)
**PR body:** `Closes #1009` + `Part of #1006`

## Goal

Arrangøren kan legge til en gjest med bare navn, handicap og tee-kjønn — ingen e-post, ingen registrering. Gjesten deltar som vanlig deltaker i scoring, leaderboard og resultat; markøren i flighten fører scoren (eksisterende mekanisme). Etter avsluttet spill kan arrangøren sende en claim-invitasjon til gjestens e-post; gjesten logger inn og eier resultatet. Gjester forurenser ikke klubbstatistikk, nøkkeltall eller mail-utsendelser.

## Kjernebeslutning: skygge-bruker, ikke nullable user_id

Utforsket mot **live prod-skjema** (trap #1) 2026-07-02:

- `game_players` har PK `(game_id, user_id)`, `user_id NOT NULL` FK → `users` (0001). `scores.user_id`/`entered_by` NOT NULL FK → `users`, UNIQUE `(game_id, user_id, hole_number)`.
- `users.id` har FK → `auth.users(id) ON DELETE CASCADE` — en `users`-rad KREVER en auth-rad.
- Alle RLS-policyer og helpere (`is_in_game`, `can_score_for`, `same_flight_or_solo` — 0092/0095/0104) er nøklet på `auth.uid()` ↔ `game_players.user_id`.
- 21 verifiserte `users!game_players_user_id_fkey`-join-sites i app-koden; `startScheduledGame` fryser `course_handicap` fra `users.hcp_index`; `persistResultSummaries`/`persistScoreDifferentials` er nøklet på `user_id`.

**Beslutning: gjesten ER en ekte bruker-rad («skygge-bruker»).** Server-action med service-role oppretter en auth-bruker med plassholder-e-post (`gjest+<uuid>@guest.tornygolf.no` — subdomene uten MX, kan aldri motta OTP), setter `users.name`/`hcp_index`/`gender` fra gjeste-skjemaet og flagger `users.is_guest = true`. Deretter vanlig `game_players`-insert.

**Hvorfor:** nullable `user_id` river i PK-en, scores-UNIQUE-en, samtlige RLS-policyer, offline-sync-nøkkelen (`scoreKey(gameId, userId, hole)`) og alle 21 join-sites — måneder av blast radius. En parallell `guest_players`-tabell krever parallell rørlegging gjennom hele scoring/leaderboard-laget. Skygge-brukeren lar **hele** maskineriet stå urørt: markør-scoring virker fordi `can_score_for` ser gjesten som vanlig `them`-rad; handicap-frysing virker fordi `hcp_index` bor på brukerraden; result_summary/score_differential/leaderboard/podium virker uendret. Claim blir en e-post-flipp i stedet for rad-flytting (det finnes INGEN presedens for user_id-reassignering i kodebasen — verifisert).

## Gray-area decisions (recorded assumptions)

| # | Question (fra issuet) | Decision | Rationale |
|---|---|---|---|
| 1 | Gjest i stats? | `users.is_guest` ekskluderes fra: klubb-topplista (`getClubStatsAggregate`), `admin_key_metrics` (#1010) sine `users_ge1/ge2`-tellinger, og ALLE Resend-utsendelser (`gameFinishedRecipients` m.fl. — plassholder-adresser ville bouncet). Gjesten BEHOLDES i gjeng-fingerprints (#1010): gjengen inkluderer gjesten, og etter claim består samme uuid → kontinuitet. Arrangørens egne runder teller som før. «Mine tall» er self-scoped bak login → utilgjengelig for gjest før claim, ingen endring nødvendig. | Issue-kriterium «forurenser ikke». |
| 2 | Maks gjester per spill? | **Ingen ny cap i v1.** Gjester teller som vanlige spillere mot eksisterende format-/påmeldingscaps (som allerede bor i alle lag). | Unngår trap #4 (ny regel i fire lag) helt. |
| 3 | Lag-/matchplay-format? | **Ingen begrensning.** Gjesten er en vanlig roster-rad med `team_number`/`flight_number` — wizard/admin-tildeling virker uendret. | Skygge-designet gjør begrensning unødvendig. |
| 4 | Hcp-validering + navnekollisjon | Gjenbruk profil-skjemaets hcp-validering. Navn vises som lagret; en liten «Gjest»-chip på roster-/spillere-flatene (arrangør-synlig), ikke på leaderboard. Tee-kjønn spørres i gjeste-skjemaet (styrer per-kjønn par/tee — `game_players.tee_gender` er NOT NULL). | Enkleste ærlige variant. |
| 5 | Uclaimet gjest — retention? | Beholdes på ubestemt tid i v1 (raden er navn + hcp, minimal PII; resultatene er poenget). Admin kan slette via eksisterende spillere-slett-flyt. Opprydding/anonymisering = eget issue hvis behovet oppstår. | Ingen ny mekanikk uten bevist behov. |
| 6 | Claim når e-posten alt har konto | **Vennlig feil i v1** («E-posten har allerede en Tørny-konto»). Rad-flytting mellom kontoer er bevisst utenfor — ingen presedens, tungt trap #5-terreng. | Sjeldent tilfelle; reversibelt valg. |
| 7 | Claim-mekanikk | Arrangør-action på avsluttet spill: (a) valider e-post (ikke registrert fra før), (b) GoTrue admin `updateUserById` flipper skygge-brukerens e-post til gjestens ekte (eierskap bevises av OTP-innloggingen), (c) `invitations`-rad + Resend-claim-mail (best-effort, Resend-mønsteret). Gjesten logger inn med vanlig OTP-flyt → eier kontoen med historikken på plass. `is_guest` nulles i `verifyCode` ved første innlogging (én linje). Kompensasjon: feiler mail-sending beholdes e-post-flippen (gjesten kan logge inn likevel); feiler e-post-flippen sendes ingen mail. | Atomisk-eller-kompensert (trap #5) med minst mulig bevegelige deler; «registrerer seg» = fullfører profil ved første innlogging (eksisterende flyt). |
| 8 | Insert-vei + RLS | Gjeste-opprettelse og roster-insert skjer i server-action med **service-role** (samme mønster som atomic roster swap #907) — `guard_game_players_invite_eligibility` (0115) står urørt og fortsetter å blokkere klient-side inserts av vilkårlige user_ids. `users.is_guest` legges i denylisten til self-update-guarden (0103-arven) så en innlogget bruker ikke kan flagge seg selv inn/ut av gjest-status via hostile PATCH. | RLS er authz-laget (trap #3); ingen nye klient-skrivbare veier. |
| 9 | Sikkerhet claim-target | Arrangøren kan taste feil/ondsinnet e-post — mottakeren får da en konto som KUN inneholder gjestens spillresultater (ingen sensitivt innhold). Akseptert restrisiko i v1, dokumentert her. | Proporsjonalt. |

## Architecture

- **Migrasjon `0127_users_is_guest.sql`**: `alter table public.users add column is_guest boolean not null default false;` + kommentar; utvid self-update-guardens denylist (mønster 0103/0108); `create or replace` av `admin_key_metrics()` med `is_guest`-eksklusjon i `per_user`-CTE-en (gjeng-fingerprints uendret); pgTAP-fil for guard + metrics-eksklusjon. Staging → verifiser → prod.
- **Guest-create**: `lib/games/createGuestPlayer.ts` (service-role, atomic-or-compensated: auth admin `createUser` → `users`-update (name/hcp_index/gender/is_guest) → `game_players`-insert; feiler et steg → `deleteUser` (CASCADE rydder users-raden)). Kalles fra ny server-action brukt av begge flater.
- **UI**: «Legg til gjest»-inngang (navn + hcp + tee-kjønn) i (a) wizard-spillersteget (`PlayersSection`) og (b) roster-cockpiten (`games/[id]/spillere` + admin `InviteToGameClient`). Gjest-chip på roster-rader (`is_guest` threades gjennom eksisterende selects).
- **Eksklusjoner**: `getClubStatsAggregate` filtrerer `is_guest`; `gameFinishedRecipients` + øvrige Resend-helpers filtrerer `is_guest`.
- **Claim**: seksjon på arrangørens spillere-/status-flate for avsluttede spill («Send resultatet til gjesten») → server-action per beslutning 7 + `lib/mail/guestClaimNotification.ts` (Resend, Type B-snapshot).
- **Flyt**: `docs/flows/02-bli-med-i-spill-fremtid.svg` får gjeste-gren (arrangør legger til → markør fører → claim etter slutt); PNG regenereres per `docs/flows/README.md` (qlmanage er macOS-only — eieren kjører kommandoen, eller PNG merkes utdatert i PR-en).
- **Tester**: Type A på createGuestPlayer-kompensasjon + claim-validering (mockede grenser); Type B på claim-mailen; maks én Type C på gjeste-skjemaet; pgTAP for guard/metrics; e2e golden path VURDERES (gjest-add → score → avslutt → claim) hvis lifecycle-riggen dekker det friksjonsfritt.

## Chunks

1. Migrasjon 0127 + pgTAP (staging → prod) + `gen:types`
2. `createGuestPlayer` (TDD, kompensasjonslogikk) + server-action + wizard/roster-UI
3. Eksklusjoner (klubbstats, mail-recipients — nøkkeltall-SQL-en ligger i chunk 1)
4. Claim-flyt (action + mail + login-flagg-nulling)
5. Flytdiagram + gates + staging-verifisering (gjest scores av markør, vises i leaderboard/resultat, claim ende-til-ende mot staging)

## Success criteria (fra issuet)

- [ ] Arrangør kan legge til gjest (navn + hcp) i opprett-veiviseren og på spillerliste-administrasjon
- [ ] Gjest scores av markør, vises korrekt i leaderboard, podium og resultat i alle formatfamilier spillet støtter (skygge-designet: verifiseres ved stikkprøve på staging — strokeplay/stableford + ett lagformat + matchplay)
- [ ] Gjest forurenser ikke klubbstatistikk, nøkkeltall eller mail-utsendelser (og aldri andres personlige stats — self-scoped by design)
- [ ] Claim: arrangør sender invitasjon → gjest logger inn → historisk resultat ligger på kontoen (samme uuid, ingen rad-flytting)
- [ ] Hostile-PATCH-tester grønne: `is_guest` kan ikke self-endres; invite-eligibility-guarden består urørt
- [ ] Fremtids-flytdiagram oppdatert (bli-med-flyten får gjeste-gren)

## Gates

- `npm run lint` + `npx tsc --noEmit` + full `npx vitest run` + `npm run build`
- Migrasjon staging-først med verifisering før prod (0107-mønsteret)
- Staging-klikkrunde av gjeste-flyten før merge

## Out of scope (v1)

- Egen tastelenke med engangs-token for gjesten (bet nummer to, kun hvis v1 brukes)
- Rad-flytting til eksisterende konto (beslutning 6)
- Gjeste-retention/anonymisering (beslutning 5)
- Guest-cap utover eksisterende format-caps (beslutning 2)
