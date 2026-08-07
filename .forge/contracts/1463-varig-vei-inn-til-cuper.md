# Kontrakt: Varig vei inn til cuper du har spilt eller laget (#1463)

## Problem

Eier-funn fra generalprøven av splittet cup-dag (#1441): en vanlig spiller har ingen
synlig, varig vei inn til en cup etter at den er spilt — eneste direkte dør er
innboks-varselet, som er slettbart. Den varige stien som finnes (spillside →
«Cup-stilling», #347) er tre nivåer dyp og ble ikke funnet av verken eier eller tester.

Eier-styring i økten (2026-08-07, overstyrer issuets historikk-forslag): **arrangøren
mangler det samme — alle bør se «Cuper» i Klubbhuset (admin-rommet), og innholdet der
styres av hvilke cuper man er en del av.** Cuper har ingen synlighets-innstilling i dag
(verifisert mot prod-RLS i økten), så deltagelse/opprettelse ER kriteriet.

**Eier-styring revisjon 1 (2026-08-07, senere økt):** «alle spillere som har opprettet
en cup, er i spillerlisten til en cup i utkast, eller er i en cup, eller har spilt en
cup, eller har arrangert en tidligere cup skal kunne se cup-tilen.» Det utvider
deltagelses-kriteriet med **utkast-spillerlisten** (`tournament_participants`, 0155) —
en spiller som er lagt til i Spillere-rommet før matchene er generert har i dag INGEN
game_players-rader og ville falt utenfor den opprinnelige kontraktens avledning.

## Research-funn (verifisert i økten)

- `/admin/cup` er allerede nåbar for ALLE innloggede (#526; admin-layout er auth-only
  per #392). Ikke-admin ser i dag kun `created_by = meg AND group_id IS NULL`
  (`app/[locale]/admin/cup/page.tsx:52–55`). Admin ser alle (limit 50, nyest først).
- PlayerKlubbhus (`/admin` for ikke-admin) viser «Cupen din (n)»-rad KUN når man har
  opprettet ≥1 personlig cup (`PlayerKlubbhus.tsx:79–84`, `PlayerKlubbhusViews.tsx:167–177`).
- `tournaments` har INGEN synlighets-kolonne (Row-typen lest i økten). RLS SELECT
  (lest live fra prod 2026-08-07): personlige cuper (`group_id IS NULL`) lesbare for
  alle authenticated; klubb-cuper kun for klubbmedlemmer/klubb-admin/global admin.
- `/cup/[id]`-siden slipper derimot også inn DELTAKERE i klubb-cuper (app-gate over
  admin-client-snapshot, `app/[locale]/cup/[id]/page.tsx` + `getCupSnapshot`-mønsteret).
  En liste bygget på ren RLS ville altså skjult en klubb-cup for en deltaker som ikke
  er medlem — inkonsistent med cup-siden de faktisk kan åpne.
- Deltagelse er avledbar via egne `game_players`-rader → `games!inner(tournament_id)`
  — samme embed-filter-mønster som historikk-siden
  (`app/[locale]/profile/historikk/page.tsx:129–136`, #569-fella dokumentert der).
- **`tournament_participants` (0155, #1472 — verifisert i revisjons-økten):**
  `(tournament_id, user_id, created_at)`, RLS SELECT for alle authenticated
  (world-read), INGEN write-policies (skriv kun via service-role i planActions).
  Radene BESTÅR gjennom hele livssyklusen — eneste delete er eksplisitt
  `removeCupParticipant` (kun i draft) + cascade ved cup-/bruker-sletting.
  Genereringen rører dem ikke. Vanlig klient kan altså lese egne rader trygt.
- **Cuper fra før 0155 har ingen `tournament_participants`-rader** — de tre
  prod-cupene som fantes før #1472 er kun avledbare via `game_players`. Begge
  kildene trengs; ingen av dem alene dekker alt.
- `/cup/[id]` håndterer utkast-status eksplisitt (`public.pointsPendingDraft`-copy,
  tom matchliste er renderbar) — gyldig destinasjon også før generering.
- `tournaments.winner_team`: `1 | 2 | null`; `null` + `status='finished'` = delt
  (`lib/cup/actions.ts:346–361`).
- Opprett-dør for spillere: `/opprett-spill?intent=cup` (#427); admins bruker
  `/admin/games/new?intent=cup`. Dagens tom-tilstand på `/admin/cup` lenker kun
  admin-ruta.

## Design

**1. Liste-scope for ikke-admin (`app/[locale]/admin/cup/page.tsx`):** cuper jeg har
opprettet ∪ cuper jeg er/var med i. Deltager-tournament-ids hentes fra BEGGE kilder
(vanlig klient, RLS-trygt begge steder) og unioneres:
  a. egne `tournament_participants`-rader (`user_id = meg`) — dekker
     utkast-spillerlisten før generering, og alt etterpå for post-0155-cuper;
  b. egne `game_players`-rader → `games!inner(tournament_id)` — dekker aktive/spilte
     cuper, inkl. pre-0155-cuper uten deltakerliste-rader.
Dedupe i JS (splittet cup-dag gir 3 spill per spiller per dag; post-0155-deltakere
finnes i begge kilder), hent så tournament-radene via admin-klient filtrert til
eksakt (deltatt ∪ opprettet) — samme authz-mønster som `getCupSnapshot`: retten følger
av spillerens egne rader, ikke av world-read. Admin-visningen er uendret (alle cuper).
Sortering/limit uendret (created_at desc, 50).

**2. Rad-destinasjon:** personlige cuper jeg har opprettet → `/admin/cup/[id]`
(styringssiden, som i dag). Alle andre rader (spilte, inkl. klubb-cuper) →
`/cup/[id]` (offentlig stilling/resultat). Klubb-cup-STYRING bor fortsatt på
klubbsiden — én dør per rom (#344).

**3. Sluttresultat på ferdige rader:** ferdig cup viser resultatlinje utledet av
`winner_team` + lagnavn: «{lag} vant» eller «Delt». Utkast/aktiv beholder kun
dagens status-chip. Dette leverer issuets «med sluttresultat».

**4. PlayerKlubbhus-raden:** telleren utvides til (opprettet ∪ deltatt)-antallet,
der deltatt = samme to-kilde-union som punkt 1 — en spiller som KUN står i en
utkast-spillerliste, eller KUN har spilt en cup, får nå raden. Copy generaliseres
(dagens «Cupen din» stemmer ikke for spilte cuper) — ny nøkkel, humanizer-skill på
ny copy, begge locales (catalogParity-testen håndhever paritet).

**5. Tom-tilstand:** for ikke-admin skal opprett-lenken peke på
`/opprett-spill?intent=cup` (ikke admin-ruta); admin beholder dagens lenke.

Ingen skjema- eller RLS-endring. Ren lese-sti; ingen writes.

## Kanttilfeller & rekkverk

- **Splittet cup-dag (#1441):** host + avledede spill peker på samme cup → dedupe på
  tournament_id; aldri duplikat-rader.
- **Slettet cup:** admin-klient-fetch på id-listen returnerer bare eksisterende rader
  → raden forsvinner naturlig (samme guard-effekt som CupStandingsLink).
- **Klubb-cup-deltaker uten medlemskap:** SKAL se cupen i lista (konsistent med
  `/cup/[id]`-gaten) — det er derfor fetch går via admin-klient på avledede ids.
- **Utkast-cup med genererte kamper:** deltaker ser raden med Utkast-chip — greit,
  spillene ligger allerede på Hjem.
- **Utkast-cup UTEN genererte kamper (revisjon 1 — eierens hovedcase):** spiller i
  spillerlisten ser raden (Utkast-chip) og Klubbhus-tilen allerede før generering;
  raden lenker til `/cup/[id]` som håndterer utkast-tilstanden.
- **Fjernet fra utkast-spillerlisten:** raden/tilen forsvinner igjen (med mindre
  spilleren har game_players-rader i cupen fra før) — riktig, arrangøren tok dem ut.
- **Pre-0155-cup:** ingen deltakerliste-rader; dekkes av game_players-kilden alene.
- **0 cuper:** `/admin/cup` viser tom-tilstand (med riktig opprett-dør per rolle);
  PlayerKlubbhus-raden forblir skjult (se antakelse A1).

## Nøkkelbeslutninger

- **Dør = Klubbhuset (`/admin/cup`), ikke /profile/historikk** — eier-styring i økten
  2026-08-07; issuets historikk-forslag parkeres (Out of scope).
- **A1 (avklart av revisjon 1):** «Cuper»-raden i PlayerKlubbhus vises ved ≥1
  cup-relasjon i det utvidede settet (opprettet ∪ utkast-liste ∪ spilt/aktiv) —
  eierens oppramsing 2026-08-07 bekrefter gaten; spillere uten cup-relasjon ser
  fortsatt ingen rad (rommet unngår tomme dødlister by design, #892).
- **ASSUMPTION A2:** spilte klubb-cuper inkluderes i lista og lenker til `/cup/[id]`
  — «hvilke de er en del av» leses som all deltagelse, uavhengig av cup-type.
- **Claude's discretion:** eksakt query-form (to-stegs vs. embed), radlayout for
  resultatlinja, hvor dedupe-helperen bor (foreslått: `lib/cup/getMyCupIds.ts` e.l.
  med Type A-test).

## Suksesskriterier

- [ ] Ikke-admin som har SPILT en cup (game_players-rad i spill med tournament_id)
      men ikke opprettet den, ser cupen på `/admin/cup`; raden lenker til `/cup/[id]`.
- [ ] Ikke-admin som står i spillerlisten til en UTKAST-cup uten genererte kamper
      (tournament_participants-rad, ingen game_players-rader) ser cupen på
      `/admin/cup` med Utkast-chip OG «Cuper»-raden i Klubbhuset (revisjon 1).
- [ ] Ikke-admin ser fortsatt egne opprettede personlige cuper med lenke til
      `/admin/cup/[id]` (uendret).
- [ ] Spiller med kun spilte cuper får «Cuper»-raden i Klubbhuset; spiller uten
      cup-relasjon ser den ikke (A1).
- [ ] Ferdig cup-rad viser «{lag} vant» / «Delt»; utkast/aktiv-rader uendret.
- [ ] Splittet cup-dag gir ÉN rad per cup, og en deltaker som finnes i BEGGE
      kilder (tournament_participants + game_players) gir ÉN rad (dedupe
      verifisert i unit-test).
- [ ] Admin-lista er uendret (alle cuper, styringslenker).
- [ ] Tom-tilstand for ikke-admin lenker `/opprett-spill?intent=cup`.

## Gates

- [ ] `npx tsc --noEmit` (fra worktree-rota) grønn
- [ ] `npm run lint` grønn
- [ ] Co-located tester for endrede filer + ny dedupe-test: `npx vitest run <filene>` grønn
- [ ] Ny norsk copy gjennom humanizer-skillet; nøkler i BEGGE messages-filer
- [ ] Bruker-synlig endring → versjonsbump (fix/feat per commit-msg-hook) + CHANGELOG-linje
- [ ] Staging-klikkrunde av berørt flyt før merge (spiller-konto: Klubbhuset → Cuper → cup-side)

## Filer som trolig røres

- `app/[locale]/admin/cup/page.tsx` — utvidet scope, rad-destinasjon, resultatlinje, tom-tilstand
- `app/[locale]/admin/PlayerKlubbhus.tsx` + `PlayerKlubbhusViews.tsx` — utvidet teller + copy
- `lib/cup/getMyCupIds.ts` (ny, med test) — deltager-ids fra begge kilder + dedupe
- `messages/no.json` + `messages/en.json` — nye/endrede nøkler

## Out of scope

- **#1449** (ett kort per fysisk runde på Hjem/arkiv + cup-kort som dør) — eget åpent
  produktvalg hos eier; kortsiktig-laget fra issuet venter på det.
- **«Cuper»-seksjon i /profile/historikk** — issuets opprinnelige varig-lag; parkert
  etter eier-styringen mot Klubbhuset. Kan gjenopplives som egen kontrakt ved behov.
- **Synlighets-felt på cuper** — finnes ikke og bygges ikke her.
- Endringer i admin-visningen av lista eller i klubbsidens cup-seksjon.
