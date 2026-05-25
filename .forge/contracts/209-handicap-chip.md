# Contract: Alltid-synlig handicap-chip på hjem-siden

**Issue:** [#209](https://github.com/jdlarssen/golf-app/issues/209)
**Type:** MINOR (bruker-synlig feature)
**Versjon:** `1.19.0` → `1.20.0`

## Problem

I dag er handicapen til spilleren bare synlig inne på `/profile` eller i venterommet på et scheduled spill (etter at #168 landet handicap-prompt-kortet). For passiv oppdagelse av at handicapen er gammel — uten at appen må mase med modaler eller prompt-kort — trenger vi et alltid-synlig speil på hjem-siden. Spilleren åpner appen → ser tallet → oppdager selv at den ikke har vært oppdatert på lenge → tap → oppdater. Ett tap fra inngangen, ikke fire klikk gjennom profil-menyen.

Komplementerer #168 (aktiv mas-trigger i scheduled-kontekst) med passiv synliggjøring uansett tilstand.

## Research Findings

Ingen eksterne biblioteker er sentrale. Alt bygger på etablert intern stack: `components/ui/PageHeader.tsx`-komponenten har allerede et `action?: ReactNode`-slot (verifisert) — naturlig sted å henge chippen i non-empty state. `lib/handicap/staleness.ts` (fra #168) eksporterer `isHandicapStale()` og er klar for gjenbruk for fargekoding. `safeNextPath()` + `?next=`-redirect-mekanikken (også fra #168) gjenbrukes for tap-til-å-oppdatere-flyten.

Brand-palette-regel fra CLAUDE.md: «Accent: #C9A961 (champagne gold) — kun til vinnere/highlights». Stale-tilstanden teller som highlight (vi vil at den skal stikke seg ut), så accent-bruk er innenfor regelen.

## Prior Decisions

- Fra [#168](https://github.com/jdlarssen/golf-app/issues/168) (`lib/handicap/staleness.ts`): `HANDICAP_STALENESS_WEEKS = 4`. Samme terskel her — én sannhets-kilde.
- Fra [#168](https://github.com/jdlarssen/golf-app/issues/168) (`app/profile/safeNext.ts`): `?next=`-mekanikken er sikret mot open-redirect. Gjenbrukes for chip-tap → `/profile?next=/`.
- Fra [#168](https://github.com/jdlarssen/golf-app/issues/168) (CHANGELOG-disiplinen): version-bump-hook krever `package.json` + `CHANGELOG.md` i samme commit som `feat(...)`-prefiks.

## Design

### Komponent

Ny `<HandicapChip />` i `components/handicap/HandicapChip.tsx` (samme mappe som `HandicapConfirmCard` fra #168). Server-component (ingen klient-state). Layout som klikkbar pill:

```
┌─────────────┐
│  HCP 18,4   │   ← fresh
└─────────────┘

┌─────────────┐
│  HCP 18,4   │   ← stale (champagne-accent border + accent-text på tallet)
└─────────────┘
```

API:
```tsx
<HandicapChip
  hcpIndex={number}
  handicapUpdatedAt={string}   // ISO
  nextPath="/"                  // hvor brukeren skal tilbake til etter lagring
/>
```

Renderer som `<SmartLink href="/profile?next={nextPath}">` med:
- Pill-form (rounded-full)
- Padding som gir ≥ 44×44 tap-target (`min-h-[44px] px-3.5`)
- «HCP » i `font-sans text-[10px] uppercase tracking-[0.16em] text-muted` (etter `StatusChip`-mønsteret)
- Tallet i `font-serif text-[15px] tabular-nums` ved siden av («18,4»-format med norsk komma via `toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })`)
- Border (`border border-border`) + nøytral bg (`bg-surface`) som default
- **Når stale:** `border-accent/60 + text-accent` på tallet. Subtil men distinkt.

### Plassering — to states

**Non-empty state ([app/page.tsx:236](app/page.tsx:236)):**
```tsx
<PageHeader
  title={`Hei, ${profile?.name ?? 'spiller'}.`}
  action={<HandicapChip hcpIndex={...} handicapUpdatedAt={...} nextPath="/" />}
/>
```
`PageHeader`-API-en støtter dette out of the box — ingen utvidelser kreves.

**Empty state ([app/page.tsx:165-196](app/page.tsx:165-196)):**
Chippen plasseres rett under welcome-paragrafen, før CTA-knappen. Midtstilt for å speile center-hierarkiet:

```tsx
<p className="mt-3 ...">{canCreateGame ? '...' : '...'}</p>
<div className="mt-5">
  <HandicapChip hcpIndex={...} handicapUpdatedAt={...} nextPath="/" />
</div>
{canCreateGame && <div className="mt-8 w-full max-w-[280px]">...</div>}
```

### Data-fetch

[app/page.tsx:101-105](app/page.tsx:101-105) henter allerede `profile` i én query. Utvides:
```ts
.select('name, email, is_admin, profile_completed_at, hcp_index, handicap_updated_at')
```
Ingen ny round-trip. `hcp_index` og `handicap_updated_at` finnes alt etter migrasjon 0034.

### Stale-deteksjon

Gjenbruker `isHandicapStale(profile.handicap_updated_at)` fra `lib/handicap/staleness.ts`. Render-tid på server-component — ingen klient-state.

### Tap-flyt

Tap → `/profile?next=/` → spilleren lander i profil-form-en → lagrer → redirectes tilbake til `/`. Hele flyten er allerede bygget i #168 (`updateProfile` + `safeNextPath`). Verifisert: `safeNextPath('/')` returnerer `'/'` (passer `startsWith('/') && !startsWith('//')`).

### Brukervendt tekst (humanizer-pass)

- **Chip-label:** «HCP» (etablert golf-kortform, bevisst engelsk lokal-konvensjon)
- **Tall-format:** norsk komma (`18,4`), én desimal
- **Tagline (CHANGELOG):** «Handicapen din vises nå øverst på hjem-siden, alltid synlig. Tap for å oppdatere. Hvis den ikke har vært bekreftet på fire uker, får den en aksent-farge — så du oppdager selv at den er gammel uten at appen må mase.»

Tagline kjøres gjennom `humanizer:humanizer`-skillet før commit (fanger eventuelle anglisismer).

## Edge Cases & Guardrails

- **`hcp_index = 54.0` (default fra onboarding):** Vises som «HCP 54,0» som vanlig. Vi kan ikke skille «aldri satt» fra «faktisk beginner» (begge er gyldige `54.0`-verdier).
- **`profile` mangler / query feiler:** Hjem-siden redirecter alt til `/complete-profile` hvis `profile_completed_at` mangler. Hvis selve query-en feiler, kaster vi (eksisterende `throw profileError`-mønster). Chippen vises bare når vi har gyldig profile — defensiv: render bare hvis `hcp_index != null`.
- **Stale-fargen + dark mode:** `text-accent` og `border-accent` er definert i `app/globals.css` for begge themes. Verifiseres visuelt i prod (Vercel preview) — ikke i kode-spec.
- **Tap-target på mobil:** `min-h-[44px]` på pillen pluss padding. Tilfredsstiller mobile-first-prinsippet i CLAUDE.md.
- **Loading state:** `HomeBody` rendres i `<Suspense>` — chippen kommer med når hovedinnholdet kommer. Ingen separat skeleton for chippen alene.
- **Stale rendering pga. cache:** `app/page.tsx` er ikke `unstable_cache`-wrappet — request-scoped, så bumper på `handicap_updated_at` reflekteres umiddelbart ved neste nav til `/`.
- **Tap mens på spilloversikten (active game):** Chippen er bare på `/`, ikke på `/games/[id]`. Tap-flyten der dekkes av #168-kortet.

## Key Decisions

- **Innhold:** «HCP 18,4»-format. Label + tall — selvforklarende, golf-idiomatisk.
- **Plassering:** Begge states. Non-empty bruker `PageHeader.action`-slot, empty plasserer den midtstilt under welcome-paragrafen.
- **Stale-signal:** Subtil champagne-accent (border + tekst-farge på tallet). Bruker eksisterende `isHandicapStale` med 4-uker-terskel.
- **Tap-flyt:** `/profile?next=/` — gjenbruker hele safeNext-mekanikken fra #168.
- **Hcp-format:** Norsk komma via `toLocaleString('nb-NO', ...)`. Konsistent med #168-kortet.
- **«HCP» som label:** Engelsk forkortelse er bevisst — det er etablert golf-kortform også på norsk. Ikke kjør gjennom humanizer som anglisisme.
- **Bare ett `next`-target:** Alltid `/` fra chippen. Ingen need for kompleks state-passing.

**Claude's Discretion:**
- Eksakte Tailwind-klasser for chip-stylingen kan justeres for visuell balanse i bygge-fasen. Ledende prinsipp: pill-form, ≥44px tap-target, tabular-nums på tallet.
- Hvorvidt vi snapshot-tester chippen (fresh + stale i `HandicapChip.test.tsx`). Foreslår én enkel component-test for begge tilstander.
- Plassering i empty-state kan finjusteres visuelt — under paragrafen er forslaget, men «mellom medallion og kicker» er en alternativ vi kan prøve hvis det første ikke balanserer.
- Skal vi legge chippen i `BrandMark + NotificationBell`-raden ([app/page.tsx:59](app/page.tsx:59)) istedenfor `PageHeader.action`-slot? Foreslår nei — det blir tre elementer på samme rad og overstadelig. `PageHeader.action` er rettere semantisk.

## Success Criteria

- [ ] **K1:** `components/handicap/HandicapChip.tsx` finnes. Eksporterer `<HandicapChip hcpIndex handicapUpdatedAt nextPath />`. Renderer pill med «HCP» + tall, klikkbar til `/profile?next={nextPath}`. Brukes både i non-empty og empty state på `/`.
- [ ] **K2:** Stale-tilstand (≥ 4 uker per `isHandicapStale`) gir distinkt visuell behandling (champagne-accent border + text-accent på tallet). Fresh-tilstand er nøytral. Verifiseres ved component-test som rendrer begge.
- [ ] **K3:** `app/page.tsx` `HomeBody`-query utvidet med `hcp_index, handicap_updated_at`. Verifiseres ved grep — én select-streng oppdatert, ingen ny round-trip.
- [ ] **K4:** Non-empty state rendrer `<PageHeader action={<HandicapChip ... />} />`. Empty state rendrer `<HandicapChip />` midtstilt under welcome-paragrafen.
- [ ] **K5:** Tap på chippen tar deg til `/profile?next=%2F`. Etter lagring av profil havner du tilbake på `/`. Hele flyten er bygget på eksisterende `safeNextPath`-mekanikk fra #168 — ingen nye redirect-kodebaner.
- [ ] **K6:** Eksisterende test-suite grønn (`npm test`). Ingen regresjon i `/`-rendering.
- [ ] **K7:** `npm run lint` (ingen nye errors utover pre-eksisterende `e2e/sync/offline-sync.spec.ts`-warnings) + `npm run build` grønne.
- [ ] **K8:** Version bumpet `1.19.0` → `1.20.0`. CHANGELOG-oppføring under ny `1.20.y`-serie med stakeholder-tagline. Forrige `1.19.y`-serie wrappes i `<details>`. Tagline kjørt gjennom `humanizer:humanizer`-skillet før commit.

## Gates

Kjøres etter hver chunk:

```bash
npm run lint
npm test
npm run build
```

Scope `npm test` til endrede områder underveis (`npm test -- HandicapChip`), full suite før evaluator.

Ingen Playwright/E2E kreves — manuell prod-verifisering på Vercel preview-URL er raskere for denne størrelsen (per `feedback_production_only_testing`-mønsteret fra #168).

## Files Likely Touched

| Fil | Status | Hva |
|---|---|---|
| `components/handicap/HandicapChip.tsx` | NY | Selve komponenten |
| `components/handicap/HandicapChip.test.tsx` | NY | Component-test (fresh + stale rendering) |
| `app/page.tsx` | ENDRET | Utvide profile-query, rendre chippen i begge states |
| `package.json` | ENDRET | `1.19.0` → `1.20.0` |
| `CHANGELOG.md` | ENDRET | Ny `1.20.y`-serie, wrappe `1.19.y` i `<details>` |

## Out of Scope (eksplisitt)

- Ingen utvidelse av `PageHeader`-API — `action`-slot finnes alt
- Ingen «Sett HCP»-CTA for `54.0`-default (kan ikke skille fra ekte beginner)
- Ingen chip på andre sider enn `/` (på `/games/[id]` finnes #168-kortet allerede; admin-flater trenger ikke)
- Ingen klikkbar tooltip eller pop-out med utvidet info («sist oppdatert YYYY-MM-DD»). Stale-fargen er signalet — ekstra info finnes i venterommet via #168-kortet.
- Ingen prompt-modal eller sterk warning ved stale — beholder den vennlige tonen
- Ingen mail/push-trigger basert på chippen
- Ingen historie-tabell — kun nåtidens verdi

## Commits-plan (atomiske)

1. `feat(handicap): add HandicapChip component with stale styling` — komponenten + test (NY mappe-content, ingen call-sites ennå → `chore:` eller `feat:`? Bruker `chore:` siden alene er ikke bruker-synlig)
2. `feat(home): show handicap chip in header and empty state` — wire-up i `app/page.tsx` + version-bump 1.19.0 → 1.20.0 + CHANGELOG-oppføring

Commit 2 utløser version-bump-hooken — bumper og legger til CHANGELOG i samme commit.

## Ut-av-scope-funn å notere underveis

Hvis bygge-subagenten finner:
- Snapshot-tester på `/`-siden som låser nåværende header-layout: oppdateres som del av K6
- Visuell konflikt mellom chip og NotificationBell på smale skjermer: justeres ved bygge-fasen, noter ellers
- `app/page.tsx` har eksisterende komment-blokker som blir misvisende av endringen: oppdater som del av relevant commit

Andre funn → ny GitHub-issue per `feedback_review_findings_as_issues`.
