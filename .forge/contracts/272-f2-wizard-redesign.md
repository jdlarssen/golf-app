# Spec: F2 — Wizard step 1+2 redesign (intent-først, mobil-først)

**Issue:** [#272](https://github.com/jdlarssen/golf-app/issues/272)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Design-doc:** [`docs/superpowers/specs/2026-05-27-format-katalog-og-wizard-redesign-design.md`](../../docs/superpowers/specs/2026-05-27-format-katalog-og-wizard-redesign-design.md)
**Stream:** Parallel med F3 (#273)

## Problem

Dagens opprett-spill-wizard har en flat liste på 5 hardkodede formats i step 1 (`app/admin/games/new/ModeSelector.tsx`). Epic #270 utvider katalogen med ~18 nye formats. Hvis vi bare legger dem til i den flate listen, blir step 1 uoversiktlig — særlig på mobil hvor 20+ kort i én liste er uleselig.

I tillegg har Cup-flyten i dag en separat entry `/admin/cup/new` med eget oppsett. Det skaper to inkonsistente flater for "opprett noe spillbar" og duplisert UI-arbeid hver gang vi endrer wizard-mønstret.

F2 re-designer step 1 til intent-først (Kompis / Klubb / Cup / Solo), gjør step 2 dynamisk per intent (4 primary-kort + ≤6 sekundære, lest fra `format_intent_mapping` via F1's `getFormatsForIntent`), og smelter Cup-flyten inn som ett av de fire intent-sporene.

## Prior Decisions

Fra epic-design-doc (godkjent 2026-05-27):
- Step 1 = 4 intent-kort: Kompis / Klubb / Cup / Solo
- Step 2 hovedflyt (Kompis/Klubb/Solo) = 4 primary i 2×2-grid med ikon + ≤6 sekundære i 2-col med mini-ikon
- Step 2 (Cup) = lag-navn (2 felt) + points-to-win + multi-select av cup-eligible formats
- Side-tournaments-banner nederst i step 2 for alle intents
- Mobil-først for alle skjermbilder

Fra denne diskusjonsrunden (2026-05-27):
- **`/admin/cup/new` hard-removes med 404** — ikke redirect. Den eneste call-site er "Opprett ny Cup"-knappen på `/admin/cup/page.tsx` (list-view), som oppdateres til å peke på `/admin/games/new?intent=cup`. Rute-fjerning er trygt fordi bookmarks/PWA-cache er sjelden for admin-only-route.

Fra F1 (#271, merget):
- `getFormatsForIntent(intent)` returnerer flat liste sortert (is_primary desc, sort_order asc). UI partisjonerer på `is_primary`.
- `getCupEligibleFormats()` returnerer alle formats med `is_cup_eligible = true`.
- `isValidActiveGameMode(slug)` — server-action skal kalle denne FØR insert i `games`.
- Format-slugs etter rebase mot main: `best_ball` (ikke `best_ball_netto`), `solo_strokeplay` (ikke `solo_strokeplay_netto`), `fourball_matchplay` er ny (cup-eligible).

## Design

### Step 1 — Hva slags arrangement?

Erstatter dagens flate `ModeSelector` med 4 intent-kort i 2×2-grid:

```
┌──────────────┐ ┌──────────────┐
│ 🧑‍🤝‍🧑          │ │ 🏆           │
│ Kompis-runde │ │ Klubb-       │
│              │ │ turnering    │
│ 2–4 venner   │ │ 8+ deltakere │
└──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐
│ ⚔️           │ │ 🎯           │
│ Cup          │ │ Solo / test  │
│              │ │              │
│ To lag, N    │ │ Én spiller   │
│ matcher      │ │              │
└──────────────┘ └──────────────┘
```

Hvert kort lagrer `intent`-state og navigerer til step 2 med valgt intent.

### Step 2 — Hovedflyt (Kompis/Klubb/Solo)

Server-component leser `getFormatsForIntent(intent)` og partisjonerer på `is_primary`. Renderer:

- **Primary-grid**: 4 kort i 2×2 mobil-grid (3-col tablet+) med ikon, format-navn, og short_description. Hover/tap selecter.
- **Sekundær-seksjon**: opptil 6 sekundære kort i 2-col mobil-grid (3-col tablet+), kompaktere med mini-ikon.
- **Side-tournaments-banner**: nederst, informerer om at sideturneringer kan legges på i neste steg.

Hvis intent har færre enn 4 primary i seedet, viser bare det antallet (ingen padding).

### Step 2 — Cup-variant

Egen variant av step 2 når `intent === 'cup'`:

```
┌──────────────────────────────────────┐
│ Cup-oppsett                          │
│                                      │
│ Lag-navn:                            │
│ ┌──────────┐ ┌──────────┐            │
│ │ Lag A    │ │ Lag B    │            │
│ └──────────┘ └──────────┘            │
│                                      │
│ Points to win: ┌────┐ av N matcher   │
│                │ 4,5│                │
│                └────┘                │
│                                      │
│ Tillatte match-formats:              │
│ ☑ Singles matchplay  ★               │
│ ☑ Fourball matchplay ★               │
│ ☐ (andre cup-eligible når de lander) │
│                                      │
│ 💡 Sideturneringer alltid mulig.     │
└──────────────────────────────────────┘
```

Multi-select leser `getCupEligibleFormats()`. Validerer minst 1 valg. Skriver til `tournaments`-tabellen (eksisterende fra #47 fase 1).

Sub-flow når admin senere legger til en match: `app/admin/cup/[id]/page.tsx` sin "+ Match"-knapp får en select av hvilke tillatte formats. Eksisterende `?game_mode=` query-param-mønster fra #217 (fourball) gjenbrukes.

### Wizard step 3–4

Step 3 (Players + Teams) og step 4 (Summary + Publish) forblir strukturelt likt. Modifikasjoner:
- Step 3 må håndtere intent='cup' — viser lag-tildeling i stedet for vanlig flight/team-grid
- Step 4 viser intent i summary-blokken

### Cup-route fjernes

- `app/admin/cup/new/page.tsx` slettes
- `app/admin/cup/[id]/page.tsx` "+ Match"-knapp pekes på `/admin/games/new?intent=cup&tournament_id=<id>` (gjenbruker eksisterende `?tournament_id=`-mønster fra Ryder Cup phase 1)
- `app/admin/cup/page.tsx` (list-view) "Opprett ny Cup"-knapp peker på `/admin/games/new?intent=cup`
- Hvis noen treffer `/admin/cup/new` direkte etter ship: 404 fra Next.js routing (forventet)

### Ikoner

4 nye intent-ikoner (Kompis/Klubb/Cup/Solo) lages i samme inline-SVG-stil som eksisterende format-ikoner. Plasseres som komponenter eller inline i nye step-1-komponenten.

For step-2 format-kort: ikoner leses fra `formats.icon_key` og mappes til komponent i ny `lib/formats/icons.ts`-helper (eller utvider eksisterende `ModeSelector`-ikon-map). Reuser eksisterende SVGs for de 5 kjente formats.

## Edge Cases & Guardrails

- **Intent med 0 visible formats**: viser tom-state ("Ingen formats tilgjengelig for denne intent — kontakt admin"). Skjer praktisk ikke etter F1-seed.
- **Cup uten cup-eligible formats**: tom-state for multi-select med samme melding.
- **Eksisterende `/admin/cup/new`-link i e-poster eller utenfor app**: 404. Akseptabelt fordi target-bruker er admin med kjent flat-struktur. Hvis det dukker opp som problem: kan legge til 410 Gone med redirect-tekst senere.
- **Modus-lock for redigering av publisert spill**: `GameWizard.tsx` har eksisterende `disabled`-prop på `ModeSelector`. Ny intent-pickeren må respektere samme prop (kanskje med en banner "Format kan ikke endres for publisert spill").
- **Server-action-validering**: `createGame`-action må kalle `isValidActiveGameMode(slug)` FØR insert (erstatter dropped CHECK).
- **Intent ikke i state for nye spill**: hvis brukeren navigerer rett til step 2 uten å velge intent, redirect til step 1. URL-state `?intent=` driver state, og default er step 1.

## Key Decisions

- **Intent-først step 1** med 4 kort (per design-doc og bekreftet av Jørgen 2026-05-27)
- **Cup smeltes inn** som intent — ikke separat entry/wizard
- **`/admin/cup/new` hard-removes med 404** (per denne diskusjonen) — call-sites oppdateres til ny URL
- **Step 2 partisjoneres på `is_primary` i UI**, ikke i server-helper (helper returnerer flat liste — F1-mønster bevart)
- **Cup-list-view (`/admin/cup`) blir værende** — eksisterende navigation til list av cuper er ikke berørt

**Claude's Discretion:**
- Eksakt 2×2 vs 3-col responsiv breakpoint (mobile-først, juster i build basert på faktisk skjerm)
- Banner-design for side-tournaments (kort, ikke-distraherende — match eksisterende `<Banner>`-pattern)
- Hvordan render-test for ny step-1 organiseres (én test for hver intent-valg, eller én parameterisert)
- Om intent-state lagres i URL (`?intent=kompis`) eller bare i client-side wizard-state. Anbefales URL for back/forward-knapp + bookmark-bar.
- Ikon-design for 4 intent-kort (følg dagens inline-SVG-stil — `currentColor`, 28×28 viewport)

## Success Criteria

- [x] Step 1 viser 4 intent-kort med ikoner (Kompis/Klubb/Cup/Solo), mobil-først 2×2-grid — `app/admin/games/new/IntentSelector.tsx:70-97`
- [x] Step 2 (Kompis/Klubb/Solo) leser `getFormatsForIntent(intent)` og viser 4 primary + opptil 6 sekundære kort — `FormatGrid.tsx:27-92`, `page.tsx:227-233`
- [x] Step 2 (Cup) viser lag-navn (2 felt), points-to-win, multi-select av cup-eligible formats — `CupSetup.tsx:75-176`
- [x] `/admin/cup/new`-ruten slettet — hard 404 ved direct access — `git rm` i commit `a3d27a5`
- [x] `app/admin/cup/page.tsx` "Opprett ny Cup"-knapp peker på `/admin/games/new?intent=cup` — `app/admin/cup/page.tsx:102`
- [x] `app/admin/cup/[id]/page.tsx` "+ Match"-knapp(er) peker på `/admin/games/new?intent=cup&tournament_id=<id>` — `app/admin/cup/[id]/page.tsx:201-212`
- [x] Side-tournaments-banner i step 2 for alle intents — `SideTournamentsBanner.tsx` + `GameWizard.tsx:352, 477`
- [x] Server-action `createGame` kaller `isValidActiveGameMode(slug)` før insert — `actions.ts:46-49` + new test `actions.test.ts:121`
- [x] Modus-lock for publiserte spill respekteres i ny intent-picker — `IntentSelector.tsx:24-32` `disabled`-prop + `GameWizard.tsx:286`
- [x] Type C render-tester for: step 1 (4-kort-grid), step 2-Klubb (4 primary + sekundære), step 2-Cup (multi-select) — `IntentSelector.test.tsx`, `FormatGrid.test.tsx`, `CupSetup.test.tsx`
- [ ] Mobil-skjermbilde verifisert i Safari før merge — alle tap-targets ≥44px (krever manuell verifikasjon av Jørgen)
- [x] CHANGELOG-oppføring + version bump ved release — `CHANGELOG.md` 1.40.0, `package.json` 1.40.0

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors i nye/endrede filer
- [ ] `npx vitest run app/admin/games/new/` — render-tester grønne
- [ ] `npx vitest run` — full suite grønn (regresjonsbeskyttelse)
- [ ] `npm run lint` — 0 errors
- [ ] Mobile playwright-spec for opprett-spill-flyten (hvis eksisterer) grønn

## Files Likely Touched

**Owned by F2:**
- `app/admin/games/new/page.tsx` — server component, URL-state for intent
- `app/admin/games/new/GameWizard.tsx` — wizard-orkestrasjon
- `app/admin/games/new/ModeSelector.tsx` — refaktor eller erstatt med IntentSelector + FormatGrid
- `app/admin/games/new/IntentSelector.tsx` — NY: step 1 (4-kort intent-picker)
- `app/admin/games/new/FormatGrid.tsx` — NY: step 2 hovedflyt (primary + sekundære)
- `app/admin/games/new/CupSetup.tsx` — NY: step 2 Cup-variant (lag-navn + points + multi-select)
- `app/admin/games/new/actions.ts` — call `isValidActiveGameMode` før insert
- `app/admin/games/new/useGameFormState.ts` — utvid med intent
- `app/admin/games/new/sections/BasicsSection.tsx` — kan bli berørt av step-3-justeringer
- `app/admin/cup/new/page.tsx` — SLETT
- `app/admin/cup/new/CupForm.tsx` (og andre helpers under) — SLETT
- `app/admin/cup/page.tsx` — oppdater "Opprett ny Cup"-button href
- `app/admin/cup/[id]/page.tsx` — oppdater "+ Match"-button href
- `components/icons/Icons.tsx` (eller ny `IntentIcons.tsx`) — 4 nye intent-SVGs
- `lib/formats/icons.ts` (NY) — slug → komponent-mapping for step 2-kort
- Render-tester for nye komponenter
- `CHANGELOG.md` + `package.json` — minor-bump (eks. 1.40.0) ved release

**Forbudt å endre (F3-territory eller delt):**
- `lib/formats/*` (eksisterende F1-helpers) — kun les. Hvis du oppdager bug i F1, åpne separat issue.
- `app/admin/formats/*` (F3's domain — eksisterer ikke ennå, vil bli opprettet av F3)
- `app/admin/page.tsx` (admin tile-grid) — Cuper-tilen forblir (peker på list-view, ikke create). Format-tile legges til i Wave-2 follow-up.

## Dependencies

- **Depends on:** F1 (#271, merget) — `lib/formats/getFormatsForIntent`, `getCupEligibleFormats`, `isValidActiveGameMode` er tilgjengelig via main.
- **Parallel med:** F3 (#273) — ingen fil-overlap.

## Out of Scope

- Admin format-mapping-UI (F3 #273)
- Nye format-issues (separate issues #274–#291)
- Sideturnering-system endringer (kun lese-konsum)
- Wizard step 3 (Players) re-arkitektur — kun mode-config-håndtering for intent='cup'
- Format-tile på admin-home — Wave-2 follow-up issue
- Mobil-mockup for matrix-view (F3-territory)
- Backward-compat for /admin/cup/new — hard 404 er bevisst valg

## Deferred Ideas

- Cup-step-2 kunne hatt en preset-dropdown ("Ryder Cup mini = 4 singles + 2 foursomes + 2 fourball") — utsatt til #219 (match-templating)
- Wizard step 3 kunne hatt random/HCP-balanserte pairings — utsatt til #219
