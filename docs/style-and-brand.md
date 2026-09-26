# Stil og brand

> Flyttet ordrett fra CLAUDE.md (#2100). Leses når du bygger UI, velger farger eller skriver brand-copy.

### Stil

- Forest-and-champagne palett (definert i `app/globals.css`; hele systemet oppsummert for agenter i `DESIGN.md`, og `app/__tests__/design-md-tokens.test.ts` holder hex-verdiene her og der i takt med globals.css):
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

### Designverktøy

Fem designverktøy ble innført i #2240 (kilder og lisenser i `.claude/skills/README.md`).
Merkevaren over og `DESIGN.md` vinner over alle fem.

| Verktøy | Bruk når | Tørny-regel |
|---|---|---|
| `web-design-guidelines` (Vercel) | Du reviderer UI-kode for tilgjengelighet og UX, eller før en UI-PR | Norsk skikk vinner over engelske regler: setningsstil, «», ingen Title Case |
| `playwright-cli` (Microsoft) | Du må se eller drive en side i ekte nettleser: skjermbilde, 390 px, mørk modus, interaktive staging-punkter | Kun localhost/staging, aldri prod; `localhost`, aldri `127.0.0.1` |
| `design-taste-frontend` (Taste Skill) | Du endrer en offentlig markedsflate (forsiden for utloggede, `hvorfor-torny`, `arranger-golfturnering`, `spillformater`, delingsbilder) | Aldri app-skjermer; rådet mot Inter gjelder ikke; utseende-endringer er produktvalg |
| Image-to-Code (regel, ingen skill) | Eieren sender et skjermbilde, en skisse eller et bilde av en app og vil ha noe «sånn» | Strukturen hentes fra bildet, stilen fra `DESIGN.md`. Finn det Tørny alt har før du bygger nytt, og legg utseende-endringer fram som produktvalg. Sammenlign resultatet med bildet med `playwright-cli` på 390 px |
| `DESIGN.md` («Awesome Design») | Alltid ved UI-arbeid: tokenene, komponentene og gjør/ikke gjør | Hjemmet for verdiene er `app/globals.css` |
