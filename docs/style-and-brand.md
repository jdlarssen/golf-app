# Stil og brand

> Flyttet ordrett fra CLAUDE.md (#2100). Leses når du bygger UI, velger farger eller skriver brand-copy.

### Stil

- Forest-and-champagne palett (definert i `app/globals.css`):
  - Primary: `#1B4332` (deep forest)
  - Accent: `#C9A961` (champagne gold) — kun til vinnere/highlights
  - Bg: `#F8F6F0` (linen)
  - + dark-mode varianter
- Typografi: `font-serif` (Fraunces) for hierarki + tall, `font-sans` (Inter) for UI
- Tall i tabeller/leaderboards: ALLTID `tabular-nums`
- UI primitives: bruk eksisterende i `components/ui/` — ikke duplisér
- Mobile-first, tap-targets ≥44px

### Brand

- **Tagline (canonical):** «Tørny — fyr opp golfturneringen på et par minutter»
- **Subordinate form** (ved siden av BrandMark, for å unngå navn-repetisjon): «Fyr opp golfturneringen på et par minutter»
- **Brand-stemme:** Sporty kompis-energi. Action-verb framfor passiv beskrivelse. Norske idiomer framfor «smart»-engelsk.
- **Ballen på T-en** (#1985): T-en i merket er en tee, og en champagne-ball hviler midt på tverrstreken. Det gjelder app-ikonet, ordmerket «Tørny», delingsbildene og e-postene, og ingen flate har prikken etter «y» lenger. Ikon og e-postbilde lages av `native/assets/generate-icons.mjs`; på nett tegner bare `BrandMark` og `lib/og/wordmark.tsx` ballen, med forholdene fra `lib/brand/wordmarkBall.ts`.
- **BrandMark-subtitle** («Turnering» under logo) er logo-lockup, **ikke** tagline — endres ikke uten visuell redesign.
