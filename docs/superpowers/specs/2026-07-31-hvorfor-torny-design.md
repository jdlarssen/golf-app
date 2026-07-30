# Design: `/hvorfor-torny` — public comparison page

**Issue:** #1419 · **Date:** 2026-07-31 · **Status:** approved by owner (mockup v3, «det sitter for nå»)
**Approved mockup (canonical for structure + Norwegian copy):** `2026-07-31-hvorfor-torny-mockup.html`

## Background and intent

Owner request: a public «Dette får du i Tørny vs. andre golf-apper» page. This is an
explicit owner order, which overrides the feature freeze in `docs/hva-er-nok.md`
(«Eieren overstyrer alltid»).

Decisions made during brainstorming (each confirmed by owner):

1. **Own public page** at `/hvorfor-torny` — not a section on the front page, not part
   of pillar page #1267 (when #1267 is built it should link here).
2. **Generic comparison** — never name competitors (Golf Gamebook etc.). Claims about
   «andre apper» stay soft («Krever abonnement», «Varierer», «Engelsk først») so
   nothing on the page can rust when competitors change pricing.
3. **Positive framing** — owner rejected a «Dette er Tørny ikke» honesty section;
   the page sells what Tørny *has*. Contrast lives only in the matrix column.
4. **Visual over textual** — owner rejected mockup v1 as «mye tekst og lite visuelt».
   v3's stat tiles / check matrix / mini leaderboard ARE the design; do not reintroduce
   prose blocks.

## Hard copy constraints (owner-anchored — do not drift)

- **App framing:** Tørny native apps are coming (epic #1276). Never claim «ingen app
  å installere» as if no app exists. The selling point is: participants never *need*
  to install anything — «Bli med rett fra nettleseren» / «Alle må ha appen» (others).
  FAQ answer holds true post-app-launch by design.
- **Never promise «gratis for alltid».** Copy describes the present («0 kr», «Uten
  abonnement. Uten reklame.»). Capacity analysis 2026-07-31: free tiers hold to club
  scale; first real ceiling is Resend's 100 mails/day. No forever-promises.
- **Norwegian copy in the mockup is final** — already washed with the humanizer and
  no-nb skills (fixed: særskriving «gratisversjonen», anglicism «og opp», em-dash
  chains, «Norske baner er innebygd» overclaim). Lift it verbatim into the `no`
  catalog. English catalog: translate by intent (no-nb principles in reverse), not
  word-for-word.
- Matrix heading «Tørny mot resten» is deliberate brand voice (owner saw it twice and
  kept it). Leaderboard sample names (Kristian/Marte/Jonas) and «Fredagsgolfen · Runde 3»
  are fictional and fine.

## Page structure (mirror mockup v3 exactly)

1. Top row: BrandMark + LocaleSwitcher + «Logg inn» (same as AnonLanding).
2. Hero: h1 «Dette får du i Tørny» + one line «Laget for én ting: turneringen deres.»
3. **Stat tiles** (2×2): `0 kr` (gold accent) / `20+` spillformater / `2 min` /
   `150` deltakere. Fraunces serif values, proportional figures (NOT `tabular-nums` —
   large standalone numbers use proportional figures; tabular is for columns only).
4. **Check matrix** «Tørny mot resten»: 8 rows, ✓-circle for Tørny, short muted note
   for «Andre apper». Rows and notes exactly as in mockup.
5. **Mini leaderboard** «Spenningen er innebygd»: static sample card (live dot, gold
   leader row with 🏆, `tabular-nums` on points column) + three chips (⛳ Nærmest
   pinnen, 🚀 Lengste drive, 💰 Premiepott). Pure presentation, no data fetch.
6. **Three icon points** «Spisset for turneringen» + dark-green pull-quote card:
   «Tørny er det dere fyrer opp når dere spiller *mot hverandre*» (gold emphasis).
7. **FAQ** (3 items) — same array feeds visible FAQ and FAQPage JSON-LD (identical
   text by construction, same pattern as AnonLanding).
8. End CTA: «Klar for å fyre opp turneringen?» → primary «Prøv demoen» (/demo),
   text link «Eller kom i gang på ordentlig →» (/login).
9. Footer nav: Spillformater / Baner / Demo / Logg inn / Personvern.

## Technical design

- **Route:** `app/[locale]/hvorfor-torny/page.tsx`, server component, fully static,
  no DB access. Dark mode via existing token system (mockup shows light values only;
  use semantic Tailwind classes like AnonLanding so dark just works).
- **Auth:** add `hvorfor-torny` to `AUTH_OPTIONAL_PATH_PATTERN` in `proxy.ts`
  (NOT `PUBLIC_PATH_PATTERN` — public strips the verified-user header and logged-in
  visitors would lose the bottom nav; the exact #1185 trap).
- **i18n:** new `whyTorny.*` namespace in `messages/no.json` + `messages/en.json`
  (same catalog files the `landing.*` namespace lives in — verify actual file paths
  in-session; I1 applies).
- **Metadata + JSON-LD:** `generateMetadata` with title/description per locale;
  JSON-LD `@graph` with WebPage + FAQPage. Do NOT duplicate the WebSite/Organization
  nodes (they live on the front page).
- **Discoverability:** add route to `app/sitemap.ts` (both locales, same pattern as
  other public routes) and a `FooterLink` on AnonLanding («Hvorfor Tørny?»).
- **Component reuse:** `Card`/`LinkButton`/`SmartLink`/`LocaleSwitcher`/`BrandMark`
  from `components/ui/`. AnonLanding's local helpers (`SectionHeading`, `TextLink`,
  `FooterLink`) are needed here too — extract them to a small shared module (e.g.
  `app/[locale]/marketing-primitives.tsx` or similar) and import from both pages
  rather than duplicating. New page-specific pieces (stat tile, matrix row, chip)
  stay local to the new page.

## Testing (per docs/test-discipline.md)

- **One render test** for the page (Type C max): renders, `data-testid` anchor,
  FAQ JSON-LD script present. No copy assertions beyond what the render needs.
- Update `app/sitemap.test.ts` for the new URL.
- If proxy path-pattern tests exist, add `hvorfor-torny` cases (anon → 200, no
  login redirect). Check what exists before adding; no new test files beyond that.
- E2E: none (static page; the @gate flows don't touch it).

## Verification before merge

- `npm run build` + co-located tests.
- Staging click-through of `/hvorfor-torny` (both locales, light + dark, anon +
  logged-in) with screenshot posted on the PR + `staging-verified` label (per #1076).

## Out of scope

- Pillar page #1267 (links here later, separate issue).
- Any competitor-named SEO page.
- English marketing beyond the `en` catalog translation.
- CHANGELOG: this is user-visible (`feat`) → minor bump + Funksjon line, per
  versioning rules.
