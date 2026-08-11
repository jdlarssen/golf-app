# Kontrakt: Lenk godkjennings-overriden fra avslutt-blindveien (#1360)

Kilde: kontrakt-kommentar på issue #1360 (kontrakt-smeden, verifisert mot koden av
fersk-kontekst-agent før postering). Dette er byggeøktens kopi med avkryssede
suksesskriterier + evidens. PR: #1568, branch `claude/1360-avslutt-godkjenn-lenke`.

## Problem

Når en oppretter prøver å avslutte og et levert scorekort mangler peer-godkjenning,
rendrer `app/[locale]/games/[id]/avslutt/page.tsx` kun en varselboks + «Tilbake til
spillet»-lenke. Copyen ber arrangøren be medspillerne godkjenne — et råd som ikke kan
følges når medspilleren har kjørt hjem. Verktøyet finnes allerede: creator-cockpiten
`/games/[id]/spillere` har godkjennings-overriden fra #429 (`id="leverte-scorekort"`),
men blindveien nevner den ikke. Admin-cockpiten fikk samme lenke for lenge siden —
creator-flaten fikk aldri paritet.

## Design (som bygget)

1. Ny sekundær pill-lenke i unapproved-grenen, FØR «Tilbake til spillet», samme stil:
   `href={detailPath}/spillere#leverte-scorekort`, nøkkel `game.finish.approveOverrideCta`
   («Godkjenn på vegne av gruppa»).
2. Ny setning `game.finish.approveOverrideNote` rendret etter `unapprovedNote`:
   «Får du ikke tak i dem, kan du som arrangør godkjenne på vegne av gruppa under
   «Styr spillere».» (humanizer kjørt — ingen tells).
3. Begge locales (no + en).
4. Stale-kommentaren :109–110 presisert (endGame-sperren står; utveien via #429 nevnes).
5. Anker-navigasjon: ren hash-lenke — kontraktens ASSUMPTION (Link med hash på tvers av
   ruter scroller ved landing) BEKREFTET på staging; scroll-fallbacken trengs ikke.

## Suksesskriterier

- [x] På `/games/[id]/avslutt` med ugodkjente kort: ny lenke + ny setning vises; lenken
  navigerer til `/games/[id]/spillere` og siden er FAKTISK scrollet til
  `#leverte-scorekort`-seksjonen.
  **Evidens:** Playwright-driver mot staging-build (branch-versjon 1.232.1 i footer):
  desktop 1280×720 — `avslutt:override-link-visible PASS` (lenketekst «Godkjenn på vegne
  av gruppa», noteHits=1), tap-target h=50px ≥ 44; mobil 375×667 — hash bevart
  (`#leverte-scorekort`), scroll fyrte ved navigasjonen (scrollY 33 > 0), seksjonen i
  viewport (top=362 av 667). Skjermbilder: 1360-avslutt-mobile.png,
  1360-spillere-mobile-scrolled.png (postet på PR #1568).
- [x] Nye nøkler i både `no.json` og `en.json`; paritet verifisert; ingen hardkodet norsk.
  **Evidens:** `npx vitest run messages/catalogParity.test.ts messages/apostropheParity.test.ts`
  → 2 filer / 4 tester PASS. Strengene rendres via `t('approveOverrideNote')` /
  `t('approveOverrideCta')`.
- [x] Stale-kommentaren `avslutt/page.tsx:109–110` presisert.
  **Evidens:** ny kommentar :109–111 («endGame bounces unapproved scorecards. The
  creator's sanctioned way out is the approval override on /spillere (#429) …»).
- [x] `fix` + patch-bump + CHANGELOG-linje.
  **Evidens:** commit c714ec54 — `fix(game): …`, package.json 1.232.0→1.232.1,
  CHANGELOG-linje under August 2026 (`1.232.1 · #1360`).
- [x] Staging-klikkrunde av berørt flyt før merge.
  **Evidens:** full flyt kjørt mot staging (spill m/ peer-approval, ett levert uapprovet
  kort): /avslutt viste lenken → fulgte den (scroll bekreftet) → godkjente som arrangør
  via overriden (`approved_at` satt i DB, verifisert via service-role SELECT) → tilbake
  på /avslutt: lenken borte, ren bekreftelse → «Avslutt spillet» → `games.status =
  'finished'` i DB. Prod-vakt: alle supabase-kall gikk mot snwmueecmfqqdurxedxv (0
  fremmede origins).

## Gates

`npm run typecheck` (0 feil) · `npm run lint` (0 errors) · `npx vitest run messages/*`
(PASS) · `npm run build` (grønn) · pre-push-gate grønn ved push.

## Out of Scope (uendret fra kontrakten)

- Admin-flaten (har allerede tilsvarende lenke).
- Endringer i override-mekanikken (`adminApproveScorecard`).
- `?error`-rendering på `/games/[id]` (#1361 — egen PR #1569).
