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

- [x] Arrangør kan legge til gjest (navn + hcp) i opprett-veiviseren og på spillerliste-administrasjon
      — Evidens: veiviser-spillersteget (`GuestPlayerAdd` i `PlayersSection`, formløs pga. wizard-ens ene `<form>`) + roster-cockpitene (`AddGuestForm` i `CreatorRosterClient` og admin `InviteToGameClient`), commit 263347a1. Publish/edit ruter gjeste-rader via service-role (0115-guarden urørt for klient-skriv). 21 Type A-tester på parse/kompensasjon + 1 Type C på skjemaet; full vitest 4502 grønn.
- [x] Gjest scores av markør, vises korrekt i leaderboard, podium og resultat i alle formatfamilier spillet støtter
      — Evidens: staging-probe 2026-07-03 — markør (flightmate) førte gjestens score under EKTE RLS/`can_score_for` (`OK: marker scored guest`, rullet tilbake). Strukturelt: `grep -r is_guest lib/scoring/ lib/sync/` → 0 treff — motoren/leaderboard/podium ser gjesten som en helt vanlig user_id-rad i alle 22 modi (hele eksisterende suite er beviset). Visuell stikkprøve (strokeplay/stableford + lagformat + matchplay) inngår i eierens manuelle staging-klikkrunde før merge (avtalt).
- [x] Gjest forurenser ikke klubbstatistikk, nøkkeltall eller mail-utsendelser (og aldri andres personlige stats — self-scoped by design)
      — Evidens: staging metrics-delta-probe (`users_ge1 -1, users_ge2 0, gjenger_ge2 0` — fingerprints beholder gjesten, kollaps-kanarien slo ikke ut); `notify()`-gate (sentral for alle shouldAlsoSendMail-pipelines) + filtre i `gameFinishedRecipients` (kun mottakere — playerRows urørt så standings i ALLES mail er korrekte), `productUpdateDigest`, purring (auto + admin) og klubbtavla (tally-input + fallback-vinnere). Commit 72d25a69; pgTAP `users_is_guest_test.sql` med delta-asserts.
- [x] Claim: arrangør sender invitasjon → gjest logger inn → historisk resultat ligger på kontoen (samme uuid, ingen rad-flytting)
      — Evidens: staging ende-til-ende 2026-07-03 — GoTrue-flipp + public.users-flipp, OTP mintet og verifisert for claimet adresse → session for SAMME uuid (`adeb85c3…`), roster-raden intakt (HISTORY_ROW=1), is_guest-nulling via service-role OK, alt ryddet (USERS_LEFT=0). `claimGuestEmail` reverterer auth-flippen hvis public.users-oppdateringen feiler (10 Type A-tester); claim-mail med Type B-snapshots + rad i resend-kontrakten. Commit 9ac2d300.
- [x] Hostile-PATCH-tester grønne: `is_guest` kan ikke self-endres; invite-eligibility-guarden består urørt
      — Evidens: hostile-prober STAGING og PROD — self-set OG self-clear blokkert med 42501, admin-flip + service-role passerer; pgTAP `users_is_guest_test.sql` (plan 9) sjekket inn; `grep is_invite_eligible supabase/migrations/0127*` → 0 treff (0115 urørt). Staging/prod-funksjonene md5-identiske etter 0127.
- [x] Fremtids-flytdiagram oppdatert (bli-med-flyten får gjeste-gren)
      — Evidens: `docs/flows/02-bli-med-i-spill-fremtid.svg` — #1009-boks under kolonne A + claim-etterspill ved terminalen; PNG regenerert med qlmanage (macOS lokalt) og visuelt verifisert. Commit ae551a31.

## Gates

- [x] `npm run lint` (0 errors) + `npx tsc --noEmit` (clean) + full `npx vitest run` (356 filer / 4502 tester grønne) + `npm run build` (exit 0, PPR-ruteliste komplett)
- [x] Migrasjon staging-først med verifisering før prod (0107-mønsteret) — staging 2026-07-03 med guard- + metrics-prober, deretter prod (guard-probe grønn, 0 gjester, md5-paritet); `lib/database.types.ts` byte-identisk med `generate_typescript_types` mot prod
- [x] Staging-klikkrunde av gjeste-flyten før merge — kjørt autonomt 2026-07-03 via preview-verktøyene (lokal maskin, OTP-mint-login): veiviser med gjest (chip + #721-tee-vakt + per-spiller-tee-bytte) → publish («Påmeldt», ikke «Ikke bekreftet») → roster-gjest nr. 2 via AddGuestForm (guest_added-banner, plusshandicap «+2» → CH −5 ved frysing) → 18 hulls scoring → leaderboard korrekt (61/71/77 netto, ingen chip der) → avslutt (ingen mail-forsøk mot gjeste-adresser i loggen) → claim-skjema (mail-feil-varianten: warning-banner + «Sendt til …» + flippen beholdt) → gjeste-login gjennom EKTE login-UI → `is_guest=false` via verifyCode + hele historikken på Hjem. Formatstikkprøver i UI: stableford (duell 47–37), best ball (lag-netto 61/77), matchplay (9&8 med plusshandicap-slag riktig vei). Funn fikset underveis: dublert «Legg til gjest»-heading på creator-flaten (e2341bb1). All testdata slettet fra staging (0 gjester igjen).

## Out of scope (v1)

- Egen tastelenke med engangs-token for gjesten (bet nummer to, kun hvis v1 brukes)
- Rad-flytting til eksisterende konto (beslutning 6)
- Gjeste-retention/anonymisering (beslutning 5)
- Guest-cap utover eksisterende format-caps (beslutning 2)
