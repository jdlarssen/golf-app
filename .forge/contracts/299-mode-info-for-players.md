# Spec: Mer info om gamemode — modus-forklaring for spillere (#299)

## Problem

Tørny støtter nå 9 spillemoduser (Stableford, Best ball, Texas scramble, Slagspill, Matchplay, Fourball, Foursomes, Wolf, Nassau). En spiller som blir invitert til et spill i en modus de ikke kjenner, har i dag **ingen måte å lære hvordan modusen funker** på sin egen spill-side. Modusen er kun antydet via scorekort-etiketten og (for stableford) en enkelt undertittel-setning. Resultatet: spillere tør ikke å spille moduser de ikke kjenner. Issue #299 ber om en rask måte å «sette spilleren inn i modusen» slik at alle tør å spille alle modusene.

`formats`-tabellen har allerede en ett-linjes `short_description` per format, men den vises kun til admin i wizardens FormatGrid — aldri til spilleren.

## Prior Decisions

- **`MODE_LABELS` (lib/scoring/modes/types.ts)** er single source of truth for norske modus-navn. Gjenbruk den — ikke skriv nye oversettelser.
- **`formats.short_description`** (DB) er admin-rettet (terse, wizard-scanning). Den player-rettede guiden er en separat, vennligere kilde — mild duplisering er bevisst (ulike målgrupper).
- **Destructive-flyt-konvensjonen** (dedikerte `/slett`-sider, ikke `<details>`) gjelder KUN destruktive handlinger. Dette er ren info — en utvidbar disclosure (native `<details>` eller client-toggle) er helt akseptabelt her.
- **Reduced-motion:** globals.css demper animasjoner ved iOS «Reduser bevegelse». Evt. utfoldings-animasjon må respektere `prefers-reduced-motion`.

## Design

### 1. Innholdskilde — `lib/formats/modeGuide.ts`

Statisk, klient-trygt TS-modul (ingen `server-only`, ingen server-imports) slik at både server-pages og en client-komponent kan importere den:

```ts
import type { GameMode } from '@/lib/scoring/modes/types';

export type ModeGuide = {
  /** Ett-setnings sammendrag, alltid synlig. Player-vennlig, ikke admin-terse. */
  summary: string;
  /** 2-3 korte punkter: «slik teller poeng», «slik vinner du», evt. lag/solo. */
  points: string[];
};

export const MODE_GUIDE: Record<GameMode, ModeGuide> = { ... };
```

Innhold: **korte regler** per modus (nivå valgt av bruker) — ett-setnings sammendrag + 2–3 punkter. Bokmål, sporty kompis-stemme. **Kjør `humanizer:humanizer`-skillet på all ny norsk copy før commit** (per CLAUDE.md). Eksempel-form (best_ball):

```
summary: "Dere er to på lag. På hvert hull teller det beste netto-resultatet av dere to."
points: [
  "Begge spiller hele runden — men bare den beste scoren per hull blir lagets.",
  "Netto = slag minus tildelte slag (handikap) på hullet.",
  "Lavest lagtotal vinner.",
]
```

Alle 9 moduser må ha en entry: `best_ball`, `stableford`, `singles_matchplay`, `solo_strokeplay`, `texas_scramble`, `fourball_matchplay`, `foursomes_matchplay`, `wolf`, `nassau`.

### 2. Gjenbrukbar komponent — `components/ModeGuideCard.tsx`

Én komponent, to hjem (spill-side + oppslagsverk). Viser:
- **Alltid synlig:** modus-navn (`MODE_LABELS[mode]`) + `summary`.
- **Utvidbart:** en «Slik funker det»-affordance (tapp for å folde ut `points` som punktliste). Lukket som default.

Krav: tappbar (hele headeren, ≥44px tap-target), tastatur-tilgjengelig (`aria-expanded` / native `<summary>`), respekterer `prefers-reduced-motion`. Mekanisme (native `<details>` vs client-toggle) er Claude's discretion — begge OK her.

### 3. Spill-side — `app/games/[id]/page.tsx`

Legg til et **«SPILLFORM»-kort** (Kicker «SPILLFORM» + `ModeGuideCard mode={game.game_mode}`) i game-home-layouten, synlig for spilleren uavhengig av status (draft/active/finished). `game.game_mode` hentes allerede. Plasser logisk nær BANE / DIN INFO. Den eksisterende «Individuell stableford-turnering»-undertittelen kan beholdes eller fjernes som overflødig — Claude's discretion.

### 4. Oppslagsverk — `app/spillformer/page.tsx`

Authenticated player-rettet side som lister **alle** modusene, hver som en `ModeGuideCard` (samme utvidbare mønster). Driv listen fra `MODE_GUIDE` i en fornuftig lærings-rekkefølge (Claude's discretion; default kan være MODE_LABELS-rekkefølge). Bruk `AppShell` + `TopBar`/`PageHeader` som resten av appen. Ingen `proxy.ts`-endring — siden ligger bak den vanlige auth-gaten.

### 5. Hjem-inngang — `app/page.tsx`

Legg til en `<Section>`-tile i hjem-navet (samme mønster som «Profil»/«Sekretariatet»-tiles) som lenker til `/spillformer`. Tittel f.eks. «Spillformer» eller «Slik spiller du». Synlig for alle innloggede spillere.

## Edge Cases & Guardrails

- **Manglende guide-entry:** `MODE_GUIDE` er typet `Record<GameMode, ModeGuide>` — TS-compileren tvinger alle 9 moduser. En completeness-test (Type A) verifiserer ikke-tomt innhold.
- **Ukjent/legacy `game_mode`** på en gammel game-rad: `ModeGuideCard` må ikke krasje. Fall tilbake til kun modus-navn (eller `short_description`) hvis ingen guide finnes. Siden typen er total er dette mest et runtime-safety-nett.
- **Tett spill-side:** SPILLFORM-kortet må være lukket som default så det ikke skyver «tast inn slag»-CTA-en nedover.
- **Ingen norsk copy assertes i tester** (E2E/Type C) — bruk `data-testid`/role per test-disiplin.

## Key Decisions

- **Plassering:** spill-side-kort + eget `/spillformer`-oppslagsverk — *begge*, drevet av samme komponent (bruker valgte dette).
- **Interaksjon:** utvidbar «Slik funker det» (lukket default) — holder den tette spill-siden rolig; matcher brukerens «tapp modus → se info»-instinkt.
- **Innholdsdybde:** korte regler (sammendrag + 2–3 punkter) — nok til å tørre, ikke en regelbok.
- **Innhold i kode, ikke DB:** `MODE_GUIDE` er en statisk TS-modul, ikke en ny `formats`-kolonne. Innholdet er statisk (golf-regler endres ikke), version-controlled, humanizer-sjekkbart og testbart uten migrasjon/admin-UI. Admin-redigerbar copy er bevisst utsatt (se Out of Scope).

**Claude's Discretion:**
- Disclosure-mekanisme (`<details>` vs client-toggle), så lenge den er tilgjengelig + reduced-motion-vennlig.
- Rekkefølge på modusene i oppslagsverket.
- Hjem-tile-tittel og nøyaktig plassering av SPILLFORM-kortet på spill-siden.
- Om «Individuell stableford-turnering»-undertittelen beholdes.
- Eksakt bokmål-copy per modus (korte regler), etter humanizer-pass.

## Success Criteria

- [x] `lib/formats/modeGuide.ts` finnes og eksporterer `MODE_GUIDE: Record<GameMode, ModeGuide>` med entry for alle 9 moduser, hver med ikke-tom `summary` og ≥2 `points`. **Evidens:** [lib/formats/modeGuide.ts](lib/formats/modeGuide.ts); Type A-test grønn (20 cases, `npx vitest run lib/formats/modeGuide`).
- [x] `components/ModeGuideCard.tsx` viser modus-navn + summary alltid, og folder ut `points` ved interaksjon. **Evidens:** [components/ModeGuideCard.tsx](components/ModeGuideCard.tsx) — native `<details>`/`<summary>`, points i `<ul>`; Type C render-test bekrefter lukket-default + antall punkter.
- [x] Spillerens game-side (`app/games/[id]/page.tsx`) viser et SPILLFORM-kort med `ModeGuideCard` for spillets modus. **Evidens:** [app/games/[id]/page.tsx](app/games/[id]/page.tsx) — SPILLFORM-kort i `scheduled`-blokken (etter roster-Card) og i draft/active/finished-blokken (etter BANE-kort).
- [x] `/spillformer` lister alle modusene som utvidbare `ModeGuideCard`-rader. **Evidens:** [app/spillformer/page.tsx](app/spillformer/page.tsx) — `MODE_ORDER` med 9 moduser; bygger som statisk rute (○) i `next build`.
- [x] Hjem-siden har en lenke/tile til `/spillformer`. **Evidens:** [app/page.tsx](app/page.tsx) — `<Section label="Spillformer">` → `SmartLink href="/spillformer"`.
- [x] Versjon bumpet (minor — ny bruker-synlig feature) + CHANGELOG-oppføring i samme commit som bruker-synlig endring. **Evidens:** 1.44.2 → 1.45.0 (package.json), CHANGELOG 1.45.y-serie; commit `5333bf5` passerte commit-msg-hook.

## Gates

- [x] `npm run lint` passerer (scoped til endrede filer OK) — clean på alle 5 endrede/nye filer.
- [x] `npx vitest run lib/formats components/ModeGuideCard` (ny Type A + Type C) grønne — 22 tester.
- [x] `npm run test` — full suite grønn før PR (ingen regresjon) — 1803 tester, 156 filer.
- [x] TypeScript: mine filer rene (`npx tsc --noEmit` viser 13 feil, alle pre-eksisterende `*.test.ts`, identisk antall før/etter; `next build` fullfører).
- [ ] **Playwright/Preview-MCP (frontend touched, mandatory):** verifiser (a) SPILLFORM-kort på en game-side folder ut, (b) `/spillformer` rendrer ≥9 kort, (c) hjem-tile lenker dit — *delegeres til formell evaluator.*
- [x] `humanizer:humanizer`-skill kjørt på all ny norsk copy (modeGuide + UI-strenger) før commit — 4 tells fikset (em-dash, «hen», «i forhold til»).
- [x] commit-msg-hook passerer (version-bump + CHANGELOG for `feat(...)`) — commit `5333bf5`.

## Files Likely Touched

- `lib/formats/modeGuide.ts` — **ny**: statisk MODE_GUIDE-katalog (korte regler per modus)
- `lib/formats/modeGuide.test.ts` — **ny**: Type A completeness-test
- `components/ModeGuideCard.tsx` — **ny**: gjenbrukbar utvidbar modus-kort
- `components/ModeGuideCard.test.tsx` — **ny**: Type C render-test (expand/collapse)
- `app/spillformer/page.tsx` — **ny**: oppslagsverk-side
- `app/games/[id]/page.tsx` — legg til SPILLFORM-kort
- `app/page.tsx` — legg til /spillformer-tile
- `package.json` + `CHANGELOG.md` — version-bump (minor) + oppføring

## Out of Scope

- **Admin-redigerbar guide-copy** (ny `formats.how_to_play`-kolonne + FormatsManager-textarea). Utsatt — innholdet er statisk nok for kode-basert v1. Egen kontrakt hvis ønsket senere.
- **Fulle regler m/ eksempler / illustrasjoner per modus.** v1 er korte regler.
- **Endring av `short_description`** i `formats`-tabellen eller wizard-FormatGrid-en (admin-flaten).
- **Modus-info i invitasjons-mailen** (lib/mail/inviteNotification.ts). Kan vurderes senere.
- **Ny modal/bottom-sheet UI-primitive** — disclosure løses med `<details>`/client-toggle, ikke et nytt felles overlay-system.
