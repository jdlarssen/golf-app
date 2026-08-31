# Spec: Native N6b — runde-drift i appen (påmelding, roster og «Start runden»)

## Problem

Etter N6a (#1854) kan arrangøren opprette et spill i appen — men det står som
«Planlagt», og alt mellom opprettelse og første slag bor fortsatt på nettsiden:
spillerne bekrefter ikke plassen sin fra appen, arrangøren kan ikke justere
rosteret, og «Start runden nå» finnes ikke. Denne slicen tar spillet fra
`scheduled` til `active` i appen. Del-issue: #1855. Andre av tre N6-slicer
(N6a #1854 → N6b #1855 → N6c #1856); bygges ETTER at N6a er merget (deler
GameHome/navigasjon).

## Research Findings (verifisert 2026-08-31 mot main i denne økta)

- **Start-orkestreringen er nesten import-ren:** `startScheduledGame`
  (`lib/games/startScheduledGame.ts`, ingen egen `server-only`-markør, tar
  `SupabaseClient<Database>` som parameter) validerer (tee-rating, pending-spillere,
  ufullstendige sider/lag/flights, rotasjons-antall), fryser `course_handicap` per
  spiller, tildeler rotasjonsslots (wolf/BBB-familien, #969) og flipper status med
  optimistisk lås (vinner-semantikk #502 — `started: false` når en annen aktør var
  først). Den er IKKE direkte importerbar i appen: den importerer `notify`
  (`lib/notifications/notify.ts` — `server-only`) for game_started-fan-out.
  Alle BESLUTNINGS-modulene den bruker er import-rene og deles:
  `calculateCourseHandicap`/`applyAllowance` (`lib/scoring/courseHandicap.ts`),
  `getRatingForGender` (`lib/games/teeRating.ts`), `isSideRosterComplete`
  (`lib/games/matchplaySides.ts`), `needsTeamAssignment`/`expectedTeamSize`
  (`lib/games/teamScope.ts`), `needsFlightAssignment` (`lib/games/flightScope.ts`),
  `assignRotationSlots`/`rotationSlotRange` (`lib/games/assignRotationSlots.ts`),
  `planGreensomeStartOverride` (`lib/games/greensomeOverridePlan.ts`),
  `findPendingPlayers` (`lib/games/pendingPlayers.ts`).
- **RLS-veien for start er lovlig for arrangøren:** frysingen av
  `course_handicap` skjer FØR status-flippen, og 0147-guarden
  (`0147_restore_self_update_guards.sql:76-83`) blokkerer egen-rad-CH først «after
  the game has started»; for ANDRES rader har guarden creator-bypass (`:97-108`,
  speiler `game_players creator update`-policyen fra 0071). `games creator update`
  (0071:29-33) dekker status-flippen. Ingen service-role, ingen DB-endring.
- **Cron-sweepen starter uansett spill på tee-off:** #502-cronen (E1-fallback +
  scheduled-start-sweep) kjører server-side og starter forfalte spill MED varsler.
  Appens «Start runden nå» er derfor for MANUELL/tidlig start; varselgapet gjelder
  kun den manuelle app-veien (bokføres, som N3-gapet).
- **Påmeldings-bekreftelse:** webben auto-bekrefter ved besøk
  (`maybeAutoConfirmParticipation`, `lib/games/confirmParticipation.ts`,
  admin-klient, kalt fra game-home `page.tsx:369`). RLS har en dedikert
  self-mark-accepted-UPDATE-policy på `game_players` (0071/0092-settet; builder
  slår opp eksakt policynavn) — appen gjør samme skriv under RLS fra GameHome.
- **Arrangørens roster-skriv har RLS-vei:**
  - Legg til: `addExistingPlayerToGame` (`inviteToGameActions.ts:38-113`) kjører
    på request-klienten (RLS) med idempotent unique-violation-svelging; appen
    speiler. 0115-triggeren håndhever berettigelse; kandidat-lista er
    co-player-subsettet fra N6a (samme begrensning, samme bokføring).
  - Fjern (pre-start): `removePlayerFromGame`
    (`app/[locale]/games/[id]/spillere/actions.ts:31-68`) — kun draft/scheduled,
    RLS `game_players creator delete`.
  - Lag/flight: webbens `setPlayerFlight`/`setPlayerTeam`
    (`admin/games/[id]/flightActions.ts`) bruker admin-klienten av
    feilhåndterings-bekvemmelighet, IKKE fordi RLS mangler — creator-UPDATE +
    0147-creator-bypass gir appen lovlig vei. Verifiseres positivt på staging før
    UI bygges (I3).
  - Trekk/angre (aktivt spill): `adminWithdrawPlayer`/`adminUndoWithdraw`
    (`admin/games/[id]/actions.ts:458-547`) kjører på request-klienten (RLS);
    0108/0147 gir creator lov på andres `withdrawn_at`. Appen speiler
    valideringene (pre-start = fjern rad; aktiv = soft-WD).
- **Ingen nye native moduler** → ingen pod-rebuild i denne slicen.

## Prior Decisions (videreført)

- Direkte RLS-skriv med trap 2-vern; appen har aldri service-role.
- Beslutningslogikk deles, kun orkestrering speiles — og her er FØRSTE VALG å
  flytte selve orkestreringen til delt kilde (se Key Decisions), presedens fra
  #1832 (wolfRotation flyttet til `lib/wolf/`, web importerer samme fil).
- Design-tokens (#1830), `[no-changelog]`, relative imports, én simulator per økt,
  ærlig-feil-guardrailen — som i N6a-kontrakten.
- Skriv krever nett (aldri sync-køen) — samme v1-linje som valg-skrivene (#1832)
  og opprett-flyten (N6a).

## Design

**Spillerens bekreftelse (alle deltakere):** ved åpning av GameHome der egen rad
har `accepted_at == null` og status er draft-fri (scheduled/active): stille
self-UPDATE av `accepted_at` (speil av `maybeAutoConfirmParticipation`-betingelsene).
Ingen egen UI — webbens modell er «besøk = bekreftelse».

**Arrangør-seksjon på GameHome** (rendres når `bundle.game.createdBy ===
session.userId`; admin-flagg brukes IKKE — appen er arrangør-flate, Sekretariatet
bor på web):

- **Status `scheduled`:**
  - Roster-liste med bekreftet/ubekreftet-markering, fjern-knapp per spiller
    (bekreftelses-Alert), «Legg til spiller» (co-player-picker, gjenbruk fra N6a).
  - Lag-/flight-justering for modi der delt `needsTeamAssignment`/
    `needsFlightAssignment` sier det trengs (chips per spiller — gjenbruk
    N6a-tildelings-UI-et).
  - **«Start runden nå»-CTA:** kjører delt start-kjerne (se under). Valideringsfeil
    mappes til norske meldinger per reason-kode (`tee_missing_rating`,
    `pending_players` m/ navn, `incomplete_sides`, `unassigned_teams`,
    `unassigned_flights`, `rotation_player_count` m/ format-bevisst tekst — samme
    ordforråd som webben).
- **Status `active`:** trekk spiller / angre trekk (soft-WD med bekreftelses-Alert).
  Avslutt-CTA kommer i N6c.

**Delt start-kjerne (refaktor i `lib/games/`):** splitt `startScheduledGame` i
`startScheduledGameCore` (all validering + CH-frysing + slot-tildeling +
status-flipp; import-ren, ingen notify) og en tynn web-wrapper som beholder dagens
eksport-signatur og legger på varsel-fan-out for vinneren. Webbens callsites er
uendret i oppførsel; `lib/games/startScheduledGame.test.ts` skal bestå uendret
(evt. med oppdaterte imports). Appen kaller kjernen med sin egen RLS-klient.
Faller splitten uventet dyrt (notify viser seg vevd inn i valideringsgrenene):
fallback = tynn speiling i appen av KUN orkestreringen, med jest-paritetstest per
reason-kode — men splitten er førstevalget, den gir regelen ett hjem.

**Datamodul (`native/app/src/data/rosterActions.ts` — inndeling discretion):**
add/remove/team/flight/WD/confirm-skrivene med trap 2-vern og typede feil;
`startGame.ts` for start-kallet. Re-fetch av bundle etter hvert skriv (etablert
GameHome-mønster).

## Edge Cases & Guardrails

- **Start-racet:** kjernen har optimistisk lås — `started: false` (en annen aktør
  vant, f.eks. #502-cronen) er SUKSESS i UI-et («Runden er i gang»), aldri feilmelding.
- **Fjerne seg selv:** arrangøren kan ikke fjerne egen rad (webbens regel — builder
  verifiserer og speiler), og fjern er kun pre-start; i aktivt spill er veien WD.
- **WD i lag-modus:** soft-WD kan gjøre en side ufullstendig — det er lov (webben
  tillater det); leaderboard-laget håndterer det allerede (N4).
- **Ubekreftede spillere ved start:** `findPendingPlayers`-porten svarer som
  webben (pending_players-reason med navneliste) — appen viser navnene og peker
  på at spillerne må åpne spillet (eller at arrangøren fjerner dem).
- **Offline:** hele arrangør-seksjonen er les-og-vis; skriveknappene gir rolig
  «krever nett»-melding (ingen kø).
- **0-raders skriv** (spilleren alt fjernet på web i mellomtiden): typet feil via
  `expectAffected` → norsk melding + re-fetch, aldri stille suksess.
- **Ingen varsler fra appen** ved manuell start/roster-endring — bokført gap
  (server-eide); cron-veien varsler som før.

## Key Decisions

- **Start-kjernen refaktoreres til delt kilde** (ikke speiles) — #1832-presedens.
  CH-frysing er scoring-tilstøtende; en speilet løkke ville vært en formel-kopi
  i forkledning. Web-diff i denne slicen er derfor TILLATT men avgrenset til
  splitten av `startScheduledGame` (+imports) — null oppførselsendring på web,
  låst av eksisterende testsuite.
- **Ingen admin-flagg-grener i appen:** arrangør = `created_by`. Sekretariatets
  overstyringer (godkjenn-override, reopen) forblir web.
- **Auto-bekreftelse uten UI** — webbens modell speiles; en egen «takk ja»-flyt
  ville vært ny produktflate (ikke bestilt).
- **ASSUMPTION (autonom økt):** trekk/angre-UI-et i appen er en enkel
  handlingsliste, ikke webbens fulle spillere-side — innenfor
  native-følelse-mandatet; beskrives i PR-ens Fordeler/ulemper.

**Claude's Discretion:** seksjons-layout på GameHome, fil-/modulinndeling,
navnet på den delte kjernen, om lag/flight-justering gjenbruker eksakt
N6a-komponent eller variant, Alert vs inline-bekreftelse for fjern/WD.

## Success Criteria

- [ ] 1. **Jest-låst start-paritet:** delt kjerne (eller fallback-speiling) gir
  webbens utfall per reason-kode på fixtures — inkl. CH-frysing via delte formler
  (kjente tall), wolf-slot-tildeling, greensome-override, vinner-semantikken
  (`started: false` ved tapt race). Webbens `startScheduledGame`-suite består
  uendret. `npx jest` (native/app) + `npx vitest run lib/games` grønne.
- [ ] 2. **Staging e2e — hele driften:** app-opprettet spill (N6a) → e2e-spilleren
  åpner GameHome i appen og `accepted_at` settes (service-role-lesing) →
  arrangøren legger til/fjerner en spiller og setter lag i appen → «Start runden
  nå» → `status='active'`, `course_handicap` frosset på ALLE rader med verdier som
  matcher webbens formel, wolf-testspill får rotasjonsslots. Web-fasit: samme spill
  åpnet på webben viser identisk roster/CH.
- [ ] 3. **Valideringsportene på staging:** start-forsøk med ufullstendige lag →
  norsk feilmelding, ingen skriv; med ubekreftet spiller → pending-melding med navn.
- [ ] 4. **WD-flyten:** trekk + angre i aktivt spill fra appen → withdrawn_at
  satt/nullet (service-role-lesing); leaderboard i appen reflekterer det.
- [ ] 5. **Web uendret i oppførsel:** `npx vitest run` (rot) grønn; web-diff
  begrenset til startScheduledGame-splitten; manuell web-start på staging
  fungerer som før (klikkrunde).
- [ ] 6. **Porter + runbook:** alle Gates grønne; `docs/native/app-spike.md` får
  N6b-seksjon (arrangør-seksjonen, start-kjernen, RLS-veiene, varsel-gapet).
  Eier-tapptest hvis tilgjengelig, ellers `VERIFICATION GAP` + restanse.

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/`. Node 22.
Ingen nye native moduler.)

- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — identisk antall som baseline (splitten kan
      flytte tester, aldri fjerne dem)
- [ ] `npx eslint native/app` grønt
- [ ] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `lib/games/startScheduledGame.ts` (splittes) + evt. ny `lib/games/startScheduledGameCore.ts` — delt kjerne
- `native/app/src/data/rosterActions.ts` / `startGame.ts` (nye, +tester)
- `native/app/src/screens/GameHome.tsx` — arrangør-seksjonen + auto-bekreftelse
- `native/app/src/components/create/…` — gjenbrukt lag-/spiller-UI fra N6a
- `docs/native/app-spike.md` — N6b-seksjon

## Out of Scope

- Varsler/mail fra appens skriv (server-eide — gap bokføres), åpen påmelding/
  forespørsels-godkjenning (`game_registration_requests` — web, Should),
  `toggleSignupsClosed` og rediger-spill-feltene (web), gjester, e-post-invitasjoner,
  Sekretariat-overstyringer (godkjenn-override/reopen — web), avslutt-flyten
  (N6c #1856), flight-FORSLAGS-algoritmen (`suggestFlightAssignment` — manuell
  tildeling holder i v1; oppfølger ved pull).

---

**Til byggeren:** drift-verifisering mot HEAD før første kodelinje
(#1850-mønsteret), sjekk natt-PR-ene for overlapp, og bekreft at N6a (#1854) er
merget før du starter.
