# Spec: Cup-oppsett i tre adskilte rom — detaljer først, spillere når som helst, lagfordeling sist

**Issue:** #1472 · **Branch:** claude/auto-1472-baeddb

## Problem

Cup-oppsettet er i dag «spillere først»: generer-wizarden (`GenerateMatchesWizard.tsx`, 4 steg) krever lagfordeling (steg 1) før arrangøren får sette bane/tee/tee-off (steg 2) og format-preset/strategi (steg 3). Halvveis-valg overlever kun i `localStorage` per nettleser (`CupWizardDraft`); ingenting persisteres server-side før generering. Eieren vil snu dette til tre adskilte rom (sitat: «cup-detaljer burde vært satt ett sted. Så kan man legge til spillere i cupen et annet sted. Så kan man fordele spillerne et siste sted.»):

1. **Oppsett** — bane, tee, tee-off, format-preset/strategi. Server-persistert, redigerbart mens cupen er `draft`.
2. **Spillere** — persistert deltakerliste for cupen, uavhengig av matcher, påfyll over tid.
3. **Fordel & generer** — lagfordeling + preview + generer (dagens steg 1 + 4).

## Eierbeslutninger (issue-kommentar 2026-08-07 — bindende)

- **Én plan per cup i v1**, men datamodellen skal ikke bake inn én-til-én for alltid → egen plan-tabell med FK til cupen (unique-constraint i v1 som kan droppes senere), IKKE kolonner på `tournaments`.
- **Lag-løs deltakerliste.** Spillere meldes på cupen uten lag-tilhørighet; lagfordeling skjer først i Fordel-rommet.

## Research Findings (repo-interne — ingen nye biblioteker)

- **React 19 form-auto-reset-fella:** `action=`-form nullstiller ukontrollerte felt når innsendingen returnerer feil. Oppsett-/Spillere-formene MÅ bruke `preventDefault` + `startTransition(() => formAction(formData))`-mønsteret fra `CupSetup.tsx:103-107` (#1397, commit fb242957).
- **`'use server'`-filer tillater kun async exports** — rene valideringshjelpere bor i egen modul (mønster: `lib/cup/pointsToWin.ts`, #1142 avvik 4/10).
- **RLS-mønster for cup-undertabeller:** `0154_tournament_side_awards.sql` — `select to authenticated using (true)`, INGEN write-policies; skriv går via service-role (`getAdminClient`) i server-actions gatet av `requireAdminOrClubAdminOfCup`. Direkte PostgREST-write avvises (AGENTS.md-felle 3).
- **`gen:types` leser prod** som ikke migreres før eier-godkjenning → typer genereres fra staging via Supabase MCP og hånd-flettes (kun de nye tabellene), #1142 avvik 8.
- **Next 16:** `revalidateTag(tag, 'max')` (to-arg), redirect via `@/i18n/navigation` i locale-bevisste actions (mønster: `generer/actions.ts`).

## Prior Decisions (carried forward)

- **One door per room (#344):** hvert rom har ÉN dør fra cup-detaljsiden; ingen dupliserte innganger.
- **#752 guided empty-state:** manglende forutsetning → forklaring + lenke, aldri en død flate.
- **#1142:** `points_to_win` utledes ved start; poengmål-felt finnes ikke i opprettelsen. Urørt her.
- **#1441:** splittet-cup-dag-bunten, greensome-lagslag (`teamStrokesInputs`, klient-side), `bestBallAllowancePct`, tee-off-spredning (`resolveScheduledTeeOffAt`). All denne logikken beholdes — bare KILDEN til bane/tee/preset/tee-off flyttes fra wizard-steg til lagret plan.
- **Caps (#526):** `exceedsPersonalMatchCap`/`exceedsPersonalPlayerCap` i `lib/cup/limits.ts` er regelens ene hjem — gjenbrukes, aldri dupliseres.

## Design

### Datamodell — migrasjon `0155_tournament_plans_and_participants.sql` (nummer verifiseres mot origin/main)

```sql
create table public.tournament_plans (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade unique,
  course_id uuid references public.courses(id) on delete set null,
  tee_box_id uuid references public.tee_boxes(id) on delete set null,
  scheduled_tee_off_at timestamptz,
  preset_id text not null default 'klassisk',
  custom_sessions jsonb,
  strategy text not null default 'handicap',
  best_ball_allowance_pct smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_participants (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
```

Begge: enable RLS + `select to authenticated using (true)`, ingen write-policies (0154-mønsteret). `unique` på `tournament_plans.tournament_id` er v1-grepet som senere droppes for plan-per-runde. Preset-/strategi-gyldighet valideres i server-action (regelens hjem er `cupTemplates.ts` — ingen DB-CHECK som dupliserer listen). Staging først via MCP, verifiser, typer fra staging; prod KUN etter eksplisitt eier-godkjenning (#1074-luken) og FØR merge (additivt — trygt for kjørende app).

### Rom 1: Oppsett — `/admin/cup/[id]/oppsett` + `/klubber/[id]/cup/[cupId]/oppsett`

Delt server-komponent `CupPlanSetup` (variant admin/club — samme mønster som `GenerateMatches`/`CupManagement`) + klient-form `CupPlanForm`. Innhold = dagens Step2Course + Step3Setup gjenbrukt som form-seksjoner: bane→tee (avhengig select), tee-off (`datetime-local`, valgfri), preset-radioer (klassisk/fourball-singler/singler/splittet-cup-dag/tilpasset), tilpasset-sesjonsliste, strategi (handicap/random), best-ball-% (kun synlig for splittet-cup-dag). Prefylles fra lagret plan. Lagre-knapp → `saveCupPlan` server-action (ny fil `lib/cup/planActions.ts`):

- Gate: `requireAdminOrClubAdminOfCup` + `status='draft'` (ellers `{error:'not_draft'}`).
- Validering: bane+tee påkrevd, tee tilhører bane og er ikke arkivert; preset-id ∈ CUP_PRESETS ∪ 'tilpasset'; strategy ∈ handicap/random; custom_sessions ⊆ CupSessionFormat (kun relevant for 'tilpasset'); best_ball 0–100 heltall; tee-off parses (`parseOsloDateTimeLocal`) og ikke i fortiden (`isTeeOffInPast`) — tom = NULL.
- Upsert på `tournament_id` via admin-client, `updated_at = now()`. Feil som action-resultat (#1397-mønster), suksess → redirect tilbake til cup-detalj med `status=plan_saved`.
- Ren valideringslogikk i egen modul `lib/cup/planValidation.ts` (Type A-testbar, `'use server'`-begrensningen).

### Rom 2: Spillere — `/admin/cup/[id]/spillere` + `/klubber/[id]/cup/[cupId]/spillere`

Delt `CupParticipants` (server) + klient-liste. Kandidat-kilder = dagens logikk i `GenerateMatches.tsx:169-241` trukket ut til helper `lib/cup/getCupCandidatePlayers.ts` (klubb-cup → medlemmer; personlig+admin → alle profil-fullførte; personlig vanlig → venner+selv, pending venner vises ikke-valgbare, #1441 F3f). UI: liste over påmeldte (med fjern-knapp) + legg-til-flate fra kandidatene. Actions i `planActions.ts`:

- `addCupParticipant`: gate + `status='draft'`; server-side re-validering av at brukeren ER gyldig kandidat (klient-lister er ikke authz); personlig ikke-admin: håndhev `exceedsPersonalPlayerCap` på (eksisterende deltakere + 1) ved add-time; insert via admin-client, duplikat = no-op (`onConflict` ignore).
- `removeCupParticipant`: gate + `status='draft'`; delete via admin-client. Fjerning rører ALDRI allerede genererte matcher (de bor i games/game_players).

### Rom 3: Fordel & generer — eksisterende `/generer`-ruter, ombygd

- `GenerateMatches.tsx` (server): henter plan + deltakerliste (+ deltakernes `users`-data: navn/nickname/hcp_index/gender). Guided empty-states (#752): plan mangler/ufullstendig (course/tee NULL) → kort med lenke til Oppsett-rommet; 0 deltakere → kort med lenke til Spillere-rommet. Kandidat-kilde-logikken FJERNES herfra (bor nå i helperen, brukt av rom 2).
- `GenerateMatchesWizard.tsx` (klient): **2 steg.** Steg 1 = dagens Step1Roster over deltakerlista. Steg 2 = dagens Step4Preview/Step4BundlePreview + Step4Confirm (generering kjøres ved overgang 1→2 som i dag). Plan-verdiene (courseId, teeBoxId, selectedTee-ratings, presetId, customSessions, strategy, bestBallAllowancePct, teeOff-ISO) kommer som props fra server. Step2Course, Step3Setup, hele `CupWizardDraft`-localStorage-maskineriet (loadDraft/saveDraft/clearDraft/hydrated/draftRestored) SLETTES. `teamStrokesInputs` forblir klient-state (greensome-forslag er live-utledet).
- `createCupMatchesFromPlan` (`generer/actions.ts`): input-typen mister `courseId`/`teeBoxId`/`bestBallAllowancePct`/`scheduledTeeOffAt` — disse leses server-side fra lagret plan (mindre payload-manipulasjonsflate). Validerer plan finnes + er komplett (`missing_plan`-feil ellers). Matches-payloaden (side1/side2/segment/sourceId/teamStrokesOverride) sendes fortsatt fra klienten. All insert-logikk ellers uendret (to-pass, rollback, caps).
- Multi-batch bevares: planen er redigerbar mens `draft` → arrangøren kan endre plan og generere ny batch (append, som i dag).

### Cup-detaljsiden (`CupManagement.tsx`) — tre dører

Mens `status='draft'`: dagens ene «Generer matcher»-knapp erstattes av tre dør-kort i rekkefølge Oppsett → Spillere → Fordel & generer, hver med status-subtitle (Oppsett: valgt bane · tee eller «ikke satt opp»; Spillere: antall påmeldte; Fordel: antall genererte matcher). Alle dører alltid klikkbare — empty-states håndteres INNE i rommene. Etter `draft` vises ingen dører (som i dag). Plan + deltaker-antall hentes i `CupManagement` (byggerens valg: direkte fetches eller snapshot-utvidelse).

### Opprettelsen (`CupSetup.tsx`) — subtraksjon

Den UI-only format-multiselecten (`:64-81` + `:183-237`, aldri persistert, jf. docstring) SLETTES — format-valg bor nå i Oppsett-rommet. Opprettelsen = navn + lagnavn + poengvekter. i18n-nøklene `allowedFormatsLegend`/`allowedFormatsHint` (+ ubrukte multi-select-avhengigheter) fjernes fra BEGGE kataloger etter grep av call-sites.

## Edge Cases & Guardrails

- **Eksisterende draft-cuper** (uten plan/deltakere) må ikke knekke: dørene fører til tomme rom med fungerende forms; generer-rommet viser guided empty-state. Ingen backfill nødvendig.
- **Plan endret mellom wizard-last og submit** (annen fane/enhet): generering leser planen server-side ved submit — serveren er fasit; preview kan i sjeldne tilfeller vise utdatert bane-navn. Akseptert.
- **Deltaker fjernet etter generering:** genererte matcher består (games er fasit). Fjerning påvirker kun fremtidig fordeling.
- **0-rad-skriv (felle 2):** upsert/delete-stier bruker `.select()` + `expectAffected` der en no-op er en feil (f.eks. remove av ikke-eksisterende rad kan være ærlig no-op — byggerens vurdering, dokumentér valget).
- **Hostile PATCH (felle 3):** ingen write-policies på de nye tabellene — verifiser med én negativ pgTAP/hostile-sjekk hvis rimelig, ellers noter at 0154-mønsteret er gjenbrukt eksakt.
- **Caps:** add-time-håndheving MÅ kalle samme `exceedsPersonalPlayerCap` som genereringen (regelens ene hjem); genereringens eksisterende sjekker består (deltakerliste ≠ matcher).
- **catalogParity:** alle i18n-endringer i no.json + en.json samtidig.
- **`cup-wizard-draft-*`-nøkler i localStorage** hos eksisterende brukere: ryddes ikke aktivt (harmløse, små) — men ingen kode leser/skriver dem lenger.

## Key Decisions

- **Egen plan-tabell, ikke kolonner på tournaments** — eierbeslutning 1 (fremtidig plan-per-runde uten riving).
- **Deltakerliste uten lag-kolonne** — eierbeslutning 2 (lagfordeling bor i Fordel-steget, aldri persistert før generering — som i dag).
- **0154-RLS-mønsteret** (select-only + service-role-skriv) — konsistent med nyeste cup-søstertabell, minst ny politikk-flate.
- **Server leser plan ved generering** i stedet for klient-payload — authz/valideringsflate krymper; klienten sender kun det den faktisk eier (fordeling + overrides).
- **localStorage-utkastet slettes helt** — planen er server-persistert nå; å beholde to lagringslag gir splitt-hjerne.

**Claude's Discretion:** eksakt norsk copy (rom-titler, dør-subtitles, empty-states, feilkoder→meldinger); fil-/komponentnavn; om plan+deltakere hentes via snapshot-utvidelse eller egne fetches; testid-navngiving (behold `cup-wizard-generate` og `cup-wizard-step1`); nøyaktig upsert-mekanikk; om `updated_at` settes via trigger eller eksplisitt i action.

## Success Criteria

- [ ] **S1 — skjema:** `tournament_plans` + `tournament_participants` finnes på staging med RLS enabled, én SELECT-policy hver, ingen write-policies (verifisert med SQL mot `pg_policies`); `lib/database.types.ts` har begge tabellene.
- [ ] **S2 — Oppsett:** lagre bane/tee/tee-off/preset/strategi i Oppsett-rommet → rad i `tournament_plans`; reload viser lagrede verdier; endring mens `draft` overskriver samme rad (fortsatt én rad).
- [ ] **S3 — Spillere:** legge til/fjerne deltakere persisterer i `tournament_participants`; personlig ikke-admin-cup avviser deltaker nr. 25 (cap); klubb-cup tilbyr kun medlemmer.
- [ ] **S4 — Fordel & generer:** wizard har 2 steg; genererte matcher får course/tee/tee-off/format fra LAGRET plan (verifisert i games-radene på staging); uten plan → empty-state med Oppsett-lenke; uten deltakere → empty-state med Spillere-lenke.
- [ ] **S5 — dørene:** cup-detaljsiden (admin + klubb) viser tre dører i draft-status med status-subtitles; `CupSetup` har ikke lenger format-multiselect.
- [ ] **S6 — ingen localStorage:** `grep -r 'cup-wizard-draft' app/ lib/` → 0 treff; wizard-flyten fungerer uten.
- [ ] **S7 — regresjon:** eksisterende draft-cup (seedet uten plan/deltakere) rendrer cup-detalj + alle tre rom uten feil; full vitest-suite grønn; `e2e/cup/cup-lifecycle.spec.ts` oppdatert til ny flyt og grønn mot staging.

## Gates

- [ ] `npm run build` (fanger Next 16 `'use server'`-regler + exhaustive switches)
- [ ] `npm run lint` — 0 errors
- [ ] `npx vitest run` — hele suiten (ikke path-scopet, jf. #1142 B1)
- [ ] `npx playwright test e2e/cup/` mot staging — grønn
- [ ] Staging-klikkrunde av hele flyten (opprett → oppsett → spillere → fordel/generer → start) + bevis-kommentar på PR (staging-verify)

## Files Likely Touched

- `supabase/migrations/0155_*.sql` (ny) · `lib/database.types.ts` (staging-flettet)
- `lib/cup/planActions.ts` (ny) · `lib/cup/planValidation.ts` (ny, + test) · `lib/cup/getCupCandidatePlayers.ts` (ny)
- `app/[locale]/admin/cup/[id]/oppsett/` + `spillere/` (nye) · `app/[locale]/klubber/[id]/cup/[cupId]/oppsett/` + `spillere/` (nye) · delte komponenter for begge rom
- `app/[locale]/admin/cup/[id]/generer/GenerateMatches.tsx` + `GenerateMatchesWizard.tsx` (+ test) + `actions.ts` (+ test)
- `app/[locale]/admin/cup/[id]/CupManagement.tsx` · `app/[locale]/admin/games/new/CupSetup.tsx` (+ test)
- `messages/no.json` + `messages/en.json` · `e2e/cup/cup-lifecycle.spec.ts`
- `package.json` (minor bump) + `CHANGELOG.md` (én Funksjon-linje)

## Out of Scope

- Spillerbytte i allerede genererte matcher (eget issue #1473) · walkover midt i match (parkert).
- Selv-påmelding/invitasjonslenker til cup-deltakerlista — deltakere legges til av arrangøren i v1.
- Redigering av cupnavn/lagnavn/poengvekter etter opprettelse (ingen slik flate finnes i dag).
- Plan-per-runde/flere baner per cup (v1 = én plan; datamodellen er forberedt).
- Rydding av gamle `cup-wizard-draft-*`-localStorage-nøkler hos brukere.
