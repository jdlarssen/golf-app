# Spec: Native N6b — runde-drift i appen (påmelding, roster og «Start runden»)

> Adoptert fra issue-kommentaren på #1855 (skrevet 2026-08-31 på branchen
> `claude/n6-spill-livssyklus-kontrakt-8ed891`, som aldri nådde origin).
> **Drift-verifisert mot HEAD `ed954014` 2026-09-01** — se «Drift mot HEAD»
> nederst for de fem avvikene som endrer byggeplanen.

## Problem

Etter N6a (#1854) kan arrangøren opprette et spill i appen — men det står som
«Planlagt», og alt mellom opprettelse og første slag bor fortsatt på nettsiden:
spillerne bekrefter ikke plassen sin fra appen, arrangøren kan ikke justere
rosteret, og «Start runden nå» finnes ikke. Denne slicen tar spillet fra
`scheduled` til `active` i appen. Del-issue: #1855. Andre av tre N6-slicer
(N6a #1854 → N6b #1855 → N6c #1856); N6a er merget (322db418).

## Research Findings (verifisert 2026-08-31, re-verifisert mot HEAD 2026-09-01)

- **Start-orkestreringen er nesten import-ren:** `startScheduledGame`
  (`lib/games/startScheduledGame.ts`, 445 linjer, tar `SupabaseClient<Database>`
  som parameter) validerer (tee-rating, pending-spillere, ufullstendige
  sider/lag/flights, rotasjons-antall), fryser `course_handicap` per spiller,
  tildeler rotasjonsslots (wolf/BBB-familien, #969), re-deriverer greensome-
  override (#1628) og flipper status med optimistisk lås (vinner-semantikk #502).
  Alle BESLUTNINGS-modulene den bruker er import-rene og deles:
  `calculateCourseHandicap`/`applyAllowance` (`lib/scoring/courseHandicap.ts`),
  `getRatingForGender` (`lib/games/teeRating.ts`), `isSideRosterComplete`/
  `isMatchplayMode` (`lib/games/matchplaySides.ts`), `needsTeamAssignment`/
  `expectedTeamSize` (`lib/games/teamScope.ts`), `needsFlightAssignment`
  (`lib/games/flightScope.ts`), `assignRotationSlots`/`rotationSlotRange`
  (`lib/games/assignRotationSlots.ts`), `planGreensomeStartOverride`
  (`lib/games/greensomeOverridePlan.ts`), `findPendingPlayers`
  (`lib/games/pendingPlayers.ts`).
- **RLS-veien for start er lovlig for arrangøren:** frysingen av
  `course_handicap` skjer FØR status-flippen, og 0147-guarden blokkerer
  egen-rad-CH først «after the game has started»; for ANDRES rader har guarden
  creator-bypass (`0147:95-105`, speiler `game_players creator update` fra 0071).
  `games creator update` (0071:29-33) dekker status-flippen og `mode_config`.
  Ingen service-role, ingen DB-endring.
- **Cron-sweepen starter uansett spill på tee-off** (#502) og varsler.
  Appens «Start runden nå» er for MANUELL/tidlig start; varselgapet gjelder
  kun den manuelle app-veien (bokføres, som N3-gapet).
- **Påmeldings-bekreftelse:** webben auto-bekrefter ved besøk
  (`maybeAutoConfirmParticipation`, `lib/games/confirmParticipation.ts`,
  admin-klient fordi den kjøres inne i `after()` der cookies mangler — ikke
  fordi RLS mangler). Policyen `game_players self mark accepted` (0082:38-42)
  gir appen samme skriv under RLS.
- **Arrangørens roster-skriv har RLS-vei:** add (0071 creator insert + 0115
  eligibility-trigger), remove (0071 creator delete, kun draft/scheduled),
  lag/flight (0071 creator update + 0147 creator-bypass), WD/angre (samme).

## Prior Decisions (videreført)

- Direkte RLS-skriv med trap 2-vern; appen har aldri service-role.
- Beslutningslogikk deles, kun orkestrering speiles — og her flyttes selve
  orkestreringen til delt kilde (#1832-presedens).
- Design-tokens (#1830), `[no-changelog]`, relative imports, én simulator per
  økt, ærlig-feil-guardrailen — som i N6a-kontrakten.
- Skriv krever nett (aldri sync-køen) — samme v1-linje som #1832 og N6a.

## Design

**Spillerens bekreftelse (alle deltakere):** ved åpning av GameHome der egen rad
har `accepted_at == null` og status er draft-fri (scheduled/active): stille
self-UPDATE av `accepted_at` under RLS. Ingen egen UI — webbens modell er
«besøk = bekreftelse».

**Arrangør-seksjon på GameHome** (rendres når `bundle.game.createdBy ===
session.userId`; admin-flagg brukes IKKE):

- **Status `scheduled`:** roster-liste med bekreftet/ubekreftet-markering,
  fjern-knapp per spiller (bekreftelses-Alert), «Legg til spiller»
  (co-player-picker, gjenbruk `fetchRosterCandidates` fra N6a),
  lag-/flight-justering der delt `needsTeamAssignment`/`needsFlightAssignment`
  sier det trengs, og **«Start runden nå»-CTA**. Valideringsfeil mappes til
  norske meldinger per reason-kode — samme ordforråd som webben.
- **Status `active`:** trekk spiller / angre trekk (soft-WD med
  bekreftelses-Alert). Avslutt-CTA kommer i N6c.

**Delt start-kjerne (refaktor i `lib/games/`):** splitt `startScheduledGame` i
`startScheduledGameCore` (all validering + CH-frysing + slot-tildeling +
greensome-override + status-flipp + auto-avslag av ventende påmeldinger;
import-ren, ingen `notify`) og en tynn web-wrapper som beholder dagens
eksport-signatur og legger på varsel-fan-out for vinneren. Webbens callsites er
uendret i oppførsel; `lib/games/startScheduledGame.test.ts` skal bestå uendret.
Appen kaller kjernen med sin egen RLS-klient.

**Datamodul (`native/app/src/data/rosterActions.ts` + `startGame.ts`):**
skrivene med trap 2-vern og typede feil, `ActionResult`-mønsteret fra
`playerActions.ts` (N3). Re-fetch av bundle etter hvert skriv.

## Edge Cases & Guardrails

- **Start-racet:** `started: false` (en annen aktør vant) er SUKSESS i UI-et
  («Runden er i gang»), aldri feilmelding.
- **Fjerne seg selv:** arrangøren kan ikke fjerne egen rad; fjern er kun
  pre-start — i aktivt spill er veien WD.
- **WD i lag-modus:** soft-WD kan gjøre en side ufullstendig — det er lov.
- **Ubekreftede spillere ved start:** `findPendingPlayers`-porten svarer som
  webben (`pending_players` med e-postliste) — appen viser NAVN (slår opp i
  rosteret), ikke e-post.
- **Offline:** hele arrangør-seksjonen er les-og-vis; skriveknappene gir rolig
  «krever nett»-melding (ingen kø).
- **0-raders skriv:** typet feil via `expectAffected` → norsk melding +
  re-fetch, aldri stille suksess.
- **Ingen varsler fra appen** ved manuell start/roster-endring — bokført gap.
- **Ingen admin-audit-logg** fra appen (`logAdminEvent` er server-eid) — samme
  bokførte gap.

## Key Decisions

- **Start-kjernen refaktoreres til delt kilde** (ikke speiles) — #1832-presedens.
  Web-diff er TILLATT men avgrenset til splitten (+imports); null
  oppførselsendring på web, låst av eksisterende testsuite.
- **Ingen admin-flagg-grener i appen:** arrangør = `created_by`.
- **Auto-bekreftelse uten UI** — webbens modell speiles.
- **Statisk `ui`/`COLORS`, ikke `useTheme()`** (#1866, se drift D5).
- **ASSUMPTION (autonom økt):** trekk/angre-UI-et er en enkel handlingsliste,
  ikke webbens fulle spillere-side — beskrives i PR-ens Fordeler/ulemper.

**Claude's Discretion:** seksjons-layout, fil-/modulinndeling, navnet på den
delte kjernen, Alert vs inline-bekreftelse.

## Success Criteria

- [ ] 1. **Jest-låst start-paritet:** delt kjerne gir webbens utfall per
  reason-kode på fixtures — inkl. CH-frysing via delte formler (kjente tall),
  wolf-slot-tildeling, greensome-override, vinner-semantikken (`started: false`
  ved tapt race). Webbens `startScheduledGame`-suite består uendret.
  `npx jest` (native/app) + `npx vitest run lib/games` grønne.
- [ ] 2. **Staging e2e — hele driften:** app-opprettet spill → e2e-spilleren
  åpner GameHome i appen og `accepted_at` settes (service-role-lesing) →
  arrangøren legger til/fjerner en spiller og setter lag i appen → «Start runden
  nå» → `status='active'`, `course_handicap` frosset på ALLE rader med verdier
  som matcher webbens formel, wolf-testspill får rotasjonsslots. Web-fasit:
  samme spill åpnet på webben viser identisk roster/CH.
- [ ] 3. **Valideringsportene på staging:** start-forsøk med ufullstendige lag →
  norsk feilmelding, ingen skriv; med ubekreftet spiller → pending-melding med navn.
- [ ] 4. **WD-flyten:** trekk + angre i aktivt spill fra appen → `withdrawn_at`
  satt/nullet (service-role-lesing); leaderboard i appen reflekterer det.
- [ ] 5. **Web uendret i oppførsel:** `npx vitest run` (rot) grønn med samme
  antall som baseline; web-diff begrenset til startScheduledGame-splitten.
- [ ] 6. **Porter + runbook:** alle Gates grønne; `docs/native/app-spike.md` får
  N6b-seksjon (arrangør-seksjonen, start-kjernen, RLS-veiene, varsel-gapet).
  Eier-tapptest hvis tilgjengelig, ellers `VERIFICATION GAP` + restanse.

## Gates

(Node 22. Ingen nye native moduler → ingen pod-rebuild.)

- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — identisk antall som baseline
- [ ] `npx eslint native/app` grønt
- [ ] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `lib/games/startScheduledGame.ts` (splittes) + `lib/games/startScheduledGameCore.ts`
- `native/app/src/data/rosterActions.ts` / `startGame.ts` (nye, +tester)
- `native/app/src/data/gameBundle.ts` — `acceptedAt` på `BundlePlayer`
- `native/app/src/screens/GameHome.tsx` — arrangør-seksjonen + auto-bekreftelse
- `docs/native/app-spike.md` — N6b-seksjon

## Out of Scope

- Varsler/mail/admin-audit-logg fra appens skriv (server-eide — gap bokføres)
- Åpen påmelding / forespørsels-godkjenning (`game_registration_requests`-UI — web)
- `toggleSignupsClosed`, rediger-spill-feltene, gjester, e-post-invitasjoner
- Venne-/klubb-RPC for spiller-pickeren (bokført Could — pickeren er co-player-scopet)
- Sekretariat-overstyringer (godkjenn-override/reopen — web)
- Avslutt-flyten (N6c #1856)
- `suggestFlightAssignment`-algoritmen (manuell tildeling holder i v1)
- Dark-mode-konvertering (#1866 — eierens utsatte valg)

---

## Drift mot HEAD `ed954014` (verifisert 2026-09-01)

| # | Kontrakt-påstand | Funn | Konsekvens |
|---|---|---|---|
| D1 | «`startScheduledGame` importerer `notify` → ikke import-ren» | ✅ men **presist**: `notify` brukes KUN i `autoRejectPendingSignups`, som kalles ETTER status-flippen og kun av flip-vinneren | Splitten er renere enn antatt. Ingen fallback-speiling nødvendig. |
| D2 | (ikke nevnt) | `autoRejectPendingSignups` gjør TO ting: status-flipp på `game_registration_requests` **og** notify-fan-out | Kjernen tar status-flippen (RLS-lovlig: `game_reg_requests admin update` = `is_game_creator_or_admin`) og **returnerer** de berørte `user_id`-ene; wrapperen varsler. |
| D3 | «N6a rørte GameHome/navigasjon → slicene deler filer» | ❌ N6a rørte **ikke** `GameHome.tsx`. Den la til `components/create/*`, `lib/{appFormats,rosterLimits,wizardPayload,createGameCopy,wizardFormData}.ts`, `data/{createGame,formatCatalog}.ts`, `navigation.tsx`, `Home.tsx`, `screens/CreateGame.tsx` | Ingen konflikt-risiko på GameHome. Co-player-pickeren gjenbrukes via `fetchRosterCandidates` (`data/createGame.ts:107`), ikke via `PlayersStep`-komponenten (som er veiviser-spesifikk og `useTheme()`-basert). |
| D4 | «`setPlayerTeam` bruker admin-klient av bekvemmelighet» | ✅ — **ny detalj**: `flight_number` MÅ settes samtidig som `team_number` (CHECK 0030/0095); webben bruker `row.flight_number ?? targetTeam`. Kapasitetssjekk mot `expectedTeamSize`. | Appens lag-skriv må speile begge, ellers CHECK-brudd. |
| D5 | (ikke nevnt — oppstod etter kontrakten) | #1866: appen blinker lys/mørk. `theme.ts:219` eksporterer `ui` som kun lys-variant; bare N6a-veiviseren bruker `useTheme()`. Eieren har **utsatt** valget. | N6b bygges mot **statisk `ui`/`COLORS`**, som `GameHome.tsx` allerede gjør. Ikke `useTheme()`. |
| D6 | «`pendingEmails` … appen viser navnene» | ✅ kjernen returnerer `pendingEmails` (e-post), ikke navn | Appen slår opp navn i rosteret; faller tilbake til e-post når oppslag mangler. |
| D7 | «0115-triggeren håndhever berettigelse» | ✅ `is_invite_eligible` = venner ∪ co-players ∪ klubbmedlemmer | Appens co-player-picker er et ekte SUBSET → alle rader passerer. Ingen ny RPC. |

**Metro-fella (fra N6a-økta):** enhver *bare*-import nåbar fra delt `lib/`-kode må
være deklarert dependency i `native/app/package.json`. `npx expo export` er eneste
port som fanger det — jest gjør det aldri. Kjernen har kun type-only bare-imports
(`@supabase/supabase-js`, `@/lib/database.types`) → erased, ingen ny dep forventet,
men porten kjøres uansett.

**Hermes-fella:** ikke kall webbens `parseOsloDateTimeLocal` fra appen.
