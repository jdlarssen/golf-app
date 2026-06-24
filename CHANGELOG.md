<!-- ─────────────────────────────────────────────────────────────────────
     Format-konvensjoner: les docs/changelog-conventions.md FØR ny oppføring.
     Tre-lags struktur (tema-heading + tagline-blockquote + Teknisk-details),
     språk-kvalitet på taglines (humanizer-skill), og minor-serie-wrapping
     er dokumentert der.
     ───────────────────────────────────────────────────────────────────── -->

# Changelog

Alle bruker-synlige endringer i Tørny logges her. Versjonering følger [Semantic Versioning](https://semver.org/lang/no/).

Pre-1.0.0 (`0.x.y`) regnes som alpha — vi er fortsatt under uttesting med kompisgjengen. Disiplinen ble innført ved `0.2.0`; alt før det er samlet under «Pre-disiplin».

Hver oppføring begynner med en kort stakeholder-tagline på vanlig norsk satt som blockquote (`> …`) — hva endringen betyr for deg som bruker — etterfulgt av en sammenfoldbar **Teknisk**-seksjon med utvikler-prosa i [Keep a Changelog](https://keepachangelog.com/no/)-stil. Minor-serier (`0.X.y`) er gruppert under et tema-heading med kort sammendrag; kun den ferskeste serien står åpen, alle eldre er sammenfoldet som standard for å holde fila lett å scrolle.

Regler for når en bump utløses er beskrevet i [CLAUDE.md](CLAUDE.md) under «Versjonering / CHANGELOG».

---

## 1.143.y — Tallene dine

Profilen begynner å fortelle deg noe: ikke bare snittet, men hvordan scoren har beveget seg runde for runde.

### [1.143.0] - 2026-06-24 · #936

> Øverst i historikken din ligger nå en formkurve — brutto og netto for hver fullførte 18-hulls-runde. Med ett blikk ser du om scoren er på vei opp eller ned, uten å øyemåle hvert kort.

<details>
<summary>Teknisk</summary>

#### Added

- Personlig scoringstrend øverst på `/profile/historikk` (#936) — en håndrullet SVG-linjegraf over brutto + netto per komplett 18-hulls-runde, over runde-lista.
  - Ren geometri-bygger `lib/stats/scoringTrend.ts` (Type A, I/O-fri): mapper score-tall til polyline-koordinater med golf-intuitiv y-akse (lavere score = lavere på skjermen, så en fallende linje betyr bedre spill) og et padded domene som tåler en flat linje uten å dele på null. Returnerer `null` under to runder.
  - Presentasjons-komponent `components/stats/ScoringTrendChart.tsx`: brutto heltrukken (`--color-primary`), netto stiplet (`--color-muted`) — formen skiller linjene, ikke bare fargen (fargeblind-trygt). `role="img"` + norsk `aria-label`, HTML-legende, statisk (ingen animasjon, så `prefers-reduced-motion` er et ikke-tema).
  - Kun komplette 18-hulls-runder telles (`holeCount === 18`) — eple-mot-eple, samme disiplin som «Mine tall»/`playerStats`. Ingen 9-hulls eller ufullstendige runder blandes inn. Ingen ny datafangst; gjenbruker historikkens eksisterende brutto/netto-aggregering.
  - Avvik fra issue-design: issuet foreslo `/profile/statistikk`, men den siden er klubb-tavla — grafen hører hjemme på den personlige historikk-flaten. Avklart med eier.
- Type A-tester (geometrien) + én Type C-render-test (komponent-strukturen) låser begge lag. Nye `trend*`-nøkler i `no`/`en`.

</details>

---

## 1.142.y — Et ryddigere oppsett

Oppsett-skjemaet er kortere og roligere: hver del ligger i et sammenleggbart panel du bretter ut når du trenger det.

### [1.142.1] - 2026-06-24 · #924

> Setter du opp en liga-runde med en frist som alt har vært, eller en hel sesong som allerede er over, stopper appen deg med en gang. Da slipper du å lage en runde ingen får spilt.

<details>
<summary>Teknisk</summary>

#### Changed

- Past-window-vern på liga-runde-opprettelse — liga-symmetrien til #902 (#924). En liga-runde spilles i vinduet `[opens_at, closes_at]`; en runde hvis vindu alt har lukket seg er uspillbar (`startLeagueRoundFlight` → `outside_window`), nesten alltid et feiltastet årstall.
  - `addLeagueRound`: blokkerer å legge til en runde hvis `closes_at` ligger >5 min i fortiden (`round_in_past`).
  - `createLeagueDraft`: blokkerer å opprette en liga der hele sesongen alt er over — det siste genererte vinduets `closes_at` ligger i fortiden (`season_over`). Midt-i-sesong-oppsett (start i fortid, slutt i framtid) er fortsatt lovlig: kun det siste vinduet teller. `generateRounds` er flyttet foran insert-en så avvisningen ikke etterlater noe å rulle tilbake.
- Gjenbruker `isTeeOffInPast` + `TEE_OFF_PAST_GRACE_MS` (5 min) fra `lib/games/gamePayload.ts` — én kilde for regelen (AGENTS.md felle #4). Vindu-lukkingen er «spillbar-til»-tidspunktet.
- Edit-/reopen-stiene (`updateLeagueRound`, `overrideRoundWindow`) er bevisst ikke vernet — `overrideRoundWindow` finnes nettopp for å gjenåpne lukkede vinduer. Dokumentert med kommentar.
- Cup ble droppet fra issuet etter kode-lesning: cup-matcher har ingen tee-off-kolonne (verken cup-opprett eller batch-generering setter dato), og den manuelle enkelt-match-stien går via spill-wizarden som alt er #902-vernet. Ingen kodeendring.
- Enhets-tester (server-guarden, med ekte klokke) + render-tester (feilkode → norsk melding i `LigaAddRound`/`CreateLigaForm`) låser begge ender av kjeden; test-fixturer bruker faste 2020/2099-tidspunkt så de aldri går ut på dato.

</details>

### [1.142.0] - 2026-06-24 · #909

> Skal du sette opp eller endre et spill, møter du ikke lenger én lang rull. Spillere, spillform, påmelding og innstillinger ligger hver for seg i panel du bretter ut når du vil endre noe. Redigerer du et spill som alt er publisert, ser du spillformen som et lite kort i stedet for hele rutenettet du ikke kan endre likevel. Og den lange lista med sideturnerings-kategorier er pakket bort til du velger «Egendefinert».

<details>
<summary>Teknisk</summary>

#### Changed

- Den delte `GameForm` (edit + opprett-veiviserens «full view») rendrer nå seksjonene som sammenleggbare paneler i stedet for én lang stacked layout (#909). Ny `Disclosure`-primitiv (`components/ui/Disclosure.tsx`) bygd på native `<details>`/`<summary>` — ingen JS, tastatur-tilgjengelig, reduced-motion-trygg. Grunnoppsett står åpent som default; Spillere, Spillform, Påmelding, Inndeling og Innstillinger starter kollapset med ett-linjes sammendrag.
- **Form-data-invariant:** refactoren er rent presentasjonell. Et lukket `<details>` beholder feltene i DOM, så de sendes uendret ved submit. Settet av innsendte skjema-felter er identisk per `(modus, lås-tilstand)` før og etter.
- **Låst spillform → read-only kort.** Ved edit av et publisert/scheduled spill erstatter `LockedFormatSummary` den fulle ModeSelector-griden (13 kort) + TeamSizeSelector med et kompakt kort (format-navn + lagstørrelse + låst-notis). Velgerne emitter ingen skjema-felter (`game_mode`/`team_size` går via hidden inputs øverst), så å droppe dem endrer ikke form-data; allowance- og setup-feltene rendres uendret under.
- **Sideturnering-katalogen auto-kollapses** bak forhåndsvalgene i `SideCategoriesPicker`; de rundt 40 kategoriene brettes ut først når «Egendefinert» er aktiv. Hidden input-ene (`side_disabled_categories`) rendres uansett synlighet.
- Synlighet + sideturnering løftet ut av `BasicsSection` (`showAdvancedInline={false}`) og inn i «Innstillinger»-panelet via `AdvancedSettingsSection includeVisibility` — samme path som wizarden. `hideHeading`-prop lagt til `BasicsSection`/`PlayersSection` (default false) så panelene ikke dublerer seksjons-headingen. `TeamsAssignmentSection` beholder sine numererte interne headings; nytt eksportert `teamsAssignmentHasContent`-predikat avgjør om «Inndeling»-panelet vises i det hele tatt.

</details>

## 1.141.y — Spillerens klubbhus

Klubbhuset møter deg nå som spiller: en invitasjon til å arrangere, klubbene dine og det du selv har satt opp, i stedet for en flis-katalog som var tom hvis du aldri arrangerer.

### [1.141.2] - 2026-06-24 · #927

> Når du finjusterer handicap-andelen under «Vis avanserte innstillinger», viser hjelpeteksten igjen den riktige forklaringen i stedet for en rå kode som «best_ball». Gjaldt best ball, stableford-spillene, singel-matchplay og solo-slagspill — i veiviseren, hurtig-skjemaet og når du redigerer et spill.

<details>
<summary>Teknisk</summary>

#### Fixed

- `bruttoHelperKeyFor` (`lib/games/allowanceCopy.ts`) returnerte en nøkkel med fullt `allowance.`-prefiks, men ble sendt til `tAllowance = useTranslations('allowance')` — som allerede er scopet. Resultatet ble det doble oppslaget `allowance.allowance.bruttoHelper.<mode>`, som ikke finnes. Funksjonen returnerer nå en **relativ** nøkkel (`bruttoHelper.<mode>`); begge call-sites (`GameForm.tsx`, `GameWizard.tsx`) resolver korrekt, og de overflødige `as`-castene er fjernet.
- Ingen prod-crash: `i18n/request.ts` har ingen `onError`-override (next-intl `defaultOnError` logger bare), og `getMessageFallback` rendret siste nøkkel-segment — dvs. selve mode-slugen som hjelpetekst. Feilen var derfor kosmetisk (feil copy + `console.error`-støy), ikke P1. Dukket opp som dev-overlay som blokkerte hydreringen av `?view=full` under #902-verifisering.
- Ny ren-logikk-regresjonstest (`lib/games/allowanceCopy.test.ts`) asserter at nøkkelen resolver mot ekte `messages/no.json` under `allowance`-scopet for alle 22 spillformer.

</details>

### [1.141.1] - 2026-06-24 · #928

> Taster du inn en tee-off som har vært, sier appen fra med en gang ved feltet — ikke først når du trykker publiser. Du blir ikke lenger kasta tilbake til starten av veiviseren, og «Publiser» er gråa ut til du retter tiden. Et spill som ikke er startet kan du fortsatt endre fritt.

<details>
<summary>Teknisk</summary>

#### Changed

- Past-tee-off-valideringen (#902) flyttet fra publish-tid til **input-tid** (#928). `useGameFormState` regner ut `teeOffInPast` (hydreringssikkert via `useSyncExternalStore` så SSR/klient er enige om `disabled`-propen) og ekskluderer det fra `canPublish`. Det gater både wizardens «Neste» (steg 3, `canAdvance`) og edit-skjemaets «Publiser»-knapper i én kilde. `BasicsSection` viser en inline-feil rett ved tee-off-feltet, så feedbacken kommer der øyet er — ikke som et off-screen banner. Ny delt klient-helper `isDatetimeLocalInPast` i `lib/games/gamePayload.ts` deler `TEE_OFF_PAST_GRACE_MS` (5 min) med server-guarden (AGENTS.md felle #4).
- Server-guarden fra #902 (`createGameInternal`/`updateGameInternal`) er uendret som stille backstop.
- «Start spillet»/«Start runden nå» er bevisst ikke vernet mot en passert planlagt tee-off (eier-beslutning #928): start betyr «begynn nå», så en planlagt tid som har vært er irrelevant når spillet blir aktivt. Dokumentert med kommentar i `startGame` + `startScheduledGame`.
- Nye norske/engelske strenger for inline-feilen + wizardens disabled-hint. Test-fixturer bruker dynamisk fremtidsdato så de ikke går ut på dato.

</details>

### [1.141.0] - 2026-06-24 · #892

> Klubbhuset er bygget om for deg som mest blir med på spill. Før møtte du en «Spill»-flis som var tom hvis du aldri arrangerte noe selv. Nå får du en invitasjon til å sette opp en runde, klubbene dine listet rett opp, og spillene og cupene dine hvis du arrangerer. Blir du bare med på spill, ser du et rolig rom uten blindveier.

<details>
<summary>Teknisk</summary>

#### Changed

- Spiller-Klubbhuset (`/admin` for ikke-admin) er bygget om fra en statisk flis-katalog til et **adaptivt rom** (#892). Rommet varierer kun på to fakta: har du klubber, og har du opprettet noe spill/cup. Seksjoner: hilsen (umiddelbar paint) → arrangement-blokk → Dine klubber → Verktøy.
  - **0 opprettet spill →** hero-invitasjon «Sett opp en runde» (+ «… eller en cup»). **≥1 →** rolig «+ Ny runde»-affordance over en capped liste (inntil 4, «Se alle →» til `/klubbhuset` ved flere) av spillene du arrangerer.
  - **Cup-rad** «Cupene dine (n) →» dukker opp når du har ≥1 personlig cup, uavhengig av spill (løser discoverability for personlige cuper, #10).
  - **Dine klubber:** inline liste via `getMyClubs` (én rad per klubb → `/klubber/[id]`); 0 klubber gir en diskret «Ikke med i en klubb ennå →»-linje. **Verktøy:** Baner + Spillformater, nedtonet nederst.
  - Arrangement-blokken og klubb-lista strømmer bak hver sin `<Suspense>`; hilsen + Verktøy paint umiddelbart. Request-scoped klient hele veien (RLS 0071 + select-own), ingen admin-tellinger i spiller-rommet. `ClubStamp` + pull-quote droppet på spiller-visningen.

#### Added

- `app/[locale]/admin/PlayerKlubbhus.tsx` (rom + seksjons-fetchere) + `PlayerKlubbhusViews.tsx` (presentational views) + `PlayerKlubbhus.test.tsx` (én Type-C render-test, tre personaer). Tile-primitivene trukket ut til `app/[locale]/admin/TilesView.tsx` så både admin-griden og Verktøy deler dem uten å dra `server-only`-avhengigheter inn i testen.
- `/opprett-spill?intent=cup`-dyplenke: «… eller en cup» lander rett på cup-skjemaet. Eksplisitt `?intent=` vinner over `?klubb=` (som fortsatt pre-velger klubb-intent).

#### Removed

- Ubrukte i18n-nøkler `playerSpill`/`playerSpillMeta`/`playerKlubber`/`playerKlubberMeta`/`playerPullQuote` (begge locales).

</details>

## 1.140.y — Tall på flisene

Klubbhuset merker nå flisene som krever noe av deg, og veggen er ryddet så de daglige kortene står stort øverst.

### [1.140.9] - 2026-06-23 · #921

> Vi tettet et databasehull der en innlogget bruker i teorien kunne lagt en vilkårlig person til sitt eget spill ved å gå utenom appen. Du merker ingenting når du spiller — dette er sikkerhets-herding under panseret.

<details>
<summary>Teknisk</summary>

#### Security

- #906 lukket venne-/klubb-scoping for «Inviter spillere» på **action-laget** (`inviteToGameActions` → `getInviteEligibleIds`), men en direkte PostgREST-`INSERT` mot `game_players` med en gyldig spiller-JWT omgikk TS-guarden (AGENTS.md felle #3 — RLS er den egentlige authz). `game_players creator insert`-policyen (0071/0092) håndhevet at oppretteren eier spillet, men ikke at `user_id` var kvalifisert. Migrasjon `0115` legger til en `BEFORE INSERT`-trigger `guard_game_players_invite_eligibility` (`SECURITY DEFINER`, `search_path = ''`) som for en ikke-admin oppretter avviser en `user_id` som verken er venne-connection (accepted ∪ pending, begge retninger), co-player (delt minst ett spill) eller klubbmedlem (når spillet har `group_id`). Eligibility-logikken ligger i en ny `SECURITY DEFINER`-funksjon `is_invite_eligible(creator, recipient, group_id)` som speiler `getInviteEligibleIds` (`lib/games/inviteEligibility.ts`) gren for gren, så lagene gir samme svar (felle #4). Triggeren no-op-er for service-rolla (`auth.uid()` NULL), global admin (`is_admin()`, kurator-modellen) og self (`new.user_id = auth.uid()`), så ny-spill-veiviser, cup-generering, self-register, admin og `startGame` står urørt. Ny `adversarial-role-replay.spec.ts`-blokk (#921) beviser at en ukvalifisert hostile-INSERT avvises (`42501`) mens en seedet venn slipper gjennom. Applikert staging→prod (0107-mønster). Defense-in-depth-oppfølging fra #906. (#921)

</details>

### [1.140.8] - 2026-06-23 · #902

> Setter du opp et spill med tee-off som allerede har passert, sier appen fra og ber deg velge et tidspunkt fra nå av.

<details>
<summary>Teknisk</summary>

#### Added

- Past-tee-off-guard på opprett- og edit-flyten (#902): publisering (`createGameInternal`) og publisering/oppdatering av et `scheduled` spill (`updateGameInternal`) avvises nå med ny `tee_off_in_past`-feil (no/en) hvis tee-off ligger mer enn 5 minutter bak «nå». Server er autoritativ (AGENTS.md felle #3); grace-marginen slipper gjennom «start runden nå»-flyten + skjema-latens. Draft/`save_draft` er unntatt — de er ikke live ennå.
- Delt ren helper `isTeeOffInPast(iso, nowMs)` + `TEE_OFF_PAST_GRACE_MS` i `lib/games/gamePayload.ts`, importert av begge action-sitene så de er enige per konstruksjon (AGENTS.md felle #4). 9 unit-tester for grace-grensen + ett wiring-case per action-site.
- `datetime-local`-feltet i `BasicsSection.tsx` har nå `min` satt til «nå» (imperativt i en `useEffect` etter mount, så SSR-HTML-en uten `min` hydrerer uten mismatch) så den native velgeren motvirker fortidsvalg. UX-hint; server-guarden er det egentlige vernet.

</details>

### [1.140.7] - 2026-06-23 · #907

> Hvis noe svikter akkurat idet du lagrer en endret spillerliste på et publisert spill, mister du ikke lenger hele lista. Den settes tilbake slik den var, så du kan prøve på nytt.

<details>
<summary>Teknisk</summary>

#### Fixed

- `updateGameInternal` (`app/[locale]/admin/games/[id]/edit/actions.ts`): roster-byttet i edit-flyten gjorde delete-så-insert uten rollback — feilet insert-en etter at delete hadde tømt rosteret, satt spillet igjen publisert/scheduled **uten spillere** (AGENTS.md felle #5). Snapshotet av forrige roster er utvidet fra `user_id` til alle kolonner (`select('*')`, samme round-trip) og re-insertes hvis insert feiler, så rosteret gjenopprettes til før-edit-tilstanden. Speiler den kompenserende rollbacken `createGameInternal` fikk i #737. Dobbel-feil (rollbacken feiler også) logges; redirect er fortsatt `db_players`.
- 2 nye unit-tester: insert-feil → rollback med fullt snapshot; rollback-feil → logget, redirect uendret.

</details>

### [1.140.6] - 2026-06-23 · #906

> Når du legger til spillere på et spill, kan du nå bare velge venner og folk du har spilt med, samme regel som da spillet ble opprettet. Lange spillernavn dytter ikke lenger «Legg til»-knappen ut av stilling.

<details>
<summary>Teknisk</summary>

#### Fixed

- `addExistingPlayerToGame` + eksisterende-bruker-grenen i `inviteEmailToGame` (`app/[locale]/admin/games/[id]/inviteToGameActions.ts`) håndhever nå venne-/klubb-scoping server-side for ikke-admin oppretter (#906, AGENTS.md felle #3 — server er den egentlige authz). En oppretter kan ikke lenger legge en vilkårlig registrert bruker til sitt eget spill via et direkte action-kall; ikke-kvalifisert recipient avvises med ny `invite_not_allowed`-feilmelding (no/en). Global admin er unntatt (kurator-modellen, samme som disposable-guarden #422).
- Ny `lib/games/inviteEligibility.ts`: `getInviteEligibleIds` = venne-connections ∪ co-players ∪ klubbmedlemmer (når spillet har `group_id`). Unionen av alt de scopede invite-UI-ene tilbyr, så server-guarden aldri avviser en kandidat en picker viste (felle #4). Fail-safe: en transient lookup-feil krymper settet (avviser) i stedet for å åpne.
- `InviteToGameClient.tsx`: «+ Legg til»-knappen får `shrink-0` + `whitespace-nowrap` så lange spillernavn ikke bryter den til to linjer.

RLS-laget (defense-in-depth mot et forged-JWT direkte-PATCH) spores som eget oppfølgings-issue.

</details>

### [1.140.5] - 2026-06-23 · #908

> Avkrysningsbokser og radioknapper i skjemaene er nå i Tørny-grønt i stedet for system-blått. Den blå haken du så når du krysset av forsvinner.

<details>
<summary>Teknisk</summary>

#### Fixed

- App-bred feiing: la `accent-primary` på 26 native checkbox/radio-felt som rendret default OS-aksent (system-blå på hover/avkrysset). Berørte filer: `AdvancedSettingsSection.tsx`, `BasicsSection.tsx`, `PlayersSection.tsx`, `RegistrationSection.tsx`, `components/admin/SideCategoriesPicker.tsx`, `complete-profile/page.tsx`, `admin/spillere/[id]/page.tsx`. `accent-primary` løser til `--primary` (forest `#1b4332` lyst, sage `#7eaa80` mørkt), så aksenten har kontrast i begge moduser.
- `sr-only`-inputs (segmented-control-kortene i AceyDeucey/Nassau/Nines/Patsome/Shamble/Skins/Wolf-oppsett, AllowanceField, RoundStartClient) er bevisst hoppet over — deres synlige state ligger på label-en, så native-aksenten er aldri synlig.

</details>

### [1.140.4] - 2026-06-23 · #910

> Hjelpetekstene i sideturnering-velgeren er ryddet, og lange kategorinavn brytes nå pent i stedet for å krasje inn i poeng-kolonnen til høyre.

<details>
<summary>Teknisk</summary>

#### Changed

- `components/admin/SideCategoriesPicker.tsx`: em-dash-kjeder i gruppe-hintene (Hovedkonkurranser, Bragder, Minuspoeng) og preset-hjelpeteksten splittet til punktum/komma; «litt-mindre-sjeldne» avhyfenert. Kjørt gjennom `humanizer`-skillet.
- `components/admin/SideCategoriesPicker.tsx`: kategori-rad-layouten tåler nå lange navn — navn-spennet får `text-pretty leading-snug`, poeng-labelen `whitespace-nowrap` så den aldri brytes inn i navnet.

</details>

### [1.140.3] - 2026-06-23 · #904

> Spill-detaljsida hadde to seksjoner med samme overskrift «Påmelding» rett etter hverandre. Det øverste kortet med tall (spillere, leverte, lag) heter nå «Oversikt», så det er lettere å se hva som er hva.

<details>
<summary>Teknisk</summary>

#### Changed

- `app/[locale]/admin/games/[id]/page.tsx`: Kort 1's ribbon byttet fra `sections.registration` til ny `sections.overview` — kortet er et tall-sammendrag, ikke selve påmeldingen (som `RegistrationOverviewSection` eier rett under).
- `messages/no.json` + `messages/en.json`: `admin.game.sections.registration` («Påmelding»/«Registration») omdøpt til `admin.game.sections.overview` («Oversikt»/«Overview»). Eneste konsument var Kort 1, så nøkkelen ble renamet i stedet for å etterlate en foreldreløs.

</details>

### [1.140.2] - 2026-06-23 · #905

> Et spill som venter på start viser ikke lenger «Levert 0/N» eller en tom banehandicap-kolonne. Spillerne står nå som «Påmeldt» helt til du trykker «Start runden nå», så detaljsida lover ikke noe som ikke gir mening ennå.

<details>
<summary>Teknisk</summary>

#### Changed

- `app/[locale]/admin/games/[id]/page.tsx`: tre felt som først er meningsfulle etter runde-start gates nå på `isPlayPhase` (`active`/`finished`): «Levert scorekort»-raden, «Banehcp»-kolonnen (header + celle) og banehandicap-verdien. På `scheduled` får hver spiller en egen «Påmeldt»-status i stedet for «⏳ Spiller».
- `messages/no.json` + `messages/en.json`: `admin.game.detail.colCH` «CH» → «Banehcp» / «Course HCP» (krypterte forkortelser ut, jf. #614); ny `admin.game.detail.statusScheduled` = «Påmeldt» / «Enrolled».

</details>

### [1.140.1] - 2026-06-23 · #918

> Når et spill er avsluttet, maser ikke status-sida lenger om å purre spillere som ikke har bekreftet. Spillere som spilte ferdig uten å levere scorekortet vises nå som et rolig «Ikke levert», ikke et gult varsel. Scorene deres teller allerede i resultatet.

<details>
<summary>Teknisk</summary>

#### Fixed

- `app/[locale]/admin/games/[id]/status/page.tsx`: ubekreftet-purre-seksjonen manglet `isActive`-vakten som leverings-purren allerede hadde, så «Purr N ubekreftet spiller» dukket opp også på avsluttede (og scheduled) spill. Gated nå på `isActive`.

#### Changed

- `app/[locale]/admin/games/[id]/status/page.tsx`: på avsluttede spill roes leverings-rammingen ned. `ready_not_delivered` vises som muted «Ikke levert» (gjenbruker `admin.game.detail.statusNotSubmitted`, matcher detalj-sida) uten ⚠️ og uten accent-topp-sortering, og oppsummeringens «N ferdig mangler levering»-suffiks droppes. Lista sorteres alfabetisk i stedet for purre-kandidat-først. Aktive spill er uendret.

</details>

### [1.140.0] - 2026-06-23 · #914

> Klubbhuset viser nå tallene rett på flisene: Spill får et merke når noen venter på handling, Spillere når invitasjoner venter på svar. Veggen er også ryddet — de fire flisene du bruker daglig (Spill, Spillere, Baner, Resultatprotokoll) står stort øverst, resten ligger samlet under «Mer i Sekretariatet».

<details>
<summary>Teknisk</summary>

#### Added

- `app/[locale]/admin/TilesGrid.tsx`: `badge?: number` på `Tile`-typen + ny `TileBadge` (champagne-pille øverst-til-høyre, gjenbruker BottomNav-dot-stilen — accent-fyll, `border-bg`-kant — men med tall i `tabular-nums`, kappet «9+»; `aria-hidden` siden tallet også finnes i meta/«Krever handling»-stripa). Wiret på Spillere (`pendingInvites`) og Spill (`totalActionableGames(getActionItemCounts())` — `cache()`-delt med stripa fra #864, ingen ekstra query-runde; foldet inn i den eksisterende `Promise.all`).
- `app/[locale]/admin/TilesGrid.tsx`: ny `CompactTileGrid` — tettere 2-kol seksjon (ikon + label, meta droppet, tap-target ≥44px, samme badge-støtte) for «Mer i Sekretariatet».
- `messages/no.json` + `messages/en.json`: `admin.dashboard.moreInSecretariat`.

#### Changed

- `TilesGrid` deler nå flisene i kjerne (Spill, Spillere, Baner, Resultatprotokoll → fulle kort via `TileGridView`) og resten (Cuper, Ligaer, Lanseringer, Klubber, Format-styring, Spillformater → `CompactTileGrid` under «Mer i Sekretariatet»). Alt fortsatt synlig (én dør per rom). `TilesSkeleton` oppdatert i lockstep: 4 fulle + label + 6 kompakte. `TileGridView`-signaturen er uendret, så `PlayerKlubbhus` (uten badges) er upåvirket.

</details>

## 1.139.y — Klubbhuset som kommandosentral

Sekretariatet viser nå hva som krever handling og lar deg hoppe rett inn — fra en «Krever handling»-stripe og trykkbare aktivitets-rader.

### [1.139.0] - 2026-06-23 · #864

> Klubbhuset kjente allerede tallene du måtte handle på — uleverte scorekort og scorekort som venter på godkjenning — men du kunne ikke trykke på dem. Nå ligger de i en «Krever handling»-stripe øverst, og hver rad tar deg rett til spillet. Aktivitets-loggen er heller ikke lenger en blindvei: «Bjørn leverte scorekort» tar deg rett til godkjenningen.

<details>
<summary>Teknisk</summary>

#### Added

- `lib/admin/actionItems.ts` (+ `actionItems.test.ts`, 17 tester): ren `computeActionItemCounts(games, players)` som surfacer de to `endGame`-finish-blokkerne (`not_all_submitted` / `not_all_approved`) på tvers av alle aktive spill, via `classifyDeliveryStatus` (én regel, ett hjem). `cache()`-wrappet `getActionItemCounts()` deler én query-runde mellom stripa og en framtidig Spill-tile-badge.
- `app/[locale]/admin/ActionItemsStripe.tsx`: «Krever handling»-stripe under GreetingCard, egen Suspense-grense, **rendrer ingenting når begge tellinger er 0** (rolige dager forblir rolige). Trykkbare ≥44px-rader → spillets status-side (count==1) eller `/admin/games?status=active`. Sekretariat-stemmen bevart.
- `messages/*`: `admin.dashboard.actionItems*` (ICU plural).

#### Changed

- `app/[locale]/admin/ActivityLedger.tsx`: ledger-radene er nå trykkbare `SmartLink`-er — `id` lagt til de embeddede selectene (`games(id, name)`); submitted/approved → `/admin/games/[id]/status`, lifecycle → spill-detalj, ny bane → `/admin/courses`. Klubbinvitasjon uten game forblir en ikke-interaktiv `<div>`.

</details>

## 1.138.y — Nærmeste runde øverst

Planlagte spill på Hjem ligger nå i tee-off-rekkefølge, og den runden som starter snart får en «I dag»/«I morgen»-etikett så du ikke kommer for sent.

### [1.138.0] - 2026-06-23 · #880

> Under «Mine spill» på Hjem ligger de planlagte rundene nå sortert etter når de starter — nærmeste øverst. Den runden som starter i dag eller i morgen får en tydelig «I dag kl. 09:00» / «I morgen» / «Om 2 dager»-etikett, så det nærmeste spillet ikke drukner blant runder uker frem.

<details>
<summary>Teknisk</summary>

#### Added

- `lib/format/teeOffProximity.ts` (+ `teeOffProximity.test.ts`, 9 tester): ren `teeOffProximity(teeOffISO, now)` → `today` / `tomorrow` / `days{n}` / `null`, regnet på Oslo kalender-dager via `osloParts` (ikke `(teeOff − now)/DAY` — så den ikke feil-bøtter over midnatt eller DST). Kun «snart»-spill (i dag .. 6 dager frem) får en bøtte.
- `messages/no.json` + `messages/en.json`: `home.proximity.{today,tomorrow,days}` (ICU).

#### Changed

- `app/[locale]/page.tsx`: `upcomingGames` sorteres nå stigende på `scheduled_tee_off_at` (nulls sist) client-side. `renderGameCard` viser en relativ etikett (`text-text`, fremhevet) over den dempede dato/tid-linja når runden er nær. Ingen gull-accent (reservert vinnere/«Pågår nå», #363); ingen schema/auth.

</details>

## 1.137.y — Én dør til vennene

Profilen har nå én vei til vennene dine i stedet for to, og kortet lyser opp når noen vil bli venn med deg.

### [1.137.0] - 2026-06-23 · #870

> Profilen hadde to dører til det samme — et invitér-kort og en Venner-rad. Nå er det ett «Venner»-kort, og det får et merke når noen har sendt deg en venneforespørsel. Alt om venner bor på Venner-siden, som inviterer på e-post helt som før.

<details>
<summary>Teknisk</summary>

#### Changed

- `app/[locale]/profile/page.tsx`: `InviteAFriendCard` + «Venner»-`SettingRow` erstattet av ett tappbart `VennerCard` i samme slot. Kortet viser et champagne-merke + plural-undertittel når det finnes innkommende venneforespørsler (badge `aria-hidden`; undertittelen bærer tallet for skjermlesere). «Sosialt»-seksjonen er fjernet (tom etter flyttingen).

#### Added

- `lib/friends/getIncomingFriendRequestCount.ts`: slankt admin-client count-kall (`friendships` der `addressee_id = meg` og `status = 'pending'`) — ikke hele `getFriendData`-fan-out-en. Best-effort → 0 ved feil.
- `messages/no.json` + `messages/en.json`: `profile.friendsBadgeSublabel` (ICU plural).

#### Removed

- `app/[locale]/profile/InviteFriendForm.tsx`: dødt etter at invitér-kortet ble fjernet. Venner-sidens «legg til på e-post» dekker invitasjon (faller selv tilbake til invitasjon når adressen ikke er på Tørny), så ingen funksjonalitet tapt. `sendFriendInvite`-handlingen er uendret (brukes fortsatt av Venner-siden).
- Døde profil-nøkler: `invite`, `inviteForm`, `inviteSentBanner`, `inviteErrors`, `sectionSocial` (begge kataloger).

</details>

## 1.136.y — Dine egne tall

Profilen din er ikke lenger bare innstillinger: nå ser du dine egne tall fra runder du har spilt, og den globale tavla har flyttet ut på Hjem som «Toppliste».

### [1.136.1] - 2026-06-23 · #866

> Min historikk viser nå mer enn brutto: du ser netto, spillform-merke og ditt eget resultat per runde, så «96» faktisk forteller hvor godt du spilte.

<details>
<summary>Teknisk</summary>

#### Changed

- `app/[locale]/profile/historikk/page.tsx`: hver runde-rad viser nå netto (brutto − `course_handicap`), et spillform-merke (`formatDisplayLabelKey` → `modes`-katalogen, variant-bevisst per #282) og et resultat-badge (`finishedResultBadge` på lagret `result_summary` #572 → `finishedCard`-katalogen, gull-accent ved egen seier). «Snitt/hull»-kolonnen er byttet ut med netto — det mest meningsfulle tallet for en spiller med handicap.
- Spørringen henter nå `course_handicap`, `result_summary`, `game_mode` og `mode_config`; den døde SQL-`.order()`-en (no-op på to-one-embed, #569) er fjernet, så JS-sorten står alene som autoritativ.
- `messages/no.json` + `messages/en.json`: `profile.historikk.colNetto` lagt til, `colAvgPerHole` fjernet.

</details>

### [1.136.0] - 2026-06-23 · #865

> Nå ser du dine egne tall på profilen: runder spilt, brutto-snitt og beste runde, pluss bragder som hole-in-one og birdie. Den gamle «Klubbstatistikker» heter nå «Toppliste» og ligger på Hjem, så profilen handler om deg.

<details>
<summary>Teknisk</summary>

#### Added

- `lib/stats/playerStats.ts` (+ `playerStats.test.ts`, 24 tester): ren, I/O-fri `computePlayerStats(rounds)` som teller runder spilt, brutto-snitt og beste runde over komplette 18-hulls-runder, samt livstids-bragder (hole-in-one, eagle, birdie, turkey, snowman). Rent brutto mot kjønns-par — netto er historikkens domene (#866). Turkey = ikke-overlappende vinduer av 3 sammenhengende birdie-eller-bedre-hull i samme runde.
- `app/[locale]/profile/page.tsx`: nytt Suspense-wrappet «Mine tall»-kort mellom profilskjema og invitér-kort. Egen `cache()`-wrappet request-scoped henter (`game_players` + `course_holes` + `scores`, RLS-trygg, ingen admin-client) som velger par per `tee_gender` og mater `computePlayerStats`. Vennlig empty-state ved 0 runder.
- `app/[locale]/page.tsx`: «Toppliste»-inngang (lenkekort til `/profile/statistikk`) i fylt Hjem-tilstand.
- `messages/no.json` + `messages/en.json`: `profile.myStats.*` + `home.sectionToppliste`/`home.topplisteCard`.

#### Changed

- `app/[locale]/profile/statistikk/page.tsx`: «Klubbstatistikker» → «Toppliste» (heading + kicker), `backHref` `/profile` → `/`. Selve tavla, vinner-/aktiv-seksjonene og cache-laget (#887/#869) er uendret.
- `app/[locale]/page.tsx`: avsluttede spill på Hjem kompaktert fra 5 til 3 kort (med «Se alle» → `/spill-arkiv`), så Toppliste-inngangen ikke gjør Hjem scroll-tung.

#### Removed

- `app/[locale]/profile/page.tsx`: «Klubbstatistikker»-raden i «Aktivitet»-seksjonen (én dør per rom — tavla nås nå fra Hjem). `profile.statistikkRow`-nøkkelen er fjernet i begge kataloger.

</details>

## 1.135.y — Funn rett på Hjem

Hjem viser nå turneringer å bli med i også når du allerede har spill, så du oppdager klubb- og venne-runder uten å lete deg bort.

### [1.135.7] - 2026-06-22 · #875

> Profilsiden er ryddet opp: manglende handicap gir en «Sett handicap»-snarvei, Golfprofil-raden viser kjønn og klasse i kollapset tilstand, innstillingene er gruppert i fire seksjoner, og «Slett konto» er skilt ut med ekstra luft.

<details>
<summary>Teknisk</summary>

#### Changed

- `app/[locale]/profile/page.tsx` (`ProfileFormCard`): når `hcp_index` er null vises «Sett handicap»-chip ved siden av «hcp –» i stedet for bare en strek uten CTA. Chipen lenker til `#hcp_index`.
- `app/[locale]/profile/page.tsx` (`ProfileFormCard`): ferskhetssignal (stale/oppdatert) er løftet opp til header-hcp-linja via inline-chip — ikke duplisert logikk, importerer `isHandicapStale` + `formatDate` på server.
- `app/[locale]/profile/ProfileFormBody.tsx` (Golfprofil-disclosure): kollapset rad viser nå «· Herre, Voksen» (eller tilsvarende) via `aria-hidden="true"` span — tilgjengelig navn inneholder fortsatt «Golfprofil» (test-krav bevart).
- `app/[locale]/profile/page.tsx` (SettingList): én udifferensiert liste byttet til fire navngitte `<section>`-blokker med kaps-etiketter («Sosialt», «Aktivitet», «App», «Konto»). «Slett konto» er isolert i et eget `SettingList`-kort med `mt-4` over, adskilt fra Eksporter.
- `messages/no.json` + `messages/en.json`: nye nøkler `sectionSocial`, `sectionPersonal`, `sectionApp`, `sectionAccount`, `setHandicap`, `hcpStaleShort`, `hcpUpdatedShort`.

</details>

### [1.135.6] - 2026-06-22 · #871

> Profilen er mer tilgjengelig: vinneren i statistikklisten er lettere å lese, «Lagre»-knappen forklarer seg selv, og historikk-kort bretter seg pent på smal skjerm.

<details>
<summary>Teknisk</summary>

#### Fixed

- `app/[locale]/profile/statistikk/page.tsx`: leder-rad (rank 1) brukte `text-accent` (~2.16:1) på rangnummer, spillernavn og antall — byttet til `text-text` (oppfyller WCAG AA). Avatar-sirkel er dekorativ (`aria-hidden="true"`) og beholder accent-fargen.
- `app/[locale]/profile/ProfileFormBody.tsx`: `scrollIntoView({ behavior: 'smooth' })` på `#kjonn`-ankeret ignorer nå `prefers-reduced-motion`; faller tilbake til `'auto'` når bruker har valgt redusert bevegelse. Fokus flyttes til feltets `<fieldset>` etter scroll, slik at tastatur-/AT-brukere lander på feltet.
- `app/[locale]/profile/page.tsx` (`ProfileFormCard`): profilnavnet er byttet fra `<p>` til `<h1>` slik at skjermleserens heading-rotor kan hoppe til det. Avatar-initialen fikk `aria-hidden="true"` (dekorativ).
- `app/[locale]/profile/ProfileFormBody.tsx`: `disabled={!dirty}`-knappen får nå en kort `aria-live="polite"`-tekst som forklarer at «Lagre» aktiveres etter en endring. Knappen forblir deaktivert til skjemaet er endret.
- `app/[locale]/profile/historikk/page.tsx`: statistikkblokken er byttet fra `flex justify-between` til `flex flex-wrap` med `gap-y-2`, så den bretter seg under spillnavnet på smal skjerm (~360px) i stedet for å klemme teksten.
- `messages/no.json` + `messages/en.json`: ny nøkkel `profile.form.saveHint` (NO/EN) for aria-live-hint-teksten.

</details>

### [1.135.5] - 2026-06-22 · #873

> Tekst-opprydding på profilen: handicap-feilmeldingen viser nå riktig tallområde og peker på +-knappen, «info-tag» er byttet til vanlig norsk, eksport sier hvilket filformat du får, og en aforisme-strek er ryddet bort.

<details>
<summary>Teknisk</summary>

#### Changed

- `profile.errors.hcp_invalid`: «mellom -10 og 54,0» → «mellom 0 og 54. Bruk +-knappen for plusshandicap» — matcher UI-modellen (feltet har `min=0` + egen +-toggle, så bruker taster aldri negativt). Begge locales.
- `profile.form.levelHint`: «Senior er en info-tag for nå» → «Senior er foreløpig bare et merke og endrer ikke spillet» — fjerner dev-engelsk «tag» og forklarer konsekvensen. Begge locales.
- `profile.exportSublabel`: nevner nå filformatet (JSON) og rammer det som dataportabilitet, så en ikke-teknisk bruker vet hva nedlastingen er. Begge locales.
- `profile.statistikk.emptyState`: em-dash-kjede splittet til to setninger (humanizer-tell). Begge locales.

Punkt 3 (winners-undertittel) var allerede tredjeperson + format-agnostisk i live-katalogen (#887) — ikke endret. Identisk `hcp_invalid` finnes også i `onboarding`-namespacet (samme -10-lekkasje), men ligger utenfor dette issuets profil-scope.

</details>

### [1.135.4] - 2026-06-22 · #883

> Småplukk i teksten på Hjem: «enda» rettet til «ennå», du hilses med fornavn både før og etter at du har spill, og tom-tilstanden får en sportsligere avslutningslinje.

<details>
<summary>Teknisk</summary>

#### Fixed

- Rettskrivning «enda» → «ennå» (temporal) i `home.emptyBodyWithDiscovery`, `home.emptyBodyNoDiscovery` og `home.archiveEmpty` (`messages/no.json`; engelsk-katalogen var allerede korrekt).

#### Changed

- Hilsenen i fylt tilstand bruker nå fornavn (`firstNameValue`) i stedet for fullt navn, så den matcher tom-tilstandens «Velkommen, {fornavn}.» — ingen brå overgang fra varm onboarding til formelt fullt navn, og fullt navn brekker ikke lenger på smal skjerm (`app/[locale]/page.tsx`).
- Tom-tilstandens pull-quote byttet fra «En god runde begynner med god planlegging.» (floskel med «god…god»-gjentakelse) til «Fyr opp den første runden, så samler gjengen seg.» — sporty kompis-register med «fyr opp»-idiomet. Begge locales (`messages/no.json` + `en.json`), humanizer-vurdert.

Punkt 4 (discover-CTA) var allerede løst av #879 («Bli med i en åpen turnering»). Punkt 5 (vokabular «spill»/«turnering»/«runde») krever en eier-beslutning om kanonisk vokabular og er ikke tatt her.

</details>

### [1.135.3] - 2026-06-22 · #882

> Hjem er ryddet opp for skjermlesere og tastatur: seksjonene er nå ekte overskrifter du kan hoppe mellom, og spill-kortene viser en tydelig ramme når du blar deg til dem med tastaturet.

<details>
<summary>Teknisk</summary>

#### Changed

- Hjems kropps-wrapper byttet fra `<nav>` til `<div>` (`app/[locale]/page.tsx`): kortene er lenker til *data*, ikke side-/app-navigasjon, så et `<nav>`-landemerke konkurrerte falskt med den ekte bunn-nav-en.
- Seksjons-etikettene i `Section`-helperen byttet fra `<p>` til `<h2>` (speiler `HomeDiscoverySection`). Skjermleser-rotor/heading-nav får nå mer enn bare h1-en. Identisk styling → ingen visuell endring.
- La til synlig `focus-visible`-ring (`focus-visible:ring-2 focus-visible:ring-accent/40`, app-standard) på Hjems spill-kort-lenker (planlagte spill, funn-lenkekort, «vis alle avsluttede») og på `FinishedGameCard` (brukt på Hjem + `/spill-arkiv`). Tastatur-/switch-brukere ser nå hvilket kort som er fokusert.

</details>

### [1.135.2] - 2026-06-22 · #881

> Når Hjem laster, viser den nå plassholder-kort i samme størrelse som de ekte kortene, så siden ikke hopper nedover idet spillene dine dukker opp.

<details>
<summary>Teknisk</summary>

#### Changed

- `HomeBodySkeleton` skrevet om for skeleton-troskap (`app/[locale]/page.tsx`): de flate `h-[72px]`-plassholderne (som nesten doblet seg til ~116px når ekte `Card`-kort med `p-5` + serif-tittel + meta-linjer strømmet inn) erstattet med en kort-formet `HomeCardSkeleton` som matcher ekte ramme og høyde. Seksjons-etikettene fjernet fra skjelettet så det ikke låser seg til fylt-liste-layouten og hopper for en fersk bruker (hvis ekte tilstand er den sentrerte helten). `SectionSkeleton`-helperen fjernet (ikke lenger i bruk).

</details>

### [1.135.1] - 2026-06-22 · #884

> Et planlagt spill på Hjem fikk en grønn merkelapp, som lett kunne leses som «ferdig». Nå har planlagte runder en rolig farge som sier «venter», så du ikke tror noe allerede er gjort.

<details>
<summary>Teknisk</summary>

#### Changed

- `scheduled`-status-pillen i Hjems «Mine spill»-liste byttet fra `bg-success/10 text-success` (sage-grønn — semantisk «fullført/ok») til den rolige forest-tonen `bg-primary-soft text-primary`. Grønn reserveres for fullført utfall. Aktive spill rendres via `ActiveStateLabel`, ikke denne pillen, så ingen visuell kollisjon (`app/[locale]/page.tsx`).
- Tom-tilstandens velkomst-`h1` byttet fra `tracking-[-0.02em]` til `tracking-tight` så den matcher `PageHeader`-h1-en i fylt tilstand — én kanonisk overskrifts-stil, ingen letter-spacing-drift ved overgangen tom→fylt.

Dark-mode hero-kontrasten (#884 punkt 3) ble vurdert som ikke-blokkerende og trenger en visuell staging-sjekk før evt. justering — ikke endret her.

</details>

### [1.135.0] - 2026-06-22 · #879

> Turneringer fra klubbene og vennene dine vises nå på Hjem også etter at du har fått ditt første spill, ikke bare når du er helt fersk. Du ser et lite utvalg med en «Se alle»-snarvei, og egne forespørsler du venter på blir liggende.

<details>
<summary>Teknisk</summary>

#### Changed

- `getDiscoverableGames` hentes nå for alle innloggede (ikke lenger gated på tom-tilstand) og parallelt i Hjems `Promise.all`, så den ikke legger til seriell latens. I fylt tilstand rendres en kappet forhåndsvisning (`HomeDiscoverySection` i `preview`-modus: topp 3 per passiv liste — klubb/venner/åpne) med en «Se alle»-hale til `/finn-turneringer`. Egne ventende forespørsler vises i sin helhet (spillerens egen handling, kappes aldri). Uten funn-innhold beholdes ett lenkekort som persistent inngang. `home.discoverCard` strammet til action-verb, ny `discover.seeAllTournaments`-streng, begge locales.

</details>

## 1.134.y — Velg tema selv

Profilen lar deg nå styre lyst og mørkt selv, ikke bare arve det fra telefonen.

### [1.134.5] - 2026-06-22 · #877

> Hvis Hjem ikke klarer å laste spillene dine et øyeblikk, viser den nå en «prøv igjen»-skjerm i stedet for en tom velkomst. Da ser en pågående runde aldri ut til å være borte.

<details>
<summary>Teknisk</summary>

#### Fixed

- Hjems aktiv-spill-spørring og `getFinishedGamesForUser` svelget en feilet fetch og returnerte `[]`. På Hjem regnet det tomme arrayet seg til `isEmptyState`, som rendret «start her»-velkomsten over en reell pågående runde. Begge kaster nå feilen, så locale-`error.tsx` viser en ærlig retry-skjerm i stedet. Fiksen dekker også `/spill-arkiv`, som deler `getFinishedGamesForUser`.

</details>

### [1.134.4] - 2026-06-22 · #897

> Klubb-siden lastet ikke på grunn av en feil i kontakt-lenken. Nå åpner den som normalt igjen, og lenken for å få satt opp en klubb virker.

<details>
<summary>Teknisk</summary>

#### Fixed
- `/klubber` krasjet i error-boundary («Noe gikk galt») fordi kontakt-CTA-en kalte `t.rich('ctaBody'/'ctaDiscrete', {email: (chunks) => <a>})`, mens meldingene brukte en verdi-placeholder `{email}` i stedet for tag-syntaks. next-intl rendret da render-funksjonen som et React-barn → «Functions are not valid as a child of Client Components», og hele siden falt. Begge grener (tom-tilstand + ikke-tom) var rammet, så siden krasjet for alle. Fikset ved å bytte `{email}` → `<email>klubb@tornygolf.no</email>` i begge nøkler og begge locales; `t.rich`-callbacken (uendret) gjør nå adressen om til en mailto-lenke. Funnet under staging-QA av #863. (#897)

</details>

### [1.134.3] - 2026-06-22 · #863

> Klubbhuset-fanen lyser nå opp også når du er inne på klubb- eller spillformat-sidene, så du alltid ser hvor du er. Kortene der inne reagerer når du trykker, og tellingen står endelig riktig ved ett spill: «1 aktiv · 1 planlagt».

<details>
<summary>Teknisk</summary>

Polish-bunt på Klubbhuset-flaten — funn fra en multi-agent-analyse + skeptisk verifisering mot live kode. (#863)

#### Changed
- Bunn-nav-fanen «Klubbhuset» er nå aktiv også på `/klubber` og `/spillformater` (`BottomNav.tsx`), så ingen rom-side står igjen uten markert fane.
- Kicker-kollisjon ryddet: `/klubber` viser «Klubber», `/klubbhuset` viser «Spill»; «Klubbhuset» beholdes kun på selve hub-en.
- Tile-lenkene i Klubbhuset fikk trykk-/hover-respons og en synlig `focus-visible`-ring (a11y for tastatur- og switch-brukere).

#### Fixed
- `metaActiveAndPlanned` bruker nå ICU-flertall, så Spill-tile-en viser korrekt «1 aktiv · 1 planlagt» ved ett spill i stedet for «1 aktive · 1 planlagte».
- Hardkodet norsk i admin-dashboardet (pull-quote, hilsen-skjelett, aktivitets-logg-fallbacks) er flyttet til oversettelses-nøkler, så engelsk locale ikke lenger lekker norsk.

#### Internal
- Hilsen og spiller-Klubbhuset leser visningsnavnet fra rolle-konteksten i stedet for en ekstra `users`-spørring (raskere paint, ingen oppførsels-endring). Skilt ut i egen `refactor`-commit uten bump.
</details>

### [1.134.2] - 2026-06-22 · #887

> Vinnerlista i statistikken krediterer nå den som faktisk vant hver runde, uansett spilleform. Matchplay, stableford og skins får riktig vinner i stedet for et netto-gjett.

<details>
<summary>Teknisk</summary>

#### Fixed
- Statistikk-siden («Klubbstatistikker») regnet vinneren av hvert ferdige spill som netto best-ball uansett faktisk modus (`computeLeaderboard({ mode: 'netto' })`). Matchplay (som ikke har en netto-totalsum, men avgjøres hull for hull), stableford, skins m.fl. krediterte dermed feil spiller. Siden leser nå det allerede lagrede, modus-riktige `game_players.result_summary` (#572) som sannhetskilde; bare spill uten lagret utfall (pre-#572 eller feilet persist) faller tilbake til `buildModeResultForGame` med admin-klient. Trukne spillere (`withdrawn_at`) utelates nå fra både vinner- og deltakelse-opptellingen, på linje med scoring-, leaderboard- og liga-flatene. Aggregeringen er trukket ut til en ren `lib/stats/clubStats.ts` (`isWinningSummary` / `aggregateFinishedGame` / `tallyClubStats`) med 14 unit-tester; hull-/scores-fetchene og hele `computeLeaderboard`-løkka er borte fra happy-path-en. Logikken er nå INNI #869-cachen (`getClubStatsAggregate`), så resultatet er både cachet og modus-riktig. (#887)

#### Changed
- Undertitlene på vinner- og aktiv-lista er gjort tredjeperson og format-agnostiske (no + en). Den globale tavla sier ikke lenger «laget ditt» eller hardkoder «best-ball-netto». Løser #873 punkt 3. (#887)

</details>

### [1.134.1] - 2026-06-22 · #878

> «Pågår nå»-kortet på Hjem vet nå hvor du er i runden. Ett trykk tar deg rett til neste hull du mangler. Når du har levert, står det «Levert ✓» på kortet, og venter noen i flighten på at du godkjenner scorekortet deres, dukker det opp en egen påminnelse rett under.

<details>
<summary>Teknisk</summary>

#### Added
- «Pågår nå»-kortet på Hjem er nå tilstands-bevisst (#878). Home-spørringen henter `submitted_at`/`withdrawn_at`/`approved_at` (game_players) + `require_peer_approval`/`game_mode` (games), og en ren resolver `lib/games/activeCardState.ts` (unit-testet) mapper dem til Fortsett / Levert ✓ / Til godkjenning / Trukket — erstatter den generiske status-pillen for aktive spill. «Mine spill» (planlagte/utkast) beholder pillen uendret.
- «Rett inn i runden»: et aktivt, ikke-levert kort lenker nå til neste utastede hull (eller lever-siden ved 18/18) via `lib/games/getActiveGameCardData.ts`. Levert/trukket + ikke-aktive kort lenker til spill-oversikten som før.
- Peer-godkjenning-nudge på Hjem: når en flight-peer har levert og venter på din godkjenning, vises en egen accent-linje under kortet som dyplenker til `/games/[id]/approve`. Gjenbruker én-flight-regelen `isSingleFlightGame` (#543) + strengene `game.home.pendingApprovals`/`reviewLink` fra `PendingApprovalsBanner`.

#### Changed
- Fullført #363: «Pågår nå»-seksjonens etikett + skillelinje får champagne-accent (`Section`-ens `accent`-prop var tidligere aldri satt).

Ingen schema-/auth-/RLS-endring. Aktiv-kort-data hentes via to scoped spørringer (scores + game_players), begrenset til brukerens aktive spill (ikke N+1). Verifisert på staging i alle fire tilstander + godkjenning-nudge. (#878)

</details>

### [1.134.0] - 2026-06-22 · #876

> Du kan nå velge om appen skal være lys, mørk eller følge telefonens innstilling. Valget ligger på profilen din, rett under Språk, og huskes til neste gang du åpner appen.

<details>
<summary>Teknisk</summary>

#### Added
- Ny Auto/Lys/Mørk-rad i `SettingList` på Profil (`app/[locale]/profile/page.tsx`), gruppert med Språk- og Installer-radene som annen app-konfig. CSS-kontrakten i `app/globals.css` fantes allerede (`[data-theme='light'|'dark']` på `<html>`, OS-mørk via `prefers-color-scheme` på `:root:not([data-theme='light'])`) — ingen palett- eller layout-endring; bryteren matcher kontrakten i stedet for å finne opp et nytt tema-system. «Auto» fjerner `data-theme` (følg OS), «Lys»/«Mørk» setter attributtet og lagrer valget i `localStorage` (`torny-theme`).
- Ny klient-komponent `components/ui/ThemeSwitcher.tsx` i samme pille-stil som `LocaleSwitcher`, med `role="radiogroup"`/`role="radio"` og `aria-checked` for skjermlesere. DOM-/storage-logikken er trukket ut til en SSR-trygg ren helper `lib/theme/themePreference.ts` (vakter rundt `window`/`document`/`localStorage`), dekket av en co-located unit-test. Valget leses via `useSyncExternalStore` (server-snapshot = `'auto'`) så det ikke oppstår hydration-mismatch og ingen `setState`-i-effect. En liten temaglimt ved aller første paint godtas i v1; FOUC-fjerning ville krevd endring i delt root-layout, som er bevisst utelatt. (#876)

</details>

## 1.133.y — Helse- og flyt-audit

Funn fra helse-auditen ([#666–#689](https://github.com/jdlarssen/golf-app/issues/689)) og flyt-gjennomgangene. En bunke korrekthets- og sikkerhetsfikser i liga, Nassau, cup og innmelding, pluss at resultatlista nå oppdaterer seg av seg selv mens runden spilles.

### [1.133.85] - 2026-06-22 · #872

> Du kan nå bruke piltastene til å velge mellom alternativene i alle valg-felter i appen — nyttig om du bruker tastatur eller skjermleser.

<details>
<summary>Teknisk</summary>

#### Fixed
- `SegmentedField` hadde `role="radiogroup"` på container og `role="radio"` på knappene, men manglet roving tabindex og tastaturstyring — piltaster gjorde ingenting, i strid med WAI-ARIA radiogroup-kontrakten. Lagt til: roving tabindex (valgt alternativ = `tabIndex=0`, alle andre = `tabIndex=-1`; ingen valgt = første), `onKeyDown`-handler for ArrowRight/Down (neste, med wrap), ArrowLeft/Up (forrige, med wrap), Home og End. Piltast kaller `onChange` og `focus()` på knappen i samme hendelse — forblir et kontrollert komponent. `useRef`-array holder referanser til alle knapper uten å introdusere intern state. (#872)

</details>

### [1.133.84] - 2026-06-22 · #869

> Klubbstatistikker laster kjapt selv om det ligger en haug ferdige spill bak. Tallene er de samme som før: vinnerlista og «mest aktive» regnes ut fra alle ferdigspilte spill.

<details>
<summary>Teknisk</summary>

#### Changed
- **Klubbstatistikk-siden cacher den tunge utregningen.** `app/[locale]/profile/statistikk/page.tsx` hentet ALLE ferdige spill + alle spillere + alle hull + alle scores inn i minnet og kjørte `computeLeaderboard` per spill på hvert sidebesøk – uten cap og uten cache. Arbeidet vokser med (spill × spillere × hull), så mot klubb-skala (~150 spillere, mange spill) var dette en reell skalerings-klippe. Aggregeringen er flyttet inn i en `unstable_cache`-wrappet helper (`getClubStatsAggregate`) med tag `club-statistikk` og 5-minutters `revalidate`. Cachen lagrer et lokale-agnostisk råaggregat (userId→antall + navn som serialiserbare arrays); `unknownPlayer`-fallback og sortering skjer per request ved render, så samme blob betjener både `no` og `en`. Utlistet output er byte-identisk – ingen semantikk- eller copy-endring. Cache-callbacken bruker `getAdminClient()` (cookies/headers kan ikke leses inne i `unstable_cache`), likt `lib/games/getGameWithPlayers.ts`; det utvider ikke eksponering siden alle ferdige spill allerede er verdens-lesbare via den åpne `games.status = 'finished'`-RLS-policyen, og auth-gaten (`getProxyVerifiedUserId`) står uendret på call-site utenfor cachen. Tidsbasert `revalidate` velges framfor tag-invalidering fordi spill-avslutnings-actionene ligger utenfor denne filens scope – et ferskt avsluttet spill dukker opp i statistikken innen ~5 min. (#869)

</details>

### [1.133.83] - 2026-06-22 · #867

> Krasjer profilen, ser du nå en fornuftig feilmelding med «Til profil»-knapp i stedet for å bli sendt hjem. Lasting av profil viser en presis skjema-silhuett i stedet for kortlisten fra forsiden.

<details>
<summary>Teknisk</summary>

#### Added
- `app/[locale]/profile/error.tsx` — scoped error boundary for profil-segmentet. Fanger Supabase-feil fra `ProfileFormCard` og andre server-komponenter under `/profile`. Rendrer den delte `ErrorScreen`-chromen (samme som game- og catch-all-grensene) med «Prøv igjen» og «Til profil»-knapp, og bruker `unstable_retry` (Next 16.2+) for å re-fetche segmentet. `ErrorScreen`-`BackTarget.labelKey` utvidet med `'toProfile'`; ny `error.toProfile`-nøkkel i `messages/no.json` og `messages/en.json`. (#867)
- `app/[locale]/profile/loading.tsx` — scoped loading skeleton for profil-segmentet. Gjengir en `ProfileFormSkeleton`-lignende silhuett (avatar + tre skjemafelt + invite-kort) med samme stagger-mønster som `ProfileFormSkeleton` i `page.tsx`. Erstatter `HomeSkeleton` (fra top-level `[locale]/loading.tsx`) som blinket kortlisten fra forsiden ved navigering til profil. (#867)

</details>

### [1.133.82] - 2026-06-22 · #846

> Redigerer du en bane, lagres alt på én gang eller ingenting, så en avbrutt lagring aldri etterlater en halv-ødelagt bane. Brukere som får lage baner, kan nå bare endre baner de selv har laget.

<details>
<summary>Teknisk</summary>

#### Fixed
- `updateCourse` rewriter en bane i mange ikke-atomiske steg (UPDATE `courses` → DELETE+INSERT `course_holes` → tee-diff med UPDATE/INSERT/hard-delete/arkiver). En feil midtveis etterlot banen inkonsistent — verst mellom holes-DELETE og -INSERT, der banen hadde null hull og leaderboards krasjet (#642-klasse). Alle skrivene er flyttet inn i én transaksjon via ny RPC `update_course_with_layout` (migrasjon 0114): feiler noe, ruller hele redigeringen tilbake. RPC-en er `SECURITY INVOKER` (ikke definer) fordi «trusted creator» er en TS-e-post-allowlist uten DB-representasjon — som invoker forblir RLS authz-laget for direkte kall, mens service-role-stien er TS-gatet. Den subtile tee-diffen (arkiver vs hard-delete via games-FK-oppslag) blir værende i TS; RPC-en er en ren atomisk eksekutor. Atomisitet smoke-testet på staging (avbrutt redigering → hull + navn uendret). Påført staging + prod. (#846)

#### Changed
- **Eierskaps-sjekk på bane-redigering:** en betrodd bane-skaper (ikke-admin) kan nå bare redigere og gjenåpne tees på baner de selv har laget — speiler den eksisterende guarden på sletting. Admin er upåvirket. Gjelder både `updateCourse` og `restoreTee`. (#846)

</details>

### [1.133.81] - 2026-06-22 · #737

> Glipper det mens du lager en runde, rydder appen vekk den tomme runden, så du slipper en halvferdig runde i lista.

<details>
<summary>Teknisk</summary>

#### Fixed
- `createGameInternal` insertet `games` og deretter `game_players` uten rollback. Feilet spiller-inserten etter at game-raden var committet, ble en foreldreløs runde uten spillere liggende — skaperen så en tom, ødelagt runde i listene sine. Lagt til kompenserende slett av game-raden (skaperen har DELETE-RLS på egne games, 0071; `game_players` cascade-ryddes av FK), som speiler #675-rollbacken i cup/liga. Chaos-injection-test dekker stien (spiller-insert feiler → `games.delete` + lokalisert `db_players`-feil). (#737)

</details>

### [1.133.80] - 2026-06-22 · #737

> Glipper noe mens du lager en bane, rydder appen bort hele forsøket, så du ikke blir sittende med en halvferdig bane du ikke får slettet.

<details>
<summary>Teknisk</summary>

#### Fixed
- `createCourse` insertet tidligere `courses` → `course_holes` → `tee_boxes` i tre sekvensielle PostgREST-kall uten rollback. Feilet en barn-insert, ble en foreldreløs `courses`-rad liggende. Verre: en ikke-admin-skaper har ingen DELETE-policy på `courses` (kun «courses admin delete», 0092), så en kompenserende slett (#675-mønsteret) ville blitt blokkert av RLS og orphanen bestått. De tre insertene er flyttet inn i én `SECURITY DEFINER`-RPC `create_course_with_layout` (migrasjon 0113) som kjører dem i én transaksjon: feiler noe (DB-feil eller CHECK-brudd), ruller hele oppretelsen tilbake. RPC-en tvinger `created_by = auth.uid()` internt (sterkere garanti enn den gamle klient-satte verdien). Kolonne-shape verifisert mot live prod-skjema (trap #1); atomisitet smoke-testet på staging (gyldig kall → 18 hull + tee, ugyldig kall → 0 orphan-baner). Påført staging + prod. (#737)
- Chaos-injection-test: en feilet RPC viser lokalisert feil og lekker aldri en direkte insert. Eksisterende happy-path-test omskrevet til å asserte RPC-kallet i stedet for de tre insertene. (#737)

</details>

### [1.133.79] - 2026-06-21 · #799

> Forhindrer at en klubbeier kan gjøre klubben eierløs ved å melde seg ut direkte — databasen krever nå alltid minst én eier igjen.

<details>
<summary>Teknisk</summary>

#### Fixed
- Ny `BEFORE DELETE`-trigger `guard_group_members_last_owner_delete` (migrasjon 0110) på `public.group_members`: kaster `P0001 last_owner` hvis raden som slettes er den eneste med `role='owner'` i gruppen. Speiler sist-eier-guarden i `set_club_member_role` (0076). Global admin og service-role bypasser vakten. Sletting av ikke-siste eier eller admin/vanlig-medlem er upåvirket. pgTAP-fil `supabase/tests/group_members_last_owner_delete_guard_test.sql` (6 assertions). (#799)

</details>

### [1.133.78] - 2026-06-21 · #803

> Forhindrer at en flight-deltaker kan stille slagtidsstempelet til år 2099 for å fryse en medspillers hull permanent — databasen avviser nå tidsstempler langt frem i tid og tilbake-daterte skriv.

<details>
<summary>Teknisk</summary>

#### Fixed
- Ny `BEFORE UPDATE`-trigger `guard_scores_self_update` (migrasjon 0109) på `public.scores`: avviser `client_updated_at` som enten beveger seg bakover (ikke-monoton) eller er satt mer enn 5 minutter frem i tid for ikke-admin-skriv. Legitime slag via `upsert_score_if_newer` (security invoker, sanntids-tidsstempel) passerer uten falske positive. Admin og service-role bypasser vakt som vanlig. pgTAP-fil `supabase/tests/scores_client_updated_at_guard_test.sql` (7 assertions). ⚠ Staging-verifisering av RPC-kompatibilitet påkrevd før merge — se PR. (#803)

</details>

### [1.133.77] - 2026-06-21 · #802

> Forhindrer at en spiller kan fjerne sin egen trekking eller trekke seg fra modus som ikke støtter det — databasen håndhever nå at kun admin kan sette eller nullstille `withdrawn_at`.

<details>
<summary>Teknisk</summary>

#### Fixed
- `guard_game_players_self_update` (migrasjon 0108): la til `withdrawn_at` og `withdrawn_by_user_id` i selbetjent-denylist på `game_players`. Spiller-raden kan nå kun endres av admin eller spill-oppretter. Direkte PostgREST-PATCH mot egne trekkkolonner gir `42501`. Ny pgTAP-fil `supabase/tests/withdrawn_columns_self_update_rls_test.sql` (8 assertions). (#802)

</details>

### [1.133.76] - 2026-06-21 · #817

> Direkte PostgREST-innskriving av tee-bokser med kursrating utenfor WHS-området (50–80) blir nå avvist i databasen — ikke bare i skjemaet. Det hindrer at en korrumpert rating ødelegger banehandicapen for alle i runden.

<details>
<summary>Teknisk</summary>

#### Fixed
- `tee_boxes.course_rating_{mens,ladies,juniors}` manglet DB CHECK. `parseGenderRating` (CR_MIN=50/CR_MAX=80) klipper ut-av-område-verdier i UI, men direkte PostgREST-insert omgikk validatoren (bekreftet på staging: `course_rating_mens=999` persisterte, noe som forskyver WHS banehandicap med ~+927). Migrasjon 0112 legger til tre CHECK-constraints parallelt med eksisterende `slope_*_check` og `par_total_*_check`. Migrasjon scrubber out-of-range CR-rader til NULL før constraint-tillegg. Trap #4-avtaletest lagt til i `lib/courses/courseRatingDbCheck.test.ts`. (#817)

</details>

### [1.133.75] - 2026-06-21 · #804

> Spill med et ugyldig spillformat avvises nå direkte av databasen. Appen godtar bare kjente spillformat — ikke vilkårlige verdier lagt inn via API-kall.

<details>
<summary>Teknisk</summary>

#### Fixed
- `games.game_mode` manglet DB CHECK/FK etter at `games_mode_check` ble droppet i 0047. En bruker kunne POST-e en `games`-rad med vilkårlig `game_mode` utenom TS-validatoren `isValidActiveGameMode`. Migrasjon 0111 gjeninnfører CHECK-constraint med alle 22 gyldige format-slugs (0047–0065). FK ble bevisst valgt bort (se 0047-kommentar: soft-deaktivering av et format må ikke ugyldiggjøre historiske spill). Migrasjon scrubber eventuelle invalide rader til `solo_strokeplay` før constraint-tillegg. Trap #4-avtaletest lagt til i `lib/formats/gameModeDbCheck.test.ts`. (#804)

</details>

### [1.133.74] - 2026-06-21 · #734

> Hullchipen (Par X · SI Y) og birdie/bogey-fargen bruker nå riktig par for dame- og juniortee, ikke herrenes par for alle.

<details>
<summary>Teknisk</summary>

#### Fixed
- Per-hull «Par X · SI Y»-chip-en og birdie/bogey-fargen i solo strokeplay og solo stableford leste herre-par (`hole.par` = `par_mens`) kjønns-blindt, så en dame eller junior på et hull der `par_ladies`/`par_juniors` ≠ `par_mens` fikk feil par-tall og feil farge (en netto-par kunne vises som bogey). Scoringen var aldri påvirket — poeng/netto har alltid brukt `parFor(hole, teeGender)`; dette gjaldt kun visningen. (#734)
- Mode-byggerne (`lib/scoring/modes/soloStrokeplay.ts`, `stableford.ts`) eksponerer nå spillerens eget par per celle (`parFor(hole, p.teeGender)`) og kursens `parByGender` per hull-rad. Holes-viewene bruker cellens `par` til `scoreShape`/`scoreTone`, og viser spillerens eget par i chip-en når alle i feltet er på samme tee — ellers beholdes herre-par som trygg fallback for blandet-kjønn-felt. Fler-spiller-modusene med delt chip (Nassau, Skins, Wolf m.fl.) er bevisst urørt, jf. eier-anbefalingen i issuet.

</details>

### [1.133.73] - 2026-06-21 · #805

> Godkjenner du flere påmeldinger enn formatet har plass til, sier appen fra med en gang, i stedet for at du først oppdager det når du prøver å publisere spillet.

<details>
<summary>Teknisk</summary>

#### Added
- `PåmeldingerClient` viser nå en kapasitets-advarsel (`admin.game.signups.capWarning`) øverst i «Venter»-fanen når antall godkjente spillere er på eller over formatets tak. Taket hentes fra `soloPlayerCap(gameMode)` (null for formater uten streng øvre grense, som stableford og lag-formater med team_size-validering), så advarselen dukker bare opp der det finnes et reelt tak. Den blokkerer ikke godkjenning (den harde porten ved publisering, `too_many_players_for_mode`, er fortsatt sannhets-laget), men admin/trusted creator får signalet ved godkjenning i stedet for først ved publisering. `game_mode` + godkjent-antall tres gjennom fra `signups/page.tsx`. Ny streng i no.json + en.json (`catalogParity` grønn); `data-testid="cap-warning"` for e2e. (#805)

</details>

### [1.133.72] - 2026-06-21 · #801

> Valgte admin «skjul til avslutning», skjuler leaderboarden nå faktisk resultatet underveis, også for stableford, slagspill og scramble. Runden kan holdes hemmelig helt frem til avslutning, slik innstillingen lover.

<details>
<summary>Teknisk</summary>

#### Fixed
- `score_visibility='reveal'` ble ignorert av hovedleaderboarden for stableford / modified_stableford, solo_strokeplay, texas_scramble / ambrose / florida og hele matchplay-familien. Format-grenene returnerte tidlig i `page.tsx` uten å nå den generiske `reveal-active → RevealBruttoView`-blokka. Fikset ved å koble `revealState` + `shouldHideNetto` inn i `formats/stableford.tsx`, `formats/soloStrokeplay.tsx`, `formats/texasScramble.tsx`, `formats/matchplay.tsx`, `formats/fourballMatchplay.tsx` og `formats/foursomesMatchplay.tsx`. For solo-formater (stableford solo / solo_strokeplay) der `team_number = 0` i DB, tilordnes hver aktive spiller et sekvensielt 1-basert `teamNumber` for `computeLeaderboard`-kallet fra `lib/leaderboard` slik at brutto-view-en rendrer én rad per spiller. Team-formater (team-stableford, texas-scramble og matchplay-familie) bruker reelle `team_number`-verdier. Ferdig spill (`status='finished'`) faller gjennom til normal podium-vei uberørt. (#801)

</details>

### [1.133.71] - 2026-06-21 · #800

> Matchplay-resultater viser nå alltid den golf-lovlige avgjørelsesformen, «10&8» i stedet for «18up», også når alle 18 hull er tastet inn etter at matchen var ferdig.

<details>
<summary>Teknisk</summary>

#### Fixed
- `compute()` i `lib/scoring/modes/singlesMatchplay.ts` fanget ikke opp mat-em-punktet når scorekortbrukere tastet inn hull etter at matchen matematisk var avgjort. Sluttresultatet ble «18up» (eller andre meningsløse margintal) i stedet for golf-lovlig «10&8»-form. Fikset ved å spore mat-em-snapshot hull-for-hull under iterasjonen: første hull der `|holesUp| > holesRemaining` låses som avgjørelsespunkt og brukes som endelig resultat, uavhengig av om ytterligere hull tastes inn. `computeMatchResult` er uendret — «Nup»/«AS»-grenene aktiveres bare når mat-em aldri ble oppdaget underveis (ekte 18-hols-finish). Fourball/foursomes via `computeCupMatchResult` arver fiksen uten kodeendring. (#800)

</details>

### [1.133.70] - 2026-06-21 · #819

> Appen lagrer ikke lenger innholdet på innloggede sider i nettleser-cachen. Skulle noen andre bruke samme telefon uten nett, ser de aldri din profil, dine resultater eller adminpanelet.

<details>
<summary>Teknisk</summary>

#### Fixed
- `public/sw.js`: service workeren cachet HTML for alle same-origin navigasjoner, inkludert autentiserte sider (`/en/profile`, `/admin/*`, `/cup/*`, `/liga/*`, `/games/*` m.fl.). Offline-fallbacken serverte da `cache.match(request)` uten sesjonsjekk, noe som på en delt enhet kunne eksponere forrige brukers HTML. Løst ved å bytte fra en denylist til en **allowlist** for navigasjonsbufring: kun kjente offentlige shell-ruter skrives til cachen (`/`, `/{locale}`, `/login`, `/legal/*`, `/spillformater`, `/finn-turneringer`, pluss locale-prefiks-varianter). Autentiserte ruter hentes fortsatt nettverksfirst, men caches aldri. Offline-fallback bruker kun cachet app-shell (`/`), aldri personlig HTML. `CACHE_VERSION` bumpa `v1` → `v2` så aktiveringshandleren sletter alle gamle cacher (inkludert autentisert HTML fra v1-klienter) ved SW-oppdatering. Offline scoring-loop er Dexie-basert og upåvirket. (#819)

</details>

### [1.133.69] - 2026-06-21 · #793

> «Vis regler» og «Skjul regler»-knappene i veiviserens format-ark vises nå på riktig språk — engelske brukere ser «Show rules» / «Hide rules» / «Read more →».

<details>
<summary>Teknisk</summary>

#### Fixed
- `FormatGuideSheet.tsx` sendte ikke `cardLabels`-propen videre til `FormatGuideList`, så `ModeGuideCard`-kortene inne i «?»-arket falt tilbake til norske default-strenger. Propen er nå lagt til med `t('cardShowRules')`, `t('cardHideRules')` og `t('cardReadMore')` fra det allerede tilstedeværende `useTranslations('formatGuide')`-kallet i komponenten. Ingen ny i18n-nøkkel trengs — `formatGuide.card{Show,Hide}Rules` og `formatGuide.cardReadMore` ble lagt til av #760. (#793)

</details>

### [1.133.68] - 2026-06-21 · #818

> Profil-raden «Installer som app» vises nå på riktig språk — engelske brukere ser «Install app».

<details>
<summary>Teknisk</summary>

#### Fixed
- `InstallButton.tsx` hadde hardkodet norsk label `"Installer som app"` i stedet for `t('label')`. Lagt til namespace `installButton` (med nøkkel `label`) i både `messages/no.json` og `messages/en.json`. Komponenten bruker nå `useTranslations('installButton')`. catalogParity grønn. (#818)

</details>

### [1.133.67] - 2026-06-21 · #816

> Engelske brukere ser nå riktig apostrof i innboks, profil og venner-flaten — ikke lenger dobbel apostrof (f.eks. «You're friends now» i stedet for «You''re friends now»).

<details>
<summary>Teknisk</summary>

#### Fixed
- 66 statiske engelske strenger i `messages/en.json` viste dobbel apostrof fordi next-intl bare av-escaper ICU `''` → `'` i strenger med placeholder (`{…}`). Placeholder-løse strenger returneres ordrett. Alle 66 rettet til enkel `'`; de 13 argumenterte strengene (med `{…}`) har korrekt `''` og ble ikke rørt. Lagt til `messages/apostropheParity.test.ts` som feiler hvis mønsteret gjeninnføres. (#816)

</details>

### [1.133.66] - 2026-06-21 · #798

> Når en runde er ferdigspilt, viser resultatkortet igjen plasseringene i stedet for bare et trofé-ikon. Og som klubbeier ser du igjen dem som har bedt om å bli med, så du kan godkjenne eller avslå dem.

<details>
<summary>Teknisk</summary>

#### Fixed
- Tvetydige PostgREST-embeds mot `users` (`PGRST201`) på tabeller med flere enn én fremmednøkkel til `users`. Skjemaet har fått 2.–3. bruker-FK på flere tabeller (`game_players`, `group_join_requests` m.fl.), så uhinta `users(...)`-embeds feilet i prod. Tre steder rettet med eksplisitt FK-hint (`users!<constraint>(...)`): `buildModeResultForGame` (→ `persistResultSummaries` i `endGame` lagrer nå `game_players.result_summary` for alle spillemodi i stedet for å feile stille, så resultatkortene fylles ut), `getClubDetail` (klubb-eier/-admin ser nå ventende «be om å bli med»-forespørsler igjen), og `startGame`. `getClubDetail` svelger ikke lenger lese-feil stille — feil på `members`/`joinRequests`/`invitations`-spørringene logges nå. Lagt til én delt regresjonsvakt (`lib/supabase/embedAmbiguity.ts` + co-located test) som feiler statisk hvis et uhinta multi-FK-embed gjeninnføres noe sted i `app/`, `lib/` eller `components/`. (#798)

</details>

### [1.133.65] - 2026-06-20 · #754

> Grønn hake betyr nå at scoren er på vei til serveren. Er du uten nett, ser du i stedet en gul dot med teksten «Lagret på telefonen · sendes når nettet er tilbake» — så du aldri er i tvil om hva som er synkronisert.

<details>
<summary>Teknisk</summary>

#### Added
- `SyncStatusLine` fikk ny valgfri prop `pendingCount?: number` og en tredje tilstand mellom "sender" og "lagret": `(pendingCount ?? 0) > 0` → gul dot (`var(--warning)`) + teksten `holes.sync.waitingForNetwork`. Presedens: syncing → pending → savedAt → fallback. Eksisterende props er uendret, `pendingCount` defaulter til 0/absent så de 3 låste testene (`syncing=true`, `savedAt='14:32'`, tom savedAt) er identisk grønne. Ny test for gul tilstand lagt til. `HoleClient` leser køen via `useLiveQuery(() => localDb.syncQueue.toArray(), [])`, filtrerer ut `abandonedAt != null` (karantene-items), og sender `pendingCount` til linjen. Visibility-predikatet utvidet til `(syncing || savedAt.length > 0 || pendingCount > 0)`. `holes.sync.waitingForNetwork` lagt til i no.json og en.json; `catalogParity` grønn. (#754)

</details>

### [1.133.64] - 2026-06-20 · #744

> «Lagret nylig» vises ikke lenger på tomme hull før du har tastet noe. Statuslinjen dukker opp første gang som en ekte kvittering — ikke som en falsk bekreftelse.

<details>
<summary>Teknisk</summary>

#### Fixed
- `SyncStatusLine` ble rendret ubetinget i `HoleClient`, noe som ga en grønn «Lagret nylig»-dot på alle tomme hull ved mount (pga. `key={holeNumber}`-remount). Lagt til `{(syncing || savedAt.length > 0) && <SyncStatusLine .../>}` slik at linjen kun vises etter reell skriveaktivitet. En ny Type C-test (`HoleClient.test.tsx`) verifiserer at `sync-dot` er fraværende på et fersk hull. (#744)

</details>

### [1.133.63] - 2026-06-20 · #770

> Installerknappen og lukkknappen i app-banneret, samt pil-tilbake og leaderboard-ikonet på hull-skjermen, er nå lettere å treffe med fingeren.

<details>
<summary>Teknisk</summary>

#### Fixed
- `InstallBanner`: «Installer»-knappen fikk `min-h-11` (Tailwind 44px); «✕»-knappen fikk `min-h-11 min-w-11 flex items-center justify-center`; container `gap-1` → `gap-2`. `HoleClient`: `backLinkStyle` bumpa fra `minWidth/minHeight:32` til `44`; `leaderboardIconLinkStyle` bumpa fra `width/height:34` til `44`. De negative `-6`-margene er beholdt så det visuelle fotavtrykket er uendret — bare treffområdet vokser. Rent stil-endring, ingen logikk rørt. (#770)

</details>

### [1.133.62] - 2026-06-20 · #749

> Installér-banneret og installasjonsveiviseren vises nå på riktig språk. Engelske brukere ser ikke lenger norsk tekst her.

<details>
<summary>Teknisk</summary>

#### Fixed
- `InstallBanner` og `InstallInstructionsModal` hadde hardkodede norske strenger. Begge byttet til `useTranslations('installBanner')` / `useTranslations('installInstructions')`. To nye namespaces lagt til i `messages/no.json` (prod-strenger kopiert verbatim) og `messages/en.json` (idiomatic engelsk). Trinn 1 i iOS-Safari-flyten er delt i `iosStep1Pre`/`iosStep1Post` rundt det SVG-baserte del-ikonet som sitter inline i teksten. `<strong>`-uthevingen av «Safari»/«tornygolf.no» i ios-other- og unsupported-variantene ble forenklet til ren tekst (markup ble ikke ført inn i oversettelsene); del-ikonet i trinn 1 er bevart via Pre/Post-splitten. catalogParity grønn. (#749)

</details>

### [1.133.61] - 2026-06-20 · #769

> Hurtigvalget når du taster score viser nå par+1 og par+2 i tillegg. Bogey og dobbelt-bogey er ett trykk unna i stedet for flere trykk på +.

<details>
<summary>Teknisk</summary>

#### Changed
- `SpecificValueSheet` utvidet verdilisten fra `[par-2, par-1, par]` til `[par-2, par-1, par, par+1, par+2]`, filtrert mot `>= 1` og `<= 15` (MAX_STROKES, speilet fra ScoreCard). Grid ble endret fra `repeat(4,1fr)` til `repeat(3,1fr)` slik at 5 tall-knapper + X-knappen danner en ryddig 2×3 layout. Tap-targets er uendret (buttonStyle padding 14px 0 ≈ 50px høyde). Kommentar ved verdilisten oppdatert. Tester oppdatert: par=4→6 knapper ['2','3','4','5','6','X'], par=3→6 knapper ['1','2','3','4','5','X'], par=2→5 knapper ['1','2','3','4','X'] (par-2=0 filtrert ut). (#769)

</details>

### [1.133.60] - 2026-06-20 · #745

> Resultattavla fanger nå opp rettede scorer i tillegg til nye. Fikser du et slag du tastet feil, ser alle tilskuere den riktige scoren umiddelbart.

<details>
<summary>Teknisk</summary>

#### Fixed
- `LeaderboardRealtime` og `PreRoundLeaderboardRealtime` abonnerte kun på `scores`-INSERT. Score-korreksjoner skjer via `upsert_score_if_newer` som utsteder UPDATE — disse ble aldri fanget, og tilskuerens tall ble stående til neste INSERT refreshet siden. Lagt til en andre `.on('postgres_changes', {event:'UPDATE', ...})` på `scores`-tabellen i begge komponenter; `LeaderboardRealtime` ruter dem gjennom den eksisterende 300ms-debouncede `scheduleRefresh` (kollapser burst av UPDATE-er til én refresh), `PreRoundLeaderboardRealtime` bruker `() => router.refresh()` som de eksisterende handlene der. `scores` har REPLICA IDENTITY FULL (0006) og er i realtime-publikasjonen (0005) — ingen migrasjon nødvendig. (#745)

</details>

### [1.133.59] - 2026-06-20 · #740

> Har du allerede levert en runde i ligaen, viser runden nå «Levert ✓» i stedet for «Spill». Slik slipper du å trykke deg tre steg inn for å oppdage at du er ferdig.

<details>
<summary>Teknisk</summary>

#### Fixed
- `lib/league/getLigaSnapshot.ts`: ny `deliveredByRound: Map<roundId, Set<userId>>` bygget ved å iterere over `games` med `status === 'finished'` og tilhørende `game_players` med `withdrawn_at === null` — speilbilde av server-gaten i `startLeagueRoundFlight` (actions.ts:656–663). Populeres som `deliveredUserIds: string[]` på `LeagueRoundView`. En trukket spiller er IKKE i settet (kan starte ny flight); en started-men-ikke-ferdig spiller er heller ikke med (game.status !== 'finished').
- `app/[locale]/liga/[id]/page.tsx`: ny `alreadyDelivered`-variabel per runde. Legges inn som FØRSTE gren i aksjon-kolonnen, foran `canPlay`-grenen. Rendres som muted tekst med `aria-label`. Ny `LeagueRoundView.deliveredUserIds`-prop lagt til i testfiksturen i `LeagueStandingsTable.test.tsx`.
- Tre nye tester i `getLigaSnapshot.test.ts` verifiserer de tre gate-tilfellene: ferdig+ikke-trukket → inkludert; trukket → ekskludert; aktiv (ikke ferdig) → ekskludert.
- Nye i18n-nøkler `liga.player.delivered` og `liga.player.deliveredAria` i no + en. (#740)

</details>

### [1.133.58] - 2026-06-20 · #773

> Har du en kommende runde i ligaen, ser du nå datoen den åpner i stedet for ingenting. Slik slipper du å lure på om du har gått glipp av noe.

<details>
<summary>Teknisk</summary>

#### Added
- `app/[locale]/liga/[id]/page.tsx`: i aksjon-kolonnen for runder, ny gren `ws === 'upcoming'` som rendrer muted tekst med `t('opensOn', { date: fmtWindow(round.opensAt, locale) })`. Strengt gated til `'upcoming'` — ikke `'closed'`. Ny i18n-nøkkel `liga.player.opensOn` i no + en. (#773)

</details>

### [1.133.57] - 2026-06-20 · #774

> Avsluttede ligaer får nå et grønt banner øverst som bekrefter at sesongen er over, slik at det er tydelig at innholdet er en avsluttet sesong og ikke noe som venter på handling.

<details>
<summary>Teknisk</summary>

#### Added
- `app/[locale]/liga/[id]/page.tsx`: når `league.status === 'finished'`, rendres `<Banner tone="success">` med ny nøkkel `liga.player.seasonFinishedBanner` over standings-tabellen. `Banner` var allerede importert. Ingen server- eller DB-endring. Ny i18n-nøkkel i no + en. (#774)

</details>

### [1.133.56] - 2026-06-20 · #772

> Feilmeldingen du fikk når admin ikke klarte å legge til spillere i ligaen, var en uleselig kode på engelsk. Den er nå norsk og forklarende.

<details>
<summary>Teknisk</summary>

#### Fixed
- `LigaAddPlayers.tsx` rendret råkodene `players_failed`/`players`/`missing` rett i brukergrensesnittet ved server-feil. Fikset ved å kopiere allow-list+`t()`-mønsteret fra søster-komponenten `LigaAddRound.tsx`: ukjente koder faller til `errors.fallback`. Nye i18n-nøkler i `liga.addPlayers.errors` (no + en). (#772)

</details>

### [1.133.55] - 2026-06-20 · #782

> Forklaringen av slagspill sier ikke lenger at du kappes mot «klokken». Slagspill har ingen klokke. Teksten er rettet og leser nå rent.

<details>
<summary>Teknisk</summary>

#### Fixed
- `messages/no.json`: `formatGuide.content.solo_strokeplay.long` er erstattet med ny tekst som fjerner faktafeilen («klokken») og em-dash-kjeden. Full streng skrevet om, ikke find-replace. Ingen endring i `messages/en.json` (norsk-bare-fiks per issue). (#782)

</details>

### [1.133.54] - 2026-06-20 · #781

> Spillformat-oppslagsverket er nå delt i fire tydelige bolker — Solo og stableford, Lag og scramble, Matchplay, og Veddemål og dueller. Wolf er ikke lenger kort nummer 17 i en lang ubrutt liste.

<details>
<summary>Teknisk</summary>

#### Fixed
- `buildFormatGuide.ts`: `CatalogEntry` fikk et valgfritt `sectionKey`-felt. Første format i hver bolk (`stableford`, `best_ball`, `singles_matchplay`, `nassau`) bærer nøkkelen. Rekkefølgen er justert: `shamble`/`patsome` er flyttet inn i lag-bolken. `getFormatGuideEntries` leser `sectionLabel` fra `formatGuide`-namespacet og sender det videre på `FormatGuideEntry`. `FormatGuideList` fikk `showSections`-prop og rendrer `<h2>` med FormatGrid-stil (`text-[10px] uppercase tracking-[0.2em] text-muted`) foran hvert kort med `sectionLabel`. `spillformater/page.tsx` setter `showSections`. «?»-arket i veiviseren bruker fortsatt flat liste. Nye i18n-nøkler i begge `messages/*.json`. (#781)

</details>

### [1.133.53] - 2026-06-20 · #760

> Knappene «Vis regler» og «Skjul regler» på format-kortene vises nå på riktig språk for engelskspråklige brukere.

<details>
<summary>Teknisk</summary>

#### Fixed
- `ModeGuideCard` fikk tre valgfrie props (`showRulesLabel`, `hideRulesLabel`, `readMoreLabel`) med norske fallback-verdier. `FormatGuideList` fikk en ny `cardLabels`-prop som sender oversatte strenger videre til kortene. `spillformater/page.tsx` henter `cardShowRules`/`cardHideRules`/`cardReadMore` fra `formatGuide`-namespacet via `getTranslations` og sender dem inn. Ny i18n-nøkler lagt til i `messages/no.json` og `messages/en.json`. Ingen 'use client'-konvertering av `ModeGuideCard`. (#760)

</details>

### [1.133.52] - 2026-06-20 · #757

> Avslaget i innboksen leser nå «Du kom ikke med i {spillnavn}» — du ser utfallet med én gang, uten å måtte lese detaljen.

<details>
<summary>Teknisk</summary>

#### Fixed
- `PlayerCountPicker` i `GameWizard.tsx`: hint-paragrafen vises alltid (ikke bare når `value !== undefined`) — i «Vis alle»-tilstand vises `playerCount.showAllHint` («Viser alle spillformer.»). Nytt `aria-live="polite"` på hint-paragrafen kunngjør skiftet til skjermleser. Count-spanens `aria-label` bytter til `playerCount.showAllAriaLabel` i undefined-tilstand slik at skjermleser ikke annonserer stale teller. (#764)

</details>

### [1.133.51] - 2026-06-20 · #767

> Aksepter- og Fjern-knappene på lagoversikten blinker ikke lenger siden — de oppdaterer seg på stedet.
### [1.133.50] - 2026-06-20 · #763

> Etter at du har invitert noen fra Venner-siden, blir du nå værende der — ikke kastet til profilsiden.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/[locale]/profile/venner/page.tsx`: la til skjult `<input name="return" value="venner">` i invite-kortet og ny `invited`-nøkkel i `TONE`-mappen og `StatusKey`-typen. `app/[locale]/invite/actions.ts`: leser `return`-feltet og redirecter til `/profile/venner?status=invited&invite_email=<email>` når satt. Ny i18n-nøkkel `friends.status.invited` (med ICU `{email}`-parameter) i no.json og en.json. Eksisterende default-redirect til `/profile` er uendret. (#763)

</details>

### [1.133.49] - 2026-06-20 · #742

> Etter at du har sendt inn en bli-med-forespørsel, kan du gå rett videre til «Finn turneringer» med ett trykk.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/[locale]/signup/[shortId]/RegistrationForm.tsx`: la til `LinkButton` til `/finn-turneringer` under `requestSentBanner` i `manual_approval`-suksess-grenen. Ny nøkkel `signup.findMoreButton` i `no.json` og `en.json`. (#742)

</details>

### [1.133.48] - 2026-06-20 · #741

> Hilsenen «hvem er du?» fra bli-med-skjemaet vises nå for eieren. Godkjenning er ikke lenger blind gjetting.

<details>
<summary>Teknisk</summary>

#### Fixed
- `GreetingCard` og `PlayerKlubbhus` i `app/[locale]/admin/page.tsx` brukte `firstName() ?? 'saksbehandler'`/`'spiller'` som fallback når profil-navn mangler. Migration 0014 setter `name=NULL` for self-reg-brukere, så dette var DEFAULT-opplevelsen, ikke en sjelden glitch. Fallback-ordene er fjernet; i stedet velger koden mellom `greetingHeading`/`playerGreeting` (med navn) og de nye nøklene `greetingHeadingNoName` (`«God {timeOfDay}.»`) / `playerGreetingNoName` (`«Hei.»`) i no+en. (#783)

</details>

### [1.133.47] - 2026-06-20 · #775

> Hjem-velkomsten gjentar ikke «Klubbhuset» to ganger lenger, og på klubblista ser du en enkel lenke i stedet for en hel CTA når du allerede er med i en klubb.

<details>
<summary>Teknisk</summary>

#### Fixed
- `completeProfile`-actionen bærer nå med seg innsendte feltverdier (`name`, `nickname`, `hcp_index`, `hcp_plus`, `gender`) i `?`-parameterne ved valideringsfeil-redirect, slik at siden kan gjenopprette dem. `page.tsx` leser disse via `searchParams` og setter `defaultValue`/`defaultChecked` på alle felt. `OnboardingHcpField` fikk `initialMagnitude`/`initialPlus`-props for å initialisere `useState` med de gjenopprettede verdiene (server-side `defaultValue` alene fungerer ikke for kontrollerte React-inputs). Låst redirect-test i `actions.test.ts` oppdatert til å matche den nye query-strengen. (#748)

</details>

### [1.133.46] - 2026-06-20 · #776

> Under «Eksporter mine data» forklarer appen nå kort hva filen inneholder — før du laster den ned.

<details>
<summary>Teknisk</summary>

#### Added
- Ny `profile.exportSublabel`-nøkkel i `no.json` + `en.json`; sendt som `sublabel`-prop til eksport-`SettingRow` i `app/[locale]/profile/page.tsx`. (#776)

</details>

### [1.133.45] - 2026-06-20 · #771

> Kjønn- og spillerklasse-knappene er to piksler høyere og lettere å treffe med fingeren.

<details>
<summary>Teknisk</summary>

#### Fixed
- La til en `text-xs text-muted`-linje under instruksjons-`<p>` i `VerifyCodeForm.tsx` med ny i18n-nøkkel `auth.verifyCode.spamHint`. Nøkkelen er lagt til i begge `messages/no.json` og `messages/en.json` (catalogParity-test grønn). Hjelper brukere som ellers avbryter flyten fordi de tror appen er ødelagt. (#766)

</details>

### [1.133.44] - 2026-06-20 · #761

> «Personvern»-lenken i bunnteksten vises nå på riktig språk uansett om du bruker appen på norsk eller engelsk.

<details>
<summary>Teknisk</summary>

#### Fixed
- «Send ny kode» i `VerifyCodeForm.tsx` var en `<a href>`-lenke tilbake til e-poststeget, som krevde et ekstra tapp på «Send meg kode». Lenken er byttet til en `<button type="submit">` i et eget `<form action={sendCode}>` plassert etter (utenfor) verify-`<form>`-en — nøstede `<form>`-elementer er ugyldig HTML og ville kollidert med `verifyCode`-action og `token required`-validering. Email og next bæres som skjulte felt. `resendHref`-prop-en på `VerifyCodeForm` er beholdt som valgfri (`?`) for bakoverkompatibilitet, men brukes ikke lenger. (#768)

</details>

### [1.133.43] - 2026-06-20 · #758

> Alle sider i appen får nå en nøytral innlastings-animasjon i stedet for en feilformet Hjem-skjelett.

<details>
<summary>Teknisk</summary>

#### Fixed
- `GenerateMatches.tsx` rendret veiviseren selv om `players.length === 0` eller `courses.length === 0` (inkl. «alle tees arkivert»-tilfellet, allerede filtrert ut på l.114). Lagt til en tidlig-retur-gren som viser Card-blokker med forklaringstekst og lenke: spillere → `/admin/spillere` (admin/personlig) eller `/klubber/${groupId}` (klubb-cup); baner → `/admin/courses/new`. Tre nye i18n-nøkler i `generate`-nøkkelrommet (no + en). Shell + TopBar + BrassRibbon + PageHeader er med i begge greiner for konsistent chrome. (#752)

</details>

### [1.133.42] - 2026-06-20 · #756

> Tom historikk viser nå én ryddig melding i stedet for to overlappende.
### [1.133.41] - 2026-06-20 · #783

> Har du ikke lagt inn navn ennå, sier appen nå «God morgen.» i stedet for det litt rare «God morgen, spiller.»
### [1.133.40] - 2026-06-20 · #780

> Ny snarvei i bane-skjemaet: ett trykk fyller stroke-indeks 1–18 stigende, så du slipper 18 tastatur-popups.

<details>
<summary>Teknisk</summary>

#### Changed
- `CourseForm.tsx`: lagt til `fillSiAscending()`-handler og en `<button type="button">` øverst i hull-seksjonen. Knappen kaller `setHoles` og setter `stroke_index` til `String(i + 1)` for alle 18 hull. I edit-flyten (`initialData !== undefined`) vises knappen som «Overskriv SI med 1–18 (stigende)» for å signalisere at det er destruktivt. Nye nøkler `courseForm.form.setSiAscButton` + `setSiAscButtonEdit` i no.json + en.json. (#780)

</details>

### [1.133.39] - 2026-06-20 · #779

> Når du ikke har noen ventende invitasjoner, er invitasjonsskjemaet nå åpent med én gang — ingen ekstra trykk.

<details>
<summary>Teknisk</summary>

#### Changed
- `InviteForm.tsx` henter nå antall ventende invitasjoner med en `head: true`-query og setter `open`-attributtet på `<details>` betinget (`pendingCount === 0`). Når ventelisten er tom åpnes skjemaet automatisk og følger tom-tilstandens oppfordring («Inviter en spiller nedenfor»). Kollapset-design beholdes når det finnes ventende rader. (#779)

</details>

### [1.133.38] - 2026-06-20 · #778

> Spiller-søket filtrerer nå mens du skriver — ingen submit-knapp, ingen side-reload, akkurat som Baner-katalogen.

<details>
<summary>Teknisk</summary>

#### Changed
- `PlayersList.tsx` er delt i en server-wrapper (henter alle spillere) og `PlayersListClient.tsx` (ny `'use client'`-komponent). Klient-komponenten filtrerer i minne med `useMemo` på hvert tastetrykk og synker `?q=`-param til URL via `useSearchParams` + `router.replace` + `startTransition` — identisk mønster med `CoursesLedgerClient.tsx`. GET-formen med `action="/admin/spillere"` er fjernet. (#778)
- `<label htmlFor="players-search" className="sr-only">` med ny nøkkel `admin.players.searchAriaLabel` er lagt til (korrigerer a11y-regresjon der `label=""` var tomt). (#778)

</details>

### [1.133.37] - 2026-06-20 · #777

> Sekretariat-forsiden hopper ikke lenger når innholdet lastes — skjelettet matcher nå de 10 flisene som faktisk vises.

<details>
<summary>Teknisk</summary>

#### Changed
- `TilesSkeleton` i `app/[locale]/admin/page.tsx` rendret 5 placeholder-kort; `TilesGrid` rendrer 10. Endret til `Array.from({ length: 10 })` for å eliminere ~216 px layout-hopp ved hydratering. (#777)

</details>

### [1.133.36] - 2026-06-20 · #751

> Feilmeldinger i admin-flaten peker deg nå mot noe du kan gjøre — ikke mot Vercel-logger du ikke har tilgang til.

<details>
<summary>Teknisk</summary>

#### Changed
- 19 feilmeldinger i `messages/no.json` og `messages/en.json` som henviste til «Vercel-loggene» eller «Supabase-loggene» er erstattet med handlbar copy («Prøv igjen om litt.» / «Prøv å sende på nytt.» / «Ta kontakt med administratoren.»). Berørte nøkler: `wizard.errors.db_game/db_players/cup_insert_failed`, `admin.game.delete.errors.delete_failed`, `admin.players.errors.mail_failed`, `admin.players.profile.errors.auth_delete_failed`, `admin.courses.errors/edit.errors/delete.errors.*`, `admin.formats.errors.db_error`, `admin.launches.errors.publish_failed/digest_failed`, `liga.delete.errors.delete_failed`, `cup.delete.errors.delete_failed`, `courseForm.adminErrors.*`. (#751)

</details>

### [1.133.35] - 2026-06-20 · #753

> Når noen ikke har levert, ser du nå purre-knappen øverst — Avslutt likevel er fortsatt der, men lengre nede.

<details>
<summary>Teknisk</summary>

#### Changed
- I `onlyMissingBlocks`-grenen i `admin/games/[id]/page.tsx` er «Se spillerstatus og send påminnelse →» lagt til som sekundær-knapp (`text-primary`, `border-border`) mellom advarselen og «Avslutt likevel»-knappen. Gjenbruker eksisterende `tCta('viewStatusWithReminderLink')` og `/admin/games/${gameId}/status`-ruta. (#753)

</details>

### [1.133.34] - 2026-06-20 · #750

> I engelsk locale vises admin-flater nå fullt oversatt — ingen rå norsk lenger i spill-listen eller på scorekort-raden.

<details>
<summary>Teknisk</summary>

#### Fixed
- I admin-cup-listen brukte tom-tilstand-blokken en sammensetning av to katalognøkler (`ledger.emptyText` + `ledger.emptyLink`) pluss hardkodet norsk «for å komme i gang.». I engelsk locale ble resultatet «You have no cups yet. Set up a cup for å komme i gang.». Erstatt med én `t.rich('ledger.emptyBody', { a: ... })`-kall der `<a>`-chunken rendres som `SmartLink` med eksisterende `className`. Ny katalognøkkel `ledger.emptyBody` lagt til i `messages/no.json` og `messages/en.json`; no-verdien er «Du har ingen cuper ennå. <a>Sett opp en cup</a> for å komme i gang.», en-verdien er «You have no cups yet. <a>Set up a cup</a> to get started.». Etablert t.rich-mønster fra `CupSetup.tsx` + `trekk-tilbake/page.tsx`. (#762)

</details>

### [1.133.33] - 2026-06-20 · #762

> Cup-listen er nå helt norsk — også på engelsk: «for å komme i gang» lekker ikke lenger inn i den engelske visningen.
### [1.133.32] - 2026-06-20 · #752

> Prøver du å generere matcher uten spillere eller baner, får du nå en forklaring og en snarvei videre — i stedet for en veiviser som aldri kan fullføres.
- Skjuler `roundCount`-paragrafen når `finishedCount === 0` i `app/[locale]/profile/historikk/page.tsx` — ICU =0-grenen i begge kataloger er urørt (catalogParity). (#756)

</details>

### [1.133.31] - 2026-06-20 · #747

> Cup-siden som sendes til spillerne snakker nå norsk fra topp til bunn — ingen engelsk blant matchene.
- Fjernet bjelle-sirkel (`SkeletonCircle` l.20) og admin-rutenettet (`grid grid-cols-2`, l.36) fra `HomeSkeleton` — skeleton er nå rute-nøytral og gjenspeiler brand-rad + generiske kort-seksjoner. `app/[locale]/loading.tsx` bruker fortsatt `HomeSkeleton` (navnenavn ikke endret for å unngå import-rotasjon). (#758)
- Fjernet bjelle-sirkel (`SkeletonCircle` l.20) og admin-rutenettet (`grid grid-cols-2`, l.36) fra `HomeSkeleton`; lagt til en tredje kort-rad for mer realistisk flater-balanse. `app/[locale]/loading.tsx` bruker fortsatt `HomeSkeleton` (navnenavn ikke endret for å unngå import-rotasjon). (#758)

</details>

### [1.133.30] - 2026-06-20 · #764

> Trykker du «Vis alle» i veiviseren, sier appen nå «Viser alle spillformer.» i stedet for å vise et spørsmålstegn.
### [1.133.29] - 2026-06-20 · #755

> Steg 3 og 4 i veiviseren sier nå «Bane og tidspunkt» og «Hvem skal spille?» — ikke «1. Spillet» og «2. Spillere» som hørte hjemme i det gamle formen.

<details>
<summary>Teknisk</summary>

#### Fixed
- `wizard.sections.basics.heading` endret til «Bane og tidspunkt» (no) / «Course and time» (en) — fjerner nummer som dupliserer steg-telleren. Test i `GameWizard.test.tsx` oppdatert tilsvarende. (#755)
- Ny nøkkel `wizard.sections.players.headingWizard` = «Hvem skal spille?» (no) / «Who is playing?» (en); `GameWizard.tsx` steg 4 bruker den i stedet for `headingDefault` «2. Spillere». Full GameForm beholder sin nummererte `headingDefault`. (#755)

</details>

### [1.133.28] - 2026-06-20 · #759

> Én ting heter én ting: «spillformer» hele veien gjennom opprettelsesveiviseren.

<details>
<summary>Teknisk</summary>

#### Fixed
- `wizard.playerCount.hint` i no.json: «formater» → «spillformer» for konsistent norsk begrep gjennom steg 2 (teller-hint, legend og tom-tilstand sier nå det samme). (#759)

</details>

### [1.133.27] - 2026-06-20 · #746

> Ser du ingen spillformer i veiviseren, sier appen nå hva du kan justere — ikke kryptisk kode-sjargong.

<details>
<summary>Teknisk</summary>

#### Fixed
- `wizard.formatGrid.emptyState` i no.json og en.json erstattet med norsk tekst uten em-dash, kode-termer («formats»/«intent») og blind «kontakt admin»-blindvei. (#746)

</details>

### [1.133.26] - 2026-06-20 · #743

> Opprettar du best ball for fire kompiser, sier veiviseren nå «2, 4, 6 eller 8 spillere» — ikke «8 spillere» som var feil og sperret.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/[locale]/signup/[shortId]/team/TeamDashboardClient.tsx`: erstattet `setTimeout(() => window.location.reload(), 500)` med `router.refresh()` (import fra `@/i18n/navigation` for locale-prefiks). Dropper 500ms-forsinkelsen — `router.refresh()` er synkron i Next.js RSC-arkitekturen og trigges inni `useTransition`. Eksisterende 3 tester passerer uendret. (#767)

</details>

### [1.133.25] - 2026-06-20 · #768

> «Send ny kode» sender nå koden med én gang du trykker — ingen retur til e-postskjemaet og ekstra knappetapp.
### [1.133.24] - 2026-06-20 · #766

> Lurer du på om innloggingskoden er på vei? Du får nå et hint om å sjekke søppelposten, rett under e-postadressen.
- `AppVersionFooter` er konvertert til `'use client'`-komponent med `useTranslations('legal.privacy')` — gjenbruker eksisterende `kicker`-nøkkel («Personvern» / «Privacy»). Null ny nøkkel nødvendig. (#761)

</details>

### [1.133.23] - 2026-06-20 · #748

> Glemmer du å fylle ut ett felt i profilskjemaet, mister du ikke alt du allerede har skrevet. Navn, kallenavn, handicap og kjønn er der igjen når du prøver på nytt.
- Byttet `min-h-[42px]` → `min-h-[44px]` i `SegmentedField.tsx:56` — oppfyller intern 44 px-norm for trykkmål på delt UI-primitiv. (#771)

</details>

### [1.133.22] - 2026-06-20 · #765

> Tastaturet spretter opp med én gang du åpner innloggingssiden. Ingen unødvendig tapping for å komme i gang.

<details>
<summary>Teknisk</summary>

#### Fixed
- La til `autoFocus` på e-post-`<Input>` i `SendCodeForm.tsx`, slik at trinn 1 i innloggingsflyten matcher trinn 2 (kodefeltet har hatt `autoFocus` siden starten). Skjemaene vises aldri samtidig, så ingen fokusskollisjon er mulig. (#765)

</details>

### [1.133.21] - 2026-06-20 · #739

> iOS korrigerer ikke lenger e-postadressen din når du logger inn. Skrivefeil som ola@gnail.com forblir akkurat slik du tastet dem.

<details>
<summary>Teknisk</summary>

#### Fixed
- La til `autoCapitalize="none"`, `autoCorrect="off"` og `spellCheck={false}` på e-post-`<Input>` i `SendCodeForm.tsx`. iOS Safari kan ellers autokorrigere local-part eller domene til noe annet — f.eks. `gnail.com` → `gmail.com` — som sender kode til feil innboks uten at brukeren aner det. Ren HTML-attributt-endring, ingen logikk. (#739)
- Offentlig cup-side (`cup/[id]/page.tsx`) brukte hardkodet engelsk: overskriften «Matches», telleren «{n} av {m} matches spilt» og tom-tilstand-teksten «Ingen matches er opprettet ennå.». Lagt til `getTranslations('cup')` og hentet inn `manage.matchesHeading` for overskriften; to nye nøkler `public.matchesSummary` og `public.noMatches` i `messages/no.json` + `messages/en.json` for teller og tom-tilstand. Singularis-/flertallsgreina (`match`/`matches`) er borte — nøkkelen dekker begge. IKKE rørt `m.matchLabel ?? 'Match'` (l.176, DB-drevet golf-term, bevisst uendret per issue). (#747)
- `home.emptyKicker` endret fra «KLUBBHUSET ER ÅPENT» til «KLAR FOR FØRSTE RUNDE» (no) / «READY FOR YOUR FIRST ROUND» (en) — fjerner duplikat-ekko mot body og knapp. (#775)
- `app/[locale]/klubber/page.tsx`: kontakt-`Card` dempes til en diskret linje (`text-sm text-muted`) når `clubs.length > 0`; full CTA bevares i tom-tilstand. Ny nøkkel `klubb.list.ctaDiscrete` i begge kataloger. (#775)
- Hardkodet `«{n} leverte ikke»` og `«{n} venter»` på scorekort-raden i `admin/games/[id]/page.tsx` erstattet med `tRows('notSubmittedFinished')`/`tRows('notSubmittedWaiting')` (ICU plural). (#750)
- Hardkodet `'(ukjent bane)'` i spill-listen (`admin/games/page.tsx`) erstattet med `t('unknownCourse')`. (#750)
- Nye nøkler lagt til i `admin.game.rows` (`notSubmittedWaiting`, `notSubmittedFinished`) og `admin.games` (`unknownCourse`) i no.json + en.json. (#750)
- `lib/clubs/getClubDetail.ts`: la til `message` i SELECT på `group_join_requests` og i `PendingJoinRequest`-typen (additiv optional `message: string | null`). `app/[locale]/klubber/[id]/page.tsx`: rendrer hilsenen betinget som `break-words`-linje under dato i forespørsels-kortet. Ingen skjema-/RLS-endring — kolonne finnes allerede (0075) og admin-klienten leser raden i sin helhet. (#741)
- `wizard.stepSubText.step4BestBall` i no.json og en.json rettet til å liste opp alle gyldige antall (2/4/6/8) i stedet for å si «8 spillere» alene — falsk blokkering for små gjenger. (#743)
- `inbox.kinds.registrationRejected.title` endret fra «Søknad til {gameName}» til «Du kom ikke med i {gameName}» i `messages/no.json`; tilsvarende engelsk nøkkel oppdatert i `messages/en.json`. (#757)

</details>

### [1.133.20] - 2026-06-20 · #731

> Vi tettet et hull i databasen der en innlogget bruker i teorien kunne gitt seg selv admin-tilgang. Du merker ingenting når du spiller. Dette er sikkerhets-herding under panseret.

<details>
<summary>Teknisk</summary>

#### Security
- En adversarial RLS hostile-PATCH-sweep (mot staging-speilet, bekreftet read-only mot prod) avdekket at flere UPDATE-policyer pinner rad-eierskap men ikke hvilke kolonner som endres. En direkte PostgREST-PATCH kunne dermed skrive privilegerte felt forbi alle server-action-guards. Ny migrasjon `0107_harden_rls_column_immutability.sql` legger til BEFORE-UPDATE-triggere (samme mønster som det eksisterende `guard_game_players_self_update`): `users.is_admin` kan ikke self-promotes (kritisk: vertikal privilegie-eskalering fra hvilken som helst konto, 17 prod-brukere var eksponert), `game_players.team_number`/`flight_number` kan ikke self-reassignes (flight driver peer-approval via `can_score_for`), invitéen kan kun flippe `invitations.accepted_at` (forfalsket `invited_by` lurte ellers `befriend_inviter`), og forespørrer kan ikke skrive beslutnings-audit på `group_join_requests`. Alle bypasser service-role (`auth.uid()` null) og global admin (`is_admin()`). Verifisert live: alle fire angrep blokkeres nå (`42501`) og alle legitime flyter virker uendret, på både staging og prod (kritisk #1 bevist i prod med en efemer syntetisk bruker, rullet tilbake). pgTAP-regresjon lagt til for `users.is_admin` + `game_players` team/flight; resterende dekning i #732. Frittstående cup/liga-lesbarhet for alle innloggede ble vurdert og bevisst beholdt (dokumentert design i 0083/0089). (#731)

</details>

### [1.133.19] - 2026-06-20 · #726

> Når du åpner resultattavla eller godkjenner et scorekort, forsvinner varselprikken igjen slik den alltid skulle.

<details>
<summary>Teknisk</summary>

#### Fixed
- `markNotificationsRead` (`lib/notifications/markRead.ts`) hentet en cookies-basert Supabase-klient via `getServerClient()`, men ble kalt inni `after()` på fire sider (`/games/[id]/leaderboard`, `/approve`, game-home og admin-protokollen). Next.js 16 forbyr `cookies()` inni en `after()`-callback, så hele callbacken kastet stille — varselet ble aldri markert lest og `revalidateTag(`notifications-${userId}`)` fyrte aldri, så bell-prikken ble hengende selv etter at brukeren åpnet siden (#726). Byttet til `getAdminClient()` (service-role, cookies-fri), som speiler `maybeAutoConfirmParticipation` som allerede løser samme problem i samme `after()`. Authz er uendret: update-en er fortsatt scopet `.eq('user_id', userId)`, og hver caller utleder `userId` server-side (`getProxyVerifiedUserId`) — aldri klient-levert. RLS-policyen `notifications_update_own` blir stående og garderer fortsatt den offentlige PostgREST-flaten. Issuet navnga to ruter; rot-fixen reparerer alle fire uten call-site-endring. (#726)

</details>

### [1.133.18] - 2026-06-19 · #721

> Setter du en spiller til junior eller dame, men den valgte tee-en mangler rating for den kategorien, blir kategorien nå utilgjengelig i veiviseren. Slik slipper du å planlegge en runde som ikke får startet.

<details>
<summary>Teknisk</summary>

#### Fixed
- I opprett-spill-veiviseren kunne en spiller settes til en kategori (M/D/J) den valgte tee-en manglet rating for (f.eks. junior på en tee med kun herrerating), så banehandicap ikke kunne regnes ut og auto-start (#502) feilet med `tee_missing_rating` etter planlagt tee-tid. M/D/J-velgeren (`TeamsAssignmentSection`, ekstrahert til delt `PlayerGenderToggle`) disabler nå kategorier `teeGenderAvailability` ikke dekker, og `setTeeBoxId` klemmer hver spillers kategori til en tilgjengelig en ved tee-bytte (ren, testet `clampGenderToTee`). Defensiv backstop i `canPublish`/`missingForPublish`. Nye i18n-nøkler (no + en). Ingen server-side endring — scoring-laget (`getRatingForGender`) håndterte allerede manglende rating pent; dette er forebyggende UX. (#721)

</details>

### [1.133.17] - 2026-06-19 · #698

> Når noen ber om å bli med i et spill du arrangerer, dukker forespørselen opp igjen på påmeldingssiden, med hilsenen de skrev. Den forsvant i en stille databasefeil, så lista sto tom selv om forespørselen var sendt.

<details>
<summary>Teknisk</summary>

#### Fixed
- Påmeldings-fanen (`/admin/games/[id]/signups`) hentet `game_registration_requests` med en `users(...)`-embed som var tvetydig: tabellen har to FK-er til `users` (`user_id` = forespørreren, `decided_by_user_id` = admin som avgjorde), så PostgREST returnerte `PGRST201` og hele fetchen feilet. Feilen ble logget, men svelget (`rawRequests ?? []`), så fanen viste null forespørsler selv når det fantes ventende. Fikset ved å pinne FK-en eksplisitt: `users!game_registration_requests_user_id_fkey(...)`. Avdekket av e2e-gaten (#698), der `manual_approval`-spec-en feilet fordi admin ikke så hilsenen. (#698)

</details>

### [1.133.16] - 2026-06-17 · #685

> Åpner du en lenke til et privat lag-spill du ikke er invitert til, får du nå en knapp tilbake til forsiden i stedet for å stå fast på en melding uten vei videre.

<details>
<summary>Teknisk</summary>

#### Fixed
- På `/signup/[shortId]` for et `invite_only` lag-spill viste en uinvitert besøkende et statisk banner uten knapp eller vei videre (`page.tsx`), mens solo-varianten fikk en «be om plass»-form i #368. `invite_only` er den private modusen, så en uinvitert kan ikke melde seg på selv — det er meningen (eier-beslutning: privat → minimal). Banneret forklarer allerede at man må be arrangøren invitere laget; fiks legger til en «Til forsiden»-knapp (gjenbruker `notFoundButton`) så blindveien blir navigerbar. Ingen backend/RLS/ny copy. (#685)

</details>

### [1.133.15] - 2026-06-17 · #663

> Cup-veiviseren kan nå faktisk lage greensome-, chapman- og gruesome-kamper, ikke bare four-ball, foursomes og singel. Og gir en kombinasjon ingen kamper, forklarer veiviseren hvorfor i stedet for å gråne ut «Neste» uten et ord.

<details>
<summary>Teknisk</summary>

#### Fixed
- Bulk-generatoren (`CupSessionFormat`, `lib/cup/cupTemplates.ts`) støttet bare 3 formater, men cup-opprettelse lot admin huke av greensome/chapman/gruesome som cup-kvalifiserte — for klubb-cuper (kun generator tilgjengelig) kunne de aldri genereres. Eier-ratifisert: utvid generatoren (formatene er 2-spiller-lag-matchplay som foursomes; scoring-laget håndterte dem allerede, og allowance-kolonnene fantes fra 0063/0064/0065). `CupSessionFormat` utvidet til 6; alle uttømmende `Record`-er + «Tilpasset»-`<select>` oppdatert; `cupMatchModeConfig` ruter hvert format til sin allowance (greensome 100 / chapman 100 / gruesome 50); `CupSetup` fikk allowance-felt + parse/persist i `createTournamentDraft`/`updateTournament`. Gjenbruker eksisterende 2-spiller-paringslogikk (`playersPerSide === 2`) — ingen ny algoritme, ingen skjema-endring.
- Steg 3 i veiviseren grået ut «Neste» uten forklaring når en format/lag-kombinasjon ga 0 kamper. Viser nå en inline-melding («Valgt format krever minst 2 spillere per lag») i stedet, etter samme mønster som steg 1. Nye i18n-nøkler (no + en); tester utvidet. (#663)

</details>

### [1.133.14] - 2026-06-17 · #704

> Når en medspiller godkjenner scorekortet ditt, blir det nå faktisk godkjent. Før kunne appen si «godkjent» mens ingenting ble lagret, så runden aldri lot seg avslutte.

<details>
<summary>Teknisk</summary>

#### Fixed
- Peer-godkjenning (`approveScorecard`/`rejectScorecard`, `app/[locale]/games/[id]/approve/actions.ts`) var stille knekt: en samme-flight-spiller som verken er admin eller skaper traff ingen `game_players` UPDATE-policy, så skrivingen rammet 0 rader. Supabase returnerer `error == null` på en 0-rads-UPDATE, så appen rapporterte falsk suksess + sendte godkjennings-varsel mens `approved_at` aldri ble satt — og spillet kunne aldri avsluttes (`not_all_approved`). Fiks (eier-ratifisert: behold peer-godkjenning, utvid RLS trygt): migrasjon `0106` legger til en permissive UPDATE-policy gated på den eksisterende `can_score_for`-helperen (0095, SQL-tvilling til `peersForApproval`) + utvider guard-triggeren `guard_game_players_self_update` (0103/#670) med en allowlist så en ikke-admin-peer KUN kan endre godkjennings-kolonnene (`approved_at`/`approved_by_user_id`/`rejection_reason`/`submitted_at`) på en annens rad — ikke handicap, lag eller flight. Admin og spillets skaper (også ikke-admin trusted/klubb-skaper) beholder full roster-tilgang: triggeren no-op-er eksplisitt for dem, så skaperens handicap-/lag-/flight-redigering virker uendret. `approveScorecard`/`rejectScorecard` sjekker nå rader-rammet via `.select()` og rapporterer ikke suksess / sender ikke varsel på en 0-rads-skriv. pgTAP-test i `supabase/tests/`. Migrasjon `0106` applikert til prod via MCP, atferd verifisert i rullet-tilbake txn (peer godkjenner ✓, peer-handicap blokkert ✓, skaper-handicap ✓, kryss-flight blokkert ✓). (#704)

</details>

### [1.133.13] - 2026-06-17 · #676, #481

> Blir du invitert på e-post til et lag og melder deg på, blir du nå automatisk venn med den som inviterte deg, akkurat som når du melder deg på et spill alene.

<details>
<summary>Teknisk</summary>

#### Fixed
- Følgefiks til #676: `befriend_inviter`-RPC-en (#481) gateres på en akseptert invitasjon og ble kun kalt fra `verifyCode`. Siden #676 nå lar lag-scopede invitasjoner (`'team'`/`'both'`) stå pending ved innlogging, no-op-et auto-vennskapet for e-postinviterte medspillere — en regresjon for `'team'`-stien (som tidligere fikk vennskap via det ubetingede `accepted_at`-flippet). `attachToCaptainTeam` (`app/[locale]/signup/[shortId]/teamActions.ts`) kaller nå `befriend_inviter` i bruker-konteksten rett etter at den setter `accepted_at`, så vennegrafen vokser når medspilleren faktisk blir med på laget. Best-effort, idempotent RPC uendret. Funnet av evaluator under #676-gjennomgangen. (#676, #481)

</details>

### [1.133.12] - 2026-06-17 · #688

> Taster to mobiler samme hull samtidig, mister du ikke lenger tallet ditt i det stille. Og blir tallet til en medspiller gjeldende, sier appen fra med en kort melding i stedet for at tallet bare bytter seg ut.

<details>
<summary>Teknisk</summary>

#### Fixed
- **Tie-håndtering (korrekthet)** — `writeScore` stemplet `new Date().toISOString()` (ms-oppløsning), mens server-RPC-en (`0073`) kun skriver på strikt `>` og realtime/catch-up holder lokalt på `>=`. På en ms-kollisjon (dobbel-fyr, replayet kø, to enheter) avviste RPC-en og `syncWorker` overskrev lokalt tall stille. `writeScore` garanterer nå strengt økende `clientUpdatedAt` per `(gameId, userId, holeNumber)` (leser eksisterende Dexie-rad først, bumper +1 ms ved kollisjon). `resolveConflict` (`lib/sync/conflict.ts`, tidligere dead code) er wiret inn i `syncWorker` server-wins-grenen: `'equal'`/`'local-wins'` holder lokalt i stedet for å overskrive. RPC-en (`0073`) og realtime-`>=` urørt. TDD: rød-så-grønn.
- **Synlig konflikt-varsel (#688 Del 2)** — server-wins-grenen overskrev lokalt tall uten noe signal. Ny Dexie `conflicts`-tabell (versjon 2-oppgradering, databasenavnet `'golf-app'` bevart) får en rad når serveren vinner *og* lokalt tall var tastet av brukeren selv *og* tallet faktisk endret seg. `SyncBanner` viser en kort melding per konflikt (`SyncBanner.conflictNotice`, no + en) som lukkes ved trykk. Last-write-wins uendret — kun åpenhet. (#688)

</details>

### [1.133.11] - 2026-06-17 · #676

> Inviterer en lagkaptein en medspiller på e-post til et spill der man både kan melde seg på alene og som lag, havner medspilleren nå riktig på laget i stedet for som en løs solo-spiller uten vei tilbake.

<details>
<summary>Teknisk</summary>

#### Fixed
- `verifyCode` (`app/[locale]/(auth)/login/actions.ts`) behandlet kun `registration_type === 'team'` som lag-scopet. På et `'both'`-spill ble en e-postinvitert medspiller derfor auto-lagt inn som solo-rad i `game_players`, og invitasjonens `accepted_at` ble konsumert — som ødela signalet `/signup/[shortId]/team` bruker for å tilby «Bli med på lag», så medspilleren endte i `teamDashNoTeamBanner`-blindveien. Fiks: lag-scopet = `'team'` **eller** `'both'` (ingen solo-insert for disse), `accepted_at`-flippet hopper nå over lag-scopede invitasjoner (id-skopet `.in('id', …)` i stedet for blank flip-alle), og en entydig lag-scopet invitasjon ruter til `/signup/[shortId]/team`. `attachToCaptainTeam` konsumerer invitasjonen når spilleren faktisk blir med. Solo-invitasjoner og klubb-/venne-invitasjoner uendret. Ingen migrasjon. Co-located tester. (#676)

</details>

### [1.133.10] - 2026-06-17 · #705

> Hvis en e-postinvitasjon til et spill ikke går igjennom, rydder appen nå trygt bort bare den invitasjonen som feilet, uten å røre andre invitasjoner til samme adresse.

<details>
<summary>Teknisk</summary>

#### Fixed
- Den kompenserende rollback-deleten i `inviteEmailToGame` (`app/[locale]/admin/games/[id]/inviteToGameActions.ts`, lagt til i #686) matchet på `email + game_id + accepted_at IS NULL` i stedet for rad-id. I et samtidighets-scenario kunne en andre pending-invitasjon for samme adresse bli slettet sammen med den som feilet. INSERT-en returnerer nå rad-id-en (`.select('id').single()`), og rollback-deleten er skopet med `.eq('id', …)` — den rører kun raden den selv opprettet. Happy-path og best-effort-mail uendret. Partial-unique-index-herdingen (issue-alternativ 2) er utenfor scope. Co-located test. (#705)

</details>

### [1.133.9] - 2026-06-17 · #661

> Melder du deg på et fullt Wolf-, Nines- eller Skins-spill, får du nå beskjed om at det er fullt med en gang, i stedet for å bli strandet uten plass når runden settes i gang.

<details>
<summary>Teknisk</summary>

#### Fixed
- Selv-påmeldingsstien (`registerForOpenGame`, `app/[locale]/signup/[shortId]/actions.ts`) håndhevet ikke noe spillertak for solo-format med øvre grense (Wolf 5, Nines 3, RoundRobin 4, Acey-Deucey 4, Skins/Nassau/Bingo-Bango-Bongo 16), så en spiller kunne melde seg på utover taket og bli strandet ved publisering. Ny `soloPlayerCap(gameMode)` i `lib/wizard/fitsPlayerCount.ts` utleder samme tak som `fitsPlayerCount`; `registerForOpenGame` kjører nå en pre-insert tell-sjekk og returnerer den eksisterende `game_full`-feilkoden (var dead code, allerede oversatt i begge kataloger). Ingen post-insert race-vakt for disse formatene siden de bruker `team_number = null` (ingen slot-konkurranse), og `buildInsertPayload` er fortsatt den harde porten ved publisering. Test-først. (#661)

</details>

### [1.133.8] - 2026-06-17 · #681, #678

> Par-asterisken på hull-siden og resultatlista viser nå riktige kjønnsetiketter på engelsk. Og en cup-kamp som venter på start forteller spilleren at arrangøren starter kampen, i stedet for å love et tee-off-tidspunkt som ikke finnes.

<details>
<summary>Teknisk</summary>

#### Fixed
- **#681** — `formatOtherGendersPar` (`lib/games/parDisplay.ts`) hadde hardkodede norske kjønns-etiketter, så par-asterisken viste «Herrer/Damer/Junior» også på engelsk locale, og helperen var duplisert i flere kall-steder. La til en valgfri `labels`-param (bakoverkompatibel) og flyttet etikettene til message-katalogen (`leaderboard.holes.parGender*` i `no.json` + `en.json`); `components/hole/HoleHero.tsx` og leaderboard-`holes/page.tsx` sender nå oversatte etiketter via `useTranslations`. De tre `ParAsideInline`-kopiene i submit/approve/scorecard brukte allerede riktig i18n-mønster og ble ikke rørt (ren dedup av dem utsatt). (#681)
- **#678** — En cup-kamp i `scheduled`-status uten satt tee-off-tid viste overskriften «Scorekortet åpner ved tee-off» — en blindvei, for det finnes ingen tee-off-tid å vente på. Game-home viser nå «Scorekortet åpner når arrangøren starter kampen» (ny nøkkel `game.home.scorecardOpensWhenOrganizerStarts`) når tee-off mangler. Minimal copy-fiks, ingen ny backend. (#678)

</details>

### [1.133.7] - 2026-06-17 · #687

> Liga-runder viser nå riktig dato og åpner på norsk midnatt, ikke en time på skjeve. En månedlig runde starter ved midnatt den 1. og stenger 23:59 siste dag i måneden, slik arrangøren forventer.

<details>
<summary>Teknisk</summary>

#### Fixed
- `lib/league/generateRounds.ts` forankrer nå rundevinduer til Europe/Oslo via `parseOsloDateTimeLocal` (samme mønster som #648-stiene): månedlig stepper Oslo-kalendermåned, ukentlig/annenhver re-forankrer hvert vindu til Oslo midnatt (DST-stabilt), i stedet for den gamle UTC-cursoren (`…T00:00:00.000Z` / `Date.UTC(…,23,59,…)` / `getUTCMonth`). Ny `formatShortOsloDateWithYearLocale` i `lib/i18n/format.ts` (Oslo-pinnet søsken av den eksisterende formatteren); begge `fmtWindow`-kopiene (`liga/[id]/page.tsx` + `liga/[id]/runde/[roundId]/spill/page.tsx`) og måned-previewen i `CreateLigaForm` formaterer nå i Oslo-tid i stedet for UTC. Gating-semantikk (`windowStatus`, `startLeagueRoundFlight`) er urørt — ren tz-korreksjon. TDD: failing test først (Oslo-forankrede vindus-grenser for sommer/CET-vinter/ukentlig). (#687)

</details>

### [1.133.6] - 2026-06-17 · #689

> Du kan nå opprette en cup selv om du ikke huker av et match-format i lista. Valget var uten effekt, og det skal ikke stå i veien for å komme i gang.

<details>
<summary>Teknisk</summary>

#### Fixed
- `CupSetup.tsx` blokkerte «Opprett cup» på et format-valg (`atLeastOneFormat`) som verken ble lagret eller håndhevet nedstrøms: `createTournamentDraft` (`lib/cup/actions.ts`) leser ikke noe format-felt, og kolonnen finnes ikke i `tournaments`-tabellen. Fjernet den døde guarden (den avledede variabelen, feil-paragrafen og `disabled`-betingelsen på submit-knappen). Knappen er nå klikkbar så snart de obligatoriske feltene (navn, lagnavn, poengmål) er fylt ut. Co-lokalisert test oppdatert til å verifisere at knappen ikke er deaktivert når ingen format er huket av. (#689)

</details>

### [1.133.5] - 2026-06-17 · #660

> Når en klubb er full, blokkeres godkjenning av innmeldingsforespørsler. Ventende invitasjoner teller nå med i plasstaket, akkurat som når du legger til noen på e-post, så klubben kan ikke lenger sprenge taket sitt.

<details>
<summary>Teknisk</summary>

#### Fixed
- Migrasjon `0105`: `CREATE OR REPLACE` av `decide_join_request` (definert i 0076). Eneste endring er cap-tellingen i approve-grenen: den teller nå aktive medlemmer pluss åpne `club_invitations` (ikke-godtatte, ikke-utløpte), i stedet for kun medlemmer. Uten dette kunne en klubb overstige `member_cap` ved å godkjenne innmeldingsforespørsler mens invitasjoner fortsatt lå ute. Formelen speiler `add_club_member_by_email` (0099). All annen logikk (signatur, `SECURITY DEFINER`, `search_path = ''`, utløps-sjekk, retur-koder) er bevart verbatim; UI-laget håndterer allerede `club_full`-retur, så ingen kodeendring. (#660)

</details>

### [1.133.4] - 2026-06-17 · #671

> Ikke-innloggede kan ikke lenger sjekke om en e-postadresse har en konto. Oppslaget er nå låst til innloggede brukere. Du merker ingen forskjell i appen.

<details>
<summary>Teknisk</summary>

#### Security
- Migrasjon `0104`: `REVOKE EXECUTE ... FROM anon` på `email_is_in_auth_users` (definert i 0017), som ga anonyme klienter et e-post-enumererings-orakel via PostgREST. Begge callere (`invite/actions.ts`, `admin/spillere/[id]/actions.ts`) er authenticated-only server-actions, så `authenticated`-grant-en er bevart. `email_is_invited`-grant-en til `anon` er bevisst bevart — den er `shouldCreateUser`-gaten i den pre-login `sendCode`-stien, og en revoke ville brutt innlogging.
- La til `SET search_path = public, pg_catalog` på de fem RLS-helperne som manglet det (`is_admin`, `same_flight`, `is_in_game`, `can_score_for`, `same_flight_or_solo`) via `CREATE OR REPLACE` med byte-identiske kropper, så de ikke lar seg lure av en manipulert `search_path`. Ny pgTAP-test `supabase/tests/security_definer_hardening_test.sql` (catalog-assertions, ingen seed). Appen er funksjonelt uendret for alle brukere. Funnet i helse-auditen 2026-06-17. (#671)

</details>

### [1.133.3] - 2026-06-17 · #684

> Nassau rangerer nå spillere riktig når ikke alle hull er spilt. Den som fullførte runden ryker ikke lenger bak en som spilte færre hull og dermed fikk en lavere rå sum.

<details>
<summary>Teknisk</summary>

#### Fixed
- Nassau-tiebreakeren brukte en rå effektiv-slag-delsum (`total18EffectiveStrokes`), som belønnet å ha spilt færre hull (færre hull gir lavere rå sum). Byttet til padded seksjonrang (`total18SectionRank`, der uspilte hull rangerer 999) i både sorterings-komparatoren og rank-tildelingen i `lib/scoring/modes/nassau.ts`. Nytt felt `total18SectionRank` på `NassauUnitLine` (`lib/scoring/modes/types.ts`); `total18EffectiveStrokes` beholdes som display-felt så UI-flatene står urørt. Fixture-builders i tre leaderboard-tester fikk det nye feltet (ingen logikk-endring). Test-først per scoring-disiplinen. (#684)

</details>

### [1.133.2] - 2026-06-17 · #677

> Stableford-ligaen regner nå dame- og juniorpoeng mot riktig par for tee-en de spiller fra. Sesongtabellen blir dermed rettferdig i blandede ligaer, der herre-par tidligere ble brukt for alle.

<details>
<summary>Teknisk</summary>

#### Fixed
- `lib/league/getLigaSnapshot.ts` satte `par: h.par_mens` for alle spillere, så dame- og juniortee fikk feil stableford-poeng på hull der paret deres avviker fra herre-par. Vanlig-spill- og flight-start-stiene var allerede rettet (#647), men ligasnapshotet hadde drevet fra. Bygger nå `parByGender` (`{ mens, ladies, juniors }`) fra de allerede SELECT-ede per-kjønn-kolonnene og sender det videre til `computeFlightRoundValues`, der `parFor()` plukker riktig variant per spillers tee. Ren mapping, ingen ny DB-spørring. Kun stableford- og modifisert-stableford-ligaer var rammet; slagspill og cup var aldri det. (#677)

</details>

### [1.133.1] - 2026-06-17 · #703

> Ligatabellen lar ikke lenger en spiller som aldri stilte til start snike seg inn på den aktive lista i Beste-N-ligaer. De står utenfor rangeringen til de spiller sin første runde, akkurat som i de andre poengmodellene.

<details>
<summary>Teknisk</summary>

#### Fixed
- `best_n`-grenen i `lib/league/computeLeagueStandings.ts` brukte fortsatt en svakere global guard (`candidates.length === 0`), mens `total`-, `average`- og `points`-grenene etter #664 markerer hver spiller som uranket når `roundsPlayed === 0`. I en Beste-N-liga kunne derfor en spiller som aldri stilte til start havne på den aktive lista med en straffeverdi. Byttet til samme per-spiller-guard, så atferden er lik på tvers av alle fire poengmodellene. To eksisterende tester kodet det gamle (gale) utfallet og ble korrigert; den lovlige penalty-fill-stien (spilte minst én, men færre enn N, runder) er bevart i egen test. (#703)

</details>

### [1.133.0] - 2026-06-17 · #679

> Resultatlista oppdaterer seg nå av seg selv mens medspillerne taster, uansett spilleform. Følger du en stableford-, skins-, wolf- eller hvilken som helst annen runde live, ser du tallene oppdatere seg så snart noen i flighten taster en score. Det samme gjelder «Hull for hull».

<details>
<summary>Teknisk</summary>

#### Added
- Ny `'use client'`-komponent `LeaderboardRealtime` (`app/[locale]/games/[id]/leaderboard/LeaderboardRealtime.tsx`) som abonnerer på `scores`-INSERT for spillet via den eksisterende `subscribeRealtimeChannel`-helperen (`lib/sync/realtimeChannel.ts`) og kaller `useRouter().refresh()` med 300 ms debounce, så et helt scorekort levert samtidig kollapser til én refresh. Helperen eier `supabase.realtime.setAuth()`-quirken (JWT må settes eksplisitt før `subscribe()`) og lekk-resistent opprydding — gjenbrukt verbatim, ikke gjenoppfunnet.
- Montert én gang i `LeaderboardChrome` (`LeaderboardShell`, begge grener) så alle ~14 format-visningene arver live-refresh uten å røre de 19 visnings-filene. Per-hull-siden (`leaderboard/holes/page.tsx`) rendrer ikke gjennom `LeaderboardShell`, så den får egen montering via en `withRealtime`-wrapper rundt alle 10 grenene, gatet på `game.status === 'active'`.
- Spill-ID leses fra prop med fallback til `window.location.pathname` (bevisst ikke `useParams`, som ville sprengt eksisterende view-tester som kun mocker `useRouter`). Avvik fra issue-skissen: avsluttede podier rendrer også gjennom `LeaderboardShell` og får et inert (effektløst) abonnement siden shellen ikke kjenner spill-status — et avsluttet spill produserer ingen `scores`-INSERT, så socketen er stille. Per-hull-siden har ekte status-gate. Én co-located behavior-test; hele `leaderboard/`-suiten grønn. (#679)

</details>

## 1.132.y — Småfunn fra modus-gjennomgangen

Issue [#640](https://github.com/jdlarssen/golf-app/issues/640). En samling småfunn fra den visuelle gjennomgangen av spillemodiene: banehandicap som manglet før start, en dobbel-tall-typo i veiviseren, lag-påmelding for alle lag-format, og at norske brukere ikke lenger uventet havner på engelsk.

### [1.132.15] - 2026-06-17 · #670

> Scorekortet ditt må fortsatt godkjennes av en medspiller eller arrangøren. Du kan ikke lenger snike inn en godkjenning på ditt eget kort, og handicapet for runden er låst når spillet er i gang, så ingen kan justere sitt eget tall for å klatre på resultatlista.

<details>
<summary>Teknisk</summary>

#### Fixed
- RLS-policyen `game_players self submit` (`0092`, uendret siden `0002`) gatet kun på `is_admin() OR user_id = auth.uid()` uten kolonne-restriksjon, så en innlogget spiller kunne sende en rå PostgREST-`PATCH` mot sin egen `game_players`-rad og skrive hvilken som helst kolonne — inkludert å sette `approved_at`/`approved_by_user_id` (selv-godkjenne kortet sitt forbi peer/admin-flyten) eller senke `course_handicap` (som mater netto-resultatlista via `getGameWithPlayers`). App-laget gjorde det rette, men RLS var eneste backstop og var vidåpen. Migrasjon `0103` legger til en `BEFORE UPDATE`-trigger `guard_game_players_self_update` (`SECURITY DEFINER`, `search_path = ''`) som for en ikke-admin aktør avviser å sette `approved_at`/`approved_by_user_id` på EGEN rad, og å endre `course_handicap` på egen rad etter at spillet er startet (`status in ('active','finished')`). Trigger framfor kolonne-`GRANT`/`WITH CHECK` fordi peer-godkjenning (`approveScorecard`) skriver `approved_at` på en ANNENS rad via bruker-klienten — en kolonne-grant kan ikke skille egen-rad fra annens-rad, og `WITH CHECK` ser ikke OLD vs NEW. Triggeren no-op-er for admin (`is_admin()`) og service-rolla (`auth.uid()` er NULL), så `submitScorecard`, peer-godkjenning, admin-handicap-justering, `startGame` og signup står urørt. Ny pgTAP-suite `supabase/tests/game_players_update_rls_test.sql` (8 asserts) speiler `scores_write_rls_test.sql` og beviser de to forbudte PATCH-ene avvises mens de lovlige stiene passerer. Funnet i helse-audit 2026-06-17. (#670)

</details>

### [1.132.14] - 2026-06-17 · #664

> En spiller som aldri stilte til start i en ligarunde vises ikke lenger som «aktiv» i sesongtabellen — de plasseres utenfor rangeringen til de spiller sin første runde.

<details>
<summary>Teknisk</summary>

#### Fixed
- I `computeLeagueStandings` (`lib/league/computeLeagueStandings.ts`) manglet `total`-grenen en guard for spillere med `roundsPlayed === 0`. Med `pointsBased=true` (stableford) returnerer `penaltyForRound` 0 for uteblitte runder, så en spiller som aldri møtte opp akkumulerte `sum=0` og fikk `ranked=true` — semantisk identisk med en spiller som faktisk spilte og scoret 0 poeng. Lagt til `if (roundsPlayed === 0) ranked = false` i `total`-grenen, som speiler den eksisterende guard-en i `average`-, `best_n`- og `points`-grenene. Gjelder også slagspill (`pointsBased=false`) for konsistens, selv om verdien der (`worst+1 > 0`) skiller tilfellene verdimessig. (#664)
- Ny Type A-test skiller «aldri spilt» (`ranked=false`) fra «spilte og scoret 0 stableford» (`ranked=true`). Eksisterende test oppdatert til å assertere korrekt `ranked=false` for en penalty-kalkylert aldri-spilt slagspiller.

</details>

### [1.132.13] - 2026-06-17 · #686

> Hvis varslings-mailen feiler første gang du inviterer noen til et spill, kan du nå sende på nytt til samme adresse. Invitasjonen blir ikke liggende låst. Og prøver du en adresse som allerede er invitert, sender appen meldingen en gang til, så ingen blir hengende uten beskjed.

<details>
<summary>Teknisk</summary>

#### Fixed
- `inviteEmailToGame` i `app/[locale]/admin/games/[id]/inviteToGameActions.ts` inserterte `invitations`-raden og sendte så Resend-mailen som to uavhengige trinn. Kastet `sendInviteNotification`, redirectet acsjonen til `?error=mail_failed` uten å rydde opp — raden ble liggende. Neste gang admin prøvde samme adresse, fant idempotent-sjekken raden og redirectet til `?status=invite_sent` uten mail; invitéen ble strandert uten mulighet til retry.
- Fix A (primær): i `catch`-blokken, før redirect til `?error=mail_failed`, slettes den nettopp inserterte raden (`supabase.from('invitations').delete().ilike('email', rawEmail).eq('game_id', gameId).is('accepted_at', null)`). Slette-feil logges og avbrytes taust — flowet til `?error=mail_failed` er allerede riktig.
- Fix B (superset): i `if (existingInvite)`-grenen (idempotent short-circuit) sendes nå mailen best-effort før redirect til `?status=invite_sent`. Fanger opp tilfeller der mailen aldri ble levert av en annen grunn — retry-handlingen til admin har nå alltid effekt.
- To nye tester i `inviteToGameActions.test.ts` dekker de nye stiene (rollback-delete ved mail-feil + re-send i idempotent-grenen); den eksisterende «idempotent»-testen ble oppdatert til Fix B. (#686)

</details>

### [1.132.12] - 2026-06-17 · #683

> Pluss-handicap under -18 fordelte slag feil — spillere med handicap -20 eller lavere fikk feil nettoscore. Matematikken er nå riktig uansett handicap.

<details>
<summary>Teknisk</summary>

#### Fixed
- `strokesForHole` i `lib/scoring/strokeAllocation.ts` capper ikke lenger pluss-grenen på -18. Erstatter `threshold = 18 - abs + 1`-logikken med samme multi-runde-mønster som positiv grenen: `base = Math.floor(abs/18)` slag på alle hull, pluss ett ekstra slag på de `remainder = abs % 18` vanskeligste (høyest SI). Et handicap på -20 gir dermed -1 på alle 18 hull og ytterligere -1 på SI 17 og 18 (sum = -20). Inkluderer `strokes === 0 ? 0 : -strokes` for å unngå `-0` i JavaScript. (#683)
- Ni nye tester i `lib/scoring/strokeAllocation.test.ts` dekker HCP -18/-19/-20/-24/-36 — både per-hull-fordeling og allStrokeAllocations-summer.

</details>

### [1.132.11] - 2026-06-17 · #668

> Har du tastet inn alle 18 hull mens du var offline, dukker «Lever»-knappen nå opp som den skal. Og åpner du leveringssiden mens noen slag ennå ikke er lagret, lagrer appen dem ferdig før kortet låses, så ingen runde leveres med blanke hull.

<details>
<summary>Teknisk</summary>

#### Fixed
- Submit-CTA-en på hull-flaten ble gjemt så lenge `myCompletedHoles < 18`, og den tellingen var et server-side øyeblikksbilde som aldri konsulterte Dexie. En spiller som tastet alle 18 hull offline fant dermed aldri «Lever»-knappen. `HoleClient` unionerer nå server-snapshot-en med en live `useLiveQuery`-telling av lokale non-null scores via `Math.max(myCompletedHoles, localCompletedHoles ?? 0) >= 18` — server-tallet er gulvet (synkede hull fra tidligere økter), den lokale tellingen legger til det usynkede. Rent additivt: kan bare avsløre CTA-en tidligere, aldri skjule en som før var synlig.
- `/submit` (`SubmitForm`) leste kortet fra Postgres, så et slag som ennå lå i Dexie-køen viste seg som «mangler» — og leverte spilleren, frøs RLS kortet og det køede slaget gikk tapt. Formen kicker nå `drainQueue()` ved mount og blokkerer «Lever»-knappen (label → «Lagrer slag …») så lenge ikke-abandonerte kø-elementer finnes. Når køen tømmes, kalles `router.refresh()` så preview-en re-renderer med de nå-synkede hullene. Dekker også re-levering etter en reject: spilleren MÅ innom `/submit`, så drain-vakta fyrer der. (#668)

</details>

### [1.132.10] - 2026-06-17 · #668

> Skulle et slag ikke la seg lagre, fortsetter ikke appen å prøve i det uendelige uten å si fra. Den sier nå tydelig fra at slaget ikke kom fram, så du ikke tror kortet er komplett når det ikke er det.

<details>
<summary>Teknisk</summary>

#### Fixed
- Sync-laget (`lib/sync/syncWorker.ts` + ny `lib/sync/classifyError.ts`) ga opp aldri på et gift-element: en RPC-feil bumpet bare `attemptCount` og lot elementet ligge, så det ble re-fyrt hvert 30s/online/focus i det uendelige. Drainen gir nå opp (`abandonedAt`) bare på EKSPLISITT permanente feil (RLS-avvisning / constraint / malformed 4xx) etter `MAX_PERMANENT_ATTEMPTS` (5). Nettverks-, auth-utløp-, rate-limit- og *ukjente* feil er aldri permanente — de prøver på nytt for alltid, så et ekte slag aldri droppes fordi spilleren var offline. `SyncBanner` surfacer abandoned-elementer distinkt («Kunne ikke lagre N slag. Kontakt arrangøren.») uten prøv-igjen-knapp. Ny `lib/sync/classifyError.test.ts` (Type A) dekker klassifiseringen og retry-vs-abandon-matrisen.
- `upsert_score_if_newer` (migrasjon `0102`) ga den graceful no-op-en (`was_applied=false` uten write) bare for `withdrawn_at` (0073), ikke for `submitted_at`. Et slag køet offline og levert FØR synk traff dermed RLS WITH CHECK `submitted_at is not null` som hard error → retry-loopen over. RPC-guarden dekker nå begge frosne tilstander (`withdrawn_at is not null or submitted_at is not null`); RLS-policyene er uendret. Applisert til prod, verifisert med no-op-probe mot en submitted spiller (rullet tilbake). Funnet i helse-audit. (#668)

</details>

### [1.132.9] - 2026-06-17 · #675

> Skjærer noe seg når du genererer cup-matcher eller oppretter en liga, blir det ikke lenger liggende en halvferdig turnering du ikke får ryddet. Appen rydder opp etter seg selv.

<details>
<summary>Teknisk</summary>

#### Fixed
- Cup-match-generering (`createCupMatchesFromPlan`) og liga-oppretting (`createLeagueDraft`) satte inn rader i flere ikke-transaksjonelle steg; en feil midtveis etterlot foreldreløse `games`-/`leagues`-rader som den ikke-tekniske eieren ikke kan rydde via SQL (samme symptom som #641). Cup-generatoren samler nå alle innsatte `gameId`-er og sletter hele batchen ved enhver feil (`game_players` følger via FK `on delete cascade`); `createLeagueDraft` sletter `leagues`-raden ved både `rounds_failed` og `players_failed` (`league_rounds`/`league_players` cascade). Speiler det eksisterende rollback-mønsteret i `startLeagueRoundFlight`. To nye rollback-tester. Bevisst valg av kompenserende sletting framfor SECURITY DEFINER-RPC (holder kolonne-logikken i den typede TS-stien — RPC ville lagt til samme utypede skjema-kobling som #672 peker på). Funnet i helse-audit 2026-06-17. (#675)

</details>

### [1.132.8] - 2026-06-17 · #680

> Hikker nettet midt i en runde, får du nå en vennlig norsk side med «Prøv igjen», ikke en engelsk feilmelding uten vei videre.

<details>
<summary>Teknisk</summary>

#### Added
- Tre error-grenser der det før ikke fantes noen i `app/`. `app/[locale]/games/[id]/error.tsx` fanger hull-, leaderboard-, submit- og (home)-sidene, der hver server-komponent kaster på enhver Supabase-feil; `app/[locale]/error.tsx` er catch-all for resten av locale-segmentet (inkl. `games/[id]/layout.tsx`); `app/global-error.tsx` er siste skanse ved rot-layout-feil (egne `<html>`/`<body>`, hardkodet norsk, inline-stiler). De to rute-grensene deler `components/ui/ErrorScreen.tsx` — merket champagne-medaljong-fallback i samme chrome som `not-found.tsx`, med «Prøv igjen» pluss vei tilbake (til spillet / til Hjem). Bruker Next 16.2 `unstable_retry` (re-fetcher og re-rendrer segmentet) framfor `reset`. Ny `error`-i18n-namespace i `no.json`/`en.json` + Type-C render-test. Funnet i helse-audit 2026-06-17. (#680)

</details>


### [1.132.7] - 2026-06-17 · #669 #667

> Du kan nå opprette Wolf med fem spillere, og lag-turneringer med flere enn fire lag, som før stoppet med en lagrings-feil. Og melder noen seg på med et lag, blir ikke kapteinen lenger borte fra spillerlista uten beskjed hvis noe glipper underveis.

<details>
<summary>Teknisk</summary>

#### Fixed
- `game_players_team_number_check` (0030) capet `team_number` på 1–4 og ble aldri utvidet da 0095 utvidet `flight_number`. 5-spiller Wolf (`team_number=5`, som `validateWolf` tillater) og klubb-skala scramble/Patsome med over fire lag traff dermed en CHECK-violation og en «Klarte ikke å lagre spillerne»-blindvei. Migrasjon `0101_widen_team_number` utvider constrainten til `team_number is null or team_number >= 1` (speiler 0095). Per-format-validatorene binder fortsatt der formatet krever det, så app-laget er grensen. Applisert til prod. (#669)
- Offentlig lag-selvpåmelding (`submitTeamRegistration`) svelget en feil på kapteinens `game_players`-insert og returnerte suksess likevel, så kapteinen sto utenfor spillerlista uten beskjed. Returnerer nå `db_error` så de kan prøve igjen (`game_registration_requests`-raden er allerede lagret). `acceptTeamInvite` håndterte dette fatalt fra før. Admin-godkjenningsstien (`signups/actions.ts`) capet lag-slots på 4; hevet til 50 for konsistens med den utvidede constrainten. Funnet i helse-audit. (#667)

</details>

### [1.132.6] - 2026-06-17 · #666

> Et lag som ikke hadde tastet en eneste score kunne vises øverst på resultatlista og bli kåret som vinner. Nå havner et lag uten scores nederst, så det er laget som faktisk har spilt som leder.

<details>
<summary>Teknisk</summary>

#### Fixed
- `computeLeaderboard` i `lib/leaderboard.ts` (legacy best-ball-aggregatoren bak live leaderboard, champion-reveal, profil-statistikk og CSV-eksport) paddet manglende hull med `0` i rank-arrayet. Et lag uten en eneste registrert score fikk dermed total 0 og ble rangert først av `rankTeams` (stigende sortering). #635-fiksen var lagt i `bestBall.ts` m.fl., men aldri back-portet hit. Padder nå zero-score-lag med `UNPLAYED_PADDING` på alle hull (speiler `bestBall.ts`); lag som har spilt minst ett hull er uendret (manglende hull = 0, flagget via `missingHoles`). Ny `lib/leaderboard.test.ts` (fila hadde ingen tester) dekker regresjonen pluss basis netto/brutto-rangering. Funnet i helse-audit. (#666)

</details>

### [1.132.5] - 2026-06-17 · #659

> Inviterer du noen uten Tørny-konto til klubben på e-post, kommer de nå inn. Invitasjonen åpner innloggingen, så engangskoden virker og de blir medlem med en gang.

<details>
<summary>Teknisk</summary>

#### Fixed
- `email_is_invited()` (RPC som gater `shouldCreateUser` i `sendCode`) sjekket bare `public.invitations`, ikke `club_invitations`. En uregistrert e-post invitert til en klubb (#644, migrasjon 0099) ble derfor avvist på OTP-steg 1 med mindre `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` var på, og nådde aldri `verifyCode` der `accept_club_invitations()` gjør invitéen til medlem. Migrasjon `0100_email_is_invited_club_aware.sql` utvider funksjonen til å returnere true også ved en åpen, ikke-utløpt `club_invitations`-rad. Spill-invitasjons-grenen er byte-uendret. Funnet i flyt-audit. (#659)

</details>

### [1.132.4] - 2026-06-16 · #640

> Avslutter du en runde der noen ikke har levert, viste noen formater avkrysningsbokser per spiller og andre bare navnene. Det var ikke en feil, men det var forvirrende. På formatene uten bokser sier appen nå tydelig at det formatet ikke trekker enkeltspillere, så du skjønner at du bare avslutter runden, og at de uten levert står som ikke levert.

<details>
<summary>Teknisk</summary>

#### Changed
- På avslutt-siden (`app/[locale]/games/[id]/avslutt/page.tsx`) styres «Marker som trukket»-avkrysningsboksene per ikke-levert spiller av `supportsWithdrawal(game.game_mode)` — bevisst av for pott-/scramble-/matchplay-familien (by-design, `lib/scoring/modes/types.ts`). Det QA-en oppfattet som inkonsistens var nettopp denne gatingen. Vi lar predikatet stå, men strammer `explanationNoWd`-copyen (begge språk) så den forklarer at formatet ikke trekker enkeltspillere, og at manglende spillere blir stående som ikke levert mens registrerte scores teller. WD-formatenes flyt (`explanationAllowWd` + boks-listen) er urørt. Ren copy-endring. (#640)

</details>

### [1.132.3] - 2026-06-16 · #640

> Logger du inn og ennå ikke har valgt språk, åpnet appen seg av og til på engelsk hvis nettleseren din står på engelsk. Nå starter du på norsk som standard, og det er bare ditt eget språkvalg (eller en engelsk nettleser når du ikke er logget inn) som flytter deg til engelsk.

<details>
<summary>Teknisk</summary>

#### Fixed
- `resolveLocale` (`lib/i18n/resolveLocale.ts`) falt tilbake til Accept-Language når `users.locale` var NULL og det ikke fantes locale-cookie. En innlogget bruker med norsk profil, men engelsk-stilt nettleser, havnet dermed på `/en` ved første besøk. La til et `signedIn`-flagg som kortslutter Accept-Language-steget: innloggede uten eksplisitt språkvalg defaulter nå til `routing.defaultLocale` ('no'). `proxy.ts` sender `signedIn: true` (grenen kjører kun for autentiserte brukere — anonyme er allerede redirected). Anonyme besøkende treffer offentlige sider via `handleI18nRouting`, hvis egen next-intl-deteksjon fortsatt respekterer Accept-Language, så de er upåvirket. Unit-tester for `signedIn`-grenen + bevaring av cookie/eksplisitt-valg/anonym-oppførsel. (#640)

</details>

### [1.132.2] - 2026-06-16 · #640

> Lag-påmelding var bare mulig for best ball og Texas scramble. Nå tar alle lag-formatene imot lag: Ambrose, Florida scramble, shamble og patsome også. Setter du opp en av dem med åpen påmelding, kan spillerne melde seg på som lag, ikke bare individuelt.

<details>
<summary>Teknisk</summary>

#### Added
- `gameModeSupportsTeams` (`lib/games/registration.ts`) styrer både UI-gatingen (team/begge-radioene i `RegistrationSection`) og server-valideringen (`gamePayload.ts` → `team_registration_unsupported_mode`). Den var en hardkodet liste som bare dekket best ball + Texas (+ en delvis utvidelse til ambrose/florida/patsome). Erstattet med en avledning fra den kanoniske spillestil-klassifiseringen: `formatPlayStyle(mode) === 'team' && !isMatchplayFamily(mode)`. Det fanger hele lag-grid-familien (best ball, Texas/Ambrose/Florida scramble, shamble, patsome) og lar shamble inn som var glemt. Matchplay-familien (2v2-variantene er også `'team'`) holdes bevisst ute — der gjøres lag-påmelding via sider (`matchplaySides`, #544), ikke den generiske team-registreringen. Lag-påmeldings-actionen (`teamActions.ts`) var allerede generisk (`resolveTeamSize` leser `mode_config.team_size`), så payloaden er gyldig for de nye formatene uten videre endring. `teamNotSupportedNote`-copyen («kun best ball og Texas scramble») er gjort generisk i begge språk. Type A-tester i `registration.test.ts` dekker de nye formatene + matchplay/solo-negativene. (#640)

</details>

### [1.132.1] - 2026-06-16 · #640

> Oppsummeringen i opprett-veiviseren skrev antallet spillere to ganger, så det sto «4 4 spillere (ikke fordelt)». Nå står det riktig: «4 spillere (ikke fordelt)».

<details>
<summary>Teknisk</summary>

#### Fixed
- `ReadyStep.tsx` (steg 5 i opprett-veiviseren) sendte både `count` og `playerWord` til `playersUnassigned`-malen, men `playerWord` var allerede «{count} spillere» — så malen `{count} {playerWord} (ikke fordelt)` rendret tallet dobbelt. Malen er nå `{playerWord} (ikke fordelt)` i begge språk, og kall-stedet sender ikke lenger den overflødige `count`-argen. Ren copy-fiks; katalog-paritet bevart. (#640)

</details>

### [1.132.0] - 2026-06-16 · #640

> Rett etter at en planlagt runde starter, kunne DIN INFO-kortet vise «Banehandicap —» et lite øyeblikk før tallet kom på plass. Nå regner appen det ut med en gang, så du ser banehandicapen din fra første blikk.

<details>
<summary>Teknisk</summary>

#### Fixed
- Game-home DIN INFO-kortet (`app/[locale]/games/[id]/(home)/page.tsx`) viste `me.course_handicap ?? '—'`. `course_handicap` fryses først ved auto-start (`startScheduledGame`), og cache-invalideringen kjører i `after()` — så i ett render-pass rett etter start leste det cachede `gwp.players`-snapshotet fortsatt pre-start-NULL og viste «—». Banehandicap er en ren HCP+tee+allowance-funksjon, så vi regner den nå on-the-fly for visning når den frosne verdien ikke er synlig ennå. Ny `displayCourseHandicap` i `lib/scoring/courseHandicap.ts` komponerer nøyaktig samme `calculateCourseHandicap` → `applyAllowance`-pipeline som frysingen bruker (Type A-testet at display- og frossen-verdi aldri spriker), og returnerer `null` ved manglende tee-rating eller ikke-finitt index. Game-home henter `users.hcp_index` + `games.hcp_allowance_pct` med ett ekstra slankt kall kun når `me.course_handicap` er null; når cachen har friskna, vises den frosne verdien uendret uten ekstra fetch. (#640)

</details>

## 1.131.y — Klubb-invitasjon på e-post

Issue [#644](https://github.com/jdlarssen/golf-app/issues/644). Før måtte folk ha en Tørny-konto før du kunne legge dem til i en klubb. Nå kan du invitere hvem som helst på e-post.

### [1.131.0] - 2026-06-16 · #644

> Legg til et klubbmedlem på e-post selv om de ikke har Tørny fra før. De får en invitasjon i innboksen, og når de logger inn første gang er de medlem med en gang. Ventende invitasjoner ligger synlig i klubben til de blir godtatt, og du kan trekke dem tilbake.

<details>
<summary>Teknisk</summary>

#### Added
- Ny tabell `public.club_invitations` (migrasjon 0099) — speiler `public.invitations`, men scopet til en klubb (`group_id`) i stedet for et spill. Admin-only RLS (`is_group_admin`), partial-unique på `(group_id, lower(email)) where accepted_at is null`.
- Ny mail-sender `lib/mail/clubInviteNotification.ts` (locale-aware via `lib/mail/i18n.ts`, default norsk), med approval-snapshot-test og rad i den delte Resend-kontrakt-testen. Nye `mail.clubInvite.*`-nøkler i `no.json` + `en.json`.
- Ventende-invitasjon-liste i klubb-rommet (`app/[locale]/klubber/[id]/page.tsx`) med «ventende»-merke og trekk-tilbake (delete via ny `cancelInvitation`-action). `getClubDetail` returnerer nå `pendingInvitations`.

#### Changed
- `add_club_member_by_email` (migrasjon 0099, CREATE OR REPLACE): en ukjent e-post gir nå en ventende klubb-invitasjon og retur-koden `invited` i stedet for `not_found`. Medlemstaket teller aktive medlemmer + åpne invitasjoner. Ny `accept_club_invitations()`-RPC kjøres fra `verifyCode` etter spill-avstemmingen, så en klubb-invitert ny bruker blir medlem ved første innlogging (best-effort, blokkerer aldri login).
- `addMember`-action håndterer `invited` → suksess-redirect + best-effort `sendClubInviteNotification`. Hjelpeteksten under e-postfeltet (`klubb.room.emailHint` / `klubb.create.ownerEmailHint`) sier nå at uregistrerte får en invitasjon på e-post.

</details>

## 1.130.y — Lag-matchplay uten cup

Issue [#634](https://github.com/jdlarssen/golf-app/issues/634). Lag-matchplay-formatene kunne bare settes opp via en cup. Nå tar opprett-veiviseren dem også.

### [1.130.10] - 2026-06-16 · #643

> Setter du opp en runde for klubben, spør ikke veiviseren lenger «hvem kan melde seg på?». Den hadde et valg som sa «vises ikke i Finn turneringer» — misvisende, for klubbmedlemmene ser og melder seg på uansett. Nå er det ett tydelig budskap: medlemmene finner runden selv.

<details>
<summary>Teknisk</summary>

#### Fixed
- Veiviseren viste påmeldings-modus-valget (`RegistrationSection`, «whoLegend») også for klubb-turneringer, med teksten «Bare de jeg inviterer · Vises ikke i Finn turneringer». Det motsa discovery, som bevisst returnerer klubb-spill til medlemmer uansett `registration_mode` (by-design, `getDiscoverableGames.ts`, #442 — «medlemskap ER invitasjonen»). `useGameFormState` eksponerer nå `isClubScoped` (`groupId !== ''`) og tvinger `registrationMode = 'invite_only'` via en effekt så payloaden er korrekt selv når valget ikke rendres (dekker ferskt klubb-valg, `?klubb=`-deep-link og edit av eldre klubb-spill). `RegistrationSection` tar en `hideModeChoice`-prop som skjuler modus-feltgruppa for klubb-spill; type-valget (solo/lag) beholdes. Type A-tester for state-tvangen i `useGameFormState.test.ts`. (#643)

</details>

### [1.130.9] - 2026-06-16 · #651

> Saksnummeret øverst i admin-visningen («Sak 2026-001») kunne få feil år for et spill opprettet i timen rundt midnatt på nyttårsaften. Nå følger det norsk tid, så året og løpenummeret stemmer.

<details>
<summary>Teknisk</summary>

#### Fixed
- `getSakNumber` i `app/[locale]/admin/games/[id]/page.tsx` regnet saksnummer-året via `created.getFullYear()` (server-lokal = UTC på Vercel) og telte løpenummeret mellom UTC-midnatts-grenser (`${year}-01-01T00:00:00Z`). Et spill opprettet 1. jan 00:30 norsk tid (= 31. des 23:30 UTC) fikk dermed feil år og havnet i feil års sekvens-bøtte. Ny ren `osloYearWindow(date)` i `lib/format/osloCalendar.ts` (Type A-testet, bygger på `osloParts`) gir Oslo-året pluss det halvåpne UTC-instant-vinduet `[startIso, endIso)` for det Oslo-året — grensene er Oslo-midnatt 1. januar, som alltid er CET (UTC+1). `getSakNumber` leser nå året og tellings-grensene fra helperen. Samme rotårsak som #637/#646. (#651)

</details>

### [1.130.8] - 2026-06-15 · #638

> Best ball-leaderboarden manglet i forrige runde: feirings-visningen etter avsluttet runde sa fortsatt «Etter 18 hull». Nå teller også den faktisk spilte hull.

<details>
<summary>Teknisk</summary>

#### Fixed
- Oppfølging til 1.130.7: best ball-formatets ferdig-reveal (`State4View`, brukt i `renderStableford`-defaultgrenen for `best_ball`) leste `leaderboard.state4.subtitle` = «Etter 18 hull · Best ball · {mode}» — en hardkodet 18 som ble oversett fordi nøkkelen først ble feildiagnostisert som foreldreløs (den heter `state4.subtitle`, ikke `bestBall.subtitle`, og har en reell konsument). `state4.subtitle` er nå `{holes}`-parametrisert i begge språk, `State4View` tar en `holesPlayed`-prop, og begge instansieringene (frittstående + sideturnerings-fanen) får spillvidt antall spilte hull beregnet på samme måte som reveal-active-grenen. (#638)

</details>

### [1.130.7] - 2026-06-15 · #638

> Avslutter du en runde tidlig (for eksempel etter to hull via «Avslutt likevel»), sto det «Etter 18 hull» øverst på leaderboarden og podiet selv om bare to var spilt. Nå teller den faktisk spilte hull, så det står «Etter 2 hull».

<details>
<summary>Teknisk</summary>

#### Fixed
- Leaderboard- og podium-undertittelen var hardkodet «Etter 18 hull» / «After 18 holes» i i18n-katalogene, uavhengig av hvor mange hull som faktisk var spilt — misvisende når en runde avsluttes tidlig. Ny ren `lib/scoring/holesPlayed.ts` (`maxHolesPlayed`, Type A-testet) regner spillvidt antall spilte hull som den lengst-komne spillerens scorede hull, beregnet én gang per render-helper i `leaderboard/page.tsx` fra `rawScoresRows` og tråded inn som `holesPlayed`-prop til alle berørte view- og podium-komponenter (~18 stk). Den delte nøkkelen `common.after18Holes` ble omdøpt til `common.afterNHoles` med `{holes}`-parameter, og de bespoke `subtitle`/`podiumSubtitle`-nøklene for slagspill, stableford, par-stableford og Texas/scramble fikk «18» byttet ut med `{holes}` (begge språk, katalog-paritet bevart). Matchplay gjorde dette allerede dynamisk og er urørt. Den foreldreløse `bestBall.subtitle`-nøkkelen (uten konsument — best ball rendres via par-stableford-viewet) er bevisst ikke endret. (#638)

</details>

### [1.130.6] - 2026-06-15 · #645

> Oppretter du en klubb og noe er feil — for eksempel en eier-e-post uten Tørny-konto — tømte skjemaet alle feltene, og du måtte taste klubbnavn, e-post og resten på nytt. Nå står det du skrev igjen, så du bare retter feltet som var galt. Samme på «Legg til medlem» i klubben.

<details>
<summary>Teknisk</summary>

#### Fixed
- Klubb-skjemaene (`/admin/klubber/ny` og «Legg til medlem» på `/klubber/[id]`) brukte plain `<form action={serverAction}>` som redirecter med `?error=<kode>` ved valideringsfeil. Feltene hadde ingen `defaultValue`, så hele skjemaet nullstilte seg på redirect — kun eier-e-posten ble echoet i URL-en, og den ble ikke engang fylt tilbake. `createClubForAdmin` echoer nå alle innfylte verdier (`name`, `owner_email`, `member_cap`, `varighet_mode`, `sluttdato`) via searchParams på hver feil-gren gjennom en delt `errorHref(code)`-helper, og `ny/page.tsx` mater dem inn som `defaultValue` på `<Input>`-ene + `VarighetField` sine `defaultMode`/`defaultDate`. `addMember` echoer e-posten på alle feil-grener (ikke bare `not_found`/`already`), og e-post-feltet leser den tilbake som `defaultValue`. searchParams-echo valgt framfor cookie/client-component for å holde server-action-grensa, konsistent med eksisterende `?email=`-mønster. (#645)

</details>

### [1.130.5] - 2026-06-15 · #639

> På hull-skjermen tok info-banneret (hvem du spiller med i Round Robin, hvem som er Wolf, og liknende) en hel rad og dyttet det fjerde spillerkortet under skjermkanten på mobil. Nå står teksten midt i hull-headeren, mellom hull-nummeret og «Par», så alle spillerkortene får plass.

<details>
<summary>Teknisk</summary>

#### Changed
- De fire modus-kontekst-bannerne på hull-skjermen (Round Robin segment-konstellasjon, Wolf-valg, Florida step-aside-påminnelse, Skins-pott) rendret hver som et frittstående full-bredde, padded og rundet kort mellom hull-headeren og spillerkortene (~44px med margin). Med fire spillere (Round Robin er alltid fire, Wolf 3–5, Skins opptil 16) spiste det en hel rad og dyttet fjerde spillerkort under folden på mobil. Bannerne er gjensidig utelukkende per modus, så teksten rutes nå inn i midt-kolonnen av `HoleHero` (mellom det 44px store hull-tallet og Par/indeks) via én delt, slank `HoleContextLine`-komponent — den tucker inn i den ledige høyden ved siden av tallet og legger til ~0px, i stedet for å ta en egen rad. `data-testid`-ene (`round-robin-badge`, `wolf-badge`, `florida-step-aside-reminder`, `skins-banner`) og tekstinnholdet er uendret. WD-banneret (fare-rad med angre-lenke) er bevisst urørt. (#639)

</details>

### [1.130.3] - 2026-06-15 · #646

> Hilsekortet i Klubbhuset regnet dato og tid-på-døgnet i UTC. Like etter midnatt norsk tid sto det «God kveld» og gårsdagens dato. Nå følger dato, ukenummer og hilsen norsk tid.

<details>
<summary>Teknisk</summary>

#### Fixed
- Klubbhuset-hilsekortet (`/admin`) beregnet dato, ISO-ukenummer og tid-på-døgnet med lokal-tid-getters (`getHours`/`getDate`/`getDay`) — på en UTC-server ble alt UTC, ikke `Europe/Oslo`. Kl. 01:32 norsk tid (= 23:32 UTC) viste kortet «God kveld» og «14. jun» i stedet for «God morgen» og «15. jun». Ny ren `lib/format/osloCalendar.ts` med `osloIsoWeek` (ISO-uke fra Oslo-dato via UTC-konstruert dato) og `osloTimeOfDayBucket` (tid-på-døgnet fra Oslo-time), begge bygd på `osloParts` (eksportert + utvidet med `year`). Dato-linja og «sist signert/publisert»-datoene rutet til `formatShortOsloDayMonthLocale`; aktivitets-loggens klokkeslett til ny `formatHHMMOslo`. Ingen «natt»-hilsen lagt til — 00–10 er fortsatt «morgen» (uendret bøtte-design). Type A-tester pinner `TZ=UTC` for å fange Vercel-regresjonen. (#646)

</details>

### [1.130.2] - 2026-06-15 · #637

> Tee-off i spill-protokollen viste UTC-tid, to timer feil om sommeren. En runde med tee-off kl. 10:00 sto som «08:00» i protokollen, mens veiviseren og spiller-siden viste 10:00. Nå står samme norske klokkeslett overalt.

<details>
<summary>Teknisk</summary>

#### Fixed
- Tee-off-tidspunktet på admin-protokollen (`/admin/games/[id]`) rendret i UTC fordi `formatDateTime` (`toLocaleString`) ble kalt uten `timeZone`-opsjon — på en UTC-server (Vercel) ga det server-tid, ikke `Europe/Oslo`. Spiller-siden var allerede korrekt via de Oslo-pinnede `formatTeeOff*Locale`-helperne. Lagt til `timeZone: 'Europe/Oslo'` på tee-off-raden. Samtidig fikset søsken-feltene med identisk rotårsak på samme side: protokoll-undertittelens dato og saksnummer-footerens dato leste lokal-tid via `formatShortDateLocale` (feil dato nær midnatt norsk tid). Begge rutet om til den Oslo-pinnede `formatShortOsloDayMonthLocale` (utvidet til å ta `Date | string`). Tidspunktene lagres uendret som UTC-instant; kun visningen var feil. (#637)

</details>

### [1.130.1] - 2026-06-15 · #635

> Et lag eller en spiller uten registrerte skår ble rangert som nr. 1 og kåret som vinner i en ferdig runde. Nå havner de sist, der de hører hjemme.

<details>
<summary>Teknisk</summary>

#### Fixed
- Et lag uten ett eneste registrert hull ble rangert som nr. 1 og kåret som vinner: den tomme ranking-summen (0) ble tolket som beste netto i lavest-vinner-formatene. `rankTeams` er format-agnostisk og kjente ikke til «ikke spilt», så et 0-hulls-lag sorterte øverst. Lag-strokeplay-formatene (best ball, texas/ambrose/florida, shamble) padder nå et lag som har spilt NULL hull med en delt `UNPLAYED_PADDING`-konstant (løftet ut av `soloStrokeplay` til `tiebreaker.ts`), så de rangeres sist. Delvis spilte lag er upåvirket (beholder 0 for manglende hull), og viste totaler er uendret (padding gjelder kun ranking-arrayet). Avvik fra kontrakt: valgte kirurgisk padding (kun 0-hulls-lag) framfor full per-hull-padding, for å unngå å endre rangeringen av delvis spilte lag og holde null regresjon i gull-suiten. Feilende-først Type A-tester per format (texas/bestBall/shamble); full scoring-suite grønn (857 tester). (#635)

</details>

### [1.130.0] - 2026-06-15 · #634

> Fourball, foursomes, greensome, Chapman og gruesome matchplay kunne før bare settes opp gjennom en cup. Nå velger du dem rett i opprett-veiviseren, fordeler spillerne på to sider à to, og setter i gang.

<details>
<summary>Teknisk</summary>

#### Added
- Den frittstående opprett-veiviseren støtter nå de fem lag-matchplay-formatene (fourball/foursomes/greensome/chapman/gruesome) med 2v2-side-tildeling. De var synlige i format-grid-en (kompis-intent) men en blindvei på steg 4: `useGameFormState.isMatchplay` dekket kun singles, og `TeamsAssignmentSection` rendret ingen side-grid for dem. Nytt `isTeamMatchplay`-flagg + `teamMatchplayPlayersValid` (eksakt 4 spillere, fordelt 2+2 på side 1/2) gjenbruker lag-slot-grid-maskineriet (samme path som Texas) rendret som to «Side 1/2»-kort à 2 slots. Payload-validatorene fantes allerede og leser `player_${i}_team`, så `gamePayload.ts` er urørt; rader emitteres med `team_number` 1/2 og `flight = team`. Chapman manglet i tillegg hele allowance-wiringen i veiviseren (AllowanceField + submit-felt + hidden input) — lagt til. `TeamSizeSelector` skjules for disse (alltid lag à 2). Type C render-test + nye i18n-nøkler (no/en). Singles matchplay urørt. (#634)

</details>

## 1.129.y — Rydd i innboksen

Issue [#616](https://github.com/jdlarssen/golf-app/issues/616). Innboksen kunne bare vokse. Du kunne markere som lest, men ikke fjerne noe, og lange undertekster ble kuttet midt i ordet. Nå kan du arkivere et varsel med ✕, tømme alle leste i ett trykk, og undertekstene får plass på to linjer.

### [1.129.12] - 2026-06-15 · bug

> Patsome lot seg ikke opprette: lag-fordelingen i veiviseren var helt tom, så «Neste» satt fast. Nå fordeler du spillerne to og to og får runden i gang.

<details>
<summary>Teknisk</summary>

#### Fixed
- Patsome var umulig å opprette i veiviseren: steg 4 krevde lag-fordeling (lag à 2), men `TeamsAssignmentSection` rendret ingen lag-grid, så «Neste» satt permanent deaktivert med «Mangler: lag-fordeling (lag à 2)». Hull-, scoring- og leaderboard-laget fra #286 var ferdig — kun veiviser-tildelingen ble aldri wiret inn. Hele state-laget (`useGameFormState`) var allerede Patsome-bevisst (`isPatsome`, `patsomePlayersValid`, `missingForPublish`, `canPublish`, `orderedPayload`); gapet lå utelukkende i presentasjons-komponenten, som lister hver lag-modus eksplisitt og aldri fikk `isPatsome`. Behandler nå Patsome som par-stableford (lag à 2, grid ved ≥2 spillere, «Tøm lag», per-spiller-tee + skjulte gender-inputs 4BBB-segmentet trenger) og skjuler den lone `TeamSizeSelector`-flisen i steg 2 (konsistens med shamble/wolf/nassau). Ny `teamsDescPatsome`-i18n-nøkkel + Type C render-test som vakt mot regresjon. (#633)

</details>

### [1.129.11] - 2026-06-15 · bug

> Liga-runder åpnet to timer for sent: du tastet «06:00», men runden låste seg opp først 08:00. Nå åpner og stenger runder på klokkeslettet du faktisk velger.

<details>
<summary>Teknisk</summary>

#### Fixed
- Liga-runde-vinduene (`opens_at`/`closes_at`) ble lagret feil: `datetime-local`-feltet er vegg-klokke i Oslo-tid, men strengen gikk rå til Postgres og ble tolket som naiv UTC — så «06:00» ble lagret som `06:00+00` (= 08:00 CEST). Visningen var også naiv-UTC, så admin så «06:00» tilbake og merket ikke forskyvningen, mens gating-logikken brukte den reelle instanten og åpnet runden to timer for sent. `addLeagueRound`, `updateLeagueRound` og `overrideRoundWindow` konverterer nå via `parseOsloDateTimeLocal` (samme helper spill-tee-off bruker), og `LigaRoundRow` viser Oslo vegg-klokke via en ny invers-helper `formatOsloDateTimeLocal` + `formatShortOsloDayMonthLocale`. Gating trengte ingen endring — den blir riktig av seg selv når lagringen er korrekt. Frekvens-genererte runder (`generateRounds`) var allerede ekte UTC-instanter og er urørt. Type A-tester for begge nye helpere + round-trip mot `parseOsloDateTimeLocal`. (#648)

</details>

### [1.129.10] - 2026-06-15 · bug

> Liga var ute av drift: ingen fikk startet en runde, og sesong-tabellen krasjet så snart en runde var levert. Nå kan du spille runder, og tabellen laster som den skal.

<details>
<summary>Teknisk</summary>

#### Fixed
- Tre uavhengige skjema-mismatcher som hver for seg blokkerte liga ende-til-ende (#647). **(1)** `startLeagueRoundFlight` bygde `game_players`-rader med `status: 'active'` — en kolonne tabellen ikke har — så hver flight-insert ble avvist og ingen kunne spille en runde. **(2)** Samme insert satte `team_number: 1` uten `flight_number`, som bryter CHECK-constrainten `game_players_team_flight_consistency`; liga er solo, så `team_number` er nå `null`. **(3)** `getLigaSnapshot` hentet den droppede kolonnen `course_holes.par` (migrasjon 0040 → per-kjønn), så hele `/liga/[id]`-sesong-tabellen krasjet med 500 så snart én runde var ferdig — select-en bruker nå per-kjønn-kolonnene og mapper `par` fra `par_mens`. Nye regresjonstester for både flight-inserten (`actions.test.ts`) og snapshot-selecten (`getLigaSnapshot.test.ts`). `accepted_at`-semantikken fra #463 (den som starter flighten bekreftes, medspillere venter) er bevart. (#647)

</details>

### [1.129.9] - 2026-06-15 · bug

> Å generere matcher i en cup la ikke inn én eneste spiller — veiviseren ble stående uten feilmelding. Nå får hver match spillerne sine, klare med en gang.

<details>
<summary>Teknisk</summary>

#### Fixed
- `createCupMatchesFromPlan` bygde `game_players`-rader med `status: 'active'` — en kolonne tabellen ikke har — så PostgREST avviste hver match-insert og cup-genereringen endte med 0 spillere (bare en foreldreløs game-rad for første match). Inserten satte også `team_number` uten `flight_number`, som bryter CHECK-constrainten `game_players_team_flight_consistency`. Fjernet `status`, la til `flight_number: 1` (én match = én spillegruppe), og setter `accepted_at` med en gang — admin har bevisst satt opp matchene med valgte spillere, så de er umiddelbart aktive uten «Ikke bekreftet»-gate (eier-beslutning). Utvidet regresjonstesten til å låse hele payload-kontrakten. (#641)

</details>

### [1.129.8] - 2026-06-15 · bug

> Cup-sida og det offentlige cup-resultatet krasjet så snart cupen hadde minst én match. Nå laster de som de skal.

<details>
<summary>Teknisk</summary>

#### Fixed
- `getCupSnapshot` hentet kolonnen `course_holes.par`, som ble droppet i migrasjon 0040 til fordel for `par_mens`/`par_ladies`/`par_juniors`. Postgres svarte `42703 column course_holes.par does not exist`, og siden hull-spørringen bare kjører når cupen har minst ett match-spill, krasjet både `/admin/cup/[id]`, `/klubber/[id]/cup/[cupId]` og den offentlige `/cup/[id]` med en 500. Select-en bruker nå per-kjønn-kolonnene og mapper `par` fra `par_mens` nedstrøms — samme mønster som den fungerende scoring-stien (`buildModeResultForGame`). Ny regresjonstest (`getCupSnapshot.test.ts`) låser kolonne-navn-kontrakten mot en minimal cup med én match. (#642)

</details>

### [1.129.7] - 2026-06-14 · #622

> Noen norske tekster brukte det engelske ordet «roster» («rosteren», «Lag-roster»). Nå står det «spillerliste» overalt, likt resten av appen.

<details>
<summary>Teknisk</summary>

#### Fixed
- Erstattet anglismen «roster» med «spillerliste(n)» i sju norske UI-strenger (#622, oppfølging av #614 som lot ordet stå bevisst). Berører kun verdier i `messages/no.json`: tre cup-flater (`rosterHeading`, `emptyRoster`, `rosterEntry`, vist i `CupManagement` + `CupDeleteConfirm`) og fire spiller-varsler (`invite_added`, `allOnRoster`, `approved`, `db_players`). Hankjønnsformen `spillerlisten` ble valgt for konsistens med eksisterende `db_roster`-strenger, så fila ikke blander hankjønn og hunkjønn. JSON-nøkler og kode-identifikatorer (`CreatorRosterClient`, `NewGameFormData.roster`) er urørt siden de ikke er bruker-synlige. `en.json` er uendret (korrekt engelsk). Ingen nye tester: ren copy-endring, og catalog-paritet holder fordi bare verdier endret seg.

</details>

### [1.129.6] - 2026-06-14 · #624

> Spillnavn-fiksen fra forrige versjon dekker nå også resten av spill-sidene: slett, avslutt, spillerlista, godkjenning, scorekort, hull-for-hull og lag-påmelding. Engelske spillnavn er konsekvente overalt nå.

<details>
<summary>Teknisk</summary>

#### Fixed
- Utvidet #624-sveipen til de gjenværende spill-flatene en skeptisk evaluering fant utenfor issuets opprinnelige liste: player slett (tittel + bekreftelses-liste), admin avslutt + avslutt-likevel, player avslutt, admin trekk-spiller, spillerlista (`spillere`), `approve` + `scorecard` back-label, per-hull-header (`holes/[holeNumber]`), og lag-påmeldingens H1-fallback (`teamName ?? game.name`). Samme mønster: `courses(name)` lagt til der projeksjonen manglet det; for `getGameWithPlayers`-konsumentene (cachet helper joiner bevisst ikke `courses`) en slank parallell course-fetch. Notification-payloads forblir urørt.

</details>

### [1.129.5] - 2026-06-14 · #624

> #617 fikset spillnavnet på forsiden. Nå gjelder det resten av appen også: leaderboardet, spill-sida, påmeldinger og Sekretariatet. På engelsk står det «12 June», på norsk «12. juni».

<details>
<summary>Teknisk</summary>

#### Fixed
- App-bred sveip av `localizeGameName` (#624, oppfølging av #617). Helperen re-lokaliserer auto-genererte spillnavn ved visning; #617 dekket kun tre flater, dette dekker resten. Norsk visning er byte-identisk (tidlig retur for 'no'); egendefinerte navn passerer urørt.
- Lette flater (banenavn allerede i scope, ren wrap): spill-hjem (tittel + kicker), levering, trekk-fra, admin spill-detalj, admin slett (tittel + bekreftelses-liste + start-knapp-dialog), Klubbhuset, og de tre Hjem-oppdagelseskortene (klubb/venn/åpne).
- Slanke projeksjoner utvidet med `courses(name)`: rediger + admin edit (delt `EditGameRow`), admin status, admin påmeldinger (la også til `getLocale()`), profil-historikk, og signup + lag-signup (delt `getGameByShortId`).
- Leaderboard (hovedvisning + alle hull-for-hull-modus): banenavnet hentes slankt parallelt — ikke via den cachede `getGameWithPlayers`, som bevisst ikke joiner `courses` for å unngå cross-game fan-out på bane-endringer — og spillnavnet lokaliseres én gang ved kilden, så den lokaliserte kopien flyter ut til alle ~50 `gameName`/`kicker`-props uten å røre view- eller podium-komponentene.
- Bevisst urørt: notification-payloads (`notifyPlayersGameStarted`, `maybeSendDeliveryReminder`) lokaliseres ved mottaker-locale i varsel-laget, ikke request-locale; og form-feltets initialverdi i edit-flyten beholder det rå, lagrede navnet. Ingen nye render-tester (helper-logikken er dekket i `autoGameName.test.ts`).

</details>

### [1.129.4] - 2026-06-14 · #621

> Profilen viste handicap med norsk komma (12,4) også i engelsk modus, så tallet stakk seg ut mot resten av siden. Nå bruker den punktum (12.4) på engelsk.

<details>
<summary>Teknisk</summary>

#### Fixed
- Profil-handicap lokaliseres nå i engelsk modus (#621). Header-visningen av lagret handicap bruker den kanoniske, locale-bevisste `formatHcpDisplay(signed, locale)` (én desimal, riktig desimalskille, «+» på plusshandicap) i stedet for den norsk-hardkodede `formatGolfboxHcp` — samme helper som admin-spillerlista (#615).
- Den live «Lagres som …»-bekreftelsen (profil-skjema + onboarding) bruker nå locale-bevisst `formatGolfboxHcp(magnitude, isPlus, locale)`. `locale`-parameteren defaulter til 'no', så norsk visning og eldre kall er byte-identiske. Bekreftelsen beholder bevisst sin «echo som tastet»-semantikk (ingen tvungen avrunding) — den speiler input, mens header-en viser den kanoniske lagrede verdien.

</details>

### [1.129.3] - 2026-06-14 · #617

> Auto-genererte spillnavn viste norsk måned i tittelen selv i engelsk modus, så «Byneset North 12. juni» sto over en engelsk dato. Nå følger måneden i tittelen språket ditt: «12 June» på engelsk, «12. juni» på norsk.

<details>
<summary>Teknisk</summary>

#### Fixed
- Auto-genererte spillnavn lokaliseres nå ved visning (#617). Navnet fryses i opprettelses-språket i `games.name`, så et norsk-opprettet spill viste norsk månedsnavn også på `/en`. Ny ren helper `localizeGameName(name, courseName, locale)` i `lib/games/autoGameName.ts` parser dag + måned ut av den lagrede norske strengen (forankret til banenavnet) og reformaterer for aktiv locale via `suggestGameName`s en-gren. Tidssone-fri ved design (bruker dag/måned fra strengen, ikke et nytt `Date.getDate()`-kall) og uten query-endring (trenger bare navn + banenavn). Egendefinerte navn passerer urørt; norsk visning er byte-identisk.
- Anvendt på `FinishedGameCard` (Hjem «Avsluttede spill» + `/spill-arkiv`), `renderGameCard` (Hjem «Pågår»/«Mine spill») og admin-`GamesLedger` («Recent activity»).
- 13 nye enhetstester for `localizeGameName` (no byte-identisk, en-reformatering, egendefinerte navn urørt, regex-escaping, round-trip alle 12 måneder).

</details>

### [1.129.2] - 2026-06-14 · #614

> Norsk-en i veiviseren og Klubbhuset er ryddet. Engelske ord som «Formats», «gross» og «course handicap» er byttet til «Format-styring», «brutto» og «banehandicap», og «Tap et spill» heter nå «Trykk på et spill».

<details>
<summary>Teknisk</summary>

#### Fixed
- Copy-kvalitet i veiviser/admin (#614): over 100 norske strenger i `messages/no.json` renset for engelske ord og anglismer. Admin-kortet «Formats» → «Format-styring» (også side-tittelen «Format-mapping»), «wizarden»/«step 2» → «veiviseren»/«steg 2», «Toggles» → «Bryterne», «Primary»/«Cup-eligible formats»/«Demote» → «Primær»/«Cup-kvalifiserte formater»/«Senk», «Allowance (%)» → «Handicap-andel (%)», «Tap et spill»/«Tap en bane» → «Trykk på …», og «Matches»/«point» i cup-flaten → «Matcher»/«poeng».
- Golf-termer norsket (eier-valg): «gross» → «brutto»/«bruttoscore»/«bruttoslag» i alle scoring-hjelpetekster, «course handicap» → «banehandicap», «strokes»/«extra strokes» → «slag»/«ekstraslag», «alternate shot» → «vekselslag».
- Bevisst urørt: `{gross}`-ICU-variabelen (er ikke ordet, men et tall-felt), de byte-identiske `gameFinished`-mal-snapshotene (#594), `scratch` og alle format-navn (genuine golf-termer), og lånordet «roster» (gjennomgående app-term — egen vurdering). `en.json` er uendret, allerede korrekt engelsk.
- Tester: 4 komponent-/snapshot-tester oppdatert til ny copy (AllowanceField-etikett, AuditLog-labels, CupSetup/GameWizard «Poengmål», cupStarted-mail-snapshot «poeng»).

</details>

### [1.129.1] - 2026-06-14 · #615

> Handicap i admin-spillerlista vises nå med komma (12,2), som ellers i appen. Plusshandicap får pluss foran (+8,0) i stedet for minus.

<details>
<summary>Teknisk</summary>

#### Fixed
- Admin-spillerlista (`/admin/spillere`) viste handicap via `toFixed(1)`. Det gir alltid punktum («12.2»), uavhengig av språk, og ignorerer plusshandicap-konvensjonen: plusshandicap (lagret som negativt tall) ble vist som «−8.0» i stedet for «+8,0» (#615). Ny ren helper `formatHcpDisplay(signed, locale)` i `lib/handicap/sign.ts` komponerer `fromSignedHcp` + `formatNumber`: locale-riktig desimalskille (norsk komma, engelsk punktum), alltid én desimal, «+» på plusshandicap, ingen fortegn på scratch. `PlayersList` henter aktiv locale via `getLocale()` og bruker helperen. Dekket av Type A-tester i `sign.test.ts`.

</details>

### [1.129.0] - 2026-06-14 · #616

> Du kan nå arkivere et varsel med ✕, eller tømme alle leste i ett trykk, så innboksen ikke bare vokser. Lange undertekster vises på to linjer i stedet for å bli kuttet av.

<details>
<summary>Teknisk</summary>

#### Added
- Soft-archive av varsler (#616): ny `notifications.archived_at`-kolonne (migrasjon 0098, additiv + partial-indeks `notifications_user_active_created`). ✕-knapp per kort arkiverer ett varsel; «Tøm leste»-knappen arkiverer alle leste i ett trykk. Radene slettes aldri — `archived_at` skjuler dem fra lista, historikken beholdes i DB.
- Server-helper `lib/notifications/archive.ts` (`archiveNotifications`) + server-actions `archiveOne` og `clearRead` i `innboks/actions.ts`. Arkivering setter `read_at` samtidig, så en arkivert-mens-ulest rad ikke etterlater en hengende bunn-nav-prikk (ulest-telleren teller `read_at is null`).

#### Changed
- `NotificationCard` gikk fra én `<button>` til en `<div>` med to søsken-knapper (hoved-tap + ✕), så vi unngår nestede interaktive elementer. Detalj-linja bruker `line-clamp-2` i stedet for `truncate` — undertekst bryter til to linjer.
- `/innboks`-queryen filtrerer `archived_at is null` (bruker den nye partial-indeksen). Behandlingen av «Resultatet er klart»-støy er bevisst latt være: varselet beholdes, og den nye rydde-funksjonen lar deg fjerne det selv.

</details>

## 1.128.y — Ingen blindveier i innboksen

Issues [#612](https://github.com/jdlarssen/golf-app/issues/612) og [#613](https://github.com/jdlarssen/golf-app/issues/613). Et gammelt påmeldings-varsel kunne ta deg til et spill som var avsluttet eller slettet, og da møtte du en svart engelsk feilside uten vei tilbake. Nå har Tørny en egen «finnes ikke»-side på norsk, og innboksen rydder bort varsler som ikke lenger har et sted å ta deg.

### [1.128.1] - 2026-06-14 · #613

> Gamle påmeldings-varsler som peker til et spill som er borte, dukker ikke lenger opp i innboksen. Og varsler uten et sted å ta deg markeres bare som lest når du trykker, i stedet for å se ut som om ingenting skjer.

<details>
<summary>Teknisk</summary>

#### Fixed
- Varsler som tidligere falt tilbake til `/innboks` (seg selv) — avvist påmelding (`registration_rejected`) og produktnytt uten lenke — navigerer ikke lenger dit ved trykk. `notificationDestination()` returnerer `null` for disse, og `handleTap` hopper over `router.push`. Markering som lest skjer uansett, så et trykk gjør fortsatt noe synlig (ulest-stripen forsvinner).
- `registration_request`-varsler som peker til et slettet/utilgjengelig spill skjules fra innboks-lista. `/admin/games/[id]/signups` kaller `notFound()` for slike, så varselet var en blindvei. Filtreres ved innlasting via én batched eksistens-spørring (admin-klient, kun id-sjekk). Ikke-destruktivt — radene blir værende i `notifications`-tabellen.

#### Changed
- `buildDeeplink` flyttet ut av `InboxClient` til ren, enhetstestet `lib/notifications/deeplink.ts` (`notificationDestination`). Ny `lib/notifications/staleNotifications.ts` (`collectSignupGameIds` + `filterStaleSignupNotifications`) for skjul-utdaterte-filteret. Begge dekket av nye Type A-tester.

</details>

### [1.128.0] - 2026-06-14 · #612

> Lander du på en lenke som ikke finnes lenger, møter du nå en Tørny-side på norsk med vei tilbake, i stedet for en svart engelsk feilmelding som ser ut som om appen har krasjet.

<details>
<summary>Teknisk</summary>

#### Added
- `app/[locale]/not-found.tsx`: app-dekkende, merket 404 i forest-and-champagne (BrandMark + champagne-medaljong med PinFlag + serif-heading + «Til Hjem»-knapp). Rendres inne i `[locale]`-layouten, så den arver `<html lang>`, NextIntl-provideren og den globale bunn-nav-en. Fordi routing er `localePrefix: 'as-needed'` og `proxy.ts` rewriter alle stier til `app/[locale]/…`, fanger denne ene fila både ukjente topp-nivå-stier og `notFound()` fra nestede sider (begge locales).
- Nytt `notFound`-namespace i `messages/no.json` + `messages/en.json` (heading/body/button), byte-identisk struktur.

</details>

---

## 1.127.y — Sideturnering på matchplay-duellen

Issue [#585](https://github.com/jdlarssen/golf-app/issues/585), oppfølging av sideturnering-utrullingen i [#576](https://github.com/jdlarssen/golf-app/issues/576). Matchplay-familien (singles, fourball, foursomes m.fl.) var den eneste som ikke fikk sideturnering, fordi duell-kortet ikke har samme tabs-flate som de andre formatene. Nå vises vinnerne kompakt under duell-resultatet, med hele poenggrunnlaget bak en utvid-knapp.

### [1.127.6] - 2026-06-14 · #600

> Spiller du to mann i Bingo Bango Bongo, Nassau eller Skins, viste leaderboarden resultatet to ganger rett under hverandre. Nå står duellkortet alene — én gang.

<details>
<summary>Teknisk</summary>

[#600](https://github.com/jdlarssen/golf-app/issues/600). Ved nøyaktig 2 spillere er et poeng-format en duell, og leaderboarden viser et `HeadToHeadResult`-kort med vinner, totaler, fordeling og 18-hulls-strip. Tre formater rendret i tillegg den fulle leaderboard-viewen rett under kortet med nøyaktig samme tall — ren dobbeltvisning. Stableford og Slagspill viste allerede bare kortet ved 2 spillere; nå følger BBB, Nassau og Skins samme regel.

#### Changed
- `renderBingoBangoBongo`, `renderNassau` og `renderSkins` (`leaderboard/page.tsx`): i `finished` + nøyaktig 2 spillere rendrer `mainContent` nå kun duellkortet — `BingoBangoBongoView` / `NassauView` / `SkinsView` under kortet er fjernet. 3+ spillere (podium + view), aktiv/kommende standalone-view og sideturnering-stien er uendret.

</details>

### [1.127.5] - 2026-06-14 · #601

> Bingo Bango Bongo-leaderboarden skrev «B1 10 · B2 8 · B3 10» — nå står det «10 bingo · 8 bango · 10 bongo», samme ord som kortet rett over.

<details>
<summary>Teknisk</summary>

[#601](https://github.com/jdlarssen/golf-app/issues/601). På BBB-leaderboarden brukte spiller-raden forkortelsen «B1/B2/B3» for de tre poengtypene, mens duellkortet over (ved 2 spillere) staver dem ut. Ingenting på skjermen forklarte at B1 = bingo, så to vokabular for samme tre tall sto rett under hverandre.

#### Changed
- `BingoBangoBongoView` `PlayerRow` viser nå de hele ordene «{n} bingo · {n} bango · {n} bongo» (samme form som duellkortet i `page.tsx`). `title`-tooltipsene som forklarer hver type (først på green / nærmest hullet / først i hull) er beholdt.

</details>

### [1.127.4] - 2026-06-14 · #605

> Når runden er ferdig, bytter den lille linja nederst på leaderboarden fra «Lykke til» til «Vel spilt». «Lykke til» passet før start, ikke etter.

<details>
<summary>Teknisk</summary>

[#605](https://github.com/jdlarssen/golf-app/issues/605). Den dekorative golf-flagg-footeren (`PullQuote`) var ikke status-bevisst i poeng-formatene: leaderboard-viewene hardkodet «Lykke til.» (feil på ferdige spill), mens «Hull for hull»-viewene hardkodet «Godt spilt.» (feil på aktive spill). Matchplay-familien hadde allerede en status-bevisst footer; nå gjør resten det samme.

#### Changed
- Ny delt `LeaderboardFooter`-komponent (`gameStatus`-bevisst: «Lykke til.» live/kommende, «Vel spilt!» ferdig) erstatter 18 inline-footere — 9 leaderboard-views (BBB, Nassau, Skins, Wolf, Nines, Acey-Deucey, Round Robin, Shamble, Patsome) + 9 «Hull for hull»-views.
- Den felles ferdig-linja er samlet på «Vel spilt!» / «Well played!» (den eksisterende `wellPlayed`-nøkkelen endret fra «Godt spilt.»), så alle skjermene sier det samme.

#### Added
- `LeaderboardFooter.test.tsx`: render-test for status→tekst-mappingen.

</details>

### [1.127.3] - 2026-06-14 · #602

> Også «Lengste bogeyfrie rekke» og «Verste enkelthull» viser nå hvem som tok dem — de hadde samme «(?)»-feil som resten av sideturneringen.

<details>
<summary>Teknisk</summary>

[#602](https://github.com/jdlarssen/golf-app/issues/602), fullføring. Skeptisk evaluering fant to individuelle kategorier til med samme manglende `winnerUserId` — `longest_bogey_free_streak` og `lowest_single_hole_brutto` — som rendret navn i raden men falt tilbake til «(?)». Samme rotårsak, samme mekaniske fiks.

#### Fixed
- `lib/scoring/sideTournament.ts`: `winnerUserId: w.userId` på `longest_bogey_free_streak`- og `lowest_single_hole_brutto`-awardene. Ingen poeng-/standings-endring.
- `sideTournament.test.ts`: `winnerUserId`-assertions på de eksisterende enkelt-vinner-testene for begge (test-først).

</details>

### [1.127.2] - 2026-06-14 · #604 #603

> I et spill der hver spiller står for seg selv ryddet vi opp i sideturneringen: navnet ditt står nå én gang med kallenavn (ikke to ganger), og det står ikke lenger «hele laget» når det ikke finnes noe lag.

<details>
<summary>Teknisk</summary>

[#604](https://github.com/jdlarssen/golf-app/issues/604) + [#603](https://github.com/jdlarssen/golf-app/issues/603). Begge gjelder solo/individuelle formater der hvert «lag» har ett medlem. Funn: lag-aggregerte kategorier fyrer allerede aldri for solo (gated på `userIds.length >= 2` i scoring), så kun visning/copy endres — poeng og standings er uendret.

#### Fixed
- `SideTournamentView`: solo-raden viser kallenavn-formen (`displayName`) én gang i stedet for fornavnet to ganger (#604). Avledet `isIndividual` (alle lag har ett medlem).
- Snowman-raden bruker individuell formulering uten «hele laget» i solo (#603), via nye `snowmanDetailSolo`/`snowmanDetailHoleSolo`/`snowmanSolo`-nøkler i begge språk-kataloger.
- «Slik gis poengene»-panelet skjuler lag-variant-poeng og rene lag-rader (`team_all_birdied_bonus`, `team_no_bogey_hole_coord`) for solo, og viser snowman-regelen i solo-variant.

#### Added
- `SideTournamentView.test.tsx`: render-test for solo (kallenavn, snowman-copy, panel-filtrering) + lag-regresjon.

</details>

### [1.127.1] - 2026-06-14 · #602

> I sideturneringen sto det «Flest birdier (?)» i stedet for hvem som faktisk vant kategorien. Nå viser de telle- og brutto-baserte kategoriene navnet på spilleren som tok dem.

<details>
<summary>Teknisk</summary>

[#602](https://github.com/jdlarssen/golf-app/issues/602). De individuelle sideturnerings-kategoriene satte aldri `winnerUserId` på award-objektet, så `SideTournamentView` falt tilbake til den literale `?`-en når den slo opp vinnernavnet.

#### Fixed
- `lib/scoring/sideTournament.ts`: 11 individuelle kategorier (`most_birdies/eagles/pars/albatrosses/hole_in_ones_individual`, `best_brutto_18/f9/b9_individual`, `king_par3/4/5_individual`) bærer nå `winnerUserId` fra vinner-løkka. Ved uavgjort får hvert tied lag sin egen award med det lagets representant-spiller. Ren felt-tilføyelse — poeng og standings er uendret.
- `sideTournament.test.ts`: `winnerUserId`-assertions lagt til på de eksisterende enkelt-vinner-testene for alle 11 kategoriene (test-først; feilet mot gammel kode).

</details>

### [1.127.0] - 2026-06-14 · #585

> Nå kan du ha sideturnering på matchplay også. Lengste drive og nærmest pinnen kåres som vanlig når du avslutter, og vinnerne vises i en liten seksjon under duell-resultatet. Vil du se hele poenggrunnlaget, folder du det ut.

<details>
<summary>Teknisk</summary>

[#585](https://github.com/jdlarssen/golf-app/issues/585), oppfølging av [#576](https://github.com/jdlarssen/golf-app/issues/576). Data-kjernen for sideturneringen er ekstraktert fra `renderSideTournamentTabs` til en `computeSideTournament`-helper, så både tabs-stien (poeng-/podium-formater) og den nye matchplay-seksjonen deler beregningen. De to duell-sidene grupperes som lag 1 og 2 (`teamGrouping: 'byTeamNumber'` — singles blir to lag-av-1, fourball/foursomes to lag-av-2).

#### Added
- `MatchplaySideTournamentSection` — kompakt seksjon under duell-kortet med de admin-kårede LD/CTP-vinnerne synlig, og hele `SideTournamentView`-poenggrunnlaget bak en `<details>`-disclosure. Wiret inn i `MatchplayMatchView`, `FourballMatchplayView` og `FoursomesMatchplayView` via en valgfri `sideTournamentSection`-node (server-rendret, kun ved `finished` + sideturnering på).
- `leaderboard.matchplaySide`-nøkler i begge språk-kataloger.

#### Changed
- Veiviseren tilbyr sideturnering-bryteren for matchplay-familien igjen (reverserer #576-skjulingen); `sideTournamentSupported` er nå true for alle formater og det rå toggle-valget bevares ved format-bytte.
- `renderSideTournamentTabs` er nå en tynn caller over `computeSideTournament` — ingen oppførselsendring for poeng-/podium-formater.

</details>

## 1.126.y — Mailene på ditt språk

Issue [#594](https://github.com/jdlarssen/golf-app/issues/594), fase M i i18n-epicen [#60](https://github.com/jdlarssen/golf-app/issues/60). Hele grensesnittet og spillform-tekstene er tospråklige, men e-postene fra Tørny gikk fortsatt ut på norsk uansett hvilket språk mottakeren hadde valgt. Nå følger de språkvalget.

### [1.126.1] - 2026-06-14 · #583

> Varslene fra lag-påmelding kommer nå på språket du har valgt i appen. Ber noen om å bli med på laget, eller blir du tatt av et lag: står appen på engelsk, er varselet engelsk. På norsk er alt akkurat som før.

<details>
<summary>Teknisk</summary>

[#583](https://github.com/jdlarssen/golf-app/issues/583), oppfølging av fase 2f. Lag-påmeldingens varsler komponerte norske strenger rett inn i payloaden ved sending — da mottakerens locale ikke er kjent — og `NotificationCard` rendret dem ordrett. En engelsk mottaker så dermed norsk tekst i innboksen. Komposisjonen er flyttet til render-tid, så payloaden holdes språk-nøytral.

#### Changed
- `requester_name`, `withdrawn_player_name`, `invited_by_name` og `team_name` i varsel-payloadene er nå nullable; `NotificationCard` fyller locale-riktig fallback (`inbox.somePlayerFallback` / `inbox.someTeamFallback`) og komponerer «(kaptein for …)» via den nye `inbox.kinds.registrationRequest.captainOf`-nøkkelen.
- Lag-fjerning bruker et nytt `reason_code: 'team_removed'`-felt på `registration_rejected` i stedet for en hardkodet norsk grunn; admins fritekst-`reason` (manuell avvisning) rendres fortsatt ordrett.
- `getCaptainDisplayName` (`teamActions.ts`), `getRequesterName` (`signup/actions.ts`) og navne-oppslaget i `withdrawActions.ts` returnerer nå `null` ved manglende bruker-rad. Mail-tvillingene (`registrationRequest.ts`, `teamInvitation.ts`) tar nullable navn og fyller locale-riktig fallback via `mail.common.somePlayerFallback`, så heller ikke e-post lekker norsk til engelske mottakere.

#### Added
- Fem nye katalog-nøkler i begge locales (`inbox.somePlayerFallback`, `inbox.someTeamFallback`, `inbox.kinds.registrationRequest.captainOf`, `inbox.kinds.registrationRejected.reasonCodes.team_removed`, `mail.common.somePlayerFallback`). Norsk er byte-identisk med de tidligere literalene. To nye `NotificationCard`-render-tester for komposisjons- og reason_code-grenene.

#### Notes
- Allerede lagrede varsel-rader rendres ordrett (akseptert legacy, samme prinsipp som fase 2e). `invite/actions.ts` sin `'En venn'`-fallback er bevisst utenfor — egen kind og admin-invite-flyt, hører til den samlede varsel-payload-fasen under [#60](https://github.com/jdlarssen/golf-app/issues/60).

</details>

### [1.126.0] - 2026-06-14 · #594

> E-postene fra Tørny kommer nå på språket du har valgt i appen. Enten det er en invitasjon, et resultat eller en påminnelse: står appen på engelsk, er e-posten engelsk. På norsk er alt akkurat som før.

<details>
<summary>Teknisk</summary>

[#594](https://github.com/jdlarssen/golf-app/issues/594). De elleve Resend-malene i `lib/mail/` hadde hardkodet norsk tekst uten noe locale-begrep. Nå tar hver `send*`-funksjon en `locale`-param og rendrer den bruker-synlige teksten fra et nytt `mail`-namespace i `messages/{no,en}.json` via `createTranslator` — mottakerens locale er ikke request-locale, så de request-scopede `getTranslations`/`useTranslations` virker ikke. HTML-strukturen blir i koden; bare teksten ligger i katalogen.

#### Added
- `lib/mail/i18n.ts`: `getMailTranslator(locale)` (scoped til `mail`-namespacet), `getMailMessages(locale)` for dynamiske oppslag (modus-sammendrag og modus-navn), `mailUrl(locale, path)` for locale-korrekte lenker (`/en/…` for engelske mottakere) og default-locale-fallback for manglende nøkler.
- `mail.*`-namespace i `messages/{no,en}.json` for alle elleve malene + delt `mail.common`. Norsk er byte-identisk med dagens tekst; engelsk er ny, idiomatisk copy. `gameFinished` rendres fra én ICU-melding per modus-gren, så ordenstall (`1. plass` / `1st place`), flertall (`1 poeng` / `1 point`) og vunnet/tapt/uavgjort lokaliseres uten kode-side-sammensetting.
- Locale-aware snapshot-tester: engelsk default-case per mal, norske snapshots uendret.

#### Changed
- Call-sitene som sender mail leser nå mottakerens `users.locale` og sender den videre. Fan-out-malene (gameFinished, produktoppdaterings-digest, cup-start og -slutt) sender hver mottaker på sitt eget språk; admin- og registrerings-malene leser admins/den registrertes locale. `FinishedMailRecipient` bærer `locale`.
- Konto-løse invitasjoner (invitasjons-mail og lag-invitasjon) faller til norsk — invitéen har ikke valgt språk ennå, og språkvelgeren er tilgjengelig først etter innlogging.

</details>

## 1.125.y — Spillformene på engelsk

Issue [#592](https://github.com/jdlarssen/golf-app/issues/592), del av i18n-epicen [#60](https://github.com/jdlarssen/golf-app/issues/60). Etter at hele grensesnittet ble tospråklig i fase 2a–2f, lå selve spillform-tekstene fortsatt igjen på norsk uansett språkvalg — de bodde i databasen. Nå er navn, beskrivelser, regler og eksempler flyttet til samme oversettelses-katalog som resten av appen, så de følger språkvelgeren.

### [1.125.0] - 2026-06-13 · #592

> Står appen på engelsk, er spillformene nå engelske hele veien: navn, korte beskrivelser, regler og eksempler i veiviseren, i oppslagsverket og på spillsiden. På norsk er alt akkurat som før.

<details>
<summary>Teknisk</summary>

[#592](https://github.com/jdlarssen/golf-app/issues/592). Spillform-innholdet (`formats.display_name`, `short_description`, `rules_long`, `rules_example` + kode-fallbacken `MODE_GUIDE` for sammendrag og punkter) var norsk-låst og DB-/kode-drevet. Eier-beslutning: innholdet er statisk, så vi hardkoder det i meldingskatalogen framfor å bygge en per-locale DB-editor. Det gir samme mekanisme som resten av epicen, og den DB-drevne innholds-editoren i Sekretariatet kan fjernes.

#### Added
- `formatGuide.content.<key>` i `messages/{no,en}.json` for alle 22 formater og 4BBB-varianten: `shortDescription`, `summary`, `points`, `long`, `example`. Norsk er byte-identisk med dagens DB-rader og `MODE_GUIDE` (verifisert via md5-rundtur mot prod); engelsk er ny, idiomatisk golf-copy. Leses via `t.raw()` (ingen ICU-args).
- `resolveFormatContentKey(mode, teamSize)` i `lib/games/formatLabel.ts` — speiler den fjernede `resolveModeGuide` (stableford-familie med team_size 2 → `stableford-4bbb`).

#### Changed
- `buildFormatGuide`, detaljsiden `/spillformater/[slug]`, spillsidens modus-kort, `FormatGrid` og `CupSetup` leser nå navn fra `modes.*` og innhold fra `formatGuide.content.*` i stedet for DB-oppslag. `/spillformater`-rutene er nå ◐ PPR (ingen ucachet DB-IO).
- `getFormatsForIntent`, `getCupEligibleFormats` og `getAllFormatsWithMappings` slutter å lese `display_name`/`short_description`/`rules_*`; `FormatsManager` rendrer navn via katalogen. Matrise-styringen (synlig/primær/cup/aktiv) er uendret.
- `inviteNotification` leser modus-sammendraget fra `no.json` framfor `MODE_GUIDE` (mail er fortsatt norsk til fase M).

#### Removed
- `lib/formats/getModeContent.ts`, `modeGuide.ts`, `parsePointsTextarea.ts` (med tester) og innholds-editoren i Sekretariatet (`updateFormatContent` + `admin.formats.contentEditor.*`).

#### Migration
- `0097_drop_format_content_columns.sql` dropper de vestigiale innholds-kolonnene på `formats`. Kjøres **etter deploy** (koden slutter å lese dem først), per format-migrasjons-disiplinen.

</details>

## 1.124.y — Duell-kortet tilbake med sideturnering

Issue [#589](https://github.com/jdlarssen/golf-app/issues/589), oppfølging til [#576](https://github.com/jdlarssen/golf-app/issues/576). Da sideturneringen ble lagt til, byttet 1-mot-1-spill ut duell-kortet med et podium så det skulle passe i fanene. Nå er duell-kortet tilbake, og sideturneringen ligger i fanen ved siden av.

### [1.124.0] - 2026-06-13 · #589

> Spiller dere én mot én med en sideturnering på, får du nå duell-kortet i stedet for et podium. Versus-oppgjøret og hull-for-hull-stripen er tilbake, og sideturneringen med lengste drive og nærmest pinnen ligger fortsatt i fanen ved siden av.

<details>
<summary>Teknisk</summary>

[#589](https://github.com/jdlarssen/golf-app/issues/589). #576 wiret sideturnering-fanen inn i poeng-/podium-formatene, men skippet bevisst duell-kortet (`HeadToHeadResult`) ved nøyaktig 2 spillere med sideturnering på — podiet ble brukt i stedet så det passet i `LeaderboardTabs`. Det fjernet den foretrukne 1-mot-1-visningen i det øyeblikket sideturneringen ble skrudd på.

#### Added
- `chromeless`-prop på `HeadToHeadResult` (speiler `BingoBangoBongoPodium`-skallet): dropper eget `AppShell` + tilbake-header når kortet sitter inni `LeaderboardTabs`, så fanen eier TopBar + tilbake-lenke og vi unngår doble skall.

#### Changed
- De fem solo-format-grenene i `leaderboard/page.tsx` som har et 2-spiller-duell-kort (stableford, solo strokeplay, Nassau, Skins, Bingo Bango Bongo) mater nå duell-kortet — i stedet for podiet — inn som `mainContent` i sideturnerings-fanen ved nøyaktig 2 spillere. 3+ spillere bruker podiet som før.
- Matchplay-familien er uberørt (egen `MatchplayMatchView`, sporet i #585).

</details>

## 1.123.y — Venner · forespørsler du har sendt i spiller-valget

Issue [#587](https://github.com/jdlarssen/golf-app/issues/587), oppfølging til [#464](https://github.com/jdlarssen/golf-app/issues/464). «Legg til spiller» viste bare aksepterte venner. Nå teller også folk du har en venneforespørsel gående med, så du slipper å vente på svar før du kan sette opp et spill.

### [1.123.0] - 2026-06-13 · #587

> Folk du nettopp har sendt en venneforespørsel til dukker nå opp i «legg til spiller». Du kan sette dem på et spill med en gang, uten å vente til de har svart.

<details>
<summary>Teknisk</summary>

[#587](https://github.com/jdlarssen/golf-app/issues/587). #464 begrenset picker-kilden i opprett-veiviseren til vennene dine, men kilden (`getFriendIds`/`getFriendPlayerOptions`) returnerte bare `accepted`-vennskap. Pending forespørsler — sendte og mottatte — falt utenfor, så en arrangør som nettopp hadde lagt til kompiser møtte en tom liste.

#### Added
- `connectedIdsFromRows` i `lib/friends/friendGraph.ts` — ren graf-funksjon som samler bruker-ider for alle relasjoner (accepted + pending, begge retninger), søsken til `friendIdsFromRows` (accepted-only). Dekket av nye Type-A-tester i `friendGraph.test.ts`.
- `lib/friends/getFriendConnectionIds.ts` — resolver som speiler `getFriendIds`, men uten `status`-filter. Picker-kilden bruker denne.

#### Changed
- `getFriendPlayerOptions` (ikke-admin opprett-spill, cup-generering, liga) henter nå rader for hele relasjons-settet via `getFriendConnectionIds`.
- Admin-`app/[locale]/admin/games/new/page.tsx` bytter `getFriendIds` → `getFriendConnectionIds` for picker-id-settet.
- `getFriendIds` er urørt — discovery, signup-skip-gaten og lag-resolveren beholder accepted-only-semantikken.

</details>

## 1.122.y — Sideturnering på alle poengformater

Issue [#576](https://github.com/jdlarssen/golf-app/issues/576). Veiviseren tilbød sideturnering (lengste drive / nærmest pinnen) for alle formater, og avslutt-flyten kåret vinnere uansett format — men leaderboardet viste den bare for stableford-familien og best ball. Nå dukker sideturnerings-fanen opp for alle poeng-/podium-formatene.

### [1.122.0] - 2026-06-13 · #576

> Har du skrudd på en sideturnering, vises den nå på leaderboardet for alle poengformatene — ikke bare stableford og best ball. Spiller dere Bingo Bango Bongo, Wolf, Skins, Nassau, Nines eller et lag-format, dukker fanen med lengste drive og nærmest pinnen opp ved siden av resultatet når runden er avsluttet.

<details>
<summary>Teknisk</summary>

[#576](https://github.com/jdlarssen/golf-app/issues/576). `leaderboard/page.tsx` rendret bare `SideTournamentView` i best-ball- og stableford-grenene; alle andre format-grener returnerte sin egen view før side-gatingen. Den stableford-spesifikke `renderStablefordWithSideTournament` er generalisert til `renderSideTournamentTabs` — formatuavhengig (rå-scores + course handicap + stroke-index), så hvert poeng-/podium-format gjenbruker den.

#### Added
- `isMatchplayFamily(mode)` i `lib/scoring/modes/types.ts` — single source of truth for matchplay-formatene, brukt til å holde dem utenfor side-grenen (egen visning på duell-kortet vurderes i egen sak, #585).

#### Changed
- `renderStablefordWithSideTournament` → generisk `renderSideTournamentTabs(teamGrouping: 'solo' | 'byTeamNumber')`.
- Sideturnerings-fanen wires nå inn i solo strokeplay, Wolf, Nassau, Skins, Bingo Bango Bongo, Nines, Round Robin, Acey-Deucey, Texas/scramble-familien, Shamble og Patsome (`finished && side_tournament_enabled` → podium/leaderboard chromeless i `LeaderboardTabs` med side-fanen). Solo-format → individuelle + LD/CTP-kategorier; lag-format → også lag-aggregerte kategorier.
- 10 format-podier fikk en `chromeless`-prop (speiler `SoloStablefordPodium`) så de kan sitte inni fanene.
- Ved nøyaktig 2 spillere med sideturnering beholdes podiet (duell-kortet skippes) så det passer i fane-layoutet.

</details>

### [1.122.1] - 2026-06-13 · #576

> Veiviseren tilbyr ikke lenger sideturnering for matchplay-formatene (singler, fourball, foursomes og de andre vekselslag-spillene). Der vises resultatet som et duell-kort, ikke et leaderboard, så lengste drive / nærmest pinnen hørte ikke hjemme der. Den kommer eventuelt i en egen runde.

<details>
<summary>Teknisk</summary>

[#576](https://github.com/jdlarssen/golf-app/issues/576). Bryteren ble tidligere tilbudt for alle formater, så en spiller kunne slå den på for et matchplay-spill, få vinnere kåret ved avslutning, men aldri se dem. Nå holdes matchplay-familien utenfor: `useGameFormState` deriverer `sideTournamentSupported = !isMatchplayFamily(gameMode)`, begge wizard-seksjonene (`AdvancedSettingsSection` + `BasicsSection`) skjuler fieldset-et når den er false, og det effektive `sideEnabled` tvinges false for matchplay så et stale påslag aldri følger med i payloaden ved format-bytte (rå-staten bevares ved retur til et poeng-format).

</details>

<details>
<summary><strong>1.121.y — i18n · engelsk hjem, spillformater, personvern og påmelding (2 oppføringer)</strong></summary>

Issue [#581](https://github.com/jdlarssen/golf-app/issues/581), del av epic [#60](https://github.com/jdlarssen/golf-app/issues/60). Fase 2f av flerspråkligheten, og den siste UI-streng-ekstraksjonen: hjem-skjermen, spillformat-oppslagsverket, personvernsiden og hele selv-påmeldingen finnes nå på engelsk. Etter denne fasen gjenstår bare databaseinnhold (Fase D), e-post (Fase M) og gælisk/irsk (Fase G).

### [1.121.1] - 2026-06-13 · #559

> Følger du en påmeldingslenke uten å være logget inn, beholdes lenken nå korrekt gjennom innloggingen, så du lander tilbake på riktig påmelding etterpå.

<details>
<summary>Teknisk</summary>

[#559](https://github.com/jdlarssen/golf-app/issues/559) (oppfølging til auth-rekkefølge-fiksen i 1.120.1). Da `/login`-redirecten begynte å fyre, ble det synlig at `next`-parameteren ble sendt ukodet (`next=/signup/[shortId]`). Resten av appen URL-koder `next` (jf. `proxy.ts`-auth-gaten + `login/actions.ts`).

#### Fixed
- Begge redirectene i `signup/[shortId]/page.tsx` (`/login` og `/complete-profile`) URL-koder nå `next`-verdien via `encodeURIComponent`, i tråd med proxy-konvensjonen. `e2e/signup/open-register.spec.ts` logged-out-smoke er grønn.

</details>

### [1.121.0] - 2026-06-13 · #581

> Bruker du Tørny på engelsk, er nå også hjem-skjermen, spillformat-oppslagsverket, personvernsiden og hele påmeldingsflyten oversatt. Med det er hele appens grensesnitt på engelsk. På norsk er alt som før.

<details>
<summary>Teknisk</summary>

[#581](https://github.com/jdlarssen/golf-app/issues/581). i18n Fase 2f — den siste per-område-ekstraksjonen av UI-strenger. Fire offentlige/referanse-flater: hjem-chrome (`app/[locale]/page.tsx`), spillformat-oppslagsverket (`spillformater/**`, kun chrome — DB-drevet format-innhold er Fase D), personvern (`legal/privacy`) og hele selv-påmeldingen (`signup/[shortId]/**`).

#### Added
- `messages/{no,en}.json`: nye topp-namespaces `home.*` (hjem-seksjoner, tom-tilstand, bannere, spill-arkiv), `legal.*` (personvern, alle 6 GDPR-seksjonene med `t.rich`-uthevinger) og `signup.*` (~124 nøkler: gren-bannere, begge skjemaene, `signup.errors.*` + `signup.slotFailReason.*` for validering, `signup.memberStatus.*` for lag-dashbordet); `formatGuide.*` utvidet med side-chrome for spillformater. Gjennom idiomatisk engelsk-pass.
- `formatMonthLongLocale` i `lib/i18n/format.ts` — locale-bevisst «juni 2026» / "June 2026" til spill-arkivets måneds-grupper.

#### Changed
- Alle flatene renderer via `useTranslations`/`getTranslations`; norsk output er uendret (full suite grønn uten assertion-endringer utover `teamFormValidation`/slot-reason-signaturene som nå returnerer feilkoder).
- Modus-navn på spillformater, i påmeldingen og på avsluttet-kortene leses fra `modes.*`-katalogen (ikke `MODE_LABELS`/`formatDisplayLabel`, som var norsk-only); hjem-sidens statusmerker leses fra `gameStatus.*`.
- Hjem-sidens og `FinishedGameCard`s avsluttet-kort bruker nå rute-locale for sluttdatoen (var hardkodet `'no'`); tee-off-linja bruker `*Locale`-dato-hjelperne. `/spill-arkiv` og `groupFinishedByMonth` er locale-bevisste (locale + `noDateLabel` på call-site).
- Klient- og server-valideringen i lag-påmeldingen deler nå de samme feilkodene (`signup.errors.*`/`slotFailReason.*`), oversatt på call-site, så inline-feedback og server-feil aldri spriker.
- `redirect` migrert til `@/i18n/navigation` (objekt-form med `getLocale()`) i hele signup-flyten + `/spill-arkiv`; spillformater-detaljsiden og spill-arkivet fikk locale-bevisst `generateMetadata`.

</details>

</details>

<details>
<summary><strong>1.120.y — Ditt resultat på avsluttede spill (2 oppføringer)</strong></summary>

Issue [#572](https://github.com/jdlarssen/golf-app/issues/572). Hvert avsluttede spill-kort viste samme pokal uansett utfall. Nå viser kortet ditt eget resultat (plassering, matchutfall eller skins), beregnet og lagret når spillet avsluttes, så hjem-siden og arkivet holder seg billige å rendre.

### [1.120.1] - 2026-06-13 · #559

> Følger du en påmeldingslenke uten å være logget inn, havner du nå rett på innlogging og kommer tilbake til påmeldingen etterpå. Før kunne en ugyldig eller utløpt lenke gi en 404-side i stedet.

<details>
<summary>Teknisk</summary>

[#559](https://github.com/jdlarssen/golf-app/issues/559). `/signup/[shortId]` ligger i `PUBLIC_PATH_PATTERN` i `proxy.ts`, så proxyen slipper alle gjennom og siden gater selv. Page-handleren kjørte `getGameByShortId` → `notFound()` *før* `auth.getUser()`-redirecten, så en uautentisert bruker med ugyldig shortId fikk 404 i stedet for innlogging.

#### Fixed
- Auth-sjekken kjører nå før spill-oppslaget: uautentiserte sendes til `/login?next=…` uansett om shortId-en finnes, og `notFound()` gjelder kun innloggede brukere med ugyldig lenke.

</details>

### [1.120.0] - 2026-06-13 · #572

> Hvert avsluttede spill-kort viser nå ditt eget resultat: «🥇 Du vant», «2. plass av 4», «Du vant 3&2» eller «4 skins». Før hadde alle kort samme pokal. Nå ser du med ett blikk hvordan det gikk, uten å åpne leaderboardet.

<details>
<summary>Teknisk</summary>

[#572](https://github.com/jdlarssen/golf-app/issues/572). Resultater ble aldri lagret: `endGame` flippet bare status, og standings regnes på render-tid per modus. Å regne fullt leaderboard per avsluttet kort per sidevisning er for dyrt, så et kompakt per-spiller-utfall persisteres ved avslutning og leses billig på kortet.

#### Added
- `supabase/migrations/0096_game_players_result_summary.sql` — nullbar `result_summary jsonb` på `game_players`. Strukturert union (ikke ferdig streng) så kortet kan oversettes med #60.
- `lib/scoring/resultSummary.ts` (+ Type A-test) — `computeResultSummaries(result)` utleder per-spiller-utfall (placement / matchplay / skins) fra `ModeResult` for alle 20+ modi.
- `lib/scoring/buildModeResultForGame.ts` — request-kontekst-fri `ModeResult`-bygging som gjenbruker leaderboard-flatens per-modus `build*Context`-helpere, så kort og leaderboard aldri driver.
- `lib/games/persistResultSummaries.ts` — best-effort persist via service-role-klienten; kalt fra både `endGame` og `endGameWithSideWinners` etter status-flippen.
- `lib/games/finishedResultBadge.ts` (+ Type A-test) — mapper `ResultSummary` til i18n-nøkkel + `isWin`-flagg (gull-accent til egen seier).
- `messages/{no,en}.json`: nytt `finishedCard.result.*`-namespace (placement med ordenstall-ICU på engelsk, matchplay-utfall, skins-pluralis).
- `scripts/backfillResultSummaries.ts` — engangs-backfill av alle eksisterende ferdigspilte spill.

#### Changed
- `FinishedGameCard` viser nå resultat-badgen (gull-accent ved egen seier, dempet ellers), med 🏆-fallback når `result_summary` mangler. `getFinishedGamesForUser` tar med spillerens egen `result_summary` fra `game_players`-raden.

</details>

</details>

<details>
<summary><strong>1.119.y — Hjem · spill-arkiv og siste runder (1 oppføring)</strong></summary>

Issue [#571](https://github.com/jdlarssen/golf-app/issues/571). Hjem-siden skal være play + discover-navet, ikke et arkiv. «Avsluttede spill» viser nå bare de fem siste rundene; resten ligger i et eget spill-arkiv, gruppert per måned.

### [1.119.0] - 2026-06-13 · #571

> «Avsluttede spill» på hjem-siden viser nå bare de fem siste rundene, med en «Vis alle avsluttede spill»-lenke til et nytt spill-arkiv. Der ligger hele historikken samlet og gruppert per måned, så hjem-siden ikke vokser til en endeløs liste utover sesongen.

<details>
<summary>Teknisk</summary>

[#571](https://github.com/jdlarssen/golf-app/issues/571). «Avsluttede spill» i `HomeBody` rendret alle ferdigspilte spill uten grense og hentet hver rad ved hver sidevisning.

#### Added
- `lib/games/getFinishedGamesForUser.ts` — delt fetch (spørring + `byEndedAtDesc`-sortering), én sannhetskilde for «mine avsluttede spill» brukt av både Hjem og arkiv-siden.
- `components/games/FinishedGameCard.tsx` — kort-renderet løftet ut av `HomeBody` (server-trygt) og delt mellom begge flatene, så de aldri driver fra hverandre visuelt.
- `lib/games/groupFinishedByMonth.ts` (+ co-lokalisert Type A-test) — ren gruppering per måned, nyeste først, med en «Uten dato»-bøtte sist.
- Ny side `app/[locale]/spill-arkiv/page.tsx` — hele historikken gruppert per måned, auth-gatet med tilbake-lenke til Hjem og tom-tilstand.

#### Changed
- `HomeBody` viser nå `finishedGames.slice(0, 5)` via `FinishedGameCard`, med en «Vis alle avsluttede spill →»-lenke til `/spill-arkiv` kun når det finnes flere enn fem. Finished-spørringen er flyttet til den delte helperen, og `game_mode`/`mode_config` er fjernet fra den delte `GameRow`-typen (den aktive spørringen brukte dem aldri).

</details>

</details>

<details>
<summary><strong>1.118.y — i18n · engelsk profil, venner, innboks og finn turneringer (1 oppføring)</strong></summary>

Issue [#573](https://github.com/jdlarssen/golf-app/issues/573), del av epic [#60](https://github.com/jdlarssen/golf-app/issues/60). Fase 2e av flerspråkligheten: de personlige flatene hentes fra omsettbare kataloger og finnes nå på engelsk — profilen med statistikk og historikk, vennelista, innboksen med alle varslene, finn turneringer og bunnmenyen.

### [1.118.0] - 2026-06-13 · #573

> Bruker du Tørny på engelsk, er den personlige delen nå oversatt: profilen din med statistikk og historikk, vennelista, innboksen med alle varslene, «Finn turneringer» og bunnmenyen. På norsk er alt som før.

<details>
<summary>Teknisk</summary>

[#573](https://github.com/jdlarssen/golf-app/issues/573). i18n Fase 2e — per-område-ekstraksjon av de personlige flatene (~25 filer: `profile/**` med slett-konto/historikk/statistikk/venner, `venner/legg-til/**`, `innboks/**` + `components/notifications/*`, `finn-turneringer` + delt `HomeDiscoverySection`, `components/ui/BottomNav`).

#### Added
- `messages/{no,en}.json`: nye topp-namespaces `nav.*` (bunnmeny + bjelle), `friends.*` (venneliste, statusbannere, legg-til-flyt), `inbox.*` (alle 20 varseltypene under `kinds.*`, blokk-årsaker, dag-etiketter, månedsbrev-toggle) og `discover.*` (finn turneringer + oppdagelses-seksjonen på Hjem); `profile.*` utvidet fra én nøkkel til hele flaten — gjennom idiomatisk engelsk-pass.
- `finn-turneringer` har epicens første locale-bevisste `generateMetadata` (mønster for 2f).

#### Changed
- Alle filer i omfanget renderer via `useTranslations`/`getTranslations`; norsk output er uendret (full suite grønn uten assertion-endringer).
- `redirect`/`useRouter` migrert til `@/i18n/navigation` i hele omfanget; server actions bruker objekt-form med `getLocale()`.
- `lib/notifications/groupByDay.ts` og `lib/invitations/quota.ts` er copy-frie: locale + etiketter er påkrevde parametre, oversettes på call-site. Dato- og relativ-tid-rendering i innboks og oppdagelses-kort bruker `*Locale`-hjelperne.
- Varsel-payload-fallbacken «En venn» skrives ikke lenger inn i databasen ved sending; mottakerens locale avgjør teksten ved visning (`inbox.someoneFallback`).

#### Removed
- `formatTimeUntil` fra `lib/invitations/quota.ts` — profilsiden leser strukturert resultat + katalognøkler.

</details>

</details>

<details>
<summary><strong>1.117.y — i18n · engelsk i klubb, liga og cup (4 oppføringer)</strong></summary>

Issue [#566](https://github.com/jdlarssen/golf-app/issues/566), del av epic [#60](https://github.com/jdlarssen/golf-app/issues/60). Fase 2d av flerspråkligheten: klubb-, liga- og cup-flatene (admin og spiller) hentes fra omsettbare kataloger og finnes nå på engelsk — klubbrom og medlemskap, ligastyring med tabeller, cup-styring med matchgenerator, og Klubbhuset.

### [1.117.3] - 2026-06-13 · #570

> Kortene under «Avsluttede spill» på hjem-siden viser nå spillform og sluttdato — «Byneset North · Skins» med «12. jun» under. Før så skins, matchplay og stableford helt like ut, og runder uten dato i navnet hadde ingen tidsforankring.

<details>
<summary>Teknisk</summary>

[#570](https://github.com/jdlarssen/golf-app/issues/570). Finished-kortene i `HomeBody` (`app/[locale]/page.tsx`) viste bare «<bane> · Leaderboard» + 🏆. `ended_at` ble hentet men aldri rendret, og `game_mode` ble ikke hentet i det hele tatt.

#### Changed
- Finished-spørringen henter nå `game_mode, mode_config`; den delte `GameRow.games`-typen deklarerer dem (`GameMode` / `GameModeConfig`). Den aktive spørringen er urørt — aktive kort leser aldri modus (samme presedens som `flight_number`-gapet).
- Kort-undertittelen er nå «<bane> · <spillform>» via variant-bevisst `formatDisplayLabel` (samme helper som `ModeChip` — gir «4BBB Stableford» / «Champagne Scramble» der base-label ville flatet ut varianten). Ordet «Leaderboard» er droppet; 🏆-en + tapp-gjennom kommuniserer allerede destinasjonen.
- Sluttdatoen «12. jun» vises på egen dempet `tabular-nums`-linje via `formatShortDateLocale(ended_at, 'no')`, kun når `ended_at` finnes. Hardkodet `'no'` siden hele hjem-siden ennå er norsk-literal (ingen `t()`); helperen er den locale-bevisste, så bytte til rute-locale er eneste endring når #60 når hjem.

</details>

### [1.117.2] - 2026-06-13 · #569

> «Avsluttede spill» på hjem-siden viser nå nyeste runde øverst. Før sto lista i tilfeldig rekkefølge, så ferske runder kunne havne helt nederst.

<details>
<summary>Teknisk</summary>

[#569](https://github.com/jdlarssen/golf-app/issues/569). Finished-spørringen i `app/[locale]/page.tsx` brukte `.order('ended_at', { foreignTable: 'games' })`, som per supabase-js kun sorterer rader *inne i* den embeddede ressursen — en no-op for to-one-embeds som `games!inner(...)`. Topp-nivå-radene kom derfor i fysisk Postgres-rekkefølge.

#### Fixed
- Hjem-sidens «Avsluttede spill» sorteres nå i JS etter fetch via ny ren komparator `byEndedAtDesc` i `lib/games/finishedOrder.ts` (nyeste `ended_at` først, `null` sist), med co-lokalisert Type A-test på prod-fixturen fra issuet. No-op-`order`-kallet er fjernet. Sweep bekreftet at ingen andre spørringer bruker `foreignTable`-order-mønsteret.

</details>

### [1.117.1] - 2026-06-13 · bug

> Leaderboardet ga serverfeil i mange spillformer (matchplay, skins, nassau og flere) etter en språk-oppdatering tidligere denne uka. Nå virker alle visningene igjen.

<details>
<summary>Teknisk</summary>

#### Fixed

- The i18n string extraction (`b7aa8a1a`) left 12 sync render helpers in `leaderboard/page.tsx` calling `useTranslations`. The helpers are invoked directly from the async page component — after the page's first `await`, React's dispatcher is gone, so next-intl threw `` `useTranslations` is not callable within an async component `` and the route errored for singles matchplay, solo strokeplay, texas scramble, shamble, patsome, nassau, skins, nines, round robin, acey-deucey and the live best-ball views (state 3/3.5). All 12 helpers are now `async` and use `await getTranslations(...)`, mirroring the already-correct `renderWolf`/`renderBingoBangoBongo` siblings. Stableford-family and BBB leaderboards were unaffected.

#### Added

- Drift-guard `i18n/serverHelperHooks.test.ts`: fails the suite if any lowercase server helper calls `useTranslations`/`useLocale`/`useFormatter` — the hook form is reserved for components rendered via JSX.

</details>

### [1.117.0] - 2026-06-12 · #566

> Bruker du Tørny på engelsk, er klubb-livet nå oversatt: klubbrommet med medlemskap og roller, ligaene med tabell og rundestart, cup-styringen med matchgenerator, og Klubbhuset der du styrer spillene dine. På norsk er alt som før.

<details>
<summary>Teknisk</summary>

[#566](https://github.com/jdlarssen/golf-app/issues/566). i18n Fase 2d — per-område-ekstraksjon av klubb/liga/cup (~55 filer: `admin/klubber/**`, `admin/liga/**`, `admin/cup/**`, `klubber/**`, `liga/**`, `klubbhuset/page`, `components/league/*`).

#### Added
- `messages/{no,en}.json`: nye topp-namespaces `klubb.*` (liste, rom, liga-/cup-seksjoner, medlemskapsflytene bli-med/forlat/fjern/rolle, varighet), `liga.*` (protokoll, opprett, styring, slett, spillerside, rundestart, tabell), `cup.*` (protokoll, styring, generer-wizard, slett, opprett, presets) og `klubbhuset.*` — gjennom idiomatisk golf-engelsk-pass.
- `lib/i18n/format.ts` `shortMonthLocale` + `formatShortUTCDayMonthLocale` — liga-vinduer og runde-forhåndsvisning rendrer engelsk under `/en`, byte-identisk norsk ellers (Type A-paritetstester).

#### Changed
- Alle filer i omfanget renderer via `useTranslations`/`getTranslations`; norsk output er uendret (full suite grønn uten assertion-endringer).
- `Link`/`redirect` migrert til `@/i18n/navigation` i hele omfanget; server actions bruker objekt-form med `getLocale()`.
- `lib/clubs/clubStatus.ts` `getClubStatusBadge` returnerer tone-diskriminert union; etikettene oversettes på call-site. `lib/cup/cupTemplates.ts` `CUP_PRESETS` er copy-frie — navn/beskrivelse rendres via `cup.presets.*` på stabile id-er.
- Bevisst ulike registre er bevart med separate nøkler: admin-liga «Pågående» vs spillerside-liga «Aktiv».

#### Removed
- Dupliserte `ROLE_LABELS`-/statusetikett-maps på tvers av 8 filer — sentralisert som katalognøkler.

</details>

</details>

<details>
<summary><strong>1.116.y — i18n · engelsk i Sekretariatet (2 oppføringer)</strong></summary>

Issue [#563](https://github.com/jdlarssen/golf-app/issues/563), del av epic [#60](https://github.com/jdlarssen/golf-app/issues/60). Fase 2c av flerspråkligheten: hele Sekretariatet (admin-flatene) hentes fra omsettbare kataloger og finnes nå på engelsk — resultatprotokollen, spill-styringen, spillere, baner, format-mappingen og lanseringene.

### [1.116.1] - 2026-06-12 · bug

> Dagens språk-oppdatering brakk lagring i appen: å opprette spill (og andre lagre-knapper) ga bare en serverfeil. Det er fikset.

<details>
<summary>Teknisk</summary>

#### Fixed
- `i18n/request.ts`: locale-oppslaget leste `[locale]`-root-param-en ubetinget, men `next/root-params` kan ikke kalles i Server Actions (Next-feil `E1014`). Dermed 500-et alle server actions som kaller `getLocale()`/`getTranslations()` — deriblant `createGameDraft`/`createAndPublishGame` bak opprett-spill-flyten. Oppslaget faller nå tilbake på next-intls `requestLocale` (header satt av proxyens intl-middleware) når root-param-lesingen kaster. Render-fasen leser fortsatt root-param-en, så PPR-shellene forblir statiske per locale (build-verifisert). Regresjonstester i `i18n/request.test.ts`.

</details>

### [1.116.0] - 2026-06-12 · #563

> Styrer du turneringer på engelsk, er hele Sekretariatet nå oversatt: resultatprotokollen, spill-styringen med påmelding, flights og påminnelser, spillere, baner, formater og lanseringer. På norsk er alt som før.

<details>
<summary>Teknisk</summary>

[#563](https://github.com/jdlarssen/golf-app/issues/563). i18n Fase 2c — per-område-ekstraksjon av admin/Sekretariatet (~40 filer: `admin/page`, `admin/games/**` utenom `new`, `admin/spillere/**`, `admin/courses/**` utenom `CourseForm`/`new`, `admin/formats/**`, `admin/lanseringer/**`).

#### Added
- `messages/{no,en}.json`: nytt topp-namespace `admin.*` med under-namespaces `nav` (brødsmuler), `dashboard`, `games`, `game.*` (detalj, banners, seksjoner, rader, CTA-er, knapper, invitasjon, påmelding, flights, edit/slett/avslutt/avslutt-likevel/status/signups/trekk), `players.*` (liste, profil, slett, trekk-tilbake, relativ tid), `courses.*` (katalog, edit, arkiverte tees, slett), `formats.*` (chrome + forklarings-editor) og `launches.*` — gjennom idiomatisk golf-/sekretariat-engelsk-pass.
- `lib/i18n/format.ts` `formatShortDateLocale` + `formatRelativeLocale` — admin-datoer og relativ tid rendrer engelsk under `/en`, byte-identisk norsk ellers (Type A-tester for begge stier). De håndrullede `relativeNb()`/`timeAgo()` beholder sine egne tidsskalaer gjennom katalognøkler.

#### Changed
- Alle filer i omfanget renderer via `useTranslations`/`getTranslations`; norsk output er uendret (full suite grønn uten assertion-endringer).
- `Link`/`redirect`/`useRouter` migrert til `@/i18n/navigation` i hele omfanget; server actions bruker objekt-form med `getLocale()`. `lib/admin/auth.ts`-auth-gaten beholder `next/navigation` (utenfor i18n-scope).
- Feilkode-rendering på admin-sidene bruker `t.has()`-guard mot katalogene; banetabellens edit-feilmeldinger («tee») holdes adskilt fra baneskjemaets («tee-boks»).

#### Removed
- `lib/admin/gameErrorMessages.ts` + drift-guard-testen og `lib/games/createGameLabel.ts` — siste konsumenter migrert til katalogene (`wizard.errors`, `admin.game.errors`, `admin.games`).

</details>

</details>

<details>
<summary><strong>1.115.y — i18n · engelsk i opprett-flyten (1 oppføring)</strong></summary>

Issue [#561](https://github.com/jdlarssen/golf-app/issues/561), del av epic [#60](https://github.com/jdlarssen/golf-app/issues/60). Fase 2b av flerspråkligheten: hele opprett-flyten (spill-veiviseren, hurtig-oppsettet og baneskjemaet) hentes fra omsettbare kataloger og finnes nå på engelsk.

### [1.115.0] - 2026-06-12 · #561

> Setter du opp spill eller baner på engelsk, er hele flyten nå oversatt: veiviseren steg for steg, hurtig-oppsettet og baneskjemaet. Til og med navneforslaget følger språket ditt. På norsk er alt som før.

<details>
<summary>Teknisk</summary>

[#561](https://github.com/jdlarssen/golf-app/issues/561). i18n Fase 2b — per-område-ekstraksjon av create-flowene (~35 filer: `admin/games/new/**`, `opprett-spill`, `opprett-bane`, `admin/courses/{CourseForm,new}` + delte komponenter).

#### Added
- `messages/{no,en}.json`: nye namespaces `wizard.*` (intent-velger, modus-velger, formatgrid-chrome, lagstørrelse, cup-oppsett, alle seksjoner, oppsummeringssteg, hurtig-oppsett/`form`, side-chrome og feilkoder), `courseForm.*` (skjema, begge dørene, feilkoder), `allowance.*` og `modes.playStyle.*` — ~620 nøkler per språk, gjennom idiomatisk golf-engelsk-pass.
- `lib/i18n/format.ts` `formatTeeOffLineLocale` + locale-param på `suggestGameName` — navneforslag og oppsummerings-tidspunkt rendrer engelske månedsnavn under `/en`, byte-identisk norsk ellers (Type A-tester for begge stier).
- Drift-guards (Type A): `ERROR_MESSAGES_NEW_GAME` ↔ `wizard.errors` (mappen består for edit/rediger-sidene til fase 2c) og `PLAY_STYLE_LABELS` ↔ `modes.playStyle`.

#### Changed
- Alle filer i omfanget renderer via `useTranslations`/`getTranslations`; norsk output er uendret (full suite grønn uten assertion-endringer).
- Delte komponenter (`AllowanceField`, `FormatStyleBadge`, `FormatGuideSheet`/`-List`-chrome) oversettes i komponenten — liga-sidene og `/spillformater` får engelsk på kjøpet under `/en`.
- `Link`/`redirect`/`useRouter`/`usePathname` migrert til `@/i18n/navigation` i hele omfanget; server actions bruker objekt-form med `getLocale()`.
- Feilkode-rendering på begge opprett-dørene bruker `t.has()`-guard (ukjente koder gir ingen banner, som før) og ekte ICU `{list}`-interpolasjon for `pending_players`.
- Norsk flyttet ut av lib: `INTENT_LABELS`/`INTENT_DESCRIPTIONS` (slettet), `bruttoHelperFor` → `bruttoHelperKeyFor` (nøkkel-returnerende), `PENDING_PLAYER_LABEL` → katalog, inline-feilmappene i begge bane-dørene → `courseForm.errors`/`adminErrors`.

</details>

</details>

<details>
<summary><strong>1.114.y — i18n · engelsk i hele kjernesløyfa (1 oppføring)</strong></summary>

Issue [#554](https://github.com/jdlarssen/golf-app/issues/554), del av epic [#60](https://github.com/jdlarssen/golf-app/issues/60). Fase 2a av flerspråkligheten: hele spilleflaten (spillside, hull-scoring, scorekort, leaderboard og podier) hentes fra omsettbare kataloger og finnes nå på engelsk.

### [1.114.0] - 2026-06-11 · #554

> Spiller du på engelsk, er hele runden nå oversatt: spillsiden, scoreføringen hull for hull, scorekortet og leaderboardet for alle spillformene. Til og med CSV-eksporten følger språket ditt. På norsk er alt som før.

<details>
<summary>Teknisk</summary>

[#554](https://github.com/jdlarssen/golf-app/issues/554). i18n Fase 2a — per-område-ekstraksjon av kjernesløyfa (~90 filer).

#### Added
- `messages/{no,en}.json`: nye namespaces `gameStatus`, `modes` (+`modeVariants`), `game.*` (home/waitingRoom/submit/approve/finish/delete/withdraw/edit/players), `scorecard`, `holes.*`, `leaderboard.*` (inkl. alle formatvisninger, podier, sideturneringer og CSV-eksport) — flere hundre nøkler per språk.
- `messages/catalogParity.test.ts`: låser `no.json`/`en.json` til symmetriske nøkkelsett.
- `lib/i18n/format.ts`: `formatTeeOffDateLocale`/`-TimeLocale`, `formatShortDateWithYearLocale`, `formatCountdownLocale` — `no` delegerer til de håndrullede hjelperne (byte-identisk norsk), andre språk rendres via `Intl` med Oslo-tidssone.
- Drift-guards (Type A): `STATUS_LABELS`, `MODE_LABELS` og `formatDisplayLabel` asserteres mot katalogverdiene så konstanter og kataloger ikke glir fra hverandre mens admin/wizard fortsatt leser konstantene.

#### Changed
- Alle sider og komponenter under `app/[locale]/games/[id]/**` + `components/hole/**` renderer via `useTranslations`/`getTranslations`; norsk output er uendret.
- `vitest.setup.ts`: stubben oppgradert til next-intl `createTranslator` — ekte ICU-plural/interpolasjon i komponenttester.
- `redirect`/`Link` migrert til `@/i18n/navigation` i alle berørte filer (objekt-form med locale).
- `lib/games/scorecardTitle.ts` og `lib/wolf/holeLabels.ts` returnerer katalognøkler/id-er; `lib/leaderboard/formatHolesList.ts` tar hull-ordet som parameter.
- CSV-eksporten (`leaderboard/export/route.ts`) følger brukerens locale i kolonneoverskrifter og feilmeldinger.
- Engelsk katalog gjennom idiomatisk golf-engelsk-pass; `{suffix}`-interpolasjoner som aldri ble sendt inn erstattet med ICU `selectordinal` (1st/2nd/3rd).

</details>

</details>

<details>
<summary><strong>1.113.y — i18n · norsk og engelsk (5 oppføringer)</strong></summary>

Issue [#552](https://github.com/jdlarssen/golf-app/issues/552). Første synlige del av flerspråkligheten: alle innloggings- og profil-strenger hentes fra omsettbare kataloger, og det dukker opp en liten «Norsk / English»-velger på innloggingssiden og i profilinnstillingene.

### [1.113.4] - 2026-06-11

> Handlingsknappen nederst på hull-skjermen er nå selve bunn-baren: full bredde, kant-til-kant, og knappens farge går helt ned til skjermkanten. Ingen tom stripe under knappen lenger.

<details>
<summary>Teknisk</summary>

Brukerønske: etter at baren ble flush (1.113.3) fylte `--surface`-bakgrunnen safe-area-stripa under den avrundede knappen — en farget stripe mellom knappen og skjermkanten. `BottomActionBar` er nå knappen selv: full-bleed, avrundet topp / flush bunn, og knappens egen farge (`--primary` / `--disabled-bg`) fyller `env(safe-area-inset-bottom)` ned til kanten.

#### Changed
- `components/hole/BottomActionBar.tsx`: fjerner `--surface`-wrapperen; `<button>`/`<SmartLink>` får bar-stilen direkte (`width: 100%`, `borderRadius: 18px 18px 0 0`, `padding-bottom: calc(17px + env(safe-area-inset-bottom))`). Knappens farge eier nå bunn-stripa.

</details>

### [1.113.3] - 2026-06-11

> Handlingsknappen nederst på hull-skjermen («Neste hull» / «Bekreft alle scorer» / «Lever scorekort») ligger nå helt nederst mot skjermkanten, ikke med en stripe luft under seg. Knappen holder seg klar av home-indicator-en på iPhone.

<details>
<summary>Teknisk</summary>

Brukerønske: `BottomActionBar` lå ~34 px over skjermkanten fordi hull-siden la en fast `paddingBottom: 34` på hele wrapperen. Flytter bunn-klareringen inn i baren selv via `env(safe-area-inset-bottom)`, slik den globale `BottomNav` allerede gjør — bakgrunnen går nå flush til kanten og knappen løftes klar av home-indicator-en.

#### Changed
- `components/hole/BottomActionBar.tsx`: `paddingBottom` → `calc(18px + env(safe-area-inset-bottom, 0px))`.
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` + `loading.tsx`: dropper wrapperens `paddingBottom: 34` så baren eier bunn-klareringen alene (skjelett-wrapperen holdes i synk for å unngå layout-hopp).

</details>

### [1.113.2] - 2026-06-11 · #281

> Påminnelsen om at poengene kan gå i minus er borte fra hull-skjermen i modifisert stableford. Den fulle forklaringen ligger fortsatt i spillform-guiden på spill-hjem, så hull-skjermen holder seg ren mens du taster.

<details>
<summary>Teknisk</summary>

[#281](https://github.com/jdlarssen/golf-app/issues/281). Fjerner `modified-stableford-banner` fra `HoleClient` etter brukerønske — påminnelsen ble vurdert som unødvendig støy på score-flaten. Den fulle minus-poeng-tabellen lever videre i format-guiden på spill-hjem.

#### Removed
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx`: minus-poeng-banneret og den nå ubrukte `isModifiedStableford`-konstanten. `stablefordPointsFn` (som velger `computeModifiedStablefordPoints`) er uberørt.
- `HoleClient.test.tsx`: #281-testen asserter nå at banneret IKKE rendres på hull-skjermen.

</details>

### [1.113.1] - 2026-06-11 · #552

> Mens du tastet scorer lå «Neste hull»-knappen delvis gjemt bak bunnmenyen. Nå skjuler bunnmenyen seg på hull-skjermen som den skal, så knappen ligger fritt nederst igjen.

<details>
<summary>Teknisk</summary>

Etterslep fra i18n Fase 1 ([#552](https://github.com/jdlarssen/golf-app/issues/552)). `as-needed`-routingen rewriter `/games/x` → `/no/games/x` internt, og `BottomNav` leste `usePathname` fra `next/navigation` — den lekker det interne `/no`-prefikset under server-render. Hull-regexen `/^\/games\/[^/]+\/holes\//` matchet dermed ikke, baren skjulte seg ikke på hull-skjermen, og den fastlåste `position: fixed`-baren la seg over «Neste hull»-knappen.

#### Fixed
- `components/ui/BottomNav.tsx`: bytter `usePathname`-import til `@/i18n/navigation` (lokale-bevisst) — stripper locale-prefikset konsistent på server og klient, så skjul-regexen treffer i begge faser. Samme fiks retter også fane-markeringen (`aria-current`) på `/no`-prefiksede ruter under server-render. Følger konvensjonen `i18n/navigation.ts` allerede dokumenterer.
- `components/ui/BottomNav.test.tsx`: mocker nå `@/i18n/navigation` for `usePathname` (beholder `next/navigation`-mocken for `SmartLink`s `useRouter`).

</details>

### [1.113.0] - 2026-06-11 · #552

> Du kan nå bytte mellom norsk og engelsk rett på innloggingssiden, før du i det hele tatt har logget inn. Valget huskes, og etter innlogging ligger samme velger under «Språk» på profilen din.

<details>
<summary>Teknisk</summary>

[#552](https://github.com/jdlarssen/golf-app/issues/552). i18n Fase 1 — første vertikale skive av oversettelsespipelinen.

#### Added
- `messages/no.json` + `messages/en.json`: nye namespaces `auth`, `onboarding`, `profile`, `localeSwitcher` med alle brukervendte strenger fra innloggings- og profilflyten.
- `lib/i18n/localeActions.ts`: `setLocale` server-action — validerer locale mot `routing.locales`, setter `NEXT_LOCALE`-cookie (1 år, sameSite lax), oppdaterer `users.locale` best-effort hvis session finnes, redirecter til locale-korrekt versjon av nåværende side via `i18n/navigation.ts redirect`.
- `components/LocaleSwitcher.tsx`: segmentert «Norsk / English»-velger (endonymer, data-testid-er for E2E, tap-targets ≥44 px) — brukt på innloggingssiden og i SettingList på Profil.

#### Changed
- `app/[locale]/(auth)/login/page.tsx` + `_components/SendCodeForm.tsx` + `_components/VerifyCodeForm.tsx`: alle strenger hentes via `getTranslations`/`useTranslations('auth.*')`; ukjent `?error=`-kode faller tilbake til `auth.errors.unknown`.
- `app/[locale]/complete-profile/page.tsx` + `OnboardingHcpField.tsx`: tilsvarende for `onboarding.*`-namespace.
- `app/[locale]/profile/page.tsx`: «Språk»-rad lagt til i `SettingList («Konto og mer»)` med inline `LocaleSwitcher`.
- `app/[locale]/(auth)/login/actions.ts` (`verifyCode`): etter vellykket OTP-verifisering persisteres cookie-locale til `users.locale` dersom den er NULL — aldri overskriver eksisterende verdi.
- `vitest.setup.ts`: `useTranslations`-stub lagt til i next-intl-mock — resolver nøkler mot `messages/no.json` slik at komponenttester fortsetter å asserte ekte norsk copy uten provider.

</details>

</details>

<details>
<summary><strong>1.112.y — Flighter · én gruppe i små spill (8 oppføringer)</strong></summary>

Issue [#543](https://github.com/jdlarssen/golf-app/issues/543). I spill med fire eller færre deltagere går alle i én gruppe — uansett format. Det betyr at du og motstanderen din i en singelmatch kan se og skrive hverandres scorer på direkten, og at spill med wolf alltid behandles som én gruppe.

### [1.112.7] - 2026-06-11 · #543

> Stengt påmelding gjelder nå hele laget: medspillere som svarer på en lag-invitasjon etter at du stengte, får samme beskjed som alle andre.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Evaluator-funn NIT-1: `acceptTeamInvite` og `attachToCaptainTeam` i `teamActions.ts` manglet `signups_closed_at`-guarden som de øvrige påmeldingsstiene fikk i 1.112.6 — en medspiller kunne fullføre lag-aksept på et stengt spill. Begge stiene returnerer nå `signup_closed`, `AcceptDeclineResult`-unionen og `mapError` i `TeamDashboardClient` har fått koden, og lag-dashboardet viser stengt-banner. NIT-2: `(home)/page.tsx` re-deklarerte flight-størrelsen lokalt i stedet for å importere `MAX_FLIGHT_SIZE` fra `flightScope`. Tre nye guard-tester i `teamActions.test.ts`.

</details>

### [1.112.6] - 2026-06-11 · #543

> Du kan nå stenge påmeldingen mens du gjør de siste justeringene — spillere som prøver å melde seg på etter det ser en tydelig melding om at påmeldingen er stengt, og du kan åpne den igjen når du vil.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Arrangøren kan stenge og gjenåpne påmeldingen.

#### Added
- `lib/games/getGameByShortId.ts`: `signups_closed_at: string | null` lagt til i `ShortIdGame`-typen og SQL-spørringen.

#### Changed
- `app/[locale]/signup/[shortId]/actions.ts`: `ActionError`-union får `'signup_closed'`. Begge `registerForOpenGame` og `requestApproval` sjekker `signups_closed_at != null` etter game-locked-guard og returnerer `{ ok: false, error: 'signup_closed' }` ved treff.
- `app/[locale]/signup/[shortId]/teamActions.ts`: `TeamRegistrationError`-union får `'signup_closed'`. `submitTeamRegistration` får tilsvarende guard.
- `app/[locale]/signup/[shortId]/RegistrationForm.tsx` + `TeamRegistrationForm.tsx`: `signup_closed`-nøkkel i `ERROR_MESSAGES`.
- `app/[locale]/signup/[shortId]/page.tsx`: ny `signupsClosed`-branch i `renderBody` — viser `<Banner tone="info">` med melding om at arrangøren gjør siste justeringer.
- `app/[locale]/signup/[shortId]/actions.test.ts`: 3 nye tester — `requestApproval > signups_closed_at satt`, `registerForOpenGame > signups_closed_at satt`, `registerForOpenGame > signups_closed_at null → ikke signup_closed`.

</details>

### [1.112.5] - 2026-06-11 · #543

> I venterommet kan du nå velge flight selv — du ser hvor mange som allerede er i hver gruppe, og appen hindrer at en flight fylles opp med mer enn fire spillere.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Selvbetjening i venterommet — spillere velger flight.

#### Added
- `app/[locale]/games/[id]/flightJoinActions.ts`: server-action `joinFlight(gameId, targetFlight)` — verifiserer aktiv deltakelse, sjekker kapasitet før skriv, skriver ny `flight_number`, og re-teller etter skriv for å fange race-conditions (angrer ved overbooking). Returnerer `FlightJoinResult`.
- `app/[locale]/games/[id]/flightJoinActions.test.ts`: 6 enhetstester — not_authed, not_member (ingen rad), not_member (trukket), flight_full (4 i flight), happy path + revalidateTag, race-guard-revert ved after-count > 4.

#### Changed
- `app/[locale]/games/[id]/ScheduledWaitingRoom.tsx`: viser flight-velger når `flightOptions` er satt — én knapp per flight med antall/navn, kaller `joinFlight` og viser norsk feilmelding ved `flight_full`.
- `app/[locale]/games/[id]/(home)/page.tsx`: beregner `flightOptions` og `currentFlightNumber` ved `scheduled`-status når `eligibleForFlightAssignment`. Banner med antall ufordelte spillere vises når `unassigned_flights`-vakta stopper auto-start.

</details>

### [1.112.4] - 2026-06-11 · #543

> Du kan nå fordele spillere i flighter direkte fra Sekretariatet. Appen foreslår inndeling automatisk, og du kan flytte enkeltspillere fritt mellom flighter — med en kapasitetsgrense på fire per group.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Flight-inndeling i admin-sidekanalens spillside.

#### Added
- `app/[locale]/admin/games/[id]/FlighterSeksjon.tsx`: ny klient-komponent som viser flight-buckets, «Uten flight»-advarsel, «Foreslå inndeling»-knapp og per-spiller flight-velger med «Flytt»-knapp. Bruker `useTransition` for optimistisk feedback.
- `app/[locale]/admin/games/[id]/flightActions.ts`: tre server-actions — `suggestFlightAssignment` (beregner fordeling via `suggestFlightSplit`, skriver én `UPDATE` per aktiv spiller), `setPlayerFlight` (kapasitetssjekk + skriv), `toggleSignupsClosed` (setter/fjerner `signups_closed_at`, validerer `status === 'scheduled'`). Alle autentisert via `requireAdminOrCreator`.
- `app/[locale]/admin/games/[id]/flightActions.test.ts`: 8 enhetstester — authz-rejects, kapasitets-avvisning, happy-path for alle tre actions og toggle-revert.
- `lib/games/flightScope.ts`: `eligibleForFlightAssignment(gameMode, players)` og `flightBuckets(players)` — avgjør om flight-UI vises og bygger buckets for visning.
- `lib/games/flightScope.test.ts`: 8 nye tester for `eligibleForFlightAssignment` og 4 for `flightBuckets`.

#### Changed
- `app/[locale]/admin/games/[id]/page.tsx`: `FlighterSeksjon` rendres når `eligibleForFlightAssignment` og spillet er `scheduled`/`active`. «Administrer påmelding»-seksjon viser «Steng»/«Gjenåpne»-knapper wired til `toggleSignupsClosed`. Statusbannere for `flight_suggested`, `flight_updated`, `signups_closed`, `signups_reopened` lagt til.
- `lib/admin/gameErrorMessages.ts`: `signups_not_scheduled`, `flight_full`, `bad_flight` — nye feilnøkler for flight-actions.

</details>

### [1.112.3] - 2026-06-11 · #543

> Motstanderen din i en singelmatch kan nå godkjenne scorekortet ditt, og ved innlevering får hen varslet automatisk.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Attestant-krets for én-flight-spill.

#### Changed
- `app/[locale]/games/[id]/approve/actions.ts`: `loadAndAuthorize` bruker nå `peersForApproval` fra `flightScope.ts` — henter alle aktive spillere i spillet og bruker én-flight-regelen til å avgjøre om attestasjon er tillatt. `games`-spørringen henter nå `game_mode` i tillegg til `status`.
- `app/[locale]/games/[id]/submit/actions.ts`: peer-varsel-loopen bruker `peersForApproval` — `games`-spørringen henter nå `game_mode`. Peers-spørringen henter `withdrawn_at` i tillegg til `flight_number`.

#### Tests
- `approve/actions.test.ts`: oppdatert mock-sekvens (én game_players-spørring i stedet for to); ny test for singles matchplay motstander-godkjenning; ulik-flight-testen oppdatert til >4-spill-scenario.
- `submit/actions.test.ts`: ny test — singles matchplay singleFlight sender peer-varsel til motstanderen.

</details>

### [1.112.2] - 2026-06-11 · #543

> I singelmatch ser begge spillerne hverandres scorer direkte, og motstanderen kan godkjenne scorekortet ditt — uten at noen trenger å sette opp noe.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Hull-side og attestant-krets for én-flight-spill.

#### Changed
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx`: roster-logikk bruker `isSingleFlightGame` — ved ≤4 aktive spillere eller wolf vises alle aktive spillere uavhengig av `flight_number`. Shared-ball-formater (texas/foursomes/greensome m.fl.) bygger nå ett lagkort **per lag** (ikke bare «mitt lag») ved singleFlight; handicap-formlene er identiske med eksisterende logikk per side.
- `app/[locale]/games/[id]/(home)/page.tsx`: «DIN FLIGHT»-seksjonen bruker ny roster-logikk — ikke-solo + singleFlight viser hele gruppen (FlightRoster med `flightNumber=null`). `FlightRoster` støtter `flightNumber: number | null`. `PendingApprovalsBanner` er oppdatert tilsvarende.
- `app/[locale]/games/[id]/approve/actions.ts`: autorisasjons-gate bruker nå `peersForApproval` fra `flightScope.ts` istedenfor direkte flight-sammenligning — motstander i singelmatch (og alle i ≤4-spill) kan attestere.
- `app/[locale]/games/[id]/submit/actions.ts`: peer-varsel-loop bruker `peersForApproval` — samme utvidelse.
- `lib/games/flightScope.ts`: ny eksportert funksjon `peersForApproval(players, gameMode, userId)` — returnerer user_id-ene som kan attestere et scorekort.

#### Tests
- `lib/games/flightScope.test.ts`: 7 nye tester for `peersForApproval` — singelmatch, foursomes, wolf 5, >4 assigned flights, >4 flightless, trukkede ekskludert, self ekskludert.
- `approve/actions.test.ts`: oppdatert til ny query-sekvens (én game_players-spørring for hele spillet); ny test for singleFlight-motstander-godkjenning.
- `submit/actions.test.ts`: ny test for singles matchplay — motstander varsles som peer.

</details>

### [1.112.1] - 2026-06-11 · #543

> Store spill med mer enn fire spillere kan ikke lenger starte automatisk ved tee-tid før alle spillere er fordelt i flighter.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Start-vakt for uinndelte store spill.

#### Changed
- `lib/games/startScheduledGame.ts`: ny `unassigned_flights`-reason — henter `flight_number` fra `game_players`, og avviser start hvis `needsFlightAssignment` er sann (>4 aktive, ikke wolf, minst én uten flight). Vakta kjører etter `incomplete_sides`-vakta og gjenbruker den eksisterende roster-spørringen.
- `lib/admin/gameErrorMessages.ts`: `ERROR_MESSAGES_EXISTING_GAME` får `unassigned_flights`-nøkkel med norsk melding.
- `lib/games/startScheduledGame.test.ts`: 6 nye tester i egen blokk — >4 flightless solo blokkert, >4 fullt tildelt tillatt, ≤4 flightless tillatt (single-flight-regelen), wolf med 5 flightless tillatt, singles matchplay upåvirket.

</details>

### [1.112.0] - 2026-06-11 · #543

> I singelmatch og andre spill med inntil fire spillere ser og fører dere scorer for hverandre — uten ekstra oppsett.

<details>
<summary>Teknisk</summary>

[#543](https://github.com/jdlarssen/golf-app/issues/543). Én-flight-regelen og fundament for flight-inndeling i store spill.

#### Added
- `lib/games/flightScope.ts` (ny): ren TypeScript-modul med `isSingleFlightGame`, `needsFlightAssignment`, `unassignedActivePlayers`, `suggestFlightSplit`, `flightBuckets` og `MAX_FLIGHT_SIZE`. Wolf er alltid én gruppe; ellers er ≤4 aktive spillere grensen. 32 unit-tester.
- `supabase/migrations/0095_flight_single_group_and_assignment.sql`: erstatter `can_score_for` og `same_flight_or_solo` med én-flight-logikk (≤4 aktive ELLER wolf → ubegrenset kryss-skriv og kryss-les, uavhengig av `flight_number`-verdier). Fjerner øvre grense på `flight_number`-CHECK (`>= 1` i stedet for `BETWEEN 1 AND 4`). Ny kolonne `games.signups_closed_at timestamptz null`.
- `supabase/tests/flight_scope_rls_test.sql`: pgTAP-suite (12 asserts) som verifiserer de fire RLS-invariantene: singelmatch kryss-skriv/-les tillatt, wolf 5 spillere tillatt, 6-spillers flight-løst spill blokkert, 6-spillers med flighter — samme-flight tillatt/kryss blokkert.
- `lib/database.types.ts`: `signups_closed_at: string | null` i `games.Row`; valgfri i `Insert`/`Update`.

#### Changed
- `lib/games/startScheduledGame.ts`: `flight_number` hentes nå fra `game_players`-spørringen; ny `unassigned_flights`-vakt etter `incomplete_sides`-vakta — store solo-spill (>4 aktive, ikke wolf) starter ikke før alle spillere har flight. `StartScheduledGameResult` får `'unassigned_flights'` som ny `reason`.
- `lib/admin/gameErrorMessages.ts`: norsk melding for `unassigned_flights` i `ERROR_MESSAGES_EXISTING_GAME`.

</details>

</details>

<details>
<summary><strong>1.111.y — Planlagt start · presis på tee-tid (1 oppføring)</strong></summary>

Issue [#502](https://github.com/jdlarssen/golf-app/issues/502). Planlagte spill venter ikke lenger på at noen åpner appen: en bakgrunnsklokke starter runden på tee-tidspunktet, spillerne får beskjed i innboksen, og oppretteren varsles hvis noe står i veien for starten.

### [1.111.0] - 2026-06-11 · #502

> Planlagte spill starter nå presis på tee-tid, helt av seg selv. Alle spillere får et «Runden er i gang»-varsel i innboksen, og kan ikke spillet starte (for eksempel fordi en side mangler folk), får den som opprettet spillet beskjed om hvorfor.

<details>
<summary>Teknisk</summary>

[#502](https://github.com/jdlarssen/golf-app/issues/502). Tidsstyrt auto-start via pg_cron i Supabase — Vercel Hobby-cron (1×/dag) er for grov for tee-off-presisjon, og handicap-frysingen kan ikke gjøres i ren SQL, så Postgres ringer appen.

#### Added
- `app/api/cron/start-scheduled-games/route.ts` — POST-endepunkt gated på `CRON_SECRET`-bearer (samme secret som product-update-digesten). Sweeper `status='scheduled'` med passert tee-tid (7-dagers vindu), kjører `startScheduledGame` per spill, `revalidateTag` + `game_started`-fan-out for flip-vinnere, `auto_start_blocked`-varsel for strukturelt blokkerte. `maxDuration = 60`.
- Migrasjon `0094_scheduled_start_cron.sql`: enabler `pg_cron` + `pg_net`, cron-jobb hvert minutt med EXISTS-gate (HTTP fyres kun når noe faktisk er due) og secret fra Vault, partiell indeks på `games(scheduled_tee_off_at) where status='scheduled'`, ny kolonne `games.auto_start_blocked_notified_at`, CHECK-utvidelse for de to nye varsel-kindene.
- To nye notification-kinds i `lib/notifications/`: `game_started` (fan-out-helper `notifyPlayersGameStarted` i `events.ts`, kun in-app — push-kandidat når #24 bygges) og `auto_start_blocked` (`autoStartBlocked.ts`, atomisk én-gangs-guard etter deliveryReminder-mønsteret, kun strukturelle årsaker). Kort-rendering + innboks-deeplinks wiret.

#### Changed
- `lib/games/startScheduledGame.ts`: resultatet bærer nå `started`-flagg (flip-vinneren får `true`, no-op-tapere i kappløp `false`) — varsel-fan-out skjer nøyaktig én gang uansett om cron, side-besøk eller admin-knappen vant.
- E1-fallbacken på spill-siden og admin «Start runden nå» fan-outer `game_started` til de andre spillerne når de vinner flippen (aktøren ekskluderes).

</details>

</details>

<details>
<summary><strong>1.110.y — Matchplay · duellkort i resultatlista (3 oppføringer)</strong></summary>

Issue [#546](https://github.com/jdlarssen/golf-app/issues/546). Hele matchplay-familien får skins-duellens utseende i leaderboarden: vunne hull i hver sin farge, dragkamp-stripe, én rute per hull og en dom på matchplay-språket («3&2», «2up», «AS»). Tabellen viser i tillegg stillingen etter hvert hull.

### [1.110.2] - 2026-06-11 · #546

> Svært lange navn eller lagnavn sprenger ikke lenger bredden på duellkortet — de brytes over flere linjer.

<details>
<summary>Teknisk</summary>

[#546](https://github.com/jdlarssen/golf-app/issues/546). Evaluator-NIT: sub-linjene i versus-panelene (`MatchplayDuelCard.tsx`) manglet `break-words` (navnet over hadde det). Lagt på `max-w-full break-words`.

</details>

### [1.110.1] - 2026-06-11 · #546

> Lagmatchene har fått samme duellvisning: fourball, foursomes, greensome, chapman og gruesome viser nå lagene mot hverandre med vunne hull, dragkamp-stripe og stilling etter hvert hull.

<details>
<summary>Teknisk</summary>

[#546](https://github.com/jdlarssen/golf-app/issues/546). Fourball + foursomes-familien over på duellkortet.

#### Changed
- `FourballMatchplayView.tsx`: duellkort erstatter status-banner + lag-kort; versus-panelene viser lagets spillere som sub-linjer («{navn} · HCP {effektiv}»); «Stilling»-kolonne i grid-en; meta-rad fjernet. Server-komponent nå (client-state bor i kortet).
- `FoursomesMatchplayView.tsx`: samme — sub-linjer er spillernavn + «Lag-HCP: {kombinert} (+{extra} slag)». Greensome/chapman/gruesome rendres via samme view og arver redesignet uten egne endringer.

</details>

### [1.110.0] - 2026-06-11 · #546

> Resultatlista for matchplay 1 mot 1 ser nå ut som en duell: vunne hull i hver sin farge, en dragkamp-stripe som viser styrkeforholdet, og én rute per hull. Dommen står under («Kari vant 3&2»), og tabellen viser stillingen etter hvert hull: 1up, 2up, AS.

<details>
<summary>Teknisk</summary>

[#546](https://github.com/jdlarssen/golf-app/issues/546). Singles matchplay først; fourball/foursomes følger i neste oppføring.

#### Added
- `MatchplayDuelCard.tsx` — delt client-kort for matchplay-familien med samme visuelle språk som skins-duellens `HeadToHeadResult` (`--player-a`/`--player-b`, dragkamp-bar, momentum-strip, tegnforklaring), men matchplay-nativ dom i fem tilstander (vant `formatted` / endte AS / ikke startet / alt likt / leder N up). Konfetti-reglene (kun avgjort vinner, én gang per sesjon, historiske sessionStorage-prefikser) er flyttet inn i kortet. Testid-kontraktene `*-banner-decided`/`*-banner-tied`/`*-banner-live` og `*-side-1`/`*-side-2` bevart.
- `lib/scoring/modes/matchplayRunningStatus.ts` — ren helper for løpende match-status per hull (`runningMatchStatus` + `runningStatusLabel`), TDD med 9 Type-A-tester. Uspilte hull gir `null` og endrer ikke stillingen, også midt i sekvensen.

#### Changed
- `MatchplayMatchView.tsx`: duellkortet erstatter status-banner + side-kort; per-hull-tabellen har ny «Stilling»-kolonne (1up/2up/AS farget mot lederens side-farge, «—» for uspilte hull); meta-raden (Spilt/Igjen/Status) er fjernet — dekkes av kortet og kolonnen. View-en er nå server-komponent (all client-state bor i kortet).

</details>

</details>

<details>
<summary><strong>1.109.y — Matchplay · åpen påmelding med side-valg (4 oppføringer)</strong></summary>

Issue [#544](https://github.com/jdlarssen/golf-app/issues/544). Åpne matchplay-spill har nå et skikkelig påmeldingsløp: du velger hvilken side du vil spille på, og spillet kan ikke starte automatisk før begge sider er fulltallige.

### [1.109.3] - 2026-06-11 · #544

> Admin kan ikke lenger sette i gang et matchplay-spill med tomme eller skjeve sider — den manuelle start-knappen sjekker nå det samme som automatisk tee-tidstart.

<details>
<summary>Teknisk</summary>

[#544](https://github.com/jdlarssen/golf-app/issues/544). Tre evaluator-funn tettet:

#### Fixed
- **SF-1 (`startGame` manglet vakt):** `app/[locale]/admin/games/[id]/actions.ts` — `startGame` (utkast→aktiv) kjørte `isMatchplayMode`/`isSideRosterComplete`-sjekk. Laster nå `game_mode` + `mode_config` + `team_number` + `withdrawn_at` fra `game_players` og redirecter til `?error=incomplete_sides` hvis sidene er ufullstendige — uten å flippe status. Ny test: matchplay-utkast med ufullstendig roster → redirect, ingen status-flip.
- **SF-2 (race guard ikke-deterministisk):** `app/[locale]/signup/[shortId]/actions.ts` — race-guard byttet fra re-telling til SELECT-og-sjekk-vinnersett: etter insert hentes alle aktive spillere på siden sortert `accepted_at ASC, user_id ASC`; bare de første `teamSize` radene er vinnere. Begge tapere beregner samme vinnersett → siden strandes aldri tom. Tre nye tester: taper sletter rad + side_full, vinner beholder rad + redirect, happy-path med ny mock-struktur.
- **SF-3 (insert-payload uassertert):** `app/[locale]/signup/[shortId]/actions.test.ts` — success-test + regresjonstest asserter nå `team_number`/`flight_number` i insert-kallet via `adminMock.__fromCalls`.

#### Changed (NIT)
- `lib/games/matchplaySides.test.ts`: ny `isSideRosterComplete`-case for overbooket side (2 aktive på side 1, 1 på side 2, teamSize=1 → false).
- `app/[locale]/games/[id]/(home)/page.tsx` linje 367: `'team_size' in …`-mønster erstattet med `(… as { team_size?: number } | null)?.team_size ?? 1` — konsistent med `actions.ts`.
- `CHANGELOG.md`: 1.109.y-serien reordnet til synkende rekkefølge (2→1→0 var 0→2→1).

</details>

### [1.109.2] - 2026-06-11 · #544

> Småpuss på tekstene fra side-valget: venter-varselet sier nå «1 spiller» / «2 spillere» i stedet for bare tallet, og «booket»-formuleringene er byttet ut med vanlig norsk.

<details>
<summary>Teknisk</summary>

[#544](https://github.com/jdlarssen/golf-app/issues/544). Copy-polish etter humanizer-gjennomgang: `game_full`-melding + fullt-banner i `RegistrationForm.tsx` («booket» → «alle plassene er tatt»), `incomplete_sides` i `gameErrorMessages.ts` («fullbooket» → «fulltallige»), entall/flertall-bøying i venter-banneret på game-home.

</details>

### [1.109.1] - 2026-06-11 · #544

> Etter tee-tid vises nå et varsel på spillsiden som forteller hvilken side som mangler spillere — slik at du vet hvorfor spillet ikke har startet.

<details>
<summary>Teknisk</summary>

[#544](https://github.com/jdlarssen/golf-app/issues/544). Venter-banner i game-home planlagt-tilstand.

#### Added
- `app/[locale]/games/[id]/(home)/page.tsx`: når `startScheduledGame` returnerer `incomplete_sides` i E1-blokken, beregnes shortfall via `computeSideShortfall` og vises som `<Banner tone="warning">` med side-spesifikk tekst om antall manglende spillere.

</details>

### [1.109.0] - 2026-06-11 · #544

> Melder du deg på et åpent matchplay-spill, velger du nå hvilken side du vil spille på. Siden som allerede har en spiller er forhåndsmarkert, og full side er sperret. Spillet starter ikke ved tee-tid hvis sidene ikke er klare.

<details>
<summary>Teknisk</summary>

[#544](https://github.com/jdlarssen/golf-app/issues/544). Side-valg ved åpen påmelding for alle seks matchplay-modi (singles/fourball/foursomes/greensome/chapman/gruesome).

#### Added
- `lib/games/matchplaySides.ts`: `isMatchplayMode()`, `countSidePlayers()`, `computeSideShortfall()`, `isSideRosterComplete()` — ren Type-A-logikk, 29 unit-tester.
- Side-velger i `RegistrationForm.tsx`: to side-kort med spillernavn + ledige plasser; full side sperret, eneste ledige side forhåndsvalgt (nullfriksjon for singles); «Spillet er fullt»-tilstand erstatter skjemaet når begge sider er opptatt.
- `startScheduledGame.ts`: ny `incomplete_sides`-vakt for matchplay-familien — spillet flipper ikke til `active` hvis sidene er underbemannet eller en spiller mangler side-tilordning. 20 unit-tester.
- `app/[locale]/games/[id]/(home)/page.tsx`: venter-banner i planlagt-tilstanden etter tee-tid med tekst om hvilken side som mangler hvor mange spillere.
- Race guard i `registerForOpenGame`: re-telling etter insert, slett egen rad og returner `side_full` ved overbooking.
- Norsk feilmelding for `incomplete_sides` i `gameErrorMessages.ts`.

#### Changed
- `registerForOpenGame` leser `side`-felt fra formData for matchplay-modi; inserter `team_number = side, flight_number = side` (oppfyller `game_players_team_flight_consistency`-constraint). Ikke-matchplay-modi uendret (`null/null`).
- `signup/[shortId]/page.tsx`: laster ikke-trukket roster for matchplay-åpne-spill og sender `MatchplaySideData` ned til `RegistrationForm`.

#### Notes
- Manual-approval-flyten mangler fortsatt side-felt (`game_registration_requests` har ingen side-kolonne) — autostart-vakta beskytter. Egen issue hvis behovet oppstår.
- Admin kan overstyre side-tilordning via edit-flyten (admin-wizard allerede laster `team_number`).
- Legacy null-rader fra before-fix-perioden: vakta blokkerer; admin tildeler side via edit-flyten.

</details>

</details>

<details>
<summary><strong>1.108.y — Cup · alle kan arrangere (7 oppføringer)</strong></summary>

Issue [#526](https://github.com/jdlarssen/golf-app/issues/526). Cup er ikke lenger låst til admin. En vanlig spiller kan lage og kjøre sin egen cup blant venner — en «1 helg»-Ryder Cup capped til 4 matcher og 24 spillere. Global admin er fortsatt uten tak.

### [1.108.6] - 2026-06-10 · #538

> Appen svarer raskere når du åpner den kaldt eller laster en side på nytt: rammen rundt innholdet kommer fra et lynraskt lager i stedet for å vente på serveren, og selve innholdet strømmer inn rett etterpå.

<details>
<summary>Teknisk</summary>

[#538](https://github.com/jdlarssen/golf-app/issues/538), fase 2 av #416. `cacheComponents: true` i `next.config.ts` — stabilt toppnivå-flagg i Next 16 (etterfølgeren til `experimental.ppr`, som issuet trodde fortsatt var eksperimentell). Alle 81 side-ruter bygger nå som `◐` Partial Prerender: statisk skall (chrome + loading-fallbacks) servert fra CDN, dynamisk innhold streamet bak Suspense. Route handlers (api/ikoner/export) forblir `ƒ`.

#### Changed
- **Root layout:** `getProxyVerifiedUserId()` (runtime-API `headers()`) flyttet ut av selve layouten til ny `BottomNavGate` bak `<Suspense fallback={null}>` — kjørte den i layouten, fikk ingen rute statisk skall. `PerfHud` (klient, `usePathname()`) tilsvarende Suspense-wrappet; pathname er runtime-data under flagget.
- **12 × `export const dynamic = 'force-dynamic'` fjernet** (liga-/admin-/api-/spillformater-ruter): inkompatibelt med flagget og redundant — uncachet IO prerendres aldri under cacheComponents, så bekymringen direktivene adresserte (statisk prerender uten env) er borte by design.

#### Notes
- Null `'use cache'`-direktiver innført — alt cookie-/RLS-avhengig innhold streames. `proxy.ts`, `lib/supabase/server.ts` og hele auth-modellen urørt. `getGameWithPlayers` beholder `unstable_cache` (støttet under flagget).
- Navigasjon bruker nå React `<Activity>` (ruter skjules i stedet for unmount; effects ryddes ved skjuling, så RealtimeMount-cleanup består).
- Før-måling prod (www, 5 samples, kveld): `/login` TTFB median ~240 ms, `/legal/privacy` ~240 ms. Etter-måling i issue-kommentar.

</details>

### [1.108.5] - 2026-06-10 · #539

> Åpner du et avsluttet spill fra hjem-skjermen, blinker det ikke lenger tre ulike lasteskjermer før resultatlista kommer. Nå ligger én rolig plassholder i riktig fasong til resultatene er klare.

<details>
<summary>Teknisk</summary>

[#539](https://github.com/jdlarssen/golf-app/issues/539). Deep-link inn på leaderboard traff en kaskade av tre mismatchende loading-skeletons (SPA-nav) / to (hard reload). Root cause: Next 16-prefetch viser «layout to first loading boundary» — første grense under `games/[id]/` var game-home-skjelettet, uansett hvilken underside man navigerte til; i tillegg byttet en indre `<Suspense>`-grense i leaderboard-sida ett leaderboard-skjelett mot et annet uten streaming-gevinst.

#### Fixed
- **Route group `(home)`:** `games/[id]/page.tsx` + `loading.tsx` flyttet inn i `games/[id]/(home)/` (URL uendret). GameLoading-skjelettet dekker nå kun game-home; leaderboard-navigasjon får `leaderboard/loading.tsx` (riktig form) som instant-state fra første frame.
- **Indre Suspense-grense fjernet i `leaderboard/page.tsx`:** route-`loading.tsx` dekker hele ventetiden; `LeaderboardBodySkeleton` slettet. Ett stabilt skjelett på både SPA-nav og reload.
- **Nye loading-grenser:** `holes/[holeNumber]/loading.tsx` (hull-formet) og `scorecard/loading.tsx` (scorekort-formet, gjenbruker tabell-skjelettet via ny delt `TableSkeleton.tsx`) — undersidene som tidligere «arvet» game-home-skjelettet i feil form. Øvrige undersider (submit/approve/avslutt/spillere/rediger/slett/trekk-fra) får bevisst ingen egen grense; SPA-nav beholder forrige side til ny er klar.

#### Notes
- `games/[id]/layout.tsx` (RealtimeMount-gating + SyncBanner) er urørt — gjelder fortsatt alle undersider.

</details>

### [1.108.4] - 2026-06-09 · #416

> Scorekortet, spillerlista og resultatsiden laster et hakk kjappere: de henter det de trenger samtidig i stedet for å vente på én ting av gangen.

<details>
<summary>Teknisk</summary>

[#416](https://github.com/jdlarssen/golf-app/issues/416). Profilering av de hotteste innloggede rutene (`app/games/[id]/*` + `app/page.tsx`). Mesteparten var allerede slankt — `getGameWithPlayers` er tag-cachet, hjem/hull/leaderboard kjører allerede `Promise.all` + `Suspense`, ingen rute har `force-dynamic`. Tre reelle funn rettet, ingen auth- eller RLS-endring.

#### Changed
- **Scorekort (`scorecard/page.tsx`):** auth-konteksten (cookie-rundtur) og det tag-cachede spill-oppslaget kjørte sekvensielt. De er uavhengige (spill-payloaden trenger ikke `userId`; authz beholdes på `me = players.find(...)`-call-site), så de er slått sammen til én `Promise.all`. Sparer én rundtur på den vanlige innloggede stien.
- **Spillere (`spillere/page.tsx`):** før runde-start hentet sida ventende invitasjoner og medspiller-nettverket (`getTeamCandidates`) i to sekvensielle awaits. De er uavhengige → én `Promise.all`.
- **Leaderboard (`leaderboard/page.tsx`):** sideturnerings-grenen for stableford kjørte en ny, identisk `scores`-query selv om `LeaderboardBody` allerede hadde hentet alle scorene for spillet. Rå-scorene tres nå gjennom til `renderStablefordWithSideTournament` som parameter — én duplikat-query fjernet på finished + sideturnering-stien.

#### Notes
- Forventet gevinst er beskjeden: kun scorekort-stien sparer en rundtur på hver navigasjon; spillere-fiksen treffer kun pre-start, leaderboard-fiksen kun finished-spill med sideturnering. Det arkitektoniske ~250ms-gulvet kommer fra at hver rute er dynamisk via cookie-auth — det røres ikke her.
- **PPR (fase 2, ikke implementert):** I Next 16.2.6 finnes `experimental.ppr` ikke lenger — config kaster `HardDeprecatedConfigError` og peker til `cacheComponents` (Partial Prerendering er nå en del av den). Det er fortsatt eksperimentelt, krever per-rute `experimental_ppr = true` + en statisk-skall-oppdeling av layoutene, og gir usikker gevinst mot prod-risiko. Anbefaling: vent — ta det først om det dynamiske gulvet beviselig plager brukerne etter at DB-arbeidet (#412–#414) har satt seg.

</details>

### [1.108.3] - 2026-06-09 · #412 #413 #414

> Leaderboarden henter resultater kjappere når mange har tastet inn. Databasen sjekker hvem som får se hva én gang per oppslag i stedet for én gang per rad, så jo større turneringen blir, jo mer monner det.

<details>
<summary>Teknisk</summary>

[#412](https://github.com/jdlarssen/golf-app/issues/412) + [#414](https://github.com/jdlarssen/golf-app/issues/414). Ren ytelses-migrasjon på RLS-policyene — ingen endring i hvilke rader noen ser, verifisert mot verbatim før/etter-dump av `pg_policies` (uendret access-sett per tabell/handling/rolle) + utvidet RLS-rigg.

#### Changed
- Migrasjon `0092_rls_policy_perf.sql`.
- **#412 `auth_rls_initplan`:** Alle 55 public-policyer som kalte `auth.uid()` / `auth.role()` / `auth.jwt()` direkte wrappes nå i `(select …)`. Postgres cacher subselecten som et initplan og evaluerer auth-skalaren én gang per spørring i stedet for per rad. `(select auth.uid())` returnerer nøyaktig samme skalar — mekanisk substitusjon. SECURITY DEFINER-helpere (`is_admin()`, `is_in_game()`, `can_score_for()`, `same_flight_or_solo()` m.fl.) røres ikke.
- **#414 `multiple_permissive_policies`:** Slått sammen beviselig-ekvivalente same-rolle permissive policyer til én OR-policy per (tabell, handling). Konsolidert: `courses`, `course_holes`, `tee_boxes`, `formats`, `format_intent_mapping`, `games`, `game_players`, `game_side_winners`, `invitations`, `game_registration_requests`, `group_join_requests`, `users`, `league_players`, `league_rounds`, `leagues`, `tournaments`. Den brede `ALL is_admin()`-admin-policyen er foldet inn i per-handling-self/deltaker-policyene der de deler rolle; for skrive-handlinger uten same-rolle-søsken er en målrettet admin-policy beholdt.
- **Bevisst stående igjen (rolle-mismatch):** Der admin-grenen er `public` og søster-policyen er `authenticated` (skaper-policyer på `games`/`game_players`/`invitations`/`game_side_winners`; INSERT-own på `courses`/`course_holes`/`tee_boxes`) kan policyene ikke slås sammen uten å endre rolle-settet — de står igjen med vilje (advisoren flagger fortsatt overlappet, men å merge ville løsne/innsnevre tilgang). Bedre å la en advarsel stå enn å røre sikkerhets-grensen.

#### Tested
- `supabase/tests/scores_write_rls_test.sql` (#440-riggen): 19/19 grønt etter 0092.
- Ny `supabase/tests/games_invitations_rls_test.sql`: 13 pgTAP-asserts for `games` SELECT, `game_players` SELECT/INSERT (self-register-open) og `invitations` SELECT (egen vs. andres vs. admin) — grønt både før og etter 0092, så det er ekte invarianter.
- Verbatim `pg_policies` før/etter-diff: access-settet per (tabell, handling, rolle) er uendret (kun antall policy-rader + initplan-wrapping + fjernet `is_admin() OR true`-redundans endres).

</details>

### [1.108.2] - 2026-06-09 · #413

> Leaderboard og spill-sider laster raskere: databasen slipper å skanne hele tabeller når den slår opp spillere og resultater.

<details>
<summary>Teknisk</summary>

[#413](https://github.com/jdlarssen/golf-app/issues/413). FK-indeks-hygiene basert på live performance-advisor-kjøring 2026-06-09 (37 udekkede fremmednøkler flagget).

#### Added
- Migrasjon `0091_fk_index_hygiene.sql`: 37 `CREATE INDEX IF NOT EXISTS` på fremmednøkler uten dekkende indeks. Hot-tabeller først (`scores.user_id`, `scores.entered_by`, `game_players.user_id`, `game_players.approved_by_user_id`, `game_players.withdrawn_by_user_id`, `games.course_id`, `games.created_by`, `games.tee_box_id`, `games.foursomes_side{1,2}_tee_starter_user_id`, `invitations.game_id`, `invitations.invited_by`). Øvrige tabeller: `bingo_bango_bongo_holes` (4), `courses` (2), `game_registration_requests` (1), `game_side_winners` (1), `group_join_requests` (1), `groups` (1), `league_rounds` (3), `leagues` (3), `patsome_tee_starters` (1), `product_update_digests` (1), `product_updates` (1), `tee_boxes` (1), `tournaments` (1), `wolf_hole_choices` (3), `agent_findings` (1).

#### Removed
- `invitations_token`: `token`-kolonnen leses ikke lenger — magic-link-flyten ble skrotet til fordel for OTP 2026-05-13; ingen kode-sti bruker indeksen.
- `groups_short_id_idx`: duplikat av `groups_short_id_unique` UNIQUE CONSTRAINT (Postgres genererer automatisk B-tree-indeks for UNIQUE constraints).
- `users_friend_code_idx`: duplikat av `users_friend_code_unique` UNIQUE CONSTRAINT — samme årsak.

13 andre «ubrukte» indekser beholdt: støtter aktive kode-stier (agent-monitoring, audit-log, cup, liga, gruppe-flyt) men har for lav trafikk til at advisoren registrerer bruk ennå.

</details>

### [1.108.1] - 2026-06-09 · #526

> Lager du din egen cup, plukker du nå spillere fra vennelista di, og veiviseren sier fra med en gang du nærmer deg 4-match-taket — ikke etterpå. Point-målet foreslås også ut fra den mindre cupen.

<details>
<summary>Teknisk</summary>

[#526](https://github.com/jdlarssen/golf-app/issues/526). UI-polish på den personlige cupen (kilde, cap-synlighet, copy).

#### Changed
- `app/admin/cup/[id]/generer/GenerateMatches.tsx`: spiller-kilden følger nå rollen for frittstående cup — global admin ser alle profil-fullførte brukere (uendret), en vanlig skaper ser kun vennene sine + seg selv (`getFriendPlayerOptions`, #464-presedens), ikke hele brukerbasen. Sender `matchCap` til veiviseren.
- `app/admin/cup/[id]/generer/GenerateMatchesWizard.tsx`: ny `matchCap`-prop. Steg 3 viser en info-/varsel-banner om taket, og «Neste» blokkeres når oppsettet gir flere enn `matchCap` matcher. Nye feilkoder `too_many_matches`/`too_many_players` mapper til norske banner-meldinger.
- `app/admin/games/new/CupSetup.tsx`: ny `matchCap`-prop justerer point-mål-default + hint for en capped personlig cup (4 matcher → 2,5); admin/klubb beholder 8-match-antagelsen. `GameWizard.tsx` sender taket for ikke-admin.

</details>

### [1.108.0] - 2026-06-09 · #526

> Du kan nå lage din egen cup, ikke bare admin. Sett opp lagene, plukk vennene dine og kjør en Ryder Cup på opptil 4 matcher. Trenger dere mer, er det en klubb-cup som gjelder.

<details>
<summary>Teknisk</summary>

[#526](https://github.com/jdlarssen/golf-app/issues/526). Personlig cup åpnet for alle, capped. Autorisasjons-relaksjon + RLS (ikke et epos: `tournaments.created_by` og scoped-select fantes; #524 hadde flyttet styringen til `requireAdminOrClubAdminOfCup`).

#### Added
- Migrasjon `0090_tournaments_creator_write.sql`: additiv WRITE-policy som lar en skaper skrive sin egen frittstående cup (`group_id is null and created_by = auth.uid()`). 0089 (klubb-cup) hadde kun admin/klubb-admin-write, så en ikke-admin fikk `42501`. Speiler games-creator-RLS (0071).
- `requireAdminOrTournamentCreator`-gate (`lib/admin/auth.ts`): admin eller `tournaments.created_by`; speiler `requireAdminOrCreator` for spill. `requireAdminOrClubAdminOfCup` sin `group_id null`-gren delegerer hit.
- `lib/cup/limits.ts`: `MAX_PERSONAL_CUP_MATCHES = 4`, `MAX_PERSONAL_CUP_PLAYERS = 24` + rene predikat-funksjoner med admin-bypass (Type-A-test, `it.each`).

#### Changed
- `createTournamentDraft`: frittstående cup gates nå med `getRoleContext` (enhver innlogget bruker) i stedet for `requireAdmin`; `created_by` settes til brukeren. Klubb-grenen uendret.
- `createCupMatchesFromPlan`: håndhever taket for ikke-admin personlig cup (teller eksisterende + nye matcher/deltakere, så «≤4/≤24 i cupen» holder ved re-generering); returnerer `too_many_matches`/`too_many_players`. Admin og klubb-cup hopper over.
- `app/admin/cup/[id]/generer/page.tsx`: gate `requireAdmin` → `requireAdminOrClubAdminOfCup` (matcher sin egen action, slik at skaperen når siden).
- `app/admin/cup/page.tsx`: lista gates med `getRoleContext`; en vanlig bruker ser kun sine egne personlige cuper (`created_by`, `group_id` null), admin ser alle.

</details>

</details>

## Tidligere versjoner

<details>
<summary><strong>1.107.y — Veiviser · klubb for klubber, kompis vokser (2 oppføringer)</strong></summary>

Issue [#525](https://github.com/jdlarssen/golf-app/issues/525). Veiviserens arrangement-valg rydder opp i hvem som ser hva: «Klubb-turnering» er for de som faktisk har en klubb, og den vanlige kompis-runden får plass til en hel turnering.

### [1.107.1] - 2026-06-08 · #525

> Kompis-runden tar nå opptil 24 spillere, ikke bare 16, så en større gjeng får plass uten å måtte være en klubb. Trenger dere flere enn det, er det en klubb-turnering som gjelder.

<details>
<summary>Teknisk</summary>

[#525](https://github.com/jdlarssen/golf-app/issues/525). Hevet offentlig kompis-tak + oppdatert intent-copy.

#### Changed
- `app/admin/games/new/GameWizard.tsx`: `PLAYER_COUNT_MAX` hevet fra 16 til 24. Stepperen er kompis-only, så taket gjelder bare den offentlige kompis-veien (klubb går via klubb-roster). `fitsPlayerCount` er urørt — `stableford`/`modified_stableford`/`solo_strokeplay` (`n >= 1`) og slagspill holder format-grid-et fylt på 17–24, mens parti-formatene (Skins/Nassau/BBB ≤16, Wolf ≤5, matchplay-familien eksakt antall) faller ut som ønsket.
- `lib/wizard/intent.ts`: oppdatert `INTENT_DESCRIPTIONS`. Kompis sier nå «Gjør runden mer spennende, opp til 24 spillere» (var «2–4 venner …», utdatert etter at taket ble 24). Klubb sier «For klubben din, alle medlemmer kan være med» — reflekterer at flisen nå er den klubb-scopede veien. Kjørt gjennom humanizer.

</details>

### [1.107.0] - 2026-06-08 · #525

> «Klubb-turnering» dukker nå bare opp hvis du faktisk har en klubb å arrangere for. Lager du en runde uten klubb, ser du Kompis-runde og Cup — ikke en fane som likevel ikke fører noe sted.

<details>
<summary>Teknisk</summary>

[#525](https://github.com/jdlarssen/golf-app/issues/525). Gating av klubb-intenten i opprett-veiviseren.

#### Added
- `lib/clubs/isClubAdminAnywhere.ts`: server-helper som er `true` hvis brukeren er owner/admin i ≥1 ikke-utløpt klubb (admin-client, best-effort → `false` ved feil). Utløpte klubber teller ikke (samme regel som klubb-velgeren).

#### Changed
- `app/admin/games/new/IntentSelector.tsx`: «Klubb-turnering»-flisen er gatet bak `isAdmin || isClubAdmin`, samme mønster som #477-gatingen av «Solo / Test». Et eksisterende klubb-spill som redigeres beholder kortet (`value === 'klubb'`).
- `app/admin/games/new/GameWizard.tsx`: ny `isClubAdmin`-prop sendt til begge `IntentSelector`-bruk. Standard-flyt-selektoren (5-stegs) manglet `isAdmin` helt — nå sender begge call-sites både `isAdmin` og `isClubAdmin`, noe som samtidig lukker et latent #477-hull (admin så ikke «Solo / Test» i den vanlige klikk-gjennom-flyten, kun via direktelenke).
- `app/opprett-spill/page.tsx`: beregner `isClubAdmin` via den nye helperen (parallelt med øvrige fetch-er) og sender den inn. Admin-flyten trenger den ikke — `isAdmin` dekker.

#### Tests
- `app/admin/games/new/IntentSelector.test.tsx`: +3 Type-C-render-tester (klubb skjult for vanlig bruker, synlig for klubb-admin uten global admin, synlig i klubb-edit-flyt).

</details>

</details>

<details>
<summary><strong>1.106.y — Klubb-cup (1 oppføring)</strong></summary>

Issue [#524](https://github.com/jdlarssen/golf-app/issues/524). Klubb-cup speiler klubb-ligaen: en klubb-eier/-admin oppretter og styrer en lag-mot-lag-cup fra klubb-rommet, lagene hentes fra medlemmene, og medlemmer ser klubbens cuper på klubb-siden.

### [1.106.0] - 2026-06-08 · #524

> Klubben din kan nå kjøre sin egen cup. Du som er klubb-admin setter den opp, plukker lagene fra medlemmene og styrer hele runden fra klubb-siden. Resten av klubben ser cupene samme sted.

<details>
<summary>Teknisk</summary>

[#524](https://github.com/jdlarssen/golf-app/issues/524). Klubb-scopet cup (Fase 2 av epos #480), speiler klubb-liga (#480/#483/#485).

#### Added
- Migrasjon `0089_tournaments_group_scoping.sql`: `tournaments.group_id` + scoped SELECT-RLS + ny admin/klubb-admin WRITE-policy (mal: `leagues` 0083). WRITE-policyen fikser samtidig en latent bug — `tournaments` hadde RLS på uten write-policy, så cup-oppretting via request-scoped klient ble nektet (`42501`), og prod-tabellen var tom. Verifisert med live RLS-probe.
- Nye klubb-ruter i klubb-chrome: `/klubber/[id]/cup/ny` (opprett), `/klubber/[id]/cup/[cupId]` (styring), `.../generer` (kamper) og `.../slett` — klubb-admin kjører hele cup-kjeden uten admin-chrome.
- `requireAdminOrClubAdminOfCup`-gate; delte server-komponenter `CupManagement` / `GenerateMatches` / `CupDeleteConfirm` med `variant: 'admin' | 'club'` (admin-rutene ble tynne wrappere). `ClubCupsSection` på klubb-siden.

#### Changed
- `createTournamentDraft` + `start`/`finish`/`update`/`deleteTournament` er klubb-bevisste (gate via cupens `group_id`, lagrer `group_id`, kontekst-redirects via felles `cupRedirectBase`). Match-genereringen henter kun klubbmedlemmer for klubb-cup, avviser ikke-medlemmer, og stempler `group_id` på match-spillene.
- Offentlig `/cup/[id]` gates til medlemmer/deltakere/global-admin for klubb-scopede cuper (snapshot bruker admin-client, så app-lag-gaten skjuler dem — speiler `/liga/[id]`).

</details>

</details>

<details>
<summary><strong>1.105.y — Hjem · finn turneringer øverst (5 oppføringer)</strong></summary>

Issue [#500](https://github.com/jdlarssen/golf-app/issues/500). Hjem-sida speiler kjerneflyten: oppdag og bli med i turneringer rett under egne spill, og det rolige format-oppslagsverket flytter til Klubbhuset.

### [1.105.4] - 2026-06-08 · #515

> Ambrose og Texas scramble hadde nøyaktig samme forklaring. Nå sier Ambrose-kortet det som faktisk skiller dem: et lag-handikap som jevner ut sterke og svake spillere, så blandede lag stiller likere.

<details>
<summary>Teknisk</summary>

[#515](https://github.com/jdlarssen/golf-app/issues/515). Distinkt format-copy.

#### Changed
- `lib/formats/modeGuide.ts`: skrev om `ambrose`-entryens `summary` + `points` så den er distinkt fra `texas_scramble` og eier det utjevnende lag-handikapet (Ambrose-formelen) som sin vri. Texas forblir den «rene» scramblen. Player-rettet copy lever i kode (`MODE_GUIDE`), ikke DB — `formats.rules_summary` er NULL og faller tilbake hit, så ingen migrasjon trengs.

#### Notes
- Skannet alle 22 formater: Ambrose/Texas var det eneste paret med identisk player-summary. De øvrige er distinkte og golf-faktaene leser riktig. Ingen massiv copy-overhaling (jf. issuets opprinnelige bekymring).

</details>

### [1.105.3] - 2026-06-08 · #516

> Format-kortene sier nå «Vis regler» når de er lukket og «Skjul regler» når de er åpne, med en ren pil i stedet for det lille rå tegnet. Tydeligere at det ligger mer å lese bak.

<details>
<summary>Teknisk</summary>

[#516](https://github.com/jdlarssen/golf-app/issues/516). Tydeligere mer-info-affordanse på `ModeGuideCard`.

#### Changed
- `components/ModeGuideCard.tsx`: erstattet «Slik funker det» + rotert `⌄`-glyf med et ekte chevron-SVG (samme stroke-stil som `SettingRow`, `viewBox 0 0 24 24`, path `m6 9 6 6 6-6`) og en CSS-styrt tekst-veksling «Vis regler» (lukket) ↔ «Skjul regler» (åpen) via `group-open:hidden` / `hidden group-open:inline`. Fortsatt ren `<details>`/`<summary>` uten JS; `motion-reduce:transition-none` beholdt så rotasjonen ikke animeres når bevegelse er av.

</details>

### [1.105.2] - 2026-06-08 · #520

> «Finn turneringer» får samme rolige velkomst som Hjem når lista er tom: et flagg-ikon, en sentrert hilsen og et lite sitat, med «Fyr opp din egen turnering»-knappen midt i bildet. Mindre tom skjerm, mer invitasjon.

<details>
<summary>Teknisk</summary>

[#520](https://github.com/jdlarssen/golf-app/issues/520). Visuell polish av tom-tilstanden fra #518.

#### Changed
- `app/finn-turneringer/page.tsx`: `isEmpty`-grenen er løftet til en sentrert hero som speiler Hjem-tomtilstanden — `ChampagneMedallion` + `PinFlag`, sentrert `font-serif`-H1, melding (`max-w-[280px]`), `LinkButton` → `/opprett-spill`, og en `PullQuote` på bunnen for vertikal balanse. `PageHeader` (med undertittelen «Åpne turneringer du kan melde deg på …») er flyttet inn i den populerte grenen, så undertittelen ikke lenger motsier «Ingen åpne turneringer» i tom-tilstand. Nav-headeren (BackLink + Kicker) står i begge tilstander.

</details>

### [1.105.1] - 2026-06-08 · #518

> Før var «Finn turneringer» en blindvei når lista var tom. Nå får du en knapp rett der som fyrer opp din egen turnering, så du slipper å vente på at noen andre inviterer deg.

<details>
<summary>Teknisk</summary>

[#518](https://github.com/jdlarssen/golf-app/issues/518). Oppfølger til #500.

#### Changed
- `app/finn-turneringer/page.tsx`: tom-tilstanden (`isEmpty`) er reframet fra «be en arrangør om en invitasjon, eller stikk innom igjen senere» til «du trenger ikke vente på en invitasjon for å spille», og får en primær `LinkButton` → `/opprett-spill` («Fyr opp din egen turnering»). Alle innloggede kan opprette spill siden #427, så den gamle vent-på-invitasjon-teksten var en feilaktig blindvei. Hjem sin egen ingen-spill-tilstand (router til Klubbhuset) er uendret.

</details>

### [1.105.0] - 2026-06-08 · #500

> Hjem viser nå «Finn turneringer» rett under spillene dine i stedet for nederst, fordi det å finne en runde å bli med i er det viktigste herfra. Den gamle format-guide-snarveien og «Mer kommer her snart» er borte; vil du lese deg opp på spillformatene ligger de nå som en egen flate i Klubbhuset.

<details>
<summary>Teknisk</summary>

[#500](https://github.com/jdlarssen/golf-app/issues/500). Hjem-IA + Klubbhus-tile (oppfølger til #498).

#### Changed
- `app/page.tsx`: seksjonsrekkefølge er nå `Pågår nå` → `Mine spill` → `Finn turneringer` → `Avsluttede spill` («Finn turneringer» flyttet opp fra bunnen). Format-guide-seksjonen og «Mer kommer her snart»-teksten fjernet.

#### Added
- `app/admin/page.tsx`: «Spillformater»-tile (→ `/spillformater`) i både admin-`TilesGrid` og vanlig-spiller-`PlayerKlubbhus`, så ingen mister browse-tilgang til oppslagsverket når Hjem-kortet fjernes. Ny `TileIconKind 'spillformater'` (`ScorekortIcon`).

</details>

</details>

<details>
<summary><strong>1.104.y — Veiviser · kompakte format-kort (2 oppføringer)</strong></summary>

Issue [#498](https://github.com/jdlarssen/golf-app/issues/498). Format-steget i veiviseren ryddes: kortene blir minimale, forklaringen kommer når du velger, og hjelpen ligger ett trykk unna uten å forlate flyten. «Spillformer» får sitt riktige navn, «Spillformater».

### [1.104.1] - 2026-06-08 · #498

> På Stableford-kortene i veiviseren la «Solo»-merket seg oppå navnet. Nå står navnet på egen linje med Solo/Lag-merkene under, så alle format-kortene leser rent.

<details>
<summary>Teknisk</summary>

Visuell bug fanget på simulator etter v1.104.0. I det kollapsede format-kortet lå navnet i en `justify-between`-rad med `min-w-0`; den brede to-chip-baren (Solo + Lag på fleksible format) holdt full bredde, så navne-boksen krympet og et ett-ords navn som «Stableford» fløt utenfor og oppå chippen. `FormatGrid` kollapset kort stabler nå navn over chip(s) (`flex-col items-start`), så lange navn og to chips alltid får plass. Enkelt-chip-kort er uendret i oppførsel. Det valgte (utvidede) kortet er full bredde og var aldri berørt.

</details>

### [1.104.0] - 2026-06-08 · #498

> Når du setter opp et spill viser format-steget nå kompakte kort: bare navnet og om formatet spilles solo eller på lag. Velger du ett, folder det seg ut med en kort forklaring og en «Slik funker det»-lenke. Trenger du oversikten, åpner «?»-knappen et ark med alle spillformatene rett over veiviseren, så du ikke mister det du holder på med. Og sida «Spillformer» heter nå det den burde: «Spillformater». Gamle lenker virker fortsatt.

<details>
<summary>Teknisk</summary>

[#498](https://github.com/jdlarssen/golf-app/issues/498). Redesign av veiviserens steg 2 + opprydding rundt format-oppslagsverket.

#### Added
- `FormatGuideSheet` (klient bunn-ark): hele format-oppslagsverket glir opp over veiviseren, med fokus-felle, Esc/backdrop-lukk og reduced-motion-trygg slide-up (klasser i `globals.css`). «Slik funker det →» på det valgte kortet åpner arket scrollet til det formatet.
- Delt `FormatGuideList` + server-side `getFormatGuideEntries` (eier CATALOG + DB-flettet innhold), brukt av både `/spillformater` og arket.
- Spillestil-chips fikk kategori-farger — skifer for Solo, terrakotta for Lag — via nye tokens i `globals.css` (lys + 2× mørk). Fleksible format viser «Solo» + «Lag» side om side i veiviseren.
- Permanent redirect `/spillformer` → `/spillformater` (page + `:slug`) i `next.config.ts`.

#### Changed
- `FormatGrid` kompakt stil: ikoner fjernet, 2-kolonners kort med navn + chip(s), valgt kort utvider til full bredde med kort-beskrivelse. `StepperHeader` fikk en valgfri «?»-handling.
- «Hver for seg»-merket slått sammen til «Solo» (`PLAY_STYLE_LABELS`).
- Rute `/spillformer` → `/spillformater` (page + `[slug]`), med oppdaterte interne lenker, synlig tekst og invite-mail-hint. `ModeGuideCard` fikk en valgfri `id` for scroll-to.

</details>

</details>

<details>
<summary><strong>1.103.y — Stableford · hull for hull (2 oppføringer)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fullføres — solo og modifisert stableford får sitt eget poeng-scorekort, og 1-mot-1-spill får et duell-oppgjør. PR 9 (siste) av epicen.

### [1.103.1] - 2026-06-08 · #496

> I en modifisert stableford-duell med minuspoeng leste dommen «vant duellen 4--3» — to streker klistret sammen. Nå står det «vant duellen 4 mot −3», så taperens minuspoeng leser rent.

<details>
<summary>Teknisk</summary>

Fant under en visuell gjennomgang av epic #496. `HeadToHeadResult`-dommen brukte en-dash-separator (`4–−3`) som kolliderte visuelt med en negativ taper-score. Når en av scorene er negativ (kun modifisert stableford kan det) formatteres tallene nå med ekte minus (U+2212) og separatoren bytter til « mot ». Positive format (Skins/Nassau/BBB/slagspill) beholder den kompakte «5–3» — uendret. Låst med en assertion i det eksisterende negativ-score-caset.

</details>

### [1.103.0] - 2026-06-08 · #496

> Etter en stableford-runde viser «Hull for hull» nå poeng per spiller hull for hull, med stillingen øverst og hvem som tok flest poeng på hvert hull. Det gjelder både vanlig og modifisert stableford (der dårlige hull gir minuspoeng). Var dere bare to, møter du en duell i stedet for podium når runden er ferdig. Med dette ser alle spillemodi nå riktig «Hull for hull» — ikke lenger et lag-scorekort for spill dere egentlig spilte hver for dere.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 9 (siste) av epic (solo + modifisert stableford). Holes-siden forgrener nå også på solo stableford/modified (`team_size === 1`).

#### Added
- `SoloStablefordHolesView` (server-component): klassisk per-spiller poeng-scorekort. Rangert stillings-header (løpende poeng), så Ut/Inn-bolker med per-hull-kort (brutto-shape → poeng per spiller, sortert høyest først, hull-vinner i champagne) og poeng-subtotal per ni. Modifisert stableford eksponerer negative hull-poeng. Erstatter det generiske best-ball «Lag N»-scorekortet. Dekker både `stableford` og `modified_stableford` (samme resultat-shape).
- Duell-kort (`HeadToHeadResult`) ved nøyaktig 2 spillere på et ferdig solo stableford-spill uten sideturnering, i stedet for podium. Poeng som metrikk (høyest vinner). Tug-of-war-baren ble gjort robust mot negative totaler (modifisert stableford bruker netto-poeng der par = 0).
- Type C render-test for SoloStablefordHolesView, ny `e2e/games/solo-stableford.spec.ts` med tre auth-gate-tester, og et negativ-score-case i HeadToHeadResult-testen.

#### Changed
- Solo-`StablefordSoloResult` eksponerer nå en `holes`-array (per-hull per-spiller brutto + poeng + hull-vinner) via TDD, testet på både standard og modifisert (negativ) tabell. Team-varianten hadde allerede per-hull.
- `buildStablefordContext`-helper trukket ut av `renderStableford` (eier game_mode-passthrough, team-variant teamNumber og WD-filtrering #386) så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde.
- Holes-siden forgrener nå også på solo stableford/modified (par-/team-stableford beholder generisk visning). **Epic #496 er med dette fullført — alle solo-format har format-bevisst «Hull for hull».**

</details>

</details>

<details>
<summary><strong>1.102.y — Slagspill · hull for hull (1 oppføring)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fortsetter — solo slagspill får sitt eget klassiske scorekort, og 1-mot-1-spill får et duell-oppgjør. PR 8 av epicen.

### [1.102.0] - 2026-06-08 · #496

> Etter en slagspill-runde viser «Hull for hull» nå et klassisk scorekort: stillingen øverst, så hvert hull med brutto og netto per spiller og hvem som hadde lavest netto. Var dere bare to, møter du en duell i stedet for podium når runden er ferdig. Før tegnet appen et lag-scorekort med «Lag»-rader, selv om dere egentlig spilte hver for dere.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 8 av epic (solo strokeplay). Holes-siden forgrener nå også på `game_mode === 'solo_strokeplay'`.

#### Added
- `SoloStrokeplayHolesView` (server-component): klassisk per-spiller-scorekort. Rangert stillings-header (løpende netto), så Ut/Inn-bolker med per-hull-kort (brutto-shape → netto per spiller, sortert lavest først, hull-vinner i champagne) og netto-subtotal per ni. Erstatter det generiske best-ball «Lag N»-scorekortet. SoloStrokeplayView (leaderboard) viste kun totaler, så per-hull-flaten er additiv.
- Duell-kort (`HeadToHeadResult`) ved nøyaktig 2 spillere på et ferdig slagspill, i stedet for podium. Slagspill er lavest-vinner, så skallet fikk en `lowerWins`-modus som inverterer tug-of-war-baren og viser vinnerens lave score først i dommen.
- Type C render-test for SoloStrokeplayHolesView, ny `e2e/games/solo-strokeplay.spec.ts` med tre auth-gate-tester, og et `lowerWins`-case i HeadToHeadResult-testen.

#### Changed
- `SoloStrokeplayResult` eksponerer nå en `holes`-array (per-hull per-spiller brutto + netto + hull-vinner) via TDD. Solo strokeplay regnet allerede per hull internt, men eksponerte kun totaler.
- `buildSoloStrokeplayContext`-helper trukket ut av `renderSoloStrokeplay` (eier WD-filtreringen #386) så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde.
- Holes-siden forgrener nå også på `game_mode === 'solo_strokeplay'` (Skins + Wolf + Nines + Round Robin + Acey-Deucey + Bingo Bango Bongo + Nassau + solo strokeplay tatt; solo-stableford følger i egen PR).

</details>

</details>

<details>
<summary><strong>1.101.y — Nassau · hull for hull (1 oppføring)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fortsetter — Nassau får sin egen per-hull-flate, og 1-mot-1-spill får et duell-oppgjør. PR 7 av epicen.

### [1.101.0] - 2026-06-08 · #496

> Etter en Nassau-runde viser «Hull for hull» nå de tre veddemålene hver for seg: For 9, Bak 9 og hele runden, med netto per spiller hull for hull og hvem som ledet hver bolk. Var dere bare to, møter du en duell i stedet for podium når runden er ferdig. Før tegnet appen det samme lag-scorekortet for alle format, også Nassau, der dere egentlig spilte hver for dere.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 7 av epic (Nassau). Holes-siden forgrener nå også på `game_mode === 'nassau'`.

#### Added
- `NassauHolesView` (server-component): seksjons-tro per-hull-flate. Tre bolker (For 9 / Bak 9 / Totalt) speiler Nassaus tre veddemål. Hver bolk har en sammendrags-stripe (netto-sum per spiller, bolk-leder i champagne) og per-hull-kort med netto per spiller og hull-vinner uthevet. Totalt-bolken er rent sammendrag, så de 18 hullene ikke repeteres en tredje gang. Et kompakt units-sammendrag på toppen viser hvem som leder de tre seksjonene. NassauView (leaderboard) viste kun seksjons-totaler, så flaten er additiv.
- Duell-kort (`HeadToHeadResult`) ved nøyaktig 2 spillere på et ferdig Nassau-spill, i stedet for podium. Seksjoner vunnet (units) som metrikk, en momentum-strip per hull (hvem som vant hullet netto), og en push-note når en seksjon endte delt.
- Type C render-test for NassauHolesView, og tredje auth-gate-test i `e2e/games/nassau.spec.ts` for «Hull for hull»-ruta.

#### Changed
- `NassauResult` eksponerer nå en `holes`-array (per-hull per-spiller netto + brutto + hull-vinner) via TDD. Nassau regnet allerede per hull internt, men eksponerte kun seksjons-totaler.
- `buildNassauContext`-helper trukket ut av `renderNassau` så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde.
- Holes-siden forgrener nå også på `game_mode === 'nassau'` (Skins + Wolf + Nines + Round Robin + Acey-Deucey + Bingo Bango Bongo + Nassau tatt; solo-strokeplay/stableford følger i egne PR-er).

</details>

</details>

<details>
<summary><strong>1.100.y — Bingo Bango Bongo · hull for hull (1 oppføring)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fortsetter — Bingo Bango Bongo får sin egen per-hull-flate, og 1-mot-1-spill får et duell-oppgjør. PR 6 av epicen.

### [1.100.0] - 2026-06-08 · #496

> Etter en Bingo Bango Bongo-runde viser «Hull for hull» nå hvem som tok hver bingo, bango og bongo på hvert hull. Var dere bare to, møter du en duell i stedet for podium når runden er ferdig. Før så du bare hvor mange hver hadde tatt totalt, ikke hvem som tok hva hull for hull.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 6 av epic (Bingo Bango Bongo). Holes-siden forgrener nå også på `game_mode === 'bingo_bango_bongo'`.

#### Added
- `BingoBangoBongoHolesView` (server-component): prestasjons-først per-hull-flate. Hvert hull viser de tre prestasjonene (Bingo / Bango / Bongo) med vinnerens navn, eller «ikke satt» når en kategori mangler. Tok én spiller alle tre, markeres hullet som «Feiet!». BBB teller ikke slag, så flaten viser prestasjoner og ikke score. BingoBangoBongoView (leaderboard) hadde ingen per-hull-visning, så flaten er rent additiv.
- Duell-kort (`HeadToHeadResult`) ved nøyaktig 2 spillere på et ferdig BBB-spill, i stedet for podium. Poeng som metrikk og en momentum-strip per hull. BBB er det siste solo-formatet som kan være 2 spillere, så dette fullfører head-to-head-strømmen i epicen.
- Type C render-test for BingoBangoBongoHolesView, og `e2e/games/bingo-bango-bongo.spec.ts` med auth-gate.

#### Changed
- `buildBingoBangoBongoContext`-helper trukket ut av `renderBingoBangoBongo` så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde (per-hull-prestasjonene injiseres som Wolf sine valg).
- Holes-siden forgrener nå også på `game_mode === 'bingo_bango_bongo'` (Skins + Wolf + Nines + Round Robin + Acey-Deucey + Bingo Bango Bongo tatt; Nassau og solo-strokeplay/stableford følger i egne PR-er).

</details>

</details>

<details>
<summary><strong>1.99.y — Acey-Deucey · hull for hull (1 oppføring)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fortsetter — Acey-Deucey får sin egen per-hull-flate. PR 5 av epicen.

### [1.99.0] - 2026-06-08 · #496

> Etter en Acey-Deucey-runde viser «Hull for hull» nå alle fire spillerne hull for hull: hvem som tok ace-en (+3) og hvem som satt igjen med deuce-en (−3), med scoren til hver. Før så du bare ace- og deuce-navnet, ikke de to i midten eller hva noen faktisk scoret.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 5 av epic (Acey-Deucey). Holes-siden forgrener nå også på `game_mode === 'acey_deucey'`.

#### Added
- `AceyDeuceyHolesView` (server-component): alle fire spillere score-rangert per hull, med ace (unik lavest, +3) i champagne og deuce (unik høyest, −3) i en kald markering. Rikere enn AceyDeuceyView sin PER HULL, som kun viste ace/deuce-navnet. Delt lavest/høyest gir ingen utheving (som poengreglene).
- `perPlayer` (gross/effective/points) eksponert på `AceyDeuceyHoleRow` — scoring-laget regnet det allerede ut for å finne ace/deuce, men kastet det. TDD, ingen endring i poeng/ranking.
- Type C render-test for AceyDeuceyHolesView, og `e2e/games/acey-deucey.spec.ts` med auth-gate.

#### Changed
- `buildAceyDeuceyContext`-helper trukket ut av `renderAceyDeucey` så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde.
- Holes-siden forgrener nå også på `game_mode === 'acey_deucey'` (Skins + Wolf + Nines + Round Robin + Acey-Deucey tatt; øvrige solo-format følger i egne PR-er).

</details>

</details>

<details>
<summary><strong>1.98.y — Round Robin · hull for hull (1 oppføring)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fortsetter — Round Robin får sin egen per-hull-flate. PR 4 av epicen.

### [1.98.0] - 2026-06-08 · #496

> Etter en Round Robin-runde viser «Hull for hull» nå hvordan makkerne roterer hvert sjette hull, og hull for hull hva hver av dere scoret og hvilken side som tok hullet. Før fantes det ingen hull-oversikt for Round Robin i det hele tatt.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 4 av epic (Round Robin). Holes-siden forgrener nå også på `game_mode === 'round_robin'`.

#### Added
- `RoundRobinHolesView` (server-component): segment-gruppert per-hull-flate. Tre bolker (én per roterende segment) med konstellasjons-header, og per hull begge sidenes per-spiller-netto, contributor-markering og hvilken side som vant. RoundRobinView (leaderboard) hadde ingen per-hull-visning, så flaten er rent additiv.
- Type C render-test for RoundRobinHolesView, og `e2e/games/round-robin.spec.ts` med auth-gate for round-robin-rutene.

#### Changed
- `buildRoundRobinContext`-helper trukket ut av `renderRoundRobin` så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde.
- Holes-siden forgrener nå også på `game_mode === 'round_robin'` (Skins + Wolf + Nines + Round Robin tatt; øvrige solo-format følger i egne PR-er og treffer fortsatt lag-scorekortet til de tas).

</details>

</details>

<details>
<summary><strong>1.97.y — Nines · hull for hull (2 oppføringer)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fortsetter — Nines / Split Sixes får sin egen per-hull-flate. PR 3 av epicen.

### [1.97.1] - 2026-06-08 · #496

> Et Nines-hull der ikke alle har scoret ennå utroper ikke lenger en for tidlig leder i «Hull for hull». Plasseringen vises først når alle tre har levert på hullet.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) Oppfølging fra skeptisk eval av PR 3. `NinesHolesView.placementByPlayer` rangerte på `effectiveScore != null` uten å sjekke `hole.pending`, så et delvis scoret hull ga den som hadde tastet et plasserings-merke + accent-utheving. Nå returnerer den tom map for pending hull (ingen plassering før potten faktisk deles ut). Type C-testen styrket med en assertion om at pending-kortet ikke har accent-utheving.

</details>

### [1.97.0] - 2026-06-08 · #496

> Etter en Nines-runde viser «Hull for hull» nå hvem som tok hvert hull og hvor mange poeng hver spiller fikk. Lavest score henter mest, og spiller dere likt deler dere poengene. Før så det ut som et lag-scorekort, selv om dere spilte hver for dere.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 3 av epic (Nines / Split Sixes). Holes-siden forgrener nå også på `game_mode === 'nines'`.

#### Added
- `NinesHolesView` (server-component): per hull viser den potten (9 poeng for Nines, 6 for Split Sixes), og — det NinesView sin kompakte PER HULL (kun poeng-tall) mangler — hver spillers plassering, brutto/netto-score og poeng. Plassering-først: lavest score øverst, vinneren uthevet, delte plasseringer deler potten.
- Type C render-test for NinesHolesView, og `e2e/games/nines.spec.ts` med auth-gate for nines-rutene.

#### Changed
- `buildNinesContext`-helper trukket ut av `renderNines` så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde.
- Holes-siden forgrener nå også på `game_mode === 'nines'` (Skins + Wolf + Nines tatt; øvrige solo-format følger i egne PR-er og treffer fortsatt lag-scorekortet til de tas).

</details>

</details>

<details>
<summary><strong>1.96.y — Wolf · hull for hull (1 oppføring)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» fortsetter — Wolf får sin egen per-hull-flate. PR 2 av epicen.

### [1.96.0] - 2026-06-08 · #496

> Etter en Wolf-runde viser «Hull for hull» nå hvem som var Wolf på hvert hull, hva valget ble (alene, blind eller med en partner), hvem som vant, og hva hver spiller scoret på sin side. Før så det ut som et lag-scorekort, selv om dere spilte mot hverandre.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 2 av epic (Wolf). Holes-siden forgrener nå også på `game_mode === 'wolf'`.

#### Added
- `WolfHolesView` (server-component): per hull viser den Wolf, valg (Lone/Blind/Partner), utfall og innsats, og — det WolfView sin kompakte PER HULL mangler — hver spillers score, side (Wolf-side/Andre) og poeng.
- `lib/wolf/holeLabels.ts`: delte choice/outcome-labels brukt av både WolfView og WolfHolesView.
- Type C render-test for WolfHolesView.

#### Changed
- `buildWolfContext`-helper trukket ut av `renderWolf` (injiserer `wolfChoices` fra `wolf_hole_choices`) så leaderboard- og «Hull for hull»-flaten deler kilde.
- `WolfView` bruker nå de delte label-helperne (strenger byte-identiske).

</details>

</details>

<details>
<summary><strong>1.95.y — Skins · hull for hull og duell (1 oppføring)</strong></summary>

Issue [#496](https://github.com/jdlarssen/golf-app/issues/496). Format-bevisst «Hull for hull» for solo-spill, og et eget resultat-kort for 1-mot-1. PR 1 av epicen: Skins.

### [1.95.0] - 2026-06-08 · #496

> Etter en Skins-runde viser «Hull for hull» nå hvem som vant hvert hull og hvordan potten rullet videre, i stedet for et lag-scorekort fra best-ball-tiden. Spilte dere to mot hverandre, kåres duellen på et eget scoreboard: scoren tegnet som en dragkamp, og en stripe som viser hvem som tok hvert hull underveis.

<details>
<summary>Teknisk</summary>

[#496](https://github.com/jdlarssen/golf-app/issues/496) PR 1 av epic (kun Skins). «Hull for hull»-siden forgrenet aldri på `game_mode`. Den kjørte best-ball-`computeLeaderboard` for alle format og tegnet et lag-scorekort. Nå får Skins sin egen flate, og 1-mot-1 får et head-to-head-kort i stedet for podium.

#### Added
- `SkinsHolesView` (server-component) bak `/games/[id]/leaderboard/holes` når `game_mode === 'skins'`: per hull viser den hver spillers score (`perPlayer`), vinner-highlight, utfall og carryover-kjeden. Rikere enn SkinsView sin kompakte PER HULL.
- `HeadToHeadResult` (gjenbrukbart klient-kort) som erstatter `SkinsPodium` ved nøyaktig 2 spillere: versus-header, tug-of-war-bar for scoren, og en momentum-strip med ett felt per hull farget per spiller. To nye spiller-farge-tokens (petrol + terrakotta) i `globals.css`, med dark-varianter.
- Type C render-tester for begge komponentene.

#### Changed
- `buildSkinsContext`-helper trukket ut av `renderSkins` så leaderboard- og «Hull for hull»-flaten bygger `ScoringContext` fra samme kilde.
- Holes-siden forgrener nå på `game_mode` (kun Skins; de andre solo-formatene følger i egne PR-er og treffer fortsatt lag-scorekortet til de tas).

</details>

</details>

<details>
<summary><strong>1.94.y — Liga · stableford (2 oppføringer)</strong></summary>

Issue [#452](https://github.com/jdlarssen/golf-app/issues/452). Liga-epicen Fase 4 (siste fase): en liga kan nå gå på stableford eller modifisert stableford, ikke bare slagspill.

### [1.94.1] - 2026-06-08 · #499

> Spiller dere fire eller færre sammen, kan nå alle taste inn score for hverandre, ikke bare for seg selv. Før var det bare den som lagde spillet som fikk det til. Det gjelder runder uten flight-inndeling (slagspill, stableford, skins, nassau og de andre solo-formatene), og dere ser også hverandres score live mens dere spiller.

<details>
<summary>Teknisk</summary>

[#499](https://github.com/jdlarssen/golf-app/issues/499) Solo-formater lar `game_players.flight_number` være `NULL`. Score-policyene gatet medspiller-tilgang via `me.flight_number = them.flight_number`, og `NULL = NULL` er `NULL` (ikke `TRUE`) i SQL — så to flight-løse spillere matchet aldri. En ikke-admin kunne bare skrive/se sin egen score; admin slapp gjennom via `is_admin()`. Rapportert i en 2-spiller Skins-runde.

#### Fixed
- WRITE: ny `can_score_for()`-helper (migrasjon 0088) — samme tildelte flight, eller flight-løst spill med ≤ 4 aktive spillere. `scores insert/update by flight` peker nå hit i stedet for `same_flight()`.
- READ: `same_flight_or_solo()` solo-gren generalisert fra literal `game_mode='stableford'` til strukturell «begge flight_number NULL», så alle solo-formater (ikke bare stableford) ser hverandres score live.
- Verifisert mot live-data: medspiller write+read `true` etter fix, best-ball kryss-flight-lekkasje `0`. `same_flight()` beholdt uendret.
</details>

### [1.94.0] - 2026-06-08 · #452

> Du kan nå velge spillform når du lager en liga: slagspill, stableford eller modifisert stableford. Velger du stableford, teller sesongen poeng i stedet for slag, og høyest sammenlagt vinner. En runde du ikke spiller gir null poeng.

<details>
<summary>Teknisk</summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) Fase 4 (epic, siste fase). `leagues.format` var de facto låst til `'stroke'`; denne fasen åpner den for `'stableford'` og `'modified_stableford'` (begge solo) og gjør sesong-aggregatoren retnings-bevisst på selve per-runde-verdien.

#### Added
- Spillform-velger i liga-veiviseren (Slagspill / Stableford / Modifisert Stableford). Stableford låser tabellen til netto og skjuler straffescore-type (uteblitt runde = 0 poeng).
- `leagueFlightGameConfig` + `isPointsBasedFormat` (Type-A): mapper liga-formatet til flightens `game_mode`/`mode_config` og til sesong-retningen.
- `computeFlightRoundValues` (Type-A): scorer hver flight etter formatet (slagspill → mot-par, stableford → poeng) og dropper ufullstendige kort.
- CHECK-constraint på `leagues.format` (migrasjon 0087).

#### Changed
- `computeLeagueStandings` skiller nå per-runde-verdiens retning (stableford-poeng = høyest best) fra sesong-verdiens retning. Alle fire sesong-modellene (Total / Snitt / Beste-N / Poeng) regner på rå stableford-poeng; en uteblitt runde teller som 0. Slagspill-oppførselen er bit-for-bit uendret.
- `getLigaSnapshot` ruter hver flight gjennom `computeFlightRoundValues` etter `league.format`; `startLeagueRoundFlight` lager flighten med formatets `game_mode`. Sesong-tabellen viser rå poeng (ikke mot-par) for stableford.
- Per-runde-feltene `netToPar`/`grossToPar` heter nå `net`/`gross`, og celle-feltet `toPar` heter `value` (holder mot-par for slagspill, poeng for stableford).
- Liga-detaljen (admin + klubb) viser nå «Spillform», og Total-modellens label sier «sum poeng» for stableford i stedet for «sum mot par».

</details>

</details>

<details>
<summary><strong>Liga — sesong-konkurranse (3 serier)</strong></summary>

<details>
<summary><strong>1.93.y — Liga · meld deg på selv (1 oppføring)</strong></summary>

Issue [#452](https://github.com/jdlarssen/golf-app/issues/452). Liga-epicen Fase 3: klubbmedlemmer kan melde seg på klubbens liga selv, og av igjen før de har spilt.

### [1.93.0] - 2026-06-07 · #452

> Er du medlem i en klubb, kan du nå melde deg på klubbens liga selv så lenge den ikke har startet — du trenger ikke vente på at en arrangør legger deg til. Ombestemmer du deg, kan du melde deg av igjen helt til du har spilt din første runde.

<details>
<summary>Teknisk</summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) Fase 3 (epic). Grunnmuren for klubb-liga (group_id, RLS, medlems-picker, medlems-flate) lå allerede fra #480/#483/#485; denne fasen legger til selvbetjent på- og avmelding.

#### Added
- To SECURITY DEFINER-RPC-er (`join_club_league` / `leave_club_league`, migrasjon 0086) som lar et klubbmedlem melde seg på en draft klubb-liga og av igjen før første spilte runde. Speiler `befriend_inviter`-mønsteret; `league_players`-skriving via RLS forblir admin/klubb-admin-only (forsvar i dybden).
- «Bli med i ligaen»-knapp på `/liga/[id]` for klubbmedlemmer som ikke er med (kun før start), og en «Meld deg av»-lenke til en egen confirm-side `/liga/[id]/meld-av` (kun før spilt runde).
- `leagueSelfServiceState`-predikat (Type-A-tester) som avgjør hvilke knapper som vises.

#### Changed
- `getLigaSnapshot` returnerer `hasPlayed` per deltaker (levert scorekort i en liga-flight), som gater avmeldingen.

</details>

</details>

<details>
<summary><strong>1.92.y — Liga · poeng per plassering (1 oppføring)</strong></summary>

Issue [#452](https://github.com/jdlarssen/golf-app/issues/452). Liga-epicen Fase 2b legger til den fjerde sesong-modellen: poeng per plassering.

### [1.92.0] - 2026-06-07 · #452

> Du kan nå la ligaen avgjøres på poeng: vinneren av hver runde får flest poeng, ned til ett for sisteplass, og sesongen er summen. Spiller du ikke en runde, får du null poeng den gangen.

<details>
<summary>Teknisk</summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) Fase 2b (epic). Fullfører sesong-modellene fra Fase 2a; ingen ny migrasjon (`points` lå allerede i `standings_model`-CHECK-en fra 0080).

#### Added
- `points`-sesongmodell i `computeLeagueStandings`: hver runde rangeres på det aktive tallet (netto/brutto), spillerne får poeng synkende fra feltstørrelsen (vinner = antall spillere, ned til 1), uavgjort deler snittet av plassene de spenner. Sesong = sum av poeng; uteblitt runde = 0 poeng. Type-A-tester.
- `points` i veiviserens sesong-modell-valg + admin-detalj-label.

#### Changed
- `computeLeagueStandings` er nå retnings-bevisst: poeng sorteres høyest-først (countback + sentinel snudd), mens mot-par-modellene er uendret (lavest-først). Nytt `points`-felt på sesong-cellen; tabellen viser poeng per runde og en «Poeng»-kolonne for poeng-ligaer.

</details>

</details>

<details>
<summary><strong>1.91.y — Liga · netto, brutto og beste runder (1 oppføring)</strong></summary>

Issue [#452](https://github.com/jdlarssen/golf-app/issues/452). Liga-epicen Fase 2a: sesong-tabellen kan nå regnes på brutto i tillegg til netto, og en ny «beste runder»-modell lar de svakeste rundene falle bort.

### [1.91.0] - 2026-06-07 · #452

> Ligaen kan nå kåre vinneren på netto, brutto eller begge tallene side om side. Du kan også la sesongen telle bare spillerens beste runder, så en svak dag eller to ikke velter hele tabellen.

<details>
<summary>Teknisk</summary>

[#452](https://github.com/jdlarssen/golf-app/issues/452) Fase 2a (epic). Poeng-per-plassering-modellen er bevisst skilt ut til Fase 2b.

#### Added
- «Beste N runder»-sesongmodell i `computeLeagueStandings`: summen av spillerens N laveste runder. Uteblitte runder straffefylles opp til N (gjenbruker straffe-maskineriet fra Total), og N kappes til antall runder med resultat. Ny `leagues.best_n_count`-kolonne (migrasjon 0085, to CHECK-er).
- Brutto-tabell: `computeLeagueStandings` tar nå et `metric`-valg (netto/brutto), og `getLigaSnapshot` tråer bruttoen fra `computeSoloStrokeplay` videre som brutto-mot-par.
- `LeagueStandingsPanel` med segmentert Netto/Brutto-bryter når ligaen scorer «begge» (gjenbruker `SegmentedField`).

#### Changed
- Liga-veiviseren eksponerer scoring-valget (Netto / Brutto / Begge) og «Beste N runder»-modellen med antall-felt; admin-detaljsiden viser scoring + beste-N.
- `getLigaSnapshot` returnerer sesong-tabeller per scoring (`{ net, gross }`).
- Sesong-celle-feltet `netToPar` heter nå `toPar` (holder det aktive tallet, netto eller brutto).

</details>

</details>

</details>

<details>
<summary><strong>Veiviser — tydeligere format-valg (1 serie)</strong></summary>

<details>
<summary><strong>1.90.y — Veiviser · tydeligere format-valg (1 oppføring)</strong></summary>

Issue [#477](https://github.com/jdlarssen/golf-app/issues/477) + [#478](https://github.com/jdlarssen/golf-app/issues/478). Format-velgeren i veiviseren er ryddet: hvert format merkes med spillestil, lagstørrelse-valget viser bare det som faktisk gjelder, og test-snarveien er skjult for vanlige brukere.

### [1.90.0] - 2026-06-07 · #477, #478

> Når du setter opp et spill, ser du nå med en gang om et format spilles solo, hver for seg eller på lag. Et lite merke på hvert kort sier hva som gjelder, og lagstørrelse-valget viser bare størrelsene formatet faktisk støtter — ingen grå «kommer snart»-valg lenger.

<details>
<summary>Teknisk</summary>

[#478](https://github.com/jdlarssen/golf-app/issues/478): format-kortene i veiviseren og på /spillformer får et spillestil-merke (Solo / Hver for seg / Lag / Solo eller lag) drevet av ny `formatPlayStyle(mode)`. `TeamSizeSelector` viser kun lagstørrelsene formatet faktisk støtter — de grå «kommer snart»-flisene (solo scramble, solo best ball, 4-mann stableford) er borte. [#477](https://github.com/jdlarssen/golf-app/issues/477): «Solo / Test»-arrangementet i `IntentSelector` vises kun for admin (et eksisterende solo-spill viser fortsatt kortet i edit-flyten).

#### Added
- `formatPlayStyle(mode)` + `PLAY_STYLE_LABELS` i `lib/scoring/modes/types.ts` og delt `<FormatStyleBadge>` — spillestil-klassifisering med enhetstester. 4BBB-kortet på /spillformer låses til «Lag» via valgfri `teamSize`.

#### Changed
- `TeamSizeSelector` lister kun gyldige lagstørrelser per format; «kommer snart»-flisene er fjernet (#478).
- Format-kortene (veiviser + /spillformer) viser spillestil-merket.
- `IntentSelector` gater «Solo / Test» bak `isAdmin` — tråd gjennom `GameWizard`, `/opprett-spill` og `/admin/games/new` (#477).

</details>

</details>

</details>

<details>
<summary><strong>Venner — vennegrafen vokser (1 serie)</strong></summary>

<details>
<summary><strong>1.89.y — Venner · vennegrafen vokser av seg selv (1 oppføring)</strong></summary>

Issue [#481](https://github.com/jdlarssen/golf-app/issues/481). Vennegrafen vokser nå av seg selv gjennom invitasjoner, ikke bare via manuelle venneforespørsler.

### [1.89.0] - 2026-06-07 · #481

> Inviterer du noen på e-post og de blir med i spillet, blir dere automatisk venner. Da ligger de klare i lista neste gang du skal legge til spillere, så du slipper å sende venneforespørsel i tillegg.

<details>
<summary>Teknisk</summary>

[#481](https://github.com/jdlarssen/golf-app/issues/481): oppfølging av [#464](https://github.com/jdlarssen/golf-app/issues/464). Da «legg til spiller» ble begrenset til venner og klubbmedlemmer, manglet den organiske veksten av vennegrafen på e-post-stien. `verifyCode` har allerede inviterens id (`invitations.invited_by`) når en e-postinvitert logger inn og blir med, så vennskapet opprettes der.

#### Added
- Migrasjon `0084`: SECURITY DEFINER `befriend_inviter(p_inviter)` — speiler `connect_via_friend_code`, lager en `accepted`-rad (inviter = requester). Idempotent, og gated på en akseptert invitasjon som lenker de to, så ingen kan «bli venn» med vilkårlige bruker-ider.
- `distinctInviterIds()` i `lib/friends/friendGraph.ts` — ren dedup av spill-scopede inviterere (ekskluderer invitéen selv), med enhetstester.

#### Changed
- `verifyCode` fyrer `befriend_inviter` per distinkt inviter etter at en e-postinvitert blir med (best-effort, blokkerer aldri innloggingen). Gjelder også team-only spill, der vennskapet henger på invitasjonen og ikke på en `game_players`-rad.

#### Notes
- Kun spill-invitasjoner: `invitations` har ingen `league_id`, så det finnes ingen e-post-invitasjons-flyt for ligaer å hekte auto-vennskap på.
- Et bevisst `remove_friend` re-vennskaper ved en senere invitasjon (ingen tombstone): fersk invitasjon = fersk samtykke.

</details>

</details>

</details>

<details>
<summary><strong>Klubb-liga (#480, #483, #485) — 3 serier</strong></summary>

<details>
<summary><strong>1.88.y — Klubb-liga · dedikert styringsflate (1 oppføring)</strong></summary>

Issue [#485](https://github.com/jdlarssen/golf-app/issues/485). En klubb-eier eller -admin styrer nå klubb-ligaen sin fra en egen side under klubb-rommet, uten å havne i hovedadminens kontrollpanel.

### [1.88.0] - 2026-06-07 · #485

> Styrer du en klubb-liga, gjør du det nå fra klubbens egen side, ikke fra hovedadminens kontrollpanel. «Styr»-knappen tar deg rett dit, og du gjør alt der: start og avslutt ligaen, legg til runder og deltakere, eller slett den.

<details>
<summary>Teknisk</summary>

[#485](https://github.com/jdlarssen/golf-app/issues/485): oppfølging av [#483](https://github.com/jdlarssen/golf-app/issues/483) (approach b). Styrings-UI-et er trukket ut til en delt `<LigaManagement>`-komponent som rendres av både `/admin/liga/[id]` (global admin, `AdminShell`) og den nye `/klubber/[id]/liga/[ligaId]` (klubb-admin, `AppShell`). Ingen ny RLS eller auth — gaten og handlingene fra #483 er urørt.

#### Added
- `/klubber/[id]/liga/[ligaId]` + `/klubber/[id]/liga/[ligaId]/slett` — dedikert klubb-styrings- og slette-flate uten admin-chrome.
- Delte server-komponenter `<LigaManagement>` og `<LigaDeleteConfirm>` med `'admin' | 'club'`-variant (styrer kun shell + slett-sti); alt styrings-innhold deles, ingen duplisering.

#### Changed
- «Styr»-lenken i «Klubbens ligaer» peker nå til klubb-ruten i stedet for `/admin/liga/[id]`.
- `handleDeleteLeague` flyttet til `lib/league/actions.ts` så begge slett-rutene deler den.

</details>

</details>

<details>
<summary><strong>1.87.y — Klubb-liga · klubb-admin styrer (1 oppføring)</strong></summary>

Issue [#483](https://github.com/jdlarssen/golf-app/issues/483). En klubb-eier eller -admin kan nå starte, avslutte og styre sin egen klubb-liga selv — ikke bare opprette den.

### [1.87.0] - 2026-06-07 · #483

> Er du eier eller admin i en klubb, kan du nå styre klubb-ligaen din selv: start og avslutt den, legg til runder og deltakere, og utvid spillevinduer. Du trenger ikke lenger be hovedadmin om hjelp.

<details>
<summary>Teknisk</summary>

[#483](https://github.com/jdlarssen/golf-app/issues/483): Liga-styringen (`/admin/liga/[id]` + handlingene) var global-admin-only. Nå autoriserer en league-aware gate klubb-admins for deres egen klubb-liga. RLS (migrasjon `0083`) er fortsatt sikkerhets-grensa.

#### Added
- `requireAdminOrClubAdminOfLeague(leagueId)` — slår opp ligaens klubb og slipper klubb-eier/-admin (eller global admin) inn; frittstående liga forblir global-admin-only.
- «Styr»-lenke per liga i «Klubbens ligaer» (kun for eier/admin) → liga-styringssiden.

#### Changed
- Alle 9 styrings-handlinger (start, avslutt, runder, deltakere, vindu-override, slett) + styringssiden + slett-siden bruker den nye gaten.
- Liga-styringssiden er klubb-bevisst for en klubb-liga: deltaker-pickeren viser klubbmedlemmer, tilbake-lenke og slett peker til klubb-siden, og kicker viser klubbnavnet.
- `addLeaguePlayers` filtrerer til klubbmedlemmer for klubb-ligaer (speiler opprett-guardrailen).

</details>

</details>

<details>
<summary><strong>1.86.y — Klubb-liga (2 oppføringer)</strong></summary>

Issue [#480](https://github.com/jdlarssen/golf-app/issues/480) (epos). En klubb kan nå kjøre sin egen liga: eieren eller en klubb-admin setter den opp rett fra klubb-siden, og medlemmene ser den og blir med.

### [1.86.1] - 2026-06-07 · #480

> Etter at du har satt opp en klubb-liga, lander du nå tilbake på klubb-siden der den nye ligaen står i lista — i stedet for å bli sendt til en side bare hovedadmin har tilgang til.

<details>
<summary>Teknisk</summary>

[#480](https://github.com/jdlarssen/golf-app/issues/480): `createLeagueDraft` redirecter klubb-scopede ligaer til `/klubber/[groupId]` (klubb-admin når ikke det global-admin-gatede `/admin/liga/[id]`). Frittstående ligaer går fortsatt til `/admin/liga/[id]`.

</details>

### [1.86.0] - 2026-06-07 · #480

> Er du eier eller admin i en klubb på Tørny, kan du nå sette opp en liga for klubben rett fra klubb-siden. Deltaker-lista viser klubbens medlemmer, og alle i klubben ser ligaen og blir med på sesongen.

<details>
<summary>Teknisk</summary>

[#480](https://github.com/jdlarssen/golf-app/issues/480) Fase 1 av eposet «klubben kjører egne konkurranser». Gir `leagues` en valgfri klubb-tilknytning og åpner skrive-tilgang for klubb-eiere og -admins på klubb-scopede rader.

#### Added
- Migrasjon `0083`: `leagues.group_id` (nullable FK → `groups`), medlems-scopet SELECT-policy (frittstående synlig for alle, klubb-scopet kun medlemmer + global admin), og admin/klubb-admin WRITE-policy på `leagues`/`league_rounds`/`league_players` via ny SECURITY DEFINER `league_group_id()`.
- `requireAdminOrClubAdmin` (slipper klubb-eier/-admin eller global admin inn) + `getClubMemberOptionsForClub` (klubbens medlemmer som picker-kilde).
- `/klubber/[id]/liga/ny` — klubb-eier/-admin oppretter en klubb-liga; deltaker-pickeren viser klubbens medlemmer i stedet for venner.
- «Klubbens ligaer»-seksjon på klubb-siden: alle medlemmer ser klubbens ligaer; «Ny liga»-knapp kun for eier/admin.

#### Changed
- `createLeagueDraft` autoriserer etter `group_id`: satt → klubb-admin og deltakere filtrert til klubbmedlemmer; tom → global admin som før.
- `/liga/[id]` vises kun for medlemmer, deltakere og global admin når ligaen er klubb-scopet (snapshot bruker admin-client, så gaten ligger i app-laget).
- Frittstående liga er uendret: synlig for alle, opprettes kun av global admin. Å åpne frittstående liga-oppretting for alle er et eget issue.

</details>

</details>

</details>

<details>
<summary><strong>Venner i spiller-pickeren (#464) — 1 serie</strong></summary>

<details>
<summary><strong>1.85.y — Venner i spiller-pickeren (1 oppføring)</strong></summary>

Issue [#464](https://github.com/jdlarssen/golf-app/issues/464). Når du legger til folk i et spill eller en liga, viser plukk-lista nå vennene dine — eller klubbens medlemmer når du arrangerer for en klubb — i stedet for hele brukerbasen.

### [1.85.0] - 2026-06-07 · #464

> Skal du legge til spillere i en kompis-runde, cup eller liga, ser du nå bare vennene dine i lista. Arrangerer du for en klubb, viser den medlemmene i klubben. Folk du ikke kjenner på Tørny ennå inviterer du som før, på e-post.

<details>
<summary>Teknisk</summary>

[#464](https://github.com/jdlarssen/golf-app/issues/464): Picker-kilden følger nå konteksten i stedet for å vise alle brukere. Plukk-mengden filtreres ned per intent, aldri hele basen.

#### Added
- `lib/wizard/selectablePlayers.ts` — ren, testet beslutnings-funksjon: kompis/cup → venner, klubb m/ valgt klubb → klubbmedlemmer (ellers venner), solo → uendret. Du selv er alltid valgbar i ikke-solo-kontekster.
- `lib/clubs/getClubMemberPlayerOptions.ts` — klubbmedlemmer som `PlayerOption`-rader (e-post-fri, admin-client), speiler `getFriendPlayerOptions`. Returnerer både id-map (filtrering) og rader (roster-merge).
- Tom-tilstand i veiviseren og liga-«legg til deltakere»: «Legg til venner»-lenke når du ikke har venner ennå, eller et hint når en valgt klubb mangler andre medlemmer.

#### Changed
- Veiviser-steg 4 sourcer fra `selectablePlayers` (begge opprett-flater: `/admin/games/new` + `/opprett-spill`). `TeamsAssignmentSection` beholder full roster så allerede-valgte alltid slås opp.
- Liga-«legg til deltakere» (`/admin/liga/[id]`) henter fra `getFriendPlayerOptions` i stedet for hele rosteren — speiler liga-opprett.

#### Removed
- `FriendQuickAdd`-raden — overflødig nå som hoved-pickeren *er* vennelista for kompis.

</details>

</details>

</details>

<details>
<summary><strong>Bekreftet deltakelse (#463) — 1 serie</strong></summary>

<details>
<summary><strong>1.84.y — Bekreftet deltakelse (1 oppføring)</strong></summary>

Issue [#463](https://github.com/jdlarssen/golf-app/issues/463). Legger en arrangør deg til i et spill eller en liga, må du nå bekrefte at du er med. Du er fullt med fra start — det er en merkelapp og et dytt for å dra folk inn i appen, ikke en sperre.

### [1.84.0] - 2026-06-07 · #463

> Når noen legger deg til i et spill eller en liga, blir du merket «Ikke bekreftet» til du sier ja. Du er med fra første slag uansett. Merkelappen er bare et lite dytt, og den forsvinner så snart du åpner spillet eller trykker bekreft.

<details>
<summary>Teknisk</summary>

[#463](https://github.com/jdlarssen/golf-app/issues/463): Tidligere ble en spiller som ble lagt til av en arrangør stille satt rett inn. Nå bærer hver `game_players`- og `league_players`-rad en `accepted_at`. Modellen er «merkelapp + dytt» (eier-beslutning) — `accepted_at = null` gir kun en badge + et varsel, scorene teller og ingenting blokkeres.

#### Added
- Migrasjon `0082`: `accepted_at` på begge tabeller (backfill `now()` for eksisterende rader så ingen markeres ubekreftet), self-mark-accepted RLS på begge (speiler 0012, på `auth.uid()`), og ny `player_added` varsel-kind.
- `lib/games/participantAcceptance.ts` (`acceptedAtForActor`) — testet single source of truth: self → `now()`, arrangør-legger-til-annen → `null`. Wiret inn på alle innsettings-steder.
- «Bekreft deltakelse»-handlinger (RLS-backed) for spill og liga, og auto-bekreft når du åpner spillet/liga-siden (atomisk, idempotent, speiler `maybeSendDeliveryReminder`).
- `UnconfirmedBadge` («Ikke bekreftet») i game-roster, admin spill-detalj, admin spillerstatus og liga-deltakerliste.
- Admin-purre på spillerstatus-siden: «Purr ubekreftede spillere» sender et `player_added`-varsel til alle som ennå ikke har bekreftet.

#### Changed
- `accepted_at` tråt inn i `getGameWithPlayers` (`PlayerForHole`) og `getLigaSnapshot` (`LeagueParticipant.acceptedAt`) så flatene kan vise status.
- `mode_config`-uavhengig: ingen endring i spill-logikk. Wolf/format-validering urørt.

</details>

</details>

</details>

<details>
<summary><strong>Liga (#452) — 1 serie</strong></summary>

<details>
<summary><strong>1.83.y — Liga (16 oppføringer)</strong></summary>

Issue [#453](https://github.com/jdlarssen/golf-app/issues/453) (epic [#452](https://github.com/jdlarssen/golf-app/issues/452)). Du kan nå arrangere en liga: flere runder over en hel sesong, med en levende tabell som holder styr på hvem som leder.

### [1.83.15] - 2026-06-07 · #465

> Wolf krevde akkurat fire spillere. Nå kan dere kjøre Wolf med tre, fire eller fem — ulven velger partner eller går alene mot resten, og poengene følger antallet.

<details>
<summary>Teknisk</summary>

[#465](https://github.com/jdlarssen/golf-app/issues/465): Wolf var det eneste «eksakt antall»-formatet med ekte 3- og 5-spiller-varianter i golf-kulturen. Bare to ting avhang reelt av antallet — rotasjonen og to scoring-konstanter — resten generaliserte av seg selv.

#### Changed
- [`lib/scoring/modes/wolf.ts`](lib/scoring/modes/wolf.ts) + speilet [`wolfRotation.ts`](app/games/[id]/holes/[holeNumber]/wolfRotation.ts): rotasjonen bruker `R = floor(18/n)*n` som siste rotasjons-hull, resten er trailing-wolf. n=3 → R=18 (ingen trailing), n=4 → R=16 (uendret), n=5 → R=15. Lone-gevinst = `n`, blind = `n+2` (var flatt 4/6). n=4 er byte-identisk.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) `validateWolf`: 3-5 spillere, team_numbers må være sammenhengende 1..n, `teams_count = n`.
- [`lib/wizard/fitsPlayerCount.ts`](lib/wizard/fitsPlayerCount.ts): `wolf` flyttet ut av eksakt-4-blokken til `n >= 3 && n <= 5`.
- [`useGameFormState.ts`](app/admin/games/new/useGameFormState.ts) + [`WolfSetup.tsx`](app/admin/games/new/sections/WolfSetup.tsx): dynamisk antall rotation-slots med R-basert hull-fordeling og trailing-note kun når R<18.
- In-round-copy ([`WolfChoiceModal.tsx`](app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx) + Wolf-badge i [`HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx)) og spillforklaringen ([`modeGuide.ts`](lib/formats/modeGuide.ts)) viser nå faktiske lone/blind-poeng for antallet i stedet for den gamle «2x/3x»-rammingen som bare stemte ved fire spillere.

#### Added
- n=3 og n=5-dekning i `wolf.test.ts` / `wolfRotation.test.ts` (rotasjon, trailing-segment, lone/blind/partner-utdeling); 3-5-grenser i `gamePayload.test.ts`, `fitsPlayerCount.test.ts`, `useGameFormState.test.ts` og `WolfSetup.test.tsx`. Alle eksisterende n=4-tester er uendret.

</details>

### [1.83.14] - 2026-06-07 · #460

> Skins, Nassau og Bingo Bango Bongo forsvant fra veiviseren så snart dere ble flere enn fire. Nå tar alle tre opptil 16 spillere, så du kan kjøre en stor skins-pott på klubbkvelden.

<details>
<summary>Teknisk</summary>

[#460](https://github.com/jdlarssen/golf-app/issues/460): 4-grensen for de tre solo-formatene var kunstig. Slot-emisjonen i veiviseren er allerede dynamisk, scoring itererer over alle spillere, og podiene viser topp-3 + en rest-liste — alt er antalls-agnostisk. 16 er den naturlige øvre grensen før ny slot-infrastruktur trengs.

#### Changed
- [`lib/wizard/fitsPlayerCount.ts`](lib/wizard/fitsPlayerCount.ts): `nassau`/`skins`/`bingo_bango_bongo` gikk fra `n >= 2 && n <= 4` til `<= 16`. Styrer hvilke kort som vises i Kompis-grid-et.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts): de tre validatorene leser nå opptil 17 slots (én over cap-en, så en 17. spiller fanges i stedet for å trunkeres stille) og avviser ved `> 16`. Acey Deucey og de andre eksakt-antall-formatene er urørt.
- [`app/admin/games/new/useGameFormState.ts`](app/admin/games/new/useGameFormState.ts): publish-validitetsflaggene og de tre «for mange spillere»-meldingene oppdatert til maks 16.

#### Added
- Boundary-tester i [`fitsPlayerCount.test.ts`](lib/wizard/fitsPlayerCount.test.ts) (16 → vises, 17 → skjules) og [`gamePayload.test.ts`](lib/games/gamePayload.test.ts) (publish 16 → ok, 17 → avvist) per format.
- Scoring-tester i `lib/scoring/modes/{skins,nassau,bingoBangoBongo}.test.ts` med stort felt som bekrefter at beregningen er antalls-agnostisk over fire spillere.

</details>

### [1.83.13] - 2026-06-06 · bug

> I et sjeldent feiloppsett kunne et spill bli umulig å melde seg på via lenken. Du fikk en blindvei i stedet for påmeldingsknappen. Nå kommer du alltid fram til å melde deg på.

<details>
<summary>Teknisk</summary>

[#466](https://github.com/jdlarssen/golf-app/issues/466): på den offentlige påmeldingssiden falt et solo-format med `registration_type = 'both'` inn i lag-grenen, traff `!gameModeSupportsTeams` og returnerte en blindvei-advarsel — selv om `'both'` eksplisitt tillater solo. Latent: ingen spill i prod har tilstanden, og `buildGameInsertPayload` gater den allerede ved opprett/rediger (`team_registration_unsupported_mode`). Den var bare nåbar ved direkte data-manipulasjon eller en framtidig ikke-validert skrivesti.

#### Fixed
- Ny ren utvalgs-funksjon `resolveRegistrationTypeView` i `app/signup/[shortId]/registrationTypeView.ts` (Type-A-testbar), trukket ut av `renderBody`: `'both'` på en solo-format → solo-form (ikke blindvei); `'team'` på en solo-format → informativ melding; team/both på en lag-modus → lag-form.
- `app/signup/[shortId]/page.tsx`: `renderBody` bruker funksjonen i stedet for den sammenslåtte `'team' || 'both'`-grenen.
- Co-located Type-A-test i `app/signup/[shortId]/registrationTypeView.test.ts` dekker hele 3×2-matrisen (registration_type × modeSupportsTeams).

Validator-gaten (fix #2 i issuet) var allerede på plass som en avvisning, så `gamePayload.ts` er urørt.

</details>

### [1.83.12] - 2026-06-06 · bug

> Shamble dukket opp i veiviseren allerede ved tre eller fire spillere, for få til å stille to lag. Som de andre scramble-formatene viser den seg nå først fra seks spillere, så dere faktisk kan kjøre en turnering.

<details>
<summary>Teknisk</summary>

Oppfølging av [#467](https://github.com/jdlarssen/golf-app/issues/467): shamble (samme scramble-familie) slapp fortsatt gjennom ett-lags-oppsett i Kompis-antall-filteret. Lag på 3 eller 4 → minste turnering er 2 lag à 3 = 6.

#### Fixed
- [`lib/wizard/fitsPlayerCount.ts`](lib/wizard/fitsPlayerCount.ts): `shamble` krever nå minst 2 lag. Regelen gikk fra `n >= 3 && (n % 3 === 0 || n % 4 === 0)` (viste 3, 4, 6, 8, 9, 12 …) til `n >= 6 && n <= 8 && (n % 3 === 0 || n % 4 === 0)` → `{6, 8}` med 8-slot-payload-cap.
- Co-located Type-A-test i [`fitsPlayerCount.test.ts`](lib/wizard/fitsPlayerCount.test.ts) oppdatert for nytt gulv + cap.

</details>

### [1.83.11] - 2026-06-06 · bug

> Scramble-formatene (Texas, Ambrose og Florida) dukket opp i veiviseren selv når du bare hadde valgt 2 spillere. En scramble trenger lag, og minst to lag for å bli en turnering. Nå viser veiviseren dem først når dere er mange nok: fire for Texas og Ambrose, seks for Florida.

<details>
<summary>Teknisk</summary>

Rapportert bug: i opprett-spill-veiviseren (Kompis-intent) viste antall-filteret scramble-formater som krever lag selv ved 2 spillere. Rot: [`fitsPlayerCount`](lib/wizard/fitsPlayerCount.ts) returnerte `true` (plassholder fra den gang `ambrose`/`florida_scramble` var klubb-only) for de to, og `texas_scramble` hadde gulv på 2 (ett lag à 2). Siden ble Ambrose/Florida/shamble lagt til Kompis-katalogen i live-DB (`format_intent_mapping`) uten at antall-regelen ble oppdatert, så de slapp gjennom — Ambrose og Florida ble til og med vist på 1 spiller.

#### Fixed
- [`lib/wizard/fitsPlayerCount.ts`](lib/wizard/fitsPlayerCount.ts): scramble-familien krever nå minst 2 lag for å vises i Kompis-antall-filteret. `texas_scramble` + `ambrose` (lag på 2 eller 4) → `{4, 6, 8}`; `florida_scramble` (lag på 3 eller 4) → `{6, 8}`. La samtidig på 8-slot-payload-cap som øvre grense (som best ball alt har).
- Co-located Type-A-test i [`fitsPlayerCount.test.ts`](lib/wizard/fitsPlayerCount.test.ts) dekker gulv, partall/oddetall og 8-slot-cap per format; den permissive fallback-testen tester nå en ukjent modus i stedet for ambrose/florida.

</details>

### [1.83.10] - 2026-06-06 · bug

> Spill uten lag (som Bingo Bango Bongo, Wolf, Nassau og Skins) viste en tom «Lag»- og «Flight»-rad i venterommet før start. Nå viser de bare det som gjelder for et individuelt format.

<details>
<summary>Teknisk</summary>

Rapportert bug: et solo-spill (Bingo Bango Bongo) viste lag-info i spill-visningen «under påmelding». Rot: display-call-sites brukte `isStablefordFamily` som proxy for «solo», så pott-formatene (Wolf/Nassau/Skins/BBB/Nines/Round Robin/Acey Deucey) falt i lag-grenen og leste tomme `team_number`/`flight_number`.

#### Fixed
- Ny single source of truth [`isSoloFormat(mode, teamSize)`](lib/scoring/modes/types.ts) klassifiserer individuelle formater uten lag-/flight-gruppering (eksplisitt `switch` med `never`-uttømming, så en ny `GameMode` MÅ klassifiseres). Co-located Type-A-test i [`isSoloFormat.test.ts`](lib/scoring/modes/isSoloFormat.test.ts).
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) (spiller-venterommet): «DIN INFO»-kortet og deltaker-/flight-lista bytter fra `isStablefordFamily` til `isSoloFormat`. Solo-kortet er nå modus-agnostisk (modus-label + «Individuelt format»-undertittel) i stedet for hardkodet «Individuell stableford-turnering».
- [`app/admin/games/[id]/page.tsx`](app/admin/games/[id]/page.tsx): `isSolo` bruker nå samme helper, så admin-detaljsiden skjuler lag-seksjon + Lag/Flight-kolonner for de samme pott-formatene.

</details>

### [1.83.9] - 2026-06-06 · bug

> På iPhone strakk dato- og tidsfeltene seg utenfor kortet når du oppretter et spill, eller legger til og endrer en liga-runde. Nå står de pent innenfor rammen.

<details>
<summary>Teknisk</summary>

#### Fixed
- Speiler 1.83.7-fiksen til de resterende `datetime-local`-feltene som manglet den. Native `input[type=date/datetime-local]` på iOS respekterer ikke `width:100%` og strekker seg utenfor kort-containeren. La til `appearance-none` + `min-w-0` på:
  - Tee-off-feltet i [`BasicsSection`](app/admin/games/new/sections/BasicsSection.tsx) (opprett-spill-veiviseren) via `inputClassName`-proppen på `Input`.
  - «Åpner»/«Stenger»-feltene i [`LigaAddRound`](app/admin/liga/[id]/LigaAddRound.tsx) (legg til egendefinert runde) + `min-w-0` på grid-cellene.
  - «Ny frist»-feltet i [`LigaRoundRow`](app/admin/liga/[id]/LigaRoundRow.tsx) (utvid runde-vindu).

</details>

### [1.83.8] - 2026-06-06 · bug

> Når du oppretter en kompis-runde står antall-velgeren nå på 4 fra start, i stedet for et forvirrende «?». Veiviseren viser med en gang formatene som passer for fire spillere, og du justerer opp eller ned derfra.

<details>
<summary>Teknisk</summary>

#### Fixed
- `PlayerCountPicker` i [`GameWizard`](app/admin/games/new/GameWizard.tsx) viste «?» fordi `expectedPlayerCount` initialiserte til `undefined` (= ingen filter). Visuelt hoppet +/− fra «?» rett til 3/5 (forbi 4), siden den interne fallbacken var 4. Flyttet default til en delt konstant `PLAYER_COUNT_DEFAULT = 4` i [`useGameFormState`](app/admin/games/new/useGameFormState.ts) og satte initial state til den, så grid-et er filtrert til fire spillere fra start. «Vis alle»-knappen setter fortsatt `undefined` for å vise hele katalogen; Matchplay (krever 2) og Nines (krever 3) dukker opp når du trykker minus. Hint-teksten i steg 3 endret fra «Du valgte N» til «Dere er N» (default er ikke et aktivt valg), på linje med picker-spørsmålet «Hvor mange er dere?». Oppdaterte #373-filtertesten til ny default.

</details>

### [1.83.7] - 2026-06-06 · #453

> Dato-feltene når du oppretter en liga var fortsatt for brede og strakk seg utenfor kortet. Nå er de smale nok til å stå pent side om side, innenfor rammen.

<details>
<summary>Teknisk</summary>

#### Fixed
- Oppfølger til 1.83.4: native `input[type=date]` på iOS respekterte ikke `width:100%` og strakk seg utenfor kort-containeren (bredere enn de andre feltene). La til `appearance-none` + `min-w-0` (+ litt mindre `px`) kun på de to dato-feltene i [`CreateLigaForm`](app/admin/liga/new/CreateLigaForm.tsx), så native-kontrollen krymper til containeren. Tilbake til `grid-cols-2` (side om side) siden de nå får plass. Bane-`<select>` rørt ikke (ville mistet nedtrekks-pilen med `appearance-none`).

</details>

### [1.83.6] - 2026-06-06 · bug

> Når du setter opp Acey Deucey er den unødvendige «lagstørrelse»-velgeren borte. Acey Deucey er et solo-format, så valget hadde ingen mening — nå viser veiviseren bare det som faktisk gjelder.

<details>
<summary>Teknisk</summary>

#### Fixed
- [`GameWizard`](app/admin/games/new/GameWizard.tsx) skjuler nå `TeamSizeSelector` for Acey Deucey (la til `!state.isAceyDeucey` i synlighets-gaten), på linje med de andre solo-/rotasjons-formatene (Wolf/Nassau/Skins/BBB/Nines/Round Robin). Acey Deucey er `team_size = 1` med eget `AceyDeuceySetup`-steg, så velgeren viste tre fliser der bare «Solo» var aktiv. Rent kosmetisk — opprettelse fungerte allerede.

</details>

### [1.83.5] - 2026-06-06 · bug

> Du kan nå sette opp Bingo Bango Bongo. Før låste veiviseren seg på spiller-steget: «Neste» lyste ikke opp selv om du hadde valgt to spillere. Samme feil rammet Nassau og Skins. Alle tre virker nå med 2 til 4 spillere.

<details>
<summary>Teknisk</summary>

Rapportert bug: veiviseren (`app/admin/games/new`) lot deg velge Bingo Bango Bongo, men «Neste» på spiller-steget ble aldri aktiv. Rot: solo-formater uten lag manglet riktig oppsett i `useGameFormState`.

#### Fixed
- [`defaultTeamSizeForMode`](app/admin/games/new/useGameFormState.ts) manglet `nassau`, `skins` og `bingo_bango_bongo` og falt til default-2. Det gjorde `requiresTeams` sann, så `orderedPayload` tok lag-stien og endte tom — publish ville sendt 0 spillere. Alle tre er nå `team_size = 1` (solo-stien emitter spillerne med `team_number`/`flight_number` null), som speiler `validateBingoBangoBongo`/`validateNassau`/`validateSkins` i [`gamePayload.ts`](lib/games/gamePayload.ts).
- Bingo Bango Bongo manglet i tillegg en gren i `playersValidForMode` (falt til `false`), så «Neste» kunne aldri lyse opp. Lagt til `isBingoBangoBongo`-flagg, `bingoBangoBongoPlayersValid` (2–4 spillere), gren i `playersValidForMode`, mangel-melding i `missingForPublish`, og unntak fra den generiske `hcp_allowance`-sjekken (BBB har egen scoring-konfig, ingen allowance).
- [`GameWizard`](app/admin/games/new/GameWizard.tsx) skjuler nå lagstørrelse-velgeren for Bingo Bango Bongo (som for Nassau/Skins/Nines) — den var meningsløs for et solo-format.

#### Notes
- Nassau og Skins var rammet av samme rot-årsak og er fikset i samme slengen. Ingen av de tre formatene hadde noensinne blitt opprettet i prod (bekreftet mot databasen), så ingen data ble berørt.
- Regresjonstester i [`useGameFormState.test.ts`](app/admin/games/new/useGameFormState.test.ts) dekker alle tre formatene: 2 valgte spillere → `team_size 1`, gyldig for modus, payload med 2 rader (team/flight null).

</details>

### [1.83.4] - 2026-06-06 · #453

> Når du setter opp en liga inviterer du nå vennene dine — listen viser deg selv (forhåndsvalgt) og vennene dine, ikke alle på Tørny. Har du ingen venner ennå, får du en lenke for å legge dem til. Og sesong-datoene ligger ikke lenger oppå hverandre på mobil.

<details>
<summary>Teknisk</summary>

Prod-tilbakemelding på opprett-veiviseren (etter at #453 gikk live):

#### Changed
- Deltaker-velgeren i [`app/admin/liga/new`](app/admin/liga/new/page.tsx) henter nå innloggers venner via `getFriendPlayerOptions` i stedet for alle spillere (`getNewGameFormData`). Skaperen prepends som forhåndsvalgt «(deg)»-rad så de kan spille i egen liga; tom venne-liste gir en lenke til `/profile/venner`. Gjelder frittstående ligaer (klubb-tilknytning er F3). Insentiverer å legge til venner på Tørny.

#### Fixed
- Sesong start/slutt-datoene overlappet på smale skjermer (native date-inputer + `grid-cols-2` med default `min-width:auto`). Nå `grid-cols-1 sm:grid-cols-2` + `min-w-0` — stables på mobil, side-om-side med plass på større skjermer.

</details>

### [1.83.3] - 2026-06-06 · #453

> Når du setter opp en liga, viser veiviseren nå med en gang hvor mange runder datoene og frekvensen gir — «Dette gir 6 runder: jun, jul, aug, sep, okt, nov» — så du ser antallet før du oppretter, ikke etterpå.

<details>
<summary>Teknisk</summary>

#### Added
- Live runde-forhåndsvisning i [`CreateLigaForm`](app/admin/liga/new/CreateLigaForm.tsx): sesong-datoene + frekvensen er nå kontrollert state og kjører `generateRounds` i nettleseren for å vise antall runder (+ månedsliste for månedlig / vindu-lengde for uke/annenhver) reaktivt. Gjør koblingen «datoer + frekvens → antall runder» synlig i veiviseren i stedet for først på detalj-siden.

</details>

### [1.83.2] - 2026-06-06 · #453

> Du kan nå legge til runder manuelt på en liga — én etter én, med egen start og frist. Det betyr at du kan bestemme akkurat hvor mange runder ligaen skal ha, og at «Egendefinert» frekvens nå faktisk fungerer (du bygger runde-lista selv).

<details>
<summary>Teknisk</summary>

#### Added
- [`addLeagueRound`](lib/league/actions.ts) server-action + [`LigaAddRound`](app/admin/liga/[id]/LigaAddRound.tsx)-komponent på liga-detalj — legg til en enkelt runde (sequence = maks + 1, bane/tee arvet fra ligaen per omfang).

#### Fixed
- «Egendefinert» frekvens var en blindvei: `generateRounds` lager null vinduer for den, og det fantes ingen vei til å legge til runder manuelt. Manuell runde-tillegg lukker hullet og gir samtidig direkte kontroll over antall runder.

</details>

### [1.83.1] - 2026-06-06 · #453

> «Start ligaen»-knappen krever nå riktig minst to deltakere, slik at du ikke får en uforklarlig feil når du prøver å starte med bare én.

<details>
<summary>Teknisk</summary>

Fikser fra skeptisk evaluering av Fase 1:

#### Changed
- [`app/admin/liga/[id]/page.tsx`](app/admin/liga/[id]/page.tsx) — `canStart`-terskelen + hint-teksten matcher nå server-guarden (≥1 runde + ≥2 deltakere). Tidligere lot UI-et deg trykke med 1 deltaker og fikk en generisk feil.
- [`lib/league/actions.ts`](lib/league/actions.ts) — `createLeagueDraft` validerer nå `scoring`/`missed_round_policy`/`penalty_kind`-enumene (defense-in-depth), og en kommentar dokumenterer insert-før-start-ordringsinvarianten som lar flight-starteren lese medspilleres handicap under RLS.

</details>

### [1.83.0] - 2026-06-06 · #453

> Du kan nå sette opp en liga. Velg om hele sesongen spilles på samme bane og tee, eller om det varierer fra runde til runde. Bestem hvor ofte det spilles (hver uke, annenhver eller hver måned) og hvordan vinneren kåres: sum mot par, eller snitt. Spillerne har hele runde-vinduet på seg og må spille sammen med minst én annen. Tabellen fylles ut etter hvert som flightene leveres.

<details>
<summary>Teknisk</summary>

Issue [#453](https://github.com/jdlarssen/golf-app/issues/453), Fase 1 av liga-epicen [#452](https://github.com/jdlarssen/golf-app/issues/452). Frittstående slagspill-liga (netto), bygget som et paraply-lag over `games` — speiler cup-mønsteret.

#### Added
- Migrasjon `0080_leagues.sql` — `leagues` / `league_rounds` / `league_players` + `games.league_round_id` + `games.delivered_outside_window`. SELECT-RLS for alle innloggede; skriv gated til `is_admin()`.
- [`lib/league/computeLeagueStandings.ts`](lib/league/computeLeagueStandings.ts) — ren sesong-aggregator (Total + Snitt, straffescore, countback-tiebreak). 10 Type A-tester.
- [`lib/league/generateRounds.ts`](lib/league/generateRounds.ts) — frekvens → spillevinduer (uke / annenhver / måned). 7 Type A-tester.
- [`lib/league/getLigaSnapshot.ts`](lib/league/getLigaSnapshot.ts) — IO-lag som kjører slagspill-scoring per flight og bygger netto-mot-par.
- [`lib/league/actions.ts`](lib/league/actions.ts) — opprett liga, runde- og deltaker-styring, vindu-override, og deltaker-flight-starter (server-håndhevet markør-regel + spillevindu).
- Flater: offentlig `/liga/[id]` (sesong-tabell + runder), fokusert runde-starter, admin `/admin/liga` (liste, opprett-veiviser, detalj med vindu-override + utenfor-vindu-flagg, slett), og «Ligaer»-flis i Klubbhuset.

#### Changed
- [`app/admin/page.tsx`](app/admin/page.tsx) — ny «Ligaer»-flis med aktiv-telling.

</details>

<details>
<summary><strong>1.82.y — Cup-start-varsel (2 oppføringer)</strong></summary>

Issue [#417](https://github.com/jdlarssen/golf-app/issues/417) (milepæl End-game robusthet). Når en cup settes i gang, varsles deltakerne nå i appen først. Mail går bare til dem som ikke er innom.

### [1.82.1] - 2026-06-06 · #446

> Trykker du en knapp som lagrer, sender eller avslutter, sier den nå ifra at den jobber — teksten bytter til «Lagrer …», «Sender …» og lignende, og knappen låses så du ikke trykker to ganger ved et uhell.

<details>
<summary>Teknisk</summary>

#### Added
- `components/ui/Spinner.tsx` — delt laster-spinner (arver tekstfarge via `border-current`).
- `Button`-prop `pending` + `pendingLabel` — disabled + spinner + presens-tekst.
- `components/ui/SubmitButton.tsx` — `useFormStatus`-bro for `<form action>`-flyter.

#### Changed
- Server-action-knapper app-wide bytter til en ensartet laster-tilstand (presens-tekst + spinner, disabled) mens handlingen kjører. Dekker lagring, levering, opprettelse, godkjenning, avslutning m.m. på tvers av spiller- og admin-flatene.
- `SendCodeForm` bruker den delte `Spinner` i stedet for en lokal kopi.

</details>

### [1.82.0] - 2026-06-06 · #417

> Når en cup settes i gang, dukker det opp et varsel i appen — «Cupen har startet» — for alle deltakerne. Er du innom appen, ser du det der med en gang. Er du ikke det, får du en mail i stedet. Ingen får lenger en mail de ikke trenger.

<details>
<summary>Teknisk</summary>

Issue [#417](https://github.com/jdlarssen/golf-app/issues/417). Symmetrisk søster av cup-avslutnings-varselet ([#377](https://github.com/jdlarssen/golf-app/issues/377)): cup-start fyrer nå in-app-varsel til alle deltakere først, og mail går kun til off-app-deltakere. Den gamle blanket-mailen til alle er borte.

#### Added
- Notification-kind `cup_started` (migrasjon `0079`) wiret gjennom alle uttømmende steder: [`types.ts`](lib/notifications/types.ts), [`NotificationCard.tsx`](components/notifications/NotificationCard.tsx) («Cupen har startet» 🏌️), [`InboxClient.tsx`](app/innboks/InboxClient.tsx) (deeplink → `/cup/[id]`).
- Delt primitiv `notifyParticipantsCupStarted` ([`events.ts`](lib/notifications/events.ts), 4 Type A-tester) — speiler `notifyParticipantsCupFinished`.

#### Changed
- [`startTournament`](lib/cup/actions.ts) fyrer in-app `cup_started` til alle deltakere, deretter mail kun til off-app via `shouldAlsoSendMail`-gating. Den tidligere `recipients.map(...)`-blanket-mailen er erstattet.

</details>

</details>

<details>
<summary><strong>1.81.y — Venner og åpen-for-venner (3 oppføringer)</strong></summary>

Issue [#369](https://github.com/jdlarssen/golf-app/issues/369) (lukker [#408](https://github.com/jdlarssen/golf-app/issues/408), milepæl Klubb-skala). Du kan nå legge til venner på Tørny. Venner ser spillene dine, og du finner dem raskt når du fyller lag.

### [1.81.2] - 2026-06-05 · #369

> «Åpen for venner» er her. Krysser du av «Slipp venner direkte inn» på et forespørsel-spill, slipper vennene dine forbi godkjenningen og melder seg på direkte. Vennenes egne spill dukker nå opp under «Fra vennene dine» i Finn turneringer. Og når du setter opp en kompis-runde, kan du kjapt legge til vennene dine som spillere.

<details>
<summary>Teknisk</summary>

Issue [#369](https://github.com/jdlarssen/golf-app/issues/369). «Åpen for venner» er uttrykt gjennom de eksisterende påmeldingsmodiene + et skip-gate-flagg — ingen ny `registration_mode`-enumverdi (unngår uttømmende-switch-eksplosjon).

#### Added
- `games.let_friends_skip_gate` + checkbox «Slipp venner direkte inn» i opprett-veiviseren ([`RegistrationSection.tsx`](app/admin/games/new/sections/RegistrationSection.tsx)), kun under «forespørsel»-modus. Persisteres via [`gamePayload.ts`](lib/games/gamePayload.ts) (tvinges `false` for andre modi).
- «Fra vennene dine»-seksjon i [`getDiscoverableGames.ts`](lib/games/getDiscoverableGames.ts) (+ tester) + [`HomeDiscoverySection.tsx`](app/HomeDiscoverySection.tsx) — venners `open`/`manual_approval`-spill (ikke `invite_only`), med avledet `joinMode` (direkte / be-om) per spill og dedup mot klubb/open.
- Kompis-hurtig-legg-til av venner i veiviser-steg 4; [`lib/friends/getFriendPlayerOptions.ts`](lib/friends/getFriendPlayerOptions.ts) unionerer venner inn i `/opprett-spill`-spiller-lista (admin-client forbi users-RLS).

#### Changed
- [`registerForOpenGame`](app/signup/[shortId]/actions.ts) + signup-siden: en akseptert venn av arrangøren på et skip-gate-spill melder seg på direkte (server-verifisert); ikke-venner ber fortsatt om plass.

</details>

### [1.81.1] - 2026-06-05 · #408

> Når du fyller et lag, foreslår Tørny nå vennene dine i tillegg til folk du har spilt med. En venn du aldri har delt en runde med, dukker opp med en gang.

<details>
<summary>Teknisk</summary>

Issue [#408](https://github.com/jdlarssen/golf-app/issues/408). Lag-påmeldings-autocomplete-en leser samme resolver som før; kilden er utvidet.

#### Changed
- [`lib/users/getTeamCandidates.ts`](lib/users/getTeamCandidates.ts) — kandidatene er nå `venner(userId) ∪ co-players(userId)`, deduplikert (4 unit-tester). `TeamRegistrationForm` er uendret. Co-player-oppslaget gjenbrukes fra `lib/users/getCoPlayerIds.ts`.

</details>

### [1.81.0] - 2026-06-05 · #369, #408

> Du har fått venner på Tørny: legg til folk du har spilt med, søk dem opp på e-post, eller del en lenke som gjør den som åpner den til venn med deg på flekken. Innboksen sier fra når noen vil bli venn eller godtar deg.

<details>
<summary>Teknisk</summary>

Issue [#369](https://github.com/jdlarssen/golf-app/issues/369) + [#408](https://github.com/jdlarssen/golf-app/issues/408). Venne-fundamentet: gjensidig relasjon (forespørsel → godta), tre veier å legge til, og in-app-varsler. «Åpen for venner» (skip-gate + «Fra vennene dine»-discovery) kommer i påfølgende oppføringer.

#### Added
- Migrasjon `0077` — `friendships` (RLS select-own, mutasjoner kun via security-definer-RPC), `users.friend_code` (delbar lenke), RPCene `send_friend_request` / `send_friend_request_by_email` / `respond_friend_request` / `remove_friend` / `connect_via_friend_code`, og notification-kindene `friend_request` + `friend_accepted`.
- [`app/profile/venner/`](app/profile/venner/page.tsx) — venneliste, innkommende + utgående forespørsler, co-player-forslag, legg-til-på-e-post (ukjent e-post → tilbud om å invitere på samme adresse), og kopier-del-lenke.
- [`app/venner/legg-til/[code]/`](app/venner/legg-til/[code]/page.tsx) — landingsside for delt lenke; en innlogget som åpner den kobles som venn direkte.
- [`lib/friends/`](lib/friends/getFriendData.ts) — ren graf-logikk (`friendGraph.ts`, 10 unit-tester) + resolvere (`getFriendIds`, `getFriendData`); co-player-oppslaget trukket ut til [`lib/users/getCoPlayerIds.ts`](lib/users/getCoPlayerIds.ts) og delt med lag-påmelding.
- «Venner»-inngang i konto-lista på [`app/profile/page.tsx`](app/profile/page.tsx).

</details>

</details>

<details>
<summary><strong>1.80.y — Klubber: eierskap, delegering og avtaler (6 oppføringer)</strong></summary>

Issue [#50](https://github.com/jdlarssen/golf-app/issues/50) (milepæl Klubb-skala). Klubber settes nå opp via en avtale med Tørny. Eieren kan utnevne med-admins, og hver klubb har et medlemstak og en varighet.

### [1.80.5] - 2026-06-05 · #50

> Sluttdato-feltet i klubb-avtalen er ryddigere: det dukker bare opp når du faktisk velger «Sett sluttdato», får riktig bredde på mobil, og viser datoen dempet til du har valgt en.

<details>
<summary>Teknisk</summary>

Issue [#50](https://github.com/jdlarssen/golf-app/issues/50). Fix fra prod-testing: det rå, alltid-synlige `<input type="date">` hadde feil tom-tilstand-farge og for stor bredde på mobil.

#### Fixed
- [`app/admin/klubber/VarighetField.tsx`](app/admin/klubber/VarighetField.tsx) (ny klient-komponent) — dato-feltet vises kun når «Sett sluttdato» er valgt; teksten er dempet (`text-muted`) til en dato er satt, og full når den er det; bredden er begrenset (`w-full max-w-full appearance-none box-border`) så den matcher de andre feltene på mobil.
- [`app/admin/klubber/ny/page.tsx`](app/admin/klubber/ny/page.tsx) + [`app/admin/klubber/[id]/page.tsx`](app/admin/klubber/[id]/page.tsx) — bruker den delte `VarighetField` i stedet for inline radios + rått dato-felt. Samme `varighet_mode`/`sluttdato`-FormData-kontrakt.

</details>

### [1.80.4] - 2026-06-05 · #50

> «For hvilken klubb?» dukker nå bare opp når du setter opp en klubb-turnering, ikke på en kompis-runde. Kommer du fra en klubb-side via «Sett opp en runde for klubben», er klubben valgt fra start.

<details>
<summary>Teknisk</summary>

Issue [#50](https://github.com/jdlarssen/golf-app/issues/50). Fix fra prod-testing: ClubPicker viste seg uansett arrangement-type.

#### Fixed
- [`app/admin/games/new/GameWizard.tsx`](app/admin/games/new/GameWizard.tsx) — `ClubPicker` («For hvilken klubb?») rendres nå kun for `intent === 'klubb'`, ikke på kompis/solo.
- [`app/admin/games/new/useGameFormState.ts`](app/admin/games/new/useGameFormState.ts) — `setIntent` nullstiller `group_id` når man bytter til en ikke-klubb-intent, så et stale klubb-valg ikke scoper spillet i skjul.
- [`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx) + [`app/opprett-spill/page.tsx`](app/opprett-spill/page.tsx) — en `?klubb=`-dyplenke pre-velger nå klubb-intent, så den forhåndsvalgte klubben vises.

</details>

### [1.80.3] - 2026-06-05 · #50

> Hver klubb har nå et medlemstak og en varighet. Er klubben full, sier appen fra. Går avtalen ut, fryses klubben: den forsvinner fra «Finn turneringer» og tar ikke imot nye medlemmer eller runder. Pågående runder spilles ferdig som normalt, og en eier kan fornye avtalen.

<details>
<summary>Teknisk</summary>

Issue [#50](https://github.com/jdlarssen/golf-app/issues/50) (milepæl Klubb-skala). Håndhevelse av medlemstak + utløp (RPC-laget kom i 1.80.0; dette surfacer det i UI + discovery/veiviser).

#### Added
- [`lib/clubs/clubStatus.ts`](lib/clubs/clubStatus.ts) `isClubExpired` brukes nå på tvers: en utløpt klubb (`valid_until` i fortid) er frossen.

#### Changed
- [`lib/games/getDiscoverableGames.ts`](lib/games/getDiscoverableGames.ts) — filtrerer bort utløpte klubber før klubb-spill-spørringen (+ [`getDiscoverableGames.test.ts`](lib/games/getDiscoverableGames.test.ts) ny case: utløpt klubb → ingen group_id-spørring).
- [`lib/games/newGameFormData.ts`](lib/games/newGameFormData.ts) — veiviseren tilbyr ikke en utløpt klubb i «Hvem er dette for?». [`app/admin/games/new/actions.ts`](app/admin/games/new/actions.ts) — `createGameInternal` dropper `group_id` til null hvis klubben er utløpt.
- [`app/klubber/[id]/page.tsx`](app/klubber/[id]/page.tsx) — utløpt-banner; legg-til-medlem, del-lenke og «Sett opp en runde» fryses; medlemstall vises som `n / tak`. [`actions.ts`](app/klubber/[id]/actions.ts) + side-meldinger mapper de nye `club_full`/`club_expired`-retur-kodene til vennlige bannere.
- [`lib/clubs/getClubDetail.ts`](lib/clubs/getClubDetail.ts) — eksponerer `member_cap` + `valid_until`.

</details>

### [1.80.2] - 2026-06-05 · #50

> Er du eier av en klubb, kan du gjøre andre medlemmer til admin eller eier, eller sette dem tilbake til vanlig medlem. Den det gjelder får et varsel. Den siste eieren kan ikke settes ned, så klubben alltid har noen som styrer.

<details>
<summary>Teknisk</summary>

Issue [#50](https://github.com/jdlarssen/golf-app/issues/50) (milepæl Klubb-skala). Eier-drevet rolle-delegering inne i klubben.

#### Added
- [`app/klubber/[id]/rolle/[userId]/page.tsx`](app/klubber/[id]/rolle/[userId]/page.tsx) + [`actions.ts`](app/klubber/[id]/rolle/[userId]/actions.ts) — dedikert «Endre rolle»-side per medlem (eier-only). `setMemberRole` kaller `set_club_member_role`-RPC (sist-eier-guard); ved suksess varsles den berørte best-effort (`Promise.allSettled`, awaitet før redirect).
- `club_role_changed`-varsel: ny notification-kind ([`lib/notifications/types.ts`](lib/notifications/types.ts) + zod-skjema, [`NotificationCard`](components/notifications/NotificationCard.tsx) 🔑-ikon + rolle-spesifikk tekst, [`InboxClient`](app/innboks/InboxClient.tsx) deeplink → `/klubber/[group_id]`).

#### Changed
- [`app/klubber/[id]/page.tsx`](app/klubber/[id]/page.tsx) — «Endre rolle»-lenke på hvert medlemskort (kun for eier, ikke seg selv) + «Rollen er oppdatert»-banner.

</details>

### [1.80.1] - 2026-06-05 · #50

> Som administrator oppretter du nå klubber fra Sekretariatet: du velger eier, setter et medlemstak og en varighet (uendelig eller en sluttdato), og kan justere avtalen senere.

<details>
<summary>Teknisk</summary>

Issue [#50](https://github.com/jdlarssen/golf-app/issues/50) (milepæl Klubb-skala). Admin-governance-flate for klubber.

#### Added
- [`app/admin/klubber/page.tsx`](app/admin/klubber/page.tsx) — liste over alle klubber (eier, medlemstall/-tak, status-badge Aktiv/Utløper/Utløpt) + «Opprett klubb»-dør.
- [`app/admin/klubber/ny/page.tsx`](app/admin/klubber/ny/page.tsx) + [`actions.ts`](app/admin/klubber/ny/actions.ts) — opprett-klubb-skjema (navn, eier-e-post, medlemstak, varighet) → `admin_create_club`-RPC. `owner_not_found` mappes til en vennlig melding (klubben opprettes ikke).
- [`app/admin/klubber/[id]/page.tsx`](app/admin/klubber/[id]/page.tsx) + [`actions.ts`](app/admin/klubber/[id]/actions.ts) — klubb-detalj + «Avtale»-redigering (medlemstak + valid_until). `updateClubTerms` gater `is_admin` i kode før admin-client-update.
- [`lib/clubs/getAllClubsForAdmin.ts`](lib/clubs/getAllClubsForAdmin.ts) + [`getClubForAdmin.ts`](lib/clubs/getClubForAdmin.ts) — admin-client-helpere (ser klubber admin ikke er medlem av). [`lib/clubs/clubStatus.ts`](lib/clubs/clubStatus.ts) — delt `isClubExpired` + status-badge.

#### Changed
- [`app/admin/page.tsx`](app/admin/page.tsx) — «Klubber»-tile i admin-grenen peker nå til `/admin/klubber` (governance); spiller-grenen er uendret (`/klubber`).

</details>

### [1.80.0] - 2026-06-05 · #50

> Klubber settes nå opp via en avtale. Vil du ha en egen klubb for laget ditt, sender du en e-post til klubb@tornygolf.no, så fikser vi resten.

<details>
<summary>Teknisk</summary>

Issue [#50](https://github.com/jdlarssen/golf-app/issues/50) (milepæl Klubb-skala). Datafundament for klubb-governance + gating av self-serve-opprettelse. Bygger på #442 (0075).

#### Added
- Migrasjon [`0076_clubs_governance_and_roles`](supabase/migrations/0076_clubs_governance_and_roles.sql) — `groups.member_cap` + `groups.valid_until` (avtale-rammer: medlemstak + varighet). SECURITY DEFINER-RPCene `admin_create_club` (is_admin oppretter + overfører til eneeier) og `set_club_member_role` (eier/admin endrer rolle, sist-eier-guard). `add_club_member_by_email` / `decide_join_request` håndhever nå medlemstak + utløp. Ny `club_role_changed`-varselkind.

#### Changed
- [`app/klubber/page.tsx`](app/klubber/page.tsx) — «Opprett klubb»-døra er erstattet med en kontakt-vei (klubb@tornygolf.no); vanlige brukere oppretter ikke lenger klubber selv.
- [`lib/clubs/getMyClubs.ts`](lib/clubs/getMyClubs.ts) — droppet «opprettet av meg»-tellingen (cap-gatingen er borte).
- [`lib/database.types.ts`](lib/database.types.ts) — regenerert for 0076.

#### Removed
- `app/klubber/ny/` (self-serve opprett-klubb-side + action) + `create_club`-RPC — self-serve-opprettelse var en gating-hull (RPC-en kunne kalles direkte og omgå UI-gaten). Erstattet av admin-gated `admin_create_club`.

</details>

</details>

---

<details>
<summary><strong>1.79.y — Klubber: opprett og bli med (5 oppføringer)</strong></summary>

Issue [#442](https://github.com/jdlarssen/golf-app/issues/442) (milepæl Klubb-skala). Du kan nå lage egne klubber, samle folk og turneringer på ett sted, og la medlemmene finne klubbens runder.

### [1.79.4] - 2026-06-05 · #442

> Er du med i en klubb, dukker klubbens runder opp under «Finn turneringer» — også de som ellers er private. Du melder deg på direkte, uten å vente på en invitasjon. Det er dette som gjør en klubb verdt å ha.

<details>
<summary>Teknisk</summary>

Issue [#442](https://github.com/jdlarssen/golf-app/issues/442) (milepæl Klubb-skala). Klubb-scopet oppdagbarhet + direkte-påmelding — kjerneverdien i klubb-konseptet.

#### Added
- [`lib/games/getDiscoverableGames.ts`](lib/games/getDiscoverableGames.ts) — returnerer nå `clubGames`: spill i brukerens klubber, synlige uansett `registration_mode` (også `invite_only`), deduplisert mot den globale open-lista. + [`getDiscoverableGames.test.ts`](lib/games/getDiscoverableGames.test.ts) dekker medlem-ser-invite_only, ikke-medlem-ser-ingenting og dedup.
- [`app/HomeDiscoverySection.tsx`](app/HomeDiscoverySection.tsx) — «I dine klubber»-seksjon (over de globale åpne turneringene), CTA «Meld meg på».

#### Changed
- [`app/signup/[shortId]/page.tsx`](app/signup/[shortId]/page.tsx) + [`actions.ts`](app/signup/[shortId]/actions.ts) — et klubb-medlem får direkte-påmelding på et klubb-spill uansett påmeldingsmåte (solo-flyt). Authz verifiseres server-side i `registerForOpenGame`.
- [`lib/games/getGameByShortId.ts`](lib/games/getGameByShortId.ts) — henter `group_id` (trengs for klubb-medlemskaps-sjekken).
- [`app/finn-turneringer/page.tsx`](app/finn-turneringer/page.tsx) + [`app/page.tsx`](app/page.tsx) — tom-tilstand/innholds-sjekk teller nå også klubb-spill.

</details>

### [1.79.3] - 2026-06-05 · #442

> Når du setter opp en runde, kan du velge hvilken klubb den er for. Da ser alle i klubben runden under «Finn turneringer» og kan melde seg på — også om den ellers er privat. Setter du opp runden fra en klubb-side, er klubben valgt på forhånd.

<details>
<summary>Teknisk</summary>

Issue [#442](https://github.com/jdlarssen/golf-app/issues/442) (milepæl Klubb-skala). Klubb-valg i opprett-spill-veiviseren + `group_id` på spill.

#### Added
- [`app/admin/games/new/GameWizard.tsx`](app/admin/games/new/GameWizard.tsx) + [`useGameFormState.ts`](app/admin/games/new/useGameFormState.ts) — valgfri «Hvem er dette for?»-velger (steg 2): «Ingen klubb» eller en av brukerens klubber. Speiler `registration_mode`-plumbingen; sender `group_id` som skjult felt. `?klubb=<id>` forhåndsvelger.
- [`lib/games/newGameFormData.ts`](lib/games/newGameFormData.ts) — returnerer nå `clubs` (brukerens klubb-medlemskap) + [`newGameFormData.test.ts`](lib/games/newGameFormData.test.ts) dekker FK-normalisering/sortering.
- [`app/klubber/[id]/page.tsx`](app/klubber/[id]/page.tsx) — «Sett opp en runde for klubben»-knapp (dyplenker til veiviseren med klubben forhåndsvalgt).

#### Changed
- [`app/admin/games/new/actions.ts`](app/admin/games/new/actions.ts) — `createGameInternal` setter `games.group_id` ved insert. Authz: spillet kan kun scopes til en klubb brukeren selv er medlem av (manipulert verdi droppes til null).
- [`app/opprett-spill/page.tsx`](app/opprett-spill/page.tsx) + [`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx) — tråder `clubs` + `?klubb=`-forhåndsvalg inn i veiviseren.

</details>

### [1.79.2] - 2026-06-05 · #442

> Du kan dele en lenke så folk kan be om å bli med i klubben din. Du får et varsel i innboksen, og godkjenner eller avslår med ett trykk. Den som ber om å bli med, ser at forespørselen er sendt.

<details>
<summary>Teknisk</summary>

Issue [#442](https://github.com/jdlarssen/golf-app/issues/442) (milepæl Klubb-skala). «Bli med via lenke»-flyten + eier-godkjenning.

#### Added
- [`app/klubber/bli-med/[shortId]/page.tsx`](app/klubber/bli-med/[shortId]/page.tsx) + [`actions.ts`](app/klubber/bli-med/[shortId]/actions.ts) — del-lenkens landingsside; `requestToJoin` slår opp klubben på `short_id` (admin-client), oppretter en pending `group_join_requests`-rad (RLS self-insert), og varsler klubbens eier/admin best-effort. Allerede-medlem og duplikat-forespørsel håndteres med vennlige tilstander.
- `club_join_request`-varsel: ny notification-kind ([`lib/notifications/types.ts`](lib/notifications/types.ts) + zod-skjema, [`NotificationCard`](components/notifications/NotificationCard.tsx) emoji/tittel, [`InboxClient`](app/innboks/InboxClient.tsx) deeplink → `/klubber/[group_id]`).

#### Changed
- [`lib/clubs/getClubDetail.ts`](lib/clubs/getClubDetail.ts) — returnerer nå også klubbens ventende forespørsler (kun for eier/admin; lest via admin-client).
- [`app/klubber/[id]/page.tsx`](app/klubber/[id]/page.tsx) + [`actions.ts`](app/klubber/[id]/actions.ts) — «Forespørsler»-seksjon for eier/admin med Godkjenn/Avslå; `decideRequest` kaller `decide_join_request`-RPC (lager medlemskap ved godkjenning).

</details>

### [1.79.1] - 2026-06-05 · #442

> Inne på en klubb ser du nå medlemmene. Er du eier eller admin, kan du legge til folk på e-post, fjerne medlemmer, og dele en lenke andre kan be om å bli med via. Alle kan forlate en klubb de er med i.

<details>
<summary>Teknisk</summary>

Issue [#442](https://github.com/jdlarssen/golf-app/issues/442) (milepæl Klubb-skala). Klubb-side + medlemsstyring.

#### Added
- [`app/klubber/[id]/page.tsx`](app/klubber/[id]/page.tsx) — klubb-side: medlemsliste med rolle-merke; for eier/admin også legg-til-på-e-post, del-lenke og fjern-medlem.
- [`lib/clubs/getClubDetail.ts`](lib/clubs/getClubDetail.ts) — henter klubb + medlemmer; gater på medlemskap via request-scoped client, leser deretter medlemsnavn via admin-client (users-RLS lar deg ikke lese medspilleres navn ellers).
- [`app/klubber/[id]/actions.ts`](app/klubber/[id]/actions.ts) — `addMember` kaller `add_club_member_by_email`-RPC; mapper `not_found` / `already_member` til vennlige meldinger.
- [`app/klubber/[id]/forlat/page.tsx`](app/klubber/[id]/forlat/page.tsx) + [`fjern/[userId]/page.tsx`](app/klubber/[id]/fjern/[userId]/page.tsx) — dedikerte konfirmasjons-ruter for forlat-klubb / fjern-medlem (destruktivt → egen side, per repo-regel). Begge blokkerer å fjerne siste eier.
- [`app/klubber/[id]/CopyJoinLinkButton.tsx`](app/klubber/[id]/CopyJoinLinkButton.tsx) — klient-knapp som kopierer bli-med-lenken.

</details>

### [1.79.0] - 2026-06-05 · #442

> Du kan nå lage en egen klubb i Tørny. Du blir eier med en gang, og klubben dukker opp under Klubbhuset. (Du kan lage inntil to klubber for nå.)

<details>
<summary>Teknisk</summary>

Issue [#442](https://github.com/jdlarssen/golf-app/issues/442) (milepæl Klubb-skala). Første bruker-synlige bit av klubb-epicen: opprett-klubb-flyten + eierskap. Bygger på #49-fundamentet (groups/group_members).

#### Added
- Migrasjon [`0075_clubs_create_and_scope`](supabase/migrations/0075_clubs_create_and_scope.sql) — datafundamentet for hele klubb-serien: `games.group_id`, `groups.short_id`, `group_join_requests`-tabell, og SECURITY DEFINER-RPCene `create_club` / `add_club_member_by_email` / `decide_join_request`. `create_club` løser owner-bootstrap (oppretteren blir `owner` atomisk under RLS) og håndhever klubb-taket (2 opprettede per bruker).
- [`app/klubber/page.tsx`](app/klubber/page.tsx) — «Klubbene dine»-liste med rolle-merke og en cap-gated «Opprett klubb»-dør.
- [`app/klubber/ny/page.tsx`](app/klubber/ny/page.tsx) + [`actions.ts`](app/klubber/ny/actions.ts) — dedikert opprett-klubb-side; `createClub` kaller `create_club`-RPC og mapper RPC-feil (`club_cap_reached` / `name_too_long`) til vennlige norske meldinger.
- [`lib/clubs/getMyClubs.ts`](lib/clubs/getMyClubs.ts) — henter brukerens klubb-medlemskap + antall opprettede klubber (cap-gating).
- [`app/admin/page.tsx`](app/admin/page.tsx) — «Klubber»-tile i Klubbhuset, i både admin- og spiller-grenen.

</details>

</details>

</details>

</details>

<details>
<summary><strong>Klubb-skala: Klubbhuset & klubber (#392, #442) — 1 serie</strong></summary>

<details>
<summary><strong>1.78.y — Klubbhuset, ett rom for alle (3 oppføringer)</strong></summary>

### [1.78.2] - 2026-06-05 · #387

> Har du trukket deg fra en runde, sender appen deg tilbake til spill-hjem hvis du prøver å levere eller åpne scorekortet. Slagene dine kan ikke endres så lenge du står som trukket.

<details>
<summary>Teknisk</summary>

Issue [#387](https://github.com/jdlarssen/golf-app/issues/387) (milepæl Tier 4 — End-game robusthet). Oppfølging fra #386 (WD/trekk spiller): #386 låste scorekort-tasting klient-side, men submit/scorekort-rutene og selve score-skrivingen var ikke gated på `withdrawn_at`. En trukket spiller kunne i prinsippet levere scorekort via en direkte URL eller en direkte POST til server-action-en. Ingen rangerings-effekt (trukne ekskluderes fra leaderboarden uansett), men en løs ende. Denne lukker den med defense-in-depth på både app- og databaselaget.

#### Security
- [`app/games/[id]/submit/page.tsx`](app/games/[id]/submit/page.tsx) + [`app/games/[id]/scorecard/page.tsx`](app/games/[id]/scorecard/page.tsx) — redirecter en trukket spiller til game-home (som viser «Du har trukket deg»-banneret + Angre), speiler den eksisterende `submitted_at`-redirecten.
- [`app/games/[id]/submit/actions.ts`](app/games/[id]/submit/actions.ts) — `submitScorecard` re-henter innlogget spillers `withdrawn_at` og avviser en direkte POST før UPDATE/notify. Eksplisitt sjekk (ikke `.is()` i UPDATE-kjeden, som ville gitt falsk «levert»-melding).
- [`supabase/migrations/0073_block_withdrawn_score_writes.sql`](supabase/migrations/0073_block_withdrawn_score_writes.sql) — to lag mot score-skriving: (1) `upsert_score_if_newer`-guard returnerer en graceful no-op (`was_applied = false`) for et trukket mål, så offline-sync-køen drenerer i stedet for å loope på RLS-rejecten under; (2) RLS `WITH CHECK` på `scores` INSERT/UPDATE blokkerer direkte skriving, utvider den eksisterende `submitted_at`-frosne guarden til `(submitted_at is not null or withdrawn_at is not null)`. Eksisterende scorer bevares; angre (`withdrawn_at = null`) gjenåpner skriving.

#### Changed
- [`app/games/[id]/submit/actions.test.ts`](app/games/[id]/submit/actions.test.ts) — ny test for WD-gaten (trukket → game-home, ingen submit/notify); de fire eksisterende testene fikk en `withdrawn_at: null`-rad injisert i FIFO-mocken etter den nye spørringen.

</details>

### [1.78.1] - 2026-06-05 · #435

> Når du setter opp eller redigerer en runde, sender ikke appen lenger med e-postadressene til de andre spillerne. Den trenger bare navn og handicap så du kan plukke medspillere. Har du invitert noen som ikke har fullført profilen sin ennå, står de nå som «Invitert spiller» i stedet for e-posten sin.

<details>
<summary>Teknisk</summary>

Issue [#435](https://github.com/jdlarssen/golf-app/issues/435) (milepæl Backlog — scale-triggered). `getNewGameFormData()` selecter ikke lenger `email` for ikke-admin-flatene, så spiller-rosteren slipper å bære medspilleres e-postadresser inn i side-payloaden. RLS på `users` begrenset allerede rosteren til seg selv + delte-spill-medspillere (ikke hele medlemslista, som issuet antok), men e-post-kolonnen var fortsatt med. Nå droppes den på data-laget.

#### Changed
- [`lib/games/newGameFormData.ts`](lib/games/newGameFormData.ts) — `getNewGameFormData(includeEmail = true)`; primitiv boolean-arg så React `cache` deduper på verdi. `includeEmail=false` utelater `email`-kolonnen fra users-`.select()` og `email`-nøkkelen fra `PlayerOption`-output.
- [`app/opprett-spill/page.tsx`](app/opprett-spill/page.tsx) + [`app/games/[id]/rediger/page.tsx`](app/games/[id]/rediger/page.tsx) — de to ikke-admin-create/edit-flatene kaller nå `getNewGameFormData(false)`. `/admin/games/new` beholder default (full roster, allerede admin-gated).
- [`app/admin/games/new/GameForm.tsx`](app/admin/games/new/GameForm.tsx) — `PlayerOption.email` er nå optional.
- Spiller-velger-helperne ([`PlayersSection`](app/admin/games/new/sections/PlayersSection.tsx), [`TeamsAssignmentSection`](app/admin/games/new/sections/TeamsAssignmentSection.tsx), [`WolfSetup`](app/admin/games/new/sections/WolfSetup.tsx), [`RoundRobinSetup`](app/admin/games/new/sections/RoundRobinSetup.tsx), [`useGameFormState`](app/admin/games/new/useGameFormState.ts)) faller tilbake på delt `PENDING_PLAYER_LABEL` («Invitert spiller») når `email` mangler, i stedet for å vise en e-postadresse.

#### Added
- [`app/admin/games/new/playerDisplay.ts`](app/admin/games/new/playerDisplay.ts) — delt `PENDING_PLAYER_LABEL`-konstant.
- [`lib/games/newGameFormData.test.ts`](lib/games/newGameFormData.test.ts) — co-lokert loader-test: `includeEmail=false` utelater `email` fra select + output; default beholder den.

</details>

### [1.78.0] - 2026-06-05 · #392

> Klubbhuset er nå en fast fane nederst på skjermen, ved siden av Hjem, Innboks og Profil. Trykk den for å sette opp en runde eller legge til en bane. Er du administrator, ligger alle administrator-verktøyene der inne. Opprett-knappene er flyttet fra forsiden inn i Klubbhuset, så forsiden viser spillene dine og åpne turneringer du kan bli med i.

<details>
<summary>Teknisk</summary>

Issue [#392](https://github.com/jdlarssen/golf-app/issues/392) — universell «Klubbhuset»-bunn-nav-fane (4. fane → `/admin`), bygd på #355 (bunn-nav) og #429 (`/klubbhuset`-frøet). Fanen gates ikke på rolle; flatene inne gates.

#### Added
- [`components/icons/Icons.tsx`](components/icons/Icons.tsx) — `KlubbhusIcon` (bygg + vimpel, bevisst distinkt fra `HjemIcon`).
- [`lib/admin/auth.ts`](lib/admin/auth.ts) — `getRoleContext`: ikke-redirigerende rolle-lesning så `/admin` kan rendre en rolle-tilpasset delmengde i stedet for å bounce ikke-admins.
- [`app/admin/page.tsx`](app/admin/page.tsx) — `PlayerKlubbhus`: minimal Klubbhus-visning for vanlige spillere (Spill + Baner-tiles, ingen admin-tellinger/ledger), delt `TileGridView`.

#### Changed
- [`components/ui/BottomNav.tsx`](components/ui/BottomNav.tsx) — 4. fane «Klubbhuset» → `/admin`, synlig for alle innloggede; `/admin`-eksklusjonen fjernet; aktiv på `/admin`, `/klubbhuset`, `/opprett-spill`, `/opprett-bane`.
- [`app/admin/layout.tsx`](app/admin/layout.tsx) — layout-gaten er nå auth-only; per-seksjon-gating ligger i sidene + sub-rutenes egne `requireAdmin*`.
- [`app/admin/page.tsx`](app/admin/page.tsx) — rolle-delt dashboard; «Sekretariatet»-kicker → «Klubbhuset»; redundant bjelle fjernet.
- [`components/ui/AdminShell.tsx`](components/ui/AdminShell.tsx) — reserverer bunn-padding for den nå-synlige bunn-nav-en.
- [`app/page.tsx`](app/page.tsx) — fjernet alle create-/Sekretariat-/Klubbhus-dører fra forsiden; tom-tilstand peker til Klubbhuset; «Finn turneringer» synlig igjen for alle.
- [`app/klubbhuset/page.tsx`](app/klubbhuset/page.tsx) — re-merket som «Spill»-seksjonen («Spillene dine») så rommet og seksjonen ikke kolliderer i navn.
- 24 admin-flater — `NotificationBell` fjernet fra admin-TopBar-ene (Innboks-fanen dekker det); navigasjons-«Sekretariatet» → «Klubbhuset».

#### Security
- [`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx) — self-gater nå med en rolle-sjekk (bouncer ikke-admin til `/opprett-spill`) siden layout-gaten er løftet; lukker en roster/e-post-eksponering. Audit bekreftet at action-laget allerede var self-gatet.

#### Removed
- [`app/profile/page.tsx`](app/profile/page.tsx) — «Klubbhuset»-raden (bunn-nav-fanen dekker den).

</details>

</details>

</details>

<details>
<summary><strong>Opprettelse & påmelding (#22, #366, #365) — 5 serier</strong></summary>

<details>
<summary><strong>1.77.y — Styr ditt eget spill (2 oppføringer)</strong></summary>

### [1.77.1] - 2026-06-05 · #429

> Klubbhuset er på plass: en samlet oversikt over spillene du arrangerer. Du finner den fra forsiden og under Profil, og kan trykke deg rett inn på et spill for å styre det.

<details>
<summary>Teknisk</summary>

Issue [#429](https://github.com/jdlarssen/golf-app/issues/429) — #22 Fase 3 («Mine spill»-hub). Frøet til Klubbhuset (#392); selve bunn-nav-fanen er fortsatt #392 sin jobb.

#### Added
- [`app/klubbhuset/page.tsx`](app/klubbhuset/page.tsx) — lister spill der `created_by` er innlogget bruker (request-scoped, RLS 0071 «games select own created»), formet som Sekretariat-lista men filtrert til egne spill. Hver rad lenker til spillets game-home der arrangør-kontrollene bor. Tom-tilstand peker til `/opprett-spill`.
- [`app/page.tsx`](app/page.tsx) — «Klubbhuset»-inngang for ikke-admins som arrangerer minst ett spill (billig head-count i parallell-fetchen).
- [`app/profile/page.tsx`](app/profile/page.tsx) — «Klubbhuset»-rad i konto-lista.

</details>

### [1.77.0] - 2026-06-05 · #429

> Lagde du spillet, bestemmer du nå hvem som er med. Legg til spillere du kjenner eller inviter nye på e-post, og fjern folk før runden starter. Er runden i gang, kan du trekke en spiller eller godkjenne et scorekort på vegne av flighten om en medspiller ikke får gjort det selv.

<details>
<summary>Teknisk</summary>

Issue [#429](https://github.com/jdlarssen/golf-app/issues/429) — #22 Fase 3 (roster + godkjenning). Ny arrangør-flate `/games/[id]/spillere`, gated på `requireAdminOrCreator`, som leser rosteren via `getGameWithPlayers` (admin-client-cache, så den virker selv for en ikke-spillende oppretter) og skriver via request-scoped server-actions dekket av creator-RLS.

#### Added
- [`supabase/migrations/0072_invitations_creator_game_invite.sql`](supabase/migrations/0072_invitations_creator_game_invite.sql) — tre permissive RLS-policyer så en oppretter kan inserte/lese/slette game-scopede invitasjoner for eget spill. Game-invitasjoner var admin-only (0008 begrenset ikke-admin til `game_id IS NULL`). RLS-verifisert mot ekte `auth.uid()` i rollback-transaksjon.
- [`app/games/[id]/spillere/page.tsx`](app/games/[id]/spillere/page.tsx) + [`CreatorRosterClient.tsx`](app/games/[id]/spillere/CreatorRosterClient.tsx) + [`actions.ts`](app/games/[id]/spillere/actions.ts) — arrangør-cockpit: legg til fra eget medspiller-nettverk (`getTeamCandidates`, #362), inviter ny på e-post (disposable-guard #422 for ikke-admin), fjern spiller (pre-start), trekk/angre (#386) og godkjenn scorekort på vegne av flighten (#360-paritet) under aktivt spill.
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — «Styr spillere»-inngang i `CreatorControls` ved påmelding og aktivt spill.

#### Changed
- [`app/admin/games/[id]/inviteToGameActions.ts`](app/admin/games/[id]/inviteToGameActions.ts) — `addExistingPlayerToGame` + `inviteEmailToGame` gater nå på `requireAdminOrCreator`, forgrener redirect på `isAdmin`, og legger disposable-guard på ikke-admin-invitasjoner. Admin-flyten byte-identisk.
- [`app/admin/games/[id]/actions.ts`](app/admin/games/[id]/actions.ts) — `adminWithdrawPlayer`/`adminUndoWithdraw`/`adminApproveScorecard` gater nå på `requireAdminOrCreator` via en ny `loadAdminOrCreatorContext`-helper med forgrenet `detailPath`. Admin-flyten byte-identisk.

</details>
</details>


<details>
<summary><strong>1.76.y — Rediger og slett ditt eget spill (3 oppføringer)</strong></summary>

Issue [#428](https://github.com/jdlarssen/golf-app/issues/428) (epic [#22](https://github.com/jdlarssen/golf-app/issues/22)), Fase 2. Du som lagde spillet kan nå styre det fullt ut selv: redigere det, og slette utkast eller planlagte runder du ikke trenger lenger.

### [1.76.2] - 2026-06-04 · #428

> Liten retting i den nye rediger-flyten: skulle lagringen feile, havner du nå tilbake på rediger-siden i stedet for på forsiden.

<details>
<summary>Teknisk</summary>

Issue [#428](https://github.com/jdlarssen/golf-app/issues/428) — Fase 2-oppfølging (forge-evaluering). `updateGameInternal` sin `game_players.delete`-feil-redirect var fortsatt hardkodet til admin-stien; nå forgrenet på `isAdmin` via `editBase` som resten av redirectene, så en oppretter holder seg i `/games/[id]/rediger`. Admin-flyten er uendret.

</details>

### [1.76.1] - 2026-06-04 · #428

> Lagde du et spill du ikke trenger likevel? Nå kan du slette dine egne utkast og planlagte runder selv, med en bekreftelse først så ingenting forsvinner ved et uhell.

<details>
<summary>Teknisk</summary>

Issue [#428](https://github.com/jdlarssen/golf-app/issues/428) — #22 Fase 2 (slett + inngang). Avslutter Fase 2.

#### Added
- [`app/games/[id]/slett/page.tsx`](app/games/[id]/slett/page.tsx) — ny slett-bekreftelse i `AppShell` for oppretter (dedikert rute per destruktiv-handling-disiplin). Kun draft/scheduled; active/finished sendes tilbake til game-home (der er sletting admin-only). Submitter den samme `deleteGame`-actionen som admin.
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — «Slett spill»-inngang i arrangør-kontrollen (ved siden av «Rediger spill»), kun draft/scheduled.

#### Changed
- [`app/admin/games/[id]/slett/actions.ts`](app/admin/games/[id]/slett/actions.ts) — `deleteGame` gater nå på `requireAdminOrCreator`; oppretter kan kun slette draft/scheduled (eier-beslutning), og redirect forgrenes på `isAdmin` (admin → Sekretariatet, oppretter → forsiden med bekreftelse). Admin-flyten er byte-identisk.
- [`app/page.tsx`](app/page.tsx) — viser «{spillnavn} er slettet»-bekreftelse når oppretter lander her etter sletting (`?deleted=`).

</details>

### [1.76.0] - 2026-06-04 · #428

> Du som lagde spillet kan nå redigere det selv. Bytt bane, tee-off, spillere eller innstillinger så lenge runden ikke har startet. Rediger-knappen ligger på spill-siden.

<details>
<summary>Teknisk</summary>

Issue [#428](https://github.com/jdlarssen/golf-app/issues/428) — #22 Fase 2 (rediger). Ingen ny migrasjon: creator-RLS fra 0071 (Fase 1) dekker allerede UPDATE-own på `games` + writes på `game_players`.

#### Added
- [`app/games/[id]/rediger/page.tsx`](app/games/[id]/rediger/page.tsx) — ny rediger-flate i `AppShell` for oppretter. Gjenbruker `GameForm` (edit-draft/edit-scheduled) og de samme save/publish/update-actionene som admin; options lastes via `getNewGameFormData` (RLS-trygg for ikke-admins).
- [`lib/games/editGameInitialValues.ts`](lib/games/editGameInitialValues.ts) — delt `buildEditInitialValues` + typer, brukt av både admin-edit og creator-rediger så pre-fyll-logikken (mode-lock, mode_config, sideturnering) ikke divergerer.
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — «Rediger spill»-inngang for oppretter ved draft/scheduled, i både venterom og hovedvisning.

#### Changed
- [`app/admin/games/[id]/edit/actions.ts`](app/admin/games/[id]/edit/actions.ts) — `saveDraftAction`/`publishFromDraftAction`/`updateScheduledAction` gater nå på `requireAdminOrCreator` og forgrener redirect på `isAdmin` (admin → Sekretariatet, oppretter → `/games/[id]`). Pending-gaten går via `incomplete_profiles_for_ids`-RPC-en (ikke direkte users-read) så den biter under request-scoped RLS. Admin-flyten er byte-identisk.
- [`app/admin/games/[id]/edit/page.tsx`](app/admin/games/[id]/edit/page.tsx) — bruker den delte `buildEditInitialValues`-helperen.

</details>
</details>


<details>
<summary><strong>1.75.y — Lag og styr ditt eget spill (1 oppføring)</strong></summary>

Issue [#427](https://github.com/jdlarssen/golf-app/issues/427) (epic [#22](https://github.com/jdlarssen/golf-app/issues/22)). Til nå måtte en administrator opprette spill. Nå kan hvem som helst som er innlogget sette opp en runde, la den starte og avslutte den selv.

### [1.75.0] - 2026-06-04 · #427

> Nå kan du lage ditt eget spill rett fra forsiden, ikke bare administrator. Du setter opp runden. Den starter automatisk når tee-off er passert, uansett hvem av dere som åpner appen først. Og du avslutter den selv når alle har levert.

<details>
<summary>Teknisk</summary>

Issue [#427](https://github.com/jdlarssen/golf-app/issues/427) — #22 Fase 1 (RLS-fundament). Speiler #366-mønsteret: ekte eier-RLS (`created_by = auth.uid()`) i stedet for service-role-bypass, verifisert mot ekte `auth.uid()` i rollback-transaksjon.

#### Added
- [`supabase/migrations/0071_games_creator_rls.sql`](supabase/migrations/0071_games_creator_rls.sql) — permissive creator-policyer på `games` (INSERT/UPDATE/DELETE + egen-SELECT), `game_players` og `game_side_winners`, OR-et med eksisterende admin/self/is_in_game-policyer. Pluss `incomplete_profiles_for_ids(uuid[])` (SECURITY DEFINER, kun `authenticated`) som publish-gaten bruker for å se ufullstendige profiler under RLS.
- [`app/games/[id]/avslutt/page.tsx`](app/games/[id]/avslutt/page.tsx) — ny avslutt-flate i `AppShell` for oppretter. Én side som dekker LD/CTP-sideturnering, «avslutt likevel» ved manglende levering, venter-på-godkjenning, og enkel bekreftelse — gjenbruker `SideWinnersForm` og de samme avslutt-actionene som admin.
- [`lib/admin/auth.ts`](lib/admin/auth.ts) — `requireAdminOrCreator(supabase, gameId)`: slipper gjennom admin ELLER spillets oppretter.

#### Changed
- [`app/opprett-spill/page.tsx`](app/opprett-spill/page.tsx) + [`app/admin/games/new/actions.ts`](app/admin/games/new/actions.ts) — opprett+publiser åpnet fra admin/trusted til alle innloggede. Writes går på request-scoped klient (eier-RLS dekker), ikke `getAdminClient`. Validerings-/publiseringsfeil bouncer tilbake til `/opprett-spill` for ikke-admins.
- [`app/page.tsx`](app/page.tsx) — «Opprett spill»-inngangen vises for alle innloggede (var admin + trusted-allowlist).
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — auto-start kjører nå på service-role-klienten, så runden starter uansett hvem som åpner siden etter tee-off (fikser også en stille svikt for admin-spill der bare admin sitt besøk flippet status). Ny «Avslutt spillet»-knapp synlig for oppretter ved aktivt spill.
- [`app/admin/games/[id]/actions.ts`](app/admin/games/[id]/actions.ts) + [`avslutt/actions.ts`](app/admin/games/[id]/avslutt/actions.ts) + [`avslutt-likevel/actions.ts`](app/admin/games/[id]/avslutt-likevel/actions.ts) — `endGame`/`endGameWithSideWinners`/`endGameMarkingWithdrawals` gater nå på `requireAdminOrCreator` og forgrener redirect på `isAdmin` (admin → Sekretariatet, oppretter → game-home). Admin-flyten er byte-identisk.

#### Decided
- **Ekte eier-RLS, ikke service-role-bypass** — når create/finish åpnes for alle er en eier-policy riktigere enn å rute writes gjennom service-role (#230-lærdom).
- **Auto-start som system-skriv** (eier-beslutning) — robust uansett hvem som åpner først; samme fix gjør admin-spill mer pålitelige.
- **Full paritet i avslutt** (eier-beslutning) — oppretter får sideturnering + LD/CTP-vinnervalg + «avslutt likevel», samlet på én side.
- **Ute av scope (senere faser):** rediger/slett eget spill, roster-styring, «Mine spill»-hub, cup-opprettelse (forblir admin).

</details>
</details>


<details>
<summary><strong>1.74.y — Baner alle kan legge til (1 oppføring)</strong></summary>

Issue [#366](https://github.com/jdlarssen/golf-app/issues/366). Til nå har bare administrator kunnet legge inn baner. Nå kan hvem som helst som er innlogget legge til en bane som mangler, så den er klar til neste runde.

### [1.74.0] - 2026-06-04 · #366

> Mangler hjemmebanen din i Tørny? Nå kan du legge den til selv. Fyll inn hull, par og tee-er, så havner banen i biblioteket og kan velges når noen setter opp en runde.

<details>
<summary>Teknisk</summary>

Issue [#366](https://github.com/jdlarssen/golf-app/issues/366) — UX-flyt-audit-funn («Opprett spill»-flyten). Gjenbruker `CourseForm` + `createCourse` (ingen ny skjema-mekanikk), men åpner tilgangen fra admin/trusted til alle innloggede.

#### Added
- [`app/opprett-bane/page.tsx`](app/opprett-bane/page.tsx) — ny rute i `AppShell` (ikke Sekretariatet), gated kun på innlogget bruker. Speiler `/opprett-spill`-mønsteret (#198). Håndterer feil- og suksess-bannere og bevarer `?next=` så «Finner du ikke banen?»-lenken i spill-velgeren tar deg tilbake.
- [`supabase/migrations/0070_courses_user_create_rls.sql`](supabase/migrations/0070_courses_user_create_rls.sql) — ekte RLS insert-own-policy (`created_by = auth.uid()`) på `courses`/`course_holes`/`tee_boxes`, OR-et med de eksisterende admin-write-policyene. `created_by`/`updated_by` flippet til `ON DELETE SET NULL` så bruker-opprettede baner overlever konto-sletting.

#### Changed
- [`app/admin/courses/new/actions.ts`](app/admin/courses/new/actions.ts) — `createCourse` gates nå på `getUser()` (ikke admin/trusted), skriver via request-scoped klient (RLS i stedet for `getAdminClient`-bypass), og tar saniterte `redirect_base`/`success_redirect` så ikke-admin-ruten holder brukere utenfor `/admin/courses`.
- [`app/admin/courses/CourseForm.tsx`](app/admin/courses/CourseForm.tsx) — valgfrie `redirectBase`/`successRedirect`-props (skjulte inputs). Admin-flyten er uendret.
- [`app/page.tsx`](app/page.tsx) — lavmælt «Mangler en bane? Legg den til»-inngang for alle innloggede (midlertidig; permanent hjem blir Klubbhuset, #392).
- [`app/admin/games/new/sections/BasicsSection.tsx`](app/admin/games/new/sections/BasicsSection.tsx) — «Finner du ikke banen? Opprett ny bane»-lenke under bane-velgeren.

#### Decided
- **Delt synlighet** — en bruker-opprettet bane havner i det felles biblioteket alle plukker fra (`SELECT` forblir `using(true)`, kritisk for at medspillere kan lese banen for å score).
- **Create-only** — vanlige brukere får ikke redigere/slette baner i denne omgangen; admin rydder. Ingen UPDATE/DELETE-RLS lagt til.
- **Ekte RLS, ikke service-role-bypass** — når create åpnes for alle er en insert-own-policy riktigere enn å rute alle writes gjennom service-role. Selvstendig skive av RLS-jobben i #22.
- **Frittstående dør → #392** — den permanente inngangen hører hjemme i Klubbhuset; hjem-inngangen her er midlertidig (notert på #392).

</details>
</details>


<details>
<summary><strong>1.73.y — Usynlig misbruks-vern før åpen påmelding (2 oppføringer)</strong></summary>

Issue [#365](https://github.com/jdlarssen/golf-app/issues/365) + [#422](https://github.com/jdlarssen/golf-app/issues/422). Før vi åpner for at hvem som helst kan lage konto, har vi lagt inn et usynlig vern: engangs-e-post (bruk-og-kast-adresser som mailinator og co.) avvises både på innlogging og når en bruker prøver å invitere noen. Vanlige e-postadresser merker ingenting.

### [1.73.1] - 2026-06-04 · #422

> Prøver du å invitere en venn eller medspiller med en engangs-e-post, får du nå beskjed om å bruke en vanlig adresse i stedet. Vanlige adresser fungerer som før.

<details>
<summary>Teknisk</summary>

Issue [#422](https://github.com/jdlarssen/golf-app/issues/422) — code-review-funn fra #365. Disposable-blokken utvidet til de **bruker-drevne** invite-flatene, så en engangs-invitasjon ikke lager en død `invitations`-rad + bortkastet mail (self-reg på) eller en reell throwaway-konto via invitasjon (self-reg av). Gjenbruker `isDisposableEmailDomain` fra #365.

#### Changed
- [`app/invite/actions.ts`](app/invite/actions.ts) — `sendFriendInvite` avviser disposable-domener (ny `disposable_email`-feilkode) etter format-sjekk, før DB-arbeid.
- [`app/signup/[shortId]/teamActions.ts`](app/signup/[shortId]/teamActions.ts) — `submitTeamRegistration` avviser disposable medspiller-e-post i pre-valideringen (ny `disposable_email`-variant i `TeamRegistrationError`).
- [`app/profile/page.tsx`](app/profile/page.tsx) + [`app/signup/[shortId]/TeamRegistrationForm.tsx`](app/signup/[shortId]/TeamRegistrationForm.tsx) — nye norske feilmeldinger.

#### Decided
- **Alltid på** (ikke gated på self-reg-flagget, ulikt `/login`-blokken) — en engangs-invitasjon gir aldri verdi. **Admin/trusted-creator-flatene er bevisst ikke guardet** (eier-beslutning: admin er betrodd, «arrangør»-rollen fases ut).

</details>

### [1.73.0] - 2026-06-04 · #365

> Et usynlig vern før vi åpner påmelding for alle: engangs-e-post blir avvist på innlogging, så ingen kan masseopprette kontoer med bruk-og-kast-adresser. Bruker du en vanlig e-post, merker du ingenting.

<details>
<summary>Teknisk</summary>

Issue [#365](https://github.com/jdlarssen/golf-app/issues/365) — usynlig misbruks-vern foran åpen selvregistrering ([#364](https://github.com/jdlarssen/golf-app/issues/364)). UX-flyt-audit-funn («Bli bruker»). Dormant til `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` skrus på i prod.

#### Added
- [`lib/auth/disposableDomains.ts`](lib/auth/disposableDomains.ts) — kuratert `Set` av kjente engangs-/disposable-e-postdomener (mailinator, guerrillamail, 10minutemail, yopmail m.fl.). Vendret liste, ingen npm-dep.
- [`lib/auth/disposableEmail.ts`](lib/auth/disposableEmail.ts) — `isDisposableEmailDomain(email)`: eksakt domene-match, total funksjon (kaster aldri).

#### Changed
- [`app/(auth)/login/actions.ts`](app/(auth)/login/actions.ts) — `sendCode` avviser disposable-domener (ny `disposable_email`-feilkode) når self-reg er på, uavhengig av invitasjons-status. Lukker spray-invite-bypass (venne-invite-kvoten er 10/døgn). Plassert etter rate-limit, før `email_is_invited`-RPC.
- [`app/(auth)/login/page.tsx`](app/(auth)/login/page.tsx) — ny norsk banner-tekst for `disposable_email`.

#### Decided
- IP-rate-limit beholdt på 10/IP/15 min (ikke strammet til 6): disposable-blokken dekker masse-opprettings-vektoren, og 6 ville gitt klubb-WiFi-friksjon uten reell spray-gevinst mot en IP-roterende angriper. Captcha fortsatt utsatt til faktisk misbruk.

</details>
</details>
</details>



<details>
<summary><strong>Flyt-opprydding, varsler & avslutning (#354–377) — 13 serier</strong></summary>

<details>
<summary><strong>1.72.y — Avslutnings-varsel for cup (1 oppføring)</strong></summary>

Issue [#377](https://github.com/jdlarssen/golf-app/issues/377). Når en cup spilles ferdig, varsles deltakerne nå på samme måte som ellers i appen: in-app-varsel først, og e-post bare til dem som ikke er i appen. Før gikk det ut e-post til alle uansett.

### [1.72.0] - 2026-06-03 · #377

> Når en cup er ferdigspilt, dukker resultatet opp som varsel i appen. Er du borte fra appen, får du det på e-post i stedet.

<details>
<summary>Teknisk</summary>

Issue [#377](https://github.com/jdlarssen/golf-app/issues/377) — avslutnings-varsel via samme in-app-først-logikk. UX-flyt-audit-funn («Kjør og avslutt spill»). Enkeltspill-avslutningen fulgte allerede prinsippet; dette retter cup-avslutningen, som tidligere sendte e-post til alle uten in-app-varsel.

#### Added
- Ny `cup_finished` notification-kind (migrasjon `0069`) — wiret gjennom [`lib/notifications/types.ts`](lib/notifications/types.ts), [`components/notifications/NotificationCard.tsx`](components/notifications/NotificationCard.tsx) og [`app/innboks/InboxClient.tsx`](app/innboks/InboxClient.tsx) (deeplink til `/cup/[id]`).
- [`notifyParticipantsCupFinished`](lib/notifications/events.ts) — cup-analog til `notifyPlayersGameFinished`: in-app til alle deltakere, returnerer per-deltaker mail-gating-flagg.

#### Changed
- [`lib/cup/actions.ts`](lib/cup/actions.ts) — `finishTournament` fyrer nå in-app `cup_finished` til alle deltakere først, og sender «cupen er ferdig»-mailen kun til off-app-deltakere. Ingen blanket-mail til alle.

</details>
</details>


<details>
<summary><strong>1.71.y — Leverings-påminnelse (2 oppføringer)</strong></summary>

Issue [#376](https://github.com/jdlarssen/golf-app/issues/376). Spillere som har gått ferdig runden, men ikke levert scorekortet, får nå en påminnelse om å levere. Den kommer automatisk in-app når de er ferdige, og som e-post hvis de har lagt fra seg mobilen. Arrangøren får i tillegg en spillerstatus-side for å se hvem som mangler og purre dem.

### [1.71.1] - 2026-06-03 · #376

> Som arrangør ser du nå en egen spillerstatus-side: hvor langt hver spiller har kommet, hvem som er ferdige uten å ha levert, og hvor lenge siden de sist tastet noe. Derfra purrer du de som mangler med ett trykk.

<details>
<summary>Teknisk</summary>

Issue [#376](https://github.com/jdlarssen/golf-app/issues/376), del 2 — admin-purring.

#### Added
- [`app/admin/games/[id]/status/page.tsx`](app/admin/games/[id]/status/page.tsx) — spillerstatus-side: per spiller fremdrift (`X/18`), status-badge via `classifyDeliveryStatus`, og «siste registrering» (relativ tid fra `scores.updated_at`). Ferdige-men-ikke-leverte flagges og sorteres øverst. Ingen scorer-verdier hentes (ingen spoiler).
- [`app/admin/games/[id]/status/actions.ts`](app/admin/games/[id]/status/actions.ts) — `remindUnsubmittedPlayers` sender påminnelse til alle ferdige-men-ikke-leverte (best-effort `Promise.allSettled`), og stamper `deliver_reminder_sent_at` så auto-nudgen ikke dobbel-fyrer.
- [`app/admin/games/[id]/status/RemindButton.tsx`](app/admin/games/[id]/status/RemindButton.tsx) — to-trinns confirm-knapp.
- [`lib/games/deliveryStatus.ts`](lib/games/deliveryStatus.ts) — ren `classifyDeliveryStatus`-klassifisering (Type A-testet).

#### Changed
- [`app/admin/games/[id]/page.tsx`](app/admin/games/[id]/page.tsx) — «Avslutt spillet»-kortet lenker nå til spillerstatus-sida (med «og send påminnelse» når noen mangler levering).

</details>

### [1.71.0] - 2026-06-03 · #376

> Har du tastet inn alle 18 hull, men glemt å levere scorekortet, minner appen deg på det. Er du borte fra appen, kommer påminnelsen på e-post i stedet.

<details>
<summary>Teknisk</summary>

Issue [#376](https://github.com/jdlarssen/golf-app/issues/376), del 1 — auto-nudge. UX-flyt-audit-funn («Kjør og avslutt spill»).

#### Added
- [`lib/notifications/deliveryReminder.ts`](lib/notifications/deliveryReminder.ts) — `sendDeliveryReminder` (delt in-app + betinget off-app-mail-primitiv) og `maybeSendDeliveryReminder` (auto-nudge med hull-telling + atomisk `deliver_reminder_sent_at`-idempotens-guard).
- [`lib/mail/deliverReminderNotification.ts`](lib/mail/deliverReminderNotification.ts) — spiller-rettet «Lever scorekortet»-mail (off-app-fallback), deeplinker til `/games/[id]/submit`.
- Ny `deliver_reminder` notification-kind (migrasjon `0068`) + `game_players.deliver_reminder_sent_at`-kolonne for én-gang-per-spiller-idempotens.

#### Changed
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — fyrer auto-nudgen via `after()` når spilleren er ferdig (18/18) men ikke har levert (og ikke er trukket).

</details>
</details>


<details>
<summary><strong>1.70.y — Smidigere lag-påmelding (2 oppføringer)</strong></summary>

Issue [#362](https://github.com/jdlarssen/golf-app/issues/362). Lag-påmeldings-skjemaet er ryddet opp: feltene sjekkes mens du fyller dem ut, du kan søke opp folk du har spilt med før i stedet for å taste e-post på nytt, og «bli med på lag» sier hva som skjer videre.

### [1.70.1] - 2026-06-03 · #362

> Blir du invitert til et lag, sier appen nå hva som skjer når du takker ja: om du er med i spillet med en gang, eller om arrangøren må godkjenne laget først.

<details>
<summary>Teknisk</summary>

Issue [#362](https://github.com/jdlarssen/golf-app/issues/362), «bli med»-tydelighet (UX-flyt-audit-funn #8).

#### Changed
- [`TeamDashboardClient`](app/signup/[shortId]/team/TeamDashboardClient.tsx) — «Bli med på lag» (ny invitert spiller) og «Aksepter» (invitert medspiller) viser nå mode-aware neste-steg: `open` → «med i spillet med en gang», `manual_approval` → «arrangøren må godkjenne laget». Suksess-banneret etter handling er tilsvarende presist.
- [`app/signup/[shortId]/team/page.tsx`](app/signup/[shortId]/team/page.tsx) — utleder `joinEffect` fra `registration_mode` og sender det til klienten; den statiske intro-teksten er erstattet av den mode-aware varianten.

</details>

### [1.70.0] - 2026-06-03 · #362

> Å melde på et lag er mindre styr nå. Feltene sier fra med en gang noe er feil, og når du skal legge til en medspiller du har spilt med før, søker du opp navnet i stedet for å taste e-posten på nytt.

<details>
<summary>Teknisk</summary>

Issue [#362](https://github.com/jdlarssen/golf-app/issues/362). UX-flyt-audit-funn #8 (`docs/user-flows.md`).

#### Added
- [`lib/users/getTeamCandidates.ts`](lib/users/getTeamCandidates.ts) — co-player-kilde for autocomplete (felles `game_players`). Personvern-trygg: bare kapteinens eget nettverk, aldri alle brukere. Utvidelsespunkt for et framtidig venner-system ([#408](https://github.com/jdlarssen/golf-app/issues/408)).
- [`lib/users/maskEmail.ts`](lib/users/maskEmail.ts) — maskerer e-post i forslagslista (`ol•••@gmail.com`).
- [`app/signup/[shortId]/teamFormValidation.ts`](app/signup/[shortId]/teamFormValidation.ts) — rene klientside-validatorer (lag-navn, e-post-form, duplikat/kaptein-egen-e-post) som speiler server-reglene.

#### Changed
- [`TeamRegistrationForm`](app/signup/[shortId]/TeamRegistrationForm.tsx) — felt valideres on-blur og ved submit-forsøk: inline-feil per felt, submit blokkeres ved ugyldig input (ingen misvisende `team_name_invalid` for en slot-feil), og fokus hopper til første ugyldige felt. «Eksisterende spiller»-modus har nå autocomplete på co-players (navn + «kallenavn» + maskert e-post); valg vises som chip. Fri-tekst e-post-modus beholdt for folk utenfor lista.
- [`app/signup/[shortId]/page.tsx`](app/signup/[shortId]/page.tsx) — preloader co-player-kandidater (kun når lag-formen faktisk rendres) og sender kaptein-e-post til inline egen-e-post-sjekk.

</details>
</details>


<details>
<summary><strong>1.69.y — Profilen din, ryddigere og smartere (4 oppføringer)</strong></summary>

Issue [#401](https://github.com/jdlarssen/golf-app/issues/401). Et større løft av profil-siden: profil-header øverst, kompakt handicap-felt med plusshandicap-støtte og ferskhets-dato, kjønn og spillerklasse som knapper, demotert e-post, og månedsbrev-valget flyttet til Innboks.

### [1.69.3] - 2026-06-02 · #401

> Av/på-bryteren for månedsbrev i Innboks ser ordentlig ut nå — knappen lå litt utenfor sporet før.

<details>
<summary>Teknisk</summary>

Issue [#401](https://github.com/jdlarssen/golf-app/issues/401)-oppfølging. [`MonthlyDigestToggle`](app/innboks/MonthlyDigestToggle.tsx)-switchen brukte en absolutt-plassert knapp med hardkodet `translate-x` som skjøt forbi sporet, og et nær-usynlig av-spor. Byttet til standard flex + `px-0.5` + `translate-x-5`-mønster (knappen sitter nå med jevn marg inni sporet) og et synlig av-spor (`bg-text/20`).

</details>

### [1.69.2] - 2026-06-02 · #401

> Vil du ha (eller slippe) månedsbrevet fra Tørny, styrer du det nå fra Innboks i stedet for inne på profilen.

<details>
<summary>Teknisk</summary>

Issue [#401](https://github.com/jdlarssen/golf-app/issues/401), del 3 (månedsbrev → Innboks).

#### Added
- [`app/innboks/MonthlyDigestToggle.tsx`](app/innboks/MonthlyDigestToggle.tsx) — kompakt switch-rad øverst i Innboks (optimistisk state + server-action).
- [`app/innboks/actions.ts`](app/innboks/actions.ts) — `toggleProductUpdates` skrur `product_updates_unsubscribed_at` på/av.

#### Changed
- [`app/innboks/page.tsx`](app/innboks/page.tsx) — henter opt-in-state og rendrer toggelen.
- Product-updates-opt-in eies nå av Innboks; `updateProfile` (profil-skjemaet) rører det ikke lenger (gjort i 1.69.0), så profil-lagring kan ikke utilsiktet melde deg av.

</details>

### [1.69.1] - 2026-06-02 · #401

> Når du fullfører profilen din for første gang, kan du nå markere plusshandicap der også — ikke bare på profil-siden.

<details>
<summary>Teknisk</summary>

Issue [#401](https://github.com/jdlarssen/golf-app/issues/401), del 2 (onboarding-paritet).

#### Added
- [`app/complete-profile/OnboardingHcpField.tsx`](app/complete-profile/OnboardingHcpField.tsx) — handicap-felt med «+»-chip for plusshandicap + live «Lagres som …»-bekreftelse (gjenbruker `lib/handicap/sign`).

#### Changed
- [`app/complete-profile/page.tsx`](app/complete-profile/page.tsx) — bruker det nye feltet i stedet for et rått tall-felt.
- [`app/complete-profile/actions.ts`](app/complete-profile/actions.ts) — regner signert hcp fra magnitude + plus-flagg (`toSignedHcp`).

#### Tests
- [`app/complete-profile/actions.test.ts`](app/complete-profile/actions.test.ts) — plusshandicap lagres negativt.

</details>

### [1.69.0] - 2026-06-02 · #401

> Profil-siden din ser ut som en profil nå, med navn og handicap øverst. Handicap-feltet er mindre og viser når du sist oppdaterte det. Har du plusshandicap, markerer du det med ett trykk i stedet for å taste fortegn, og kjønn og spillerklasse velger du med knapper.

<details>
<summary>Teknisk</summary>

Issue [#401](https://github.com/jdlarssen/golf-app/issues/401), del 1 (profil-siden). Bygger på #393/#399.

#### Added
- [`components/ui/SegmentedField.tsx`](components/ui/SegmentedField.tsx) — gjenbrukbar segmentert enten-eller-velger (wizard-stil); brukt for kjønn + spillerklasse.
- [`lib/handicap/sign.ts`](lib/handicap/sign.ts) — plusshandicap-fortegn: magnitude + plus-flagg ↔ signert lagret verdi (Golfbox «+1,5» = internt −1,5) + Golfbox-formattering for live-bekreftelsen.
- Profil-header (initial-sirkel + navn + hcp) øverst i skjema-kortet.

#### Changed
- [`app/profile/ProfileFormBody.tsx`](app/profile/ProfileFormBody.tsx) — kontrollert skjema; Kallenavn + Handicap på samme rad; smalt handicap-felt med «+»-chip for plusshandicap (slipper å taste fortegn på mobil) + live «Lagres som …»-bekreftelse + «Handicap oppdatert {dato}»/stale-varsel; «Flere innstillinger» → «Golfprofil» med segmenterte kjønn/klasse; e-post demotert til grå linje nederst.
- [`app/profile/page.tsx`](app/profile/page.tsx) — profil-header; «Logg ut» full bredde (outline); fjernet redundant personvern-prosa (footer-lenken dekker det).
- [`app/profile/actions.ts`](app/profile/actions.ts) — handicap regnes fra magnitude + plus-flagg (`toSignedHcp`); `updateProfile` rører ikke lenger `product_updates_unsubscribed_at` (eierskap flyttes til Innboks).

#### Tests
- [`components/ui/SegmentedField.test.tsx`](components/ui/SegmentedField.test.tsx), [`lib/handicap/sign.test.ts`](lib/handicap/sign.test.ts), og oppdatert [`app/profile/ProfileFormBody.test.tsx`](app/profile/ProfileFormBody.test.tsx) (Golfprofil-disclosure, segmenter, plusshandicap-chip).

</details>
</details>


<details>
<summary><strong>1.68.y — Be om plass til private spill (4 oppføringer)</strong></summary>

Issue [#368](https://github.com/jdlarssen/golf-app/issues/368). Lander du på et privat (invitasjonsbasert) spill du ikke er invitert til, var skjermen før en blindvei. Nå kan du be arrangøren om plass derfra, og arrangøren ser forespørselen og slipper deg inn eller avslår.

### [1.68.4] - 2026-06-02 · #393

> Profil-skjemaet er kortere nå. Det du endrer ofte (navn, kallenavn og handicap) ligger åpent, mens kjønn, spillerklasse og månedsbrev er flyttet under «Flere innstillinger». «Invitér en venn» har fått e-post-felt og Send-knapp på samme rad i stedet for en skjerm-vid knapp.

<details>
<summary>Teknisk</summary>

Oppfølging av [#393](https://github.com/jdlarssen/golf-app/issues/393) ([#399](https://github.com/jdlarssen/golf-app/issues/399)). `MER`-lista ble kompakt, men de to kortene over tok fortsatt mye plass.

#### Changed
- [`app/profile/ProfileFormBody.tsx`](app/profile/ProfileFormBody.tsx) — kjønn, spillerklasse og månedsbrev flyttet under en «Flere innstillinger»-disclosure (kollapset som standard, åpen når kjønn ennå ikke er satt så gender-soft-prompten + `#kjonn`-ankeret treffer et synlig felt). Innholdet skjules med `hidden` (ikke unmount) så verdiene fortsatt sendes med ved lagring — `required` på kjønn-radioene droppet til fordel for server-validering (`gender_required`), siden en skjult `required` blokkerer submit. Tettere `space-y` på de synlige feltene.
- [`app/profile/InviteFriendForm.tsx`](app/profile/InviteFriendForm.tsx) — e-post-felt og «Send»-knapp på én rad (flex) i stedet for full-bredde-knapp + stablet hjelpetekst.
- [`components/ui/Input.tsx`](components/ui/Input.tsx) — ny `labelHidden`-prop (label beholdes for skjermlesere, skjules visuelt) for inline-felt.
- [`app/profile/page.tsx`](app/profile/page.tsx) — fjernet den unødvendige «Mer»-overskriften over konto-lista; `SettingList` har fortsatt `aria-label` for skjermlesere.

#### Tests
- [`app/profile/ProfileFormBody.test.tsx`](app/profile/ProfileFormBody.test.tsx) — disclosure-kontrakt (aria-expanded, åpen-når-gender-null, felt beholdt i DOM når kollapset). Mail-toggle-testene folder nå ut seksjonen først.

</details>

### [1.68.2] - 2026-06-02 · #393

> Profil-siden er kortere å scrolle på telefon. Rediger profil og «Invitér en venn» ligger øverst. Historikk, statistikk, app-installering, eksport og sletting er samlet i én kort liste lenger ned. «Logg ut» er nå en synlig knapp i stedet for en blek lenke.

<details>
<summary>Teknisk</summary>

Løser [#393](https://github.com/jdlarssen/golf-app/issues/393) — etterslep fra [#355](https://github.com/jdlarssen/golf-app/issues/355) (bunn-nav gjorde Profil til fast destinasjon). Siden var en lang stabel av full-høyde-kort; «Logg ut» var en muted tekst-lenke, og «Avbryt» i profilskjemaet var overflødig nå som Profil er en fast nav-fane.

#### Added
- [`components/ui/SettingRow.tsx`](components/ui/SettingRow.tsx) — `SettingRow` + `SettingList`: kompakte, tappbare list-rader (SmartLink / download-anker / button, default- og danger-tone) for settings-stil-lister.

#### Changed
- [`app/profile/page.tsx`](app/profile/page.tsx) — historikk-, installer- og data-kortene (fem full-høyde-`Card`) erstattet av én `SettingList` med kompakte rader. «Invitér en venn» beholdt som åpent kort rett under profilskjemaet. «Logg ut» bruker nå `Button variant="secondary"` (outline) i stedet for en muted tekst-lenke.
- [`components/pwa/InstallButton.tsx`](components/pwa/InstallButton.tsx) — rendrer nå som en `SettingRow` i lista i stedet for eget kort, og beholder self-hide når appen alt er installert.
- [`app/profile/InviteFriendForm.tsx`](app/profile/InviteFriendForm.tsx) — tettere intern rytme i invitasjons-kortet.

#### Removed
- [`app/profile/ProfileFormBody.tsx`](app/profile/ProfileFormBody.tsx) — «Avbryt»-lenken (og den nå-ubrukte `SmartLink`-importen); «Lagre» står alene.

#### Tests
- [`components/ui/SettingRow.test.tsx`](components/ui/SettingRow.test.tsx) — link-, button- og danger-varianter.

</details>

### [1.68.1] - 2026-06-02 · #363

> Har du en runde på gang, ligger den nå øverst på Hjem som «Pågår nå». Og når du sletter en bane, får du en egen bekreftelses-side først, så ingenting forsvinner ved et uhell.

<details>
<summary>Teknisk</summary>

Tre konsistens-fikser fra flyt-auditen ([#363](https://github.com/jdlarssen/golf-app/issues/363), `docs/user-flows.md` #9).

#### Changed
- [`app/page.tsx`](app/page.tsx) — pågående spill (status=active) løftes til en egen «Pågår nå»-seksjon øverst med champagne-ramme; planlagte spill blir i «Mine spill». Felles `renderGameCard`-helper for begge seksjonene.
- [`app/admin/games/new/actions.ts`](app/admin/games/new/actions.ts) — trusted-non-admin creator lander nå på `/games/[id]` (game-home) etter opprett, i stedet for `/admin/games/[id]` som admin-layouten bouncet dem ut av til `/`. Admin-flyten uendret.

#### Added
- [`app/admin/courses/[id]/slett/page.tsx`](app/admin/courses/[id]/slett/page.tsx) — dedikert bekreftelses-side for bane-sletting (speiler spill/spiller-`/slett`), med barn-rad-tellere (hull + tee-bokser) og in-use-blokkering når banen brukes i et spill. Erstatter den inline `window.confirm`-knappen; `DeleteCourseButton` fjernet.

#### Tests
- [`app/admin/games/new/actions.test.ts`](app/admin/games/new/actions.test.ts) — trusted-creator-redirect-målene oppdatert til game-home (draft + publish).

</details>

### [1.68.0] - 2026-06-02 · #368

> Lander du på et privat spill du ikke er invitert til, står du ikke lenger fast. Du kan be arrangøren om plass med ett trykk, og de slipper deg inn eller avslår.

<details>
<summary>Teknisk</summary>

Løser [#368](https://github.com/jdlarssen/golf-app/issues/368). `/signup/[shortId]` for et invite_only-spill uten ventende invitasjon var en blindvei — en beskjed uten handling. Nå gjenbruker den «be om å bli med»-forespørsel-flyten (#199). Spillet forblir uoppdagbart i «Finn turneringer»; kun folk som har lenken kan banke på.

#### Changed
- [`app/signup/[shortId]/page.tsx`](app/signup/[shortId]/page.tsx) — invite_only uten invitasjon viser nå en forespørsel-form (solo/both); team-only beholder en informativ melding.
- [`app/signup/[shortId]/actions.ts`](app/signup/[shortId]/actions.ts) — `requestApproval` godtar `invite_only` i tillegg til `manual_approval`. `open` → fortsatt `wrong_mode`.
- [`app/admin/games/[id]/RegistrationOverviewSection.tsx`](app/admin/games/[id]/RegistrationOverviewSection.tsx) — påmelding-oversikten vises nå også for invite_only (pending-teller + «Vis alle påmeldinger»), så arrangøren har en stående vei til forespørslene. Ingen del-lenke-knapp der — invite_only forblir privat.
- [`app/admin/games/[id]/signups/page.tsx`](app/admin/games/[id]/signups/page.tsx) — invite_only-banneret hevder ikke lenger at selv-påmelding er umulig; det forklarer at folk med lenken kan be om å bli med.

#### Tests
- [`app/signup/[shortId]/actions.test.ts`](app/signup/[shortId]/actions.test.ts) — invite_only godtar forespørsel (insert + notify); `open` fortsatt avvist.

</details>
</details>


<details>
<summary><strong>1.67.y — Finn turneringer (2 oppføringer)</strong></summary>

Issue [#357](https://github.com/jdlarssen/golf-app/issues/357). «Finn turneringer» dukket bare opp på Hjem når du ikke hadde noen spill fra før — hadde du først ett, fantes det ingen vei til å oppdage nye. Nå er det en fast inngang fra Hjem, og turneringer med «be om å bli med»-påmelding vises også, ikke bare de helt åpne. I opprett-spill-wizarden ser arrangøren nå med en gang om påmeldingsvalget gjør turneringen oppdagbar eller privat, så lista faktisk fylles.

### [1.67.1] - 2026-06-02 · #367

> Når du setter opp et spill, ser du nå med en gang om påmeldingsvalget gjør turneringen synlig i Finn turneringer eller holder den privat. Hvert valg er merket «Oppdagbar» eller «Privat».

<details>
<summary>Teknisk</summary>

Løser [#367](https://github.com/jdlarssen/golf-app/issues/367). Påmeldings-steget forklarte kun *hvem* som kan melde seg på, aldri at valget styrer synlighet i «Finn turneringer» (#357). Default er fortsatt `invite_only` — intent-styrt default er en flyt-4-beslutning, utenfor scope her.

#### Changed
- [`app/admin/games/new/sections/RegistrationSection.tsx`](app/admin/games/new/sections/RegistrationSection.tsx) — hver påmeldingsmåte får et «Oppdagbar»/«Privat»-merke + omskrevet hint som sier konsekvensen for «Finn turneringer» i klartekst. Delt komponent, så både wizard-steget og full-skjemaet får det.

#### Added
- [`lib/games/registration.ts`](lib/games/registration.ts) — `isDiscoverableRegistrationMode(mode)` (open + manual_approval = oppdagbar), speilet mot `getDiscoverableGames` så merket ikke kan drifte fra faktisk discovery.

#### Tests
- [`lib/games/registration.test.ts`](lib/games/registration.test.ts) — enhetstester for synlighets-helperen, inkl. en vakt som krever at nøyaktig `invite_only` er privat.

</details>

### [1.67.0] - 2026-06-02 · #357

> Du finner og blir med i nye turneringer rett fra Hjem, også de som krever at arrangøren slipper deg inn. Før forsvant veien dit så snart du hadde ett spill gående.

<details>
<summary>Teknisk</summary>

Løser [#357](https://github.com/jdlarssen/golf-app/issues/357). Discovery («Funn turneringer») rendret kun i Hjem-tom-tilstand, og `getDiscoverableGames` returnerte bare `registration_mode = 'open'` — så `manual_approval`-spill var usynlige selv om de skal være offentlig oppdagbare. Påmeldingsmåten ER synligheten (flyt 2): open + manual_approval oppdages, invite_only er privat.

#### Added
- [`app/finn-turneringer/page.tsx`](app/finn-turneringer/page.tsx) — dedikert side som lister oppdagbare spill (gjenbruker `HomeDiscoverySection`), med vennlig tom-tilstand. `force-dynamic` siden `getDiscoverableGames` bruker admin-client ved request-tid.
- [`app/page.tsx`](app/page.tsx) — vedvarende «Finn turneringer»-inngangskort i has-games-nav, kun for spillere (`!canCreateGame`).

#### Changed
- [`lib/games/getDiscoverableGames.ts`](lib/games/getDiscoverableGames.ts) — inkluderer nå `open` + `manual_approval` (var kun `open`), returnerer `registration_mode` per spill, limit 10 → 50.
- [`app/HomeDiscoverySection.tsx`](app/HomeDiscoverySection.tsx) — CTA speiler modus: «Meld meg på» (open) / «Be om å bli med» (manual_approval); begge lenker til `/signup/[shortId]`, som ruter videre på modus.

#### Tests
- [`lib/games/getDiscoverableGames.test.ts`](lib/games/getDiscoverableGames.test.ts) — filteret dekker open + manual_approval (invite_only ekskludert), `registration_mode` bevart per spill.
- [`app/HomeDiscoverySection.test.tsx`](app/HomeDiscoverySection.test.tsx) — render-test for CTA-per-modus-svitsjen.

</details>
</details>


<details>
<summary><strong>1.66.y — Vedvarende navigasjon (2 oppføringer)</strong></summary>

Issue [#355](https://github.com/jdlarssen/golf-app/issues/355). Appen hadde ingen fast navigasjon. For å nå profil, innboks eller bytte spill måtte du alltid tilbake til Hjem først. Nå ligger en fast bunn-meny (Hjem / Innboks / Profil) nederst på alle spiller-sider.

### [1.66.1] - 2026-06-01 · #346

> Som arrangør når du «Sekretariatet» med ett trykk fra Hjem igjen. En tydelig knapp der du lander, ikke gjemt bort under Profil.

<details>
<summary>Teknisk</summary>

Fikser en regresjon fra 1.66.0: bunn-nav-en (som holder admin ute av menyen — eget rom) flyttet «Sekretariatet»-lenken til en muted lenke nederst på Profil-siden, som var vanskelig å finne for admin.

#### Changed
- [`app/page.tsx`](app/page.tsx) — tydelig admin-only «Sekretariatet»-knapp på Hjem, ved «Opprett spill»-CTA-en i begge hjem-grener (tom + ikke-tom). Der admin lander, og der lenken bodde før (#346).
- [`app/profile/page.tsx`](app/profile/page.tsx) — `AccountActions` har nå kun «Logg ut» (én konto-handling); trenger ikke lenger lese `is_admin`, så DB-spørringen + `Suspense`-wrapperen er borte.

</details>

### [1.66.0] - 2026-06-01 · #355

> Før måtte du innom Hjem for å komme deg videre i appen. Nå ligger en fast meny nederst på alle sider med Hjem, Innboks og Profil, så du når alt med ett trykk. «Logg ut» finner du nå under Profil.

<details>
<summary>Teknisk</summary>

Fikser [#355](https://github.com/jdlarssen/golf-app/issues/355) — ingen vedvarende nav; Hjem var eneste nav-nav, en blindvei i installert PWA. Profil var kun nåbar fra en muted footer på Hjem.

#### Added
- [`components/ui/BottomNav.tsx`](components/ui/BottomNav.tsx) — fast bunn-tab-bar (Hjem/Innboks/Profil), `position: fixed` + `env(safe-area-inset-bottom)`, aktiv-fane via `usePathname`, uleste-prikk på Innboks via `useUnreadNotificationsCount`. Rendret én gang globalt i [`app/layout.tsx`](app/layout.tsx) med `userId` fra proxy-headeren, så den dekker ALLE innloggede spiller-flater — inkludert de ~30 format-spesifikke leaderboard-viewene som hver eier sin egen `AppShell`.
- [`components/icons/Icons.tsx`](components/icons/Icons.tsx) — `HjemIcon` + `ProfilIcon` (Innboks bruker `KonvoluttIcon`).
- Konto-handlinger på Profil-siden: «Logg ut» + (for admin) «Sekretariatet».

#### Changed
- [`components/ui/AppShell.tsx`](components/ui/AppShell.tsx) — reserverer bunn-padding som klarerer baren + home-indicator (baren rendres globalt, ikke per AppShell).
- `NotificationBell` fjernet fra spiller-`TopBar` og home-headeren — Innboks-fanen overtar. Beholdt på admin-flater (ingen bunn-nav der).
- Home-footeren fjernet: «Min profil» dekkes av Profil-fanen, «Logg ut» flyttet til Profil-siden (admin-inngangen «Sekretariatet» får sin plass i 1.66.1).

#### Notes
- Skjuler seg på hull-skjermen (fullskjerm scoring) og admin (eget rom) via `usePathname`; på offentlige/pre-profil-sider mangler proxy-headeren, så `userId` er null og baren rendres ikke.
- Global render i root-layout ble valgt framfor en `userId`-prop per `AppShell`: `AppShell` rendres ~50 steder (mange er client-component leaderboard-views), så per-prop-tråding ville bommet på dem og vært en felle for hver nye spillform. Root-layout-render gjør at headeren leses der, hvilket gjør de tre tidligere statiske sidene (`/_not-found`, `/invite`, `/legal/privacy`) dynamiske — ubetydelig for app-en. Route-gruppe-layout er en mulig fremtidig optimalisering for persistent realtime-abonnement.

</details>
</details>


<details>
<summary><strong>1.65.y — Trekk spiller: hold frafall ute av rangeringen (2 oppføringer)</strong></summary>

Issue [#386](https://github.com/jdlarssen/golf-app/issues/386). Noen dro hjem etter ni hull, eller dukket aldri opp? Nå kan både spilleren selv og arrangøren markere et frafall. Den trukne tas helt ut av rangeringen (scorene teller ikke), står som «Trukket», og scorekortet låses. Forskjellen fra «ikke levert»: en som spilte men glemte å levere teller fortsatt; en som trakk seg gjør ikke.

### [1.65.1] - 2026-06-01 · #360

> Har du skrudd på at flighten må godkjenne scorekortene? Blir ett kort hengende fordi noen dro hjem uten å godkjenne, viser «Avslutt spillet»-kortet nå tydelig at du kan godkjenne på vegne av flighten. Ingen runde blir stående låst.

<details>
<summary>Teknisk</summary>

Fikser [#360](https://github.com/jdlarssen/golf-app/issues/360) — admin-overstyringen for å løse opp en hengende peer-godkjenning fantes, men var ikke oppdagbar: «Avslutt spillet»-kortet stoppet dødt med en passiv «N scorekort venter på godkjenning»-advarsel uten vei videre.

#### Fixed
- [`app/admin/games/[id]/page.tsx`](app/admin/games/[id]/page.tsx) — avslutt-kortets godkjennings-blokker er ikke lenger en blindvei: den peker nå til overstyringen («Godkjenn på vegne av flight» under «Leverte scorekort») med en anker-lenke. `SectionCard` fikk en valgfri `id`-prop for ankeret (`id="leverte-scorekort"`). Gjelder både ren godkjennings-blokker og kombinert levering + godkjenning. Selve overstyringen (`adminApproveScorecard`) er uendret — endringen gjør den oppdagbar.

#### Notes
- Tids-basert auto-eskalering (cron/push-varsel) ble bevisst holdt utenfor: peer-godkjenning skjer normalt i løpet av minutter, og proaktiv purring overlapper [#376](https://github.com/jdlarssen/golf-app/issues/376). Overstyringen er i stedet umiddelbart tilgjengelig idet et kort er ventende.

</details>

### [1.65.0] - 2026-06-01 · #386

> Dro noen hjem før runden var ferdig? Du (eller spilleren selv) kan trekke dem fra spillet. De står som «Trukket» uten plassering, scorene deres teller ikke, og resten av leaderboardet er upåvirket. Angre når som helst mens spillet pågår.

<details>
<summary>Teknisk</summary>

Fikser [#386](https://github.com/jdlarssen/golf-app/issues/386) — ingen måte å ta en no-show / et frafall ut av rangeringen; scorene deres telte alltid, og selv-uttrekk virket bare før start.

#### Added
- Migrasjon `0067_game_players_withdrawn.sql` — additive `withdrawn_at` + `withdrawn_by_user_id` på `game_players` (avledet WD-tilstand, ingen status-enum).
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `supportsWithdrawal(mode)`: WD tilbys kun for individuell-ball-totalformat (best ball, stableford ×2, solo slagspill). Andre format faller tilbake på «ikke levert». Exhaustiv switch + Type-A-test.
- [`app/games/[id]/leaderboard/WithdrawnPlayersSection.tsx`](app/games/[id]/leaderboard/WithdrawnPlayersSection.tsx) — delt «Trukne spillere»-seksjon under leaderboarden (vises for in-scope-modi).
- [`app/admin/games/[id]/trekk-spiller/[userId]/page.tsx`](app/admin/games/[id]/trekk-spiller/[userId]/page.tsx) — dedikert bekreftelses-side for admin-WD. `adminWithdrawPlayer` / `adminUndoWithdraw` server-actions.
- [`app/admin/games/[id]/avslutt-likevel/actions.ts`](app/admin/games/[id]/avslutt-likevel/actions.ts) — `endGameMarkingWithdrawals`: per-spiller «Marker som trukket»-valg i avslutt-likevel-flyten.

#### Changed
- [`app/games/[id]/withdrawActions.ts`](app/games/[id]/withdrawActions.ts) — `withdrawFromGame` setter `withdrawn_at` under aktivt spill (UPDATE) i stedet for å slette; pre-start beholder DELETE. Ny `undoWithdraw` (spiller angrer selv).
- [`app/games/[id]/leaderboard/page.tsx`](app/games/[id]/leaderboard/page.tsx) — trukne spillere + scorene deres filtreres ut før `computeLeaderboard` for de fire in-scope-modiene; best ball fortsetter med gjenværende lagmedlem.
- [`app/games/[id]/holes/[holeNumber]/HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx) — scorekortet låses read-only med «Du har trukket deg» når innlogget spiller er trukket.
- [`app/admin/games/[id]/actions.ts`](app/admin/games/[id]/actions.ts) + [`avslutt/actions.ts`](app/admin/games/[id]/avslutt/actions.ts) — `endGame`/`endGameWithSideWinners` hopper over trukne spillere (verken levering eller godkjenning blokkerer). Admin-detalj-siden teller trukne ut av readiness-tallene og viser «Trukket» + Trekk/Angre per spiller.

#### Notes
- WD = ute av rangeringen, ingen plassering (som en golf-WD). Ren no-show folder inn i samme mekanisme. Matchplay-familien + pott-format (skins/wolf/nassau/m.fl.) er bevisst utenfor v1 — der faller en manglende spiller tilbake på «ikke levert».
- Migrasjonen er additiv + nullable, trygg å kjøre før kode-deploy.

</details>
</details>


<details>
<summary><strong>1.64.y — Avslutt selv om noen ikke har levert (2 oppføringer)</strong></summary>

Issue [#375](https://github.com/jdlarssen/golf-app/issues/375). En spiller som aldri leverte scorekort kunne før låse hele spillet — det fantes ingen vei rundt. Nå kan arrangøren avslutte likevel: de som mangler står som «ikke levert» (scorene deres teller fortsatt), og resultatet låses for resten.

### [1.64.1] - 2026-06-01 · #375

> En spiller som spilte men aldri trykket «lever», sto som «ikke fullført». Det var misvisende — de hadde jo spilt. Nå står de som «ikke levert», og scorene deres teller i resultatet akkurat som før.

<details>
<summary>Teknisk</summary>

Oppfølging av [#375](https://github.com/jdlarssen/golf-app/issues/375) etter bruker-tilbakemelding: «ikke fullført» antydet at en spiller som spilte men ikke leverte var ute av rangeringen. Scorene har alltid telt — leaderboarden leser `scores` på `game_id`, aldri `submitted_at` — så kun etiketten var feil.

#### Changed
- [`app/admin/games/[id]/page.tsx`](app/admin/games/[id]/page.tsx) — roster-merke «Ikke fullført» → «Ikke levert»; «Levert scorekort»-sub «N spilte ikke ferdig» → «N leverte ikke»; end-kort-advarselen presiserer at scorene teller fortsatt.
- [`app/admin/games/[id]/avslutt-likevel/page.tsx`](app/admin/games/[id]/avslutt-likevel/page.tsx) + [`avslutt/page.tsx`](app/admin/games/[id]/avslutt/page.tsx) — bekreftelses-copy: «ikke fullført» → «ikke levert», med en setning om at registrerte scorer fortsatt teller i resultatet.

#### Notes
- Ren copy-/etikett-retting. Ingen logikk-endring: scoring og leaderboard var alltid uavhengig av `submitted_at`.
- Path 5 (spiller trekker seg / WD → ute av rangeringen) er en egen, kommende feature — ikke dekket her.

</details>

### [1.64.0] - 2026-06-01 · #375

> Mangler én spiller levering, kan du nå avslutte likevel. Du ser hvem som ikke leverte, bekrefter, og de blir stående som «ikke fullført» — så et spill aldri blir hengende åpent fordi noen dro hjem tidlig.

<details>
<summary>Teknisk</summary>

Fikser [#375](https://github.com/jdlarssen/golf-app/issues/375) — `not_all_submitted` var en hard sperre uten escape; én no-show låste spillet permanent.

#### Added
- [`app/admin/games/[id]/avslutt-likevel/page.tsx`](app/admin/games/[id]/avslutt-likevel/page.tsx) — dedikert bekreftelses-side for spill uten sideturnering. Lister hvem som ikke har levert, forklarer «ikke fullført»-konsekvensen, og kaller `endGame(gameId, true)`. Guards: notFound / not_active / ruter sideturnering til `/avslutt` / redirect til detalj hvis ingen mangler.

#### Changed
- [`app/admin/games/[id]/actions.ts`](app/admin/games/[id]/actions.ts) — `endGame(gameId, allowMissing = false)`. Når `allowMissing`, hopper validerings-loopen over spillere uten levering (`submitted_at` forblir null) i stedet for å redirecte `not_all_submitted`. Peer-godkjenning-gaten (`not_all_approved`) er bevisst IKKE lempet — den låsen eies av [#360](https://github.com/jdlarssen/golf-app/issues/360).
- [`app/admin/games/[id]/avslutt/actions.ts`](app/admin/games/[id]/avslutt/actions.ts) — `endGameWithSideWinners(gameId, allowMissing, formData)` får samme escape (allowMissing bundet før formData).
- [`app/admin/games/[id]/avslutt/page.tsx`](app/admin/games/[id]/avslutt/page.tsx) — sideturnerings-wizarden laster nå `submitted_at`, viser mangler-advarsel med navn over vinner-skjemaet, og binder `allowMissing`.
- [`app/admin/games/[id]/page.tsx`](app/admin/games/[id]/page.tsx) — end-kortet viser «Avslutt likevel»-lenke når levering er eneste blokker (`notSubmittedCount > 0 && pendingApprovalCount === 0`). Roster viser «Ikke fullført» per no-show på avsluttet spill (ikke «⏳ Spiller»). «Levert scorekort»-raden får sub «N spilte ikke ferdig».

#### Notes
- Ingen DB-endring: «ikke fullført» er avledet (`finished && submitted_at == null`), aldri en falsk levering. Tilstanden forsvinner av seg selv ved gjenåpning.
- Leaderboard/podium håndterer no-shows som ufullstendige slik «ikke spilt»-hull alltid har gjort — ingen endring i view-/podium-komponentene (bruker valgte admin-only markering).
- [`app/admin/games/[id]/actions.test.ts`](app/admin/games/[id]/actions.test.ts) — ny Type-A-test: `allowMissing=true` flipper til finished tross en ulevert spiller og skriver aldri `submitted_at`.

</details>
</details>


<details>
<summary><strong>1.63.y — Kompis-wizard: velg antall spillere før format (1 oppføring)</strong></summary>

Issue [#373](https://github.com/jdlarssen/golf-app/issues/373). For Kompis-runder vises nå en enkel teller øverst i Format-steget. Velg antall spillere, og formater som ikke passer forsvinner — ingen feil format-valg, ingen tur frem og tilbake.

### [1.63.0] - 2026-06-01 · #373

> I Kompis-runden velger du antall spillere før format. Bare formater som passer det antallet vises — så slipper du å oppdage et mismatch to steg senere.

<details>
<summary>Teknisk</summary>

Fikser [#373](https://github.com/jdlarssen/golf-app/issues/373) — format valgt blindt, mismatch oppdages i steg 4.

#### Added
- [`lib/wizard/fitsPlayerCount.ts`](lib/wizard/fitsPlayerCount.ts) — ren predikat-funksjon `fitsPlayerCount(gameMode, n): boolean`. Utledet fra `useGameFormState.ts` + `gamePayload.ts`-validerings-logikk. Dekker alle 22 `GameMode`-verdier med eksakt/partall/multiplum-regler. Ukjente fremtidige modes får `true` (permissivt). Exhaustiveness-sjekk via `never`-assertion i default-gren.
- [`lib/wizard/fitsPlayerCount.test.ts`](lib/wizard/fitsPlayerCount.test.ts) — 90 Type-A-tester med `it.each`, én klynge per format-familie. Dekker grense-verdier, partall, multiplum, best ball 2–8-oppdateringen fra #374.
- `app/admin/games/new/GameWizard.tsx` — `PlayerCountPicker`-komponent (+/−-knapper, ≥44px tap-targets, forest-and-champagne-palett). Vises atop FormatGrid kun for Kompis-intent. «Vis alle»-lenke nullstiller filteret. Steg 4 viser hint med antallet valgt i steg 2.
- `app/admin/games/new/GameWizard.test.tsx` — én render/interaksjons-test: count=3 skjuler best_ball, viser nines; «Vis alle» gjenoppretter.

#### Changed
- [`app/admin/games/new/useGameFormState.ts`](app/admin/games/new/useGameFormState.ts) — nytt state-felt `expectedPlayerCount: number | undefined` + setter `setExpectedPlayerCount`. Setter nullstiller `gameMode`/`formatChosen` automatisk hvis det valgte formatet ikke lenger passer etter teller-endring. Importerer `fitsPlayerCount` statisk.

#### Notes
- `kompis`-katalogen fra DB inneholder 18 aktive formater. Alle er eksplisitt håndtert i predikatet; ingen defaultet permissivt for kjente katalog-slugs.
- Avvik fra issue-tabell: best ball er `even 2–8` (ikke `nøyaktig 8`) — reflekterer #374-oppdateringen. Texas scramble er `multiplum av 2` (team_size 2 eller 4 begge gyldige; multiplum av 2 dekker begge). Shamble er `multiplum av 3 ELLER 4` (ikke bare 3/4-lag).

</details>
</details>


<details>
<summary><strong>1.62.y — Best ball for alle kompislaget (1 oppføring)</strong></summary>

Issue [#374](https://github.com/jdlarssen/golf-app/issues/374). Best ball støtter nå 2, 4, 6 eller 8 spillere — ikke bare 8. Trekk tilfeldig fungerer med alle partall-antall.

### [1.62.0] - 2026-06-01 · #374

> Du kan nå spille best ball med 4 eller 6 spillere, ikke bare 8. Velg et partall antall og fordel 2 per lag — resten fungerer som før.

<details>
<summary>Teknisk</summary>

Fikser [#374](https://github.com/jdlarssen/golf-app/issues/374) — best ball hardkodet til 8 spillere.

#### Changed
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateBestBall` speiler nå `validateStablefordTeam`: hopper over tomme slots, returnerer `min_players_for_mode` (ikke `players_required`) ved 0 spillere, validerer kun at hvert ikke-tomt lag har eksakt 2 spillere. `mode_config.teams_count` settes til faktisk antall ikke-tomme lag (ikke hardkodet 4).
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `GameModeConfig` for `best_ball`: `teams_count: 4` → `teams_count: number`.
- [`app/admin/games/new/useGameFormState.ts`](app/admin/games/new/useGameFormState.ts) — `teamsComplete` bruker nå fleksibel logikk (≥2 spillere, partall, alle tilordnet, hvert ikke-tomt lag à 2). Felles booleans `flexTeamsBalanced` + `flexTeamsHasAtLeastOneTeam` deles mellom best ball og par-stableford (ingen duplikat). `drawRandomTeams` fordeler 2 per lag basert på det faktiske antallet valgte spillere (ikke hardkodet 8). Feilmelding oppdatert: «partall antall spillere (2, 4, 6 eller 8)».
- [`app/admin/games/new/sections/TeamsAssignmentSection.tsx`](app/admin/games/new/sections/TeamsAssignmentSection.tsx) — lag-grid vises fra 2 spillere (ikke 8); hint-tekst speiler par-stableford: «Inntil 4 lag à 2 spillere. Tomme lag publiseres ikke.»
- [`app/admin/games/new/sections/PlayersSection.tsx`](app/admin/games/new/sections/PlayersSection.tsx) — teller viser «X spillere valgt» med partall-hint; «X av 8» er borte.

#### Added
- `lib/games/gamePayload.test.ts` — 7 nye best ball-tester: 2-spiller-publish (1 lag), 4-spiller-publish (2 lag, `teams_count = 2`), 6-spiller-publish (3 lag), 0-spiller → `min_players_for_mode`, ubalansert lag → `team_balance`, draft tolererer ubalanse + 0 spillere.

</details>
</details>


<details>
<summary><strong>1.61.y — Cup-veiviser: generer alle matcher på én gang (4 oppføringer)</strong></summary>

Issue [#219](https://github.com/jdlarssen/golf-app/issues/219), Ryder Cup fase 4. Administratorer kan nå lage et fullt cup-program fra ett skjema — velg lag, bane, formatmal og paring-strategi, forhåndsvis og juster, og opprett alle matchene i ett trykk.

### [1.61.3] - 2026-06-01 · #361

> Skriver du inn en e-post som ikke kan logge inn, får du nå en forklaring på hva som er galt og hva du skal gjøre. En utløpt invitasjon sier «Invitasjonen din er utløpt» i stedet for en kryptisk feil, og en død påmeldingslenke viser en egen side med vei videre i stedet for en blank 404.

<details>
<summary>Teknisk</summary>

Fikser [#361](https://github.com/jdlarssen/golf-app/issues/361) — kryptiske feil i onboarding-kanttilfeller.

#### Added
- [`app/signup/[shortId]/not-found.tsx`](app/signup/[shortId]/not-found.tsx) — vennlig fallback når en signup-lenke peker på et slettet/ugyldig spill (`page.tsx` kaller `notFound()`). «Denne lenken gjelder ikke lenger» + vei til forsiden.

#### Changed
- [`app/(auth)/login/actions.ts`](app/(auth)/login/actions.ts) — `sendCode` skiller nå en utløpt invitasjon fra en aldri-invitert e-post: i `user_not_found`-grenen slås det opp om det finnes en lapset invitasjon (`accepted_at` null, `expires_at` passert), og i så fall vises `invite_expired` i stedet. Best-effort — faller tilbake til den generiske koden hvis oppslaget feiler.
- [`app/(auth)/login/page.tsx`](app/(auth)/login/page.tsx) — ny `invite_expired`-melding.

</details>

### [1.61.2] - 2026-06-01 · #356

> Blir du invitert til et spill og logger inn for første gang, havner du nå rett på spillet etter at du har fylt ut profilen. Du slipper å lete det fram fra forsiden selv.

<details>
<summary>Teknisk</summary>

Fikser [#356](https://github.com/jdlarssen/golf-app/issues/356) — spill-scopet invitee ble dumpet på hjem-skjermen etter onboarding.

#### Changed
- [`app/(auth)/login/actions.ts`](app/(auth)/login/actions.ts) — `verifyCode` regner ut et landingsmål når invitéen har én entydig solo-spill-invitasjon og ingen eksplisitt `next`. Mangler profilen, sendes brukeren via `/complete-profile?next=/games/[id]`; ellers rett til `/games/[id]`. Redirecten skjer bevisst utenfor den best-effort try/catch-en (den ville ellers slukt `NEXT_REDIRECT`). Team-only-spill og flere samtidige invitasjoner faller tilbake til hjem-landing.
- [`app/complete-profile/page.tsx`](app/complete-profile/page.tsx) + [`actions.ts`](app/complete-profile/actions.ts) — bærer `next` gjennom profil-steget (skjult felt + validert relativ-path-redirect), og bevarer det ved valideringsfeil.

#### Added
- [`app/complete-profile/actions.test.ts`](app/complete-profile/actions.test.ts) — dekker `next`-rundturen (gyldig mål, hjem-default, off-site-avvisning, bevart ved feil). `login/actions.test.ts` utvidet med to nye spill-landing-caser.

</details>

### [1.61.1] - 2026-06-01 · #372

> Når du oppretter et spill og velger «Åpen påmelding», får du nå en forklaring på vanlig norsk i stedet for en teknisk innstilling med kodenavn.

<details>
<summary>Teknisk</summary>

Fikser [#372](https://github.com/jdlarssen/golf-app/issues/372) — hjelpeteksten for «Åpen påmelding» i opprett-spill-veiviseren eksponerte env-variabelnavnet `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` til en sluttbruker uten programmeringserfaring.

#### Fixed
- [`app/admin/games/new/sections/RegistrationSection.tsx`](app/admin/games/new/sections/RegistrationSection.tsx) — skrev om `open`-modus-hinten til «Alle med lenken kan melde seg på. Best for klubb og åpne turneringer.» Konfig-navnet er borte; meningen (åpen, oppdagbar påmelding) er bevart. Løftet om at ukjente brukere kan registrere seg uten konto er bevisst utelatt til selvregistrering faktisk er skrudd på ([#364](https://github.com/jdlarssen/golf-app/issues/364)).

</details>

### [1.61.0] - 2026-05-31 · #219

> Du kan nå generere et helt cup-program på sekunder: velg hvem som er på hvert lag, hvilken bane, et formatoppsett (Klassisk cup, Four-ball + singler eller Bare singler) og om matchene skal pares tilfeldig eller handicap-balansert — forhåndsvis resultatet, juster om du vil, og opprett alt i ett trykk. Du slipper å bygge match for match gjennom den vanlige veiviseren.

<details>
<summary>Teknisk</summary>

Fikser [#219](https://github.com/jdlarssen/golf-app/issues/219) — cup match-templating (Ryder Cup fase 4).

#### Added
- [`app/admin/cup/[id]/generer/page.tsx`](app/admin/cup/[id]/generer/page.tsx) — server-side rute: henter cup, spillere og baner (auth-gated, kun draft-cuper).
- [`app/admin/cup/[id]/generer/GenerateMatchesWizard.tsx`](app/admin/cup/[id]/generer/GenerateMatchesWizard.tsx) — 4-stegs klient-veiviser: lagvelger → bane+tee → formatmal + paringsstrategi → forhåndsvisning/justering → opprett via `createCupMatchesFromPlan`-action.
- [`app/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx`](app/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx) — render-test (smoke).
- «Generer matcher»-knapp i [`app/admin/cup/[id]/page.tsx`](app/admin/cup/[id]/page.tsx) (kun synlig i draft); viser `matches_generated`-statusmelding etter vellykket opprettelse.

Rene hjelpebiblioteker (`lib/cup/cupTemplates.ts`, `lib/cup/cupPairing.ts`) og `createCupMatchesFromPlan`-server-action med tilhørende tester er committet i tidligere commits. Matcher opprettes som `scheduled`-spill med handicap frosset ved rundstart.

</details>
</details>


<details>
<summary><strong>1.60.y — Modus-skole: detaljsider + admin-redigerbar forklaring (5 oppføringer)</strong></summary>

Issues [#307](https://github.com/jdlarssen/golf-app/issues/307) + [#308](https://github.com/jdlarssen/golf-app/issues/308), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Hver spillform får en egen detaljside med fyldigere forklaring + konkret eksempel, og alle modus-tekstene blir redigerbare fra Sekretariatet uten deploy.

### [1.60.4] - 2026-05-31 · #344

> Inviterer du en venn som allerede er invitert til Tørny, får du beskjed om det med en gang i stedet for at de får enda en invitasjon på e-post. Samme adresse får ikke lenger to invitasjoner selv om både du og en arrangør inviterer.

<details>
<summary>Teknisk</summary>

Siste barn i «Én vei til rom»-paraplyen ([#344](https://github.com/jdlarssen/golf-app/issues/344)). Fikser [#348](https://github.com/jdlarssen/golf-app/issues/348) — dobbel invite-mail på tvers av de to invite-dørene.

#### Fixed
- Begge invite-dører gater nå på den delte `email_is_invited`-RPC-en (samme `SECURITY DEFINER`-funksjon som login-flyten bruker). Venne-døra ([`app/invite/actions.ts`](app/invite/actions.ts)) manglet sjekken helt og kunne sende en andre invite-mail til en adresse en arrangør allerede hadde invitert. En direkte `invitations`-query ville ikke fanget det, fordi RLS (0020) skjuler andres rader — derav den `SECURITY DEFINER`-RPC-en.
- Admin-døra ([`app/admin/spillere/actions.ts`](app/admin/spillere/actions.ts)) byttet sin inline `invitations`-query mot samme RPC, så begge dører og login deler én sannhetskilde for «er denne adressen invitert». Bivirkning: en *utløpt* invitasjon blokkerer ikke lenger en ny admin-invite (bruk «Send på nytt» for en gyldig ventende).

#### Added
- Venne-døra viser nå en «allerede invitert»-melding ([`app/profile/page.tsx`](app/profile/page.tsx)).
- `.rpc()`-støtte i `buildSupabaseMock` ([`tests/serverActionMocks.ts`](tests/serverActionMocks.ts)) + dedup-tester for begge dører (venne-dør blokkerer/går-videre, admin-dør blokkerer).

</details>

### [1.60.3] - 2026-05-31 · #344

> «Opprett spill» ser nå lik ut overalt: på hjem og i spill-lista. Knappen blir værende på hjem selv når du allerede har spill, ikke bare når lista er tom. Før het samme handling tre forskjellige ting avhengig av hvor du sto.

<details>
<summary>Teknisk</summary>

Del av «Én vei til rom»-paraplyen ([#344](https://github.com/jdlarssen/golf-app/issues/344)). Fikser [#346](https://github.com/jdlarssen/golf-app/issues/346) — én konsistent Opprett-inngang (fast plassering + etikett).

#### Added
- [`lib/games/createGameLabel.ts`](lib/games/createGameLabel.ts) — `CREATE_GAME_LABEL = 'Opprett spill'`, én sannhetskilde for opprett-etiketten på tvers av flater.
- Fast Opprett-knapp i hjem ikke-tom-tilstand ([`app/page.tsx`](app/page.tsx)) for `canCreateGame`, rollet til `/admin/games/new` (admin) / `/opprett-spill` (trusted) — så inngangen ikke lenger forsvinner når du har spill fra før.
- Delt `HomeUtilityFooter` brukt i begge hjem-grener.

#### Changed
- Hjem tom-CTA, spill-lista sin TopBar-action og spill-lista sin tom-tekst bruker nå `CREATE_GAME_LABEL` (var «Opprett en turnering» / «+ Nytt»).
- Sekretariatet-lenken fra hjem er konsolidert til én representasjon med konsistent vekt (delt footer i begge grener) i stedet for muted-footer-lenke (tom) vs. accent-kort (ikke-tom).

#### Removed
- Redundant trusted-only «Sett opp ny runde»-seksjon + duplikat Profil/Admin Section-kort i hjem ikke-tom-tilstand (erstattet av den faste Opprett-knappen + delt footer).

</details>

### [1.60.2] - 2026-05-31 · #344

> Er du med i en cup, ser du nå «Se cup-stillingen» rett på match-siden din, så du slipper å lete etter lenken. Og som arrangør tar tilbake-knappen på en cup deg til cup-lista i stedet for helt ut til Sekretariatet.

<details>
<summary>Teknisk</summary>

Del av «Én vei til rom»-paraplyen ([#344](https://github.com/jdlarssen/golf-app/issues/344)). Fikser [#347](https://github.com/jdlarssen/golf-app/issues/347) — to navigasjons-døde-ender i cup-flyten.

#### Fixed
- [`app/admin/cup/[id]/page.tsx`](app/admin/cup/[id]/page.tsx) — cup-detalj `TopBar backHref` endret fra `/admin` til `/admin/cup` (i tråd med spill-detalj-mønsteret), så tilbake-lenka treffer cup-lista.

#### Added
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — ny self-fetching `CupStandingsLink`-komponent (Suspense-wrappet, egen `tournament_id`-lookup) som rendrer et «Se cup-stillingen →»-nav-kort til `/cup/[tournament_id]` når spillet tilhører en cup. Synlig i alle tilstander (venterom/aktiv/avsluttet/draft); returnerer null for ikke-cup-spill og for slettede cuper. Den delte `getGameWithPlayers`-cachen er uberørt.

</details>

### [1.60.1] - 2026-05-31 · #344

> Du setter nå opp en cup på samme sted som alt annet, i oppsett-veiviseren, i stedet for via en egen knapp på cup-lista. Står lista tom, får du en lenke rett dit. Én vei inn gjør det lettere å treffe riktig.

<details>
<summary>Teknisk</summary>

Del av «Én vei til rom»-paraplyen ([#344](https://github.com/jdlarssen/golf-app/issues/344)). Fikser [#345](https://github.com/jdlarssen/golf-app/issues/345): cup-lista hadde en egen «Opprett ny cup»-knapp som duplikerte intent-veiviseren. Cup-opprettelse skjer nå kun via den ene døra (`/admin/games/new` → `IntentSelector` → Cup → `CupSetup`).

#### Removed
- [`app/admin/cup/page.tsx`](app/admin/cup/page.tsx) — full-bredde «Opprett ny cup»-knappen + ubrukte `Link`/`Button`-importer.

#### Changed
- Tom-tilstand på cup-lista er nå en signpost med liten inline-lenke til `/admin/games/new?intent=cup`, ikke en konkurrerende primær-knapp. `?intent=cup`-ruten beholdt uendret — match-deep-links fra cup-detalj (`app/admin/cup/[id]/page.tsx`) er uberørt.

</details>

### [1.60.0] - 2026-05-31 · #307

> Hver spillform har nå sin egen side med en fyldigere forklaring og et konkret eksempel — trykk «Les mer» på et spillform-kort for å åpne den. Og som arrangør kan du endre selve forklaringene fra Sekretariatet selv, uten å vente på en oppdatering, hvis en formulering er uklar.

<details>
<summary>Teknisk</summary>

Flytter modus-forklaringene fra hardkodet `MODE_GUIDE` til DB-drevet, admin-redigerbar innhold, og legger til en detaljside per spillform. Fire nye nullable-kolonner på `formats` (`rules_summary`, `rules_points`, `rules_long`, `rules_example`); `rules_long` + `rules_example` seedet for alle 22 modi, `rules_summary`/`rules_points` NULL → kode-fallback til `MODE_GUIDE`. Ren `mergeModeContent` (DB-verdi vinner per felt, ellers `resolveModeGuide`-fallback inkl. 4BBB-variant) + cachet `getModeContentMap` på samme `format-mapping`-tag som intent-mappingen. `ModeGuideCard` refaktorert til ren presentasjonskomponent (summary/points/label/detailHref som props). Admin-redigering i Sekretariatet buster cachen via `revalidateTag('format-mapping')` → endring synlig umiddelbart.

#### Added
- [`lib/formats/getModeContent.ts`](lib/formats/getModeContent.ts) — `mergeModeContent` (ren) + `getModeContentMap` (cachet, `format-mapping`-tag).
- [`app/spillformer/[slug]/page.tsx`](app/spillformer/[slug]/page.tsx) — detaljside per spillform (sammendrag + punkter + fyldig forklaring + konkret eksempel); 404 ved ukjent slug, slug-validering avledet fra `MODE_LABELS`.
- [`supabase/migrations/0066_format_rules_content.sql`](supabase/migrations/0066_format_rules_content.sql) — 4 innholds-kolonner + seed av forklaring/eksempel for alle 22 modi. **Appliseres post-deploy.**
- Admin-innholds-editor i [`app/admin/formats/FormatsManager.tsx`](app/admin/formats/FormatsManager.tsx) + `updateFormatContent`-action + `parsePointsTextarea`-helper.

#### Changed
- [`components/ModeGuideCard.tsx`](components/ModeGuideCard.tsx) — ren presentasjon (props i stedet for intern `MODE_GUIDE`-import) + valgfri «Les mer →»-lenke.
- [`app/spillformer/page.tsx`](app/spillformer/page.tsx) — DB-drevet innhold + lenke til detaljside per kort; alle 22 modi listet.
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — henter modus-innhold server-side, sender til `ModeGuideCard` med `detailHref`.

</details>
</details>
</details>



<details>
<summary><strong>Format-katalogen: scramble & matchplay (#270) — 17 serier</strong></summary>

<details>
<summary><strong>1.59.y — Gruesome matchplay (motstander velger din tee shot) + familie-leaderboard (7 oppføringer)</strong></summary>

Issue [#291](https://github.com/jdlarssen/golf-app/issues/291), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Gruesome er foursomes med en vri: begge slår ut, men motstanderlaget velger hvilken av ballene paret må spille videre med. Standalone-spillbar (intent «kompis») i tillegg til cup. Samme serie gir hele alternate-shot-familien (foursomes/greensome/chapman/gruesome) en ekte individuell-spill matchplay-leaderboard.

### [1.59.6] - 2026-05-31 · #325

> Wolf, Nassau, Skins, Modified Stableford og Acey Deucey har nå egne ikoner i oppsett-veiviseren, i stedet for det generiske flagget. Så hvert format-kort ser likt og gjennomført ut når du velger spillform.

<details>
<summary>Teknisk</summary>

Fikser [#325](https://github.com/jdlarssen/golf-app/issues/325). La til fem dedikerte ikon-komponenter i [`lib/formats/icons.tsx`](lib/formats/icons.tsx) (`WolfIcon`, `NassauIcon`, `SkinsIcon`, `ModifiedStablefordIcon`, `AceyDeuceyIcon`) + `ICON_MAP`-oppføringer, i samme 28×28 line-icon-stil (`stroke=currentColor`, rounded caps) som resten. Motiv: Wolf = ulv (fylt) med valg-pil mot tre; Nassau = tre veddemål-pills (front/back/total); Skins = myntstabel (carryover-pott); Modified Stableford = scorekort med «+5» (eagle-bonus); Acey Deucey = opp/ned-pil (ace tar, deuce gir).

Merk: issue-en listet `foursomes_matchplay` som manglende, men den er allerede mappet til `MatchplayIcon` (delt med alternate-shot-familien greensome/chapman/gruesome — bevisst, som ambrose/florida deler Texas-ikonet). Reelt gap var de fem over.

</details>

### [1.59.5] - 2026-05-31 · #309

> Invitasjons-mailen til et spill forteller nå kort hvilken spillform det er — navnet pluss én linje om hvordan den funker — med en lenke til oversikten over alle spillformene. Så en invitert spiller vet hva som venter før hen åpner appen.

<details>
<summary>Teknisk</summary>

Fikser [#309](https://github.com/jdlarssen/golf-app/issues/309) (#299-tråden). `sendInviteNotification` fikk en optional `gameMode`. Når den er satt sammen med `gameName` og er en kjent `MODE_GUIDE`-nøkkel, rendres et kort modus-hint (navn fra `MODE_LABELS` + ett-linjes `MODE_GUIDE[mode].summary` + lenke til `/spillformer`) i både HTML og text. Defensiv lookup: ukjent/manglende modus → ingen hint, ingen kast. Den game-scoped invite-flyten (`inviteToGameActions.ts`) sender `game.game_mode`; de åpne (game-løse) invitasjonene er uendret.

#### Added
- [`lib/mail/inviteNotification.ts`](lib/mail/inviteNotification.ts) — `gameMode`-param + `resolveModeHint` + hint-callout i HTML/text.

#### Changed
- [`app/admin/games/[id]/inviteToGameActions.ts`](app/admin/games/[id]/inviteToGameActions.ts) — sender `gameMode: game.game_mode`.
- Type B-snapshot utvidet med modus-hint-varianten + ukjent-modus/åpen-invitasjon-grenene.

</details>

### [1.59.4] - 2026-05-31 · #337

> Nå kan du redigere et Round Robin-spill i utkast eller planlagt uten å miste scoring-innstillingen. Tidligere ble handicap-andelen satt tilbake til standard når du lagret på nytt.

<details>
<summary>Teknisk</summary>

Fikser [#337](https://github.com/jdlarssen/golf-app/issues/337) — samme bug-klasse som [#322](https://github.com/jdlarssen/golf-app/issues/322), men round_robin bruker AllowanceField (ikke en setup-seksjon), så det lå utenfor #322s scope. Edit-siden pre-fylte ikke `round_robin_allowance_pct` fra `mode_config.allowance_pct`, og `GameForm` rendret ikke round_robins AllowanceField. Resultat: silent reset til WHS-default (85) ved lagring.

#### Fixed
- [`app/admin/games/[id]/edit/page.tsx`](app/admin/games/[id]/edit/page.tsx) — pre-fyll `round_robin_allowance_pct` fra `mode_config.allowance_pct`.
- [`app/admin/games/new/GameForm.tsx`](app/admin/games/new/GameForm.tsx) — rendrer round_robin AllowanceField (speiler GameWizard) + `hcp_allowance_pct=100` no-op for DB NOT NULL.

</details>

### [1.59.3] - 2026-05-31 · #327

> Florida Scramble dukker ikke lenger opp som valgbart format når du setter opp en cup. Det hører hjemme blant enkeltrunde-formatene, sammen med Texas Scramble og Ambrose, og oppfører seg nå likt som dem.

<details>
<summary>Teknisk</summary>

Fikser [#327](https://github.com/jdlarssen/golf-app/issues/327). `florida_scramble` ble seedet med `formats.is_cup_eligible = true`, mens resten av scramble-/moro-familien (texas_scramble, ambrose, round_robin, acey_deucey) er `false`. `getFormatsForIntent` filtrerer cup-steg 2 på `.eq('is_cup_eligible', true)`, så Florida ble feilaktig tilbudt som cup-format. Korrigert i seed-migrasjonen (fersk DB) + prod-raden satt til `false` via Supabase. Ingen kode-/logikk-endring.

#### Fixed
- [`supabase/migrations/0058_florida_scramble.sql`](supabase/migrations/0058_florida_scramble.sql) — `is_cup_eligible` `true` → `false` i format-seed-en.

</details>

### [1.59.2] - 2026-05-31 · #322

> Nå kan du redigere Wolf-, Nassau-, Skins-, Nines- og Shamble-spill som er i utkast eller planlagt. Tidligere forsvant spilloppsettet (brutto/netto, variant osv.) når du lagret på nytt, og Shamble-spill ga feilmelding ved redigering.

<details>
<summary>Teknisk</summary>

Fikser [#322](https://github.com/jdlarssen/golf-app/issues/322). To gap:

1. `app/admin/games/[id]/edit/page.tsx` bygde `initialValues` uten å inkludere `mode_config`-felt for Wolf/Nassau/Skins/Nines/Shamble. Ny ren helper `buildSetupStepInitialValues(modeConfig: GameModeConfig)` i [`lib/games/setupStepInitialValues.ts`](lib/games/setupStepInitialValues.ts) mapper config-en til de rette `InitialValues`-feltene og returnerer `{}` for alle andre format-typer. Edit-siden spreader resultatet inn i `initialValues`.

2. `GameForm.tsx` rendret ikke `WolfSetup`/`NassauSetup`/`SkinsSetup`/`NinesSetup`/`ShambleSetup` — de lå kun i `GameWizard`. Uten disse seksjonene manglet radio-inputs i FormData → Wolf/Nassau/Skins/Nines silent-resettet til `net`-default; Shamble feilet hardt med `unsupported_mode_size_combo`. Seksjonene er nå lagt inn i `GameForm`s Format-seksjon, conditionally på de samme `state.is*`-flaggene som i `GameWizard`, med samme props og `disabled={lockGameMode}`.

`team_size`-ternary-en i edit-siden er utvidet med shamble-grenen slik at `useGameFormState` mottar riktig lagstørrelse ved Shamble-redigering.

#### Added
- [`lib/games/setupStepInitialValues.ts`](lib/games/setupStepInitialValues.ts) — ren helper, mapper `GameModeConfig` → `Partial<InitialValues>` for de fem setup-formatene.
- [`lib/games/setupStepInitialValues.test.ts`](lib/games/setupStepInitialValues.test.ts) — Type-A test: ett case per format + best_ball/texas_scramble/stableford/acey_deucey → `{}`.

#### Changed
- [`app/admin/games/[id]/edit/page.tsx`](app/admin/games/[id]/edit/page.tsx) — spreader `buildSetupStepInitialValues(game.mode_config)` inn i `initialValues`; shamble lagt til i `team_size`-ternary.
- [`app/admin/games/new/GameForm.tsx`](app/admin/games/new/GameForm.tsx) — rendrer WolfSetup/NassauSetup/SkinsSetup/NinesSetup/ShambleSetup i Format-seksjonen, speilende GameWizard.
- [`app/admin/games/new/GameForm.test.tsx`](app/admin/games/new/GameForm.test.tsx) — nye render-tester: Wolf med gross pre-fylt, Shamble champagne-variant, Nassau net.
- [`app/admin/games/new/useGameFormState.test.ts`](app/admin/games/new/useGameFormState.test.ts) — nye hook-tester: `initialValues`-pre-fyll for alle fem formater bekreftet.

</details>

### [1.59.1] - 2026-05-31 · #331

> Greensome-matcher i en cup teller nå riktig. Tidligere ga de null poeng til vinneren uansett hvordan matchen endte. Nå får laget som vinner sin greensome-match poengene på cup-tabellen, på lik linje med foursomes, fourball og de andre matchformatene.

<details>
<summary>Teknisk</summary>

Fikser [#331](https://github.com/jdlarssen/golf-app/issues/331). `getCupSnapshot` hadde én scoring-gren per cup-matchplay-format (singles/fourball/foursomes/chapman/gruesome) men ingen for `greensome_matchplay` — greensome ble lagt til i match-mode-unionen og side-labelene, men aldri gitt en compute-gren. Resultatet: `result` forble `null`, så `computeCupLeaderboard` ga begge lag 0 poeng uansett vinner. Gapet oppsto fordi de fem grenene var nær-identisk copy-paste, og greensome var kopien som aldri ble laget.

I stedet for en sjette copy-paste-gren ble per-match-scoringen ekstrahert til en ren, tabell-drevet helper `computeCupMatchResult` som dekker alle seks modi via et `{ modus → { compute, sideSize, defaultAllowance } }`-map. Det lukker greensome-gapet, fjerner duplikasjonen som forårsaket det, og gjør seamen Type-A-testbar (`getCupSnapshot` selv er utestet siden den krever Supabase-admin-mocks). Allowance-defaults bevart eksakt: fourball/greensome/chapman 100, foursomes/gruesome 50.

#### Fixed
- [`lib/cup/getCupSnapshot.ts`](lib/cup/getCupSnapshot.ts) — greensome-matcher scores nå (via ny dispatcher); fem inline-grener erstattet med ett helper-kall.

#### Added
- [`lib/cup/computeCupMatchResult.ts`](lib/cup/computeCupMatchResult.ts) — ren, tabell-drevet scoring-dispatcher for cup-matcher (alle seks matchplay-modi).
- [`lib/cup/computeCupMatchResult.test.ts`](lib/cup/computeCupMatchResult.test.ts) — Type-A-test: dispatch per modus, greensome-regresjon, allowance-default 100, tied/ufullført/ukjent-modus → null.

</details>

### [1.59.0] - 2026-05-31 · #291

> Gruesome matchplay er klar. To mot to: begge slår ut, men nå velger motstanderlaget hvilken av ballene deres dere må spille videre med (som regel den verste). Resten av hullet slår dere vekselvis, som i foursomes. Du oppretter et gruesome-spill rett fra «kompis» i wizarden, eller legger det til som cup-match. På kjøpet viser leaderboardet nå ekte matchplay-resultat (3&2, 2 opp og lignende) for hele alternate-shot-familien, så foursomes, greensome og chapman får samme løft.

<details>
<summary>Teknisk</summary>

Gjenbruker foursomes-mønsteret fullt ut: `gruesomeMatchplay.compute()` returnerer `kind: 'foursomes_matchplay'` (ambrose-mønsteret) og delegerer til `computeFoursomesCore(ctx, allowancePct, combinedSideHandicap)` — samme sum-baserte lag-handicap som foursomes, siden motstanderens tee-valg ikke endrer handicapet. Allowance default 50 (WHS foursomes-standard). «Motstander velger din tee shot» er en honor-system-regel uten scoring-impact: appen sporer ikke valget, men forklarer regelen i format-infoen. Ingen tee-starter-felt (begge slår ut hvert hull).

Serien lukker også et hull for hele alternate-shot-familien: foursomes/greensome/chapman/gruesome manglet en individuell-spill matchplay-leaderboard og falt gjennom til best ball-tabellen utenfor cup. Ny delt `FoursomesMatchplayView` + `renderFoursomesMatchplay`, rutet via `isAlternateShotMatchplay`, gir alle fire en ekte match-status pluss per-hull win/loss-grid, med format-navn fra `MODE_LABELS`.

#### Added
- [`lib/scoring/modes/gruesomeMatchplay.ts`](lib/scoring/modes/gruesomeMatchplay.ts) — `compute(ctx)`: delegat til `computeFoursomesCore` med sum-side-handicap. Returnerer `kind: 'foursomes_matchplay'`.
- [`app/games/[id]/leaderboard/FoursomesMatchplayView.tsx`](app/games/[id]/leaderboard/FoursomesMatchplayView.tsx) — delt matchplay-view for hele alternate-shot-familien (match-status + per-hull-grid + side-HCP).
- [`supabase/migrations/0065_gruesome_matchplay.sql`](supabase/migrations/0065_gruesome_matchplay.sql) — seed av format-rad «Gruesome» (cup-eligible) + intent-mapping «kompis» (standalone-synlig) + `tournaments.gruesome_allowance_pct` (default 50). **Appliseres post-deploy.**

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — `renderFoursomesMatchplay` + dispatch via `isAlternateShotMatchplay` (foursomes/greensome/chapman/gruesome).
- `lib/scoring/modes/types.ts` — `gruesome_matchplay` i `GameMode`-union, `MODE_LABELS` («Gruesome»), `GameModeConfig`-variant; `isAlternateShotMatchplay` utvidet.
- `lib/scoring/index.ts` — compute-router-case + eksport av `isAlternateShotMatchplay`.
- `lib/games/gamePayload.ts` — `validateGruesomeMatchplay` + `parseGruesomeAllowancePct` (default 50) + `parseGameMode` + `modeValidators`.
- `lib/games/scorecardLayout.ts` + `scorecardTitle.ts` + `allowanceCopy.ts`, `lib/formats/modeGuide.ts` + `icons.tsx`, `app/spillformer/page.tsx` — gruesome gjennom alternate-shot-grenen + format-oppføringer.
- `lib/cup/computeCupLeaderboard.ts` + `lib/cup/getCupSnapshot.ts` — `gruesome_matchplay` i type-unions + compute-gren.
- `app/admin/cup/[id]/page.tsx` + `app/cup/[id]/page.tsx` — «+ Gruesome match»-knapp + lag-navn i result-tekst.
- `app/admin/games/new/page.tsx` + `GameForm.tsx` + `GameWizard.tsx` + `useGameFormState.ts` + `TeamSizeSelector.tsx` + `sections/ReadyStep.tsx` — gruesome-state, `AllowanceField`, `CupGameMode`/`loadCupContext`/`buildCupInitialValues`, standalone lag-tildeling.
- `app/games/[id]/holes/[holeNumber]/page.tsx` + `app/games/[id]/page.tsx` — `isGruesome`-flag + sum lag-handicap + union.
- `lib/database.types.ts` — `tournaments.gruesome_allowance_pct`.

#### Tests
- Type A: `gruesomeMatchplay.test.ts` — sum vs 60/40-differensiering, kind, brutto, defensiv fallback.
- Type A: `gamePayload.test.ts` — gruesome-validator-blokk (kind, allowance-grenser, 2v2-balanse, draft-default 50).
- Type C: `FoursomesMatchplayView.test.tsx` — render-kontrakt for delt familie-view (status, sider, hull-grid, format-label).

</details>
</details>


<details>
<summary><strong>1.58.y — Chapman matchplay (2v2 dobbel tee + bytt + alternate, cup-klar) (1 oppføring)</strong></summary>

Issue [#290](https://github.com/jdlarssen/golf-app/issues/290), del av Ryder Cup-epic [#47](https://github.com/jdlarssen/golf-app/issues/47) og format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Cup-format der begge i paret slår ut, bytter ball og slår partnerens utslag, velger den beste ballen og spiller alternate derfra. Også kjent som Pinehurst — research bekreftet at det er samme spill, så vi seeder ett format «Chapman» (ikke to).

### [1.58.0] - 2026-05-31 · #290

> Chapman matchplay er klar for cupen, også kjent som Pinehurst. To mot to: begge slår ut, så slår dere partnerens ball som andreslag, velger den beste og spiller annenhver inn derfra. Lag-handicapet regnes etter Chapman-formelen (60 % av laveste pluss 40 % av høyeste handicap), og matchplay gir høyeste lag hele differansen som standard. Opprett en chapman-match fra cup-siden. På hvert hull minner appen dere på fasene, og scorekort, leaderboard og cup-poeng fungerer akkurat som for foursomes og greensome.

<details>
<summary>Teknisk</summary>

Gjenbruker foursomes-mønsteret fullt ut: `chapmanMatchplay.compute()` returnerer `kind: 'foursomes_matchplay'` (ambrose-mønsteret) slik at leaderboard, scorekort, mail og cup-snapshot deles uten nye komponenter. Scoring er identisk med greensome (samme 60/40-lag-handicap og diff-baserte matchplay-allowance, default 100) — Chapman og Greensome skiller seg bare i on-course-mekanikk (Chapman bytter ball før paret velger). Motoren deler en parameterisert kjerne: `computeFoursomesCore(ctx, allowancePct, sideHcp)` i `foursomesMatchplay.ts`, der `chapmanSideHandicap` gir 60/40. Family-helper `isAlternateShotMatchplay(mode)` ruter struktursjekker for alle tre (foursomes + greensome + chapman); tee-starter-banneret forblir foursomes-eksklusivt (Chapman har dobbel tee hvert hull). Eneste Chapman-spesifikke UI er en statisk fase-stripe på hull-siden.

#### Added
- [`lib/scoring/modes/chapmanMatchplay.ts`](lib/scoring/modes/chapmanMatchplay.ts) — `compute(ctx)`: delegerer til `computeFoursomesCore` med 60/40-side-handicap. Returnerer `kind: 'foursomes_matchplay'`.
- [`supabase/migrations/0064_chapman_matchplay.sql`](supabase/migrations/0064_chapman_matchplay.sql) — seed av format-rad «Chapman» (cup-eligible) + `tournaments.chapman_allowance_pct` (default 100). **Appliseres post-deploy.**
- [`app/games/[id]/holes/[holeNumber]/ChapmanPhaseReminder.tsx`](app/games/[id]/holes/[holeNumber]/ChapmanPhaseReminder.tsx) — statisk fase-stripe (begge slår ut → bytt → velg → annenhver) på hver hull-side.

#### Changed
- `lib/scoring/modes/foursomesMatchplay.ts` — ekstrahert `computeFoursomesCore` + `SideHandicapFn` (`combinedSideHandicap` / `chapmanSideHandicap`) uten oppførselsendring for foursomes.
- `lib/scoring/modes/types.ts` — `chapman_matchplay` i `GameMode`-union, `MODE_LABELS` («Chapman»), `GameModeConfig`-variant; `isAlternateShotMatchplay` utvidet til chapman.
- `lib/scoring/index.ts` — compute-router-case for `chapman_matchplay`.
- `lib/games/gamePayload.ts` — `validateChapmanMatchplay` + `parseChapmanAllowancePct` + `parseGameMode` + `modeValidators`.
- `lib/games/scorecardLayout.ts` + `scorecardTitle.ts` + `allowanceCopy.ts` — chapman gjennom alternate-shot-grenen (60/40) + «Match-scorekort».
- `lib/cup/computeCupLeaderboard.ts` + `lib/cup/getCupSnapshot.ts` — `chapman_matchplay` i type-unions + egen compute-gren i cup-snapshot.
- `app/admin/cup/[id]/page.tsx` + `app/cup/[id]/page.tsx` — «+ Chapman match»-knapp + lag-navn i result-tekst.
- `app/admin/games/new/page.tsx` + `GameForm.tsx` + `useGameFormState.ts` — `chapmanAllowancePct`-state, `AllowanceField`-blokk, hidden input, `CupGameMode`/`loadCupContext`/`buildCupInitialValues`.
- `app/admin/games/new/TeamSizeSelector.tsx`, `sections/ReadyStep.tsx`, `lib/formats/modeGuide.ts`, `lib/formats/icons.tsx` — `chapman_matchplay`-oppføringer.
- `app/games/[id]/holes/[holeNumber]/page.tsx` — `isChapman`-flag + 60/40 lag-handicap for score-inntasting + fase-stripe.
- `app/games/[id]/page.tsx` — `chapman_matchplay` i `GameRow.game_mode`-union.

#### Tests
- Type A: `chapmanMatchplay.test.ts` — 13 tester (60/40-formel, kind, brutto, config-fallback, empty-shell).
- Type A: `gamePayload.test.ts` — chapman-validator-blokk (kind, allowance-grenser, 2v2-balanse, draft-default 100).
- Type C: `ChapmanPhaseReminder.test.tsx` — fase-stripa rendres.

</details>
</details>


<details>
<summary><strong>1.57.y — Greensome matchplay (2v2 velg-beste-tee + alternate) (1 oppføring)</strong></summary>

Issue [#289](https://github.com/jdlarssen/golf-app/issues/289), del av Ryder Cup-epic [#47](https://github.com/jdlarssen/golf-app/issues/47) og format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Cup-format der begge i paret slår ut, paret velger det beste utslaget, og spiller alternate derfra mot motstander-paret.

### [1.57.0] - 2026-05-31 · #289

> Greensome matchplay er klar for cupen. Begge i paret slår ut, dere velger det beste utslaget, og spiller annethvert slag derfra mot motstanderlaget. Lag-handicap regnes etter WHS-greensome-formelen (60/40-blanding av de to spillernes handicap), og matchplay-allowance er 100 % av differansen som standard. Opprett en greensome-match fra cup-siden — scorekort, leaderboard og cup-poengtelling fungerer som for foursomes og fourball.

<details>
<summary>Teknisk</summary>

Gjenbruker foursomes-mønsteret fullt ut: `greensomeMatchplay.compute()` returnerer `kind: 'foursomes_matchplay'` (ambrose-mønsteret) slik at leaderboard-visning, scorekort og cup-snapshot gjenbrukes uten nye komponenter. Eneste reelle forskjell fra foursomes i scoring-laget er lag-handicap-formelen: `round(0.6 × laveste + 0.4 × høyeste)` i stedet for sum. Family-helper `isAlternateShotMatchplay(mode)` ruter struktursjekker; tee-starter-banneret forblir foursomes-eksklusivt (greensome har ingen fast tee-rotasjon).

#### Added
- [`lib/scoring/modes/greensomeMatchplay.ts`](lib/scoring/modes/greensomeMatchplay.ts) — `compute(ctx)`: WHS-greensome lag-handicap + diff-basert matchplay. Returnerer `kind: 'foursomes_matchplay'`.
- [`supabase/migrations/0063_greensome_matchplay.sql`](supabase/migrations/0063_greensome_matchplay.sql) — seed av format-rad «Greensome matchplay» (cup-eligible) + `tournaments.greensome_allowance_pct` (default 100).
- `isAlternateShotMatchplay(mode)` i `lib/scoring/modes/types.ts` — family-helper for alternate-shot-familien (foursomes + greensome).

#### Changed
- `lib/scoring/modes/types.ts` — `greensome_matchplay` i `GameMode`-union, `MODE_LABELS`, `GameModeConfig`-variant.
- `lib/scoring/index.ts` — compute-router-case for `greensome_matchplay`.
- `lib/games/gamePayload.ts` — `validateGreensomeMatchplay` + `parseGreensomeAllowancePct` + `parseGameMode` + `modeValidators`.
- `lib/games/scorecardLayout.ts` — `greensome_matchplay` treffer Layout B-grenen med 60/40-blanding for lag-HCP.
- `lib/games/allowanceCopy.ts` — `greensome_matchplay` i switch-case.
- `lib/cup/computeCupLeaderboard.ts` + `lib/cup/getCupSnapshot.ts` — `greensome_matchplay` i type-unions og gameMode-mapping.
- `app/admin/cup/[id]/page.tsx` — «+ Greensome match»-knapp + `greensome_matchplay` i result-tekst-sjekk.
- `app/cup/[id]/page.tsx` — `greensome_matchplay` i result-tekst-sjekk.
- `app/admin/games/new/page.tsx` — `greensome_matchplay` i `CupGameMode`, `parseCupGameMode`, `loadCupContext` (leser `greensome_allowance_pct`), `buildCupInitialValues`.
- `app/admin/games/new/GameWizard.tsx` + `GameForm.tsx` + `useGameFormState.ts` — `greensomeAllowancePct`-state, `AllowanceField`-blokk og hidden input.
- `app/admin/games/new/TeamSizeSelector.tsx`, `sections/ReadyStep.tsx`, `lib/formats/modeGuide.ts` — `greensome_matchplay`-oppføringer i exhaustive maps.
- `app/games/[id]/holes/[holeNumber]/page.tsx` — `isGreensome`-flag + 60/40 lag-handicap for score-inntasting.
- `lib/formats/icons.tsx` — `foursomes_matchplay` + `greensome_matchplay` i ICON_MAP.
- `app/spillformer/page.tsx` — `greensome_matchplay` i format-katalogen.
- `app/games/[id]/page.tsx` — `greensome_matchplay` i `GameRow.game_mode`-union.

#### Tests
- Type A: `greensomeMatchplay.test.ts` — 18 tester (greensomeTeamHandicap, compute happy path, empty-shell, mat-em, AS, fraksjonell blanding, allowance 0 %, lek-min kaptein).

</details>
</details>


<details>
<summary><strong>1.56.y — Patsome (tre lagformer i én runde) (1 oppføring)</strong></summary>

Issue [#286](https://github.com/jdlarssen/golf-app/issues/286), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Det første rotasjonsformatet: 18 hull delt i tre seks-hulls-deler med hver sin lagform (4BBB, greensome og foursomes), scoret i én felles stableford-pott.

### [1.56.0] - 2026-05-31 · #286

> Ny spillform for klubbturneringen: Patsome, for lag på to. Runden er delt i tre: de første seks hullene spiller dere 4BBB (begge spiller sin egen ball, beste resultat teller), de neste seks greensome (begge slår ut, dere velger det beste utslaget, så annenhvert slag), og de siste seks foursomes (én ball, annenhvert slag fra tee). Appen sier hvilken form dere er i på hvert hull, summerer stableford-poeng fra alle tre delene, og kårer laget med flest poeng. Velg netto eller brutto når dere setter opp spillet.

<details>
<summary>Teknisk</summary>

Selvstendig orchestrator i stedet for å bygge på separate greensome-/foursomes-strokeplay-moduler: `patsome.compute()` regner stableford-poeng per lag per hull direkte og bytter lag-poeng-regel etter segment. Felles valuta (stableford-poeng) forener 2-ball-segmentet (4BBB, MAX av partnernes poeng) og 1-ball-segmentene (greensome/foursomes, kaptein-eid lagball). Netto bruker WHS-allowance per segment: full CH i 4BBB, 60/40 i greensome, 50 % av summen i foursomes.

#### Added
- [`lib/scoring/modes/patsome.ts`](lib/scoring/modes/patsome.ts) — `compute(ctx)`: 6/6/6-orchestrator, segment-delsummer, ranking via `rankTeams`. 36 Type A-tester.
- [`supabase/migrations/0061_patsome.sql`](supabase/migrations/0061_patsome.sql) — seed av format-rad «Patsome» (Klubb, sekundær) + ny tabell `patsome_tee_starters` (tee-starter per lag for foursomes-segmentet) med RLS.
- `PatsomeSetup.tsx` — netto/brutto-velger i wizarden.
- `PatsomeView.tsx` + `PatsomePodium.tsx` — lag-leaderboard med delsum per segment + podium.
- `PatsomeSegmentBanner.tsx` + `PatsomeTeeStarterBanner.tsx` (m/ `PatsomeTeeHint`) — segment-banner per hull + tee-starter-velger/-hint i foursomes-segmentet.
- [`app/games/[id]/patsomeActions.ts`](app/games/[id]/patsomeActions.ts) — `setPatsomeTeeStarter` (authz + upsert).

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `patsome`-modus i `GameMode`, `GameModeConfig` (`patsome_scoring`), `ModeResult`, compute-routeren og `MODE_LABELS`.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validatePatsome` (lag à 2, 2+ lag) + `parseGameMode` + regresjonstester.
- `app/games/[id]/holes/[holeNumber]/page.tsx` — hybrid score-inntasting: per spiller hull 1–6, kaptein-eid lagball hull 7–18, segment-banner + tee-starter-slots.
- `useGameFormState.ts` + `GameWizard.tsx` + `TeamSizeSelector.tsx` + `lib/games/registration.ts` — Patsome som lagformat i wizarden.
- `lib/games/scorecardLayout.ts`, `lib/games/allowanceCopy.ts`, `lib/formats/modeGuide.ts`, `lib/formats/icons.tsx`, leaderboard- og game-`page.tsx` — scorekort-layout, hjelpetekst, spiller-forklaring, ikon og mirror-unions.

#### Tests
- Type A: `patsome.test.ts` (36) + patsome-cases i `gamePayload.test.ts`. Type C: `PatsomeView.test.tsx`, `PatsomeSetup.test.tsx`. Authz: `patsomeActions.test.ts`.

</details>
</details>


---


<details>
<summary><strong>1.55.y — Shamble / Champagne Scramble (best N av M) (1 oppføring)</strong></summary>

Issue [#285](https://github.com/jdlarssen/golf-app/issues/285), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Det første ekte lag-formatet i familien: alle slår ut, laget velger det beste utslaget, og så spiller hver spiller sin egen ball inn. De laveste scorene per hull teller for laget.

### [1.55.0] - 2026-05-31 · #285

> Ny lagform for klubbturneringen: Shamble, med festvarianten Champagne Scramble. Alle slår ut, laget tar det beste utslaget, og så spiller hver spiller sin egen ball inn. De laveste scorene på hvert hull legges sammen for laget. I Shamble teller de to beste; i Champagne Scramble velger du selv om én, to eller tre skal telle. Lag på tre eller fire, netto eller brutto, lavest sammenlagt vinner.

<details>
<summary>Teknisk</summary>

Generalisering av best ball («best 1 av M») til «best N av M». Strokeplay-utledet: hver spiller eier sin egen score-rad som i best ball og nines, så ingen captain-rad eller ny tabell. Lag-struktur og validator speiler texas_scramble (team_size + balanse-sjekk ved publish), men uten lag-handicap — hver spiller bruker full course handicap netto. Et hull står pending til minst N på laget har tastet.

#### Added
- [`lib/scoring/modes/shamble.ts`](lib/scoring/modes/shamble.ts) — `compute(ctx)`: lagets hull-score = sum av de N laveste effective-scorene (N = 1/2/3, klampet til lagstørrelse), pending uten carryover, lag-ranking via `rankTeams`-cascaden (lavest total vinner). 19 Type A-tester.
- [`supabase/migrations/0060_shamble.sql`](supabase/migrations/0060_shamble.sql) — seed av format-rad «Shamble / Champagne Scramble» + intent-mapping (sekundær under Klubb). Ingen ny tabell.
- `ShambleSetup.tsx` — lagstørrelse (3/4), variant (Shamble / Champagne Scramble), antall-velger for Champagne, netto/brutto i wizarden.
- `ShambleView.tsx` + `ShamblePodium.tsx` — lag-leaderboard med per-hull-rutenett (markerer hvem som telte) + podium for avsluttet spill.

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `shamble`-modus i `GameMode`, `GameModeConfig` (`shamble_variant` + `shamble_count` + `shamble_scoring`), `ModeResult` og compute-routeren, samt `MODE_LABELS`.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateShamble` (lag à 3/4, balanse, variant/count/scoring) + `parseGameMode`-støtte + regresjonstester.
- `lib/games/allowanceCopy.ts`, `lib/games/formatLabel.ts`, `lib/formats/modeGuide.ts`, `lib/formats/icons.tsx` — brutto-hjelpetekst, variant-bevisst flate-navn (Shamble / Champagne Scramble), spiller-forklaring, format-ikon.
- `app/admin/games/new/*` — `TeamSize` utvidet til 1|2|3|4, `isShamble` wiret gjennom `useGameFormState` (validering + lag-tildeling à 3 eller 4), `ShambleSetup`-render + skjulte form-felt.
- `app/games/[id]/page.tsx` — `shamble` i GameRow-union; leaderboard-`page.tsx` — `renderShamble`-routing.

#### Tests
- Type A: `shamble.test.ts` (19) + 7 shamble-cases i `gamePayload.test.ts`. Type C: `ShambleView.test.tsx` + `ShambleSetup.test.tsx`.

</details>
</details>


---


<details>
<summary><strong>1.54.y — Florida Scramble (Texas-variant med step-aside) (2 oppføringer)</strong></summary>

Issue [#283](https://github.com/jdlarssen/golf-app/issues/283), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Texas scramble med én ekstra regel: den som slo det valgte slaget, står over neste slag. Lag à 3 eller 4. NGF-standard lag-handicap (15 % for tremannslag, 10 % for firmannslag).

### [1.54.1] - 2026-05-30 · #217

> Fourball matchplay har fått en ryddigere norsk beskrivelse i oppsettet, i samme stil som de andre spillformene. Selve formatet spilles akkurat som før.

<details>
<summary>Teknisk</summary>

Fourball matchplay (scoring, validator, leaderboard-view, scorekort) ble levert komplett i [#217](https://github.com/jdlarssen/golf-app/issues/217) før format-katalogen i [#270](https://github.com/jdlarssen/golf-app/issues/270) satte sine konvensjoner. Eneste reelle avvik fra de nyere format-radene var den engelsk-pregede katalog-beskrivelsen. Denne patchen retter kun den.

#### Changed
- [`supabase/migrations/0059_fourball_description_norwegian.sql`](supabase/migrations/0059_fourball_description_norwegian.sql) — `update` av `formats.short_description` for `fourball_matchplay`: fra «2v2 best-ball matchplay. Hvert lag har to spillere.» til «2 mot 2, hull for hull. Alle spiller egen ball, lagets beste score teller per hull.», på linje med norsk-først-beskrivelsene de nyere formatene (#274–#284) fikk. Kun admin-synlig (FormatGrid-tooltip i oppsettet), ingen skjema-endring. Del av #288 (format-epic #270).

</details>

### [1.54.0] - 2026-05-30 · #283

> Ny spillform: Florida Scramble. Laget spiller én ball som Texas — alle slår, dere velger beste slag, og alle slår videre derfra. Det lille ekstra: den som slo det valgte slaget, står over neste slag. Slik må hele laget bidra gjennom hullet. Appen minner laget om regelen på hvert hull. Sett opp lag på tre eller fire, og appen beregner lag-handicap etter NGF-standarden.

<details>
<summary>Teknisk</summary>

Florida Scramble gjenbruker Texas scramble-motoren fullstendig. `floridaScramble.compute()` returnerer `kind: 'texas_scramble'`, så leaderboard, podium, scorekort, mail og hull-side rendres uendret via `isScrambleFamily`. Eneste UI-tillegg er en step-aside-påminnelse i `HoleClient.tsx` (synlig kun for `florida_scramble`, ikke Texas/Ambrose, `data-testid="florida-step-aside-reminder"`). Default lag-handicap: NGF-fasttabell — 15 % for tremannslag, 10 % for firmannslag.

#### Added
- [`lib/scoring/modes/floridaScramble.ts`](lib/scoring/modes/floridaScramble.ts) — `compute(ctx)` delegerer til `computeScramble`-kjernen; `defaultFloridaHandicapPct` gir 15 % (3-mannslag) / 10 % (4-mannslag). 5 Type A-tester.
- [`supabase/migrations/0058_florida_scramble.sql`](supabase/migrations/0058_florida_scramble.sql) — seed av format-rad «Florida Scramble» + intent-mapping (sekundær under Klubb, sort_order 37). Ingen ny tabell.

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `florida_scramble`-modus i `GameMode`, `GameModeConfig` (team_size: 3|4) og `MODE_LABELS`; `isScrambleFamily` utvides med florida.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateFloridaScramble` (lag à 3/4; 2-mannslag → `unsupported_mode_size_combo`) + `parseGameMode`-støtte + 6 regresjonstester.
- Wizard (`ModeSelector`, `TeamSizeSelector`, `GameForm`, `GameWizard`, `useGameFormState`, sections) — Florida-tile, tremannstile, `floridaHandicapPct`-state, lag-handicap-felt med NGF-default per lagstørrelse.
- Leaderboard, hull-side, scorekort, game-home, admin-detaljside, mail og spillformer rutes via `isScrambleFamily`; step-aside-påminnelse i `HoleClient.tsx` er florida-eksklusiv.
- `lib/formats/icons.tsx`, `lib/formats/modeGuide.ts`, `app/spillformer/page.tsx` — format-ikon (gjenbruker Texas), spiller-forklaring med step-aside-punkt, oppdagbarhet.

#### Tests
- Type A: `floridaScramble.test.ts` (5) + 6 florida-cases i `gamePayload.test.ts`. Ingen ny Type C — gjenbruker Texas-viewet (per test-disiplin).

</details>
</details>


<details>
<summary><strong>1.53.y — Ambrose (net scramble med lag-handicap) (1 oppføring)</strong></summary>

Issue [#284](https://github.com/jdlarssen/golf-app/issues/284), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Enda en lagscramble, denne gangen den australske Ambrose-varianten — mekanisk lik Texas scramble, men med den klassiske Ambrose-regnemåten for lag-handicap. Primært for klubbturneringer.

### [1.53.0] - 2026-05-30 · #284

> Ny spillform for klubbturneringen: Ambrose. Hele laget spiller én ball: alle slår, dere plukker det beste slaget, og alle slår videre derfra til ballen er i hull. Laget får ett felles handicap som jevner ut forskjellene mellom sterke og svake lag, etter den klassiske Ambrose-regnemåten. Sett opp lag på 2 eller 4, så regner appen ut lag-handicapet og kårer laget med lavest lagtotal.

<details>
<summary>Teknisk</summary>

Ambrose er mekanisk identisk med Texas scramble (én ball per lag, kapteinen eier scores-radene, lavest lag-netto vinner). `ambrose.compute()` returnerer `kind: 'texas_scramble'`, så hele leaderboard-, podium-, scorekort- og mail-visningen gjenbrukes uendret — samme mønster som modifisert Stableford → Stableford. Eneste reelle forskjell er default-lag-handicapet: standard Ambrose-formel (summen av spillernes handicap ÷ 2×lagstørrelse → 25 % for 2-mannslag, 12,5 % for 4-mannslag, justerbar) i stedet for Texas' NGF-konvensjon.

#### Added
- [`lib/scoring/modes/ambrose.ts`](lib/scoring/modes/ambrose.ts) — `compute(ctx)` delegerer til den ekstraherte `computeScramble`-kjernen; `ambroseDefaultPct` gir 25 % (2-mannslag) / 12,5 % (4-mannslag). 7 Type A-tester.
- [`supabase/migrations/0057_ambrose.sql`](supabase/migrations/0057_ambrose.sql) — seed av format-rad «Ambrose» + intent-mapping (sekundær under Klubb). Ingen ny tabell.

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `ambrose`-modus i `GameMode`, `GameModeConfig` og `MODE_LABELS`, ny `isScrambleFamily`-helper; `texasScramble.ts` ekstraherer den delte `computeScramble`-kjernen.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateAmbrose` (lag à 2/4, fraksjonell handicap-prosent tillatt) + `parseGameMode`-støtte + 6 regresjonstester.
- Wizard (`ModeSelector`, `GameForm`, `GameWizard`, `useGameFormState`, sections) — Ambrose-tile + lag-handicap-felt med Ambrose-default per lagstørrelse.
- Leaderboard, hull-side, scorekort, game-home, admin-detaljside og mail rutes via `isScrambleFamily`; Texas-viewet og -podiet tar nå et `formatLabel`-prop så Ambrose vises med riktig format-navn.
- `lib/formats/icons.tsx`, `lib/formats/modeGuide.ts`, `app/spillformer/page.tsx` — format-ikon, spiller-forklaring og oppdagbarhet.

#### Tests
- Type A: `ambrose.test.ts` (7) + 6 ambrose-cases i `gamePayload.test.ts`. Ingen ny Type C — Ambrose gjenbruker Texas-viewet, så en egen render-test ville duplisert #44s dekning (per test-disiplin).

</details>
</details>


---


<details>
<summary><strong>1.52.y — Acey Deucey (lavest tar, høyest gir) (1 oppføring)</strong></summary>

Issue [#279](https://github.com/jdlarssen/golf-app/issues/279), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). En klassisk kompisrunde for nøyaktig fire spillere: hvert hull deler ut poeng etter hvem som spilte best og dårligst. Poengene regnes rett fra slagene, så det er ingen ekstra registrering.

### [1.52.0] - 2026-05-30 · #279

> Du kan nå spille Acey Deucey: på hvert hull tar den med lavest score tre poeng, og den med høyest score gir tre fra seg. De to i midten står i ro. Deler flere den laveste eller høyeste scoren, gir den siden ingen poeng det hullet. Du velger brutto eller netto med handikap når du setter opp spillet, og totalen kan godt havne under null. Krever fire spillere.

<details>
<summary>Teknisk</summary>

Rent slag-derivert format. I motsetning til Bingo Bango Bongo trengs ingen ny tabell, scorekort-seksjon eller server-action: poengene regnes fra `scores` på samme måte som Skins sammenligner hull for hull, og brutto/netto styres av en bryter i oppsettet (speiler Skins/Wolf/Nassau).

#### Added
- [`supabase/migrations/0056_acey_deucey.sql`](supabase/migrations/0056_acey_deucey.sql) — seeder format-rad + intent-mapping (sekundær under Kompis, sort_order 95). Ingen ny tabell.
- [`lib/scoring/modes/aceyDeucey.ts`](lib/scoring/modes/aceyDeucey.ts) — `compute(ctx)`: per hull gir unik lavest +3 og unik høyest −3, delt voider siden, uferdige hull deler ikke ut. Brutto/netto via `acey_deucey_scoring`, løpende total kan bli negativ. 16 Type A-tester.
- `AceyDeuceyView.tsx` + `AceyDeuceyPodium.tsx` — løpende totaler med fortegn + per-hull-tabell (ace/deuce per hull, «Delt»/«Venter») + podium for avsluttet spill.
- `AceyDeuceySetup.tsx` — brutto/netto-bryter i wizardens steg 2 (default netto).

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `acey_deucey`-modus i `GameMode`, `GameModeConfig`, `ModeResult` og compute-routeren, samt alle `Record<GameMode,…>`-maps (`MODE_LABELS`, `modeValidators`, `bruttoHelperFor`, `MODE_GUIDE`, `MODE_SUMMARY_LABELS`, `ENABLED_COMBOS`).
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateAceyDeucey` (nøyaktig 4 spillere, individuell, brutto/netto).
- leaderboard-`page.tsx` + wizard (`GameWizard.tsx`, `useGameFormState.ts`) — leaderboard-routing og oppsett-steg.

#### Tests
- Type A: `aceyDeucey.test.ts` (16) + player-count-grenser i `gamePayload.test.ts`. Type C: `AceyDeuceyView.test.tsx` + `AceyDeuceySetup.test.tsx`.

</details>
</details>


---


<details>
<summary><strong>1.51.y — Round Robin (roterende partnere) (1 oppføring)</strong></summary>

Issue [#280](https://github.com/jdlarssen/golf-app/issues/280), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Firespillers-format der partner-konstellasjonen bytter hvert sjette hull — alle spiller med og mot hverandre. Valgbart under Kompis i opprett-spill-wizarden.

### [1.51.0] - 2026-05-30 · #280

> Du kan nå opprette et Round Robin-spill for fire kompiser. Partnerne bytter hvert sjette hull: hull 1–6 spiller du med én, hull 7–12 med en annen og hull 13–18 med den siste. Slik har alle spilt med og mot hverandre når runden er ferdig. Appen regner best netto per side hvert hull, og den med flest hullseire totalt vinner. Du finner spillformen under Kompis i opprett-spill-wizarden.

<details>
<summary>Teknisk</summary>

Round Robin gjenbruker fourball matchplay-motorens per-hull-beregning (`applyAllowance` + `bestBallForHole` + `classifyMatchplayHole`) og handicap-modell (allowance_pct, 85 % WHS-standard). Scoring-modulen er en tynn rotasjons- og aggregeringswrapper — ingen ny tabell (rotasjonen er ren deterministisk funksjon av spillerslot + hull).

#### Added
- [`supabase/migrations/0055_round_robin.sql`](supabase/migrations/0055_round_robin.sql) — seed av format-rad + intent-mapping (sekundær under Kompis, sort_order=100).
- `app/admin/games/new/sections/RoundRobinSetup.tsx` — wizard-step som viser fire spillerslotter (A/B/C/D) med rotasjonsforklaring. Ingen shuffle-knapp (alle permutasjoner gir identiske totaler). Type C-render-test.

#### Changed
- `app/admin/games/new/useGameFormState.ts` — `isRoundRobin`-flag, `roundRobinAllowancePct`-state (default 85), `roundRobinOrder` (deterministisk valgrekkefølge), `roundRobinPlayersValid` (krever nøyaktig 4 spillere), `canPublish` + `missingForPublish` wired for Round Robin.
- `app/admin/games/new/GameWizard.tsx` — renderer `RoundRobinSetup` og `AllowanceField` for `round_robin_allowance_pct`, skjuler generisk `TeamSizeSelector` for Round Robin. Hidden input for allowance-prosenten i FormData.
- `app/admin/games/new/GameForm.tsx` — `round_robin_allowance_pct?: number` lagt til `InitialValues`.
- `app/admin/games/new/useGameFormState.ts` — `defaultTeamSizeForMode` returnerer 1 for `round_robin`.

#### Tests
- Type C: `RoundRobinSetup.test.tsx` (2) — slots med spillerlabels, placeholder-rader ved <4 spillere.

</details>
</details>


---


<details>
<summary><strong>1.50.y — Nines / Split Sixes (poeng per hull for tre) (1 oppføring)</strong></summary>

Issue [#278](https://github.com/jdlarssen/golf-app/issues/278), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Enda et kompis-format der poengene kommer fra hvor godt du spiller hvert hull, ikke fra sluttsummen. For nøyaktig tre spillere, med to varianter: Nines og Split Sixes.

### [1.50.0] - 2026-05-30 · #278

> Ny spillform for kompisrunden: Nines / Split Sixes, for nøyaktig tre spillere. Hvert hull deler ut en pott etter hvem som spilte det best. I Nines er det ni poeng å fordele (fem til lavest, tre til nest, ett til høyest), i Split Sixes seks (fire, to, null). Spiller dere likt på et hull, deler dere poengene likt. Du taster slag som vanlig, velger netto eller brutto, og appen kårer den med flest poeng sammenlagt.

<details>
<summary>Teknisk</summary>

Bygget på Skins-mønstret: poengene utledes fra det vanlige strokeplay-scorekortet, så ingen egen input-tabell eller registreringssteg. Hvert hull er uavhengig (ingen carryover som i Skins). Mangler en spiller score på et hull, står hullet pending til alle tre har tastet, mens senere hull avgjøres normalt.

#### Added
- [`lib/scoring/modes/nines.ts`](lib/scoring/modes/nines.ts) — `compute(ctx)`: pott per hull (Nines 5–3–1, Split Sixes 4–2–0) fordelt på effective-score-rangering, likt-deles-likt ved tie, pending-hull uten carryover. 22 Type A-tester.
- [`supabase/migrations/0054_nines.sql`](supabase/migrations/0054_nines.sql) — seed av format-rad «Nines / Split Sixes» + intent-mapping (sekundær under Kompis). Ingen ny tabell.
- `NinesSetup.tsx` — variant-velger (Nines / Split Sixes) + netto/brutto-velger i wizarden.
- `NinesView.tsx` + `NinesPodium.tsx` — poeng-tabell med per-hull-fordeling + podium for avsluttet spill.

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `nines`-modus i `GameMode`, `GameModeConfig` (`nines_variant` + `nines_scoring`), `ModeResult` og compute-routeren, samt `MODE_LABELS`.
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateNines` (nøyaktig 3 spillere, individuell) + `parseGameMode`-støtte + regresjonstester.
- `lib/games/allowanceCopy.ts`, `lib/formats/modeGuide.ts`, `lib/formats/icons.tsx`, hull-`page.tsx`, leaderboard-`page.tsx` — brutto-hjelpetekst, spiller-forklaring, format-ikon, GameRow-union og leaderboard-routing.

#### Tests
- Type A: `nines.test.ts` (22) + 6 nines-cases i `gamePayload.test.ts`. Type C: `NinesView.test.tsx` + `NinesSetup.test.tsx`.

</details>
</details>


---


<details>
<summary><strong>1.49.y — Bingo Bango Bongo (tre poeng per hull) (1 oppføring)</strong></summary>

Issue [#277](https://github.com/jdlarssen/golf-app/issues/277), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Den første spillformen der poengene ikke kommer fra slag, men fra tre prestasjoner per hull. Sosial kompisrunde for 2–4 spillere.

### [1.49.0] - 2026-05-29 · #277

> Ny spillform for kompisrunden: Bingo Bango Bongo, for 2 til 4 spillere. Hvert hull gir tre poeng å kjempe om: bingo til den som først er på green, bango til den som ligger nærmest når alle er på green, og bongo til den som først er i hull. Du taster slag som før og krysser av de tre vinnerne per hull. Hvem som helst i flighten kan registrere, og leaderboardet kårer den med flest poeng sammenlagt.

<details>
<summary>Teknisk</summary>

Bygget på Wolf-mønstret for kategorisk per-hull-input: poengene er rene prestasjons-poeng og utledes ikke fra slag. Det vanlige scorekortet står urørt — de tre velgerne legges på som et ekstra lag per hull. CTP/LD-sideturnering fungerer derfor fortsatt ut av boksen.

#### Added
- [`supabase/migrations/0053_bingo_bango_bongo.sql`](supabase/migrations/0053_bingo_bango_bongo.sql) — tabell `bingo_bango_bongo_holes` (bingo/bango/bongo-user-id per hull, alle nullable), delt lese/skrive-RLS for alle spillere i spillet + admin, og seed av format-rad + intent-mapping (sekundær under Kompis).
- [`lib/scoring/modes/bingoBangoBongo.ts`](lib/scoring/modes/bingoBangoBongo.ts) — `compute(ctx)`: 1 poeng per kategori per hull, aggregert per spiller (bingos/bangos/bongos/sum), rangert på sum med bingos→bongos som tiebreak. 20 Type A-tester.
- `lib/bbb/` — `getBingoBangoBongoHoles` (tag-cachet), `setBingoBangoBongoHole` (`'use server'`, låser når spillet er avsluttet), `subscribeBingoBangoBongo` (realtime).
- `BingoBangoBongoEntry.tsx` — tre chip-rader (bingo/bango/bongo) med «Ingen»-valg, delt registrering, optimistisk lagring, integrert under det vanlige scorekortet.
- `BingoBangoBongoView.tsx` + `BingoBangoBongoPodium.tsx` — per-spiller-tabell (Bingo/Bango/Bongo/Sum) + podium for avsluttet spill.

#### Changed
- `lib/scoring/modes/types.ts` + `lib/scoring/index.ts` — ny `bingo_bango_bongo`-modus i `GameMode`, `GameModeConfig`, `ModeResult`, `ScoringContext` og compute-routeren, samt alle `Record<GameMode,…>`-maps (`MODE_LABELS`, `modeValidators`, `bruttoHelperFor`, `MODE_GUIDE`, m.fl.).
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `validateBingoBangoBongo` (2–4 spillere, individuell).
- `HoleClient.tsx` + hull-`page.tsx`, leaderboard-`page.tsx`, `lib/formats/icons.tsx` — scorekort-integrasjon, leaderboard-routing og format-ikon.

#### Tests
- Type A: `bingoBangoBongo.test.ts` (20) + `lib/bbb/`-helper-tester. Type C: `BingoBangoBongoEntry.test.tsx` + `BingoBangoBongoView.test.tsx`.

</details>
</details>


---


<details>
<summary><strong>1.48.y — 4BBB Stableford (lag-variant synliggjort) (1 oppføring)</strong></summary>

Issue [#282](https://github.com/jdlarssen/golf-app/issues/282), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Stableford for lag à 2 fantes allerede, men gjemte seg bak et kryptisk «Par»-valg. Nå heter varianten 4BBB og får en egen forklaring, uten ny scoring under panseret.

### [1.48.0] - 2026-05-29 · #282

> Stableford for lag à 2 har fått et tydelig navn: 4BBB. Velg Stableford først, så Solo eller 4BBB. På et 4BBB-lag spiller dere hver deres ball, og den beste poengsummen av dere to teller på hvert hull. Appen forklarer regelen rett i spillform-kortet, så ingen lurer på hva «Par» betød.

<details>
<summary>Teknisk</summary>

Ingen ny scoring, game_mode eller migrasjon: lag-Stableford (team_size 2) regnet allerede beste poeng per hull (4BBB). Endringen er ren synliggjøring + variant-bevisst navngiving.

#### Added
- [`lib/games/formatLabel.ts`](lib/games/formatLabel.ts) — `formatDisplayLabel(mode, modeConfig)` navngir stableford-familien med team_size 2 som «4BBB Stableford» / «4BBB Modifisert Stableford», ellers `MODE_LABELS[mode]`. Ren, server-trygg modul.
- [`lib/formats/modeGuide.ts`](lib/formats/modeGuide.ts) — `STABLEFORD_4BBB_GUIDE` + `resolveModeGuide(mode, teamSize)`: spiller-forklaring for 4BBB (beste poeng per hull teller).
- Egen 4BBB-rad i `/spillformer`-oppslagsverket.

#### Changed
- [`components/ModeGuideCard.tsx`](components/ModeGuideCard.tsx) + [`components/ui/ModeChip.tsx`](components/ui/ModeChip.tsx) — valgfri `modeConfig`-prop viser 4BBB-navn + -guide på game-home og admin-flatene. Uten prop: uendret.
- [`app/admin/games/new/TeamSizeSelector.tsx`](app/admin/games/new/TeamSizeSelector.tsx) — team_size-2-tilen heter «4BBB» (hint «Lag à 2, beste poeng teller») for stableford-familien. Andre lag-moduser beholder «Par».
- Admin spill-liste henter `mode_config` for å vise 4BBB-chip.

#### Tests
- Type A: `formatLabel.test.ts`, `modeGuide.test.ts`. Type C: 4BBB-variant i `ModeGuideCard.test.tsx` + `ModeChip.test.tsx`. Oppdaterte `TeamSizeSelector`- og `GameForm`-queries fra «Par» til «4BBB» i stableford-kontekst.

#### Avvik fra issue #282
- Issue-en spesifiserte ny `fourbb_stableford.ts`-scoring-modul + ny `formats`-rad. Begge droppet: scoringen finnes allerede i `stableford.ts` (team-MAX), og Jørgen valgte å la 4BBB leve som variant under Stableford-kortet, ikke som eget format-kort.

</details>
</details>


---


<details>
<summary><strong>1.47.y — Modifisert Stableford (pro-skala med minuspoeng) (1 oppføring)</strong></summary>

Issue [#281](https://github.com/jdlarssen/golf-app/issues/281), del av format-epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Modifisert Stableford er Stableford med proff-skala: birdie og eagle belønnes ekstra, mens dobbeltbogey eller verre gir minuspoeng. Premierer å satse foran å ligge trygt på par.

### [1.47.0] - 2026-05-29 · #281

> Ny spillform: Modifisert Stableford. Samme Stableford-poeng du kjenner, men med proff-skala: birdie og eagle gir mye, og dobbeltbogey eller verre trekker fra. Poengene kan gå i minus, så her lønner det seg å satse. Solo eller par, og du velger handicap som vanlig når du oppretter spillet.

<details>
<summary>Teknisk</summary>

#### Added
- [`lib/scoring/modes/modifiedStableford.ts`](lib/scoring/modes/modifiedStableford.ts) — ny scoring-modul med pro-poeng-tabellen (albatross+ 8, eagle 5, birdie 2, par 0, bogey −1, dobbeltbogey+ −3; condor caps på 8; ikke-spilt 0). Gjenbruker stableford-motoren via parameterisert `computeWithPointsTable` og returnerer `kind: 'stableford'`, så leaderboard/podium-visningen er uendret. Type A-tester dekker tabellen (inkl. albatross-cap + null→0), solo-totaler med negative poeng, ranking med negativ total, og team-MAX med negativ.
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — ny `modified_stableford` `GameMode` + `GameModeConfig`-variant (`points_table: 'modified'`, solo/par), `MODE_LABELS`-entry «Modifisert Stableford», og `isStablefordFamily(mode)`-helper.
- [`supabase/migrations/0052_modified_stableford.sql`](supabase/migrations/0052_modified_stableford.sql) — seeder format-rad + tre sekundære intent-mappings (kompis/klubb/solo). Gjenbruker stableford-ikonet.
- [`lib/formats/modeGuide.ts`](lib/formats/modeGuide.ts) — spiller-rettet regelforklaring (poeng-skala + minuspoeng-advarsel).

#### Changed
- [`lib/scoring/modes/stableford.ts`](lib/scoring/modes/stableford.ts) — motoren parameterisert med en poeng-funksjon og en contributor-regel slik at standard og modified deler all solo-/team-logikk. Standard-oppførselen er uendret (eksisterende tester grønne).
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts) — `modified_stableford`-validator (gjenbruker stableford-spiller-parsingen).
- Leaderboard-, scorekort-, wizard-, mail- og game-home-flatene ruter `modified_stableford` via `isStablefordFamily`. Hull-siden og scorekortet bruker den modifiserte poeng-tabellen for live «Dine poeng».
- [`app/games/[id]/holes/[holeNumber]/HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx) — diskret advarsel over score-input om at poengene kan gå i minus (andre advarsels-flate ved siden av spillform-guiden).

#### Tests
- Type A: `modifiedStableford.test.ts` + router-delegering i `index.test.ts`. Type C: minus-poeng-banner i `HoleClient.test.tsx`. Eksisterende stableford-suite uendret og grønn.

</details>
</details>


---


<details>
<summary><strong>1.46.y — Spillformer forklart for spillere (2 oppføringer)</strong></summary>

Issue [#299](https://github.com/jdlarssen/golf-app/issues/299). Spillere som blir invitert til en ukjent spillform får nå en kort forklaring rett på spill-siden, og kan bla gjennom alle formene i et eget oppslagsverk. Lavere terskel for å bli med på noe nytt.

### [1.46.1] - 2026-05-29 · #303

> Avslutter du et Skins-spill rett etter et delt hull, viser resultatlista nå at de skinsene ikke ble vunnet. Før forsvant de fra oversikten.

<details>
<summary>Teknisk</summary>

#### Fixed
- [`lib/scoring/modes/skins.ts`](lib/scoring/modes/skins.ts) + [`types.ts`](lib/scoring/modes/types.ts) — henger-skins ble under-rapportert når et spill ble avsluttet tidlig med et gap rett etter et delt hull ([#303](https://github.com/jdlarssen/golf-app/issues/303)). `SkinsResult.unwonSkins = frozen ? 0 : carriedPot` nullstilte den hengende potten så snart et hull var pending, slik at henger-banneret forsvant. Scoring-modulen kjenner ikke `gameStatus`, så feltet er erstattet med rå `SkinsResult.carriedPot` (den hengende potten ved siste resolverte hull, frozen eller ikke). [`SkinsView`](app/games/[id]/leaderboard/SkinsView.tsx) — som allerede mottar `gameStatus` — avgjør label: banneret vises når `gameStatus === 'finished' && carriedPot > 0` (dekker både komplett runde med delt siste hull og tidlig-avsluttet spill med trailing pending), og holdes skjult under aktivt spill der potten fortsatt er i spill. Kun display — spiller-totalene var alltid korrekte.
- Banner-copy presisert: «Siste hull ble delt» → «Siste spilte hull ble delt» (presist for tidlig-avsluttede spill der siste *spilte* hull, ikke siste hull-nummer, var delt).

#### Tests
- 2 nye Type A scoring-tester: rå `carriedPot` eksponert ved pending-freeze; tidlig-avslutning på delt hull + trailing pending → `carriedPot` = rå hengende pott (ikke 0). Eksisterende `unwonSkins`-assertions re-pekt til `carriedPot`.
- SkinsView-render-testen utvidet: frozen-finished-scenario viser banneret; samme pott under aktivt spill holder banneret skjult.

</details>

### [1.46.0] - 2026-05-29 · #299

> Får du en invitasjon til en spillform du ikke kjenner? Nå ligger det en kort forklaring rett på spill-siden. Trykk «Slik funker det», så er du i gang. Vil du lese deg opp på forhånd, finner du alle formene samlet under «Spillformer» på hjem-siden.

<details>
<summary>Teknisk</summary>

#### Added
- [`lib/formats/modeGuide.ts`](lib/formats/modeGuide.ts) — statisk `MODE_GUIDE`-katalog: et player-rettet ett-linjes sammendrag + 2–3 «korte regler»-punkter for alle 10 spillformene (inkl. Skins, som landet parallelt). Egen kilde fra `formats.short_description` (som er admin-terse for wizarden). Type A completeness-test ([`modeGuide.test.ts`](lib/formats/modeGuide.test.ts)) håndhever ikke-tomt innhold per modus.
- [`components/ModeGuideCard.tsx`](components/ModeGuideCard.tsx) — gjenbrukbar utvidbar modus-forklaring bygd på native `<details>` (server-renderbar, tastatur-tilgjengelig, reduced-motion-trygt). Faller defensivt tilbake til kun modus-navn for ukjente/legacy `game_mode`-verdier. Type C render-test dekker struktur + fallback.
- [`app/spillformer/page.tsx`](app/spillformer/page.tsx) — nytt oppslagsverk som lister alle formene i pedagogisk rekkefølge, hver som et `ModeGuideCard`.

#### Changed
- [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — nytt «SPILLFORM»-kort på spillerens game-side (både `scheduled`-ventestaten og draft/active/finished-visningen) som viser `ModeGuideCard` for spillets modus.
- [`app/page.tsx`](app/page.tsx) — ny «Spillformer»-tile i hjem-navet som lenker til oppslagsverket.

#### Tests
- Type A completeness (`modeGuide.test.ts`) + Type C render (`ModeGuideCard.test.tsx`) dekker alle modusene. Hele suiten grønn.

</details>
</details>


---


<details>
<summary><strong>1.45.y — Skins (1 oppføring)</strong></summary>

Issue [#275](https://github.com/jdlarssen/golf-app/issues/275), tredje kompis-format i [#270](https://github.com/jdlarssen/golf-app/issues/270). Skins er hull-for-hull-klassikeren: lavest score vinner skinnet, og deler dere hullet, ruller potten videre til neste hull.

### [1.45.0] - 2026-05-29 · #275

> Ny spillform: Skins. Hvert hull er verdt 1 skin, og lavest score tar det. Deler dere hullet, ruller skinnet videre til neste hull, som da er verdt mer. 2–4 spillere, og du velger netto eller brutto når du oppretter spillet. Resultatlista viser hvem som tok hvor mange skins, så dere kan gjøre opp en pott dere avtaler selv.

<details>
<summary>Teknisk</summary>

#### Added
- [`supabase/migrations/0051_skins.sql`](supabase/migrations/0051_skins.sql) — seeder `skins`-format-row + `format_intent_mapping[skins, kompis, primary, sort_order=70]`. Ingen ny tabell — carryover er en ren funksjon av eksisterende `scores`, akkurat som Nassau.
- [`lib/scoring/modes/skins.ts`](lib/scoring/modes/skins.ts) — `compute(ctx)` med sekvensiell carryover-state. Hvert hull legger 1 skin i potten; `atStake = carriedIn + 1`. Unik laveste effective-score vinner hele potten (`carriedPot` resettes); to eller flere på laveste = carryover (potten ruller videre). Pending hull (mangler score) fryser resolving — alle senere hull blir også pending. `unwonSkins` = potten som henger ved rundeslutt (standard Skins, ingen omspill). Gross/net via `mode_config.skins_scoring` med defensiv fallback til 'net'. 26 Type A unit-tester dekker enkel vinner, 2-/3-/4-veis delt, multi-tied sekvens (hull 1–3 delt → hull 4 scooper 4 skins), pending, uvunne skins, gross vs net, 2- og 4-spiller, ranking + tiebreak.
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `GameMode` + `GameModeConfig` + `MODE_LABELS` utvidet med `skins`; nye `SkinsResult`, `SkinsHoleRow`, `SkinsPlayerLine`, `SkinsHoleOutcome`-typer; `ModeResult` utvidet.
- [`app/admin/games/new/sections/SkinsSetup.tsx`](app/admin/games/new/sections/SkinsSetup.tsx) — wizard step 2-seksjon med scoring-toggle (netto/brutto) + carryover-forklaring. `useGameFormState` utvidet med `skinsScoring`, `isSkins`, `skinsPlayersValid` (2–4 spillere).
- [`app/games/[id]/leaderboard/SkinsView.tsx`](app/games/[id]/leaderboard/SkinsView.tsx) — spiller-totals øverst (sortert på skins vunnet, prominent), per-hull-tabell som viser carryover-kjeden (på spill / delt → ruller videre / venter / vunnet av), og en egen linje for uvunne skins når potten henger ved rundeslutt. Reveal-mode følger Wolf/Nassau-pattern.
- [`app/games/[id]/leaderboard/SkinsPodium.tsx`](app/games/[id]/leaderboard/SkinsPodium.tsx) — 1./2./3.-plass på `totalSkins`, confetti-burst på first-mount per browser-sesjon, rest-listen (rank 4+) i collapsed liste.
- [`validateSkins`](lib/games/gamePayload.ts) — payload-validator med 2–4 spillere, solo-format (team/flight null), `skins_scoring` gross|net parsing. 10 unit-tester.
- Skins-banner i [`HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx) — viser «X skins på spill» på hull-flaten + et hint når potten har rullet videre. Rent informativt (ingen modal, til forskjell fra Wolf).
- Auth-gate E2E ([`e2e/games/skins.spec.ts`](e2e/games/skins.spec.ts)) speiler Wolf/Nassau-mønstret.

#### Changed
- `Record<GameMode, …>`-mapper + uttømmende `switch`-er utvidet for type-completeness (ReadyStep, TeamSizeSelector, `MODE_LABELS`, `bruttoHelperFor` i [`allowanceCopy.ts`](lib/games/allowanceCopy.ts), lokal `GameRow`-union i [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx)). `validateSkins` wiret i `parseGameMode` + `modeValidators`.
- [`renderSkins`](app/games/[id]/leaderboard/page.tsx) router-case etter Nassau.
- [`app/admin/games/new/GameWizard.tsx`](app/admin/games/new/GameWizard.tsx): render `<SkinsSetup>` når `isSkins`, hidden `skins_scoring`-input, skjul TeamSizeSelector. `skins_scoring` lagt til i `initialValues`-passthrough.
- [`app/games/[id]/holes/[holeNumber]/page.tsx`](app/games/[id]/holes/[holeNumber]/page.tsx): når `game_mode='skins'`, kjør `skins.compute` over nåværende scores og send `skinsAtStake` + `skinsCarriedIn` ned til `HoleClient`.

#### Tests
- 26 Type A unit-tester for scoring-modulen.
- 10 validator-tester (`gamePayload.test.ts`).
- 2 render-tester (SkinsSetup + SkinsView).
- Lightweight auth-gate E2E. Carryover-scenariet («vunnet på hull 4») dekkes av Type A unit-test, ikke tung E2E — riktig hjem per test-disiplinen.

Tredje av 7 kompis-batch-formats. Resten: BBB, Nines, Acey Deucey, Round Robin.

</details>
</details>


---


<details>
<summary><strong>1.44.y — Nassau (3 oppføringer)</strong></summary>

Issue [#276](https://github.com/jdlarssen/golf-app/issues/276), andre kompis-format i [#270](https://github.com/jdlarssen/golf-app/issues/270). Nassau er klassikeren: front 9, back 9 og hele runden er tre separate konkurranser i samme runde. Vinn én seksjon og du har én seier; vinn alle tre og du tok «Hele tavla».

### [1.44.2] - 2026-05-29 · #198

> Spillere som har fått lov til å opprette turneringer uten å være administrator, kan endelig gjøre det. Før stoppet en tilgangssperre dem med «Klarte ikke å lagre spillet», selv om de hadde fått tilgang.

<details>
<summary>Teknisk</summary>

#### Fixed
- [`app/admin/games/new/actions.ts`](app/admin/games/new/actions.ts) — `createGameInternal` kjørte `games`- og `game_players`-INSERT gjennom den request-scopede klienten, men RLS-policyene `games admin write` / `game_players admin write` krever `is_admin()`. Trusted-non-admin-skapere (#198-allowlista) feilet derfor INSERT-en stille siden #198 ble merget 2026-05-25, og landet på `error=db_game`. Nå velges `writeClient = isAdmin ? supabase : getAdminClient()` (service-role-bypass for trusted), samme mønster som #223 Fase 4 i courses-actions. Publish-roster-readen bruker samme klient, så pending-spiller-sperra ser hele rosteret — RLS skjulte ellers ennå-ikke-delte spillere og hoppet stille over sjekken.

#### Tests
- [`app/admin/games/new/actions.test.ts`](app/admin/games/new/actions.test.ts) — regresjonstester som beviser at admin-klienten faktisk brukes for trusted-skapere (draft + publish) og ikke for admin. Den gamle #198-testen mocket `games.insert` til å lykkes uansett klient, og fanget derfor aldri RLS-gapet.

Verifisert via Supabase MCP (read-only): `fornes.even@yahoo.no` er `is_admin=false`, og `games`/`game_players`-policyene matcher migrasjon 0002 (ikke endret manuelt) — altså en bug, ikke konfigurasjonsdrift. Issue [#230](https://github.com/jdlarssen/golf-app/issues/230).

</details>

### [1.44.1] - 2026-05-29 · #240

> Spiller du fra en tee der dame- eller junior-par er annerledes enn herre-par, viser nå leverings-siden, godkjenning og leaderboardens hull-fane din egen par. Et 5-slag på et hull som er par 5 for deg teller som par, ikke bogey.

<details>
<summary>Teknisk</summary>

Oppfølger til [#240](https://github.com/jdlarssen/golf-app/issues/240) — tre display-flater brukte fortsatt `par_mens` (eller lagets representant-par) i stedet for spillerens egen par. Alle tre gjenbruker `parForPlayer`/`hasParDifference`/`formatOtherGendersPar` fra [`lib/games/parDisplay.ts`](lib/games/parDisplay.ts); ingen endring i scoring- eller leaderboard-helperne.

#### Fixed
- [`app/games/[id]/submit/page.tsx`](app/games/[id]/submit/page.tsx) — «DITT KORT»-preview mapper nå rad-par via `parForPlayer(parByGender, me.tee_gender)` i stedet for `h.par_mens`, og viser avvik-asterisk (`ParAsideInline`) i par-kolonnen. En damespiller ser nå sin egen par og slag-shape i preview før innlevering.
- [`app/games/[id]/approve/page.tsx`](app/games/[id]/approve/page.tsx) — godkjennings-tabellen bruker scorekort-eierens (`p.tee_gender`) par for både par-tall og `scoreShape`/`scoreTone`, med avvik-asterisk. Admin/flight-mate ser eierens par, ikke herre-par.
- [`app/games/[id]/leaderboard/holes/page.tsx`](app/games/[id]/leaderboard/holes/page.tsx) — per-spiller-rad bruker `pc.par` (per-spiller) i stedet for `row.par` (lagets) på både brutto-celle-tone og «+/− mot par»-merket. Begge fikset (samme rot-årsak) etter brukerbeslutning.

Ingen nye tester: pure-logic-helperne er dekket i `parDisplay`/`parResolver` (#240), asterisk-rendering i `HoleClient.test.tsx`. Submit/approve er server-komponenter som fetcher fra Supabase — per test-disiplin ikke verdt redundante render-tester.

</details>

### [1.44.0] - 2026-05-28 · #276

> Ny spillform: Nassau. Front 9, back 9 og hele runden er tre separate konkurranser — vinn alle tre og det heter «Hele tavla». 2–4 spillere, velg netto eller brutto når du oppretter spillet.

<details>
<summary>Teknisk</summary>

#### Added
- [`supabase/migrations/0050_nassau.sql`](supabase/migrations/0050_nassau.sql) — seeder `nassau`-format-row + `format_intent_mapping[nassau, kompis, primary, sort_order=60]`. Ingen ny tabell — scoring leser eksisterende `scores`.
- [`lib/scoring/modes/nassau.ts`](lib/scoring/modes/nassau.ts) — `compute(ctx)` rangerer tre seksjoner (front 9 / back 9 / total 18) hver for seg via samme `rankTeams`-cascade + `UNPLAYED_PADDING=999`-strategi som `soloStrokeplay`. Aggregert unit-ranking med primær units desc / sekundær total18EffectiveStrokes asc / tertiær userId asc tiebreak. Push på tie (klassisk Nassau-regel) — tied seksjon = ingen unit deles ut. Gross/net-toggle via `mode_config.nassau_scoring` med defensiv fallback til 'net'. 25 Type A unit-tester dekker hele matrisen (clean-win per seksjon, push, sweep, pending, partial play, gross vs net, unit-aggregering, tiebreak).
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `GameMode` + `GameModeConfig` utvidet med `nassau`-variant; nye `NassauResult`, `NassauSection`, `NassauSectionLine`, `NassauUnitLine`-typer; `ModeResult` utvidet.
- [`app/admin/games/new/sections/NassauSetup.tsx`](app/admin/games/new/sections/NassauSetup.tsx) — wizard step 2-seksjon med kun scoring-toggle (netto/brutto). Mye enklere enn WolfSetup (ingen rotasjon, ingen shuffle). `useGameFormState` utvidet med `nassauScoring`, `isNassau`, `nassauPlayersValid` (2-4 spillere).
- [`app/games/[id]/leaderboard/NassauView.tsx`](app/games/[id]/leaderboard/NassauView.tsx) — tre stacked seksjoner med per-seksjon-rangering. Push viser «Delt 1.-plass» uten highlight. Pending viser «Venter på spilte hull». Reveal-mode følger Wolf-pattern (blanket venterom-card når `score_visibility=reveal` og `status=active`).
- [`app/games/[id]/leaderboard/NassauPodium.tsx`](app/games/[id]/leaderboard/NassauPodium.tsx) — 1./2./3.-plass på aggregert unit-count med F9/B9/T18-badges per podium-step. Sweep-celebration «Hele tavla!» + «Tok alle tre seksjoner» når en spiller har `units=3`. Confetti-burst på first-mount per browser-sesjon (sessionStorage-gate). Rest-listen (rank 4+) i collapsed `<details>`.
- [`validateNassau`](lib/games/gamePayload.ts) — payload-validator med 2-4 spillere range, solo-format (team/flight null), `nassau_scoring` gross|net parsing. 12 unit-tester.
- Auth-gate E2E ([`e2e/games/nassau.spec.ts`](e2e/games/nassau.spec.ts)) speiler Wolf-mønstret.

#### Changed
- `Record<GameMode, …>`-mapper utvidet for type-completeness: `ENABLED_COMBOS` (TeamSizeSelector), `MODE_SUMMARY_LABELS` (ReadyStep), `MODE_LABELS` (types), `bruttoHelperFor` (allowanceCopy). Lokal `GameRow.game_mode`-union i [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx).
- [`renderNassau`](app/games/[id]/leaderboard/page.tsx) router-case etter Wolf — speiler `renderSoloStrokeplay` (ingen separat per-hull-tabell).
- [`app/admin/games/new/GameWizard.tsx`](app/admin/games/new/GameWizard.tsx): render `<NassauSetup>` når `isNassau`, hidden `nassau_scoring`-input, skjul TeamSizeSelector. `wolf_scoring` lagt til i `initialValues`-passthrough.

#### Tests
- 25 Type A unit-tester for scoring-modulen.
- 12 validator-tester (`gamePayload.test.ts`).
- 2 render-tester (NassauSetup + NassauView + NassauPodium).
- Lightweight auth-gate E2E.

Andre av 7 kompis-batch-formats. Resten: Skins, BBB, Nines, Acey Deucey, Round Robin.

</details>
</details>


---


<details>
<summary><strong>1.43.y — Wolf-format (1 oppføring)</strong></summary>

Issue [#274](https://github.com/jdlarssen/golf-app/issues/274), første kompis-format i [#270](https://github.com/jdlarssen/golf-app/issues/270). Wolf er en sosial 4-spillers spillform der én av dere er Wolf på hvert hull — vedkommende velger partner (2v2), går Lone Wolf (1v3, dobler innsatsen), eller deklarer Blind Wolf før noen slår (tredobler). Like hull bærer potten videre.

### [1.43.0] - 2026-05-28 · #270

> Ny spillform: Wolf. Fire spillere, og én av dere er Wolf på hvert hull — velg partner, gå alene som Lone Wolf (dobler), eller bli Blind Wolf før noen slår (tredobler). Like hull bærer potten videre til neste. Velg netto eller brutto når du oppretter spillet.

<details>
<summary>Teknisk</summary>

#### Added
- [`supabase/migrations/0049_wolf.sql`](supabase/migrations/0049_wolf.sql) — ny `wolf_hole_choices`-tabell (én rad per `(game_id, hole_number)` med wolf_user_id + choice + partner_user_id + entered_by), CHECK-constraint `partner_only_when_partner_choice` håndhever choice/partner-konsistens, RLS-policies for read/insert/update/delete (wolf-spilleren selv eller admin). Seed format-row + `format_intent_mapping[wolf, kompis, primary]`.
- [`lib/scoring/modes/wolf.ts`](lib/scoring/modes/wolf.ts) — full `compute(ctx)` med rotation (hull 1-16 lineær, 17-18 trailing-wolf), stake/carry-over-mekanikk, point-tabell (partner 2/1, lone 4/1, blind 6/2), gross vs net allokering via `strokesForHole`. 52 Type A unit-tester via `it.each` dekker hele scoring-matrisen.
- [`lib/scoring/modes/types.ts`](lib/scoring/modes/types.ts) — `GameMode` + `GameModeConfig` utvidet med `wolf`-variant; nye `WolfResult`, `WolfHoleRow`, `WolfPlayerCell`, `WolfPlayerLine`, `WolfChoice`, `WolfHoleOutcome`, `WolfHoleChoice`-typer; `ScoringContext.wolfChoices` optional input.
- [`lib/wolf/getWolfChoices.ts`](lib/wolf/getWolfChoices.ts) — tag-cachet (`game-${id}`) admin-client fetch av wolf-valg per spill. [`lib/wolf/setWolfChoice.ts`](lib/wolf/setWolfChoice.ts) — server-action med 8 validerings-cases + RLS-feilkonvertering. [`lib/wolf/subscribeWolfChoices.ts`](lib/wolf/subscribeWolfChoices.ts) — realtime-sub på alle event-typer.
- [`app/admin/games/new/sections/WolfSetup.tsx`](app/admin/games/new/sections/WolfSetup.tsx) — wizard step 2-seksjon med scoring-toggle (netto/brutto) + 4 rotation-slots med shuffle-knapp. `useGameFormState` utvidet med `wolfScoring`, `wolfOrder` (deterministisk Fisher-Yates via splitmix32-PRNG), `shuffleWolfOrder()`, `isWolf`, `wolfPlayersValid`.
- [`app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx`](app/games/[id]/holes/[holeNumber]/WolfChoiceModal.tsx) — 5-knappers modal (3 partnere + Lone + Blind) med Escape-to-close og inline-feil. [`wolfRotation.ts`](app/games/[id]/holes/[holeNumber]/wolfRotation.ts) — client-helper for å bestemme Wolf per hull.
- [`HoleClient.tsx`](app/games/[id]/holes/[holeNumber]/HoleClient.tsx) integration: wolf-badge over score-card, auto-modal når current user er Wolf og ingen choice finnes, realtime-sync av wolf-valg mellom de 4 spillerne.
- [`WolfView`](app/games/[id]/leaderboard/WolfView.tsx) + [`WolfPodium`](app/games/[id]/leaderboard/WolfPodium.tsx) — leaderboard-rendering med per-hull-tabell (Wolf, choice, stake, outcome, per-spiller +poeng) + spiller-totals + 1./2./3.-plass-podium med bragging-stats-strip (Mest Blind Wolf-pott, Mest Wolf-hull). Reveal-modus skjuler tall mens runden er aktiv.
- [`validateWolf`](lib/games/gamePayload.ts) — payload-validator med 4-spillers exact-count, team_number 1-4 unik, wolf_scoring gross|net parsing. 14 unit-tester.

#### Changed
- `Record<GameMode, …>`-mapper utvidet for type-completeness: `ENABLED_COMBOS` (TeamSizeSelector), `MODE_SUMMARY_LABELS` (ReadyStep), `bruttoHelperFor` (allowanceCopy), `MODE_LABELS` (types).

#### Tests
- 52 Type A unit-tester for scoring-modulen (scoring matrix, rotation, stake-carry, gross/net, ranking, pending-handling, blindWolfWins-stat).
- 14 validator-tester (`gamePayload.test.ts`).
- 16 server-helper-tester (`getWolfChoices.test.ts` + `setWolfChoice.test.ts`).
- 15 rotation-helper-tester (`wolfRotation.test.ts`).
- 2 + 7 render-tester (WolfSetup + WolfChoiceModal).
- 2 render-tester (WolfView + WolfPodium).
- Lightweight auth-gate E2E (`e2e/games/wolf.spec.ts`).

Foundation for epic [#270](https://github.com/jdlarssen/golf-app/issues/270). Wolf er første av 7 kompis-batch-formats (resten: Skins, Nassau, BBB, Nines, Acey Deucey, Round Robin).

</details>
</details>
</details>


---



<details>
<summary><strong>Ryder Cup & format-fundament (#47, #270) — 5 serier</strong></summary>

<details>
<summary><strong>1.42.y — Foursomes matchplay (1 oppføring)</strong></summary>

Issue [#218](https://github.com/jdlarssen/golf-app/issues/218), fase 3 av [#47](https://github.com/jdlarssen/golf-app/issues/47). Foursomes matchplay (2v2 alternate-shot — én ball per lag, partnerne alternerer slag) er klar for cupen. Lagene møtes hull-for-hull som matchplay, og scorekortet viser dere mot dem hele veien. Tee-rotasjonen avtales av flighten på hull 1.

### [1.42.0] - 2026-05-27 · #289

> Foursomes matchplay er klar for cupen. To og to spillere deler én ball og alternerer slag — laget med best score per hull vinner hullet. Før hull 1 velger flighten hvem på hver side som skal teer ut først, så ruller appen med riktig «X slår ut»-hint per hull. WHS-handicapen er forhåndsvalgt til 50 % av differansen mellom lagene; admin kan justere per cup.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon [0048_foursomes_matchplay.sql](supabase/migrations/0048_foursomes_matchplay.sql) — seeder `foursomes_matchplay` i `formats`-tabellen som cup-eligible. Legger til `tournaments.foursomes_allowance_pct` (smallint, default 50, check 0..100) og to nye nullable FK-er på `games`: `foursomes_side1_tee_starter_user_id` + `foursomes_side2_tee_starter_user_id`. Storage-pattern A: ingen skjema-endring på `scores` — kaptein-userId (lex-min per side) eier lagets scores-rader, samme mønster som Texas scramble. Resten av alternate-shot-familien ([#289 Greensome](https://github.com/jdlarssen/golf-app/issues/289), [#290 Chapman](https://github.com/jdlarssen/golf-app/issues/290), [#291 Gruesome](https://github.com/jdlarssen/golf-app/issues/291)) adopterer samme mønster.
- [`lib/scoring/modes/foursomesMatchplay.ts`](lib/scoring/modes/foursomesMatchplay.ts) — ny scoring-modul med WHS-diff-formel: `highSideExtraHCP = round(|side1CombinedCH - side2CombinedCH| × allowance_pct / 100)`, lavlaget får 0 strokes, høylaget får extra-HCP allokert via SI (hardeste hull først). Gjenbruker `pickTeamCaptain`, `classifyMatchplayHole`, `computeMatchResult`, `strokesForHole`. 16 unit-tester dekker HCP-diff, mat-em («3&2»), AS, 18-hull-vinner («2up»), unplayed-hole, allowance 0/100, mixed-tee parByGender, empty-shell (0/1/3 spillere), captain-pick, holesPlayed-correctness.
- [`app/games/[id]/foursomesActions.ts`](app/games/[id]/foursomesActions.ts) — ny `setFoursomesTeeStarter`-server-action med side-membership-validering på både kaller og valgt user, write til riktig `foursomes_side{N}_tee_starter_user_id`-kolonne, revalidateTag på game-id.
- [`FoursomesTeeStarterBanner`](app/games/[id]/holes/[holeNumber]/FoursomesTeeStarterBanner.tsx) — klient-banner på hull 1 når sidens tee-starter ikke er valgt, viser to navn-knapper som ruter til server-actionen via `useTransition`. `FoursomesTeeHint` viser per hull «X slår ut» basert på odd/even-hull (standard foursomes-rotasjon).

#### Changed
- [`GameMode`, `MODE_LABELS`, `GameModeConfig`, `ModeResult`](lib/scoring/modes/types.ts) utvidet med `foursomes_matchplay` + tilhørende result-shapes (`FoursomesSide`, `FoursomesSidePlayer`, `FoursomesHoleRow`, `FoursomesMatchplayResult`). Mode-router-case wired i [lib/scoring/index.ts](lib/scoring/index.ts).
- [`lib/games/gamePayload.ts`](lib/games/gamePayload.ts): ny `validateFoursomesMatchplay`-validator (speiler fourball: 2v2-fordeling, duplikat-sjekk, range-validert `foursomes_allowance_pct` med default 50 i draft). `parseGameMode` + `modeValidators`-map utvidet. 14 nye gamePayload-tester.
- [`lib/cup/getCupSnapshot.ts`](lib/cup/getCupSnapshot.ts): foursomes-gren etter fourball — `computeFoursomesMatchplay` mater cup-aggregatoren med `{ winnerSide, formatted }`. `matchGameMode`-typen utvidet. [`computeCupLeaderboard.CupMatchInput.gameMode`](lib/cup/computeCupLeaderboard.ts) tar `'foursomes_matchplay'` så cup-UI kan velge lag-fokusert «X til Lag Skog» (matchet i `app/cup/[id]/page.tsx` og `app/admin/cup/[id]/page.tsx`).
- [`lib/cup/actions.ts`](lib/cup/actions.ts): cup-create/edit-form persisterer ny `foursomes_allowance_pct` (parser med range 0..100, default 50). `CupSetup` får en ny `AllowanceField` for foursomes som forklarer WHS-diff-formelen i nettoHelper/bruttoHelper.
- [`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx): `CupGameMode` utvidet med `foursomes_matchplay`. `loadCupContext` leser `foursomes_allowance_pct` (default 50) og setter labelPrefix='Foursomes'. `buildCupInitialValues` har egen gren for foursomes så match-en arver cup-en sin allowance.
- [`useGameFormState`](app/admin/games/new/useGameFormState.ts), [`GameWizard`](app/admin/games/new/GameWizard.tsx) og [`GameForm`](app/admin/games/new/GameForm.tsx) eksponerer `foursomesAllowancePct` + dedikert `AllowanceField` i Section 3 + hidden input i submit-payload.
- [`lib/games/scorecardLayout.ts`](lib/games/scorecardLayout.ts): ny `mode === 'foursomes_matchplay'`-gren produserer 2-kolonne Layout B (én per side, kaptein-userId som score-eier, lag-display «Per/Knut»). `courseHandicap` per kolonne = WHS-effective ekstra-HCP. Match-status faller gjennom til singles' 2-kolonne `computeMatchplayRunningStatus`-grenen uten endring. Ny `isFoursomes`-flag på `ScorecardLayout`.
- [`app/admin/cup/[id]/page.tsx`](app/admin/cup/[id]/page.tsx): ny «+ Foursomes match»-knapp ved siden av singles/fourball; grid blir 3-kolonner på `sm+`.
- [`app/games/[id]/holes/[holeNumber]/page.tsx`](app/games/[id]/holes/[holeNumber]/page.tsx): foursomes-flight collapses til én lag-kort (Texas-pattern). Tee-starter-banner rendres over `HoleClient` på hull 1 når valget ikke er gjort; hint vises på alle hull etter at valget er låst. [`getGameWithPlayers`](lib/games/getGameWithPlayers.ts) SELECT-en leser nå `foursomes_side1/2_tee_starter_user_id` via cache.
- Exhaustive-map-utvidelser i [`ReadyStep`](app/admin/games/new/sections/ReadyStep.tsx), [`TeamSizeSelector`](app/admin/games/new/TeamSizeSelector.tsx), [`bruttoHelperFor`](lib/games/allowanceCopy.ts) og lokale GameRow-unions i [`app/games/[id]/page.tsx`](app/games/[id]/page.tsx) — strukturelle konsekvenser av å utvide `GameMode`-unionen.

#### Tests
- 16 `foursomesMatchplay.test.ts`-cases (Type A).
- 14 nye gamePayload-cases for foursomes-validatoren.
- 3 nye `scorecardLayout.test.ts`-cases (happy 2v2 med WHS-diff, non-captain ser kaptein som score-eier, ikke-2-2 → Layout A fallback).
- 10 nye `foursomesActions.test.ts`-cases (server-action authz + happy path).

Dette er første format i alternate-shot-familien som lander i prod; mønstret (storage-pattern A + Layout B head-to-head + diff-basert allowance + per-game tee-starter-felt) gjenbrukes i [#289 Greensome](https://github.com/jdlarssen/golf-app/issues/289), [#290 Chapman](https://github.com/jdlarssen/golf-app/issues/290) og [#291 Gruesome](https://github.com/jdlarssen/golf-app/issues/291) når de implementeres.

</details>
</details>


---


<details>
<summary><strong>1.41.y — Admin format-mapping (1 oppføring)</strong></summary>

Issue [#273](https://github.com/jdlarssen/golf-app/issues/273), fase 3 av [#270](https://github.com/jdlarssen/golf-app/issues/270). Ny admin-side `/admin/formats` med matrix-view for å styre hvilke spillformer som dukker opp i wizardens step 2 — uten å trenge en kode-deploy. Hver endring logges til `admin_audit_log` og synes i bunnen av siden.

### [1.41.0] - 2026-05-27 · #270

> Ny side i Sekretariatet: «Formats». Som admin kan du nå styre hvilke spillformer som dukker opp i wizardens step 2 per arrangement, hvilke som er primary (stort kort) og hvilke som er cup-eligible. Endringene blir synlige neste gang noen åpner wizarden, og du ser de siste 50 endringene loggført nederst på siden.

<details>
<summary>Teknisk</summary>

#### Added
- [`/admin/formats`](app/admin/formats/page.tsx) — server-component med admin-gate, leser `getAllFormatsWithMappings()` + `getFormatMappingAudit(50)`, rendrer `FormatsManager` + `AuditLogList`. Mobil viser 3 intent-tabs (Kompis/Klubb/Solo) + cup-accordion; desktop viser full matrix med stjerne+hake per celle.
- [`lib/formats/getAllFormatsWithMappings.ts`](lib/formats/getAllFormatsWithMappings.ts) — admin-view-helper som henter ALLE formats + ALLE mapping-rader (inkl. is_visible=false / is_active=false). Ikke `unstable_cache`-d siden admin skal se fersk state etter mutasjon.
- [`lib/formats/audit.ts`](lib/formats/audit.ts) — `recordFormatMappingChange()` (wrapper rundt `logAdminEvent` med F3-spesifikt payload) + `getFormatMappingAudit(limit)` (leser `admin_audit_log` filtrert på `event_type='format_mapping_change'`).
- [`app/admin/formats/actions.ts`](app/admin/formats/actions.ts) — 4 server-actions: `toggleVisibility`, `togglePrimary`, `toggleCupEligible`, `toggleActive`. Hver er idempotent (no-op hvis `next === current`), validerer server-side (siste primary kan ikke fjernes; ikke-synlig primary er ikke lov), skriver audit-rad, og kaller `revalidateTag('format-mapping', 'max')` så wizarden ser oppdatert state.
- [`FormatsManager`](app/admin/formats/FormatsManager.tsx) — client-komponent som eier `useOptimistic`-state for hele matrix + cup-section + active-flags. Renderer både desktop matrix og mobile tabs i samme DOM via Tailwind responsive klasser. Server-action submission kjøres i `startTransition` — React rollback-er state automatisk ved feil.
- [`AuditLogList`](app/admin/formats/AuditLogList.tsx) — siste 50 endringer med norsk visningstekst per change-type. Accordion på mobil, åpen seksjon på desktop.
- [`RowStatusChip`](app/admin/formats/RowStatusChip.tsx) — Aktiv/Inaktiv/Ny pill med klikk-handler for active-toggle.
- [`FormatsIcon`](components/icons/Icons.tsx) — ny 3×3-grid-ikon i samme stil som resten av iconset-en, brukt på admin-tile.

#### Changed
- [`app/admin/page.tsx`](app/admin/page.tsx) — ny «Formats»-tile i admin-grid (admin-only), pekes på `/admin/formats`. Eksisterende tile-mønster bevart.
- [`lib/admin/auditLog.ts`](lib/admin/auditLog.ts) — `AdminAuditEventType`-union utvidet med `'format_mapping_change'`.

#### Tests
- 4 Type C render-tester: `FormatsManager.test.tsx` (matrix + tabs + action-dispatching), `RowStatusChip.test.tsx`, `AuditLogList.test.tsx` (entries + empty-state).

Foundation for epic [#270](https://github.com/jdlarssen/golf-app/issues/270) — siste fase. F1 (datamodell), F2 (intent-først wizard) og F3 (admin-mapping) sammen gir kompletten katalog-styrings-løype.

</details>
</details>


---


<details>
<summary><strong>1.40.y — Intent-først wizard (1 oppføring)</strong></summary>

Issue [#272](https://github.com/jdlarssen/golf-app/issues/272), fase 2 av [#270](https://github.com/jdlarssen/golf-app/issues/270). «Sett opp ny runde» starter nå med et arrangement-valg (Kompis / Klubb / Cup / Solo) som filtrerer spillformene i neste steg. Cup-flyten er smeltet inn som ett av de fire valgene — den separate «Opprett ny Cup»-knappen er borte, alt skjer fra samme inngang.

### [1.40.0] - 2026-05-27 · #272

> Når du oppretter en ny runde, velger du først hva slags arrangement: Kompis-runde, Klubb-turnering, Cup eller Solo. Steg 2 viser bare formats som passer til det du har valgt, så listen er kortere og mer relevant. Cup-oppsettet ligger nå i samme flyt — du trenger ikke å lete etter en egen «Opprett ny Cup»-knapp lenger.

<details>
<summary>Teknisk</summary>

#### Added
- [`IntentSelector`](app/admin/games/new/IntentSelector.tsx) — ny wizard step 1 med 4 intent-kort (Kompis / Klubb / Cup / Solo) i 2×2 mobil-grid. Hvert kort er ≥140px høyt med ikon over tekst, radiogroup-aria-mønster så tastatur-nav fungerer.
- [`FormatGrid`](app/admin/games/new/FormatGrid.tsx) — ny wizard step 2 hovedflyt (Kompis / Klubb / Solo). Leser `getFormatsForIntent(intent)` fra F1-helperen, partisjonerer på `is_primary` i UI-laget. Primary-kort i 2×2-grid, sekundære i 2-kolonners kompakt strip.
- [`CupSetup`](app/admin/games/new/CupSetup.tsx) — ny wizard step 2 cup-variant. Lag-navn (2 felt), points-to-win, fourball-allowance-toggle og multi-select av cup-eligible formats. Gjenbruker `createTournamentDraft`-action; multi-select er UI-only i fase 2 (default-all), persistens utsatt til Wave-2-issue.
- [`SideTournamentsBanner`](app/admin/games/new/SideTournamentsBanner.tsx) — informasjons-banner nederst i step 2 som peker til Klar-steget for side-tournament-oppsett.
- [`lib/formats/icons.tsx`](lib/formats/icons.tsx) — slug → ikon-komponent-mapping for de 6 seedede formats + en generisk fallback for fremtidige slugs. 28×28 inline-SVG i samme stil som `ModeSelector` for visuell konsistens.

#### Changed
- [`GameWizard`](app/admin/games/new/GameWizard.tsx) — 4-stegs → 5-stegs flyt. Nye steg-titler: Arrangement → Format → Bane og tidspunkt → Spillere → Klar. Cup-creation diverger til 2-stegs flyt (Intent → CupSetup) som submitter direkte til `createTournamentDraft`. Cup-link (`?tournament_id=...`) går fortsatt gjennom standard 5-stegs flyt med format låst via `lockGameMode`.
- [`useGameFormState`](app/admin/games/new/useGameFormState.ts) — ny `formatChosen`-boolean så step 2 kan vite om bruker har klikket et format eller om `gameMode` bare er default-en. Settes til true når `handleModeChange` kalles eller når `initialValues.game_mode`/`lockGameMode` passerer eksplisitt format inn.
- [`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx) og [`app/opprett-spill/page.tsx`](app/opprett-spill/page.tsx) — pre-fetcher format-katalogen for alle ikke-cup-intents + cup-eligible-listen parallelt (4 unstable_cache-queries), passerer til wizard som props.

#### Tests
- 14 GameWizard-render-tester oppdatert til 5-stegs flyt + ny cup-intent-test. Mode-navigasjon i hver test starter nå med intent-valg + format-valg før bane/spillere/klar.

</details>
</details>


---


<details>
<summary><strong>1.39.y — Netto/brutto-bryter på tvers av alle spillmodi (2 oppføringer)</strong></summary>

Issue [#266](https://github.com/jdlarssen/golf-app/issues/266), oppfølger til [#217](https://github.com/jdlarssen/golf-app/issues/217). Bryteren som fourball-flyten fikk i forrige runde rulles ut til alle spillmodi: stableford, slagspill, singles matchplay, best ball og Texas scramble har nå samme valg mellom netto (med prosent-andel av handicap) og brutto (uten handicap). Mode-navnene er ryddet opp samtidig — `best_ball_netto` og `solo_strokeplay_netto` mister `_netto`-suffixet siden de nå kan spilles begge veier.

### [1.39.1] - 2026-05-27 · #270

> Klargjort under panseret for en mye større format-katalog. Du ser ingenting nytt i appen ennå — alt blir aktivert etter hvert som de nye spilltypene lander.

<details>
<summary>Teknisk</summary>

#### Added
- [supabase/migrations/0047_formats_and_intent_mapping.sql](supabase/migrations/0047_formats_and_intent_mapping.sql) — `formats`-tabell som master-katalog over spilltyper (slug, display_name, icon_key, scoring_module, is_active, is_cup_eligible) og `format_intent_mapping`-tabell for admin-styrt wizard-placement per intent (kompis/klubb/solo). RLS: read for alle authenticated, write kun for admin. CHECK-constraint `primary_implies_visible` på mapping-tabellen. Seeded de 6 eksisterende formats — stableford, best_ball, texas_scramble, solo_strokeplay, singles_matchplay (cup-eligible) og fourball_matchplay (cup-eligible) — med default mapping.
- [lib/formats/getFormatsForIntent.ts](lib/formats/getFormatsForIntent.ts) — tag-cached server-helper som henter synlige formats for en intent, sortert primary-først. `getCupEligibleFormats()`-helper for Cup step-2-pickeren. Begge tagget `format-mapping` for invalidasjon fra senere admin-mutasjoner.
- [lib/formats/validateGameMode.ts](lib/formats/validateGameMode.ts) — `isValidActiveGameMode(slug)` for server-action-validering ved opprettelse av nye games (erstatter DB-CHECK).

#### Removed
- `games_mode_check`-CHECK-constraint på `public.games`. Server-action-validering tar over fordi `formats`-tabellen er ny sannhets-kilde — hver fremtidig format-issue trenger kun en INSERT i `formats`, ingen CHECK-rebuild. Constraint-en ble re-bygget av migrasjon 0046; 0047 dropper den til fordel for formats-katalogen.

Foundation for epic [#270](https://github.com/jdlarssen/golf-app/issues/270) (intent-først wizard-redesign). Issuet: [#271](https://github.com/jdlarssen/golf-app/issues/271).

</details>

### [1.39.0] - 2026-05-27 · #266

> Du kan nå spille brutto (uten handicap) i alle spillmodi — ikke bare fourball. Nytt valg øverst i «Format»-seksjonen lar deg bytte mellom netto (med en andel av handicap) og brutto (ingen handicap). Stableford, slagspill, singles matchplay, best ball og Texas scramble har nå samme bryter som fourball fikk i forrige runde.

<details>
<summary>Teknisk</summary>

#### Added
- Generalisert [`<AllowanceField>`](components/admin/AllowanceField.tsx) i `components/admin/` — mode-agnostisk netto/brutto-toggle med parametrisert `fieldName`, `defaultPct`, `legend`, `description`, `nettoHelperText`, `bruttoHelperText`, `inputLabel`. Kontrollerbar/ukontrollerbar hybrid; `lastNettoPct`-memo så brutto→netto-bytte gjenoppretter forrige verdi; radio-group-navn deriveres fra `fieldName` så flere instanser på samme side ikke kolliderer. 7 unit-tester dekker toggle-tilstandsmaskinen.
- Migrasjon [0046_drop_netto_suffix.sql](supabase/migrations/0046_drop_netto_suffix.sql) — `best_ball_netto` → `best_ball`, `solo_strokeplay_netto` → `solo_strokeplay`. Atomisk transaksjon: drop check constraint, backfill rader, recreate constraint med ny verdi-sett. Kjøres via Supabase MCP samtidig som kode-deploy.
- [`bruttoHelperFor()`](lib/games/allowanceCopy.ts) — per-mode brutto-forklarende tekst delt mellom GameForm og GameWizard så samme copy ikke duplikat-vedlikeholdes. Stableford → «poeng beregnes på gross mot par», matchplay → «scratch-matchplay», osv.

#### Changed
- [GameForm](app/admin/games/new/GameForm.tsx) og [GameWizard](app/admin/games/new/GameWizard.tsx) Section 3 (Format) rendrer nå `<AllowanceField>` for alle modi: fourball (eksisterende), best_ball/stableford/singles_matchplay/solo_strokeplay (ny, skriver til `hcp_allowance_pct`, default 100), texas_scramble (ny, skriver til `texas_team_handicap_pct`, default per team-size 25/10). Texas-AllowanceField har `key={teamSize}` så toggle-state re-initialiseres ved team-size-bytte.
- [`useGameFormState`](app/admin/games/new/useGameFormState.ts): `hcpAllowance` og `texasHandicapPct` endret fra `string` til `number` for å matche AllowanceField-API. `allowanceNum`-alias droppet — staten selv er numerisk. Boundary-konvertering til `String(...)` der HTML `value`-prop eller `InitialValues`-type-kontrakten krever det.
- Mode-rename gjennomført på tvers av kodebasen (~50 filer): `GameMode`-union, `MODE_LABELS`, scoring-modul-filnavn (`bestBallNetto.ts` → `bestBall.ts`, `soloStrokeplayNetto.ts` → `soloStrokeplay.ts`), validator-funksjonsnavn (`validateBestBallNetto` → `validateBestBall`, etc.), mail-templates, leaderboard-views, test-fixturer og JSDoc-kommentarer. Mode-router-resultattype `BestBallNettoResult` ble `BestBallResult`; lokal per-hull-helper i `bestBall.ts` renamed til `BestBallHole` for å unngå navnekollisjon.

#### Removed
- [Section 6 (`AdvancedSettingsSection`)](app/admin/games/new/sections/AdvancedSettingsSection.tsx) mister allowance-blokken (både non-texas HCP-allowance-input og Texas Lag-handicap-input + tilhørende `Input`-import og state-destructures). Section 6 har nå kun peer-approval + visibility + sideturnering — single-purpose «Innstillinger».
- [`<FourballAllowanceField>`](components/cup/FourballAllowanceField.tsx) slettet (sammen med tom `components/cup/`-mappe) — alle tre callere (cup-create-form, GameForm, GameWizard) migrert til den generaliserte `<AllowanceField>` med fourball-spesifikke props.

</details>
</details>


---


<details>
<summary><strong>1.38.y — Four-ball matchplay (Ryder Cup fase 2) (1 oppføring)</strong></summary>

Issue [#217](https://github.com/jdlarssen/golf-app/issues/217), fase 2 av [#47](https://github.com/jdlarssen/golf-app/issues/47). Cup-grunnmuren fra fase 1 utvides med four-ball matchplay: 2 mot 2 med best-ball-aggregering per hull, matchplay-overlay som regner ut «X up», «AS» og «3&2» på samme måte som singles-matchplay. Hver cup setter sin egen handicap-andel: netto med valgfri prosent, eller helt brutto.

### [1.38.0] - 2026-05-26 · #266

> Du kan nå sette opp fourball-matches (2 mot 2) i Ryder Cup-turneringene dine. Hvert lag har to spillere, hver med sin egen ball. Laget vinner hullet med den laveste netto-scoren av de to, og lagene møtes hull-for-hull som matchplay. Du velger handicap-andelen per cup: 85 % for en vanlig runde med kompisene, eller 0 % for ekte Ryder Cup-stemning helt uten handicap.

<details>
<summary>Teknisk</summary>

#### Added
- Ny scoring-modus `fourball_matchplay` i [lib/scoring/modes/fourballMatchplay.ts](lib/scoring/modes/fourballMatchplay.ts) — 2v2 best-ball med matchplay-overlay. Komponerer eksisterende helpers: `applyAllowance` + `strokesForHole` per spiller, `bestBallForHole` for lag-best per hull, og `classifyMatchplayHole` + `computeMatchResult` (begge fra singles) for hull-utfall og match-format. Empty-shell defensive ved 0/1/3-spiller-context. 17 unit-tester dekker happy-path, mat-em, AS, allowance 0/50/85/100, blandet-kjønn-tees, og partial-state.
- Migrasjon [0045_fourball_matchplay.sql](supabase/migrations/0045_fourball_matchplay.sql) utvider `games_mode_check` med `fourball_matchplay` og legger til `tournaments.fourball_allowance_pct` (smallint, 0..100, default 85 = WHS-standard). `0` betyr brutto, `1..100` betyr netto med den prosenten — én kolonne dekker begge tilstander.
- Validator [`validateFourballMatchplay`](lib/games/gamePayload.ts) håndhever 4 spillere fordelt 2-2 ved publish, range 0..100 på `fourball_allowance_pct`. 13 nye validator-tester.
- Shared client component [components/cup/FourballAllowanceField.tsx](components/cup/FourballAllowanceField.tsx) — netto/brutto-toggle med synlig allowance-input når netto er valgt. Brukes både i cup-create-form og game-wizard. Cross-wizard-utrulling av samme mønster på andre game-modes spores i [#266](https://github.com/jdlarssen/golf-app/issues/266).
- [getCupSnapshot](lib/cup/getCupSnapshot.ts) generaliserer side1/side2 til arrays for å støtte både singles (1+1) og fourball (2+2). For fourball-matches kjøres `computeFourballMatchplay` og navn joines med «/» (eks. «Per/Knut mot Lise/Eva»). Cup-leaderboard viser lag-fokusert result-tekst («3&2 til Lag Skog») for fourball, spiller-fokusert for singles.
- Per-game scorekort ([app/games/[id]/scorecard/page.tsx](app/games/%5Bid%5D/scorecard/page.tsx)) og match-leaderboard ([app/games/[id]/leaderboard/page.tsx](app/games/%5Bid%5D/leaderboard/page.tsx)) får fourball-rendring: 4 spillere fordelt 2+2 i scorecard-kolonner, matchplay-status i header («Laget ditt er X up etter N hull»), lag-best highlightet per hull, og ny `FourballMatchplayView` med lag-navn fra `tournaments` når matchen tilhører en cup.

#### Changed
- Cup-detalj-side ([app/admin/cup/[id]/page.tsx](app/admin/cup/%5Bid%5D/page.tsx)) erstatter «+ Opprett match»-link med to knapper: «+ Singles match» og «+ Fourball match», hver med riktig `?game_mode=` query.
- Game-wizard ([app/admin/games/new/page.tsx](app/admin/games/new/page.tsx), [GameWizard.tsx](app/admin/games/new/GameWizard.tsx), [GameForm.tsx](app/admin/games/new/GameForm.tsx)) leser `?game_mode=` og pre-fyller mode + team_size + match-label («Fourball N» basert på antall eksisterende fourball-matches i cupen). For fourball pre-fylles `fourball_allowance_pct` fra cup-rad, og netto/brutto-toggle vises i wizarden. Banner-copy speiler valgt modus.
- `CupMatchInput`-shape utvidet med valgfri `gameMode`-discriminator så UI kan velge spiller- vs. lag-fokusert result-tekst.

</details>
</details>
</details>


---



<details>
<summary><strong>Baner, selvreg & sideturnering (#223 m.fl.) — 13 serier</strong></summary>

<details>
<summary><strong>1.37.y — Funn-seksjon på hjem-siden (2 oppføringer)</strong></summary>

Issue [#257](https://github.com/jdlarssen/golf-app/issues/257). Liten oppfølger til selv-påmeldings-flyten: når du logger inn ser du nå åpne turneringer du kan melde deg på rett på hjem-siden, og forespørslene dine som venter på godkjenning.

### [1.37.1] - 2026-05-26 · #257

> Velkomst-teksten på hjem-siden bytter nå når det faktisk finnes en åpen turnering du kan melde deg på. Før kunne du se «Be en arrangør om å invitere deg» rett over en seksjon med turneringer å melde seg på — litt rart. Nå sier den «Velg en turnering under» i stedet.

#### Fixed
- [app/page.tsx](app/page.tsx) — `getDiscoverableGames`-fetchen flyttet opp før empty-state-grenen så `hasDiscoveryContent`-flagget kan styre velkomst-tekstvalget. Tre-grens-conditional: `canCreateGame` → opprett-CTA, `hasDiscoveryContent` → «Velg en turnering under», ellers «Be en arrangør om å invitere deg».
- [app/HomeDiscoverySection.tsx](app/HomeDiscoverySection.tsx) tar nå `data`-prop i stedet for å gjøre egen fetch. Caller (`page.tsx`) henter data én gang og gjenbruker det for både tekstvalg og rendring.

### [1.37.0] - 2026-05-26 · #257

> Når du logger inn på Tørny ser du nå alle åpne turneringer du kan melde deg på, rett på hjem-siden. Hvis du har sendt en forespørsel som venter på godkjenning, dukker den også opp her, så du slipper å lete etter den i innboksen.

#### Added
- [lib/games/getDiscoverableGames.ts](lib/games/getDiscoverableGames.ts) — server-side helper som henter to lister via admin-client: åpne spill (`registration_mode = 'open'`, status pre-active) brukeren ikke er påmeldt og ikke har aktiv forespørsel på, pluss egne pending-rader fra `game_registration_requests`. Filtrerer i SQL via `not('id', 'in', ...)` med set-union av joined + requested game-ids.
- [app/HomeDiscoverySection.tsx](app/HomeDiscoverySection.tsx) — server-component med to lister (open games m/ «Meld meg på»-knapp til `/signup/[shortId]`, pending requests m/ status-tekst). Returnerer `null` når begge listene er tomme så hjem-sidens dagens tom-tilstand beholdes.
- Seks Vitest-tester for helperen dekker tom-tilstand, exclude-allerede-påmeldte, exclude-pending-request, course-join-mapping, team-request-mapping, og approved-filter (pending kun, ikke approved).

#### Changed
- [app/page.tsx](app/page.tsx) wirer `HomeDiscoverySection` inn for non-admin-brukere mellom velkomst-section og footer. Admin/trusted-creator ser ingen endring — de har egne CTAer for å opprette spill.
</details>


---


<details>
<summary><strong>1.36.y — Selv-påmelding til turnering (2 oppføringer)</strong></summary>

Issue [#199](https://github.com/jdlarssen/golf-app/issues/199). Du kan nå sette opp et spill og dele en lenke i stedet for å invitere hver spiller manuelt. For Scramble og andre lagspill kan spillerne samle sitt eget lag, og kapteinen melder på medspillerne med navn eller e-post. Du velger selv om hvem som helst med lenken kan melde seg på, om du vil godkjenne hver påmelding, eller om du fortsatt vil styre invitasjonene som du gjør i dag.

### [1.36.1] - 2026-05-26 · #199

> Påmeldings-lenken bruker nå ren engelsk i URL-en (`/signup/...`) i stedet for `/påmelding/...`, slik at å-tegnet ikke lager trøbbel når lenken deles via SMS eller e-post.

<details>
<summary>Teknisk</summary>

#### Fixed
- Vercel-edge feilet å rute URL-encoded `/p%C3%A5melding/...` til siden — ASCII-pathen `/signup/[shortId]` unngår problemet helt. Filsystem-rename: `app/påmelding` → `app/signup`, `app/admin/games/[id]/påmeldinger` → `app/admin/games/[id]/signups`, `e2e/påmelding` → `e2e/signup`. Alle URL-strenger i koden, mail-templates, proxy-whitelist og tester er oppdatert. Norsk UI-tekst («Påmeldinger»-overskrifter, mail-subjects, knappe-tekster) står urørt — det er kun selve URL-pathen som er ASCII.

</details>

### [1.36.0] - 2026-05-26 · #166

> Sett opp spillet, kopier lenken, og slipp den i Slack-gruppa, lagpraten eller hvor folk enn er, så melder de seg på selv. Da slipper du å sende invitasjoner én etter én. Vil du ha mer kontroll? Sett påmeldingen til «forespørsel — jeg godkjenner», og du får varsel hver gang noen ber om plass. Kapteinen kan samle sitt eget Scramble-lag: kjente Tørny-brukere får varsel i innboksen, ukjente e-poster får en invitasjon. Spillerne kan også trekke seg selv hvis det skjer noe — du slipper å rydde plassen for dem som faller fra.

<details>
<summary>Teknisk</summary>

#### Added
- Fire nye migrasjoner ([supabase/migrations/0041_games_self_registration_columns.sql](supabase/migrations/0041_games_self_registration_columns.sql) m.fl.) gir `games.registration_mode` (`invite_only`/`manual_approval`/`open`), `games.registration_type` (`solo`/`team`/`both`), og en 8-char `short_id` per spill for delbar lenke. Ny `game_registration_requests`-tabell holder pending-forespørsler + audit-trail for godkjenninger og lag-formasjon. To nye RLS-policies på `game_players` lar spilleren inserte egen rad i open-modus og slette egen rad pre-start.
- Offentlig påmeldings-flate på `/påmelding/[shortId]` med tre flyter: open (direkte-påmelding), manual_approval (forespørsel med valgfri hilsen), og invite_only (les-bare-melding). Kaptein-flyt for lag-påmelding lar første spiller fylle inn medspillere fra eksisterende-bruker-roster eller via e-post.
- Admin-side `/admin/games/[id]/påmeldinger` med approve/reject (cascade for lag-medlemmer), filter-tabs for status, og kopier-lenke-knapp på `/admin/games/[id]`.
- Fem nye notifikasjons-typer (`team_invite`, `registration_request`, `registration_approved`, `registration_rejected`, `team_member_withdrew`) m/ Zod-skjemaer, NotificationCard-rendering og deeplinks i innboksen.
- Fire nye mail-templates ([lib/mail/registrationRequest.ts](lib/mail/registrationRequest.ts), [registrationApproved.ts](lib/mail/registrationApproved.ts), [registrationRejected.ts](lib/mail/registrationRejected.ts), [teamInvitation.ts](lib/mail/teamInvitation.ts)) — best-effort send med gating på `shouldAlsoSendMail` (off-app-terskel), unntatt team-invitation som alltid sendes til ukjente e-poster.
- Rate-limit-helper [lib/auth/registrationRateLimit.ts](lib/auth/registrationRateLimit.ts) med tre buckets (per bruker, per IP, per spill) på `consume_admin_rate_limit`-RPC. Honeypot-felt på alle public server-actions.
- Self-withdraw-flyt på dedikert konfirmasjons-side `/games/[id]/trekk-fra` per destructive-actions-pattern. Notify til kaptein hvis trekk-spilleren var lag-medlem.

#### Changed
- `GameWizard` har nytt «Påmelding»-felt-gruppe på format-steget med radio for modus og type. «Type»-radio er disablet for spill-moder uten lag-konsept (stableford, singles_matchplay, solo_strokeplay_netto). Spiller-steget blir valgfritt når modus er ikke-invite_only — admin kan opprette tomme spill og la folk melde seg på selv.
- `app/(auth)/login/actions.ts:verifyCode` sjekker `games.registration_type` før den auto-inserter solo-rader i `game_players` etter OTP-aksept — unngår CHECK-constraint-brudd på team-only spill.
- `lib/notifications/types.ts` utvidet med fem nye `kind`-verdier og Zod-skjemaer. `registration_request.request_id` er optional fordi open-modus ikke har en request-rad å peke til (kun manual_approval).

#### Notes
- `registration_mode = 'open'` for ukjente e-poster krever at `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` er aktivert i Vercel ([#166](https://github.com/jdlarssen/golf-app/issues/166)). Hvis flagget er av, faller open-modus tilbake til «kjente brukere kan melde seg på» og ukjente møter samme `user_not_found`-feilen som før.
- Deferred team-attach for ukjente brukere skjer på `/påmelding/[shortId]/team`-siden, ikke i auth-hooken. Siden detekterer en pending `invitations`-rad for spillet og tilbyr en «Bli med på lag»-knapp som plukker nyeste kaptein-request via `created_at DESC`-heuristikk.
- 2770 LOC fordelt over 14 chunks. Tests: 1369 grønne ved feature-completion.

</details>
</details>


---


<details>
<summary><strong>1.35.y — Trygghetsnett for tee-lengde (1 oppføring)</strong></summary>

Et mykt varsel under banelengde-feltet i bane-admin når tallet ligger utenfor det som er typisk for norske baner. Fanger tastefeil før de havner i databasen, uten å blokkere lagring ([#236](https://github.com/jdlarssen/golf-app/issues/236)).

### [1.35.0] - 2026-05-26 · #236

> Når du taster inn banelengde for en tee i bane-admin, sier appen nå fra hvis tallet ser uvanlig ut for norske forhold. Du blir ikke stoppet fra å lagre — det er bare en hjelpende hånd for å fange åpenbare tastefeil. Hvilket «typisk» intervall som gjelder, avhenger av hvilke kjønn du har lagt inn rating for på tee-en (herre, dame, junior, eller en kombinasjon).

<details>
<summary>Teknisk</summary>

#### Added
- [lib/courses/teeLengthWarning.ts](lib/courses/teeLengthWarning.ts) — pure helper `getTeeLengthWarning(tee)` som regner ut warning-tekst fra `length_meters` + hvilke gender-blokker (mens/ladies/juniors) som er fylt ut. Range-grenser er romslige (±100m) rundt typiske norske tall: herrer 5300–6600 m, damer 4700–5900 m, junior 4400–5600 m. Union-strategi for tee-er med flere gender-ratings (vanligst). Returnerer `null` når ingen gender er aktiv eller length-feltet er tomt/ugyldig. 25 unit-tester dekker alle 7 gender-kombinasjoner + grense-verdier + invalid input.
- `warning?: string | null`-prop på [components/ui/Input.tsx](components/ui/Input.tsx) som rendrer i `text-warning` (amber) på samme plass som `hint`. Prioritet: `error` > `warning` > `hint`. Eksisterende callsites upåvirket.

#### Changed
- [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) sender `getTeeLengthWarning(tee)` til Banelengde-input-en for hver tee-boks. Warning oppdateres reaktivt når admin endrer length-feltet eller toggler dame-/junior-rating-blokkene.

#### Notes
- DB CHECK på `tee_boxes.length_meters` (1000–12000) endres ikke; warning er ren UI-veiledning og blokkerer ikke lagring. Server-actions berøres ikke.
- Bevisst en hårsbredd videre enn de eksakte tallene i issue #236 (5400–6500 / 4800–5800 / 4500–5500) for å unngå falske advarsler på grenseverdier som 6550 m på en lang herretee.
- Wirer side om side med per-kjønn typisk slope/CR-hint fra 1.30.1 (issue #235). De to gir komplementær veiledning: slope/CR-hint som statisk anker mot tastefeil, length-warning som dynamisk respons på faktisk innskrevet tall.

</details>
</details>


---


<details>
<summary><strong>1.34.y — Per-kjønn-overstyring av hull-par (1 oppføring)</strong></summary>

Issue [#240](https://github.com/jdlarssen/golf-app/issues/240). Tørny støtter nå at hull kan ha avvikende par for damer eller junior — typisk dame-par-5 der herrer spiller par-4 fordi dame-tee er plassert kortere før et vannhinder. Stableford-poenget regnes riktig per spiller, og par-displayer viser en liten stjerne på hull med par-avvik.

### [1.34.0] - 2026-05-26 · #240

> Spillere på dame-tee eller junior-tee får nå riktig par-referanse på hull der tee-en er plassert kortere enn herrenes. Du som arrangerer kan registrere avvik per kjønn i bane-redigeringen — for det vanlige tilfellet der alle kjønn har samme par, ser admin og spillere ingen forskjell.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `supabase/migrations/0040_course_holes_per_gender_par.sql` — `course_holes` har nå `par_mens`, `par_ladies`, `par_juniors` (alle NOT NULL, CHECK 3-6). Backfill setter alle tre kolonner lik gammel `par`-verdi før gammel `par` droppes (forced cutover — ingen produksjons-baner hadde avvikende par på migrasjons-tidspunktet).
- `lib/scoring/modes/parResolver.ts` — `parFor(hole, gender)` returnerer `parByGender[gender ?? 'mens']` eller `hole.par` som fallback. Brukes av alle 4 mode-modulene.
- `lib/games/parDisplay.ts` — `hasParDifference`, `formatOtherGendersPar`, `parForPlayer`-helpere + 14 unit-tester. UI-laget bruker disse til avvik-indikator (statisk `<sup title="...">`-asterisk; tooltip på desktop, long-press på iOS).
- Per-kjønn-par-seksjon i CourseForm: ekspandert toggle under hovedhull-listen for «Avvikende par for damer» og «Avvikende par for junior». Default-kollapset for ~99 % av baner; åpen ved mount på edit-flyt hvis kursen faktisk har avvik. Fjern-knapp tilbakestiller per-kjønn-overstyring til hovedraden. 9 nye tester i `CourseForm.test.tsx`.

#### Changed
- `ScoringHole` får valgfri `parByGender: { mens; ladies; juniors }`-felt. `ScoringPlayer` får valgfri `teeGender: 'mens' | 'ladies' | 'juniors'`. Begge optional — eksisterende test-fixtures uten dem faller tilbake til `hole.par`.
- Alle 4 mode-moduler (`stableford.ts`, `bestBallNetto.ts`, `singlesMatchplay.ts`, `texasScramble.ts`) leser nå par via `parFor(hole, player.teeGender)`. Stableford-poeng-beregningen er den eneste modus som påvirker ranking; de andre tre eksponerer per-spiller-par på celle-shape for UI-rendering. Texas scramble bruker kapteinens (lex-minste userId) `teeGender` som lag-representant. 13 nye scoring-tester.
- Legacy `lib/leaderboard.ts` (best-ball-netto-routen) får parallell støtte: `LbHole.parByGender`, `LbPlayer.teeGender`, `PlayerHoleCell.par` (per-spiller), `TeamHoleRow.parByGender` (propagert for UI). Speilet mode-router-shape.
- Alle 14 SELECT-call-sites mot `course_holes` plukker alle tre par-kolonner. 6 mapper-call-sites (leaderboard, hull-detail, scorecard, submit, approve, statistikk-side + 4 mail-helper-blokker) fyller `parByGender` på ScoringHole og `teeGender` på ScoringPlayer.
- Server-actions for kurs-opprettelse/-edit parser `hole_${i}_par_mens/_ladies/_juniors` fra FormData og setter alle tre kolonner i `course_holes`-INSERT. Tee-boks `par_total_<gender>` regnes nå ut fra summen av per-kjønn-hull-par (auto-sync).
- HoleHero, leaderboard-hull-tab og scorekort viser asterisk etter par-tallet på hull med avvik. Title-attributtet sier «Damer: 5, junior: 4».
- Scorekortet bruker `parForPlayer(parByGender, me.tee_gender)` istedenfor hardkodet `par_mens` for spillerens egen rad (også for stableford-poeng-beregningen i LayoutB).

#### Notes
- Stroke-index per kjønn er ikke i scope — dame-tee bruker normalt samme SI-fordeling. Hvis et behov dukker opp: egen kontrakt.
- Blandet-kjønn Texas-scramble-lag bruker kapteinens `teeGender` som lag-par-default. Fungerer for vanlige tilfeller; sjeldne edge-cases (lag på 4 med to herrer og to damer på avvikende-par-hull) får herre-par fordi kapteinen typisk er en herre. Refines hvis bruk-mønsteret krever det.
- Historiske spill: `course_holes` er ikke frozen ved game-start, så en endring av `par_ladies` på en bane kan endre stableford-poeng for ferdige spill på den banen. Pre-eksisterende svakhet (gjelder også gammel `par` og `stroke_index`); ikke utvidet i denne lanseringen.

</details>
</details>


---


<details>
<summary><strong>1.33.y — Sekretariatet, friksjons-rydding (2 oppføringer)</strong></summary>

Tredje runde med små admin-polish-grep fra fase 1 av [#223](https://github.com/jdlarssen/golf-app/issues/223). Mål: kortere vei til recovery når noe går skeivt i bane-skjemaet. Patch lagt på toppen som forvarsler admin når par eller stroke-indeks endres på en bane med spill som pågår.

### [1.33.1] - 2026-05-26 · #223

> Når du endrer par eller stroke-indeks på en bane som brukes i et spill som pågår eller er planlagt, spør appen nå om du er sikker. Mid-runde-endringer påvirker netto-resultatet for spillere som allerede har levert kort, så du får sjansen til å avbryte før lagring går gjennom. Bane-navn og tee-data trigger ingen advarsel — kun hull-endringene som faktisk skifter scoringen.

<details>
<summary>Teknisk</summary>

#### Added
- `hasHoleChanges(initial, current)`-helper i [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) sammenligner per-hull `par` og `stroke_index` med baselinen fra server. Returnerer `false` når initial-listen er undefined (create-flyten har ingen baseline) eller når alle par/SI matcher. Defensive default ved manglende hull i initial.
- Ny prop `affectedGamesCount` (default 0) på `CourseForm`. `onSubmit`-handler trigger `window.confirm` kun når både `affectedGamesCount > 0` og `hasHoleChanges` returnerer true. Cancel kaller `event.preventDefault()` så form-state beholdes uendret.
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/%5Bid%5D/edit/page.tsx) henter `count: 'exact', head: true` mot `games` filtrert på `course_id` + `status IN ('active', 'scheduled')` parallelt med hull/tee-fetchene. Resultatet sendes som prop til `CourseForm`. Count-feil defaultes til 0 (fail-open) så transient DB-feil ikke blokkerer redigering.
- Fem nye vitest-cases for `hasHoleChanges` (no-change, par-change, SI-change, manglende initial, kortere initial-liste) og fem cases for confirm-gaten (vises ved par-endring + count > 0, ikke ved uendrede hull, ikke ved count 0, ikke på /new, entall-form ved count 1).

#### Notes
- Tee-data (slope/CR/length) trigger ikke advarselen fordi `game_players.course_handicap` fryses ved game-start. Kun per-hull-par og stroke-indeks leses live av scoring-laget under et pågående spill.
- Server-action `updateCourse` har ingen ny blokk — advarselen er rent UX-laget. Admin kan fortsatt lagre par-endringer mid-spill om de gjør det bevisst.
- `window.confirm` valgt over custom modal for å matche eksisterende mønster i [DeleteCourseButton.tsx](app/admin/courses/%5Bid%5D/edit/DeleteCourseButton.tsx). Plain-text-begrensningen er årsaken til at dialogen viser antall, ikke spill-navn.

</details>

### [1.33.0] - 2026-05-26 · #238

> En liten «Tøm dette kjønnet»-lenke i bane-skjemaet rydder slope og CR for ett kjønn med ett trykk. Hjelper hvis du har fylt inn bare det ene feltet og får «kan ikke lagre halve sett»-feilen.

<details>
<summary>Teknisk</summary>

#### Added
- «Tøm dette kjønnet»-lenke i [GenderRatingBlock](app/admin/courses/CourseForm.tsx) i bane-skjemaet — nullstiller `slope_<gender>` og `course_rating_<gender>` i ett klikk uten å kollapse blokken. Synlig kun når minst ett felt har innhold.
- Visibility-regelen for herrer-blokken er asymmetrisk: skjult på new-flyten så lenge feltene matcher default (slope 113 / CR 70.0), synlig på edit-flyten så snart minst ett felt har innhold. Hindrer at admin utilsiktet tømmer prefylte defaults på en fersk bane.
- Ni nye Vitest-tester i [CourseForm.test.tsx](app/admin/courses/CourseForm.test.tsx) som dekker visibility-regelen (new vs edit, herrer-default vs damer-tom), clear-handler-semantikk, og at blokken forblir ekspandert etter Tøm. Refs [#238](https://github.com/jdlarssen/golf-app/issues/238).

#### Changed
- «Fjern dame-rating» / «Fjern junior-rating»-knappene erstattes av én konsekvent «Tøm dette kjønnet»-lenke på alle tre kjønn. Etter Tøm forblir blokken ekspandert med tomme felt — tom slope + tom CR for et kjønn er gyldig submit-state, så ingen affordance for å re-kollapse trengs.
- `toggleGenderExpand` forenklet til `expandGender` siden clear-pathen er flyttet ut i sin egen funksjon `clearGender`.

#### Notes
- Ingen endring i server-actions, migrasjoner eller validering. Partial-rating-feilmeldingen («Hver tee må ha både slope og CR (eller ingen av dem) per kjønn») trigger fortsatt korrekt — den nye knappen er en raskere recovery-flyt for samme feil, ikke en omveiing av regelen.

</details>
</details>


---


<details>
<summary><strong>1.32.y — «Sist spilt»-indikator på bane-listen (1 oppføring)</strong></summary>

Issue [#239](https://github.com/jdlarssen/golf-app/issues/239). Vedlikeholds-flaten for baner viser nå når hver bane sist ble brukt, og lar deg sortere og filtrere på det.

### [1.32.0] - 2026-05-26 · #239

> Bane-listen viser nå når hver bane sist ble brukt i et spill, og du kan sortere på det. Det nye filteret «Spilt siste 30 dager» plukker ut banene som er i bruk nå. Det blir enklere å skille aktive baner fra gamle eksperimenter når katalogen vokser.

#### Added
- Ny pure helper `app/admin/courses/derive.ts` med `deriveLastPlayedAt(games)` + flyttet `deriveCourseItem` ut av `page.tsx` for å gjøre dem rene testbare uten server-deps. `deriveLastPlayedAt` returnerer MAX av `ended_at` for finished spill og `scheduled_tee_off_at` for active; ignorerer draft + scheduled.
- Ny sort-option «Sist spilt» i `CoursesLedgerClient` (`?sort=last_played`). Sorterer `last_played_at` desc med null-baner sist og navn-asc tie-break.
- Ny filter-chip «Spilt siste 30 dager» (`?recent=1`). Cutoff beregnes client-side på render-tid via `Date.now()`; vinduet er en konstant i komponenten (30 dager).
- 11 nye unit-tester i `app/admin/courses/derive.test.ts` for `deriveLastPlayedAt` + `deriveCourseItem`. 11 nye tester i `CoursesLedgerClient.test.tsx` for kicker-prioritet, ny sort, ny filter, URL-state-roundtrip.

#### Changed
- `getCourses` embed-fetcher nå `games(status, scheduled_tee_off_at, ended_at)` i samme PostgREST-call (var: `games(status)`). Ingen ekstra round-trip; embed-shapen er fortsatt single-fetch.
- `rowKicker` prioriterer «Sist spilt {dato}» når banen har vært spilt; ellers fallback til eksisterende «Endret»/«Lagt til»-logikk.
- `CoursesLedgerItem` utvidet med `last_played_at: string | null`. `SortBy`-union utvidet med `'last_played'`. `Filters` utvidet med `playedRecently: boolean`.

#### Notes
- Ingen migrasjon. `games.scheduled_tee_off_at` (fra [0010](supabase/migrations/0010_scheduled_status_and_tee_off.sql)) og `games.ended_at` (fra [0001](supabase/migrations/0001_initial_schema.sql)) finnes allerede.
- Cache er react `cache`-wrappet og refetcher per request — nye spill plukkes opp på neste page-load uten `revalidateTag`-kobling.
- Den eksisterende statiske «sortert nyeste først»-teksten på `CourseCountLine` er ikke oppdatert til å speile dynamisk sort. URL-styrt sort kan misvise tellelinjen; egen oppgave hvis det blir et problem.
</details>


---


<details>
<summary><strong>1.31.y — Ryder Cup-stil cuper (2 oppføringer)</strong></summary>

Fase 1 av [#47](https://github.com/jdlarssen/golf-app/issues/47). Du kan nå binde flere matchplay-runder sammen til én lag-vs-lag-cup, og følge fordelingen av point på et felles leaderboard. Patch på toppen ([#234](https://github.com/jdlarssen/golf-app/issues/234)): liten kopier-snarvei på tee-rating-skjemaet.

### [1.31.1] - 2026-05-26 · #223

> Du kan nå kopiere herrer-rating-en til damer og junior med ett klikk når du legger inn en ny bane eller redigerer en eksisterende. Knappen «Kopier til alle kjønn» dukker opp under herrer-feltene så snart slope og CR er fylt ut, og forsvinner igjen når begge andre kjønn har egne verdier. Justér gjerne etterpå om damene faktisk skal ha en annen slope.

#### Added
- [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) `copyMensToAllGenders(index)` — én ny click-handler som setter `slope_ladies`/`course_rating_ladies`/`slope_juniors`/`course_rating_juniors` til herrer-verdiene og auto-ekspanderer kollapsede dame/junior-blokker. Tekst-lenke-stil-knapp (`text-[11px] text-muted hover:text-text`) rendres mellom herrer-blokken og dame-toggle-en, kun synlig når herrer er fullt utfylt og minst ett dame/junior-felt mangler verdi.
- Seks nye Vitest-cases i [app/admin/courses/CourseForm.test.tsx](app/admin/courses/CourseForm.test.tsx) — dekker synlighet (herrer-tom, begge kjønn-fulle), klikk-ekspansjon med riktig verdi, overskriv-semantikk på allerede-fylte dame-felt, og per-tee uavhengighet i en to-tee-konfigurasjon.

#### Notes
- Overskriv-semantikk er bevisst: klikket setter alltid dame/junior til herrer-verdiene. Forenkler mental modell mot «fyll-bare-tomme»; admin kan justere etterpå hvis tallene faktisk skal være forskjellige (per issue-tekst).
- `par_total` per kjønn kopieres ikke. Den er auto-beregnet fra hull-pars og er kun lese-verdi i `GenderRatingBlock`-fieldset-en.
- Utsatt fra Fase 1 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223).

### [1.31.0] - 2026-05-26 · #47

> Du kan nå sette opp en cup som binder flere matchplay-runder sammen mot hverandre. Lag «Team Skog» og «Team Sjø» kan møtes over flere matches gjennom helgen, og første lag til point-målet (typisk 4,5 av 8) vinner cupen. Hver match teller som vanlig — vunnet match = 1 point, halvert (AS) = 0,5 til hvert lag. Når cupen avsluttes går det ut en e-post til alle deltakere med vinneren og sluttresultatet.

#### Added
- Ny migrasjon [supabase/migrations/0039_tournaments.sql](supabase/migrations/0039_tournaments.sql) med `tournaments`-tabell (navn, lag-navn, points_to_win, status draft/active/finished, winner_team) + `games.tournament_id` (FK med `ON DELETE SET NULL`) + `games.tournament_match_label`. RLS lar alle innloggede lese cup-en.
- Ren scoring-aggregator [lib/cup/computeCupLeaderboard.ts](lib/cup/computeCupLeaderboard.ts) — mapper match-summary-er til lag-points (1 / 0,5 / 0) og deklarerer vinner når point-mål er nådd. 11 unit-tester dekker alle kombinasjoner (vunnet, halvert, in-progress, blanding, vinner-deklarert, eksplisitt winner_team fra DB).
- Komposisjons-laget [lib/cup/getCupSnapshot.ts](lib/cup/getCupSnapshot.ts) — laster tournament + matches + game_players + scores + course_holes, kjører `singlesMatchplay.compute` per match, aggregerer til master-leaderboard. Returnerer `{tournament, leaderboard, roster}` for både admin-detalj og offentlig leaderboard.
- Server-actions i [lib/cup/actions.ts](lib/cup/actions.ts): `createTournamentDraft`, `updateTournament`, `startTournament` (krever ≥2 matches), `finishTournament` (avgjør winner_team fra leaderboard), `deleteTournament`. Alle gated på `requireAdmin`. Start/finish kjører best-effort `Promise.allSettled`-fan-out til deltakere via to nye Resend-maler i [lib/mail/cupStartedNotification.ts](lib/mail/cupStartedNotification.ts) og [lib/mail/cupFinishedNotification.ts](lib/mail/cupFinishedNotification.ts).
- Admin-flate på [app/admin/cup/](app/admin/cup): list-side, opprett-side, detalj-side (cup-info, master-leaderboard-preview, lag-roster, matches-liste, start/avslutt-knapper), og dedikert slett-konfirmasjons-side per destructive-actions-pattern.
- Offentlig master-leaderboard på [app/cup/[id]/page.tsx](app/cup/%5Bid%5D/page.tsx). Store lag-point med `font-serif tabular-nums 5xl`, champagne-gold-accent på vinner-lag når cup-en er ferdig. Auth-gated av `proxy.ts` (innlogget-only, ikke admin-only).
- «Cuper»-tile på [app/admin/page.tsx](app/admin/page.tsx) med count av aktive cuper.

#### Changed
- [app/admin/games/new/page.tsx](app/admin/games/new/page.tsx) leser nå `?tournament_id=` og pre-fyller `game_mode='singles_matchplay'` + `lock_game_mode=true` + auto-genererer match-label «Singles N». Submit redirecter tilbake til `/admin/cup/[id]` med revalidateTag for `tournament-${id}`. Hidden inputs i både `GameForm` og `GameWizard.FormDataInputs` slik at både wizard-mode og full-mode-form-en sender med cup-koblingen.
- `lib/database.types.ts` regenerert med nye `tournaments`-rad + `games.tournament_id` / `tournament_match_label`-kolonner.
</details>


---


<details>
<summary><strong>1.30.y — Spill-invitasjoner med bell-prikk (2 oppføringer)</strong></summary>

Issue [#182](https://github.com/jdlarssen/golf-app/issues/182). Notifikasjons-systemet kobler seg nå på spill-rosteren. Når admin legger en spiller til på et spill kommer bell-prikken med en gang, både for kompiser som allerede har Tørny og for nye som inviteres på e-post. Patch på toppen ([#235](https://github.com/jdlarssen/golf-app/issues/235)) la til typisk-range-hint på slope/CR-feltene i bane-skjemaet.

### [1.30.1] - 2026-05-26 · #223

> Når du taster slope og CR for en tee, ser du nå hva som er typisk på norske baner — gjør det lettere å fange opp en tastefeil før du lagrer.

#### Added
- [app/admin/courses/CourseForm.tsx](app/admin/courses/CourseForm.tsx) — `TYPICAL_HINTS`-const per kjønn (mens/ladies/juniors) mapper til `{slope, cr}`-tekst. Videresendes til `Input`-komponentens eksisterende `hint`-prop ([components/ui/Input.tsx:29-31](components/ui/Input.tsx:29)), som rendrer muted `text-xs`-tekst rett under feltet. Identisk visuell vekt med eksisterende banelengde-hint.
- Hint-tall: herre slope 110–135 / CR 67–72, dame 115–140 / 68–73, junior 95–125 / 60–68. Bruker norsk lang-tankestrek (U+2013) per humanizer-konvensjon.
- Fire nye vitest-cases dekker hver av de tre kjønns-blokkene + at hint forsvinner når en blokk kollapses. Eksisterende 16 CourseForm-tester upåvirket.

#### Notes
- Statisk hint, ingen dynamisk soft-warning på verdier utenfor typisk range. Begrunnelse: holder kompleksiteten lav og fanger den dominerende feilen («CR-tall i slope-feltet») ved at admin ser intervallet før de taster.
- Beholder eksisterende herre-placeholder (113 / 70.0). Damer/junior beholder tomme placeholders — vi vil ikke pre-foreslå konkrete tall der admin oftere taster verdier som avviker fra suggested-value.
- Utsatt fra Fase 1 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Ingen DB-migrasjon, ingen scoring-impact.

### [1.30.0] - 2026-05-26 · #182

> Spillere som blir lagt til et spill får nå et varsel i appen, i tillegg til e-posten. Bell-prikken lyser så snart admin har lagt deg på rosteren, slik at du oppdager turneringen før spillet starter.

#### Added
- Ny helper `lib/notifications/notifyInvitedToGame.ts`: henter spill + inviter, bygger `invite`-payload og kaller `notify()` best-effort. Skipper finished-spill. Brukes fra alle tre nye call-sites under.
- Ny «Inviter spillere»-card på `/admin/games/[id]` for draft/scheduled-spill: substring-søk i registrerte brukere med per-rad «+ Legg til», pluss e-post-invite-felt under. Mode-aware kapasitets-banner gjør best-ball-card-en utilgjengelig ved 8/8.
- Server-actions `addExistingPlayerToGame` + `inviteEmailToGame` (`app/admin/games/[id]/inviteToGameActions.ts`). Authz via `requireAdminOrTrustedCreator`, status-/kapasitets-/duplikat-checks, idempotent UNIQUE-violation-håndtering.
- Mail-utvidelse `lib/mail/inviteNotification.ts` tar valgfri `gameName`-param. Game-scoped subject: «Du er invitert til {gameName} på Tørny», med spill-navnet også i body-en. Eksisterende friend/admin-invite-bruk er uendret.

#### Changed
- `createGameDraft` + `createAndPublishGame` (`app/admin/games/new/actions.ts`) fyrer `notifyInvitedToGame` for hver ny spiller på rosteren (skipper inviter selv).
- Edit-flytens `updateGameInternal` (`app/admin/games/[id]/edit/actions.ts`) snapshot-er pre-update-rosteren og fyrer notify kun for spillere som er nye i diff-en. Eksisterende spillere får ikke duplikat-varsel når admin lagrer uten endring.
- `verifyCode`-actionen (`app/(auth)/login/actions.ts`) plukker opp game-scoped pending invitasjoner etter OTP-verify, inserter spilleren i `game_players`, og fyrer notify deferred. Login-redirecten kjører uavhengig av om side-effektene lykkes.
- Mark-as-read-hooken på `/admin/games/[id]` markerer nå også `invite`-kind for spillet, slik at bell-prikken forsvinner straks admin/invitee åpner runden.

#### Notes
- `inviteSchema` (`lib/notifications/types.ts`) er uendret — `game_id` forblir strikt ikke-null. Friend-invite og admin-invite uten spill-kontekst fyrer fortsatt kun e-post (ingen in-app-notifikasjon).
- Card-rendering er server-fetcha (limit 200 registrerte brukere) — kompis-skala fyller aldri taket, klubb-skala kan trenge paginering senere.
</details>


---


<details>
<summary><strong>1.29.y — Selv-registrering for nye spillere (1 oppføring)</strong></summary>

Lar nye besøkende få OTP-kode på `/login` uten admin-mellomledd, bak en kill-switch og to lag rate-limit. Forberedelse til å åpne tornygolf.no for spillere utenfor kompisgjengen ([#166](https://github.com/jdlarssen/golf-app/issues/166)).

### [1.29.0] - 2026-05-26 · #22

> Nye besøkende kan nå skrive inn e-posten sin på innloggings-siden og få kode — uten at en admin må invitere dem først. Funksjonen er av i starten og slås på i Vercel manuelt etter at vi har testet den på preview. Et stille rate-vern på baksiden stopper noen som prøver å spamme inn forsøk.

#### Added
- [lib/auth/loginRateLimit.ts](lib/auth/loginRateLimit.ts) — `consumeLoginRateLimit({ email, ip })` gjenbruker `consume_admin_rate_limit`-RPC med nye bucket-prefikser (`login:email:<email>`, `login:ip:<ip>`). Default: 3 sendCode per e-post per 15 min, 10 per IP per 15 min. Service-role-call for å unngå GRANT-justering på en pre-auth RPC. Fail-open på DB-feil så en transient outage ikke låser alle ute. Sju unit-tester dekker happy-path, begge bucket-deny-stier, lowercase-normalisering, custom-limits, RPC-error- og throw-fail-open.
- Ny env-var `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` (default `false`). Når `true`: ikke-inviterte e-poster får `shouldCreateUser=true` mot Supabase Auth OTP og en konto blir laget ved første `verifyOtp`. Kill-switch: sett tilbake til `false` i Vercel og redeploy.
- Conditional hjelpe-tekst under e-post-feltet på `/login` («Skriv inn e-posten din. Er du ny her, lager vi en konto til deg.») kun synlig når flagget er på. Server-resolved env-verdi sendes som prop til client-komponenten så Next.js sin `NEXT_PUBLIC_*`-inlining ikke bites mot client-side condition.
- Tre nye Vitest-suiter på `/login` server-action: flag-on/off-routing, rate-limit-deny på e-post- og IP-bukket (samme `rate_limited`-redirect, ingen leak av hvilken bucket som tripp), honeypot-kortcircuit verifiserer at rate-limit-RPC ikke kalles. Ny component-test for `SendCodeForm` som dekker hjelpe-tekst-toggle. Playwright-smoke utvidet til å asserere default-off-state.

#### Changed
- Empty-state-kopi på `/` for ikke-creator endret fra «Du er klar. Admin setter opp neste runde.» til «Du er klar. Be en arrangør om å invitere deg til neste runde.» Mykere tone for self-registrerte som ikke har en admin i tankene.
- [app/(auth)/login/actions.ts](app/(auth)/login/actions.ts) `sendCode` får nytt rate-limit-trinn mellom honeypot og `signInWithOtp`. Bytte-rekkefølge: honeypot (cheap) → rate-limit (DB-call) → Supabase OTP (kvote-tellende). Begge bucket-trips redirecter til samme `?error=rate_limited` som Supabase sin egen throttle — bruker ser ingen forskjell.

#### Notes
- Trusted-creator-allowlisten utvides IKKE. Self-registrerte uten admin/trusted-status får ingen mulighet til å opprette spill selv før [#22](https://github.com/jdlarssen/golf-app/issues/22) (RLS-revisjon) lander. Det er bevisst — onboarding-kanalen åpnes først, RLS-åpning er sin egen jobb.
- Ingen DB-migrasjon. Gjenbruker eksisterende `admin_action_rate_limit`-tabell og `consume_admin_rate_limit`-RPC fra `0026_admin_action_rate_limit.sql`. Bucket-strengen er generisk.
- Cloudflare Turnstile / CAPTCHA er bevisst utelatt (overkill for current scale). Egen kontrakt hvis abuse-vinduer viser at rate-limit alene ikke holder.
</details>


---


<details>
<summary><strong>1.28.y — Bane-tilgang for kompis-gjengen (2 oppføringer)</strong></summary>

Fase 4 (og siste fase) av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Trusted creators får tilgang til Sekretariatet med en filtrert tile-grid, og kan opprette + oppdatere baner gjennom samme courses-katalogen som admin bruker. Patch lagt på toppen som åpner Lanseringer-flaten direkte fra Sekretariatet.

### [1.28.1] - 2026-05-26 · #223

> Du finner nå Lanseringer rett fra Sekretariatet. En ny flis ved siden av Resultatprotokoll tar deg inn på publiserings-flaten, og viser dato for siste lansering rett under tittelen.

#### Added
- Ny `SparkleIcon` i [components/icons/Icons.tsx](components/icons/Icons.tsx) — SVG-pendant til ✨-emojien som banneret og innboks-kortet allerede bruker, slik at de tre lanserings-flatene har samme visuelle uttrykk.
- Lanseringer-flis i [app/admin/page.tsx](app/admin/page.tsx) `TilesGrid` (admin-only branch, 5. flis etter Resultatprotokoll). Henter siste publiserte dato fra `product_updates` parallelt med de andre tile-tellingene; meta-teksten faller tilbake til «Ingen publisert ennå» når tabellen er tom.

#### Changed
- `TileIconKind`-unionen utvidet med `'sparkle'`, og `TilesSkeleton` renderer nå 5 placeholders for å unngå skeleton-til-innhold-flicker.

### [1.28.0] - 2026-05-25 · #198

> Trusted creators kan nå legge til og oppdatere baner selv, ikke bare opprette spill. Når en kompis i allowlist-en logger inn ser de Sekretariatet med en Baner-tile, og kan vedlikeholde katalogen som om de var admin — men kun baner de selv har laget kan slettes.

#### Added
- Ny `requireAdmin(supabase)`-helper i [lib/admin/auth.ts](lib/admin/auth.ts) ved siden av `requireAdminOrTrustedCreator`. Redirecter trusted-non-admin til `/admin` og ikke-trusted ikke-admin til `/`. Brukt til å self-gate alle admin-only ruter under `/admin/spillere`, `/admin/games` (unntatt `/new`), og `/admin/lanseringer` (innført i forrige refactor-commit).
- Ownership-check på `deleteCourse`: trusted creators kan kun slette baner de selv har laget (`courses.created_by === user.id`); admin uberørt. Ny error-melding `not_owned` på `/admin/courses` med teksten «Du kan kun slette baner du selv har laget.»
- [lib/format/displayName.ts](lib/format/displayName.ts) — felles helper trukket ut fra edit-page sin lokale variant. Brukes nå også av activity-ledger på `/admin`.

#### Changed
- [app/admin/layout.tsx](app/admin/layout.tsx) gater nå på admin-eller-trusted. Tile-grid på [app/admin/page.tsx](app/admin/page.tsx) filtreres per rolle: trusted ser kun Baner-tile, admin ser alle fire.
- Bane-write-actions (`createCourse`, `updateCourse`, `deleteCourse`, `restoreTee`) bytter til `getAdminClient()` for skrivinger når caller er trusted-non-admin. Bypasser RLS-policiene som krever `is_admin()`. Samme small-bet-mønster som #198 etablerte for spill-opprettelse.
- Activity-ledger på `/admin` viser faktisk creator-navn for bane-events (var: hardkodet «Sekretariatet»). Fanger en latent display-feil som trusted creators ville eksponert dag 1.

#### Fixed
- Inline `requireAdmin`-helper i [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/%5Bid%5D/edit/actions.ts) er fjernet til fordel for delt helper i `lib/admin/auth.ts` — én sannhetskilde for rolle-gating på courses-flyten.
</details>



---


<details>
<summary><strong>1.27.y — Arkiv-UI og delbare filter-lenker (3 oppføringer)</strong></summary>

Fase 3 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Soft-arkiverte tees kan gjenåpnes fra edit-flaten, bane-listens filter-state ligger i URL-en, og legacy-rader uten `updated_by` er backfilt fra `created_by`.

### [1.27.2] - 2026-05-25 · #223

> Andre forsøk på samme fix. Når du gjenåpner en arkivert tee og klikker «Lagre endringer» rett etterpå, holder tee-en seg nå aktiv. Forrige fix (1.27.1) løste serverside-cachen, men ikke selve skjemaet — som tegnet med innholdet fra før gjenåpningen og dermed sendte det videre på neste lagring.

<details>
<summary>Teknisk</summary>

#### Fixed
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) gir nå `<CourseForm key={teeSetKey}>` der `teeSetKey` er sortert join av aktive tee-IDer. Når en archive eller restore endrer tee-settet, unmounter React den gamle form-instansen og monterer en frisk. Uten dette beholdt `useState(initialTees)` sitt opprinnelige 2-tee-state etter restore-redirect — selv om server-komponenten re-rendret med 3 tees som ny `initialData`, leste `useState` bare initial-verdien på første mount.

#### Notes
- Roten var en klassisk Next.js client-component-felle: server-side data fra props endrer seg, men client-state initialisert fra props gjør det ikke (useState-initializer kjører kun én gang). Manifestasjonen så ut som en cache-bug (1.27.1-feildiagnose), men `revalidatePath` rørte ikke client-state.
- Forge-evaluator + vitest fanget ikke dette fordi testene mocket props og verifiserte rendering — ikke hvordan client-state overlever en server-side re-render.
- Lærdom: for client-components der server-data endres dynamisk (via server-action redirect tilbake til samme route), gi en `key` som signaliserer datasett-endring. CourseForm har samme felle for hull-data, men hull endres ikke via separate server-actions, så det manifesterer ikke der.

</details>

### [1.27.1] - 2026-05-25 · #228

> Når du gjenåpner en arkivert tee og klikker «Lagre endringer» rett etterpå, blir tee-en nå værende aktiv. Tidligere kunne et stille mellomledd i Next.js-cachen gjøre at edit-skjemaet fortsatt så tee-en som arkivert, så lagringen re-arkiverte den.

<details>
<summary>Teknisk</summary>

#### Fixed
- [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts) `restoreTee` kaller nå `revalidatePath` på edit-pathen, `/admin/courses` og `/admin/games/new` før redirect. Uten dette returnerte Supabase JS-en sitt fetch-cache-hit (samme URL + params) den stale `archived_at IS NULL`-listen fra før restore. CourseForm rendret derfor med 2 av 3 tees, og en påfølgende Lagre sendte FormData uten den restaurerte tee-en — `updateCourse` regnet den som «fjernet» og soft-arkiverte den på nytt.
- Ny regresjons-assert i `actions.test.ts` happy-path: verifiserer at `revalidatePath` kalles for alle tre paths som leser archived_at-tilstanden.

#### Notes
- Funnet under manuell røyk-test på preview ([PR #228](https://github.com/jdlarssen/golf-app/pull/228)) av Fase 3. Reproduksjon: arkivér en tee → Gjenåpne → klikk Lagre uten andre endringer → tee re-arkiveres. Forge-evaluatoren fanget det ikke (testet hver server-action isolert, ikke restore-så-Lagre-flyten).
- Lærdom: server-actions som muterer data lest av samme route MÅ kalle `revalidatePath`. Supabase JS bruker `fetch` internt, og Next.js auto-cacher fetch-responser på URL+params-nøkkel.

</details>

### [1.27.0] - 2026-05-25 · #223

> Du kan nå gjenåpne en arkivert tee fra bane-redigeringen — den dukker opp igjen i skjemaet og kan velges for nye spill. Bane-listens søk, sortering og chip-filter lagres nå i URL-en, så en filtrert visning er bokmerke-bar og kan deles via lenke. Eldre baner uten «Sist endret av»-navn har fått det fylt ut bakover-i-tid.

<details>
<summary>Teknisk</summary>

#### Added
- [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts) `restoreTee` server-action — clearer `tee_boxes.archived_at`, bumper `courses.updated_at` + `updated_by` (restore er en bane-endring), og redirecter til `?status=restored`. Defensive guards: tee må eksistere, høre til riktig bane, og være arkivert. Sju unit-tester dekker happy path + alle tre reject-stier + non-admin + unauth + db-error.
- [app/admin/courses/[id]/edit/ArchivedTeesSection.tsx](app/admin/courses/[id]/edit/ArchivedTeesSection.tsx) — ny server-component med `<details>`-wrapper som lister soft-arkiverte tees med Gjenåpne-knapp per rad. Navne-kollisjons-chip når en arkivert tee har samme navn som en aktiv (visuelt advarsels-flagg; ingen DB-blokk).
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) — fetcher arkiverte + aktive tees parallelt (`Promise.all`), derivér `has_active_name_conflict`, render `ArchivedTeesSection` mellom CourseForm og DeleteCourseButton. Banner-handler for `?status=restored` + nye error-koder `tee_not_found` / `tee_not_archived`.
- Migration `0038_courses_backfill_updated_by.sql` — `update public.courses set updated_by = created_by where updated_by is null and created_by is not null`. Idempotent; backfilt 1 rad i prod ved kjøring.
- Regresjons-test i `actions.test.ts` som driver `updateCourse` med full FormData-payload — fanger v1.26.1-fellen mekanisk (hvis `MAX_TEE_BOXES` flyttes tilbake bak `'use client'`-grensen, asserterer den at insert-loop-en iterere).

#### Changed
- [app/admin/courses/CoursesLedgerClient.tsx](app/admin/courses/CoursesLedgerClient.tsx) — bytter `useState`-backing-store for `useSearchParams` + `router.replace` (med `startTransition` og `{ scroll: false }`). URL-format: `?q=stik&sort=updated_at&ladies=1&juniors=1&active=1`. Defaults skrives ikke. Ny eksportert `readStateFromParams`-helper for pure-test-dekking.
- `CoursesLedgerClient.test.tsx` — eksisterende 17 interaksjons-tester refaktorert til å mocke `next/navigation` med en `useSyncExternalStore`-backet store, så `fireEvent`-drevne URL-skriv faktisk gjør komponenten re-render. Pluss 8 nye tester for URL-init + URL-write + default-omission.

#### Notes
- Restore lever som dedikert server-action (ikke bundlet med CourseForm-save) for å holde begge flytene enkle. Form-save er en stor batch-mutation; restore-intent håndteres separat og redirecter til en frisk reload av edit-flaten.
- DB har ingen unique-constraint på `(course_id, name)` i tee_boxes — restore til navne-konflikt med en aktiv tee tillates uten å blokkere. Navne-kollisjons-chip-en flagger det visuelt så admin kan endre navnet etter behov.
- URL-replace, ikke push — filter-tweaks er ikke historikk-aktivitet. Browser-back tar admin ut av siden, ikke gjennom filter-historikk. Bevisst tradeoff for enklere mental modell.
- 0038-backfill er trygg for live spill (rører kun `courses.updated_by`-kolonnen). Rader med `created_by IS NULL` forblir uendret (ingen kilde-data).
- Per-kjønn-overstyring av hull-par fortsetter som egen Fase når det blir reelt smerte-punkt. Krever endring i alle 4 mode-implementasjoner som leser `hole.par` direkte.

</details>
</details>


---


<details>
<summary><strong>1.26.y — Vedlikeholds-trygghet og filter på bane-admin (2 oppføringer)</strong></summary>

Fase 2 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223). Audit-felter på baner, soft-archive av tees i bruk, og sort + filter på bane-listen.

### [1.26.1] - 2026-05-25 · #223

> Lagring av bane-endringer fungerer igjen. En regresjon fra v1.25.0 stoppet save-knappen på `/admin/courses/[id]/edit` og `/admin/courses/new` med feilmeldingen «Minst én tee-boks må legges til» — selv når du faktisk hadde tees i skjemaet.

<details>
<summary>Teknisk</summary>

#### Fixed
- `MAX_TEE_BOXES`-konstanten flyttet fra [CourseForm.tsx](app/admin/courses/CourseForm.tsx) (en `'use client'`-modul) til en ny server-trygg fil [constants.ts](app/admin/courses/constants.ts). Next.js 16 wrapper eksporter fra `'use client'`-moduler som placeholder-funksjoner når de brukes serverside; `for (let i = 0; i < MAX_TEE_BOXES; ...)` ble til `0 < function` som evaluerer til `false`, så tee-parsing-loopen iterere aldri. Konsekvens: ALLE Save-forsøk på admin/courses/new + admin/courses/[id]/edit returnerte `tee_required`-feil.
- `CourseForm.tsx` re-eksporterer fortsatt `MAX_TEE_BOXES` for client-konsumenter; importerer nå fra `./constants`. Server-actions i `new/actions.ts` og `[id]/edit/actions.ts` importerer direkte fra `./constants`.

#### Notes
- Regresjonen kom inn i Fase 1 (v1.25.0) da CourseForm ble rewrite'et som `'use client'`-modul med konstanten eksportert derfra. Forge-evaluator + 1126/1126 vitest-tester fanget ikke buggen siden den manifesterer kun ved faktisk form-submission i Next.js-runtime — ikke i isolerte client-component-tester. Type-systemet ser fortsatt importen som `number` (TypeScript er ikke klar over `'use client'`-wrappingen).
- Lærdom for senere faser av #223: smoke-test ALLE write-paths (Save + form-submission), ikke bare read-paths (page-load).

</details>

### [1.26.0] - 2026-05-25 · #223

> Når du endrer en bane, husker Tørny nå hvem som endret hva og når. Du kan fjerne en tee selv om den brukes i et historisk spill — spillet beholder tee-en, men den forsvinner fra bane-admin. Bane-listen har fått sortering (Sist endret, Flest aktive spill) og chip-filter (Har dame-tee, Har junior-tee, Aktive spill).

<details>
<summary>Teknisk</summary>

#### Added
- Migration `0037_courses_audit_and_tee_archive.sql` — `courses.updated_at` (NOT NULL DEFAULT now()) + `courses.updated_by` (FK til users, nullable) + `tee_boxes.archived_at` (timestamptz, nullable).
- [app/admin/courses/[id]/edit/actions.ts](app/admin/courses/[id]/edit/actions.ts) `updateCourse` setter `updated_at = now()` + `updated_by = user.id` ved hver lagring. Soft-archive-logikk delt mellom hard-delete (tees uten spill-referanser) og `archived_at`-set (tees i bruk).
- [app/admin/courses/CoursesLedgerClient.tsx](app/admin/courses/CoursesLedgerClient.tsx) utvidet: sort-dropdown (Nyeste først / Sist endret / Flest aktive spill) + chip-toggles for Har dame-tee, Har junior-tee, Aktive spill. AND-kombinert med søk. Eksporterte pure helpers `applySortAndFilter` + `rowKicker` for testing.
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) kicker viser «Lagt til DATO av NAVN» eller «Sist endret DATO av NAVN» basert på 60-sek-buffer mellom `created_at` og `updated_at`. Navn faller tilbake til ingenting hvis updated_by er NULL eller bruker er slettet.
- Tester: 13 nye vitest-cases i `CoursesLedgerClient.test.tsx` (sort + filter UI, pure-helper-coverage, rowKicker, regresjon-tester for søk).

#### Changed
- [app/admin/courses/page.tsx](app/admin/courses/page.tsx) `getCourses` utvidet til å embedde `tee_boxes(archived_at, slope/CR per kjønn)` + `games(status)` for å derivere `tee_count`, `has_ladies_tee`, `has_juniors_tee`, `active_game_count` per bane. Ny eksportert `deriveCourseItem`-helper.
- [app/admin/courses/[id]/edit/page.tsx](app/admin/courses/[id]/edit/page.tsx) — tee_boxes-select filtrer `archived_at IS NULL` så arkiverte tees skjules fra CourseForm; courses-select inkluderer audit-felter + user-embed via begge FK-er.
- [lib/games/newGameFormData.ts](lib/games/newGameFormData.ts) — embed-resultat filtreres på `archived_at === null` så new-game-picker-en bare viser aktive tees.
- [lib/database.types.ts](lib/database.types.ts) — regenerert med nye kolonner.
- Feilmelding `tee_in_use` fjernet fra error-map siden den ikke lenger trigges (alle tee-removals lykkes nå via hard-delete eller soft-archive).

#### Notes
- DB-kolonnen `par_total_<g>` og tee_box_id-FK fra `games` er uendret. Historiske spill leser fortsatt sin (kanskje arkiverte) tee via `games.tee_box_id`-join — `getGameWithPlayers`, scorecard-rendering og leaderboards trenger ingen filter.
- `game_players.course_handicap` er frosset ved game-start ([0001](supabase/migrations/0001_initial_schema.sql)), så historiske handicap-er påvirkes ikke selv om en tee-rad senere får oppdatert slope/CR. Tee-edit-fleksibilitet er trygt.
- Soft-archive er en-veis i Fase 2; un-arkivér-UI er Fase 3 av #223. Hvis admin gjør en feil må de rekonstruere tee-en eller SQL-resette `archived_at` manuelt.
- Per-kjønn-overstyring av hull-par ble vurdert for Fase 2 men flyttet til egen Fase basert på scoring-code-impact-funn (krever endring i 4 mode-implementasjoner).

</details>
</details>


---


<details>
<summary><strong>1.25.y — Mobile-first bane-admin (1 oppføring)</strong></summary>

Å opprette og redigere baner skal gå like raskt på telefon som på PC. Fase 1 av epic [#223](https://github.com/jdlarssen/golf-app/issues/223) fjerner de største tastatur-popups-friksjonene i `/admin/courses`.

### [1.25.0] - 2026-05-25 · #223

> Å opprette en bane på telefon er nå tre trykk per hull i stedet for 18 tastatur-popups. Par-total regnes ut fra hullene, dame- og junior-rating dukker opp først når du legger dem til, og bane-listen har fått søk.

<details>
<summary>Teknisk</summary>

#### Added
- Tap-radio-knapper `[3] [4] [5]` for par per hull i [CourseForm.tsx](app/admin/courses/CourseForm.tsx). 18 tastatur-popups erstattes med tre-knapps-grupper som eksponeres som `role="radio"`/`aria-checked` for screen-reader-konsistens. SI beholder number-input siden 1–18 er for mange knapper og brukeren må kunne taste fritt.
- Progressive disclosure for dame- og junior-rating per tee. Tee-blokken viser kun herre-rating som standard; `+ Legg til dame-rating`/`+ Legg til junior-rating` utvider blokken. `Fjern dame-rating`/`Fjern junior-rating`-lenke kollapser + nullstiller verdiene. Edit-flyten starter expand'et hvis tee har lagrede tall i DB.
- `Dupliser`-knapp per tee. Kopierer alle numre (slope, CR, lengde) for alle kjønn, men tømmer navn og dropper `id` så det blir en ny rad ved lagring. Skjules ved `MAX_TEE_BOXES = 7`.
- Søk på `/admin/courses` — ny client-component [CoursesLedgerClient.tsx](app/admin/courses/CoursesLedgerClient.tsx) som tar fetched courses som prop og rendrer søk-input + filtrert ledger. Substring case-insensitive på banenavn. Empty-state «Ingen baner matcher «X»» ved 0 treff.
- Eksportert helper `sumHolePars(holes)` i `CourseForm.tsx` for både UI (read-only par-total per kjønn) og indirekte tests.
- Tester: 16 nye vitest-cases i `CourseForm.test.tsx` (tap-button-state, auto-par-total, progressive disclosure, dupliser), 4 i `CoursesLedgerClient.test.tsx` (søk-filter, empty-state, trim).

#### Changed
- `app/admin/courses/CourseForm.tsx` — `TeeBoxData`-typen dropper `par_total_<gender>`-feltene fra form-input. `par_total` deriveres automatisk fra hullene og vises som read-only sum per kjønn-rating.
- `app/admin/courses/new/actions.ts` + `app/admin/courses/[id]/edit/actions.ts` — `parseGenderRating` returnerer `{slope, course_rating}` (ikke lenger `par_total`). `par_total_<gender>` settes til `sum(holes.par)` server-side hvis kjønnet har komplett slope + CR; ellers `null`. `isPartiallyFilled` sjekker 2 felt nå (1 fylt = partial).
- `app/admin/courses/[id]/edit/page.tsx` — `tee_boxes`-select dropper `par_total_*`-kolonnene siden form ikke trenger dem.
- Feilmelding `tee_partial_rating` oppdatert: «Hver tee må ha både slope og CR (eller ingen av dem) per kjønn.»

#### Notes
- Eksisterende baner med ulik `par_total_<g>` per kjønn skrives over med `sum(holes.par)` ved neste lagring. Migrasjons-safe: vi antar identisk hull-par for alle kjønn (sann for ~99% av norske baner). Per-kjønn-overstyring er Fase 2-utvidelse hvis det blir aktuelt.
- DB-kolonnen `par_total_<gender>` beholdes — andre kode-stier (`lib/games/teeRating.ts`, scorecard-rendering, game-edit) leser fortsatt fra den. Bare form-input forsvinner.
- Out of scope for Fase 1: SI smart-preset, lengde-warning, audit-felter, archive-flow, eksplisitt tee-sletting-impact-warning. Senere faser i [#223](https://github.com/jdlarssen/golf-app/issues/223).

</details>
</details>
</details>


---



<details>
<summary><strong>Innboks, handicap & hurtig-oppsett — 10 serier</strong></summary>

<details>
<summary><strong>1.24.y — Kjønn og spillerklasse i profilen (2 oppføringer)</strong></summary>

Tørny husker nå om du spiller fra herretee, dametee eller juniortee, og foreslår riktig tee når noen oppretter et spill du skal være med på. Issue [#92](https://github.com/jdlarssen/golf-app/issues/92).

### [1.24.1] - 2026-05-25 · #222

> Når du bytter bane mens du setter opp et spill, beholdes nå dame- og junior-merkene på spillerne du har valgt. Tidligere måtte du klikke dem inn igjen.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/new/useGameFormState.ts` — `setCourseId` re-deriver `playerGenders` fra `playerGenderDefault(p.gender, p.level)` istedenfor å sette til `{}`. Regresjon fra v1.24.0: bane-bytte etter mount kollapset alle M/D/J-toggles til `'M'`, så admin måtte klikke seg gjennom dame- og junior-spillere på nytt. `tee_box_id` nullstilles fortsatt (tee-id er bane-spesifikk). Ny eksportert helper `deriveDefaultGenders(players)` deles mellom mount-initializer og bane-bytte. Issue [#222](https://github.com/jdlarssen/golf-app/issues/222).

#### Notes
- +6 nye vitest-cases i `app/admin/games/new/useGameFormState.test.ts` dekker bane-bytte-regresjonen, `initialValues.player_genders`-precedence ved mount, at bane-deselect (tomt `course_id`) også re-deriver, og at `tee_box_id` fortsatt nullstilles ved bane-bytte.

</details>

### [1.24.0] - 2026-05-25 · #48

> Du kan nå sette kjønn og spillerklasse i profilen din. Når noen oppretter et spill du skal være med på, foreslår Tørny riktig tee for deg, så damer og juniorer slipper å havne på herretee ved et uhell.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0036_users_gender_level.sql` — to nye enum-typer (`user_gender` med `'mens'|'ladies'`, `player_level` med `'junior'|'normal'|'senior'`) + `users.gender` nullable + `users.level` NOT NULL DEFAULT `'normal'`. Adskilt fra `tee_box_gender`-enumen (#48) som beskriver *tee-en*, ikke *spilleren*. Ingen backfill — eksisterende brukere har `gender = NULL` og driver soft-prompt på `/profile`.
- `lib/games/playerGenderDefault.ts` — pure helper som mapper `(gender, level)` til `'M'|'D'|'J'`-toggle-default i game-wizard. Regel: `level === 'junior'` overstyrer kjønn; senior påvirker ikke toggle i dag. 8 unit-tester dekker alle kombinasjoner.
- `app/complete-profile/{page,actions}.tsx` — to nye påkrevde radio-grupper i onboarding (kjønn: ingen pre-valg; spillerklasse: pre-valgt «Voksen»). Server-action validerer mot enum-allowlist.
- `app/profile/page.tsx` — `GenderSoftPrompt`-server-component rendres som Card øverst på `/profile` når `users.gender IS NULL`. «Sett kjønn»-knapp scroller til `#kjonn`-anchor på edit-fieldsetet. Kortet forsvinner straks gender er satt (re-render etter `updateProfile`).
- `app/profile/ProfileFormBody.tsx` — kjønn + spillerklasse-felt med dirty-tracking (Lagre-knappen aktiveres ved endring i radio-grupper).
- `app/admin/spillere/[id]/{page,actions}.tsx` — speiler `/profile`-mønsteret. Admin kan sette/endre for inviterte spillere før de logger på første gang. Ingen soft-prompt i admin-flate.

#### Changed
- `lib/games/newGameFormData.ts` — utvider users-select med `gender, level`; `UserRow` + `PlayerOption` propagerer feltene videre.
- `app/admin/games/[id]/edit/page.tsx` — samme utvidelse for edit-flyten.
- `app/admin/games/new/GameForm.tsx` — `PlayerOption`-type får `gender: 'mens'|'ladies'|null` + `level: 'junior'|'normal'|'senior'`.
- `app/admin/games/new/useGameFormState.ts` — `playerGenders`-initial deriveres fra `playerGenderDefault(p.gender, p.level)` per spiller når `initialValues?.player_genders` ikke er satt (edit-flyt beholder per-spill overrides).
- `app/profile/actions.ts` + `app/admin/spillere/[id]/actions.ts` — `updateProfile` og `updateUser` aksepterer + validerer gender + level før upsert.
- `lib/database.types.ts` — regenerert med nye enums + felt.

#### Notes
- Test-suite: +8 nye tester for `playerGenderDefault`. Eksisterende `ProfileFormBody.test.tsx` + `GameForm.test.tsx` + `GameWizard.test.tsx` oppdatert med default-fixtures (gender=null, level=normal eller mens/normal).
- Solo-flyten påvirkes uten ekstra endringer — GameForm bruker `player_${pid}_gender` FormData-key uavhengig av modus.
- `gender` er nullable bevisst — eksisterende brukere uten verdi forblir null til soft-prompt-en spørres. Auto-default i wizard faller tilbake til 'M' for null-gender (med mindre level=junior).

</details>
</details>


---


<details>
<summary><strong>1.23.y — Lanseringer-kanal: in-app drypp + månedsbrev (1 oppføring)</strong></summary>

Tørny får sin egen kanal for å fortelle deg om nye funksjoner. Når noe er ute, dukker det opp et lite drypp på hjem-siden og en oppføring i innboksen. En gang i måneden får du en oppsummering på mail. Du kan melde deg av mailen fra profilen din eller via lenken nederst i mailen. Issue [#202](https://github.com/jdlarssen/golf-app/issues/202).

### [1.23.0] - 2026-05-25 · #202

> Når noe nytt kommer i Tørny, får du nå et lite varsel på hjem-siden og en oppføring i innboksen. Én gang i måneden får du også en oppsummering på mail. Du er påmeldt fra start; meld deg av månedsbrevet i profilen din om du heller vil ha fred.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0035_product_updates.sql` — to nye tabeller (`product_updates` med admin-curated lanseringer, `product_update_digests` med audit + idempotens-row per måned) + `users.product_updates_unsubscribed_at` opt-out-kolonne + utvider `notifications.kind`-CHECK med `'product_update'`. RLS: alle innloggede leser `product_updates` (banner + innboks-flate), digests kun via service-role.
- `lib/notifications/types.ts` — ny `product_update`-kind med zod-schema (`source_id` uuid, `title`, `body`, valgfri `link` som må starte med `/`, valgfri `cta_label`). 5 nye tester for happy path, full payload, ekstern-link-avvisning, manglende title, tom title.
- `lib/productUpdates/unsubscribeToken.ts` — HMAC-SHA256 sign/verify-helpers for mail-unsub-tokens (1 års TTL, constant-time `timingSafeEqual`-sammenligning, `expMs` som ms-timestamp så `split('.')` ikke brytes av ISO `.000Z`). 9 tester for round-trip, tampered sig, tampered userId, exp, tom/garbage-tokens, manglende secret, determinisme.
- `lib/productUpdates/publish.ts` — `publishProductUpdate(input)` inserter rad og fan-outer in-app-notifikasjon til alle brukere via `Promise.allSettled`. Best-effort per mottaker.
- `lib/productUpdates/digest.ts` — `sendDigestForPeriod(opts)` + `previousMonthPeriod(nowMs)` pure helper. Beregner forrige kalendermåned i Europe/Oslo, idempotens-sjekk via `product_update_digests` UNIQUE, fan-out via `Promise.allSettled`, inserter audit-row. Returnerer discriminated union (`sent` / `already_sent` / `no_updates`). 5 tester for periode-grenser inkl. årsskifte og skuddår.
- `lib/mail/productUpdateDigest.ts` — Resend-mail-helper med subject `Nytt i Tørny — [måned]`, inline HTML + plain-text, RFC 8058 `List-Unsubscribe`-header + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. 9 tester inkl. inline-snapshot av plain-text-body.
- `lib/format/date.ts` — `formatMonthLongNb('mai 2026')` for periode-etiketter.
- `app/admin/lanseringer/{page,actions,actions.test}.ts(x)` — admin-flate gated av `requireAdmin()`. Skjema for publisering (title/body/link/cta), månedsbrev-card med «Send månedsbrev nå»-knapp (disabled når allerede sendt for forrige periode), liste over siste 20 lanseringer. 10 action-tester for non-admin-redirect, validering (title/body/link/cta), happy-path, og alle tre digest-utfall.
- `app/api/cron/product-update-digest/route.ts` + `vercel.json` — daglig cron 08:00 UTC med intern 1.-i-måneden-gate (Vercel Hobby-friendly). Bearer-token auth via `CRON_SECRET`.
- `app/api/unsubscribe/product-update/route.ts` — GET (browser, render branded HTML) + POST (RFC 8058 one-click fra mail-klient). Begge verifiserer HMAC-token, oppdaterer `users.product_updates_unsubscribed_at`.
- `components/products/ProductUpdateBanner.tsx` (server) + `ProductUpdateBannerClient.tsx` (client) — banner på `/` med champagne-stripe, sparkle-emoji, title + body, valgfri CTA-knapp, og 44px-tap-target lukke-knapp. Optimistisk dismiss + `markOneAsRead`-call via `useTransition`. 5 tester.
- `app/profile/ProfileFormBody.{tsx,test.tsx}` — ny «Mail-innstillinger»-seksjon med checkbox for månedsbrev-opt-in. Dirty-tracking inkluderer toggle. 4 tester.

#### Changed
- `app/page.tsx` — mounter `<ProductUpdateBanner userId={...} />` like under `<InstallBanner>` i en `<Suspense fallback={null}>`-grense.
- `components/notifications/NotificationCard.tsx` — `EMOJI`-map utvidet med `product_update: '✨'`, `buildCardContent` mapper `payload.title → title`, `payload.body → detail`.
- `app/innboks/InboxClient.tsx` — `buildDeeplink` returnerer `payload.link ?? '/innboks'` for `product_update`-kind.
- `app/profile/{page,actions}.ts` — leser `product_updates_unsubscribed_at`, sender `productUpdatesOptIn` til `ProfileFormBody`. `updateProfile` skriver `null` (påmeldt) eller `now()` (avmeldt) basert på checkbox.

#### Notes
- Cron-pattern: «daglig 08:00 UTC + intern dato-gate» istedenfor `0 8 1 * *` siden Vercel Hobby kapper cron til 1/dag. Gir også atomær deploy-safety — en deploy 1. i måneden kan ikke endre cron-fyringen midt i kjøringen.
- Link-feltet i `product_updates` valideres til intern-only (`startsWith('/')`) som defense mot phishing-misbruk via mail-kanalen. Trade-off: kan ikke peke til Discord/eksterne ressurser. Akseptabelt for MVP.
- RFC 8058 ikke strengt påkrevd for Tørnys volum (< 5000 mail/dag mot Gmail/Yahoo), men implementert riktig fra start — gratis kvalitets-signal for inbox-placement.
- `.env.example` dokumenterer to nye secrets: `CRON_SECRET` (Vercel Bearer-token) og `PRODUCT_UPDATE_UNSUB_SECRET` (HMAC-nøkkel for unsub-tokens). Begge må settes i Vercel Dashboard før cron + unsub fungerer i prod.
- Test-suite vokst fra 1031 → 1062 (+31 nye tester).

</details>
</details>


<details>
<summary><strong>1.22.y — Hurtig-oppsett for nye spill (1 oppføring)</strong></summary>

Opprett-spill-flyten er omarbeidet til fire korte steg i stedet for én lang side med seks seksjoner. Format → bane → spillere → klar. «Tilpass alle detaljer» henter fram dagens fullform for power-users som vil styre alt. Issue [#203](https://github.com/jdlarssen/golf-app/issues/203).

### [1.22.0] - 2026-05-25 · #203

> Som admin setter du nå opp et spill i fire korte steg, ikke seks seksjoner på én lang side. Velg format, så bane og tidspunkt, så spillere — og til slutt sjekker du sammendraget før du publiserer. Trenger du flere detaljer (sideturnering, peer-godkjenning, HCP-allowance), finner du dem bak «Tilpass alle detaljer» på siste steg.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/GameWizard.tsx` — 4-stegs orkestrator (Format → Bane → Spillere → Klar) med URL-state via `?step=` og `?view=`. Stepper-header («Steg N av 4 · tittel») med tynn progress-bar som respekterer `prefers-reduced-motion`. Per-steg-validering på Neste-knappen.
- `app/admin/games/new/useGameFormState.ts` — felles state-hook som GameForm og GameWizard begge konsumerer. All state, derived flags, memos, validitets-flags og handlers ligger her — én kilde til scoring-/validerings-reglene.
- `app/admin/games/new/sections/` — fem ekstraherte presentasjons-komponenter:
  - `BasicsSection.tsx` (spillnavn + bane + tee + tee-off + valgfri synlighet/sideturnering)
  - `PlayersSection.tsx` (søk + chips + filtrert liste + mode-aware counter)
  - `TeamsAssignmentSection.tsx` (matchplay-sider / lag-grid / flights / per-spiller-tee)
  - `AdvancedSettingsSection.tsx` (HCP-allowance, peer-godkjenning, valgfri visibility)
  - `ReadyStep.tsx` (wizard-only steg 4: summary-kort + advanced disclosure + publish/draft + escape-hatch)
- `lib/games/autoGameName.ts` — `suggestGameName({ courseName, scheduledTeeOffAt })` bygger forslag som «Stiklestad 25. mai» fra bane + tee-off. Wizard pre-fyller spillnavnet på steg 4 før admin redigerer (gated på `nameTouched`-flag).
- `lib/games/autoGameName.test.ts` (8 tester) + `app/admin/games/new/GameWizard.test.tsx` (9 tester) — dekker happy-paths for solo og best-ball, escape-hatch + tilbake bevarer state, auto-name + manuell override, og FormData-skjema speiler GameForm-payloaden.

#### Changed
- `app/admin/games/new/GameForm.tsx` (1819 → 347 linjer) — refaktorert til presentasjons-komponent som stacker de fire seksjonene + form-skeleton. Konsumerer `useGameFormState`. Brukes fortsatt 1:1 av edit-flyten (`/admin/games/[id]/edit`) og av wizard-en når admin klikker «Tilpass alle detaljer».
- `app/admin/games/new/page.tsx` og `app/opprett-spill/page.tsx` — rendrer nå `<GameWizard>` i stedet for `<GameForm>`. Samme props, samme server-actions, samme FormData-skjema. Edit-flyten (`/admin/games/[id]/edit/page.tsx`) er uberørt — bruker fortsatt `<GameForm>`.

#### Notes
- **Server-actions er uberørte.** `createGameDraft`, `createAndPublishGame`, og edit-equivalentene mottar identisk FormData (`game_mode`, `team_size`, `player_${i}_*`, `hcp_allowance_pct`, `side_*`, etc.) som før. Ingen databasemigrasjon, ingen API-endring.
- **Hopp til full-form og tilbake bevarer wizard-state.** «Tilpass alle detaljer» bytter `view = 'full'` og passer wizard-state som `initialValues` til GameForm. «← Tilbake til hurtig-oppsett» flipper tilbake til siste steg.
- **Uncontrolled-felter** (score_visibility-radios, side_ld_count/ctp_count, SideCategoriesPicker) håndteres som default-fallback ved skip av advanced disclosure — sentral disiplin matcher GameForm-oppførselen før refactor.
- Test-suite vokst fra 1022 → 1031 (+9 wizard-tester). Eksisterende GameForm-/actions-tester passerer uendret.

</details>
</details>


<details>
<summary><strong>1.21.y — Sideturnering — 14 nye bonus-kategorier (1 oppføring)</strong></summary>

Sideturneringen vokser fra 27 til 41 kategorier. Nye bragder dekker albatross, hole-in-one, konge-på-par-4, rein 9-tur, ren runde uten double-bogey, comeback-priser, og to nye lag-bonuser. To humor-kategorier (verste enkelthull og flest double-bogeys) gir mild straff. Som standard er alle nye skrudd på i Full pakke-presetet. Issue [#169](https://github.com/jdlarssen/golf-app/issues/169).

### [1.21.0] - 2026-05-25 · #19

> Sideturneringen har fått 14 nye bragder du kan jakte på — albatross, hole-in-one, konge på par-4, rein 9-tur og ren runde for ferdighet, comeback kid og to-birdier-på-rad for de hete rundene, «alle birdied» og «lag-par-hull» for laget, pluss litt humor med verste enkelthull og flest double-bogeys. I admin-panelet slår du av enkeltkategorier per spill. Full pakke har alle på fra start.

<details>
<summary>Teknisk</summary>

#### Added
- 18 nye kategori-IDs i `lib/scoring/sideTournamentConfig.ts` (`SideCategoryId`-union + `ALL_CATEGORY_IDS` + `SIDE_TOURNAMENT_POINTS`-map). Fordelt på 4 tier:
  - **Skill (4p/2p eller 4p individ):** `most_albatrosses_team/_individual` (netto ≤ par−3), `most_hole_in_ones_team/_individual` (gross = 1), `king_par4_team/_individual` (lavest brutto på par-4 hull), `clean_front_9` + `clean_back_9` (alle 9 hull netto ≤ par), `no_double_plus_round` (alle 18 hull netto ≤ par+1).
  - **Moderate (2p individ):** `hardest_hole_winner` (best brutto på SI=1-hullet), `comeback_kid` (mest negativ delta fra F9-net til B9-net), `all_par_groups_birdie` (birdie på par-3, 4 og 5 hver), `even_par_round` (sum(netto) = sum(coursePars)), `back_to_back_birdies` (2-streak, stackable).
  - **Coord-bonus (lag-koord, stackable):** `team_all_birdied_bonus` (4p × N når alle medlemmer har minst én birdie), `team_no_bogey_hole_coord` (2p × N stackable per hull der hele laget har netto ≤ par).
  - **Humor (-1p individ):** `worst_single_hole_brutto` (høyest enkelthull-brutto), `most_double_bogeys_individual` (flest netto ≥ par+2).
- Migrasjon `0027_side_tournament_bonus_categories.sql` — utvider `games_side_disabled_categories_valid` constrainten med de 18 nye IDs (atomær drop+re-add).
- `SideTournamentInput.courseStrokeIndices: number[]` — nytt 18-element-felt for stroke-index per hull. Brukes kun av `hardest_hole_winner`. Bygges i `app/games/[id]/leaderboard/page.tsx` parallelt med `coursePars`.
- `SideCategoryAward.delta?: number` — nytt felt brukt av `comeback_kid` for å rendre «snudd X slag på back-9».
- 28 nye tester i `lib/scoring/sideTournament.test.ts` — dekker happy paths, ties, empty-guards, par-type-mangler og disqualifications for hver av de 14 kategoriene.
- 14 nye picker-entries i `components/admin/SideCategoriesPicker.tsx`. Ny gruppe «Minuspoeng» som samler snowman (-2p) + de to nye humor-kategoriene (-1p hver).
- 14 nye render-blokker i `app/games/[id]/leaderboard/SideTournamentView.tsx` med matchende `CATEGORY_GROUPS`/`PANEL_GROUPS`-oppføringer.

#### Changed
- `calculateSideTournament` i `lib/scoring/sideTournament.ts` — 14 nye if-blokker etter snowman (kategori #19). `SideCategory`-union utvidet. `countMatchesForPlayer`/`Team` brukt på netto for albatross; inline gross-loop for hole-in-one siden helperne er netto-bare per design.
- Snowman flyttet fra «Bragder»-gruppen til ny «Minuspoeng»-gruppe i picker og fra `achievement`-panel-seksjon til `penalty`-panel-seksjon i view, slik at alle negativ-poeng-kategorier står samlet.
- `lib/games/sideTournamentPayload.test.ts` — sanity-assertion oppdatert fra 27 til 45 ID-er (27 eksisterende + 18 nye).

#### Notes
- Eagles+ (netto ≤ par−2) forblir inklusiv — en albatross teller både under `most_eagles_*` og som egen `most_albatrosses_*`-kategori. Bevisst valg: back-compat med ferdigspilte spill, ingen data-migrasjon. Flagget i picker-hjelpetekst.
- Eksisterende ferdigspilte spill med `side_disabled_categories = '{}'` (Full pakke) får automatisk de 18 nye kategoriene aktivert ved neste leaderboard-fetch. Spillere kan se «nye utmerkelser» dukke opp på historiske runder hvor noen har gjort en albatross eller hole-in-one — feel-good, ikke regression.
- Test-suite vokst fra 958 → 986 (+28 nye tester).

</details>
</details>


<details>
<summary><strong>1.20.y — Handicap-chip på hjem-siden (1 oppføring)</strong></summary>

Handicapen din vises nå alltid øverst på hjem-siden så du ser hvor du står. Får en aksent-farge når den ikke har vært bekreftet på fire uker, så du oppdager passivt at den er gammel. Issue [#209](https://github.com/jdlarssen/golf-app/issues/209) — komplementerer [#168](https://github.com/jdlarssen/golf-app/issues/168) sitt prompt-kort i venterommet.

### [1.20.0] - 2026-05-25 · #168

> Handicapen din vises nå øverst på hjem-siden, alltid synlig. Trykk for å oppdatere. Hvis den ikke har vært bekreftet på fire uker, får den en aksent-farge — så du oppdager selv at den er gammel uten at appen må mase.

<details>
<summary>Teknisk</summary>

#### Added
- `components/handicap/HandicapChip.tsx` + 7 tester — server-component pill med «HCP»-label + tall (norsk komma via `toLocaleString('nb-NO', ...)`). Klikkbar `SmartLink` til `/profile?next={encodedNextPath}` med ≥44px tap-target. Stale-tilstand (≥ 4 uker per gjenbrukt `isHandicapStale`) bytter til `border-accent + text-accent`-styling; fresh er nøytral. Tester dekker label/tall-rendering, desimal-formatering inkl. default `54.0`, href-encoding, begge styling-tilstander, og aria-label.

#### Changed
- `app/page.tsx` — profile-query utvidet med `hcp_index, handicap_updated_at` (ingen ny round-trip). Chip rendres i `PageHeader.action`-slot i non-empty state, og midtstilt mellom welcome-paragrafen og CTA-knappen i empty state. Defensiv: rendres bare når begge feltene er satt.

#### Notes
- «HCP» som label er bevisst engelsk forkortelse — etablert kortform i norsk golf-miljø, ikke flagget som anglisisme.
- Tap-flyten gjenbruker `safeNextPath`-mekanikken fra [#168](https://github.com/jdlarssen/golf-app/issues/168) — ingen nye redirect-kodebaner.
- Chip vises kun på `/`. På `/games/[id]` står #168 sitt prompt-kort allerede klart.
- Test-suite vokst fra 979 → 986 (+7 nye chip-tester).

</details>
</details>


<details>
<summary><strong>1.19.y — Handicap-sjekk før runden (1 oppføring)</strong></summary>

Spilleren får et inline-kort i venterommet før hvert spill hvis handicapen ikke har vært bekreftet på fire uker. Forhindrer at runden beregnes mot en utdatert verdi fordi noen glemte å oppdatere etter sist. Issue [#168](https://github.com/jdlarssen/golf-app/issues/168).

### [1.19.0] - 2026-05-25 · #168

> Hvis handicapen din er eldre enn fire uker, spør appen nå før spillet starter om den fortsatt er riktig. Da slipper du å oppdage etter runden at slag-allokeringen ble feil.

<details>
<summary>Teknisk</summary>

#### Added
- `supabase/migrations/0034_users_handicap_updated_at.sql` — ny `users.handicap_updated_at timestamptz not null default now()`-kolonne. Backfill til `now()` for eksisterende brukere — alle starter «ferske» og får fire-uker grace før første prompt.
- `lib/handicap/staleness.ts` + 10 tester — `HANDICAP_STALENESS_WEEKS = 4` konstant + `isHandicapStale(updatedAt, now?)`-helper. Aksepterer både `Date` og ISO-streng. Boundary er stale ved nøyaktig fire uker; null/undefined er stale.
- `components/handicap/HandicapConfirmCard.tsx` — inline `Card` med tittel «Sjekk handicapen din», brødtekst med relativ tid (`formatRelativeNb`), og to knapper: «Ja, stemmer» (server-action) og «Oppdater» (lenker til `/profile?next=/games/[id]`).
- `app/games/[id]/actions.ts` med `confirmHandicap(gameId)`-server-action. Bumper `users.handicap_updated_at = now()` for innlogget bruker og `revalidatePath('/games/[id]')` så kortet forsvinner på neste render.
- `app/profile/safeNext.ts` + 11 tester — `safeNextPath()` validerer at `?next=`-target er en relativ same-origin-sti (avviser protocol-relative URL-er, absolutte URL-er, fragment-only og non-string). Open-redirect-vern.

#### Changed
- `app/profile/actions.ts` — `updateProfile` leser `next` fra FormData, validerer via `safeNextPath`, og redirecter dit ved suksess. Fallback til `/profile?profile=updated` når `next` mangler. Error-redirects preserver `next` så form-en overlever validation-feil.
- `app/profile/ProfileFormBody.tsx` — ny `next?`-prop renderer skjult input når den er gyldig. «Avbryt»-lenken respekterer `next` istedenfor hardkodet `/`.
- `app/profile/page.tsx` — leser `searchParams.next`, sender gjennom `safeNextPath` før form-en får den.
- `app/profile/actions.ts`, `app/complete-profile/actions.ts`, `app/admin/spillere/[id]/actions.ts` — alle tre UPDATE-ene stamper `handicap_updated_at = now()`. Unconditional: hvem som enn lagrer form-en endorser hcp-verdien. Admin-edit teller også — slipper å mase spilleren rett etter at Jørgen fikset det.
- `app/games/[id]/page.tsx` — scheduled-grenen henter `users.hcp_index + handicap_updated_at` for innlogget spiller via slim direct-call (ikke cachet — cross-game fan-out ved profil-edit ville krevd dyr invalidering). Rendrer `<HandicapConfirmCard />` mellom header og Hero hvis stale.

#### Notes
- Kortet vises kun for `status === 'scheduled'`. Active/finished-spill er forbi freeze-vinduet — ingen «for sent»-melding (det ville bare blitt mas).
- Kortet er ikke-blokkerende — spilleren kan ignorere det og bare scrolle videre.
- «Ja, stemmer» gir ingen toast-bekreftelse. Kortet forsvinner, det er bekreftelse nok.
- Test-suite vokst fra 947 → 979 (+32 nye tester: 10 staleness + 11 safeNext + utvidelser).

</details>
</details>


<details>
<summary><strong>1.18.y — Lag-scorekort (1 oppføring)</strong></summary>

Scorekort-flaten viser nå begge spillerne side om side i alle lag-baserte spillformer (best-ball, par-stableford, matchplay og Texas scramble). Tidligere fikk du bare ditt eget scorekort — selv i 2-mannslag der partner og du deler resultat. Issue [#17](https://github.com/jdlarssen/golf-app/issues/17).

### [1.18.0] - 2026-05-25 · #17

> Når du spiller best-ball, par-stableford, matchplay eller Texas scramble, viser scorekortet nå deg og partner (eller motstander i matchplay) ved siden av hverandre per hull — som på papir. Lenken på spilloversikten heter «Lagets scorekort» eller «Match-scorekort» istedenfor «Mitt scorekort» når det er aktuelt. Texas-spillere som ikke er lag-kaptein får endelig se lagets faktiske score (før viste flaten blanke felt).

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/scorecardTitle.ts` + test (7 caser) — single source of truth for tittel + CTA-label per modus. Matchplay → «Match-scorekort», lag-baserte (best-ball, par-stableford team_size=2, texas) → «Lagets scorekort», solo → «Mitt scorekort».
- `lib/games/teamCaptain.ts` + test (5 caser) — `pickTeamCaptain(userIds)` ekstrahert fra `lib/scoring/modes/texasScramble.ts` til delt helper. Texas-scoring (kaptein eier scores-radene i DB) og scorekort-flaten (non-captain må slå opp captain for å hente lagets score) bruker samme lex-min-algoritme. Texas-modulen beholder en wrapper rundt helperen.
- `lib/games/scorecardLayout.ts` + test (11 caser) — `resolveScorecardLayout(game, players, me, revealActive, fmt)` returnerer enten Layout A (single-player tabell) eller Layout B (side-om-side). Texas → Layout A med captain-userId + lag-handicap (sum(member.CH) × team_handicap_pct / 100). Reveal-active → Layout A uansett modus (beholder reveal-prinsippet). Best-ball/par-stableford → Layout B med same-team-partner. Matchplay → Layout B med motstander (annet team_number). Defensiv fallback til Layout A hvis team-modus mangler partner.
- Tester for Texas non-captain-flow (issue #17 bonus-fix) — verifiserer at `scoreUserIds` returnerer captain-userId, ikke me-userId.

#### Changed
- `app/games/[id]/scorecard/page.tsx` — full rewrite. Server-komponenten bruker `resolveScorecardLayout` til å bestemme Layout A vs B, og rendrer riktig tabell. Layout B-tabellen har kolonner `# | Par | Spiller1 | Spiller2` der hver spiller-celle viser slag (stor) + sekundærtall (netto eller stableford-poeng) under. SI-kolonne droppet i Layout B for plass på iPhone-bredde. Footer i Layout B viser per-spiller-totaler + lag-total (eller match-status for matchplay: «Du er 2 up etter 8 hull»).
- `app/games/[id]/scorecard/page.tsx` (data-fetch) — bruker admin-client for scores-query siden RLS kan blokkere partners scorer under uvanlig flight-konfigurasjon. Authz beholdes call-site via `me ∈ players` og at `scoreUserIds` kun inneholder lag-medlemmer / motstander basert på `game_players`-radene.
- `app/games/[id]/page.tsx` — CTA-label på «Mitt scorekort»-Card-en på spilloversikten bruker `scorecardTitle().cardLabel` slik at den speiler tittelen på scorekort-flaten. `GameRow`-typen utvidet med `mode_config` (re-bruker shape fra `GameForHole`).

#### Fixed
- Texas scramble non-captain ser nå lagets faktiske score på `/scorecard`. Før viste flaten blanke felt fordi `scores`-radene eies av lag-kapteinen (lex-min userId), og scorekort-flaten queryet på `me.user_id`. Nå queryes captain-userId via `pickTeamCaptain(teamMembers)`.

#### Notes
- Reveal-modus («skjul netto til spillet er ferdig»): Layout B faller tilbake til Layout A under aktivt spill med visibility=reveal. Beholder reveal-prinsippet om å skjule andres data inntil game.status=finished.
- Solo-modi (stableford team_size=1, solo strokeplay) er uendret — fortsatt single-player Layout A med «Mitt scorekort»-tittel.
- Test-suite vokst fra 924 → 947 (+23 nye tester: 7 scorecardTitle + 5 teamCaptain + 11 scorecardLayout).

</details>
</details>


<details>
<summary><strong>1.17.y — Allowlist for trusted creators (1 oppføring)</strong></summary>

Mulighet for å la utvalgte spillere opprette egne turneringer uten å gjøre dem til admin. Liten variant av [#22](https://github.com/jdlarssen/golf-app/issues/22) — vi tester først om noen faktisk vil bruke det, før vi bygger full rolle-modell. Issue [#198](https://github.com/jdlarssen/golf-app/issues/198).

### [1.17.0] - 2026-05-25 · #22

> Som admin kan du gi utvalgte spillere lov til å opprette egne turneringer. Det legger til en «Opprett spill»-inngang på forsiden hos dem som er på lista.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/admin/trustedCreators.ts` — kode-basert allowlist (`TRUSTED_CREATOR_EMAILS`) + `isTrustedCreator(email)`-helper. Case-insensitiv, null-trygg, trimmer whitespace. Seeded med `fornes.even@yahoo.no`. Toggle nye brukere ved å pushe ny commit til lista — bevisst valg for small-bet-MVP-en (ingen DB, ingen ny rolle, ingen RLS-touch).
- `lib/admin/auth.ts` — `requireAdmin()` og `requireAdminOrTrustedCreator()` deler én `loadRole`-helper som slår opp `users.is_admin + email` i én query. Begge redirecter til `/login` ved manglende session og til `/` ved manglende tilgang. `loadRole` returnerer `{ userId, email, isAdmin, isTrusted }` — call-sites bruker `isAdmin` for å route success-redirects og audit-id-er.
- `app/opprett-spill/page.tsx` — ny rute utenfor `/admin/*` som gjenbruker `GameForm` fra admin-flyten, men kjører i `AppShell` (ikke `AdminShell`) slik at trusted ikke-admin ikke ser Sekretariat-shellen. Gated av `requireAdminOrTrustedCreator`.
- `lib/games/newGameFormData.ts` — `getNewGameFormData()`-cache-helper (courses + roster). Ekstrahert fra `app/admin/games/new/page.tsx` slik at `/opprett-spill` deler samme fetch + React-cache. Ingen oppførselsendring i admin-flyten.
- Tre nye actions-tester i `app/admin/games/new/actions.test.ts` — trusted-non-admin tillates og setter `games.created_by` til deres userId; ikke-trusted ikke-admin redirecter til `/`; admin-flyten uendret.

#### Changed
- `app/admin/games/new/actions.ts` — inline `is_admin`-sjekk byttet ut med `requireAdminOrTrustedCreator()`. `created_by` settes nå fra helper-returverdi (`userId`) i stedet for inline `user.id`. Admin-happy-path er uendret semantisk; trusted-allowlisten åpner samme code-path uten DB-endringer.
- `app/page.tsx` — selecter nå `email`-feltet i tillegg til `name, is_admin, profile_completed_at`. Tomt-tilstand-CTA og non-empty-tilstand-seksjon vises for `is_admin || isTrustedCreator(email)`. Admins lenkes fortsatt til `/admin/games/new` (uendret Sekretariat-flyt); trusted-non-admin lenkes til `/opprett-spill`.

#### Notes
- Ingen DB-migrasjoner, ingen nye tabeller, ingen RLS-policy-endringer. INSERT mot `games` skjer fortsatt via request-scoped client — RLS lar `authenticated`-brukere insertere så lenge `created_by = auth.uid()`, så admin-bypass var ikke nødvendig.
- Aksepterte rough edges: success-redirect peker fortsatt på `/admin/games/[id]?status=…` (admin-layouten bouncer trusted-bruker derfra til `/`, der spillet vises i «Mine spill»-lista). Valideringsfeil under create bouncer trusted via `/admin/games/new?error=…` → `/`. Polish kun hvis adopsjon > 30 % i 30-dagers observasjons-vinduet.
- Observasjons-SQL etter 30 dager: `select created_by, count(*), min(created_at), max(created_at) from games where created_by in (select id from users where email = any('{fornes.even@yahoo.no, …}'::text[])) group by created_by;`
- Test-suite: 13 nye tester (10 `isTrustedCreator`-unit + 3 trusted-creator actions-tester), 924 totalt grønne.

</details>
</details>


<details>
<summary><strong>1.16.y — Texas scramble (5 oppføringer)</strong></summary>

Ny spillmodus for laget som vil spille sosialt — én ball per lag, alle slår fra beste slag. Skalerer fra 2-mannslag (par-format) til 4-mannslag (klassisk firma-cup). Lag-handicap regnes etter NGF-aggregatet (25 % av summert HCP for 2-mannslag, 10 % for 4-mannslag), justerbart per spill. Issue [#44](https://github.com/jdlarssen/golf-app/issues/44).

### [1.16.4] - 2026-05-25 · #44

> Admin-flaten for Texas scramble-spill viser kun lag som faktisk har spillere, og dropper Flights-seksjonen siden flight automatisk speiler lag-tilordningen. Reduserer visuelt støy på Texas-detalj-sider.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/games/[id]/page.tsx` — ny `isTexas`-narrowing (`game.game_mode === 'texas_scramble'`). Påvirker to seksjoner: (a) Lag-grid-en (linje 580-585) filtrerer nå Texas-spill etter samme regel som par-stableford — kun lag med spillere vises, ingen tomme «(tom)»-placeholders; (b) Flights-seksjonen (linje 615) skipper for Texas siden flight = team mekanisk (validatoren håndhever `flight_number = team_number`). Speilet par-stableford-pattern: vi vil ikke duplisere Lag-seksjonen som Flights.

#### Notes
- Player-facing game-home (`app/games/[id]/page.tsx`) trenger ingen Texas-spesifikk endring: «Din info»-cardet viser «Lag X / Flight Y»-paret som leser fint for Texas, og FlightRoster fungerer fordi Texas-spillere har `flight_number` satt (= team_number) i motsetning til solo-modi.
- Mode-label «Texas scramble» fra `MODE_LABELS` brukes automatisk i admin-detail-pagens Format-card.

</details>

### [1.16.3] - 2026-05-25 · #44

> Når Texas scramble-spillet avsluttes får hver spiller mail med lagets plassering og lagets netto-total. Mailen navngir lagkameratene dine («Du spilte med Bjørn, Carla og Dagfinn») slik at du ser hvem du gikk runden med uten å åpne leaderboardet.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'texas_scramble'`-gren med `teamRank`, `teamTotalNet`, `teamTotalGross`, `teamPartnerNames: string[]` og `totalTeams`. Body-builder rendrer «Laget endte på X. plass av N lag med Y slag netto (Z brutto). Du spilte med Bjørn og Carla. Solid plassering!» — celebration-cascade speilet par-stableford (1. → Gratulerer, 2./3. → Solid, 4+ → nøytral). Ny `formatPartnerList`-helper bygger norsk komma-separert oppstilling med «og» før siste navn («Bjørn, Carla og Dagfinn»). 5 nye snapshot-tester dekker 2-mannslag, 4-mannslag, 4.-plass uten celebration, tom partner-liste (defensiv), og null playerFirstName.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildTexasScrambleRecipients` bygger per-spiller mottakerliste. Hver spiller på et lag får samme `teamRank`, `teamTotalNet`, `teamTotalGross`, men sin egen `teamPartnerNames` (alle lag-medlemmer minus seg selv). Filtrer ut tomme/null-navn defensivt. 3 nye tester: 2-mannslag, 4-mannslag, og defensiv håndtering av spiller uten email.

#### Notes
- Texas scramble v1 er nå produksjons-klart. Hele 1.16.y-serien dekker: admin-UI (1.16.0), hull-page med ett kort per lag (1.16.1), leaderboard + podium (1.16.2), og mail (1.16.3).
- Drive-distribusjons-regelen ikke håndhevet (honor-system per spec).
- 3-mannslag ikke i v1 (15 % NGF-default kommer som egen issue hvis brukerne ber om det).
- Test-suite vokst fra 903 → 911 (8 nye mail-tester: 5 i sendGameFinishedNotification, 3 i buildGameFinishedRecipients).

</details>

### [1.16.2] - 2026-05-25 · #3

> Når Texas-spillet er i gang ser alle lagene sin sanntids-plassering rangert på laveste lag-netto. Når spillet avsluttes feires vinner-laget på podiet med konfetti, og resten av rangeringen ligger sammenfoldet under.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/TexasScrambleView.tsx` — ny live/active leaderboard-view for Texas. Speilet SoloStrokeplayView visuelt: fairway-backdrop, Fraunces-for-tall typografi, champagne-tint på vinneren. Forskjellene fra SoloStrokeplay-mønsteret: én rad per lag (ikke per spiller), lag-navn «Lag N» med medlemsnavn på sekundærlinjen, sub-tittel «Texas scramble · Sortert på laveste lag-netto», missing-hull-chip vises hvis laget ikke har spilt alle 18 hull.
- `app/games/[id]/leaderboard/TexasScramblePodium.tsx` — ny finished-state podium for Texas. Topp 3 lag på podiet (1.-plass i midten, 2. venstre, 3. høyre), konfetti-burst på 1.-plass én gang per browser-sesjon (distinkt sessionStorage-key `torny-texas-scramble-podium-confetti-seen-${gameId}`), `prefers-reduced-motion` håndtert via globals.css-default på .reveal-up og .confetti-piece-klassene. Resten av rangeringen i collapsed `<details>` under podiet.
- `app/games/[id]/leaderboard/page.tsx` — ny `renderTexasScramble`-helper og branch i mode-routeren. Bygger ScoringContext fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'texas_scramble'`, og velger view per `game.status` (finished → TexasScramblePodium, ellers TexasScrambleView).

#### Notes
- State #3/#3.5-«venterom» bevisst skipped — alle lag-medlemmer ser hverandre umiddelbart (samme RLS-policy som stableford/matchplay/solo-strokeplay).
- `missingHoles`-chip vises kun når laget faktisk mangler hull. Sammenligninger mellom lag med ulike missing-counts er matematisk meningsløse; chip-en signaliserer dette til admin.

</details>

### [1.16.1] - 2026-05-25 · #44

> Hullsiden for Texas scramble viser nå ett scorekort per lag i stedet for ett per spiller. Alle på laget ser samme stepper, og hvem som helst kan taste — tappet havner på lagets felles rad. Avataren på kortet viser lag-nummeret, og under står medlemmenes fornavn. «Lever lagets scorekort»-knappen erstatter «Lever scorekort» for Texas-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/holes/[holeNumber]/page.tsx` — ny `isTexas`-narrowing. For Texas-spill collapses flight-medlemmer til ÉN `ClientPlayer` per lag i stedet for én per spiller. Kapteinen (`lex-min userId` blant lag-medlemmer) eier scores-radene; `playersForClient`-entry-en setter `userId = captainUserId`, `name = "Lag N · Navn1, Navn2"`, `initial = String(team_number)` (avatar-tall), `extraStrokes = strokesForHole(teamHandicap, hole.stroke_index)` der `teamHandicap = round(combined-CH × team_handicap_pct / 100)`. Submit-state propagerer som «innlevert hvis NOEN på laget har submitted_at» — alle medlemmer ser samme låst-tilstand når én leverer.
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — ny `isTexas`-narrowing. `me`-lookup faller tilbake til `players[0]` for Texas (siden non-captain-medlemmer ikke matcher captain-userId-en på sitt eget myUserId). Submit-knapp-tekst: «Lever lagets scorekort» for Texas (mellom «Lever ditt scorekort» for stableford solo og «Lever scorekort» for best-ball).

#### Notes
- Scores skrives med `entered_by = myUserId` (uendret), `user_id = captainUserId` for Texas — audit-trail bevares per tap, men `scores`-radens identitet er lag-kapteinen.
- Real-time-subscription er per-game (ikke per-user), så alle lag-medlemmer ser samme oppdatering når kapteinens rad endres. Ingen ekstra subscription-arbeid nødvendig.
- RLS: insert-policy `scores insert by flight` tillater write til `user_id = captainUserId` fra non-captain-medlem siden de er i samme flight (flight_number = team_number for Texas). Verifisert mot 0002_rls_policies.sql.
- Submit-flow i seg selv er ikke endret — hver spiller har fortsatt sin egen `submitted_at`. En strammere «kun én submit per lag»-policy er en separat design-oppgave, ikke nødvendig for v1.

</details>

### [1.16.0] - 2026-05-25 · #44

> Du kan nå opprette Texas scramble-spill — velg Texas scramble som modus, velg 2- eller 4-mannslag, og fordel spillerne. Lag-handicap settes automatisk etter NGF-tabellen (25 % for 2-mannslag, 10 % for 4-mannslag) og kan justeres som i best ball. Hullsiden og leaderboardet for Texas kommer i neste lansering.

<details>
<summary>Teknisk</summary>

#### Added
- `supabase/migrations/0033_texas_scramble.sql` — widener `games_mode_check` til 5 verdier: `'best_ball_netto'`, `'stableford'`, `'singles_matchplay'`, `'solo_strokeplay_netto'`, `'texas_scramble'`. Fikser latent bug for matchplay og solo strokeplay som var shipped i TS-koden men aldri persisterbart i prod (0 rader for begge — ingen hadde prøvd ennå). Atomic widen som sletter den gamle CHECK-en og legger til en ny med samme navn.
- `lib/scoring/modes/texasScramble.ts` — ny scoring-motor som grupperer spillere på `team_number`, velger lag-kaptein (lex-min `userId`) som scores-rad-eier, regner `teamHandicap = round(sum-CH × team_handicap_pct / 100)` etter NGF-konvensjon, allokerer per hull via eksisterende `strokesForHole`, og rangerer lag på lavest `totalNet` med 5-tier tie-break-cascade. 22 unit-tester dekker shape, kaptein-utvelging, lag-HCP-utregning, per-hull netto, totaler/missing, ranking, tie-break, og edge cases (tomt lag, 9-hulls bane, alle null).
- `lib/scoring/modes/types.ts` — `GameMode` utvidet med `'texas_scramble'`. `MODE_LABELS[texas_scramble] = 'Texas scramble'`. Ny `GameModeConfig`-variant `{ kind: 'texas_scramble', team_size: 2 | 4, teams_count: number, team_handicap_pct: number }`. Nye result-typer `TexasScramblePlayerCell`, `TexasScrambleHoleRow`, `TexasScrambleTeamLine`, `TexasScrambleResult`. `ModeResult`-unionen utvidet.
- `lib/scoring/index.ts` — mode-router-switch ruter `'texas_scramble'` til ny engine.
- `lib/games/gamePayload.ts` — ny `validateTexasScramble` validerer at hvert lag har eksakt `team_size` spillere (2 eller 4 — 3-mannslag utsatt til v1.1 → `unsupported_mode_size_combo`), at `team_handicap_pct` er 0..100 (utenfor → `bad_allowance`), og at `flight_number = team_number` per spiller (DB-CHECK `game_players_team_flight_consistency`). 16 nye validator-tester.
- `app/admin/games/new/ModeSelector.tsx` — ny `TexasScrambleIcon` (senterstilt flagg med tre golfballer på rad under, signaliserer ett lag rundt én ball) og en femte tile «Texas scramble». Grid-layout justert fra `grid-cols-2 sm:grid-cols-4` til `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` slik at 5 tiles wrapper pent på alle breakpoints.
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS[texas_scramble] = new Set([2, 4])`. 4-mannslag aktiveres her som første modus som bruker `team_size: 4`.
- `app/admin/games/new/GameForm.tsx` — ny `isTexas`-narrowing, `defaultTexasHandicapPct`-helper (25 for 2-mannslag, 10 for 4-mannslag), `handleTeamSizeChange`-wrapper som re-defaulter handicap-prosenten ved lagstørrelse-endring under Texas-modus. Lag-grid utvidet med variabel slot-count per lag (2 eller 4). Lag-handicap-felt erstatter HCP-allowance-feltet i Settings-seksjonen for Texas (allowance-kolonnen settes til 100 som no-op via hidden input siden DB-kolonnen er NOT NULL). 8-spiller-limit fra payload-laget begrenser Texas til 4 lag á 2 eller 2 lag á 4 spillere; lag 3 og 4 skjules visuelt når team_size=4.
- `app/admin/games/[id]/edit/page.tsx` — SELECT utvidet med `mode_config` slik at edit-flyten kan pre-fylle `team_size` og `texas_team_handicap_pct` fra persistert state.
- `app/games/[id]/page.tsx` — lokal `game_mode`-union utvidet med `'texas_scramble'`.

#### Notes
- Tre tilstøtende komponenter mangler fortsatt Texas-grenen og kommer i etterfølgende lanseringer i 1.16.y-serien: (a) hull-page rendrer per-spiller-rader uavhengig av modus i dag, Texas trenger ett kort per lag (alle medlemmer ser samme stepper); (b) leaderboard-route har ingen `renderTexasScramble`-branch enda — Texas-spill faller derfor gjennom til best-ball-grenen som kaster på shape-mismatch; (c) `gameFinishedNotification`-mail mangler Texas-grenen så avsluttede Texas-spill får default best-ball-mail. Inntil hele 1.16-serien er ute, ikke publiser Texas-spill i prod.
- Drive-distribusjons-regelen (autentisk Texas: hver spiller må bidra med minst N drives per runde) håndheves ikke i v1 — honor-system. Egen issue hvis brukerne ber om tracking.
- 3-mannslag bevisst utsatt (15 % NGF-default). Egen issue hvis brukerne ber om det.
- WHS-tiered handicap-formel (35/15 for 2-mannslag, 25/20/15/10 for 4-mannslag) som alternativ til NGF-aggregatet kommer eventuelt som `mode_config.handicap_formula: 'whs_tiered' | 'ngf_aggregate'` i v2 hvis brukerne ber om det.

</details>
</details>


<details>
<summary><strong>1.15.y — In-app innboks (5 oppføringer)</strong></summary>

Tørny får en innboks. Bjelle øverst-til-høyre på alle sider viser en champagne-prikk når det venter et nytt varsel, og en dedikert /innboks-flate samler hele historikken. Varslene wires inn etappevis (issue [#25](https://github.com/jdlarssen/golf-app/issues/25)): invitasjoner, peer-godkjenninger, scorekort-events og spill-avsluttet. Siste fase kuttet mail-spammen til aktive brukere — du får ikke lenger mail om noe som allerede er på skjermen din.

### [1.15.4] - 2026-05-24 · #25

> Mail-spam-reduksjonen som kom i 1.15.2 fungerer nå strammere. Tidligere kunne en aktiv bruker likevel få mail hvis siste «jeg er her»-pingen var mellom 5 og 30 minutter gammel; nå matcher pinge-frekvensen og mail-vinduet samme 5-minutters-terskel.

<details>
<summary>Teknisk</summary>

#### Fixed
- `proxy.ts` last_seen_at-WHERE-debouncen senket fra 30 min til 5 min for å matche `OFF_APP_THRESHOLD_MS` i [\`lib/notifications/notify.ts\`](https://github.com/jdlarssen/golf-app/blob/main/lib/notifications/notify.ts). Tidligere mismatch (notify.ts gated på 5 min, proxy debouncet 30 min) kunne gi mail til en aktiv bruker hvis siste pinge var 5–30 min gammel — en konservativ default fra Phase 4 av [#25](https://github.com/jdlarssen/golf-app/issues/25), men ikke maksimal spam-reduksjon. Konstanten ekstrahert til ny `lib/notifications/thresholds.ts` (uten `server-only`) slik at både notify.ts og proxy.ts importerer fra samme sted; cross-reference-kommentaren forhindrer ny mismatch.
- DB-cost: ~12 UPDATEs per bruker per time mot 2 før, men trivielt selv ved klubb-skala (100+ aktive brukere = ~1200 writes/time ≈ 0,3/s).

</details>

### [1.15.3] - 2026-05-24 · #25

> Et raskt dobbelt-trykk på «Lever scorekort» sender ikke lenger flere varsler eller mail. Ble du sittende uten å vite om første trykk gikk gjennom, og trykte igjen, får admin én melding — ikke to.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/submit/actions.ts` — re-submit av et allerede levert scorekort dupliserte tidligere peer-varsler, admin-varsler og admin-mail fordi `.is('submitted_at', null)`-guarden returnerer `error == null` selv ved 0 rader endret. Switch til `.update(...).select('user_id')` + early-return på tom rad-liste; revalidate + redirect kjører fortsatt så UX-en matcher en fersk submit. Arvet legacy-bug fra mail-flyten; Phase 3 av [#25](https://github.com/jdlarssen/golf-app/issues/25) forsterket konsekvensen ved å duplisere in-app-varsler i tillegg. Ny `app/games/[id]/submit/actions.test.ts`-test asserterer at en re-submit ikke fyrer notify eller mail.

</details>

### [1.15.2] - 2026-05-24 · #25

> Du får færre mail når du er aktiv. Hvis du har vært i Tørny de siste fem minuttene når noen leverer scorekort eller avslutter et spill du er med i, dukker varselet kun opp i innboksen din. Mailen kommer som før hvis det er en stund siden du var her.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/submit/actions.ts` — `submitScorecard` filtrerer nå admin-mottakerlisten på `shouldAlsoSendMail` fra notify() før mail-blasten fyres. Aktive admin-er (last_seen_at < 5 min — terskel definert i `lib/notifications/notify.ts:OFF_APP_THRESHOLD_MS`) får kun in-app-varselet; off-app-admin-er får mail som backup. Notify-feil → ikke send mail (samme rasjonale som inni notify() ved insert-error: vi vil ikke maile uten in-app).
- `app/admin/games/[id]/actions.ts` — `endGame` speiler samme pattern for spillerne. Per-spiller `sendMailByUserId`-map bygges fra notify-resultatene; `mailRecipients = recipients.filter(...)` filtrerer før «Resultatet er klart»-blasten.
- `app/admin/games/[id]/avslutt/actions.ts` — `endGameWithSideWinners` speiler endGame-gatingen for sideturnerings-flyten.
- `lib/mail/gameFinishedRecipients.ts` — `FinishedMailRecipient`-interface utvidet med `userId: string` slik at action-laget kan matche notify-utfall mot mail-mottakerlisten. Alle grenene (best-ball, stableford solo/team, singles matchplay, solo strokeplay) oppdaterer recipient-objektene tilsvarende.

#### Notes
- Phase 4 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25) — innboks-epic-en er nå komplett. PR-er: [#173](https://github.com/jdlarssen/golf-app/pull/173) (Phase 1 — datalag), [#180](https://github.com/jdlarssen/golf-app/pull/180) (Phase 2 — bjelle + /innboks), [#185](https://github.com/jdlarssen/golf-app/pull/185) (Phase 3 — event-wiring), denne PR-en (Phase 4 — mail-gating).
- `invite`-event er IKKE wired i mail-gatingen — Phase 3 wired heller ikke selve invite-notify-call-en siden `invitations.game_id` er null i dagens kode (sporet i [#182](https://github.com/jdlarssen/golf-app/issues/182)). Når game-scoped invitations lander vil mail-gatingen følge samme pattern.
- `last_seen_at`-oppdateringen var allerede wired i `proxy.ts` (best-effort fire-and-forget med Postgres-side WHERE-clause-debounce på 30 min). Bekreftet i Task 4.1, ingen ny kode lagt til. Det betyr at gating-threshold-en (5 min off-app) er strammere enn proxy-debounce-en (30 min) — en aktiv bruker kan i teorien få mail hvis deres siste last_seen_at-skriving er 5–30 min gammel. Akseptabel konservativ default — backup-mail er bedre enn manglende varsel.
- Mail-templatene endret seg ikke; alle 39 mail-snapshot-tester er fortsatt grønne. Action-testene (`app/games/[id]/submit/actions.test.ts`, `app/admin/games/[id]/actions.test.ts`) fikk notify-mock + `userId`-felter i fixturene for å gjenopprette deterministisk mail-fyring i happy-path. Tre nye gating-tester ble lagt til (off-app filter + notify-feil fail-closed) for å assertere kontrakten direkte. Test-suite på 840 grønne.
- 5-min vs 30-min terskel-mismatchen sporet i oppfølgings-issue for å vurdere alignment senere.

</details>

### [1.15.1] - 2026-05-24 · #25

> Innboksen lever nå. Du får varsel når noen leverer scorekort, godkjenner ditt eget kort, eller avslutter et spill du er med i. Mailen sendes fortsatt parallelt; neste lansering kutter mailen til de som allerede er aktive i appen.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/submit/actions.ts` — `submitScorecard` varsler nå (a) flight-medlemmer som må peer-godkjenne (`peer_approval_request`-kind) gated på `require_peer_approval` og non-null `flight_number`, og (b) admin-er om at scorekort er levert (`scorecard_submitted`-kind). Begge loopene fyres via Promise.allSettled — feiler stille i notify() og logges som console.error. Mail til admin sendes uavhengig (Phase 3 = sikkerhetsnett); Phase 4 vil gate på shouldAlsoSendMail. select-en på games-raden utvidet med `require_peer_approval`; en ny game_players-query henter flight-medlemmer i samme Promise.all som de eksisterende admin- og submitter-queries.
- `app/games/[id]/approve/actions.ts` — `approveScorecard` varsler nå submitter (`scorecard_approved`-kind) med game.name + approver.name. Wrappet i try/catch slik at en notify-feil aldri blokkerer parent-action.
- `app/admin/games/[id]/actions.ts` — `adminApproveScorecard` speiler peer-approve-flyten med `scorecard_approved`-notify til submitter (approver-navn settes til actorName fra requireAdmin()). `endGame` varsler alle deltakere (`game_finished`-kind) parallelt med eksisterende mail-blast. players-select utvidet med `user_id`.
- `app/admin/games/[id]/avslutt/actions.ts` — `endGameWithSideWinners` speiler `endGame`-loopen for sideturnerings-flyten; samme players-select-utvidelse + game_finished-notify-loop.
- `app/games/[id]/page.tsx` — mark-as-read for både `invite`- og `scorecard_approved`-kinder etter auth-check (spill-hjem er deeplink-target for begge). Best-effort.
- `app/games/[id]/approve/page.tsx` — mark-as-read for `peer_approval_request` ved entry.
- `app/admin/games/[id]/page.tsx` — mark-as-read for `scorecard_submitted` ved entry; gated på userId (helperen forventer non-null).
- `app/games/[id]/leaderboard/page.tsx` — mark-as-read for `game_finished` etter auth-check.

#### Notes
- Phase 3 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25). Phase 4 vil gate mail-sending på `shouldAlsoSendMail` fra notify() slik at aktive brukere ikke får mail i tillegg til in-app-varsel.
- `invite`-event (game-scoped invitation) ble *ikke* wired i denne fasen siden det ikke finnes en game-scoped invite-flyt i koden i dag. `app/invite/actions.ts` håndterer friend-invite (ingen game_id), og `app/admin/spillere/actions.ts` håndterer admin-invite (heller ingen game_id). Når en game-scoped invite-flyt lander vil notify-callen tilføyes der; mark-as-read-hooken på spill-hjem er allerede på plass.
- Test-suite holder på 837 grønne — eksisterende submit/approve/end-game-tester dekker happy-path uten å mocke notify() (notify-feil svelges via Promise.allSettled / try-catch og endrer ikke parent-action-redirect).

</details>

### [1.15.0] - 2026-05-24 · #25

> Innboksen finnes nå som flate i appen — bjelle øverst-til-høyre og en /innboks-side. Selve varslene tikker inn fra og med neste fase; per i dag rendrer innboksen seg som tom for alle.

<details>
<summary>Teknisk</summary>

#### Added
- `hooks/useUnreadNotificationsCount.ts` — client-hook med initial `count: 'exact', head: true`-query mot `notifications`-tabellen + Supabase realtime-sub på `postgres_changes` (INSERT + UPDATE) som lokalt mutérer telleren (INSERT-ulest +1, UPDATE som flipper read_at justerer i begge retninger, Math.max-floor mot negativ teller). Cleanup ved unmount eller userId-bytte. Gjenbruker `subscribeRealtimeChannel`-helperen for setAuth-jwt-håndtering og leak-resistant kanal-suffiksing. 8 tester dekker null-userId-no-op, initial-fetch, INSERT-inkrement (kun ulest), UPDATE-mark-lest-dekrement, UPDATE-mark-ulest-inkrement, floor-på-0, og realtime-cleanup.
- `components/notifications/NotificationBell.tsx` — SmartLink til /innboks med lokalt-tegnet 22px bell-svg (line-icon stil) + 8px champagne-prikk (var(--accent), border-2 av --bg) absolutt-posisjonert øverst-til-høyre når `count > 0`. Ingen tellertall — kun signal-dott per design (mindre visuell støy). aria-label varierer med count. Returnerer null når userId mangler. Tap-target min-h-11 min-w-11 (44px). 7 tester dekker rendring, prikk-toggle, aria-label-format, null-userId, og tap-target.
- `components/notifications/NotificationCard.tsx` — per-kort UI for innboks-listen med emoji-bobble per kind (📨 invite, ✋ peer_approval_request, 📋 scorecard_submitted, ✅ scorecard_approved, 🏆 game_finished), tittel + 1-linjes detalj fra payload (handlings-orientert norsk), champagne-stripe + font-medium for uleste, opacity-80 + font-normal for leste, relativ tidsstempel via `Intl.RelativeTimeFormat('nb-NO', { numeric: 'auto' })`, button med min-h-11 tap-target og caller-styrt onTap. 12 tester dekker payload→title/detail per kind, emoji-mapping, relativ-tid, unread-stripe-toggle, font-medium-toggle, tap-handler og tap-target.
- `lib/notifications/groupByDay.ts` — `groupNotificationsByDay`-helper bucketer notifications per kalender-dag i lokal tid med «I dag»/«I går»/dato-label. `formatDayLabel` håndterer fire nivåer (i dag, i går, dato uten år, dato med år). 8 tester dekker tom input, single-dag-bucket, multi-dag-bucketing, rekkefølge-bevaring, og forrige-år-fallback.
- `app/innboks/page.tsx` + `app/innboks/InboxClient.tsx` + `app/innboks/actions.ts` — /innboks-rute. Server-component fetcher inntil 100 nyeste notifications-rader for current user (eksplisitt user_id-filter for å bruke partial-indexen). Client håndterer optimistic-mark-read ved tap, server-action via useTransition + router.push til deeplink (invite/scorecard_approved → /games/[id], peer_approval_request → /approve, scorecard_submitted → /admin/games/[id], game_finished → /leaderboard). «Marker alle som lest»-knapp synlig kun ved minst ett ulest. Tom-tilstand bruker `<MailEnvelope>` + PullQuote. 10 nye InboxClient-tester.
- `components/ui/TopBar.test.tsx` — 5 tester for ny `userId?: string | null`-prop og action+bell-co-existence.

#### Changed
- `components/ui/TopBar.tsx` — ny valgfri `userId?: string | null`-prop. Når satt rendres `<NotificationBell userId={userId}>` lengst til høyre (med `ml-1` etter eventuell action-chip, ellers `ml-auto`). Legal/privacy + admin/loading skipper bjella (offentlig hhv. skeleton-tilstand).
- Wired userId-prop på 21 page-flater: alle admin-flater + alle profile-flater + games/[id]/{,submit,approve,scorecard,leaderboard}. Per-page-mønsteret er bevisst eksplisitt — `getProxyVerifiedUserId()` er en ren x-torny-user-id-header-lookup uten DB-roundtrip, så cost-en er minimal.
- `app/page.tsx` — bjella mountes ved siden av BrandMark i en flex-rad siden home ikke har TopBar (BrandMark er en wordmark, ikke en lenke).
- `app/games/[id]/leaderboard/RevealBruttoView.tsx` — ny required `userId: string | null`-prop forwardet fra leaderboard-page (komponenten har egen TopBar).
- `lib/notifications/markRead.ts` — utvidet med valgfri `notificationId?: string`-parameter for per-tap-marking fra innboks. Eksisterende kind+entityId-filtre uendret. `buildMarkReadQuery`-tester utvidet til 4 cases.

#### Notes
- Phase 2 av 4 i issue [#25](https://github.com/jdlarssen/golf-app/issues/25). Phase 1 leverte datalag (1.14.3). Phase 3 wires inn de 5 events i eksisterende server-actions; Phase 4 aktiverer off-app mail-gating.
- Per d.d. er innboksen tom for alle siden ingen server-action ennå kaller `notify()`. Bjella forblir uten prikk inntil Phase 3.
- Test-suite vokst fra 786 → 837 (+51 nye Phase 2-tester).

</details>
</details>
</details>



<details>
<summary><strong>Spillmodi-grunnmuren & verktøy — 10 serier</strong></summary>

<details>
<summary><strong>1.14.y — Stableford-runde-polish (4 entries)</strong></summary>

Polish etter første reelle stableford-runde med kompisene. Du kan nå føre slag for hele flighten i solo stableford, fortsette runden fra første tomme hull, og se sideturneringen på stableford-leaderbordet etter avsluttet spill. Hele appens norske copy er også strammet for AI-tells og engelske kalker — først via humanizer (1.14.3), så et no-nb-pass mot code-switched English som var igjen (1.14.4), og til slutt en oppfølger som fanget «Stackbare» + «Lag-koord»-forkortelsen (1.14.5).

### [1.14.5] - 2026-05-24

> To anglisismer i sideturnerings-flyten ryddet: «Stackbare bonuser» heter nå «Bonuser som stables», og den Tørny-interne forkortelsen «Lag-koord» heter «Lag-bonus» på alle bruker-rettede flater. Tre gruppe-titler i «Slik gis poengene»-panelet som var glemt i forrige pass («Skill og rarity», «Moderate», «Achievements») følger nå samme oversettelse som admin-pickeren.

<details>
<summary>Teknisk</summary>

#### Changed
- `components/admin/SideCategoriesPicker.tsx` — «Stackbare bonuser — kan utløses flere ganger samme runde.» → «Bonuser som stables — kan utløses flere ganger samme runde.» Pointslabel for Turkey/Solid: «4p / spiller + lag-koord» / «2p / spiller + lag-koord» → «… + lag-bonus».
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — alle 8 bruker-rettede forekomster av «Lag-koord»/«lag-koord» byttet til «Lag-bonus»/«lag-bonus»: chip-labels for Turkey/Solid lag-koord, rule-tekster («Lag-koord utløses om hele laget …»), og pointsPerId-strenger («4p × N lag-koord-bonus» → «4p × N lag-bonus»).
- `app/games/[id]/leaderboard/SideTournamentView.tsx` — tre PANEL_GROUPS-titler som ble glemt i 1.14.4-passet: «Skill og rarity» → «Ferdighet og sjeldenhet», «Moderate» → «Moderat», «Achievements» → «Bragder». GROUP_LABELS-en (rendret for fane-overskriftene) ble fikset i 1.14.4, men PANEL_GROUPS (rendret i «Slik gis poengene»-panelet) hadde duplikatene som humanizer-/no-nb-passet ikke fanget.

#### Notes
- Bevisst beholdt: kode-kommentarer og test-describe-blocks bruker fortsatt «lag-koord» som domain-jargon (per CLAUDE.md `### Språk` — kode/kommentarer/tester er engelsk-mixed, ikke bruker-synlig).
- 107 tester på tvers av endrede områder grønne — ingen UI-snapshot-assertions brutt.
- Lærdom: en grundigere no-nb-audit bør lete i parallelle data-strukturer i samme fil (GROUP_LABELS + PANEL_GROUPS hadde nesten-duplikater hvor bare den ene ble fikset). Lagt til som hint i CLAUDE.md «Språk-kvalitet»-seksjonen.

</details>

### [1.14.4] - 2026-05-24

> Engelske ord embedded i norske setninger er ryddet: «gender» → «kjønn» i bane-administrasjon, sideturnerings-gruppene heter nå «Bragder», «Minuspoeng» og «Ferdighet og sjeldenhet» (var «Achievements», «Penalty» og «Skill og rarity»), «Custom»-preset heter «Egendefinert», og 12 «Best ...»-labels på leaderbordet er endret til «Beste ...».

<details>
<summary>Teknisk</summary>

#### Changed
- `no-nb:no-nb`-skillet kjørt over hele appen for å fange code-switched English (engelske ord embedded i norske setninger). Dette er en kategori humanizer ikke pågriper like systematisk siden mønstrene ofte ikke ser ut som AI-tells på overflaten.
- **Bane-administrasjon** (`app/admin/courses/CourseForm.tsx`, `app/admin/courses/new/page.tsx`, `app/admin/courses/[id]/edit/page.tsx`, `lib/admin/gameErrorMessages.ts`) — 7 forekomster av «gender» → «kjønn». Inkluderer «per gender», «gender-rating» → «rating-sett per kjønn», «spillers gender» og «tee-gender».
- **Sideturnering** (`app/games/[id]/leaderboard/SideTournamentView.tsx`, `components/admin/SideCategoriesPicker.tsx`) — gruppe-titler oversatt: «Skill og rarity» → «Ferdighet og sjeldenhet», «Moderate» → «Moderat», «Achievements» → «Bragder», «Penalty» → «Minuspoeng». «Custom»-preset-chip → «Egendefinert». «preset» → «forhåndsvalg», «togglerne» → «bryterne», «Hole-wins» → «Hull-seire», «bogey-fri-streak» → «bogey-fri rekke», «kan trigge»/«trigger» → «kan utløses»/«utløses», «(penalty)» trailer → «(minuspoeng)».
- **«Best» som mid-sentence-adjektiv** (6 labels per fil × 2 filer = 12 forekomster) → «Beste» i `'Best netto totalt 18'`, `'Best netto front/back 9'`, `'Best brutto totalt 18'`, `'Best brutto front/back 9'`. Norsk bestemt form for superlative adjektiver mid-sentence.

#### Notes
- Audit dispatched som single Opus-subagent etter at brukeren oppdaget «Fyll inn rating for hver gender»-strengen som humanizer-passet hadde glemt. Audit-en fant ~22 distinkte code-switched English forekomster fordelt på 6 filer.
- Bevisst beholdt: golf-termer (`best ball`, `stableford`, `matchplay`, `tee`, `leaderboard`, `Slope`, `CR`, `Course Rating`, `Hole-win` singular), achievement-navn (Turkey, Solid, Snowman), kode-identifikatorer + kommentarer + JSDoc (per CLAUDE.md-konvensjon).
- 116 tester på tvers av endrede områder grønne — ingen snapshot-/string-assertion brutt.
- CLAUDE.md «Språk-kvalitet i bruker-rettet copy»-seksjonen utvidet med «Code-switching i bruker-rettet kopi»-paragraf som dokumenterer mønsteret eksplisitt, slik at framtidige no-nb-pass kan lete spesifikt etter dette.

</details>

### [1.14.3] - 2026-05-24 · #25

> Hele Tørnys norske copy er polert: feilmeldinger, banner-tekster, mail-malene og knappe-tekster er strammet for AI-tells og engelske kalker. Du merker det som mer naturlig norsk på alle flatene. Under panseret er også datalaget for in-app innboks lagt inn — usynlig for deg ennå (fase 1 av 4 mot varslings-senter, [#25](https://github.com/jdlarssen/golf-app/issues/25)).

<details>
<summary>Teknisk</summary>

To uavhengige arbeidsstrømmer landet samme dag og delte versjonsnummer. Begge er samlet her for å holde semver-historikken ren (én versjon, én dato, én oppføring).

#### Changed — humanizer-pass på brukerrettet norsk
- 27 filer på tvers av mail-templates, auth-flyt, UI-primitives, spille-flyt og admin-flyt fikk en gjennomgang med `humanizer:humanizer`-skillet (fra `floka-marketplace`). Mønstrene fulgte etablert vokabular fra [PR #170](https://github.com/jdlarssen/golf-app/pull/170): anglisismer, em-dash-kjeder, «X-spillet»-redundans, særskriving, curly quotes og significance-puffery.
- **Mail** (`lib/mail/gameFinishedNotification.ts`, `lib/mail/scorecardSubmittedNotification.ts`, `docs/email-templates.md`) — em-dash-kjeder splittet, passiv-opener byttet ut («Vi mottok forespørsel om å endre…» → «Du har bedt om å endre…»), idiomatisk definitt-form («leaderboard er åpen» → «leaderboardet er åpent»).
- **Auth-flyt** (`app/(auth)/login/page.tsx`, `app/complete-profile/page.tsx`) — anglism «på login» fjernet, US-decimal i feilmelding (`54.0` → `54,0`), passiv-formulering («det navnet folk kjenner deg som» → «navnet du går under»).
- **UI-primitives** (`components/sync/SyncBanner.tsx`, `components/pwa/InstallInstructionsModal.tsx`) — feilmelding-tone («Tillatelse manglet» → «Du mangler tilgang», «Lagring mislyktes» → «Klarte ikke å lagre»), «nett-tilkoblingen» → «nettforbindelsen», em-dash-kjede i iOS-instruksjoner splittet.
- **Spille-flyt** (`components/hole/*.tsx`, `app/games/[id]/approve/*.tsx`, `app/games/[id]/leaderboard/*.tsx`) — «Tap» → «Trykk» (4 steder, anglism), AI-hedge i confirm-dialog, filler «akkurat nå» fjernet, synonym-overlap droppet i RevealBruttoView.
- **Admin-flyt** (12 filer i `app/admin/` + `lib/admin/gameErrorMessages.ts`) — em-dash-tells (~10 steder), «Vennligst»-overforbruk strammet, tailing-fragmenter omsporet, generisk «Noe gikk galt» → konkret «Klarte ikke å fullføre handlingen», «spennings-moment»-særskriving → «spenningsmoment».

#### Added — notifications-datalag (#25 Phase 1)
- `supabase/migrations/0032_notifications.sql` — `public.notifications`-tabell (polymorf med kind-discriminator + JSONB payload), RLS-policies (select/update kun egne), 2 indekser (uleste-partial + full-historikk), realtime-publikasjon. Applied mot prod via Supabase MCP.
- `lib/notifications/types.ts` — `NotificationKind`-union for de 5 v1 events (`invite`, `peer_approval_request`, `scorecard_submitted`, `scorecard_approved`, `game_finished`) + Zod-skjema per kind. `parseNotificationPayload()` validerer payload mot kind før insert. Bruker `z.guid()` (permissiv UUID-shape) framfor strict RFC 9562 `z.string().uuid()` siden test-sentinels og nil-UUID skal kunne valideres.
- `lib/notifications/notify.ts` — `notify()`-helper inserter notification-rad via admin-client (bypass RLS) + returnerer `shouldAlsoSendMail`-flagg basert på `users.last_seen_at` (off-app hvis null/ugyldig/> 5 min siden). Insert + last_seen_at-lookup kjøres i parallell. Feiler stille på DB-error (returnerer `shouldAlsoSendMail: false` for å unngå mail-uten-in-app). `shouldSendMailFallback()` er pure-helper eksportert for testing og direkte bruk.
- `lib/notifications/markRead.ts` — `markNotificationsRead({userId, kind?, entityId?})` UPDATEr matching uleste rader til `read_at = now()`. Bruker `getServerClient()` (cookies) — RLS-policy `notifications_update_own` gir authz «gratis». Kompositoriske filtre: bare userId (marker alle), userId+kind (alle av kind), userId+kind+entityId (game-scoped). Brukes både fra /innboks-knapper og fra server-side helpers på målsider.
- `zod ^4.4.3` lagt til som ny dep for payload-validering.
- 10 nye unit-tester (3 types, 4 notify, 3 markRead).

#### Notes
- Begge arbeidsstrømmer landet 2026-05-24 og fikk hver sin bump til 1.14.3 — humanizer-passet bumpet uavhengig av notifications-foundation som var commited noen timer tidligere. Konsolidert til én oppføring 2026-05-24 ([#181](https://github.com/jdlarssen/golf-app/issues/181)) for stakeholder-lesbarhet; git-historikken bevarer fortsatt begge commits separat (`9eb9aeb` notifications-foundation + `e488f8a` humanizer-pass).
- 5 parallelle humanizer-subagenter dispatched, hver mot disjoint overflate (mail / auth / UI-primitives / spille / admin). Alle 39 mail-tester grønne — verifisert at ingen subject-/body-snapshots ble brutt.
- Bevisst bevart: mail-subject «Resultatet er klart — ${gameName}» (5 snapshot-tester asserter eksakt streng), brand-tagline «Tørny — fyr opp golfturneringen» (kanonisk), «Sekretariat»-stemmen i admin-flatene, og engelske side-tournament-kategori-navn (Turkey/Solid/Snowman — bevisste achievement-navn).
- Foundation-commits for notifications er prefikset `chore(notifications)` siden de ikke endrer bruker-synlig oppførsel — kun datalag og helpers ikke ennå kalt fra noen actions. Phase 2 leverer bjelle + /innboks UI; Phase 3 wires inn de 5 events; Phase 4 aktiverer off-app mail-gating.

</details>

### [1.14.2] - 2026-05-24

> Når et stableford-spill med sideturnering avsluttes, vises sideturneringen som en egen fane på leaderbordet — akkurat som for best ball. Tidligere var sideturneringen helt usynlig på stableford selv om du hadde valgt å legge den til.

#### Added
- `app/games/[id]/leaderboard/page.tsx` — ny `renderStablefordWithSideTournament`-helper henter LD/CTP-vinnere fra `game_side_winners`, bygger `SideTournamentInput` per spiller/lag (perHoleGross + perHoleNetto med `strokesForHole`-justering), og pakker hoved-podiet + `SideTournamentView` inn i `LeaderboardTabs`. Solo-stableford mapper hver spiller til en «team of 1» med løpende teamId — lag-aggregerte sidekategorier (most_birdies_team etc.) faller bort som forventet via `userIds.length >= 2`-filteret i sideTournament.ts, mens individ-kategorier + LD/CTP + Snowman fungerer normalt. Par-stableford bruker eksisterende team_number-gruppering; nettoBestBallPerHole = MIN av lagets to spilleres netto per hull, samme logikk som best-ball-grenen lenger oppe.
- `renderStableford` ble async for å støtte sideturnerings-fetchen — kalt fra `LeaderboardBody` som allerede er async, så ingen call-site-endringer.

#### Changed
- `app/games/[id]/leaderboard/SoloStablefordPodium.tsx` + `TeamStablefordPodium.tsx` — ny `chromeless?: boolean`-prop (default false) som hopper over `Shell` (AppShell-wrapper) og `Header` (back-pil + kicker) når satt. Brukes når podiet rendres inni `LeaderboardTabs` — outer-callern eier AppShell + TopBar. Speilar `State4View.chromeless`-pattern. Eksisterende standalone-bruk (uten sideturnering) er upåvirket.

### [1.14.1] - 2026-05-24

> «Fortsett runden»-knappen på spill-hjem sender deg nå direkte til første tomme hull i stedet for alltid hull 1. Etter å ha tastet hull 1-9 og lagt fra deg telefonen, åpner appen rett på hull 10 når du tar opp igjen.

#### Changed
- `app/games/[id]/page.tsx` — `PrimaryCtaSection` fetcher nå listen av hull med score (i stedet for kun count via `head: true`) og sekvensielt-scanner 1→18 etter første hull uten score. Resultatet sendes som `nextHole`-prop til `PrimaryCta` og brukes i både «Start runden» og «Fortsett runden»-linkene (tidligere hardkodet `/holes/1`). For full-runde-state (`ready_to_submit`) er verdien ubrukt — CTA-en routes til `/submit` der i stedet, så fallback til 1 ved 0 tastede hull dekker både not_started og in_progress.

### [1.14.0] - 2026-05-24

> I solo stableford kan nå én spiller fungere som «marker» og taste slag for alle i flighten — akkurat som i best ball. Tidligere kunne hver spiller kun se og taste sitt eget scorekort.

#### Changed
- `app/games/[id]/holes/[holeNumber]/page.tsx` — flight-filtreringen i hull-siden behandler nå hele spillerlisten som én flight når `me.flight_number == null` (solo-modus: stableford og solo strokeplay netto), i stedet for å filtrere ned til kun `[me]`. Konsekvens: en av spillerne kan markere for alle de andre i samme spill — typisk bruksmønster når 1-4 kompiser går runden sammen og én av dem fører kortet. Best-ball- og matchplay-modus beholder per-flight-filtreringen som før (flight_number er satt i de modusene).

#### Notes
- `HoleClient`-komponenten støtter allerede multi-player rendering (`cards.map` itererer over alle innsendte spillere, `onSetScore(playerId, value)` godtar hvilken som helst userId), så ingen client-side endringer var nødvendige. Den eksisterende «Bekreft alle scorer»-bekreftelses-gaten på BottomActionBar gjelder fortsatt — marker må fylle inn for alle spillerne før «Neste hull» aktiveres, samme regel som best ball.
</details>


<details>
<summary><strong>1.13.y — Slagspill (3 entries)</strong></summary>

Klassisk slagspill (solo strokeplay netto) er nå tilgjengelig. Velg Slagspill som modus, meld på spillerne, og lavest netto-total over runden vinner. Hver spiller fører sitt eget kort — perfekt for klubbmesterskap og kompis-runder uten lag-fokus.

### [1.13.2] - 2026-05-24 · #46

> Når slagspillet avsluttes får spillerne mail med sin plassering og totalt antall netto-slag. Admin-flaten viser «Slagspill» konsistent for solo-strokeplay-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'solo_strokeplay_netto'`-gren med `rank`, `totalNetStrokes`, `totalGrossStrokes` og `totalPlayers`. Body-builder rendrer personlig plassering med netto-total og brutto som side-note: «Du endte på 2. plass av 8 med 72 slag netto (78 brutto)». Celebration-cascade speilar solo-stableford-grenen (1. → «Gratulerer med seieren!», 2-3 → «Solid plassering!», 4+ → nøytral). 6 nye tester dekker 1.-plass + netto/brutto, 2.-plass + solid, 3.-plass + solid, 4.-plass nøytral, plain-text-felter, og fallback når `playerFirstName` er null.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildSoloStrokeplayRecipients`-helper bygger per-spiller mottakerliste fra `SoloStrokeplayResult`. Speilet solo-stableford-pattern strukturelt: kjører `computeLeaderboard` mode-router, narrower på `kind === 'solo_strokeplay_netto'`, og mapper hver spiller til mode-payload med rank + slag-totaler. Defensive fallbacks: hvis mode-router returnerer noe annet enn `solo_strokeplay_netto`, faller helperen tilbake til nøytral best-ball-default. Spillere uten email droppes (samme regel som de andre grenene). 3 nye tester dekker rank + slag-utregning, drop av spillere uten email (totalPlayers reflekterer FULL turnering), og brutto/netto-diff når HCP gir ekstra slag.

#### Changed
- `app/admin/games/[id]/page.tsx` — `isSolo`-narrowing utvidet til å dekke `solo_strokeplay_netto` i tillegg til solo-stableford (`team_size === 1`). Konsekvenser: admin-detalj-siden skjuler Lag-seksjon + Lag/Flight-kolonner for slagspill-spill (én spiller = én deltager), og Format-cardet viser «Slagspill» fra `MODE_LABELS` konsistent. `modeLabel`-JSDoc oppdatert til å reflektere at matchplay og slagspill begge leser ren mode-label.

#### Notes
- Phase 4 markerer epic #46 (solo strokeplay netto) som ferdig. Tidligere faser leverte scoring + validation (Phase 1), GameForm-UI med slagspill-modus (Phase 2), og leaderboard-view + podium (Phase 3). Mailen og admin-polish-en var de siste manglende stykkene før formatet er produksjons-klart.

</details>

### [1.13.1] - 2026-05-24 · #3

> Når slagspillet er i gang ser spillerne et leaderboard rangert på laveste netto-total. Avsluttet spill viser podium for topp 3 — 1.-plassen feires med konfetti.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStrokeplayView.tsx` (+ test) — live/post-finished leaderboard for solo strokeplay netto. Flat liste sortert på `totalNetStrokes` (lavest øverst, klassisk slagspill-format), speilar `SoloStablefordView` 1:1 med disse forskjellene: hoved-tallet er «slag» (ikke «poeng»), sekundær-linje viser brutto-total ved siden av hull-spilt («N brutto · N hull spilt»), sub-tittel «Slagspill · Sortert på laveste netto». Topp 3 får Medallion (gull/sølv/bronse), 4+ får rank-disc. Champagne-tinted Card kun for vinneren. 12 tester dekker rad-rendring, sortering, brutto-display, «slag»-label (ikke «poeng»), Medallion-vs-rank-disc, tabular-nums på netto-tallet, formatRevealName, tom liste, ukjent spiller-fallback, sub-tittel-tekst og tied-spillere.
- `app/games/[id]/leaderboard/SoloStrokeplayPodium.tsx` (+ test) — finished-state-view ved `game.status === 'finished'`. Speilar `SoloStablefordPodium` med samme 3-trinns podium-layout (1. midten, 2. venstre, 3. høyre), champagne accent for vinneren, sølv/bronse for 2-3, og rest-listen i collapsed `<details>`-element for rank 4+ med både netto og brutto-totaler. Distinkt sessionStorage-key `torny-solo-strokeplay-podium-confetti-seen-${gameId}` — verifisert via dedikert test at den ikke kolliderer med stableford-key-en. 19 tester dekker podium-trinn-rendring, slag-label (ikke poeng), hull-chip, konfetti-burst, konfetti-key-isolasjon, suppression når sessionStorage allerede har sett-flagg, champagne accent, collapsed details-rest med netto + brutto, ≤3-spillere-skip, 2- og 1-spiller-edge-cases, tom liste, formatRevealName-bruk, ukjent-fallback, sub-tittel og lavest-først-rangering.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — ny `renderSoloStrokeplay`-helper og branch i `LeaderboardBody`. Følger samme mønster som `renderStableford` og `renderMatchplay`: bygger `ScoringContext` fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'solo_strokeplay_netto'` og velger view per `game.status` (finished → podium, ellers live-view). `teamNumber` sendes som null siden solo-strokeplay-validatoren håndhever solo-modus. State #3/#3.5-«venterom» bevisst skipped (samme RLS-pattern som stableford og matchplay — alle spillere ser hverandre umiddelbart).

#### Notes
- Scoring-motor + validator landet i Phase 1 (PR #159), admin-UI-flyten i Phase 2 (PR #160). Denne fasen lukker leaderboard-gapet slik at slagspill-spill rendres riktig fra start til finished-podium. Mail-template + admin/games-detalj-polish kommer i Phase 4 av epic #46.

</details>

### [1.13.0] - 2026-05-24 · #159

> Du kan nå opprette slagspill-turneringer — klassisk golf-format der hver spiller fører eget kort og laveste netto-total vinner. Velg Slagspill som modus og meld på spillerne.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/ModeSelector.tsx` — fjerde tile «Slagspill» for solo strokeplay netto. Ny `StrokeplayIcon` (scorekort med tre score-linjer + blyant til høyre, samme stroke-stil som de andre tile-ikonene) signaliserer at hver spiller fører eget kort. Grid-layout byttet fra `grid-cols-1 sm:grid-cols-3` til `grid-cols-2 sm:grid-cols-4` slik at iPhone får 2×2-stacking (hver tile ~halve skjermbredden, komfortabel scanning) og tablet/desktop får 4-i-rad-symmetri. Beskrivelses-tekst: «Individuelt scorekort. Lavest netto-total vinner.» `ModeSelector.test.tsx` utvidet med assertion for slagspill-tile-rendering, beskrivelses-tekst, aria-checked-toggle og click → `onChange('solo_strokeplay_netto')`.
- `app/admin/games/new/GameForm.tsx` — solo strokeplay netto-grenen gjenbruker hele solo-stableford-UI-flyten via utvidet `isSolo`-narrowing-flag (`teamSize === 1 && (gameMode === 'stableford' || gameMode === 'solo_strokeplay_netto')`). Konsekvenser:
  - **Flat spiller-liste**: ingen lag-grid og ingen flight-seksjon — alle valgte spillere persisteres med `team_number = null` og `flight_number = null` (gamePayload-validatoren `validateSoloStrokeplayNetto` nullstiller defensivt uansett form-input).
  - **TeamSizeSelector synlig**: Solo aktiv, Par + 4-mann grayed-out som «kommer snart» (par/4-mann strokeplay er fremtidige varianter — par = fyrball strokeplay; 4-mann = bestest av 4 totaler). I motsetning til matchplay som skjuler hele TeamSizeSelector siden 1v1 er den eneste meningsfulle kombinasjonen.
  - **Per-spiller-tee-seksjon**: vises (slagspill krever individuell HCP-allokering for korrekt slope/CR per spiller). Section-nummer 4 (delt med solo-stableford siden ingen 4. Lag-seksjon ligger foran).
  - **Validering**: ≥1 spiller for publish, ingen øvre cap (i motsetning til matchplay som capper på 2). `missingForPublish` gjenbruker eksisterende «minst én spiller»-copy fra solo-stableford-grenen.
  - **Hidden inputs**: `game_mode = 'solo_strokeplay_netto'`, `team_size = 1`, ingen `stableford_team_size` (det hører kun til stableford-modus). Player-radene bærer tomme `team`/`flight`-strenger som validatoren tolker som null.
  - `defaultTeamSizeForMode` returnerer 1 også for `solo_strokeplay_netto` så form-state alltid har gyldig `team_size`.
- `app/admin/games/new/GameForm.test.tsx` — 7 nye tester for slagspill-flyten: TeamSizeSelector synlig med Solo aktiv + Par/4-mann disabled, hidden inputs (`game_mode='solo_strokeplay_netto'`/`team_size=1`/ingen `stableford_team_size`), flat spiller-liste (ingen 4. Lag- eller 5. Flights-heading), canPublish=true ved 1 spiller + øvrige felt satt, canPublish=false ved 0 spillere (med korrekt missingForPublish-copy «minst én spiller»), per-spiller-tee-seksjons-heading «4. Tee per spiller», ingen øvre spiller-cap (alle 8 spillere kan velges), og hidden-input-payload med tomme team/flight-strenger.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #159) — denne fasen aktiverer kun admin-UI-flyten. Solo-strokeplay-leaderboard-view kommer i Phase 3 (klassisk slagspill-tabell med plassering/totaler/topp-celebrasjon); mail-template + admin/games-detalj-polish kommer i Phase 4 av epic #46.
- TeamSizeSelector beholder `ENABLED_COMBOS.solo_strokeplay_netto = Set([1])` defensivt — `Record<GameMode, …>` krever alle keys, og Par/4-mann markeres som «kommer snart» istedenfor å fjernes helt (skaper en eksplisitt roadmap-signal for fremtidige varianter).

</details>
</details>


<details>
<summary><strong>1.12.y — Matchplay (3 oppføringer)</strong></summary>

Matchplay-turneringer mellom to spillere er nå tilgjengelig. Velg Matchplay som modus og tilordne én spiller til Side 1 og én til Side 2 — vinneren av hvert hull (laveste netto) får et hull-poeng, og matchen avgjøres som «X up» (etter 18 hull) eller «X&Y» (mat-em før hull 18) etter golfreglene.

### [1.12.2] - 2026-05-24 · #45

> Når matchen avsluttes får begge spillere mail med matchresultatet («Du vant 3&2 over Per» / «Du tapte 1up mot Per» / «AS — uavgjort»). Admin-flaten viser Sider i stedet for Lag for matchplay-spill.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'singles_matchplay'`-gren med `matchResult` (`'won' | 'lost' | 'tied'`), `formattedResult` (golf-format: «3&2» / «1up» / «AS»), `opponentName` (motspillerens fornavn, `null` faller tilbake til «motstanderen») og `selfSide` (1 eller 2). Body-builder rendrer tre grener:
  - **won**: «Du vant {formatted} over {opponent}. Gratulerer med seieren!»
  - **lost**: «Du tapte {formatted} mot {opponent}. Godt spilt — kanskje revansje neste runde?»
  - **tied**: «Matchen mot {opponent} endte uavgjort (AS). En jevn match — kanskje neste gang.»
  - 5 nye tester dekker won / lost / tied / null-opponent-fallback / null-firstName-fallback. HTML escaper opponent-navn (XSS-defense), formatted-strengen rendres direkte siden den genereres internt fra tall.
- `lib/mail/gameFinishedRecipients.ts` — ny `buildMatchplayRecipients`-helper bygger per-spiller mottakerliste fra `SinglesMatchplayResult`. Hver spiller får motspillerens fornavn via `sideByUserId`-lookup (scoring-laget tuple-garantien gir oss 1+1) og matchResult mappet fra `result.result.winner` ('side1'/'side2'/'tied') sett FRA mottakerens `selfSide`. Defensive fallbacks: hvis matchen ikke er avgjort (`result.result === null` — sjelden gitt endGame-validering) eller hvis mode-router returnerer noe annet enn `singles_matchplay`, faller helperen tilbake til nøytral best-ball-default. 6 nye tester dekker side 1 vinner / side 2 mat-em (3&2) / AS / spiller uten mail / motspiller uten navn / live (ikke avgjort) → fallback.

#### Changed
- `app/admin/games/[id]/page.tsx` — ny `isMatchplay`-narrowing-flag (`game.game_mode === 'singles_matchplay'`) + tre tilpasninger:
  - **Lag-terminologi**: «Antall lag X / 4» blir «Antall sider X / 2», Lag-seksjonen tittel «Lag» blir «Sider» (kun viser Side 1 og Side 2, aldri 3/4), spillerlistens «Lag»-kolonne blir «Side», og «Leverte scorekort»-listen viser «Side N» i stedet for «Flight N · Lag N» for matchplay.
  - **Flights-seksjonen skjules**: flight = side mekanisk (validatoren håndhever `flight_number = team_number` for matchplay), så Flights-listen ville duplisert Sider-listen rett over — speilet par-stableford-pattern fra 1.11.2.
  - **Fremgang-kortet**: bytter «Hvor langt hver flight har kommet» til «Hvor langt hver side har kommet», og labelen «Flight N» til «Side N» for konsistens med resten av detail-pagen.

#### Notes
- Phase 4 markerer epic #45 (singles matchplay v1) som ferdig. Tidligere faser leverte scoring + validation (Phase 1), GameForm-UI med side-tilordning (Phase 2), og MatchplayMatchView-leaderboarden (Phase 3). Mailen og admin-polish-en var de siste manglende stykkene før formatet er produksjons-klart.

</details>

### [1.12.1] - 2026-05-24 · #3

> Når matchen er i gang ser begge spillerne sin sanntids match-status («X up etter Y hull»), og når matchen er over feires vinneren med resultat i golf-standard format («3&2», «1up», «AS»).

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/MatchplayMatchView.tsx` (+ test) — ny match-view for singles matchplay. Erstatter leaderboard-grenene når `game_mode === 'singles_matchplay'`. Kombinerer live-state og finished-state i én komponent siden matchen er den samme historien som gradvis avgjøres — banner-formen bytter automatisk basert på `result.result`. Fire vertikalt-stablete seksjoner:
  - **Status-banner** øverst: «{Vinner} vant {formatted}»-card med Medallion + champagne-accent ved avgjort match (mat-em eller spilt 18 hull med vinner), «Matchen endte AS»-card uten konfetti ved tied-resultat etter 18 hull, «{Leder} leder {N} up»-card ved live-state midt i runden, «Alt likt etter N hull»-card ved tied-state midt i runden, og «Matchen er ikke startet ennå»-card ved 0 hull spilt.
  - **Sider-header**: to rader (S1 + S2) med spiller-navn (via `formatRevealName`) og course-handicap. Lederside får hårfin champagne-accent (`border-accent/60 bg-accent/[0.05]`).
  - **Per-hull-grid**: tabell med en rad per `MatchplayHoleRow` (skalerer til 9-hulls-baner ved kortere hulls-array). Kolonner: Hull, Par, Side 1 (gross + Nnet hvis extra), Side 2 (gross + Nnet), Vinner (S1/S2/=/—). Vinner-side får `font-semibold text-score-under-fg` på gross-cellen for visuell bekreftelse.
  - **Match-meta**: kompakt rad med Spilt / Igjen / Status — alle `tabular-nums` for konsistent skanning.
  - Konfetti fyrer en gang per browser-sesjon når matchen er avgjort med en vinner (`result.result.winner !== 'tied'`). SessionStorage-key `torny-matchplay-result-confetti-seen-${gameId}` er distinkt fra stableford-podiene (verifisert via dedikert test). AS-resultat får ingen konfetti.
  - Defensiv fallback: hvis `result.holes.length === 0` (scoring-laget returnerer empty-shell når sidene mangler) viser view-en en «Matchen kan ikke vises»-card i stedet for tom UI.
  - 22 nye tester dekker live/finished/AS-grener, konfetti-key-isolasjon, side-header med HCP + manglende info, per-hull-grid (uplayed/tied/won/extra strokes/9-hulls-bane), match-meta-tall og defensiv empty-shell-fallback.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — ny `renderMatchplay`-helper og branch i `LeaderboardBody`. Følger samme mønster som `renderStableford`: bygger `ScoringContext` fra DB-radene, kjører `computeModeResult`, narrower på `kind === 'singles_matchplay'` og rendrer `MatchplayMatchView` direkte. State #3/#3.5-«venterom» er bevisst skipped: matchplay-spillere ser hverandre umiddelbart (samme RLS-policy som stableford). `team_number` videresendes fra DB siden matchplay-validatoren håndhever 1+1-tilordning på påmelding.

#### Notes
- View-en kombinerer live + podium i én komponent i stedet for å speile stableford-mønstret (View + Podium). Matchplay har ingen rangering å vise — det er én match som har én løpende status, og finished-feiringen er en banner-bytte snarere enn en separat layout-omveltning.
- Per-spiller-scorecardet (når spiller taster slag) er IKKE endret i denne fasen — hver spiller fører fortsatt sitt eget kort. Match-status på scorecardet kan legges til senere som forbedring.
- Phase 4 av epic #45 dekker matchplay-mail-template (gameFinishedNotification med matchplay-copy) og admin/games-detalj-polish.

</details>

### [1.12.0] - 2026-05-24 · #155

> Du kan nå opprette matchplay-turneringer mellom to spillere — velg Matchplay som modus, tilordne én spiller til Side 1 og én til Side 2. Vinneren av hvert hull får poeng; matchen avgjøres som «X up» eller «X&Y» etter golfreglene.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/ModeSelector.tsx` — ny `MatchplayIcon` (to flagg-stenger speilet mot hverandre med et «vs»-prikk i midten, samme stroke-stil som `BestBallIcon`/`StablefordIcon`) og en tredje tile «Matchplay» med beskrivelses-teksten «1v1 hull-for-hull. Vinneren avgjøres som «X up» eller «X&Y».». Grid-layout byttet fra `grid-cols-2` til `grid-cols-1 sm:grid-cols-3` slik at iPhone får vertikal stack (komfortabel scanning) og tablet/desktop får 3-kolonners symmetri. `ModeSelector.test.tsx` utvidet med assertion for matchplay-tile-rendering, beskrivelses-tekst, aria-checked-toggle og click → `onChange('singles_matchplay')`.
- `app/admin/games/new/GameForm.tsx` — ny `isMatchplay`-narrowing-flag + matchplay-spesifikke grener:
  - **Side-tilordnings-UI**: ny seksjon «4. Sider» som vises når ≥1 spiller er valgt og mode=matchplay. To dropdowns (Side 1 + Side 2) som tilordner spilleren til `teamByPlayer[pid] = 1 | 2`. Lag-grid (best-ball/par-stableford) og flight-seksjon rendres ALDRI for matchplay.
  - **`assignPlayerToSide`-handler** med swap-semantikk: hvis admin velger en spiller som allerede står på den andre siden, swappes okkupantene automatisk (én klikk fremfor to). `flightByPlayer[pid]` settes til `side` (samme som team_number, speiler par-stableford-mønstret for å oppfylle DB-CHECK `game_players_team_flight_consistency`).
  - **`orderedPayload` for matchplay**: itererer side 1 først, så side 2 — gir deterministisk `player_0` (side 1) + `player_1` (side 2)-rekkefølge i FormData. Hver rad bærer `team_number = side` og `flight_number = side`.
  - **`matchplayPlayersValid`-validitet**: krever nøyaktig 2 spillere, én på side 1 og én på side 2.
  - **`missingForPublish` for matchplay**: «2 spillere» (0 valgt), «1 spiller til» (1 valgt), «for mange spillere — matchplay krever nøyaktig 2» (≥3 valgt), «én spiller på hver side» (2 valgt men ikke 1+1).
  - **Spiller-cap på 2**: `atCap = isMatchplay ? selectedPlayerIds.length >= 2 : requiresTeams && >= 8` disabler 3.-spiller-checkboxen.
  - **Counter-copy**: «X av 2 spillere valgt» (primary når 2 er valgt, ellers muted).
  - **`TeamSizeSelector` skjules** (`{!isMatchplay && <TeamSizeSelector …/>}`): valget «Solo/Par/4-mann» har ingen mening for matchplay siden det kun er 1v1.
  - **Per-spiller-tee-seksjon** (M/D/J): vises også for matchplay (matchplay krever individuell HCP-allokering). Section-nummer 5 deles med par-stableford.
  - `defaultTeamSizeForMode` returnerer 1 også for `singles_matchplay` så form-state alltid har gyldig `team_size`.
- `app/admin/games/new/GameForm.test.tsx` — 12 nye tester for matchplay-flyten: TeamSizeSelector skjules, hidden inputs (`game_mode`/`team_size`/ingen `stableford_team_size`), side-tilordnings-UI vises ved ≥1 spiller, lag-grid + flight-seksjon vises aldri, «Trekk tilfeldig» skjules, spiller-cap på 2, counter «X av 2», canPublish=true ved gyldig 1+1, canPublish=false ved 1 spiller (med korrekt missingForPublish), canPublish=false ved 2 spillere på samme side, swap-semantikk i dropdown-bytte, hidden inputs (`player_0_team=1`/`player_1_team=2`/flight=team), per-spiller-tee-seksjons-heading.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #155) — denne fasen aktiverer kun UI-flyten. Matchplay-view (hull-for-hull-tabell med «AS»/«X up»/«X&Y»-status) kommer i Phase 3; matchplay-mail-templates + admin/games-detalj-polish kommer i Phase 4 av epic #45.
- TeamSizeSelector beholder `ENABLED_COMBOS.singles_matchplay = Set([1])` defensivt selv om komponenten ikke rendres for matchplay — TypeScript-en `Record<GameMode, …>` krever alle keys, og fjerning av entryen ville tvunget oss til `Partial<Record<>>`. Defensiv kode er trygt.

</details>
</details>


<details>
<summary><strong>1.11.y — Par-stableford (3 oppføringer)</strong></summary>

Stableford-turneringer kan nå spilles som par (4BBB / fyrball). Velg Stableford som modus og Par som lagstørrelse, så kan du melde på 2/4/6/8 spillere fordelt på 1–4 lag à 2 — laget får poengene fra det høyeste stableford-resultatet på hvert hull.

### [1.11.2] - 2026-05-24 · #43

> Når par-stableford-runden avsluttes får spillerne mail om lagets plassering og poeng, ikke en generisk best-ball-mail. Admin-flaten viser lag-grupperingen korrekt for par-spill — kun de lag som faktisk har spillere vises, og redundante Flight-kolonner er skjult.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/mail/gameFinishedNotification.ts` — `GameFinishedNotificationMode` har ny `kind: 'stableford', variant: 'team'`-gren med `teamRank`, `teamTotalPoints`, `teamPartnerName` (fornavn eller hele navnet hvis fornavn ikke kan parses, `null` for defensiv-fallback) og `totalTeams`. Solo-grenen er nå eksplisitt merket `variant: 'solo'` for symmetri. Body-builder rendrer team-grenen som «Laget endte på X. plass av N lag med Y poeng» + en partner-setning «Du og {partner} satt sammen på lag.» (droppet helt hvis partnernavn er `null`). Celebration-tilegget (1.-plass: «Gratulerer med seieren!», 2./3.: «Solid plassering!») er løftet ut til en `celebrationFor()`-helper som begge grenene deler. 4 nye snapshot-style tester dekker 1.-plass, 2.-plass (med partnernavn), 4.-plass (uten celebration) og null-partner-fallback.
- `lib/mail/gameFinishedRecipients.ts` — team-stableford-grenen bygger per-spiller mottakerliste der hver mottaker får sin egen `teamPartnerName` slik at Ada ser «Du og Bjørn satt sammen» og Bjørn ser «Du og Ada satt sammen». Selectsen utvidet med `team_number` (NOT NULL siden 0030, gratis å ta med for begge moduser), og scoring-context-en sender `teamNumber` videre slik at `computeTeam()` faktisk grupperer riktig. 4 nye tester: 4 spillere på 2 lag (begge får rett partnernavn), 8 spillere på 4 lag (totalTeams reflekterer lag, ikke spillere), spillere uten mail droppes men team-totalene består, partner uten navn → `teamPartnerName: null`.

#### Changed
- `app/admin/games/[id]/page.tsx` — fetcher nå `mode_config` slik at vi kan skille `isParStableford` fra solo-stableford og fra best-ball. Tre tilpasninger basert på narrow-ingen:
  - Spillform-raden i Format-cardet viser «Par-stableford» (i stedet for «Stableford») når `mode_config.team_size === 2`.
  - Lag-grid viser kun lag som faktisk har spillere for par-stableford (1-4 lag), i stedet for hardkodede 4 lag med «(tom)»-placeholdere. Best-ball beholder fast 4-grid siden formatet alltid er 4 lag à 2.
  - Spillere-tabellen dropper Flight-kolonnen for par-stableford (flight = team mekanisk siden Phase 2 — kolonnen ville duplisert Lag-tallet). Best-ball viser begge kolonnene som før. Solo dropper begge.
  - Flights-seksjonen skjules for par-stableford (samme grunn — duplikat av Lag-seksjonen).
  - «Leverte scorekort»-listen viser kun «Lag N» for par-stableford, og dropper hele lag/flight-linjen for solo.
  - «Antall lag X / 4»-raden i Påmelding-cardet skjules for solo (alltid 0).

#### Notes
- Mode-aware-mail er backwards-compatible: existing solo-spill og best-ball-spill får samme mail-copy som før (solo-snapshot-testene er kun strammet til å sende `variant: 'solo'` eksplisitt). Defensive narrowing — hvis mode-router returnerer noe uventet faller helperen til best-ball-grenen.
- Phase 4 lukker epic #43. Par-stableford er nå end-to-end shipped: scoring + validation (Phase 1, #151), admin GameForm (Phase 2, #152), live-leaderboard + podium (Phase 3, #153) og mail + admin-detalj-polish (denne fasen).

</details>

### [1.11.1] - 2026-05-24

> Når par-stableford-runden er i gang ser spillerne nå et lag-leaderboard med begge partnernes poeng. Avsluttet spill viser podium for topp 3 lag — 1.-plassen feires med konfetti.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/TeamStablefordView.tsx` (+ test) — ny live-leaderboard for par-stableford. Speilet `SoloStablefordView` strukturelt: flat liste sortert på lag-poeng (høyest øverst), 1.-plass får champagne-tinted Card + `Medallion`, 2–3 får sølv/bronse-`Medallion`, 4+ får ren rank-disc. Hver rad viser «Lag N» + begge partnernes fornavn (via `firstName()` + `formatRevealName`-fallback for kallenavn-only-spillere) + total stableford-poeng (`tabular-nums`). Tied lag deler rank med «Delt N. plass med Lag X»-melding. 11 nye tester dekker rendring, rekkefølge, partnernavn, medallion vs rank-disc, tied-with, tomt result, manglende playerInfo og tomme lag.
- `app/games/[id]/leaderboard/TeamStablefordPodium.tsx` (+ test) — ny finished-reveal-view for par-stableford. Speilet `SoloStablefordPodium`: 3-trinns podium med 1.-plass i midten (champagne `Medallion` 48px, `border-accent` + champagne-shadow), 2.-plass venstre (silver `Medallion` 36px), 3.-plass høyre (bronse `Medallion` + `border-warning/40`). Hver podium-trinn viser «Lag N» + begge partnernes fornavn + lag-total. 1.-plass får `ConfettiBurst` som auto-fyrer på første mount per browser-sesjon (sessionStorage-key `torny-par-stableford-podium-confetti-seen-${gameId}` — distinkt fra solo-key for å unngå krysstinta state). Resten av lagene (rank 4+) ligger i collapsed `<details>` under podiet. Skalerer ned ved <3 lag (1 lag → kun midten; 2 lag → midten + venstre). 16 nye tester dekker podium-trinn, partnernavn, konfetti-key-isolasjon (både separat fra solo og at samme team-key skipper re-burst), champagne-accent, rest-listen, skalerings-grenene og fallback-tilstander.

#### Changed
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-routeren håndterer nå begge variantene av `StablefordResult`. Tidligere `notFound()`-fallback for `variant === 'team'` (Phase 1-midlertidig kode) er erstattet med en variant-router som velger `TeamStablefordView`/`TeamStablefordPodium` for team-spill og `SoloStablefordView`/`SoloStablefordPodium` for solo. State4-flippen (finished vs live) er identisk på begge: finished → podium med konfetti, alt annet → flat live-leaderboard.
- `renderStableford`-opts-typen utvidet med `team_number: number` på player-radene, og ScoringContext-en sender `teamNumber` til scoring-motoren når `mode_config.team_size === 2` (gjenbrukes for lag-gruppering i `computeTeam()`). Solo-spill får fortsatt `teamNumber: null` siden scoring-laget ignorerer feltet på solo-grenen.

#### Notes
- Spillerinfo (`playersById` med `{ name, nickname }` per userId) gjenbrukes fra solo-flyten — ingen ekstra DB-roundtrips. `getGameWithPlayers` cachen leverer alt teamdata + user-meta i ett kall.
- Mode-aware mail-utvidelse (gameFinishedNotification med par-stableford-copy) kommer i Phase 4 — utvidelsen her er rent UI på leaderboard-flaten.

</details>

### [1.11.0] - 2026-05-24 · #151

> Du kan nå opprette par-stableford-turneringer (fyrball / 4BBB). Velg Stableford som modus, så Par som lagstørrelse — admin tilordner 2/4/6/8 spillere til lag à 2.

<details>
<summary>Teknisk</summary>

#### Added
- `app/admin/games/new/GameForm.test.tsx` — 7 nye tester for par-stableford-flyten: hidden input `stableford_team_size`, lag-grid-synlighet, «Trekk tilfeldig»-knapp er skjult for par-stableford, publish-validitet for 4 spillere på 2 lag, blokkering ved odd count, blokkering ved ujevn lag-fordeling, og at flight-seksjonen ikke rendres.

#### Changed
- `app/admin/games/new/TeamSizeSelector.tsx` — `ENABLED_COMBOS.stableford` utvidet fra `{1}` til `{1, 2}` så Par-tile er aktiv for stableford. 4-mann er fortsatt grayed-out.
- `app/admin/games/new/GameForm.tsx` — tre nye narrowing-flags (`isSolo`, `isBestBall`, `isParStableford`) styrer mode-spesifikke grener av validering, lag-grid-synlighet, og copy. Par-stableford-spesifikke endringer:
  - Lag-grid renderes så snart admin har valgt ≥2 spillere (i motsetning til best-balls 8-krav). Helper-tekst: «Inntil 4 lag à 2 spillere. Hvert lag må ha enten 0 eller 2 spillere. Tomme lag publiseres ikke.»
  - Publish-validering krever ≥2 spillere, partall antall, alle tilordnet et lag, og hvert ikke-tomt lag à 2.
  - `missingForPublish` melder «partall antall spillere» eller «lag-fordeling (par à 2)» med mode-presis copy.
  - «Trekk tilfeldig»-knappen er kun synlig for best-ball (par-stableford har variabelt antall spillere — admin tilordner manuelt i fase 2). «Tøm lag» vises hvis det er noe å tømme.
  - Flight-seksjonen skipper helt; payloaden setter `flight_number = team_number` automatisk via `orderedPayload`.
  - Per-spiller-tee-seksjonen (M/D/J) gjenbrukes fra solo-flyten siden flight-seksjonen ikke rendres.
  - Hidden input `stableford_team_size` (verdi `'1'` eller `'2'`) sendes når mode = stableford slik at `validateStableford`-routeren i `lib/games/gamePayload.ts` velger riktig validator-gren.
- `app/admin/games/new/TeamSizeSelector.test.tsx` — eksisterende «Solo aktiv, Par disabled»-test oppdatert til «Solo + Par aktiv, 4-mann disabled». To nye tester: caller `onChange(2)` ved Par-klikk, og 4-mann-klikk ignoreres.

#### Notes
- Scoring-motor + payload-validator landet i Phase 1 (PR #151) — denne fasen aktiverer kun UI-flyten. Lag-leaderboard + team-podium kommer i Phase 3; mail-tekster + admin/games-detalj-polish kommer i Phase 4 av epic #43.
- Drag-tilfeldig-knappen for par-stableford ble bevisst utelatt fra Phase 2 for å holde scope strammere — kan generaliseres til 2/4/6/8 spillere i en senere fase hvis det blir vondt UX.

</details>
</details>


<details>
<summary><strong>1.10.y — Stableford spillerflyt (6 oppføringer)</strong></summary>

Stableford-turneringer er nå spillbare end-to-end. Scorecard viser per-hull-poeng ved siden av netto-scoren, leaderboard rangerer spillerne på total stableford-poeng, og når runden avsluttes feires topp 3 med et eget podium — vinnerne får i tillegg en mail som forteller dem hvor de endte.

### [1.10.5] - 2026-05-23 · bug

> «Du trenger 8 spillere»-banneret i admin-flyten er ikke lenger misvisende for stableford. Når du redigerer et stableford-spill skjules det helt, og når du oppretter et nytt spill nevner det at best ball trenger 8 mens stableford holder med 1.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/[id]/edit/page.tsx` — `PlayerShortageBanner` tar nå `gameMode`-prop og returnerer `null` for `'stableford'` (banner-en er en nudge om total klubb-størrelse i best-ball-kontekst, ikke per-spill-validering). For `best_ball_netto` med < 8 registrerte: copy presisert til «8 registrerte spillere for best ball».
- `app/admin/games/new/page.tsx` — banner-en kan ikke vite hvilken modus admin lander på (mode-velgeren ligger i form-en under), så copy-en er omskrevet til mode-nøytral: «Du har bare X registrerte spillere. Best ball trenger 8 — stableford holder med 1. Inviter flere fra Spillere-siden.» Singular/plural-bøying av «registrert{e}» og «spiller{e}» basert på `players.length`.

</details>

### [1.10.4] - 2026-05-23

> Bane-listen i admin viser nå datoen i samme korte format som resten av appen — «14. mai» i stedet for «14. mai 2026».

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/courses/page.tsx` — bytter `formatShortDateNbWithYear` → `formatShortDateNb` for «Lagt til {dato}»-linjen i bane-listen. Året er sjelden informativ for inneværende sesong; konsistent med player-flater (f.eks. `app/profile/historikk/page.tsx`). `formatShortDateNbWithYear` beholdes for kontekster der året er meningsfullt (slett-confirmation, spiller-profil).

</details>

### [1.10.3] - 2026-05-23 · bug

> Når du åpner et stableford-spill i admin, ser du ikke lenger en tom «Lag»-seksjon eller Lag/Flight-kolonner i spillerlisten. De vises bare for spill som faktisk har lag.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/games/[id]/page.tsx` — `<SectionCard ribbon="Lag">` skjules for `game_mode === 'stableford'` (alle `team_number`/`flight_number` er null for solo). Spillere-tabellen dropper Lag- og Flight-kolonnene under samme betingelse.

</details>

### [1.10.2] - 2026-05-23

> Admin-listen viser nå modus per spill, og resten av admin-flyten er forfinet for å støtte stableford-spill side om side med best-ball. Side-tournaments fungerer uendret for begge moduser.

<details>
<summary>Teknisk</summary>

#### Added
- `components/ui/ModeChip.tsx` (+ test) — subtil chip for spillmodus per spill-rad i admin-flater. Bevisst lavmælt sammenlignet med `StatusChip` (border + transparent bg, ikke uppercase) siden modus er permanent metadata, ikke en lifecycle-state som krever oppmerksomhet.
- `MODE_LABELS` i `lib/scoring/modes/types.ts` — single source of truth for norske visnings-labels per modus («Best ball» / «Stableford»). Brukes både av `ModeChip` og av admin/games/[id]-detalj-siden («Spillform»-raden i Format-cardet).
- Norske copy-strenger for fire mode-relaterte error-koder (`mode_required`, `unsupported_mode_size_combo`, `min_players_for_mode`, `mode_locked_after_publish`) i `ERROR_MESSAGES_NEW_GAME`. Manglet før, så admin fikk en tom Banner når payload-validatoren trigget dem.

#### Changed
- `app/admin/games/page.tsx` — ledger-raden viser ny `ModeChip` under meta-linjen så admin har et raskt overblikk over hvilket format hvert spill er konfigurert for. `game_mode` plukkes med i SELECT-listen.
- `app/admin/games/[id]/page.tsx` — header-en har ny `ModeChip` ved siden av `StatusChip`, og «Best ball netto»-strengen fra subtittelen er fjernet (den hardkodet en eneste modus). Format-cardets «Spillform»-rad bruker `MODE_LABELS[game.game_mode]` slik at stableford-spill viser «Stableford» i stedet for «Best ball netto».

#### Notes
- Side-tournament-flyten (`avslutt/page.tsx` + `SideWinnersForm.tsx`) er allerede flat-spiller-basert og fungerer for solo uendret — ingen kode-endring nødvendig. `endGameWithSideWinners` håndterer alle moduser via mode-aware mail-bygging fra fase 6.

</details>

### [1.10.1] - 2026-05-23

> Når en stableford-turnering avsluttes ser spillerne nå et topp 3 podium med 1.-plassen feiret med konfetti. Hele rangeringen ligger ett klikk unna under podiet. Vinnerne får tilpasset «Resultatet er klart»-mail med sin egen plassering og poeng.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStablefordPodium.tsx` (+ test) — ny reveal-view for `game.status === 'finished'` på stableford-spill. 3-trinns podium med 1.-plass i midten på høyeste trinn (champagne `Medallion` + champagne-tinted Card), 2.-plass venstre (sølv-Medallion + dempet ring), 3.-plass høyre (bronse-Medallion + `border-warning/40`). 1.-plassen får `ConfettiBurst` (gjenbrukt fra `State4View`) som auto-fyrer på første mount per browser-sesjon (sessionStorage-key `torny-stableford-podium-confetti-seen-${gameId}`). Layout skalerer ned ved <3 spillere (1 spiller → kun midten; 2 spillere → midten + venstre).
- `lib/mail/gameFinishedRecipients.ts` (+ test) — ny helper som bygger mottakerlisten for «Resultatet er klart»-mail-blasten. For stableford fetcher den scores + course_holes + course_handicap, kjører `computeLeaderboard` mode-router, og legger per-spiller rank/totalPoints/totalPlayers på hver mottaker. For best-ball returnerer den kun email+name (default nøytral mail-copy).
- `lib/mail/gameFinishedNotification.test.ts` — snapshot-style tester for HTML+text-body i begge moduser, inkl. celebration-tilegg per plassering (1. → «Gratulerer med seieren!», 2/3 → «Solid plassering!», 4+ → nøytral).

#### Changed
- `lib/mail/gameFinishedNotification.ts` — ny `mode`-prop med discriminated union (`{kind:'best_ball_netto'}` eller `{kind:'stableford', rank, totalPoints, totalPlayers}`). Stableford-grenen rendrer en personlig hovedlinje («Du endte på X. plass av N med Y poeng»); udefinert eller best-ball-grenen beholder dagens copy uendret.
- `app/admin/games/[id]/actions.ts` (endGame) + `app/admin/games/[id]/avslutt/actions.ts` (endGameWithSideWinners) — leser nå `game_mode` + `mode_config` + `course_id` fra games-raden og delegerer mottaker-bygging til `buildGameFinishedRecipients`. Mail-loopen passer `mode`-payload videre til mail-helperen.
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-grenen velger view per `game.status`: `finished` → `SoloStablefordPodium`, alt annet → `SoloStablefordView` (uendret). Best-ball-grenen er upåvirket.
- `tests/serverActionMocks.ts` — `buildSupabaseMock` får `order` + `limit` som chainable pass-through-er, slik at helpers med sortert SELECT kan testes uten å endre kjøre-tid-koden.

#### Notes
- Side-tournaments for stableford verifiseres i fase 7 (sannsynligvis bare copy-justering). Modus-chip i admin-listen + edge-case-håndtering kommer også i fase 7.
- Confetti respekterer eksisterende `prefers-reduced-motion`-handling via `.confetti-piece { display: none }` i `globals.css` — ingen ekstra reduksjons-logikk trengs.

</details>

### [1.10.0] - 2026-05-23 · #4

> Stableford-turneringer er nå spillbare end-to-end. Spillerne taster slag som vanlig, men ser stableford-poeng per hull og en flat leaderboard sortert på totalt poeng.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/SoloStablefordView.tsx` (+ test) — ny leaderboard-view for solo-stableford. Flat liste sortert på `totalPoints` (høyest øverst), top-3 får Medallion (gull/sølv/bronse), 4+ får ren rank-disc. Hver rad: spillernavn (via `formatRevealName`), poeng-total i `score-num`, og «N hull spilt»-undertekst. Reuser `LeaderboardBackdrop` (samme fairway-vinje som best-ball state #4) og samme Card-padding/typografi-tokens.
- `app/games/[id]/leaderboard/page.tsx` — `renderStableford`-grenen short-circuiter LeaderboardBody før state #3/#3.5/reveal-active-routingen. Bygger `ScoringContext` fra game + players + holes + scores, kjører `computeLeaderboard` mode-router, og rendrer SoloStablefordView med en `Map<userId, {name, nickname}>`.

#### Changed
- `app/games/[id]/holes/[holeNumber]/page.tsx` — for stableford fetcher server-en i tillegg alle hull-pars/SI + alle av brukerens scorer slik at vi kan summere stableford-poeng server-side (både `myStablefordTotal` og `myStablefordForCurrentHole`). Best-ball-modus dropper de to ekstra queryene. Flight-filteret kollapses til `[me]` når `flight_number` er null (solo).
- `app/games/[id]/holes/[holeNumber]/HoleClient.tsx` — ny `gameMode`-prop styrer to ting: (1) en «Dine poeng: N»-subtittel under headeren (live-oppdatert via server-snapshot + Dexie-delta for current hull), (2) bottom-bar-CTA bytter fra «Lever scorekort» til «Lever ditt scorekort» for solo.
- `components/hole/ScoreCard.tsx` — ny valgfri `stablefordPoints`-prop. Når satt, vises «· N poeng» rett etter «Netto X» på samme helper-tekst-linje. Skjules sammen med netto-info når `hideNetto` er true (reveal-active). Alle eksisterende callsites er upåvirket (prop er null som default).
- `app/games/[id]/submit/page.tsx` — TopBar-kicker bytter fra «Lever scorekort» til «Lever ditt scorekort» for solo, og info-Card-en viser «Individuell stableford · CH N» i stedet for «Lag X · Flight Y · CH N» (lag/flight er null for solo).
- `app/games/[id]/page.tsx` — Solo-modus dropper «Lag X · Flight Y»-rad-en og viser i stedet en «Individuell stableford-turnering»-subtittel + CH-only-rad. I scheduled-state-en bytter «DIN FLIGHT»-roster med en ny «DELTAKERE»-roster (`SoloRoster`) som lister alle game-medlemmer.
- `lib/games/getGameWithPlayers.ts` — `GameForHole` utvides med `game_mode` + `mode_config` slik at konsumenter slipper å re-fetche. SELECT-listen oppdatert tilsvarende.

#### Notes
- Reveal-flow for stableford (podium + collapsed rest + completion-mail) er holdt til fase 6 av epic #41. Midt-runde og post-finished bruker samme SoloStablefordView i v1.10.0.
- Side-tournaments (LD/CTP) for stableford verifiseres i fase 7 — sannsynligvis bare copy-justering siden eksisterende UI bruker flat spiller-velger uten lag-kontekst.

</details>
</details>


<details>
<summary><strong>1.9.y — Valgbar spillmodus (1 oppføring)</strong></summary>

Tørny er ikke lenger låst til 4 lag à 2 spillere best-ball. Admin-flyten viser nå tydelige modus-tiles for Stableford og Best ball netto, og lagstørrelser som ennå ikke er aktivert vises som «kommer snart» så roadmapen er synlig der den hører hjemme.

### [1.9.0] - 2026-05-23 · #41

> Når du oppretter et nytt spill ser du nå et tydelig valg mellom Stableford og Best ball netto. Spillerne plukkes først som en flat liste, og lag-grid-en dukker opp først hvis spillformatet krever lag. Lagstørrelser som ennå ikke er tilgjengelige vises som «kommer snart» så du ser hvor det bærer.

#### Added
- `app/admin/games/new/ModeSelector.tsx` (+ test) — to tiles for spillmodus med inline-SVG-ikoner (stilisert poeng-tavle for Stableford, 2×2-flagg-grid for Best ball netto). ARIA: `<fieldset>` + `role="radiogroup"` + tabbable `role="radio"`-button-er. Aktiv tile får forest border + inset-ring (primary-soft).
- `app/admin/games/new/TeamSizeSelector.tsx` (+ test) — tre tiles (Solo / Par / 4-mann). `ENABLED_COMBOS`-mapping styrer hvilke som er aktive per modus (Stableford → 1, Best ball netto → 2); inaktive vises grayed-out (`opacity-50`) med liten «kommer snart»-tekst over accent-deep. Disabled tiles ignorerer klikk og rapporterer `aria-disabled`.
- `app/admin/games/new/GameForm.test.tsx` (ny) — baseline-component-tests (5 stk) + nye fase-4-tests (5 stk): default mode/size, auto-bytte ved mode-change, hidden inputs i FormData, lock_game_mode-state for edit.

#### Changed
- `app/admin/games/new/GameForm.tsx` — players-first-flow: spiller-toggle setter bare `selectedPlayerIds` (ingen `nextAvailableTeam`-auto-fill lengre). Lag-grid + flights-seksjon rendres kun når `team_size >= 2`. Solo-modus får dedikert «Tee per spiller»-seksjon siden flights-seksjonen ikke gjelder. Counter «X av 8 spillere» bytter til «X spillere valgt» for solo (ingen øvre tak). Hidden inputs sender `game_mode` + `team_size` med i FormData; team/flight-feltene sender tom streng for solo.
- `app/admin/games/[id]/edit/page.tsx` — leser `game_mode` fra DB og pre-fyller form-en. `lock_game_mode` settes for ikke-draft spill så ModeSelector + TeamSizeSelector blir disabled (matcher backend mode-lock-guarden fra 0030).

#### Notes
- Aktive kombinasjoner i v1.9.0: Stableford + Solo (kommer ende-til-ende i v1.10.0) og Best ball netto + Par (dagens, men nå eksplisitt valgt). Par-stableford og 4-mann-stableford forberedes som disabled tiles — ingen DB-migrasjon nødvendig når en kombinasjon aktiveres, bare en mapping-utvidelse i `TeamSizeSelector.ENABLED_COMBOS`.
- Påfølgende fase 5/7 av epic #41 wires spillerflyten (scorecard + leaderboard) for stableford.
</details>


<details>
<summary><strong>1.8.y — Mørk modus (12 oppføringer)</strong></summary>

Tørny følger nå mobilens mørk-modus-innstilling. Har du iPhonen på Dark Appearance, blir Tørny mørk når du åpner appen — uten at noe annet endrer seg.

### [1.8.12] - 2026-05-23 · #129

> Admin-listene over baner og spill har fått en designpass — Sekretariatet-paletten er gjennomført, og oversikten leser nå like premium som resten av appen.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/courses/page.tsx` — empty-state-flaten løftet til samme champagne-medallion-treatment som `admin/games`-listen (bruker `<ChampagneMedallion>` + `<BaneIcon>` + serif-tittel + body-tekst, i stedet for en flat surface-boks med én tekstlinje). BrassRibbon-kicker byttet fra «Baner · protokoll» til «Baner · katalog» — semantisk mer korrekt for en bane-liste (det er ikke en saksprotokoll). Footer-hint endret tilsvarende til «Tap en bane for å redigere katalogen.»
- `app/admin/games/page.tsx` — subtitle-kopi tightened: «X spill · sortert kronologisk» → «X spill · sortert nyeste først» (parallell med `admin/courses` og lettere å lese). Empty-state-kopi endret fra «turneringen» → «runden» / «rundene» (Tørny støtter også hverdagsrunder, ikke bare turneringer — i tråd med headingen «Sett opp ny runde» på `/admin/games/new`).
- `app/admin/games/page.tsx` + `app/admin/courses/page.tsx` — `reveal-up`-animasjons-stagger capped på rad 8 (`Math.min(i, 8)`) så lange listene (opp til 40 rader) ikke drar siste rad ut over ~½ sekund. Matcher `.lb-row`-mønsteret i `globals.css`. Closes [#129](https://github.com/jdlarssen/golf-app/issues/129).

</details>

### [1.8.11] - 2026-05-23 · #27

> Leaderboarden etter en ferdigspilt runde har nå en subtil fairway-vinje med flaggstang i bakgrunnen — atmosfære uten å konkurrere med leader-cardet.

<details>
<summary>Teknisk</summary>

#### Added
- `components/illustrations/LeaderboardBackdrop.tsx` — ny inline-SVG-komponent som tegner tre horisont-linjer og en enslig flaggstang med vimpel + ball. Bruker `currentColor` med wrapperens `text-accent` (champagne), opacity 0.07 i lys modus og 0.10 i dark via ny CSS-variabel `--leaderboard-backdrop-opacity`. `preserveAspectRatio="xMidYEnd meet"` forankrer scenen i bunnen av container-en så toppen aldri konkurrerer med leader-cardet. Closes [#27](https://github.com/jdlarssen/golf-app/issues/27).
- `components/illustrations/LeaderboardBackdrop.test.tsx` — smoke-test for ARIA-hidden, posisjon, tint og className-merge.

#### Changed
- `app/games/[id]/leaderboard/State4View.tsx` — `Shell` wrapper-en pakker nå innholdet i en `relative isolate`-container med `LeaderboardBackdrop` som første barn og selve innholdet i en `relative` søsken. Gjelder både chromeless (tab-modus) og standalone-modus.
- `app/globals.css` — ny token `--leaderboard-backdrop-opacity` (0.07 lys / 0.10 dark) styres fra både `prefers-color-scheme: dark`-blokk og `[data-theme='dark']`-blokk.

#### Notes
- SVG ble valgt fremfor raster (`next/image`) fordi vektor skalerer perfekt på alle viewports, `currentColor` gir gratis dark-mode-toning, og inline SVG matcher resten av kodebasen (`components/icons/`). Closes [#36](https://github.com/jdlarssen/golf-app/issues/36) — `next/image`-pipeline er ikke nødvendig for de subtile dekorative bakgrunnene Tørny trenger.
- Backdrop respekterer eksisterende `prefers-reduced-motion`-håndtering uten endring — illustrasjonen er statisk, ingen animasjon å suppressere.

</details>

### [1.8.10] - 2026-05-23 · #128

> Profil-utfylling etter første innlogging er pusset opp — passer nå inn i Tørny-stilen sammen med resten av appen, med en varmere velkomst og roligere typografi-rytme.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/complete-profile/page.tsx` — onboarding-overskriften byttet fra generisk `<PageHeader title>` til en flat header med champagne-tonet `Kicker` («Velkommen til Tørny»), Fraunces-serif `h1`, og Inter-body undertittel («Fortell oss litt om deg, så er du klar til å spille.»). Erstatter den gamle «Velkommen! Fyll inn detaljene dine …»-prosaen inni cardet. Submit-knapp-label endret fra «Fullfør profilen» (repeterte tittelen) til «Sett i gang» — action-orientert Tørny-stemme. Form-spacing pustet ut fra `space-y-4` til `space-y-5`. Closes [#128](https://github.com/jdlarssen/golf-app/issues/128).

#### Notes
- Ingen funksjonsendringer: feltene (navn, kallenavn, hcp_index), validering (server-action), redirect-flyten (`/` ved completed, `/login` ved no-session) og error-message-mapping er uendret.
- Bruker etablerte UI-primitives + semantic tokens (`var(--text)`, `var(--muted)`, `var(--accent)`) — dark mode arver gratis fra resten av appen.
- TopBar bevisst utelatt: `/complete-profile` er obligatorisk onboarding-flyt etter første OTP-innlogging, så det er ingen tilbakeknapp å vise.

</details>

### [1.8.9] - 2026-05-23 · #113

> Admin-listene over baner og spill bruker nå samme top-bar som resten av appen — konsistent navigasjon på tvers av Tørny.

<details>
<summary>Teknisk</summary>

#### Changed
- `components/ui/TopBar.tsx` — utvidet med `action?: ReactNode`-prop som slotter en node (typisk en `<SmartLink>`-chip) inn på høyre side via `ml-auto`. Kicker forblir absolute-sentrert via `left-1/2 -translate-x-1/2`. Pass `action={null}` for å rendere en usynlig spacer-chip med samme dimensjoner — bevarer effektiv sentrering på filtrerte listevisninger som ellers ville mistet høyre-elementet.
- `app/admin/games/page.tsx` — migrert ad-hoc `flex justify-between`-div til `<TopBar action={...} />`. `filterFinished`-grenen sender `action={null}` (i stedet for v1.8.7s `invisible`-chip), så Resultatprotokoll-oppførselen fra [#113](https://github.com/jdlarssen/golf-app/issues/113) er bevart: «+ Nytt»-knappen skjult, «Sekretariatet»-kicker fortsatt sentrert.
- `app/admin/courses/page.tsx` — migrert ad-hoc top-bar til `<TopBar action={<SmartLink>+ Ny</SmartLink>} />`. Closes [#127](https://github.com/jdlarssen/golf-app/issues/127).

</details>

### [1.8.7] - 2026-05-23 · #113

> To rare UX-flater i admin/games er ryddet: «+ Nytt»-knappen er borte i Resultatprotokoll-arkivet, og sideturnering-toggle kan nå aktiveres uavhengig av lag-status under spill-opprett. Du slipper å scrolle opp-ned for å aktivere sideturnering etter å ha satt opp lag.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/games/page.tsx` — «+ Nytt»-chipsen skjules (via `invisible`-Tailwind-class) i Resultatprotokoll-visningen (`?status=finished`). Beholder layout-slot-en med samme padding så «Sekretariatet»-labelen forblir sentrert mellom BackLink og høyre kant. Closes [#113](https://github.com/jdlarssen/golf-app/issues/113).
- `app/admin/games/new/GameForm.tsx` — fjernet `sideTournamentEligible`-gaten (`distinctTeams >= 2`) og dens bruk på sideturnering-checkboxen. Toggle er nå alltid enable-able så lenge `lockSideTournament` ikke er satt (sistnevnte gjelder spill som allerede er publisert). Help-text «Krever minst 2 lag for å aktiveres» fjernet. LD/CTP-config viser så fort sideturnering er checked. Gaten var redundant siden `lib/games/gamePayload.ts:162-172` allerede krever eksakt 4 lag × 2 spillere ved publish — et publisert Tørny-spill har alltid 4 lag, så «≥2 lag»-sjekken kunne aldri feile. Closes [#115](https://github.com/jdlarssen/golf-app/issues/115).

#### Notes
- Forward-compatible med [#41](https://github.com/jdlarssen/golf-app/issues/41) (variable lagstruktur som epic) — endringene introduserer ingen nye antakelser om lagsantall, kun fjerner en redundant UI-gate. Når #41 lander og hardkoding 4×2 byttes ut med per-modus-validering, vil sideturnering-toggle-en allerede oppføre seg riktig uten gate.

</details>

### [1.8.6] - 2026-05-23 · #117

> Tilbake-pilen fra leaderboarden tar deg nå tilbake til Min historikk når du kom fra den listen. Bruker en eksplisitt URL-param i stedet for nettleser-history (som ikke var pålitelig i PWA-modus).

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/profile/historikk/page.tsx` — «Se resultatliste»-lenken peker nå på `/games/${id}/leaderboard?from=/profile/historikk` istedenfor bare `/games/${id}/leaderboard`. Eksplisitt signal til leaderboard-pagen om hvor «Tilbake» skal lande.
- `app/games/[id]/leaderboard/page.tsx` — `SearchParams`-typen utvidet med `from?: string | string[]`. Ny `validateFromParam`-helper validerer at verdien er en relativ sti under en kjent Tørny-prefiks (`/profile/`, `/admin/`, `/games/`, eller root `/`) og rejecterer absolutte URL-er, protokoll-relative URL-er (`//evil.com`), og strenger lengre enn 200 tegn — så `?from=` ikke kan brukes som open-redirect-vektor. Validert verdi vinner over `?return=hole`-fallback.
- Issue [#117](https://github.com/jdlarssen/golf-app/issues/117) lukkes med dette. Tilnærmingen erstatter `document.referrer`-heuristikken som v1.8.3 introduserte og v1.8.4 reverterte (heuristikken brøt i iOS PWA standalone — `document.referrer` settes til appens start_url for hele session-en, så `router.back()`-grenen ble alltid valgt og skapte en ping-pong-loop mellom drilldown og hovedleaderboard).

#### Notes
- Drilldown (`/games/[id]/leaderboard/holes`) propagerer ikke `from` videre — den beholder dagens hardkodede SmartLink → `/games/${id}/leaderboard`. Brukerens navigation-kjede er: historikk → leaderboard (med `from`) → drilldown → leaderboard (med `from` bevart i URL) → historikk. Drilldown-→-back-pilen tar deg tilbake til leaderboarden hvor `from` fortsatt er i URL-en.
- Kun `/profile/historikk` har `?from=` i denne PR-en. Andre entry-points (`/`, `/admin/games`, etc.) beholder dagens oppførsel — kan utvides separat hvis ønskelig.

</details>

### [1.8.5] - 2026-05-23 · bug

> Replay-knappen for jubelscenene skjules nå hvis du har «Reduser bevegelse» på i iPhone-innstillinger — så du ikke får en knapp som ikke gjør noe. Konfetti-animasjonen var allerede skjult for brukere med den innstillingen; nå er trigger-knappen det også.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/State4View.tsx` — `ReplayButton` får ny class `confetti-replay-button`. `app/globals.css` (`@media (prefers-reduced-motion: reduce)`-blokken) skjuler knappen med `visibility: hidden` (bevarer 44×44 layout-slot for å holde header-chromet balansert). Dead-tap-UX-en oppstod fordi `.confetti-piece { display: none }` skjuler selve animasjonen for brukere med reduce-motion, men replay-knappen kom uendret gjennom — tap ga ingen visuell respons.

</details>

### [1.8.4] - 2026-05-23 · #117

> Tilbake-pilen fra en ferdigspilt leaderboard går tilbake til spillets hjemside igjen — fikser en loop som kunne oppstå mellom lag-drilldown og hovedturneringen i PWA-modus. Konsekvens: tilbake fra leaderboard lander ikke i Min historikk lenger (re-åpner det som et eget arbeid).

<details>
<summary>Teknisk</summary>

#### Fixed
- Revertert v1.8.3 (`fix(leaderboard): tilbake-nav respekterer historikk`, commit `00bd142`). Endringen byttet leaderboard-chevronen fra `SmartLink` til `HistoryBackLink`. Rotårsak til loopen: i iOS PWA standalone-modus settes `document.referrer` til appens start_url for hele session-en. Det er same-origin med `window.location.origin`, så `HistoryBackLink` traff alltid `router.back()`-grenen istedenfor `router.push(fallbackHref)`. Etter en drilldown→leaderboard-push tok `router.back()` deg tilbake til drilldown — der den hardkodede SmartLink-pushen igjen tok deg til leaderboard. Resultat: ping-pong mellom de to flatene. Drilldown-chevronen ble ikke endret i v1.8.3, så asymmetrien (push på drilldown, back på leaderboard) var grunnstammen i loopen.
- Issue [#117](https://github.com/jdlarssen/golf-app/issues/117) re-åpnes. Den riktige løsningen er sannsynligvis en eksplisitt `?from=`-query-param fra `/profile/historikk` (og lignende entry-points) istedenfor en referrer-heuristikk som ikke kan stole på SPA-navigasjon.

</details>

### [1.8.2] - 2026-05-23

> Knappene rundt scorekortet og leaderboarden roer seg ned — primary-knapper kun for hovedhandlinger, sekundære actions går outline-stil.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — «Tilbake til spillet →»-knappen som vises etter levert scorekort byttet fra `variant="primary"` til `variant="secondary"`. Read-only-oppsummering uten klar hovedhandling skal ikke pushe en CTA med primary-fyll. Mid-round-grenen (knapp «Tilbake til hull N →») beholder primary-stilen siden den faktisk fortsetter pågående runde — den ER skjermens hovedhandling.
- `app/games/[id]/leaderboard/holes/page.tsx` — «Totalt — X hull vunnet — N»-summary-baren under team-drilldown byttet fra `bg-primary text-bg-tint` (heavy forest-fyll) til `border border-border bg-surface text-text`. Bar-en er en read-only oppsummering, ikke en CTA — en stille surface med subtil topp-border og accent-kicker bærer hierarkiet uten å trenge høy-kontrast fyll. `text-accent` på «hull vunnet» dempet til `text-muted` siden accent ikke trenger å bære vekten på en rolig flate.

#### Notes
- Per design-prinsipp: én klar primary action per skjerm. Game-home (finished) beholder «🏆 Se leaderboard →» som primary — det ER post-runde-hovedhandlingen. Summary-tekst og navigasjonsknapper som ikke har én tydelig hovedrolle får outline/quiet-stilen.

</details>

### [1.8.1] - 2026-05-23

> Du kan nå spille av jubelscenene igjen — replay-ikonet over leaderboarden trigger fyrverkeriet på nytt.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/ConfettiBurst.tsx` — replay-knappen («Spill av») trigget ikke ny burst i prod. Komponenten hadde tidligere et internt `key={trigger}`-mønster der React noen ganger ikke remountet animasjonen rent. Forenklet til en ren mount-engang-komponent; State4View kontrollerer remount via `<ConfettiBurst key={replayKey} />` på utsiden. Garanterer at CSS-animasjonene restarter fra 0%-keyframen hver gang knappen trykkes.

#### Changed
- `app/games/[id]/leaderboard/State4View.tsx` — tekst-pillen «Spill av» erstattet med ikon-knapp (`ReplayIcon`, counterclockwise pil). 44×44px tap-target (iOS HIG), diskret topp-høyre plassering over leaderboarden. `text-muted` resting tint shifts til `text-accent` på hover/focus så gesten føles belønnet. Plasseringen er identisk i begge moduser (chromeless tabs-mode + standalone solo-mode) — knappen sitter til høyre i header eller inline over tittel.
- `components/icons/Icons.tsx` + `index.ts` — ny `ReplayIcon` (24×24 line-icon, currentColor, 1.5 stroke) i Tørny-iconsettet. Counter-clockwise arc fra 9 til 5 med pil-spiss som peker inn i 9 o'clock.

</details>

### [1.8.0] - 2026-05-19 · #111

> Tørny støtter nå mørk modus. Har du iPhonen på Dark Appearance (Innstillinger → Skjerm og lysstyrke → Mørk), bytter Tørny automatisk til en mørk klubbhus-natt-palett. Står den på lys eller automatisk, fortsetter appen å se ut som før. Ingen knapp å trykke — appen følger telefonen.

<details>
<summary>Teknisk</summary>

#### Added
- `--surface-strong` token (deep forest i begge moduser, `#1b4332` light / `#1f3b2c` dark) for surfaces som trenger linen/gold-foreground. Dekker Spill-tile i Sekretariatet, kolonnetitler i `/admin/courses` og `/admin/games`, samt avatar-/hull-strip-current/onboarding-banner i hull-flaten — alle 8 sites migrert fra `var(--primary)`-bg (som ble lys sage i dark og gjorde foreground uleslig).

#### Changed
- `app/layout.tsx` — fjernet `data-theme="light"` på `<html>` og endret `colorScheme: "light"` → `"light dark"` i `viewport`-eksport. `globals.css` har siden v1.7.0 både `[data-theme='dark']`-blokk og `@media (prefers-color-scheme: dark)`; med tvangen borte slår sistnevnte inn automatisk basert på OS-preferanse.
- `@custom-variant dark` (lagt til i v1.7.0) gjør at eventuell fremtidig manuell theme-toggle også vil fungere via `data-theme='dark'`-attribute.

#### Notes
- Migrering av hardkodede farger til semantiske tokens ble gjort i v1.7.0 (refactor-PR #111, 22 filer / ~95 LOC). Visual-verifikasjon i dark mode skjedde via preview-deploy av denne PR-en — der oppdaget vi at `var(--primary)`-bg-surfaces ble uleselige i dark (sage primary + lys foreground), derav `--surface-strong`-tokenet.

</details>
</details>


<details>
<summary><strong>1.7.y — Spiller-picker for klubbskala (1 oppføring)</strong></summary>

Spill-opprett-formen har nå et søkefelt over spiller-listen. Klar for 100+ spillere når kompisgjengen vokser til klubb-størrelse.

### [1.7.0] - 2026-05-19

> Spiller-listen på spill-opprett (og edit) har nå et søkefelt. Skriv inn navn for å filtrere; valgte spillere vises som chips øverst så du ikke mister oversikten i lange lister. Klargjør for klubbskala når kompisgjengen vokser.

<details>
<summary>Teknisk</summary>

#### Added
- Søke-input + chip-row i `GameForm` (`app/admin/games/new/GameForm.tsx`, brukt av både `/admin/games/new` og `/admin/games/[id]/edit`). Substring-match case-insensitive på `name` / `nickname` / `email`. `useMemo` på filtrerte spillere; ingen server-roundtrip og ingen nye deps.
- Valgte spillere vises som klikkbare chips øverst i seksjon 2 (trykk for å fjerne). Filtrerte listen ekskluderer allerede-valgte siden de står som chips — holder listen kort i klubbskala.
- ARIA-label på søkefelt + chip-knapper. Tab-rekkefølge: chips → søk → filtrert liste. Tap-targets ≥44px.

</details>
</details>


<details>
<summary><strong>1.6.y — Eksport (1 oppføring)</strong></summary>

Du kan nå laste ned resultatet fra ferdigspilte spill som CSV — praktisk for utskrift og deling utenfor appen.

### [1.6.0] - 2026-05-19

> Etter et spill er avsluttet kan du nå laste ned resultatet som CSV-fil — åpnes rett i Numbers, Excel og Google Sheets. Praktisk hvis du vil henge resultatet opp i klubbhuset eller dele med folk uten Tørny-konto.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/leaderboard/export/route.ts` — server-route som returnerer `text/csv; charset=utf-8`. UTF-8 BOM + semikolon-separert (norsk Excel-locale) + CRLF line endings. Innholdet er en spill-metadata-blokk (navn, eksport-dato, course par) etterfulgt av leaderboard-tabellen med kolonner for plass, lag, spillere, brutto, netto, mot par og hull spilt. Auth-gated samme mønster som leaderboard-siden (cookie-basert server-client, admin eller deltaker i spillet). Begrenset til `status='finished'` — andre statuser gir 404.
- «Last ned resultat (CSV)»-knapp på finished-leaderboarden (`State4View.tsx`), under team-listen. Filnavn er ASCII-safe (`torny-{game-id}-{YYYY-MM-DD}.csv`) for å unngå browser-quirks med æøå i `Content-Disposition`.

</details>
</details>


<details>
<summary><strong>1.5.y — Klubbstatistikker (3 oppføringer)</strong></summary>

Vinnerliste og «mest aktive»-listen fyller seg automatisk fra ferdigspilte spill. Underlag for både kompisgjengen og kommende klubbskala.

### [1.5.2] - 2026-05-19

> Datoer vises nå konsistent på norsk i hele appen. Tee-off-tidspunktet i admin-detalj-visningen brukte en feilstavet locale-kode «no-NO» (en tag som ikke finnes i den internasjonale standarden), og det er nå rettet til «nb-NO». Ingen synlig endring for deg som bruker, men appen står seg bedre på tvers av nettlesere og fremtidige Node-oppgraderinger.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/format/date.ts` — `formatShortDateNb` («14. mai») og `formatShortDateNbWithYear` («14. mai 2026») som single source of truth for nb-NO-kort-dato på tvers av admin-flatene. Hand-rolled måneds-tabell beholdes (matcher tidligere visuelt output uten trailing dot — `Intl`-ens nb-NO `short` ville gitt «mai.»).
- `lib/format/date.test.ts` — 6 unit-tester for nye helpers (dag uten leading zero, måneds-forkortelse, med/uten år, ISO-string vs. Date-input).

#### Fixed
- `app/admin/games/[id]/page.tsx` — locale-tag «no-NO» (ikke en gyldig BCP 47-tag) endret til «nb-NO» for `Intl.DateTimeFormat`-rendering av tee-off-tidspunkt.
- 7 admin-filer (`app/admin/page.tsx`, `app/admin/courses/page.tsx`, `app/admin/games/page.tsx`, `app/admin/games/[id]/page.tsx`, `app/admin/games/[id]/slett/page.tsx`, `app/admin/spillere/[id]/page.tsx`, `app/admin/spillere/_components/PendingInvitations.tsx`) hadde duplisert lokal `MONTHS_NB`-tabell + `shortNb`-helper — alle henter nå fra `lib/format/date.ts`.

#### Notes
- Interne parse-locales (`en-GB` i `lib/format/teeOff.ts`, `en-US` i `lib/games/gamePayload.ts`, `en-CA` i `app/admin/games/[id]/edit/page.tsx`) er bevart med vilje — de brukes for å ekstraktere stabile numeriske deler / datetime-local input-format, og er ikke bruker-synlige.

</details>

---

### [1.5.1] - 2026-05-19

> Innlogging- og invitasjons-formene har nå en usynlig honeypot mot bot-trafikk. Du som ekte bruker merker ingenting; bot-er som spammer skjemaet får et stilltiende «ok» uten at appen faktisk sender mail eller oppretter invitasjoner.

<details>
<summary>Teknisk</summary>

#### Added
- Honeypot-felt (`name="website"`, hidden + tabIndex=-1 + autoComplete=off) på `app/(auth)/login/_components/SendCodeForm.tsx` (OTP-request-fasen) og `app/admin/spillere/_components/InviteForm.tsx`. Server-actions silent-rejecter når feltet er fylt: logger til Vercel via `console.warn('[honeypot] silent reject', ...)` uten å kalle Supabase signInWithOtp eller inserte i `invitations`.
- Unit-tester som verifiserer silent-reject-pathen for begge skjemaene (`app/(auth)/login/actions.test.ts` + `app/admin/spillere/actions.test.ts`).

</details>

---

### [1.5.0] - 2026-05-18

> Ny side: Klubbstatistikker. Se hvem som har vunnet flest spill og hvem som har vært med på flest spill — toppen markert med champagne-gull. Lenken ligger på profil-siden din.

<details>
<summary>Teknisk</summary>

#### Added
- `app/profile/statistikk/page.tsx` — server-component med to seksjoner (Vinnerliste, Mest aktive). Aggregerer fra `games` × `game_players` × `users`-joins; teller kun `status='finished'`. Top-10 pr. seksjon.
- Vinner-beregning gjenbruker `computeLeaderboard` fra `lib/leaderboard.ts` (som internt bruker `bestBallForHole` + `rankTeams` fra `lib/scoring/`). Alle lag med `rank === 1` regnes som vinnere, så delt 1.-plass krediteres begge lag.
- Lenke fra `app/profile/page.tsx` til den nye siden, plassert i samme «Historikk»-cluster som «Min historikk».

#### Notes
- Bulk-fetch i fire round-trips (games, game_players, course_holes, scores) + in-memory aggregering. Skalerer fint for nåværende volum (<1000 finished games); kan flyttes til en SQL-view ved klubbskala.

</details>
</details>
</details>



<details>
<summary><strong>Stabil lansering & tee-bokser — 5 serier</strong></summary>

<details>
<summary><strong>1.4.y — Multi-rating tee-bokser (3 oppføringer)</strong></summary>

Hver fysisk tee legges nå inn én gang med valgfrie ratings pr. gender (Herrer / Damer / Junior). Lettere dataentry, og du kan fylle ut manglende ratings senere uten å re-opprette tees.

### [1.4.2] - 2026-05-18

> Når du går videre til neste hull eller bakover, fader innholdet kort inn istedenfor å bare poppe på plass. Liten polish, men gjør hull-byttet mykere.

<details>
<summary>Teknisk</summary>

#### Changed
- Subtle fade-inn (180ms, ease-out) på hovedinnholdet i `app/games/[id]/holes/[holeNumber]/page.tsx`. CSS-keyframe i `app/globals.css`. Respekterer `prefers-reduced-motion`.

</details>

---

### [1.4.1] - 2026-05-18 · bug

> Bane-redigering lagrer nå alle tee-bokser du har lagt inn. Tidligere mistet du tee 6 og 7 hvis du fylte ut mer enn fem rader.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/admin/courses/new/actions.ts` og `app/admin/courses/[id]/edit/actions.ts` looper nå over `MAX_TEE_BOXES` (importert fra `components/CourseForm`), ikke hardkodet `5`. Tees i posisjon 6 og 7 ble silently dropped fordi server-actionene aldri leste dem fra formData.

</details>

---

### [1.4.0] - 2026-05-17

> Tee-bokser kan nå ha rating for flere kjønn på samme rad — så du legger inn «Gul» én gang med slope/CR for Herrer og Damer, ikke to ganger. Spill-formen er forenklet til én tee-dropdown med M/D/J-toggle pr. spiller. Du kan også fylle ut manglende ratings på eksisterende tees i etterkant.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0029_tee_box_multi_rating.sql` — `tee_boxes` får ni nye nullable rating-kolonner (`slope_${gender}`, `course_rating_${gender}`, `par_total_${gender}` for mens/ladies/juniors) + CHECK at minst én komplett gender-sett må være satt. `game_players` får `tee_gender` enum (`mens`/`ladies`/`juniors`), default `mens`.
- `lib/games/teeRating.ts` — pure helper `getRatingForGender(tee, gender)` som returnerer `{slope, courseRating, par}` eller `null`. 4 unit-tester.
- `tee_missing_rating`-feilmelding for tilfeller der spillerens tee_gender mangler rating på den valgte teen ved publish.
- M/D/J-toggle pr. spiller i `GameForm` (alltid synlig, default M).
- Tre rating-undersjons-kort pr. tee i `CourseForm` (Herrer / Damer / Junior, hver med slope/CR/par).
- Visning av alle tilgjengelige ratings på `/admin/games/[id]`.

#### Changed
- `tee_boxes` migrerer eksisterende data: én-rad-pr-(tee × gender) → én-rad-pr-tee med riktig gender-kolonneset utfylt. Ingen merging av variant-rader (admin rydder manuelt om ønsket).
- `game_players` migrerer: `tee_box_id` (per-tee override fra v1.3.0) → `tee_gender` flag basert på den teens gender.
- Course handicap freezes ved publish bruker nå `getRatingForGender(game.tee_box, player.tee_gender)`. Begge start-paths (`startGame` + `startScheduledGame`).
- `GameForm` har én tee-dropdown (ikke to). Tee-options viser hvilke gender-ratings som er tilgjengelige som badge: `Gul (herre · dame)`.
- `getGameWithPlayers` cache henter nå multi-rating-felter på teen og `tee_gender` pr. spiller.
- «Du spiller fra»-banner på scorekortet bruker `me.tee_gender` for å derive riktig rating fra teens multi-rating-felter.

#### Removed
- `tee_boxes.slope`, `tee_boxes.course_rating`, `tee_boxes.par_total`, `tee_boxes.gender` kolonner — erstattet av per-gender kolonneset.
- `tee_box_gender` enum — ikke lenger brukt.
- `game_players.tee_box_id` — erstattet av `tee_gender`.
- `lib/games/teeResolution.ts` + tester — helper overflødig i den nye modellen.
- «For hvem»-segmented control i `CourseForm` — multi-rating-modellen gjør den unødvendig.
- «Tee for damer»-dropdown i `GameForm` — én tee-dropdown nå.

</details>
</details>


<details>
<summary><strong>1.3.y — Mixed-gender tee-bokser (1 oppføring)</strong></summary>

Herrer og damer kan nå spille fra ulike tees i samme runde med korrekt course handicap. Tee-bokser tagges med kjønn (herre/dame/junior) i bane-admin, og spill-formen får en valgfri dame-tee + M/D-toggle pr. spiller.

### [1.3.0] - 2026-05-17 · #92

> Du kan nå arrangere spill der herrer og damer spiller fra ulike tees i samme runde — alle får riktig course handicap. Tee-bokser tagges med kjønn i bane-admin, og du kan redigere baner selv om det er ferdigspilte spill på dem.

#### Added
- Migrasjon `0028_tee_box_gender.sql` — `tee_box_gender` enum (`mens`/`ladies`/`juniors`) + `tee_boxes.gender` (NOT NULL, default `'mens'`) + `game_players.tee_box_id` (nullable per-player override)
- «For hvem»-segmented control (Herrer / Damer / Junior) pr. tee-rad i bane-formen (`CourseForm.tsx`)
- «Tee for damer»-dropdown i `GameForm` (valgfri; tom = ingen separat dame-tee, alle spillere på herre-tee)
- M/D-toggle pr. spiller i game-formen — synlig kun når dame-tee er valgt; default M
- `lib/games/teeResolution.ts` med pure helper `resolvePlayerTeeId(gender, ladiesTeeId)` + 3 unit-tester
- «Du spiller fra»-banner øverst på `/games/[id]/scorecard` med tee-navn, kjønn-merkelapp og slope/CR
- Begge tees vises på `/admin/games/[id]` når et spill har per-spiller tee-override
- Ny error-kode `bad_ladies_tee` i `lib/admin/gameErrorMessages.ts` for invalid dame-tee i game-form

#### Changed
- Bane-edit (`courses/[id]/edit/actions.ts`) bruker nå diff-basert tee-update i stedet for delete-all + reinsert-all. Editering av slope/CR/navn/gender tillatt uansett om tees er referert av spill — kun sletting blokkeres hvis tee-en er i bruk (sjekker både `games.tee_box_id` og `game_players.tee_box_id`).
- Course handicap freezes ved publish bruker nå spillerens egen tee (`game_players.tee_box_id ?? games.tee_box_id`) i både `startGame` (draft→active) og `startScheduledGame` (scheduled→active).
- Edit-flyten rekonstruerer M/D-state fra `game_players.tee_box_id` — appen husker forrige valg.
- `getGameWithPlayers` joiner nå `tee_boxes` pr. game_player og på selve spillet, så scorekortet kan rendre tee-info uten ekstra round-trip.

#### Notes
- Oppfølger-issue [#92](https://github.com/jdlarssen/golf-app/issues/92) — `users.gender` + `users.level` for auto-default av M/D-toggle.
- Oppfølger-issue [#93](https://github.com/jdlarssen/golf-app/issues/93) — pre-existing bug der tees 6-7 silent droppes i bane-actions (server-loop går bare 0..5).
</details>


<details>
<summary><strong>1.2.y — Utvidet sideturnerings-poeng (1 oppføring)</strong></summary>

Sideturneringen får 12 nye kategorier og 3 stackbare achievements (Turkey/Solid/Snowman) du kan slå av/på ved spill-opprett. Best netto totalt 18 forblir 10p-grunnpilaren.

### [1.2.0] - 2026-05-16 · #41

> Sideturneringen får 12 nye kategorier å spille om — fra «flest birdier» og «konge på par-3» til stackbare achievements som Turkey (3 birdier på rad) og Snowman (lagets felles katastrofe på ett hull). Du velger selv ved spill-opprett hvilke som er aktive.

<details><summary>Teknisk</summary>

#### Added
- Migrasjon `0026_side_tournament_categories` — `games.side_disabled_categories text[]` for per-spill kategori-toggle. CHECK-constraint validerer mot 27 kjente ID-er. Default tomt array (Full pakke).
- `lib/scoring/sideTournamentConfig.ts` — sentralisert poeng-vekter. Tier-vektet slik at best netto 18 (10p) står alene på topp; nye kategorier topper på 4p/2p (Tier 2) eller 2p/1p (Tier 3). Achievements stackbare. Eksporterer `SideCategoryId`, `ALL_CATEGORY_IDS`, `CLASSIC_DISABLED_CATEGORIES`.
- 10 nye vinner-tar-alt-kategorier i `lib/scoring/sideTournament.ts`: `most_birdies`, `most_eagles`, `most_pars`, `best_brutto_18`, `best_brutto_f9`, `best_brutto_b9`, `king_par3`, `king_par5` (alle med team-aggregat + individ-best), `longest_bogey_free_streak` og `lowest_single_hole_brutto` (individ-only).
- 3 stackbare achievements: **Turkey** (3 netto-birdier på rad, +4p per spiller + lag-koord-bonus 4p × N), **Solid** (5 netto-pars+ på rad, +2p / 2p × N), **Snowman** (hele lagets brutto ≥ par+5 på samme hull, −2p).
- `components/admin/SideCategoriesPicker.tsx` — preset-velger («Klassisk», «Full pakke», «Custom») + grupperte per-kategori-toggles. Dual-version-kategorier kobles til én toggle. Default ved spill-opprett er Klassisk for å matche dagens v1.1.x-oppførsel.
- Grupperte sub-headers i `SideTournamentView` (Hovedkonkurranser / Skill og rarity / Moderate / Hull-konkurranser / Achievements / Penalty). Penalty-gruppen for Snowman bruker eksisterende `text-danger`-token (muted brick `#b8463e`).
- Forklaringer på leaderboardet: Turkey/Solid/Snowman-rader har korte regel-undertekster, og et nytt kollapsibelt «ⓘ Slik gis poengene»-panel øverst på sideturnerings-fanen lister alle aktive kategorier med poeng + regel.
- 122 unit-tester + 2 integrasjonstester for team-size N=1 (1v1v1) og N=4 (4v4). 405/405 grønne.

#### Changed
- `SideTournamentInput`-shape utvidet med `coursePars`, `playerScoresPerHole` og `disabledCategories`. Eksisterende tester oppdatert med tomme defaults; ingen logikk-endring i eksisterende kategori-blokker.
- `parseSideTournamentFromFormData` håndterer nå `side_disabled_categories[]` (FormData.getAll-mønster med multi-checkbox-submit) og validerer mot `ALL_CATEGORY_IDS`. Ny error-kode `bad_side_disabled_categories`.
- Leaderboard-loader (`app/games/[id]/leaderboard/page.tsx`) bygger nå ekte `coursePars` fra `course_holes` og `playerScoresPerHole` fra eksisterende `computeLeaderboard`-output i stedet for stub-defaults.
- `SideCategoryAward` utvidet med optional `winnerUserId`, `coordBonus`, `streakStartHole`/`endHole`/`Length` og `score` for å støtte navn-attribusjon og streak-render i UI.

#### Notes
- Regelsettet er team-size-aware (1v1, 2v2, 4v4) klar for [#41](https://github.com/jdlarssen/golf-app/issues/41), men admin-UI lager fortsatt kun 2v2-spill til den epicen lander.
- Manuelle bragder (chip-ins, sand saves, one-putts, wow-shot) er ute av scope — egen leveranse v1.3.x med ny per-hull-UI for registrering.
- Edge-case test-dekning (same-team-tie dedup + mixed-size game team-aggregate) sporet som follow-up i [#90](https://github.com/jdlarssen/golf-app/issues/90).
</details>



<details>
<summary><strong>1.1.y — Sideturnering (11 oppføringer)</strong></summary>

Første nye funksjon shipped etter v1.0.0. Lag kan nå konkurrere parallelt med best-ball-netto via en valgfri sideturnering med seks poeng-kategorier.

### [1.1.10] - 2026-05-16

> To admin-flater som tidligere bare hadde en kjedelig «Ingen X ennå»-tekst (invitasjons-køen og spill-lista) får nå en medaljong + ikon + et lite hint om hva som skjer videre, så de føler seg som invitasjoner heller enn glemte tomstader.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/admin/spillere/_components/PendingInvitations.tsx` — empty state bruker nå `ChampagneMedallion size={64}` med `MailEnvelope`-ikon + serif-tittel + hint "Inviter en spiller ovenfor — så dukker vente-køen opp her." Samme palett-mønster som hjem-skjermens "KLUBBHUSET ER ÅPENT"-state.
- `app/admin/games/page.tsx` — empty state har egen variant per filter: `PinFlag` for "Ingen spill ennå" (CTA mot «+ Nytt»), `Laurel` for "Ingen signerte runder ennå" (resultatprotokollen). Medaljong-størrelse 72px så den passer den større page-konteksten.

</details>

### [1.1.9] - 2026-05-16

> Sensitive admin-handlinger (avslutte spill, godkjenne scorekort, gjenåpne spill/scorekort) skrives nå til en intern audit-log med hvem-gjorde-hva og når, så vi har et data-spor å se etter hvis noe ble endret feil.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0027_admin_audit_log` — `public.admin_audit_log` (id, created_at, actor_user_id FK → users ON DELETE SET NULL, actor_name TEXT NOT NULL snapshot, event_type TEXT, target_type/target_id, payload JSONB). Tre composite-indexer for actor-, event- og target-spørringer. Tabellen er lukket for anon + authenticated; skriv går via service-role admin-client.
- `lib/admin/auditLog.ts` — `logAdminEvent({ actorId, actorName, eventType, targetType, targetId, payload })` skriver via `getAdminClient()`. Fail-soft: console.error ved feil, kaster aldri opp så et transient DB-hikk ikke ruller tilbake en vellykket spill-avslutning. `AdminAuditEventType`-union er single source of truth for hvilke events vi auditerer.
- 4 unit-tester for happy-path, default-felter, error-swallow, og throw-swallow.

#### Changed
- `endGame`, `endGameWithSideWinners`, `adminApproveScorecard`, `reopenScorecard`, `reopenGame` kaller `logAdminEvent` etter den primære DB-write-en lykkes. Hver requireAdmin-helper plukker også `users.name` så snapshot-felten kan settes uten ekstra round-trip.

</details>

### [1.1.8] - 2026-05-16

> Admin-invitasjons-flyten har nå rate-limiting (20 per admin, 30 per IP per minutt), så et bug eller kompromittert konto ikke kan sende ut bursts av invitasjoner og brenne mail-budsjettet.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon `0026_admin_action_rate_limit` — tabell `public.admin_action_rate_limit` (fixed-window-teller per bucket) + RPC `consume_admin_rate_limit(p_bucket, p_max, p_window_seconds)` som atomisk inkrementerer og sjekker. SECURITY DEFINER så funksjonen tør kjøre uavhengig av RLS-state; tabellen selv har ingen client-policies.
- `lib/admin/rateLimit.ts` — `consumeAdminInviteRateLimit({ supabase, adminId, ip })` sjekker begge bucketene parallelt. Fail-open ved DB-feil så en transient outage ikke låser den eneste admin-en ute av sin egen invite-flow. `getClientIp()` plukker første verdi i `x-forwarded-for` (Vercel-edge garanterer at den er ekte). 5 unit-tester for happy-path, hver bucket exhausted, RPC-error → fail-open, og custom limits.
- `vitest.config.ts` aliasrer `server-only` til en tom stub så server-only-guarded moduler kan unit-testes.

#### Changed
- `sendInvitation` og `resendInvitation` i `app/admin/spillere/actions.ts` kaller helperen før hver Resend-mail går ut. Ved overskridelse redirectes admin tilbake til `/admin/spillere` med ny `error=rate_limited`-banner.

</details>

### [1.1.7] - 2026-05-16 · #3

> Du kan nå bytte mellom netto og brutto på det avsluttede leaderboardet — toggle-en er tydeligere (begge modus synes samtidig, gjeldende er framhevet), og "Total"-tallet på lederkortet oppdaterer seg når du bytter.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/leaderboard/State4View.tsx` — `LeaderCard` hadde hardkodet "Total netto"-label uavhengig av `mode`. Når brukeren bytta til brutto endret dataen seg (lederen, totals, drilldown-link) men label-en sa fortsatt "Total netto" — derav inntrykket av at toggle-en ikke virket. Now: `Total {mode}` følger gjeldende modus.

#### Changed
- `ModeChip` (samme fil) er løftet fra subtil "Bytt til X"-chip til en tab-stil toggle med begge moduser synlige samtidig — speiler state #3.5 sin `ModeToggle`-pattern så brutto/netto-affordansen leses likt uansett om runden pågår eller er ferdig. Sized down (28px min-height vs. 36px) så den ikke konkurrerer med leder-kortet visuelt.

</details>

### [1.1.6] - 2026-05-16

> Du ser nå netto-tallet ditt per hull på scorekort-oversikten — også mens runden pågår, ikke bare etter at spillet er avsluttet.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — Netto-kolonnen gates nå på `!shouldHideNetto(state)` i stedet for `state === 'reveal-finished'`. Reveal-active er fortsatt den eneste tilstanden som skjuler netto (climax-bevaring); live-always og reveal-finished surfacer den begge nå.

</details>

### [1.1.5] - 2026-05-16 · #76

> Når tee-off-tiden passerer og runden starter automatisk, kommer du nå rett inn på hull-skjermen — uten å bli sendt tilbake til startskjermen først.

<details>
<summary>Teknisk</summary>

#### Fixed
- `app/games/[id]/page.tsx` — auto-start-fallback (server-component-path som flipper `games.status` fra `scheduled` til `active` når en spiller laster siden etter at tee-off har passert) inviderer nå `getGameWithPlayers`-cachen via `after(() => revalidateTag(\`game-\${id}\`, { expire: 0 }))`. Uten dette ville hull-page-en kunne servere pre-flip-snapshot (status='scheduled') og redirecte spilleren tilbake til game-home i opptil 15 min revalidate-vinduet. `revalidateTag` kan ikke kalles direkte under render — derav `after()` fra `next/server` som deferrer kallet til post-render. `{ expire: 0 }` forsterker til umiddelbar invalidering (vs. stale-while-revalidate som ville kostet én ekstra redirect-bounce). Admin-pathen (`startScheduledGameAction` i server-action-kontekst) var allerede dekket fra #76.

</details>

### [1.1.4] - 2026-05-16

> Du ser nå netto-tallet ditt diskret under navnet på hvert hull, så du slipper å regne i hodet — også som plus-golfer.

<details>
<summary>Teknisk</summary>

#### Changed
- `ScoreCard` helper-tekst viser nå «Netto X» (= score − extraStrokes) når score er satt, i stedet for «Bekreftet». Konsistent for plus-, scratch- og handicap-spillere.
- Helper-slot er tom i reveal-active mode (samme regel som `+N SLAG`-badgen som allerede skjules der).

#### Removed
- Unreachable «Justert · tap igjen for å bekrefte»-grenen i helper-tekst-logikken (rester fra ikke-implementert to-stegs flyt).
- «Bekreftet»-teksten — den dupliserte signalet fra gylden border + sync-pulse-linje.

</details>

### [1.1.3] - 2026-05-16

> Sideturneringen viser nå hvem som er på hvert lag, og du kan klikke på et lag for å se hvilke kategorier som ga poengene deres.

<details><summary>Teknisk</summary>

#### Changed
- `SideTournamentView` refaktorert fra én master-`<details>` (med per-kategori-linjer + hull-grid + LD/CTP-slot-seksjoner) til en liste av per-team-`<details>`-elementer. Hver lag-rad har medal + Lag N + fornavn-rad + total-poeng som summary, og lagets awards listet per kategori som expanded content
- `app/games/[id]/leaderboard/page.tsx` utvider `sideTeams.members` med `firstName` (via `lib/firstName.ts`-helperen) for kompakt visning av spillere-navn

#### Added
- `lib/leaderboard/formatHolesList.ts` — formatterer en hull-liste til kompakt Norwegian-streng (sammenhengende kjeder → range `"10–18"`, spredte → komma `"4, 7, 12"`, blandet kombineres). 8 unit-tester

#### Removed
- `HoleWinGrid`-komponenten (3×6-rutenett over hele runden — kan revurderes i senere iterasjon hvis savnet)
- `CategoryRow`, `SlotsSection`, `collectCategoryWinners` (per-kategori-seksjonen erstattet av per-team-collapse)


### [1.1.2] - 2026-05-16

> Initialene på scorekortet og hull-leaderboardet bruker nå første bokstav i fornavn og etternavn (f.eks. «Karl Hansen» → «KH»), i stedet for første bokstav i kallenavnet. Spillere med kun fornavn får fortsatt én bokstav.

<details>
<summary>Teknisk</summary>

#### Changed
- `lib/names/initials.ts` (ny) — `nameInitials(name)` returnerer første bokstav i første + siste token, eller én bokstav for one-word-navn. Unicode-safe (Å/Æ/Ø). Faller tilbake til `?` på null/tom input. 9 unit-tester.
- `app/games/[id]/holes/[holeNumber]/page.tsx` — `initial`-prop til `HoleClient` kommer nå fra `nameInitials(name)` i stedet for `firstInitial(nickname ?? name)`. Kallenavn brukes fortsatt som display-navn på kortet.
- `app/games/[id]/leaderboard/holes/page.tsx` — initial-kolonne på hull-leaderboardet bruker `nameInitials(p.name)`. Bredde utvidet fra `w-4` til `w-6` og fontstørrelse justert til 12px så to-bokstavs initialer ikke kuttes.
- `app/games/[id]/page.tsx` — flight-roster og draft-teams-oversikt bruker `nameInitials` for konsistens.
- `components/hole/ScoreCard.tsx` — avatar-fontstørrelse er nå 13px for to-bokstavs initialer, 15px for én. Holder visuell harmoni i den 36×36 sirkelen.

</details>

### [1.1.1] - 2026-05-16 · bug

> I reveal-modus ser nå alle deltakere live brutto-leaderboardet på tvers av flights — ikke bare sin egen flight. Netto-rangeringen forblir skjult til admin avslutter spillet, akkurat som før.

<details>
<summary>Teknisk</summary>

#### Fixed
- Migrasjon `0025_reveal_active_scores_visibility` — utvider `scores select gating`-policyen så deltakere i et reveal-modus-spill (`score_visibility='reveal'` + `status='active'`) kan lese alle scores i spillet, ikke bare egen-flight. Avdekket i første pilot-runde 2026-05-14 (SICKlestad) der `RevealBruttoView` viste «18 hull mangler» for andre flightenes lag for ikke-admin-spillere. Live-modus state3.5 (front-9-only) er uendret — climax-hiding der avhenger fortsatt av at back-9-scores er uleselige mid-round.

</details>

### [1.1.0] - 2026-05-14

> Du kan nå legge til en sideturnering i admin-formen. Lag samler poeng fra 6 kategorier — best netto 18, front 9, back 9, hole-wins, longest drive og closest to pin. Resultatet vises i en egen fane på leaderboarden etter at spillet er avsluttet.

<details><summary>Teknisk</summary>

#### Added
- Migrasjon `0024_side_tournament` — `games.side_tournament_enabled`, `games.side_ld_count`, `games.side_ctp_count` (alle med safe defaults) + ny tabell `game_side_winners` med RLS (select kun ved `status=finished`, mutations admin-only).
- `lib/scoring/sideTournament.ts` — `calculateSideTournament`-pure-funksjon med 13 unit-tester. Tie i netto-kategoriene gir alle full pott; hole-win krever alene-vinner. 10p best netto 18, 5p F9 + B9, 2p per hole-win, 2p per LD/CTP-vinner.
- Admin-form-seksjon i `GameForm` med master-toggle + radio-grupper for LD/CTP-antall (0/1/2). Gates på ≥2 lag.
- Ny route `app/admin/games/[id]/avslutt/` med dropdown-wizard for LD/CTP-vinnere. `EndGameButton` redirecter dit conditional på sideturnerings-config.
- Leaderboard-tabs (`LeaderboardTabs`) + `SideTournamentView` med poeng-tabell (medaljer for topp 3) + kollapsibel detalj-seksjon (hole-win-grid 3×6, LD/CTP-vinnere).

#### Changed
- `app/admin/games/[id]/page.tsx` henter nå sideturnerings-config og passerer det til `EndGameButton`.
- `app/games/[id]/leaderboard/page.tsx` henter `game_side_winners` når `status=finished AND side_tournament_enabled`, og bygger `SideTournamentInput` fra eksisterende score-data (gjenbruker `computeLeaderboard` for å unngå dobbel best-ball-beregning).
</details>



<details>
<summary><strong>1.0.x — Første stabile lansering (11 oppføringer)</strong></summary>

Tørny er nå stabil. Tre funksjoner kobles til v1.0: reveal-modus for kompis-gjenger som vil ha drama under runden, scorekort-former som premium visuell touch, og navne-reveal når spillet er ferdig.

### [1.0.10] - 2026-05-14

> Hjemmesiden hilser deg nå proft uten håndvink-emoji, og kicker-overskriften i toppbar-en (SEKRETARIATET, PROFIL, …) står ekte sentrert i stedet for å lene mot venstre.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/page.tsx` — droppet 👋-emoji fra hilsenen. Tittelen er nå `Hei, {navn}.` — matcher den nøkterne tonen i admin-greetingen (`God morgen, Jørgen.`).
- `components/ui/TopBar.tsx` — kicker er nå `absolute left-1/2 -translate-x-1/2` så den sentreres i viewport uavhengig av BackLink-bredden. Den gamle 80px høyre-spaceren er fjernet — den asymmetrien (32px BackLink vs 80px spacer) gjorde at kickeren lente venstre.

</details>

### [1.0.9] - 2026-05-14

> Hull-for-hull-oversikten viser nå per-spiller vs-par-pille rett ved siden av netto-scoren. TOTALT-kortet har fått mot-par-en flyttet inn ved siden av totalsummen (56 −16) i stedet for som egen linje under.

<details>
<summary>Teknisk</summary>

#### Added
- Per-spiller vs-par-pille (`E`/`+1`/`−1`) i `HoleRow` etter netto-tallet, samme tone-mapping som lag-pillen.

#### Changed
- Totalt-baren i `holes/page.tsx` viser `total + vsPar` inline i samme baseline-flex. «Mot par: X»-linja under er fjernet.
- Legend oppdatert: `initial · brutto · netto · vs par   →   lag`.

</details>

### [1.0.8] - 2026-05-14

> Hull-for-hull-oversikten er ryddet opp: vinner-av-hullet-prikken er borte (skapte mer støy enn verdi), netto-tall står nå tett ved brutto for hver spiller, og helt til høyre står lagets score for hullet med en E/+1/−1-pille — slik at du kan følge progresjonen nedover og se nøyaktig på hvilket hull dere gikk fra E til −1.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — fjernet winner-of-hull-prikk-kolonnen + tilhørende legend-entry. Per-spiller-rad er nå `initial · brutto-shape · netto` (ingen per-spiller vs-par-pill). Helt til høyre er lagets best-ball-netto + vs-par-pill, sentrert vertikalt over begge spiller-radene. Sparet plass + gir en lesbar high-level «narrative»-kolonne.
- Legend forenklet til `B = brukt netto` + `initial · brutto · netto → lag · vs par`.

</details>

### [1.0.7] - 2026-05-14

> Hull-for-hull-oversikten har fått en helt ny layout: hver spiller har sin egen rad med initial (J, H, …) foran scoren — som på et fysisk scorekort. Bokstaven til den som «vant» netto-en for laget er uthevet. Sparer plass, ingen horisontal scroll selv på smaler iPhone.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — `HoleRow` er omskrevet fra horisontal grid med to spillere side om side til vertikalt stack: hull-nummer + par på venstre side (spenner over begge spiller-rader), så én rad per spiller med `initial · brutto-shape · netto · vs-par-pill`. Lag-totalen (`teamNet` + pill) er fjernet fra hver rad siden hver spillers netto allerede er synlig — den lavere er det laget brukte. Kontributør markeres med uthevet initial (`font-bold`) i stedet for bakgrunns-fyll. Legend oppdatert til `B = brukt netto` og `initial · brutto · netto · vs par`.
- `HoleTable` mottar nå `teamPlayers: LbPlayer[]` for å mappe `userId → initial`.

</details>

### [1.0.6] - 2026-05-14

> Scorekortet passer nå på normal iPhone — +slag-kolonnen er flyttet til fotnoten som «Slag fått: N» totalt. Du kjenner din egen handicap-fordeling per hull, og kortet trenger ikke gjenta den på hver linje.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — per-rad `+slag`-kolonne fjernet. Total ekstra-slag («Slag fått: N») surfaces i fotnoten via `showHandicapTotal`-flagget (gjelder i live-modus og reveal-finished; skjules i reveal-aktiv). Padding redusert fra `px-4` til `px-3` for å spare bredde. Footer-layout er nå wrap-vennlig flex i stedet for én lang setning.

</details>

### [1.0.5] - 2026-05-14

> Hull-for-hull-leaderboardet er overhalt: hver spiller-celle viser nå både brutto-tall (med form rundt), antall ekstra-slag og netto-tall i ett tydelig stack. «Brukt netto» har fått fargefylt bakgrunn så det er lett å se hvem som vant hullet. Form-strekene er tynnere så trippel- og kvadruppel-former tar mindre plass.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/leaderboard/holes/page.tsx` — hver `pc`-celle er nå et vertikalt stack: ScoreShape med brutto på toppen, og «+slag · netto»-linje under. Kontributør markeres med `bg-accent/12` + `font-bold` (erstatter den lite synlige `font-semibold`-aleinemarkøren). Legend oppdatert til «brutto / +slag · netto».
- `components/scoring/ScoreShape.tsx` — strek-tykkelsen redusert: sm 1.25 → 1.0, md 1.5 → 1.25, lg 2 → 1.5. Gap mellom nestede former redusert: `max(3, stroke+1)` → `max(2, stroke+0.5)`. Trippel- og kvadruppel-former tar nå merkbart mindre plass.

</details>

### [1.0.4] - 2026-05-14

> Leaderboardet oppdaterer seg automatisk når admin trykker «Avslutt spillet» — du slipper å refreshe selv for å se reveal-en.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon 0022 — `public.games` lagt til i `supabase_realtime`-publikasjonen
- `PreRoundLeaderboardRealtime` lytter nå på `games` UPDATEs i tillegg til `scores` INSERTs. Når admin avslutter spillet (status flippes til `finished`), trigges `router.refresh()` automatisk og leaderboardet veksler til `State4View` med formatRevealName + confetti.

</details>

### [1.0.3] - 2026-05-14

> Spill-hjem-siden har nå en «Leaderboard»-knapp så du kan se brutto-stillingen mens du venter på at admin avslutter spillet — ikke bare via hull-skjermen.

<details>
<summary>Teknisk</summary>

#### Added
- `app/games/[id]/page.tsx` — `Leaderboard`-SmartLink-card under «Mitt scorekort» når spillet er `active`. Lukker discoverability-gapet etter scorekort-levering: før denne fixen var leaderboardet kun nåbart via hull-skjerm-ikonet, og hull-skjermen redirecter etter levering.

</details>

### [1.0.2] - 2026-05-14

> Live brutto-leaderboardet viser nå hvor langt under/over par hvert lag og hver spiller er — du ser `+3` ved siden av brutto-totalen istedenfor bare det rå tallet.

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` viser `E` / `+N` / `−N` delta-mot-par på både lag-total og hver spiller-rad. Par-tellet er kumulativt over spilte hull (teamet: hull der minst én spiller har scoret; spilleren: hull der spilleren selv har scoret).

</details>

### [1.0.1] - 2026-05-14 · bug

> Par-scorene står nå på samme kolonne som birdies og bogeys på hull-skjermen — de skjøvet seg litt til venstre fordi de manglet form rundt seg.

<details>
<summary>Teknisk</summary>

#### Fixed
- `components/scoring/ScoreShape.tsx` — `shape='none'`-branchen reserverer nå samme `width`/`height` som de andre formene (`px × px`) og bruker `lineHeight: ${px}px` + `textAlign: center` for vertikal/horisontal sentrering. Par-tall okkuperer dermed samme kolonne-bredde som birdie/bogey-tall side om side.

</details>

### [1.0.0] - 2026-05-14

> Første stabile lansering. Tørny går fra alpha til 1.0 med tre nye funksjoner: reveal-modus skjuler netto-tall under runden og avslører på slutten (perfekt for kompis-gjenger der laget med høyere handicap kan slå brutto-lederen — virkelig spennings-moment når du trykker avslutt), scorekort-former gir birdies en sirkel og bogeys en firkant slik som på papir-scorekort, og når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen» med kallenavnet midt i fullt navn.

<details>
<summary>Teknisk</summary>

Sammenslått leveranse av v0.10.23–v0.10.27 + ingen ytterligere endringer i denne commiten. Se de individuelle oppføringene under for hva hver bump brakte.

Hovedgrep:

#### Added
- Migrasjon 0021 — `games.score_visibility` enum (`live` / `reveal`) med CHECK-constraint og lås ved status=active
- `lib/games/visibility.ts` — `revealState(visibility, status)` + `shouldHideNetto(state)` helpers
- `lib/scoring/scoreShape.ts` — mapper score til form-kategori (sirkel/dobbel/trippel for under-par; firkant/dobbel/trippel/quadruple for over-par)
- `lib/names/formatRevealName.ts` — `Karl "Knølkis" Jensen`-format for finished games
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall, brukt på 5 skjermer
- `app/games/[id]/leaderboard/RevealBruttoView.tsx` — live brutto-leaderboard for reveal-mode aktiv (lag-totaler basert på brutto best-ball, ingen handicap-info)
- Admin-UI «Synlighet under runden» i `/admin/games/new` og `/admin/games/[id]/edit` med lås ved status=active
- Hull-skjerm-leaderboard-ikon (pokal) i headeren med `?return=hole&n=N` for retur til riktig hull
- SpecificValueSheet X-knapp som fjerner score helt (skriver null via writeScore)

#### Changed
- Hull-skjerm `ScoreCard` — delta-pillen droppet, erstattet av ScoreShape rundt stortallet. Numeriske størrelser skaleres ned ved nestede former. `+N SLAG`-badge skjult i reveal-aktiv.
- Scorekort-oversikt + lever + approve — Slag-tallene pakket i ScoreShape (size sm), `+slag`-kolonne skjult i reveal-aktiv, ny Netto-kolonne i reveal-finished. HULL-kolonne-header omdøpt til # for å spare plass.
- Hull-leaderboard (`/leaderboard/holes`) — per-hull-tallene i ScoreShape. Reveal-aktiv tvinger brutto-modus uten netto-fargekoding. formatRevealName ved status=finished.
- Hovedleaderboard (`/leaderboard`) — utvidet view-state-machine med `reveal-active` og `reveal-finished` branches. Alle finished-states bruker formatRevealName for spiller-navn.
- SpecificValueSheet — fra 8 til 4 knapper (eagle / birdie / par / X).

#### Removed
- Opprinnelig planlagt per-bruker `display_pref`-toggle ble strøket (erstattet av navne-reveal-mekanikken som er enklere og mer dramatisk).

</details>
</details>
</details>



<details>
<summary><strong>Pre-stabil historikk — 9 serier</strong></summary>

<details>
<summary><strong>0.10.x — Resultat-mail og closing-the-loop (28 oppføringer)</strong></summary>

Mail begge veier rundt godkjennings-flyten: admin får mail når en spiller leverer, spillere får mail når admin avslutter. Ingen polling av appen for å vite om det er noe nytt å gjøre. Pilot-polish underveis: ærligere feilmeldinger i admin når noe går galt med å lese spillerlisten, og første pass på personvern-siden.

### [0.10.27] - 2026-05-14

> Live brutto-leaderboard for reveal-spill: du ser hvordan lagene ligger an på brutto, men vinneren er fortsatt skjult. Nytt: når et spill er ferdig vises navnene som «Karl "Knølkis" Jensen», med kallenavnet midt i fullt navn som en del av reveal-en. Og du kan nå hoppe direkte til leaderboardet fra hull-skjermen via en liten knapp i toppen.

<details>
<summary>Teknisk</summary>

#### Added
- `RevealBruttoView` for `state === 'reveal-active'` på leaderboard-siden — lag-totaler basert på brutto best-ball med ingen handicap-info
- Hull-skjerm-leaderboard-ikon (pokal) i headeren med `?return=hole&n=N` for return-to-hole
- Leaderboard-side respekterer `?return=hole&n=N`-param for back-knapp i alle view-states

#### Changed
- Leaderboard 'full'-view (State4View) bruker `formatRevealName(name, nickname)` for både leder-kortet og rad-listen, både i live-mode-finished og reveal-mode-finished
- Hull-leaderboard (`/leaderboard/holes`) bruker `formatRevealName` for spillerlinjen når spillet er ferdig (mid-round beholder den kompakte first-name + HCP-formen)

</details>

---

### [0.10.26] - 2026-05-14

> Reveal-modus er nå klar: admin kan velge om netto-tallene skjules under runden og avsløres på slutten. Funker overalt — hull-skjerm, scorekort, leaderboard, godkjenning.

<details>
<summary>Teknisk</summary>

#### Added
- `/admin/games/new` og `/admin/games/[id]/edit` — fieldset «Synlighet under runden» med radio-valg `live` / `reveal`
- Server-action validering på `score_visibility` med lås mot `active`/`finished` status

#### Changed
- Hull-skjerm (`ScoreCard`) — `+N SLAG`-badge skjult når `score_visibility = reveal` og spillet er aktivt
- Scorekort-oversikt — `+slag`-kolonne skjult i reveal-aktiv; ny `Netto`-kolonne i reveal-finished med ScoreShape og netto-totalt-fotnote
- Lever-skjerm + approve-skjerm — samme oppførsel som scorekort-oversikt
- Hull-leaderboard (`/leaderboard/holes`) — tvinger brutto-modus i reveal-aktiv, ingen netto-fargekoding

</details>

---

### [0.10.25] - 2026-05-14 · #3

> Scorekort-formene følger nå med over alt der tallene står — scorekort-oversikt, lever-skjerm, godkjenning og hull-leaderboard. Samtidig krymper «HULL»-kolonnen til kun «#» for å frigjøre plass på smale skjermer.

<details>
<summary>Teknisk</summary>

#### Changed
- `app/games/[id]/scorecard/page.tsx` — slag-kolonnen pakker tallene i `ScoreShape` (size `sm`), kolonneoverskrift `HULL` → `#`
- `app/games/[id]/submit/page.tsx` — samme behandling som scorekort-oversikten
- `app/games/[id]/approve/page.tsx` — samme behandling i det utvidbare 18-hulls-kortet
- `app/games/[id]/leaderboard/holes/page.tsx` — per-spiller-grossen i hull-griden pakkes i `ScoreShape` (size `sm`)

#### Notes
- `app/games/[id]/leaderboard/page.tsx` (state #3.5/#4) og `app/profile/historikk/page.tsx` rendrer ikke per-hull-tall, så `ScoreShape` ble bevisst hoppet over der

</details>

---

### [0.10.24] - 2026-05-14

> Tre justeringer på hull-skjermen etter første pilot-test: trippel-sirkel for albatross, dobbeltfirkant utvides til kvadruppel-firkant for blow-up-hull, og spesifikk-score-arket forenkles til kun eagle/birdie/par + X for å fjerne en score helt.

<details>
<summary>Teknisk</summary>

#### Changed
- `lib/scoring/scoreShape.ts` — utvidet shape-mapping: `triple-circle` for albatross (≤−3), `triple-square` for triple bogey, `quadruple-square` for quad bogey eller verre
- `components/scoring/ScoreShape.tsx` — rendrer 3 og 4 nestede former; sentrering fikset (lineHeight matcher shape-høyde, ikke flex)
- `components/hole/ScoreCard.tsx` — `numberFontSize` skalerer ned dynamisk basert på form-kompleksitet og siffer-antall så tallene aldri klipper innerste form
- `components/hole/SpecificValueSheet.tsx` — fra 8 til 4 knapper: eagle/birdie/par + X (fjerner score)

#### Added
- `onClear` callback i `SpecificValueSheet` som skriver `null` til scores via `writeScore`

</details>

---

### [0.10.23] - 2026-05-14

> Score-tallene på hull-skjermen får scorekort-former rundt seg — sirkel for birdies, firkant for bogeys, dobbel for eagle og double bogey.

<details>
<summary>Teknisk</summary>

#### Added
- `lib/games/visibility.ts` — `revealState` og `shouldHideNetto` helpers (foundation for kommende reveal-mode)
- `lib/scoring/scoreShape.ts` — mapper score til shape-kategori
- `lib/names/formatRevealName.ts` — full-format navn for grand-reveal moment
- `components/scoring/ScoreShape.tsx` — SVG-pakker rundt score-tall (sirkel/firkant/dobbel)
- Migrasjon 0021 — `games.score_visibility` enum-kolonne med CHECK-constraint

#### Changed
- `components/hole/ScoreCard.tsx` — delta-pillen ved siden av stortallet er fjernet og erstattet av en SVG-form rundt selve tallet (sirkel for birdie, firkant for bogey, dobbel for eagle/double-bogey)

</details>

---

### [0.10.22] - 2026-05-14

> Tilbake-knappen på personvern-siden returnerer deg nå til siden du kom fra, ikke alltid til hjem-siden.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/HistoryBackLink.tsx`** — client component som bruker `router.back()` når `document.referrer` er same-origin, og faller tilbake til en statisk `fallbackHref` (typisk `/`) når referrer mangler (deep link, bokmerke, eller direkte URL-tasting). Visuelt identisk med `BackLink`.
- **`TopBar` får ny `back?: 'link' | 'history'`-prop** (default `'link'`). `back="history"` bytter chevronen fra ren `<Link>` til `HistoryBackLink`. Egnet for sider som kan nås fra hvor som helst i appen.

#### Changed

- **`/legal/privacy`** bruker nå `back="history"` siden den linkes fra AppVersionFooter på praktisk talt hver side — brukeren skal returnere dit de kom fra, ikke alltid til `/`.

</details>

---

### [0.10.21] - 2026-05-14 · bug

> Personvern-siden er nå faktisk lesbar uten å logge inn — tidligere ble du sendt til /login fordi auth-gaten ikke gjorde unntak.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`proxy.ts`-matcheren manglet `legal/`-unntak.** Den globale auth-gate-middleware-en redirecter alle ikke-matchende ruter til `/login?next=...` hvis bruker er uautentisert. `/legal/privacy` (og fremtidige legal-sider) skal være offentlige — særlig viktig for invitéer som skal lese personvern *før* de logger inn. La til `legal/` i matcherens negative-lookahead, parallelt med `login`, `register` og `auth/callback`.

</details>

---

### [0.10.20] - 2026-05-14

> «Personvern» er nå klikkbar fra bunnen av hver side ved siden av versjons-stempelet — også på login-siden, så invitéer kan lese den før de logger inn.

<details>
<summary>Teknisk</summary>

#### Changed

- **`AppVersionFooter`** viser nå `v0.10.20 · Personvern` i stedet for bare versjonsnummer. Lenken peker til `/legal/privacy` med samme muted-styling som footer-en. Bruker plain `<a>` (ikke SmartLink) for å unngå viewport-prefetch av personvern-siden på hver side-visning — link-en klikkes sjeldent og fortjener ikke bundle-cost. Footer rendres av AppShell på de fleste sider; game-i-progress-sider (approve/submit/scorecard) bruker `showVersion={false}` og påvirkes ikke.

</details>

---

### [0.10.19] - 2026-05-14

> Personvern-siden er nå nådbar fra profilen — liten muted-tekst med lenke rett under «Mine data»-seksjonen.

<details>
<summary>Teknisk</summary>

#### Added

- **Personvern-lenke i `/profile/page.tsx`** under GdprSection: «Les hvordan vi behandler og lagrer dataene dine i [personvernerklæringen](/legal/privacy).» Discret muted-text-stil, ingen visuell konkurranse med GDPR-kortene. Siden var allerede live på `/legal/privacy` men kunne ikke nås uten å skrive URL-en direkte — nå har den en faktisk inngang.

</details>

---

### [0.10.18] - 2026-05-14

> Hver side har nå en tydelig overskrift i den sticky top-baren — som «Sekretariatet» gjør på admin-sidene. Tidligere var det bare en chevron der med en tom plass i midten.

<details>
<summary>Teknisk</summary>

#### Changed

- **Kicker lagt til på 8 player-facing sider** i TopBar — fyller den tomme midtre slot'en med en konsekvent uppercase-section-label:
  - `/profile` → «Profil»
  - `/profile/historikk` → «Historikk»
  - `/profile/slett-konto` → «Slett konto»
  - `/legal/privacy` → «Personvern»
  - `/games/[id]` (default) → «Turnering»
  - `/games/[id]/approve` → «Godkjenning»
  - `/games/[id]/scorecard` → «Scorekort»
  - `/games/[id]/submit` → «Lever scorekort»

#### Removed

- **Dupliserte page-titler** fjernet under TopBar siden kicker'en nå bærer samme info: `PageHeader title="Min profil"` på `/profile`, `PageHeader title="Min historikk"` på historikk, `PageHeader title="Godkjenn scorekort"` på approve, `PageHeader title="Mitt scorekort"` på scorecard, `PageHeader title="Gjennomgå før levering"` på submit, `PageHeader title="Personvern"` på legal, og det custom-rendrede «Faresone» + «Slett konto»-block'en på slett-konto.
- **`/games/[id]` beholder PageHeader** med spillets navn — det er ekte sideinnhold (turneringsnavnet), ikke duplikat av kicker'en «Turnering».
- **«N fullførte runder»-subtitle** på historikk-siden er bevart som en liten muted-line rett under TopBar (den bærer faktisk informasjon — telling).

</details>

---

### [0.10.17] - 2026-05-14

> Tilbake-knappen klistrer seg nå til toppen av skjermen på alle lange admin- og profil-sider — du slipper å scrolle helt opp for å komme tilbake.

<details>
<summary>Teknisk</summary>

#### Added

- **`components/ui/TopBar.tsx`** — ny gjenbrukbar komponent som rendrer en sticky-top header med `BackLink` chevron til venstre, valgfri uppercase-kicker (f.eks. «Sekretariatet», «Spill · protokoll») i midten, og en 80 px placeholder til høyre for visuell balanse. Bruker `sticky top-0 z-30 -mx-5 px-5 bg-bg/90 backdrop-blur-sm -mt-8 pt-5 pb-2 mb-4` slik at baren strekker seg ut til AppShell-kantene og scroll-innholdet glir gjennomsiktig under.

#### Changed

- **19 sider migrert** fra inline `<div className="-mt-3 ...">`-wrapper rundt BackLink til `<TopBar />`-komponenten: alle profil-sider, alle legal-sider, alle admin-undersider unntatt de to liste-sidene med `+ Ny`-action-knapp, og fire game-undersider (approve, scorecard, submit, default-state av game-detalj). Sticky header gir også backdrop-blur-effekt så scrolling-innhold ses dempet gjennom baren — iOS-aktig følelse.

#### Skipped (med begrunnelse)

- `app/admin/courses/page.tsx` + `app/admin/games/page.tsx` — list-sider med «+ Ny»-action-knapp i topbar-høyre. Migreres senere når TopBar evt. får støtte for action-slot.
- `app/games/[id]/page.tsx` (scheduled-state) + `app/games/[id]/leaderboard/page.tsx` — bruker en `<header>`-custom-layout med `<Kicker>` i senter; matcher ikke TopBar-mønsteret.
- `app/page.tsx` — hjem-siden bruker `<BrandMark />` i stedet for en tilbake-knapp; ikke aktuelt.

</details>

---

### [0.10.16] - 2026-05-14

> Innloggings-flyten føles nå raskere og mindre forvirrende: «Send kode»-knappen viser «Sender kode …» mens den jobber, og koden logger deg inn automatisk så snart den er fylt inn — du trenger ikke trykke «Logg inn» selv.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Mangler visuell tilbakemelding på «Send meg kode»-knappen.** Klikket ga ingen lokal feedback før Supabase + Resend round-trip (1–2 sek) returnerte. På mobil opplevde brukeren det som at appen ikke registrerte trykket. Skjemaet bytter nå til en sentrert «Sender kode til [email]»-state med spinner mens action'en er i flight (drevet av `useFormStatus().pending`).
- **«Koden er utløpt»-feil ved første forsøk (iOS Safari).** Når Mail.app foreslår OTP-koden over tastaturet og brukeren trykker på forslaget, fylles input'en uten visuell bekreftelse. Brukeren trykket ofte forslaget en gang til, eller trykket «Logg inn» mens iOS samtidig auto-submittet — dobbel-submission konsumerte OTP-en to ganger, og andre forsøk fikk «code expired». Skjemaet auto-submitter nå idet koden er full (8 sifre), og en `useRef`-guard pluss `useFormStatus().pending` blokkerer videre submit-forsøk fra samme komponent — selv om iOS-auto-submission fyrer parallelt.

#### Changed

- **Verify-skjemaet auto-submitter når koden er 8 sifre.** Spilleren trenger ikke trykke «Logg inn» — verken etter manuell tasting eller iOS-auto-fill fra Mail-forslag. Hvis Supabase i fremtiden konfigureres for kortere koder må `OTP_LENGTH`-konstanten i `app/(auth)/login/_components/VerifyCodeForm.tsx` oppdateres.
- **Kode-inputen strippes for ikke-sifre on-the-fly** (mail-malen formaterer koden som «1234 5678», og Safari har av og til vært observert å ta med mellomrommet ved auto-fill).
- **Kode-inputen får `autoFocus`** så virtuell tastatur åpner seg automatisk når man kommer til verify-steget.
- **Begge skjemaer ble flyttet til client components** i `app/(auth)/login/_components/` slik at vi kan bruke `useFormStatus` og `useRef` for pending-state og dobbel-submit-guard. Server-action-importer er uendret.

</details>

---

### [0.10.15] - 2026-05-14 · bug

> Du kan nå slette et spill helt uavhengig av status — også aktive spill der ikke alle har levert scorekort, og avsluttede spill. Slettesiden viser sterkere advarsel for aktive spill men blokkerer ikke handlingen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Fjernet active-blokken fra `/admin/games/[id]/slett`.** Tidligere ble admin sittende fast: `endGame` krever at alle har levert scorekort, men hvis en spiller har droppet midt i runden er det aldri tilfellet — og slett-flyten blokkerte aktive spill med beskjeden «avslutt det først». Slettsiden lar nå handlingen gå gjennom på alle statuser. Bruk-case-en var åpenbar (test-spill, avbrutte runder, etc.).
- **Status-bevisst advarsel** erstatter blokken: `draft` (ingen advarsel), `scheduled` («spillerne får ingen melding om at det er kansellert»), `active` (rød `tone="error"` banner: «slettingen fjerner alle slag som er registrert så langt»), `finished` («leaderboard og resultater forsvinner permanent — spillere som har bokmerket lenken vil få 404»).
- **Knappetekst varierer** med status: «Slett pågående spill for alltid» når status er `active`, ellers «Slett spillet for alltid» — gjør destruktiviteten mer eksplisitt på det mest risikable case'et.
- **Server-action `deleteGame`** mistet sin parallel-blokk. Kommentar dokumenterer hvorfor.

</details>

---

### [0.10.14] - 2026-05-14

> Ny «Installer Tørny som app»-knapp på hjem-siden og i profilen. Du trenger ikke lenger lete etter «Legg til på hjem-skjerm» i Safari-menyen — Tørny tilbyr installasjonen selv.

<details>
<summary>Teknisk</summary>

#### Added

- **Plattform-bevisst install-system** under `lib/pwa/` + `components/pwa/`:
  - `lib/pwa/install-state.ts` — modul-singleton som fanger `beforeinstallprompt`-event'en (Chromium-baserte nettlesere + desktop Edge) tidlig i app-livssyklus så banner/knapp kan trigge native install-dialog senere.
  - `lib/pwa/detect.ts` — SSR-trygge plattform-helpers (`isStandalone`, `isIos`, `isIosSafari`, `isIosNonSafari`).
  - `hooks/useInstallPrompt.ts` — React-hook som returnerer `status` (`loading | standalone | native | ios-safari | ios-other | unsupported`) + `install()`-funksjon. Lytter på `appinstalled`-event for å flippe til standalone-state.
  - `components/pwa/InstallPromptCapture.tsx` — montert i root layout, fanger eventen og lagrer den i singletonen.
  - `components/pwa/InstallInstructionsModal.tsx` — modal med tre varianter: iOS Safari (3 nummerte trinn med Safari-del-ikon SVG), iOS non-Safari («bytt til Safari»), og unsupported (generisk fallback).
  - `components/pwa/InstallBanner.tsx` — banner øverst på `/` med champagne-aksent. Lukker via X (localStorage: `torny-install-banner-dismissed=1`). Skjules hvis allerede installert.
  - `components/pwa/InstallButton.tsx` — permanent kort i `/profile` (over «Mine data») så brukere kan re-summe install-flyten hvis de lukket banneret.
- **Plattform-flyt:**
  - **Android Chrome / desktop Chrome+Edge:** «Installer»-klikk trigger native install-dialog via `beforeinstallprompt.prompt()`.
  - **iOS Safari:** «Installer»-klikk åpner modal med trinn-for-trinn-instruksjoner.
  - **iOS Chrome/Firefox/Edge:** modal forklarer at brukeren må bytte til Safari for å installere.
  - **Allerede installert (standalone-mode):** banner + knapp skjules helt.

#### Removed

- **`components/IosInstallHint.tsx`** — gammelt fixed-bottom-banner som bare dekket iOS Safari med én linje instruksjon. Erstattet av det nye system'et som dekker Android + iOS + desktop og har bedre instruksjoner.

</details>

---

### [0.10.13] - 2026-05-14 · bug

> Defensiv sikkerhetsstramming: innloggede brukere kan ikke lenger SELECTe vilkårlige invitasjons-rader fra `public.invitations` — kun sine egne.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`invitations select by token using (true)`-policy droppet** (migrasjon `0020`) og erstattet med en smal policy `using (lower(email) = lower(auth.jwt() ->> 'email'))`. Den gamle policyen lot enhver innlogget bruker lese ALLE invitasjons-rader — app-laget filtrerte på token, men det var ikke RLS-enforced. Med magic-link-flyten retired (v0.4.0) har token-URL-er ikke vært relevant lenger.
- **Audit av kall-sites** før endring: alle `/admin/*`-paths går via `is_admin()`-gated «invitations admin write»-policy (FOR ALL); `app/invite/actions.ts` + `lib/invitations/quota.ts` bruker «invitations select own outgoing» (0008, filtrerer på `invited_by`); `app/profile/export/route.ts` bruker den nye «invitations select own incoming» (filtrerer på `email = auth.jwt()->>email`). Alle dekket.
- **Tester:** 180/180 grønne etter endring.

</details>

---

### [0.10.12] - 2026-05-14

> Ny «Min historikk»-side på profilen lar deg se alle dine fullførte runder med dato, brutto sum og snitt per hull.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/profile/historikk`** — Server Component som viser brukerens fullførte runder (`games.status = 'finished'`) sortert nyeste først. Per runde: spillnavn, tee-off-dato (norsk format), brutto sum, snitt per hull, og lenke til den spesifikke leaderboarden.
- **Lenke fra `/profile`** — ny «Historikk»-seksjon med en `Card` over «Mine data» med «Se runder»-knapp som peker til `/profile/historikk`.

#### Implementation notes

- **2 round-trips totalt:** først `game_players` med `games!inner`-filter på `status='finished'` for å hente alle relevante spill, deretter ett `scores`-kall med `.in('game_id', gameIds)` + `.eq('user_id', me)` for alle scores samtidig. Aggregering skjer in-process.
- **Empty state:** «Du har ingen fullførte runder ennå. Bli med på et spill først.»
- **Date-fallback:** bruker `scheduled_tee_off_at`, faller tilbake til `ended_at` hvis NULL, dropper rad hvis begge er NULL.

</details>

---

### [0.10.11] - 2026-05-14

> Admin kan nå endre e-postadressen til en registrert spiller, og se sist innlogget + antall spill på spiller-detaljen.

<details>
<summary>Teknisk</summary>

#### Added

- **`users.last_seen_at timestamptz`** — ny kolonne (migrasjon `0019`) med index. Stamps fra `proxy.ts`-middleware på hver autentiserte request, debounced via WHERE-clause så Postgres no-op'er hvis verdien er ferskere enn 30 minutter. Best-effort, fire-and-forget via `void (async () => ...)` — feiler aldri requesten.
- **«Aktivitet»-seksjon på `/admin/spillere/[id]`** — viser «Sist innlogget: {relativeTime}» og «Antall spill: N». Null `last_seen_at` rendres som «Aldri».
- **E-post-felt i edit-formen** på samme side. Validering: må være gyldig e-post-format. Sjekker konflikt mot både `public.users` (via `email_is_registered`-RPC) og `auth.users` (via `email_is_in_auth_users`-RPC fra v0.10.6). Block: nekter å oppdatere hvis spilleren er med i et aktivt spill.

#### Changed

- **E-post-oppdatering går via service-role-klient** (`auth.admin.updateUserById`) først; bare hvis det lykkes oppdateres `public.users.email` i samme transaksjon-pakke. Sikrer at de to tabellene ikke kommer ut av synk ved feil.

</details>

---

### [0.10.10] - 2026-05-14

> Du kan nå slette et spill helt fra admin — nyttig hvis du opprettet noe ved et uhell eller vil rydde opp etter en test.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `/admin/games/[id]/slett`** — dedikert bekreftelses-side (per destruktiv-handling-mønsteret) som viser spillets navn, tee-off, status og hvor mye som blir slettet (game_players, scores, invitasjoner). Block-betingelse: hvis `game.status === 'active'` vises et rødt banner — admin må avslutte spillet først.
- **Server-action `deleteGame`** i `app/admin/games/[id]/slett/actions.ts` — re-sjekker admin + block-betingelsen, deretter `DELETE FROM games` (FK ON DELETE CASCADE rydder game_players, scores og invitasjoner automatisk). På suksess: redirect til `/admin/games?status=deleted&name=<spillet>` med bekreftelses-banner.
- **«Faresone»-seksjon** nederst på `/admin/games/[id]` med rødtonet ramme + lenke til slett-flyten, samme mønster som `/admin/spillere/[id]`.

</details>

---

### [0.10.9] - 2026-05-14

> Admin ser nå om en ventende invitasjon faktisk har bedt om innloggings-kode, så du vet om mailen ble lest eller bare ligger der.

<details>
<summary>Teknisk</summary>

#### Added

- **`invitations.opened_at timestamptz`** — ny kolonne (migrasjon `0018`) som stamps når invitéen ber om en OTP-kode på `/login`. Default NULL.
- **Hook i `sendCode`-actionen** i `app/(auth)/login/actions.ts` — etter `signInWithOtp` lykkes, oppdaterer service-role-klient `invitations.opened_at = now()` for rader med matching `email` (case-insensitive) der `accepted_at IS NULL AND opened_at IS NULL`. Service-role brukes fordi brukeren er pre-auth på dette punktet og RLS ville blokkert. Best-effort: feil logges men blokkerer aldri OTP-sendingen.
- **Admin-indikator i `PendingInvitations.tsx`** — under hver «Venter»-rad: «Har bedt om kode {timeAgo}» i forest-grønn hvis `opened_at IS NOT NULL`, eller «Mail sendt, men ikke åpnet ennå» i muted grå hvis NULL. `timeAgo`-helper gir norsk relativ tid («akkurat nå», «3 min siden», «i går», «5 dager siden»).

</details>

---

### [0.10.8] - 2026-05-14

> To nye GDPR-kontroller på profil-siden: du kan laste ned alt Tørny vet om deg som en JSON-fil, og du kan slette kontoen din selv (med mindre du er med i et pågående spill).

<details>
<summary>Teknisk</summary>

#### Added

- **`/profile/export`** — ny Route Handler (`app/profile/export/route.ts`) som returnerer JSON-fil med dataene Tørny har lagret om innlogget bruker. Krever auth (returnerer 401 ellers). Filnavn `torny-data-YYYY-MM-DD.json`. Eksporten inkluderer brukerens egen `users`-rad, alle `game_players`-rader, scores der `user_id` ELLER `entered_by` matcher (kun deres egne scores — ikke medspillere/motstandere, slik GDPR Article 20 tilsier), og invitasjoner der `email` matcher eller `invited_by` matcher. UI-trigger: «Last ned»-knapp i ny «Mine data»-seksjon nederst på `/profile`.
- **`/profile/slett-konto`** — ny dedikert bekreftelses-side (`app/profile/slett-konto/page.tsx`) per destruktiv-handling-mønsteret. Viser hva som slettes (profil, e-post, turnerings-tilknytninger) og hva som beholdes (scoring-data — tilhører turneringen). Block-betingelse: hvis brukeren har `game_players`-rader i et spill med `status IN ('active', 'scheduled')` vises et rødt banner i stedet for slett-knappen — kontoen kan ikke slettes mens man er med i et pågående eller planlagt spill. Server-action (`app/profile/slett-konto/actions.ts`) re-sjekker block-betingelsen før den kaller `auth.admin.deleteUser(userId)` via service-role-klient. `public.users` cascade-slettes via FK. Bruker redirectes til `/login?melding=konto_slettet` etter slettingen.
- **«Mine data»-seksjon** på `/profile/page.tsx` med to kort (eksport + slett) under «Invitér en venn». Slett-kortet bruker `#a04040`-akcent for å signalisere faresone.

#### Fixed

- **Privacy: eksport-endepunktet returnerer ikke lenger medspillere/motstanderes scores.** Første utkast av export-route returnerte ALLE scores for ALLE spill brukeren var med i — det ville lekket andre spilleres personlige data via GDPR-endepunktet. Strammet `.in('game_id', gameIds)` til `.or('user_id.eq...,entered_by.eq...')` så kun brukerens egne scores eksporteres.

</details>

---

### [0.10.7] - 2026-05-14

> Du kan nå legge til opptil 7 tee-bokser per bane i admin (var 5).

<details>
<summary>Teknisk</summary>

#### Changed

- **`MAX_TEE_BOXES` bumpet fra 5 til 7** i `app/admin/courses/CourseForm.tsx`. Norske baner har ofte 5 farger (hvit, gul, blå, rød, gull) pluss eventuelt championship-tees for herrer og damer — totalt 7 dekker den vanlige normen. Ingen DB-constraints blokkerer (verifisert mot `0001_initial_schema.sql` — `tee_boxes` har bare value-range CHECKs på slope og par_total).

</details>

---

### [0.10.6] - 2026-05-14

> Vennsinvitasjoner blokkeres nå korrekt hvis mottakeren allerede har startet en innlogging hos Tørny, ikke bare hvis de har fullført profilen.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Friend-invite-gate i `app/invite/actions.ts`** sjekket bare `public.users` via `email_is_registered`-RPC-en. Brukere som var igjen i `auth.users` etter den retired magic-link-flyten (uten å fullføre `/complete-profile`) slapp gjennom — invitasjons-mailen ble sendt, og det påfølgende `signInWithOtp`-kallet overskrev deres `user_metadata.inviter_name`. Lagt til ny `email_is_in_auth_users(text)`-RPC som sjekker `auth.users` direkte, og gate-en kjører nå begge RPC-ene parallelt i `Promise.all`. Hvis enten returnerer true, blokkeres invitasjonen med samme «Denne personen er allerede på Tørny»-melding.

#### Added

- **Migrasjon `0017_email_in_auth_users_rpc.sql`** — ny SECURITY DEFINER-funksjon `public.email_is_in_auth_users(email_to_check text)` som returnerer bool. Eksplisitt `search_path = public, auth, pg_catalog` for å unngå search-path-injection. GRANT EXECUTE til anon + authenticated for defensiv symmetri med `email_is_invited`. Applied til prod via Supabase MCP.

</details>

---

### [0.10.5] - 2026-05-14 · bug

> Kontakt-lenken på personvern-siden går nå til en faktisk e-postadresse (`personvern@tornygolf.no`) i stedet for en admin-bare side spilleren ikke kunne nå.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Kontakt-seksjonen på `app/legal/privacy/page.tsx`** pekte til `https://tornygolf.no/admin/spillere`, som er auth-gated til admin-brukere. En vanlig spiller som klikket for å utøve GDPR-rettighetene sine endte på en innloggingsvegg de ikke kom forbi. Erstattet med `mailto:personvern@tornygolf.no`. Domeneshop-aliaset må settes opp manuelt for at adressen skal motta mail.

</details>

---

### [0.10.4] - 2026-05-14

> Ny personvern-side på `/legal/privacy` forklarer hvilke data Tørny lagrer om deg, hvor de lagres, og hvilke rettigheter du har.

<details>
<summary>Teknisk</summary>

#### Added

- **Ny rute `app/legal/privacy/page.tsx`** — server-rendret Server Component, ingen auth-gate (offentlig tilgjengelig). Bruker eksisterende `AppShell` + `PageHeader` + `BackLink`-primitives. Norske bokmål-tekst, Fraunces serif for h1/h2 og Inter sans for body. Dekker: (1) hvilke data Tørny lagrer (navn, e-post, kallenavn, handicap, scorekort, invitasjoner), (2) hvor de lagres (Supabase EU/Frankfurt), (3) hvem som ser dem (medspillere ser navn/kallenavn/handicap/resultater, admin ser e-post), (4) hvor lenge (inntil sletting), (5) GDPR-rettigheter (innsyn, retting, sletting, portabilitet), (6) kontakt-info.
- **`export const metadata`** setter `<title>`-tag for siden.

</details>

---

### [0.10.3] - 2026-05-14

> Hvis admin-handlinger feiler på å lese spillerlisten fra databasen, sier banneret nå «Klarte ikke å lese» i stedet for misvisende «Klarte ikke å lagre».

<details>
<summary>Teknisk</summary>

#### Fixed

- **Splittet `db_players`-feilkoden i to.** Tidligere brukte alle databasefeil i admin/games-flyten samme `db_players`-key, så bruker så «Klarte ikke å lagre spillerne. Prøv igjen.» selv når det egentlige problemet var en SELECT-feil på roster. Innført ny `db_roster: 'Klarte ikke å lese spillerlisten fra databasen.'`-key som emit-es fra read-paths i tre server-actions: `app/admin/games/new/actions.ts` (publish-mode roster read), `app/admin/games/[id]/edit/actions.ts` (publish/update_scheduled roster read), og `app/admin/games/[id]/actions.ts` (start-game gamePlayers + roster reads). Write-paths (INSERT/UPDATE/DELETE på `game_players`) beholder `db_players`-meldingen.

#### Changed

- **Konsolidert duplisert `ERROR_MESSAGES` og `buildErrorMessage`-helper.** Tre admin/games-sider (`new/page.tsx`, `[id]/edit/page.tsx`, `[id]/page.tsx`) deklarerte hver sin egen kopi av samme error-message-objekt og helper. Trukket ut til `lib/admin/gameErrorMessages.ts` med to eksporterte map-er: `ERROR_MESSAGES_NEW_GAME` (brukt av new + edit, sier «kan publiseres») og `ERROR_MESSAGES_EXISTING_GAME` (brukt av detail-siden, sier «kan startes»). JSDoc dokumenterer denne kopi-variasjonen så fremtidig refaktor ikke uniformerer den ved et uhell.

</details>

---

### [0.10.2] - 2026-05-13

> SyncBanner viser nå norsk, lesbar forklaring («Mistet nett-tilkoblingen», «Innloggingen er utløpt») i stedet for tekniske Safari-feilmeldinger som «TypeError: Load failed».

<details>
<summary>Teknisk</summary>

#### Changed

- **`SyncBanner` — friendly error-mapping.** Raw `lastError` fra Supabase RPC mappes nå til norsk forklaring spilleren kan forstå og handle på:
  - `Load failed` / `Failed to fetch` / `NetworkError` → «Mistet nett-tilkoblingen»
  - `JWT` / `expired` / `session` / `401` / `unauthorized` → «Innloggingen er utløpt — logg inn på nytt»
  - `permission` / `forbidden` / `row-level` / `403` → «Tillatelse manglet»
  - `rate limit` / `429` / `too many` → «For mange forespørsler — vent litt»
  - Catch-all: «Lagring mislyktes»
- **Banneret går fra to-linjet (heading + raw-error subtext) til én-linjet** («Mistet nett-tilkoblingen. N slag venter.»). Renere på smale skjermer, ingen jargon.
- **Raw error bevares som `title`-attribute** på banner-elementet — admin kan long-press/hover for å se den eksakte underliggende meldingen til feilsøking, men spilleren ser ikke jargon-en før de eksplisitt graver i den.

</details>

---

### [0.10.1] - 2026-05-13

> Du får nå en mail hver gang en spiller leverer scorekortet sitt — du slipper å åpne appen for å sjekke om det er noe å godkjenne.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/scorecardSubmittedNotification.ts`** — Resend-mail-helper med samme brand-stil som de andre mail-malene. Subject: `Scorekort levert: <playerName> — <gameName>`. CTA-button til `https://tornygolf.no/admin/games/<id>`.
- **`submitScorecard`-action** ([app/games/[id]/submit/actions.ts](app/games/[id]/submit/actions.ts)) fyrer mail til alle admin-brukere etter at submit-update lykkes. Henter submitter's navn + admin-emails i parallell (Promise.all) etter DB-update, filtrer ut submitter selv (slik at en player-admin ikke mailer seg selv), og sender via Promise.allSettled. Feil logges, blokkerer aldri.

#### Changed

- **Initial game-fetch i `submitScorecard`** inkluderer nå `name`-feltet (trengs som mail-subject).

</details>

---

### [0.10.0] - 2026-05-13

> Når du avslutter et spill får alle spillerne automatisk en mail med «Resultatet er klart» og lenke til leaderboard — du trenger ikke lenger sende beskjeden manuelt.

<details>
<summary>Teknisk</summary>

#### Added

- **`lib/mail/gameFinishedNotification.ts`** — ny Resend-mail-helper med brand-stilet HTML + plaintext-fallback. Subject: `Resultatet er klart — <gameName>`. Body: «Hei <fornavn>!» + kort hook + grønn CTA-button til `https://tornygolf.no/games/<id>/leaderboard`. Bruker samme palette + struktur som `inviteNotification.ts`.
- **`endGame`-action** ([app/admin/games/[id]/actions.ts](app/admin/games/[id]/actions.ts)) sender nå mail til alle spillere etter status-flippen til `finished`. Henter spillerne sammen med de eksisterende `submitted_at` / `approved_at`-validerings-queriene (én query, ikke to), filtrer på `users.email` ikke-tom, og fyrer `Promise.allSettled` over alle send-kall. Feil logges til Vercel via `console.error` og blokkerer aldri actionen — leaderboard er nådd in-app uavhengig av om mailen kom fram.

#### Changed

- **Initial game-fetch i `endGame`** inkluderer nå `name`-feltet (trengs som subject + body i mailen). Marginal data-overhead, sparer en re-fetch.

</details>
</details>


<details>
<summary><strong>0.9.x — Sync-feedback under runden (5 oppføringer)</strong></summary>

Hvis et slag ikke kommer fram til serveren, sier appen ifra. Ny sticky banner viser hvor mange slag som mangler synk, surface'r faktiske feilmeldinger fra Supabase, og lar deg manuelt prøve igjen — i stedet for at sync-køen stille henger i bakgrunnen. Pilot-polish underveis: scorekort wiper ikke lenger settet score hvis du tilfeldigvis trykker på det igjen.

### [0.9.4] - 2026-05-13

> Game-hjem-sidens to gate-queries kjører nå parallelt, og audit av leaderboard/submit/scorecard bekrefter at de allerede gjorde det.

<details>
<summary>Teknisk</summary>

#### Changed

- **`app/games/[id]/page.tsx` — game + me i Promise.all.** Sekvensiell awaits (`game` deretter `me`) er nå én parallel-bølge. Sparer én Supabase round-trip per load. Side-en treffes på app-åpning, fra hjem-tile, fra hver «Hjem»-tap fra hull-pages, og fra leaderboard/submit-tilbakeknappen — ofte. Estimert ~200ms spart per load.
- **Pilot-instrumentering** lagt til samme sted (`game.page game=X · gate`), parallel med hole-page-instrumenteringen.

#### Audit

- **`app/games/[id]/leaderboard/page.tsx`** — allerede parallel (Promise.all på game + profile, deretter Promise.all på players + holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/submit/page.tsx`** — allerede parallel (Promise.all på game + me, deretter Promise.all på holes + scores i suspended body). Ingen endring trengs.
- **`app/games/[id]/scorecard/page.tsx`** — allerede parallel (Promise.all på game + me). Ingen endring trengs.

</details>

---

### [0.9.3] - 2026-05-13

> Hull-bytte er ~60% raskere — server-rundene som tidligere kjørte sekvensielt går nå parallelt, og to av dem er slått sammen til én.

<details>
<summary>Teknisk</summary>

#### Changed

- **Hull-page server-fetch-grafen refaktorert fra 7 sekvensielle awaits til 2 parallel-bølger.** Måling på production via instrumentering fra v0.9.2 viste at hver hull-bytte kostet 1.2–2.1s server-side med median fetch ~150–200ms og outliers opp i 800ms+ (Supabase round-trip-overhead, ikke query-kompleksitet). Nye struktur ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)):
  - **Runde 1 (Promise.all):** `games`, ALL `game_players` for spillet (med users-join), `scoreCount`. Tre uavhengige queries fyres samtidig — max-tid er den tregeste enkelt-queryen i stedet for summen.
  - **In-memory:** finn `me` blant alle game_players, derive flight ved å filtrere `flight_number === me.flight_number`. Dette fjerner én helt round-trip (tidligere kjørte vi en separat `me`-query, deretter en flight-query med WHERE flight_number=X).
  - **Runde 2 (Promise.all):** `course_holes` for gjeldende hull + `scores` for flight-medlemmer på gjeldende hull. Begge avhenger av runde 1 men er uavhengige av hverandre.
- **Estimert speedup:** fra ~1.5s gjennomsnitt til ~600ms (–60%). Trade-off: allGamePlayers-queryen returnerer 8 rader i stedet for 4 fra den gamle flight-queryen — marginal data-overhead, men én round-trip spart. RLS er upåvirket: brukere ser fortsatt kun det `game_players`-policy-en allerede tillater.
- **Instrumentering oppdatert:** logger nå `round1`, `round2` og total i stedet for syv enkelt-fetches. Verifiserer at parallellisering faktisk skjer i prod.

</details>

---

### [0.9.2] - 2026-05-13

> Skjermlesere identifiserer nå ventende invitéer korrekt i opprett-spill-flyten, og lange e-postadresser dytter ikke lenger «Venter»-pillen ut av synsfeltet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **A11y på `/admin/games/new` spiller-picker.** Checkboxen får nå `aria-label={`${playerLabel(p)}${p.pending ? ' — venter på å fullføre profil' : ''}`}` slik at skjermlesere annonserer status semantisk koblet til raden i stedet for å rapportere «Venter»-pillen som flytende tekst etter check-boxen. Pillen får `aria-hidden="true"` for å unngå dobbel-annonsering.
- **Truncation på `/admin/games/new` spiller-picker label-spannet.** La til `min-w-0 truncate` så patologisk lange e-postadresser (over container-bredde) klippes med ellipsis i stedet for å dytte «Venter»-pillen ut av viewportet på smale skjermer (iPhone SE 320px).

#### Changed

- **Server-side timing instrumentering på hull-siden** ([app/games/[id]/holes/[holeNumber]/page.tsx](app/games/[id]/holes/[holeNumber]/page.tsx)). `console.time/timeEnd` rundt hver av de syv server-side awaitsene (auth, game, me, hole, flight, scores, scoreCount) + en total-wrapper, med label-prefix `hole.page game=X hole=N · <step>`. Loggene fanges av Vercel og kan pulles etter pilot-runden for å bestemme om hull-bytte-latency dominans er på Supabase-runden, RSC-serialisering, eller cold-start. Ingen brukerflate-effekt — kun observasjon. Fjernes (eller gates bak dev-flag) når arkitektur-valget i TODO.md er gjort.

</details>

---

### [0.9.1] - 2026-05-13 · bug

> Et score du har justert med + eller − blir ikke lenger nullstilt til par hvis du tilfeldigvis trykker på kortet igjen — og onboarding-banneret beskriver knappene som faktisk finnes.

<details>
<summary>Teknisk</summary>

#### Fixed

- **`ScoreCard.onCardClick` no-op'er når score allerede er satt.** Tidligere kalte tap-på-kort-body alltid `onSetScore(par)` uansett current score, så et tilfeldig touch-event etter at brukeren hadde brukt + / − wipet justeringen tilbake til par. Card-tap er nå en first-entry-snarvei kun: hvis `score == null` setter den par som baseline, ellers er kortet en no-op-flate. +/− og «…» er fortsatt full-spektrum-redigerings-overflater. Ny test (`ScoreCard.test.tsx`) verifiserer at tap når `score` er satt ikke kaller `onSetScore`.
- **Onboarding-banner-copy speiler virkeligheten.** Tidligere tekst: «Klikk det øverste kortet for å sette par. Klikk-og-dra opp eller ned for +1/−1.» — men klikk-og-dra finnes ikke i koden (kun + / − / ⋯-knapper). Ny tekst: «Trykk det øverste kortet for å sette par. Bruk + og − for å justere.»

</details>

---

### [0.9.0] - 2026-05-13

> Hvis et slag ikke kommer fram til serveren, sier appen ifra — og du kan trykke «Prøv igjen» i stedet for å lure på om scoren ble lagret.

<details>
<summary>Teknisk</summary>

#### Added

- **`SyncBanner`-komponent ([components/sync/SyncBanner.tsx](components/sync/SyncBanner.tsx))** mounted i `app/games/[id]/layout.tsx`. Sticky-top på alle game-sider (hull, leaderboard, submit, approve, scorecard, venterom). Observerer `localDb.syncQueue` via `useLiveQuery` og rendrer kun når køen har items som enten har hatt minst ett feilet forsøk (`attemptCount > 0` eller `lastError != null`) ELLER har stått i køen > 30 sekunder. Inneholder «Prøv igjen»-knapp som kaller `drainQueue()` direkte — bruker eksisterende sync-listener-disiplin, krever ingen RLS- eller migrasjonsendringer.
- **Bruker-synlig feilmelding** når Supabase RPC `upsert_score_if_newer` feiler. Banneret ekstraherer `lastError`-feltet fra første queue-item med feil og viser det som sekundær-tekst under tagline-en (eks. «Failed to fetch» ved offline, «JWT expired» ved utløpt session). Hjelper Jørgen feilsøke under pilot uten å åpne devtools.
- **«X slag venter på lagring»**-banner med 30-sekunders threshold. Internal `setInterval(1000)`-tick reaktiv-evaluerer alder på eldste queue-item slik at banneret dukker opp uten å vente på neste sync-drain.

#### Changed

- **Retry-knapp**: minimum 500ms feedback-tid via `Promise.all([drainQueue(), sleep(500)])` så «Sender…»-state ikke flasher forbi når retry blir no-op'et av `inFlight`-guarden i syncWorker. Brukeren får visuell bekreftelse på at klikket ble registrert.

</details>
</details>


<details>
<summary><strong>0.8.x — Sletting og «trekk tilbake»-flyt (27 oppføringer)</strong></summary>

Dedikert slett-side for spillere, fulgt av tre iterasjoner på «trekk tilbake»-bekreftelsen for å få den robust på iPhone-PWA. Pilot-polish på topp: tydeligere tekst utendørs i sol.

### [0.8.5] - 2026-05-13

> Hull-nummer og sekundær-tekst er nå tydeligere å lese på telefon utendørs — viktig før pilot-runden.

<details>
<summary>Teknisk</summary>

#### Changed

- **Bumpet `--text-muted` (#5C5347 → #4A3F30)** i light mode. Token brukes av tournament-name i hull-headeren, sync-status-linja, score-kort-helpere og ~20 admin-kickers — alle får en touch mer kontrast mot linen-bg (#F8F6F0). Hierarkiet bevares (#4A3F30 er fortsatt klart sekundært mot #1A2E1F text), men perseptuell vekt øker nok til at uppercase-tight-labels og 10–12px sekundær-tekst leses bedre i direkte sollys. Dark mode-tokenet er urørt.
- **`HoleStrip` future-state nummer: font-weight 500 → 600.** Hull som ikke er spilt enda (typisk 17 av 18 ved runde-start) hadde tynne 13px serif-tall som forsvant i sol. Bumpen fra 500 → 600 sharpenser nummer-rendering uten å endre farge eller hierarki — current og completed er fortsatt visuelt distinkte.

</details>

---

### [0.8.4] - 2026-05-13 · bug

> Du kan nå trekke tilbake en invitasjon fra iPhone uten at knappene oppfører seg rart.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-flyten fungerer nå på iPhone-PWA.** Forrige fix (v0.8.3) erstattet `<details>`-popouten med en URL-toggle inline (Bekreft + Avbryt på samme rad), men brukeren rapporterte at Bekreft-knappen ikke var trykkbar på iPhone, og at Avbryt-knappen i stedet utløste tilbaketrekkingen — antagelig på grunn av en kollisjon mellom server-action form-submit og SmartLink-prefetch på samme touch-event. Bytter nå til samme mønster som slett-bruker (`/admin/spillere/[id]/slett`): «Trekk tilbake»-lenken navigerer til en dedikert bekreftelses-side på `/admin/spillere/invitations/[id]/trekk-tilbake/` med stor Bekreft-knapp og separat Avbryt-lenke. Ingen knapper deler tap-target, ingen flyktige toggle-tilstander.

</details>

---

### [0.8.3] - 2026-05-13 · bug

> Forsøk på å fikse «trekk tilbake»-bekreftelsen for iPhone — viste seg å ikke fungere helt, og ble erstattet av løsningen i 0.8.4.

<details>
<summary>Teknisk</summary>

#### Fixed

- **«Trekk tilbake»-bekreftelsen fungerte ikke på iPhone-PWA.** Den brukte `<details>`/`<summary>` for inline-popout, men iOS Safari håndterer tap-events inni open-state-popouten upålitelig (tap kan boble til summary og lukke popouten før Bekreft-knappen registrerer klikket). I tillegg ble popouten klippet av kortets `overflow-hidden`, og kunne overlappe nabo-radens knapper slik at et klikk for «Bekreft» traff «Send på nytt» på raden under. Erstattet med en server-rendret URL-toggle: trykk på «Trekk tilbake» legger til `?confirm=<id>` i URL-en, og den raden rendres i confirm-modus inline med tydelige Bekreft + Avbryt-knapper. Ingen JS, ingen popout-quirks, fungerer likt på alle nettlesere og PWA-shells.

</details>

---

### [0.8.2] - 2026-05-13 · bug

> Ventende invitéer dukker ikke lenger opp dobbelt i admin-spillerlista, og «trekk tilbake» frigjør e-postadressen som forventet.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Spillerliste på `/admin/spillere` viser ikke lenger ventende invitéer dobbelt.** Etter at migrasjon `0014_pending_users` begynte å auto-opprette `public.users`-rader for hver `auth.users`, dukket ventende invitéer (de uten `profile_completed_at`) opp som «registrerte spillere» i tillegg til å være i ventende-invitasjoner-seksjonen. Spillerlista filtrerer nå på `profile_completed_at IS NOT NULL`, og «X registrert»-tellingen matcher.
- **«Trekk tilbake»-orphan-cleanup tilpasset trigger-baserte `public.users`-rader.** Sjekken var «hvis `public.users`-raden mangler, slett `auth.users`» — men siden trigger nå alltid oppretter raden, ble den sjekken alltid usann. Logikken bruker nå `profile_completed_at IS NULL` som signal på «invitéen fullførte aldri profil», så `auth.users` ryddes som forventet.
- **Null-safe visning av navn** på spiller-detalj og slett-bekreftelses-sider — invitéer uten utfylt navn vises med e-postadressen i stedet for en tom overskrift.

</details>

---

### [0.8.1] - 2026-05-13 · bug

> Hvis sletting av en spiller mislykkes, sier appen nå hvorfor — i stedet for å se ut som om ingenting skjedde.

<details>
<summary>Teknisk</summary>

#### Fixed

- **Silent banner-feil ved feilet sletting.** Detalj-siden (`/admin/spillere/[id]`) viste ingen tilbakemelding når slett-flyten feilet eller ble blokkert av self-protect — den manglet meldinger for `self_delete_forbidden`, `still_has_games` og `auth_delete_failed` i sin `ERROR_MESSAGES`-tabell. Nå viser banneret en ærlig forklaring i alle tre tilfeller, inkludert hint om mulige FK-grunner («data knyttet til seg — invitasjoner sendt, baner opprettet eller scores skrevet»).
- **Ærligere kode-kommentar om FK-cascade-grensene** i `deleteUser`-action: dokumenterer at `public.users`-cascaden kun cleaner opp én rad, og at andre FK-er (`scores.entered_by`, `invitations.invited_by` osv.) er trygt dekket i dagens admin-modell men må sjekkes eksplisitt når arrangør-rollen lander.

</details>

---

### [0.8.0] - 2026-05-13

> Du kan slette en spiller fra admin — nyttig hvis du sendte invitasjon til feil e-postadresse.

<details>
<summary>Teknisk</summary>

#### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.

</details>
</details>

<details>
<summary><strong>0.7.x — Bruker-detalj-redigering (1 oppføring)</strong></summary>

Klikk på en spiller i admin for å redigere navn, kallenavn og handicap. Faresone-seksjon på detalj-siden forbereder slett-flyten som lander i 0.8.0.

### [0.7.0] - 2026-05-13

> Klikk på en spiller i admin for å redigere navn, kallenavn og handicap-indeks.

#### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

#### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad). Migrasjonen heter `0015_admin_user_management` (filnavn-kollisjon med `0014_pending_users` ble rensket opp ved merge).
</details>


<details>
<summary><strong>0.6.x — Samlet spilleradministrasjon (1 oppføring)</strong></summary>

Erstatter den gamle `/admin/invitations`-flata med `/admin/spillere`, som samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted og legger til «Send på nytt» og «Trekk tilbake»-actions.

### [0.6.0] - 2026-05-13

> Ny «Spillere»-side i admin samler registrerte spillere, ventende invitasjoner og invitasjons-form på ett sted, og du kan re-sende eller trekke tilbake invitasjoner derfra.

#### Added

- **Ny samlet spilleradministrasjon på `/admin/spillere`.** Erstatter gamle `/admin/invitations`. Tre seksjoner i én flate: registrerte spillere (med søk på navn/kallenavn/e-post), ventende invitasjoner, og en sammenfoldet «Inviter ny spiller»-form nederst.
- **«Send på nytt»-knapp på ventende invitasjoner.** Trigger ny notifikasjons-mail via Resend til samme adresse. Ingen ny DB-rad.
- **«Trekk tilbake»-knapp på ventende invitasjoner** med inline to-trinn-bekreft. Sletter `invitations`-raden; hvis invitéen hadde bedt om kode men aldri fullført profil (`profile_completed_at IS NULL`), ryddes også `auth.users`-raden via service-role slik at e-posten er ledig igjen.

#### Changed

- **Admin-hjemmeside-tile «Invitasjoner» erstattet av «Spillere»** med kombinert telling («12 registrert · 4 venter»).
- **Lenker fra «Opprett spill» og «Rediger spill»** når man trenger flere spillere peker nå til `/admin/spillere` i stedet for `/admin/invitations`.

#### Removed

- **Rute `/admin/invitations`** — funksjonaliteten finnes nå på `/admin/spillere`.
</details>


<details>
<summary><strong>0.5.x — Pending-invitees-integrasjon (11 oppføringer)</strong></summary>

Ventende invitéer kan nå velges til lag og flight før de selv har logget inn. Ti patch-bumps fulgte for å rydde fallouten fra migrasjon 0014, som auto-oppretter `public.users`-rader for hver `auth.users` og som dermed brøt onboarding-gate, picker-filter, draft-validering og start-spill-guard.

### [0.5.10] - 2026-05-13 · bug

> «Akseptert»-statusen på en invitasjon stemmer nå med om spilleren faktisk har fullført profilen sin.

#### Fixed
- `Akseptert`-pille på `/admin/invitations` reflekterer nå faktisk onboarding (`profile_completed_at IS NOT NULL`), ikke bare at invitasjons-raden ble markert akseptert ved OTP-verify. Stoppet misvisende «Akseptert»-status for brukere som klikket gammel magic-link-mail uten å fullføre profil.

### [0.5.9] - 2026-05-13 · bug

> Beskytter mot at en bruker blir hengende som «Venter» selv etter at de har lagret profilen sin.

#### Fixed
- Profil-oppdateringen stamper nå `profile_completed_at` som defence-in-depth, så en bruker som havner på `/profile` uten å ha fullført onboarding (deploy-vindu-race i tidligere release) blir ikke sittende fast som «Venter» i picker-en.

### [0.5.8] - 2026-05-13 · bug

> Du kan ikke starte et planlagt spill hvis noen av deltakerne fortsatt mangler å fullføre profilen.

#### Fixed
- «Start spillet» (draft → aktiv) blokkeres nå hvis ikke alle valgte spillere har fullført profil — samme guard som scheduled-pathen.
- Invitér-en-venn-actionen sjekker `profile_completed_at` i stedet for "rad finnes ikke" som ble dødt etter migrasjon 0014.

### [0.5.7] - 2026-05-13 · bug

> Ventende invitéer uten utfylt navn vises med e-postadressen i stedet for tom plass.

#### Fixed
- Rendring av ventende invitéer (uten utfylt navn) faller tilbake til e-postadressen i stedet for å vise tom tekst — gjelder admins spill-detaljside (lag/flight-oversikt) og spillernes venterom-visning av draft-spill.

### [0.5.6] - 2026-05-13 · bug

> Nye brukere sendes igjen til onboarding-skjermen ved første innlogging.

#### Fixed
- Nye brukere ble ikke sendt til onboarding på `/` og `/profile` etter at trigger-en fra migrasjon 0014 begynte å pre-opprette `public.users`-rader. Gate-en sjekker nå `profile_completed_at` i stedet for "rad finnes ikke".

### [0.5.5] - 2026-05-13 · bug

> Førstegangs-onboarding fungerer igjen for nye brukere — var midlertidig brutt etter en bakgrunnsendring.

#### Fixed
- `complete-profile` oppdaterer nå den auto-opprettede `public.users`-raden i stedet for å forsøke å sette inn på nytt. Uten denne ville migrasjon 0014 brutt all ny brukerregistrering.

### [0.5.4] - 2026-05-13 · bug

> Feilmeldingen for ventende spillere på opprett-spill-siden viser nå e-postadressene i stedet for «{LIST}».

#### Fixed
- Feilmelding for ventende spillere viste `{LIST}`-plassholderen bokstavelig på opprett-spill-siden. Bruker nå samme `buildErrorMessage`-helper som rediger-spill og spill-detalj.

### [0.5.3] - 2026-05-13 · bug

> Ekstra sikkerhets-sjekk: et publisert spill kan ikke startes med ventende spillere selv om databasen blir manuelt redigert.

#### Fixed
- Start spill blokkeres også (defence-in-depth) hvis et publisert spill noensinne skulle få ventende spillere via direkte DB-redigering.

### [0.5.2] - 2026-05-13 · bug

> Du kan ikke endre et eksisterende spill til publisert hvis det fortsatt har ventende invitéer.

#### Fixed
- Publisering/oppdatering fra rediger-spill blokkeres med tydelig e-postliste hvis ventende invitasjoner står på rosteret.

### [0.5.1] - 2026-05-13 · bug

> Du kan ikke publisere et nytt spill hvis noen av deltakerne ikke har fullført profilen sin.

#### Fixed
- Publisering av nytt spill blokkeres nå hvis ikke alle valgte spillere har fullført profil.

### [0.5.0] - 2026-05-13

> Du kan nå velge ventende invitéer til lag og flight før de selv har logget inn.

#### Added
- Inviterte spillere som ikke har logget inn ennå dukker opp i game-picker-en med en gul `Venter`-pille. Admin kan velge dem til lag og flight og lagre utkast.
</details>


<details>
<summary><strong>0.4.x — OTP-kode-innlogging (4 oppføringer)</strong></summary>

Bytte fra magic-link til 6–8-sifret kode i mail, som fjernet to iOS-PWA-blokkerings-bugs samtidig. Inkluderer ærligere admin-invitasjons-banner ved Resend-feil og forberedelse for pending-invitees-sporing i 0.5.x.

### [0.4.3] - 2026-05-13

> Tørny vet nå hvilke spillere som har fullført profilen — forberedelse for å vise ventende invitéer riktig i spill-pickeren.

#### Added

- Inviterte spillere som ikke har fullført registrering blir nå sporet via `profile_completed_at`. Forberedelse for å vise dem i game-picker-en.

### [0.4.2] - 2026-05-13 · bug

> Hvis «Du er invitert»-mailen ikke kommer fram, sier admin-banneret det ærlig i stedet for å lyve «Invitasjon sendt».

#### Fixed

- **Admin-invitasjons-banneret lyver ikke lenger om mail-utsending.** Tidligere viste `/admin/invitations` alltid «✓ Invitasjon sendt»-banner etter at raden var lagret, selv om Resend-utsendingen faktisk feilet — feilen ble bare stille logget i Vercel-runtime-loggene. Hvis Resend kaster nå, vises et ærlig feil-banner: «Invitasjonen ble lagret, men «Du er invitert»-mail kom ikke ut. Sjekk Vercel-loggene for detaljer.» Raden i `invitations`-tabellen bevares fortsatt (admin kan re-sende manuelt når mail-konfigen er fikset).

### [0.4.1] - 2026-05-13 · bug

> Innloggings-kode-feltet godtar nå 8-sifrede koder, som er Supabase' faktiske standard.

#### Fixed

- **Kode-input godtar nå 6–8 sifre, ikke bare 6.** Supabase' default OTP-lengde er 8 sifre (endret i mai 2024) — vi hardkodet 6 sifre i kode-feltet, så brukere som fikk en 8-sifret kode kunne kun skrive inn de første 6 og fikk feilmelding. Pattern og maxLength er nå fleksible, hjelpe-tekst sier «kode» i stedet for «6-sifret kode».

### [0.4.0] - 2026-05-13

> Du logger inn med en 6–8-sifret kode du taster inn, i stedet for å klikke en lenke i mailen. Inviterte spillere får først en notifikasjons-mail og må be om innloggings-kode selv etterpå.

#### Changed

- **Innlogging går nå via 6-sifret kode i mail i stedet for å klikke lenke.** Du skriver inn e-post som før, men i stedet for å klikke en lenke i mailen mottar du en kode (f.eks. `482 619`) som du taster inn på samme side. Fjerner to pre-existing problemer som blokkerte PWA-innlogging på iPhone: (a) magic-link åpnet seg i Safari i stedet for PWA-en og brøt PKCE-handoff-en, (b) mail-scannere konsumerte engangs-token-en før brukeren faktisk klikket. Begge problemene forsvinner når det ikke finnes noen URL å konsumere — bare en kode som leses med øynene og tastes inn.
- **Invitasjons-mailen er ny.** Når admin inviterer en kompis sender Tørny nå en kort notifikasjons-mail («Du er invitert. Gå til tornygolf.no og logg inn med din e-post.») via Resend. Selve innloggings-koden får invitéen først når de kommer til /login og taster e-posten sin der. To mailer per invitasjon (notifikasjon + kode), men én og samme innloggings-flyt for alle.

#### Removed

- **Magic-link-URL-flyten.** `/auth/callback`-route-en redirecter alle gamle klikk til `/login?error=link_expired` i en 30-dagers overgangsperiode. Etter 2026-06-13 fjernes route-en helt (tracked in TODO.md).
</details>


<details>
<summary><strong>0.3.x — Logo og pre-OTP-fixes (4 oppføringer)</strong></summary>

Tørny fikk sin egen visuelle identitet (wordmark med champagne-prikk på login og app-ikoner), pluss tre fixes som ryddet opp før OTP-omleggingen: invitasjoner som sto som «VENTER» etter aksept, tee-off-tider som lå 1–2 timer feil, og «lagre utkast» som låste seg på native HTML5-validering.

### [0.3.3] - 2026-05-13 · bug

> Invitasjoner flippes nå korrekt til «Akseptert» når mottakeren logger inn første gang — før dette sto alle som «Venter» uansett.

#### Fixed

- **Invitasjoner sto som «VENTER» selv etter aksept.** Hele tabellen `public.invitations` hadde `accepted_at = NULL` på alle 8 rader — ingen kode skrev til kolonnen noensinne. Auth-callback (`app/auth/callback/route.ts`) markerer nå alle ventende invitasjoner for innlogget brukers e-post som akseptert etter vellykket `exchangeCodeForSession`. Best-effort: feil i side-effekten blokkerer aldri innloggingen. Ny RLS-policy (`migration 0012`) lar bruker UPDATEe sin egen invitasjon — kun `accepted_at`-flippen er tillatt, alle andre kolonner må forbli identiske. Backfill kjørt mot 4 stranded rader som hadde `auth.users.confirmed_at` satt.

### [0.3.2] - 2026-05-13 · bug

> Tee-off-tider viser nå riktig tid på alle skjermer — var av med 1–2 timer i et kort vindu rett etter sideinnlasting.

#### Fixed

- **Tee-off-tider rendret 1–2 timer feil under hydration.** `lib/format/teeOff.ts` brukte lokal-TZ `Date.getHours/getMinutes/getDate/getMonth` — på Vercel-serveren (UTC) ga det feil tid i HTML-en før hydration på iPhone (Europe/Oslo) tok over. Rammet hjem-skjermen, runde-siden og leaderboarden. Bytter til `Intl.DateTimeFormat` med eksplisitt `timeZone: 'Europe/Oslo'`, så server og klient nå renderer identiske strenger uavhengig av host-TZ. DST håndteres riktig (UTC → Oslo sommer +02, vinter +01). 11 nye tester verifiserer oppførselen under flere host-TZ-er.

### [0.3.1] - 2026-05-13 · bug

> Du kan lagre et halvferdig spill-utkast uten at bane- og handicap-feltene må fylles ut først.

#### Fixed

- **«Lagre utkast» låste seg på native HTML5-validering.** Knappen blokkerte sending så snart et `<select required>`-felt (bane/tee/handicap-allowance) var tomt, selv om hele poenget med utkast er å lagre delvis utfylt skjema. Lagt til `formNoValidate` på utkast-knappen — publiser-knappen validerer fortsatt normalt, og server-siden tar fortsatt vare på `name` som eneste obligatoriske felt for utkast.

### [0.3.0] - 2026-05-13

> Tørny har fått sin egen logo — wordmark med champagne-prikk på login-skjermen og som app-ikon.

#### Changed

- **Visuell identitet — Tørny-logoen.** Login-skjermen viser nå hovedlogoen (wordmark «Tørny» + champagne-prikk + tagline *«Fyr opp golfturneringen på et par minutter»*) over innloggings-kortet, sentrert på linen-bakgrunnen. Den ekstra T-flisen og den dekorative medallion-en er fjernet — de duplikerte logoen og bråket mot brand-mark.svg-spec-en.
- **BrandMark-låsen i øverste venstre hjørne** (hjem, profil, admin) er strippet til kun wordmark «Tørny» med en liten champagne-prikk. Den mørke T-flisen og «TURNERING»-undertittelen er fjernet.
- **Tagline-formuleringen** *«Fyr opp golfturneringen på et par minutter»* (med wordplay-«par») er nå canonical i `CLAUDE.md`. Tidligere kortform uten «et par» er erstattet.

#### Added

- **App-ikoner (192×192, 512×512, 180×180)** og `brand-mark-icon-only.svg` har fått en champagne-prikk til høyre for T-en, slik at hjemskjerm-ikonet på iOS/Android og favicon-en bærer samme brand-aksent som logoen i appen.

#### Removed

- «Logg inn»-overskriften på `/login`. Hero-en + «Send meg lenke»-knappen + hjelpeteksten gir nok kontekst.



## [0.2.0] - 2026-05-12

> Innfører versjonerings-disiplin: hver bruker-synlig endring skal bumpe versjonen og legge til CHANGELOG-oppføring i samme commit.

<details>
<summary>Teknisk</summary>

#### Added

- Versjonerings-disiplin: hver commit som endrer bruker-synlig oppførsel bumper `package.json` og legger til oppføring i denne fila. Reglene står i `CLAUDE.md`.

#### Notes

- Versjonen som vises i app-footeren (`AppVersionFooter.tsx`) er allerede koblet til `package.json` via `next.config.ts` — fra og med dette bumpet vil footeren reflektere reell release-versjon istedenfor en konstant `v0.1.0`.

</details>

---

## Pre-disiplin (`0.1.0`)

Versjonen `0.1.0` dekker all utvikling fra Phase 0 til og med Phase 12.5. Ingen detaljerte lanseringsnotater ble ført i denne perioden. Et grovt sammendrag:

- **Phase 0–4**: prosjektoppsett, datamodell, Supabase + RLS, scoring-bibliotek (`lib/scoring/`) med 40 unit-tester
- **Phase 5–8**: auth-flyt (magic link), invitasjons-system, admin-flate for baner og spill, hull-skjerm med score-input
- **Phase 9–10**: offline-sync via Dexie, realtime-oppdateringer, peer-godkjenning og admin-overstyring
- **Phase 11–12**: PWA-oppsett, premium-stil med forest-and-champagne palett, leaderboard og scorekort
- **Phase 12.5**: draft-mode på venterom med progressive disclosure, fargeharmonisering for status-bannere

Full historikk: `git log` mellom prosjektstart og commit `02cf8c0`.
</details>
</details>


