# Spec: Cup-sidepoeng — flere vinnere per type+hull + GIR-poeng per lag (#1489)

## Problem

Spillerne i en kommende Ryder-cup vil ha CTP **per flight** (samme hull, ett poeng per flight) og en **GIR-konkurranse** (1,5 p til laget per duo som treffer green in regulation på utvalgte hull). Dagens sidepoeng-modell (#1441, D9) tillater bare én vinner per (type, hull) — regelen «Du kan ikke ha to rader med samme type og hull» bor i tre lag som må endres samlet (AGENTS.md-felle 4): DB-unique i migrasjon 0154, duplikat-sjekk i `saveSideAwardConfig` (lib/cup/sideAwardActions.ts:91–96) og copy-en `cup.sideAwards.errors.duplicate`. GIR finnes ikke som type.

Full design-diskusjon med eier: `docs/superpowers/specs/2026-08-07-cup-sidepoeng-flerplass-gir-design.md` (godkjent 2026-08-07).

## Research Findings

Ground-truthet mot live prod-DB via Supabase MCP 2026-08-07 (I1):

- Unik-constrainten heter `tournament_side_awards_tournament_id_kind_hole_number_key` — `UNIQUE (tournament_id, kind, hole_number)`. Kind-checken heter `tournament_side_awards_kind_check` — `kind IN ('ctp','ld')`. Begge droppes/erstattes i migrasjonen.
- `getCupSnapshot` henter sidepoeng-rader UTEN `order by` (lib/cup/getCupSnapshot.ts:184–187) — nummerert visning («1 av 3») krever deterministisk sortering; legg til `.order()` på kind, hole_number, slot.
- `CupSideAwardInput` (lib/cup/computeCupLeaderboard.ts:89–94) er per-innslag `{kind, holeNumber, points, winnerTeam}` — GIR kan foldes ut til N slike innslag i `getCupSnapshot`, så **`computeCupLeaderboard` røres ikke**.
- origin/main har 0155 (`tournament_plans_and_participants`) — ny migrasjon er **0156**; rebase branchen på main FØR bygging.
- Trigger-filled/NOT NULL-minne: nye kolonner med NOT NULL trenger default, ellers blir Insert-typen required i gen:types — `slot` får `not null default 1`, GIR-kolonnene er nullable.

## Prior Decisions

- **#1441/D9:** egen tabell `tournament_side_awards` uten write-RLS; all skriving via `getAdminClient()` med authz kun i server-action-gaten (`requireAdminOrClubAdminOfCup`). Står.
- **#1455:** oppsett kun i `draft`; etter start kun registrering. Står — gjelder også GIR-maks.
- **Atomic-or-compensated** delete-så-insert med kompensert rollback i `saveSideAwardConfig`. Står, men gaten «ingen registrerte vinnere» utvides (se Design).
- **Eier-beslutninger fra brainstormen (2026-08-07, ikke re-diskuter):** antall-felt per rad (ikke duplikat-rader, ikke flight-merkelapper); GIR registreres etter runden som antall per lag, **per hull** (ikke totalsum, ikke avhuking underveis); GIR-rader har maks per lag; registrering bor på cup-admin-siden.

## Design

**Migrasjon `0156` (staging først via MCP; prod KUN etter eksplisitt eier-godkjenning, #1074):**

- `slot integer not null default 1` + CHECK `slot between 1 and 10`. Eksisterende rader blir slot 1 via default.
- Drop unique `tournament_side_awards_tournament_id_kind_hole_number_key`, ny `unique (tournament_id, kind, hole_number, slot)`.
- Kind-check utvides: `kind in ('ctp','ld','gir')`.
- Nye nullable kolonner: `gir_max_per_team integer` (CHECK 1..10, kun satt for gir), `gir_team1_count integer`, `gir_team2_count integer` (CHECK 0..`gir_max_per_team`, kun for gir). CHECK-er skal håndheve at gir-kolonner er null for ctp/ld og at `winner_user_id` er null for gir.
- Typer: generer fra **staging** etter påført staging-migrasjon (MCP `generate_typescript_types`, jf. #1210-fella) — ikke håndskriv.

**Server (`lib/cup/sideAwardActions.ts`):**

- `SideAwardConfigInput` blir diskriminert: ctp/ld-rader får `winnerCount` (1–10), gir-rader `maxPerTeam` (1–10). Validering i `isValidSideAward` utvides tilsvarende.
- `saveSideAwardConfig`: duplikat-sjekken per (kind, hole) BESTÅR (én config-rad per type+hull). Ekspansjon ved insert: ctp/ld-rad → `winnerCount` DB-rader (slot 1..N); gir-rad → én DB-rad (slot 1) med `gir_max_per_team`. Gaten `winners_already_registered` utvides: også `gir_team1_count`/`gir_team2_count` ≠ null teller som «registrert». Delete-så-insert + kompensert rollback beholdes (rollback-insert må ta med de nye kolonnene).
- Ny action `registerGirCounts({tournamentId, awardId, team1Count, team2Count})`: authz-gate som naboene, validerer 0..radens `gir_max_per_team` og at raden er `kind='gir'`, skriver tellerne med `expectAffected`, revaliderer samme tags/paths som `registerSideAwardWinner`. Re-registrering tillatt (overskriver), ingen status-lås utover authz — speiler `registerSideAwardWinner`.
- `registerSideAwardWinner`: uendret, men skal avvise gir-rader (`not_found` eller egen kode — builder velger, med test).

**Snapshot (`lib/cup/getCupSnapshot.ts`):**

- Fetch: `select` + nye kolonner, `.order('kind').order('hole_number').order('slot')`.
- `CupSideAwardSnapshot` utvides: `slot` + `slotCount` (antall søsken med samme kind+hull, for «1 av 3»-visning) for ctp/ld; gir-variant med `maxPerTeam`, `team1Count`, `team2Count`. Diskriminert union anbefales; builder velger eksakt form.
- Leaderboard-input: ctp/ld-rader mapper som i dag (per rad). Gir-rader foldes ut: `team1Count` innslag `{kind:'gir', winnerTeam:1}` + tilsvarende for lag 2; null-tellere (uregistrert) → ingen innslag. `CupSideAwardInput.kind` utvides med `'gir'` (ren type-utvidelse; motoren bryr seg ikke om kind).

**UI (`app/[locale]/admin/cup/[id]/SideAwardsPanel.tsx`):**

- Oppsett-grid får fjerde kolonne «Vinnere»: number-input 1–10 for ctp/ld; for gir betyr feltet maks per lag (samme kolonne, hjelpetekst under tabellen forklarer). Type-dropdown får «GIR». Panelets interne rad-state er config-rader (med antall), IKKE slot-rader — grupperings-/ekspansjonslogikken (DB-rader ↔ config-rader) legges som ren, testbar funksjon (egen fil eller eksportert helper).
- Låst visning: «Nærmest hullet · Hull 4 · 2 p · 3 vinnere» / «GIR · Hull 3 · 1,5 p · maks 3 per lag».
- «Etter runden»: ctp/ld-rader som i dag én per slot, med «(1 av 3)»-suffiks når `slotCount > 1`. Gir-rader: egen rad-komponent med to number-felt («Hvor mange GIR klarte {lagnavn}?» — endelig copy via humanizer), `max`-attributt fra `maxPerTeam`, egen registrer-knapp → `registerGirCounts`.
- Duplikat-feilcopy omformuleres til å peke på Vinnere-feltet. Nye i18n-nøkler i BEGGE locales (`kindGir`, hjelpetekst, gir-felter, omformulert duplicate).

## Edge Cases & Guardrails

- Gamle cuper (eksisterende rader): slot 1, `slotCount` 1 → ingen nummerering vises; GIR-felter fraværende. Ingen datamigrering.
- Uregistrerte ctp/ld-slots gir 0 p (som i dag). GIR-tellere null = uregistrert (0 p); tallet 0 = eksplisitt registrert null GIR — begge gir 0 p i totalen, skillet er kun visuelt/semantisk i panelet.
- Samme spiller kan velges i flere slots på samme hull — appen håndhever ikke flight-tilhørighet (eier-akseptert).
- `saveSideAwardConfig` med senket `winnerCount` etter registrerte vinnere: umulig — gaten avviser enhver re-konfig når noe er registrert, og #1455-gaten låser etter start uansett.
- Hostile-PATCH (felle 3): tabellen har ingen write-RLS — nye kolonner er automatisk dekket. Ingen ny policy.
- `registerGirCounts` mot ctp/ld-rad, eller counts > maks → feilkode, ingen skriv (test begge).
- Panel-gruppering av «umulige» DB-tilstander (samme kind+hull med ulik points på ulike slots — kan ikke oppstå via appen): grupper per (kind, hull, points) og vis det som ligger der; ikke krasj.

## Key Decisions

- «Vinnere»-kolonnen har dobbel semantikk (antall plasser vs. maks per lag) — eier-valgt; hjelpetekst avbøter.
- Én DB-rad per ctp/ld-slot (ikke count-kolonne) — gjenbruker vinner-registreringen uendret.
- GIR som counts på én rad (ikke slots) — ingen spiller-attribusjon ønsket.
- Leaderboard-motoren uendret — GIR foldes ut i snapshot-laget.

**Claude's Discretion:** eksakt copy (humanizer), eksakt typeform på diskriminerte unioner, feilkode for gir-rad i `registerSideAwardWinner`, layout-detaljer på gir-registreringsraden, plassering av grupperings-helperen.

## Amendment (eier, i økten 2026-08-07)

Poengfeltet må støtte desimaler (1,5 p) — for GIR og for CTP/LD. Ground-truth: allerede
støttet i dag (DB `points numeric` + `check (points > 0)`, `isValidSideAward` godtar
endelige tall > 0, poeng-inputen har `step={0.5}`, visning via `formatPoints` med komma).
GIR gjenbruker samme poengkolonne og arver støtten. Verifiseres eksplisitt i
staging-klikkrunden med en GIR-rad på 1,5 p.

## Success Criteria

- [ ] Type A-tester: gruppering/ekspansjon (config-rader ↔ DB-rader; grenser 0/1/10/11; duplikat per kind+hull) og GIR-utfolding (null-tellere, 0-tellere, maks) — nye tester i co-located filer.
- [ ] `saveSideAwardConfig`-tester oppdatert for ny input-type + utvidet registrert-gate (gir-tellere blokkerer re-konfig).
- [ ] `registerGirCounts`: tester for gyldig skriv, counts > maks avvist, ctp/ld-rad avvist, authz-gate kalt.
- [ ] Snapshot: test at ctp/ld-slots får riktig `slotCount` og at GIR foldes til riktige leaderboard-innslag; `computeCupLeaderboard`-filen er UENDRET (verifiser med git diff).
- [ ] Panel: eksisterende render-tester grønne/oppdatert; maks ÉN ny render-test hvis gir-raden trenger det (Type C-regel).
- [ ] i18n: alle nye nøkler i både `no.json` og `en.json`; omformulert duplicate-copy.
- [ ] Migrasjon 0156 påført **staging** og verifisert der; typer regenerert fra staging. Prod-migrasjon IKKE påført uten eier-godkjenning (kontrakten slutter før prod).
- [ ] `package.json` minor-bump + Funksjon-rad i `CHANGELOG.md` (feat, bruker-synlig).
- [ ] Staging-klikkrunde av hele flyten (oppsett med 3×CTP-plasser + GIR-rader → start cup → registrer vinnere + GIR-tellere → sum stemmer på offentlig side) med bevis-kommentar + `staging-verified`-label på PR-en før merge.

## Gates

- [ ] `npx vitest run lib/cup/sideAwardActions.test.ts lib/cup/getCupSnapshot.test.ts "app/[locale]/admin/cup/[id]/SideAwardsPanel.test.tsx"` grønn (+ evt. ny helper-testfil)
- [ ] `npm run build` grønn (ikke filtrer «pre-existing»)
- [ ] `npm run lint` grønn

## Files Likely Touched

- `supabase/migrations/0156_side_awards_slots_and_gir.sql` — ny
- `lib/database.types.ts` — regenerert fra staging
- `lib/cup/sideAwardActions.ts` + `.test.ts` — input-type, ekspansjon, `registerGirCounts`
- `lib/cup/getCupSnapshot.ts` + test — ordering, snapshot-typer, GIR-utfolding
- `lib/cup/computeCupLeaderboard.ts` — KUN `CupSideAwardInput.kind`-utvidelse (motoren uendret)
- `app/[locale]/admin/cup/[id]/SideAwardsPanel.tsx` + test — Vinnere-kolonne, GIR-type, gir-registreringsrad
- `messages/no.json`, `messages/en.json` — nye nøkler + omformulert duplicate
- `package.json`, `package-lock.json`, `CHANGELOG.md`

## Out of Scope

- Avhuking av GIR/CTP underveis i score-føringen (eier-utsatt; eget issue hvis behovet bekreftes etter turneringen).
- Påminnelses-merke på hullsiden («GIR-poeng på dette hullet») — eget issue ved behov.
- Per-hull-GIR-visning på offentlige cup-sider (dataene muliggjør det senere).
- Spill-nivåets sideturnering (#576-skjulingen står) og `SideWinnersForm` i avslutt-flyten.
- Prod-migrasjonen — påføres i egen eier-godkjent operasjon, aldri av byggeløkken.
