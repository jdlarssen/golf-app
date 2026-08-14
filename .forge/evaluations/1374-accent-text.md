# Evaluering: #1374 accent-text

**Verdikt: ACCEPT**

Evaluert commit: `e43e0fad` (eneste commit foran merge-base `dd7b5d54`; de store
slettelinjene i `origin/main..HEAD` er kun at branchen ligger 5 commits bak main
(#1380-veiviserarbeidet) — ikke en del av endringen. Selve endringen er 21 filer,
+60/−38.)

## Kriterier

- **S1 — alle siterte flater sweepet: PASS.** 13 podium-filer (AceyDeucey,
  BingoBangoBongo, Nassau, Nines, Patsome, RoundRobin, Shamble, Skins,
  SoloStableford, SoloStrokeplay, TeamStableford, TexasScramble, Wolf) bytter
  vinnertall + delt-plass-merke til `text-accent-text`; `ScoreCard.tsx:194`
  bytter inline `var(--accent)` → `var(--accent-text)` (inline-stilen er
  håndtert, ikke bare klasse-sweep); `Kicker.tsx` accent-tone →
  `text-accent-text` (dekker leaderboard-header `LeaderboardChrome.tsx:129` og
  `RevealBruttoView.tsx:51` — verifisert at RevealBrutto ikke har annen direkte
  accent-tekst); `State4View.tsx` Leder-badge + 64px-tall + TeamRow-poeng;
  `admin/games/[id]/status/page.tsx:160`; `HandicapChip.tsx:37` stale.
  **Kontrast gjenberegnet uavhengig (WCAG-relativ luminans):** #7d6224 vs
  #f8f6f0 = **5,33**, vs #f0ede5 = **4,93**, vs 8 %-plint (composite selv
  utledet: 0,08·#c9a961 + 0,92·#f8f6f0 = **#f4f0e5**) = **5,06** — byggerens
  5,33/4,93/5,06 bekreftet eksakt. Bonus: Nassau-unit-badgen (12 % tint over
  plinten → #efe7d5) = **4,68**, matcher commit-meldingens tall; selv over
  mørkeste plausible composite (12 % over surface-2) måles 4,58 ≥ 4,5.
- **S2 — dark mode pikselidentisk: PASS.** `--accent-text: #d4b870` i BEGGE
  dark-blokker: media-query (`globals.css:168`) og `[data-theme]`
  (`globals.css:264`) — identisk med eksisterende dark `--accent: #d4b870`
  (`:164`/`:261`). Ingen manglende andre blokk.
- **S3 — dekor urørt: PASS.** TIER_ACCENT-konstantene (f.eks.
  `NassauPodium.tsx:270`) uendret i diffen; laurbærene i `State4View.tsx:374,378`
  (opacity-55, dekorative) og hover-tilstander beholder `text-accent`;
  `--accent-deep` #b89446 og brand-tagline/BrandMark ikke i diffen.

## Adversarielle sjekker

- **(a) `@theme`-registrering: PASS.** `--color-accent-text: var(--accent-text)`
  på `globals.css:332`; kompilert produksjons-CSS
  (`.next/static/chunks/11eovaeizsr9z.css`) inneholder
  `.text-accent-text{color:var(--accent-text)}` — utility-klassen eksisterer
  reelt, ikke bare i kildekoden. Build-artefakt fra 17:35, commit 17:36, tre ren.
- **(b) HandicapChip-test-stramming: PASS (reell).** Gammel assertion
  `toContain('text-accent')` ville passert på substring av `text-accent-text`;
  ny assertion `toContain('text-accent-text')` (`HandicapChip.test.tsx:63`)
  feiler ved regresjon til `text-accent`. Fresh-testens
  `not.toContain('text-accent')` (`:52`) står fortsatt og vokter (fresh bruker
  `text-text`).
- **(c) Ingen substring-stille tester: PASS.** Grep over alle testfiler:
  eneste `toContain('text-accent')` utenom HandicapChip er
  `LeaderboardBackdrop.test.tsx:18` (dekor-illustrasjon, IKKE sweepet — riktig).
  `FinishedGameCard.test.tsx:38,52` og `FinishedCupDayCard.test.tsx:70` bruker
  `querySelector('.text-accent')` — eksakt token-match, ikke substring, og
  flatene er ikke i sweep-listen.
- **(d) `--accent-deep` urørt: PASS.** Lys #b89446 (`:41`), dark #c9a961
  (`:165`/`:262`) — kun kommentaren endret.
- **(e) Ingen snapshot-churn: PASS.** Ingen `.snap`-filer i commit-statistikken.
- **(f) `messages/` urørt: PASS.** Ikke i diffen.

## Gates (kjørt selv, Node 22)

- `npx vitest run components/hole components/handicap components/ui
  "app/[locale]/games/[id]/leaderboard"` → **76 filer / 351 tester grønne**.
- `npm run lint` → **0 errors** (55 pre-eksisterende complexity-warnings).
- Full suite + build kjøres IKKE på nytt: endringen er rene
  klassestreng-/kommentar-bytter uten type-flate (ingen union-/switch-berøring →
  tsc-fella for GameMode gjelder ikke), byggeren kjørte begge to ganger, og jeg
  har uavhengig verifisert build-artefaktet (kompilert CSS med utility-regelen).

## Commit-hygiene

Én commit `fix(design): lesbar gulltekst på lyse flater via --accent-text`,
`Refs #1374` i body, `.changes/1374-lesbar-gulltekst.md` med gyldig frontmatter
(`type: fix`, `issue: 1374`) — validert via `weekly-release.mjs --dry-run`
(listes uten feil, bump 1.232.2 → 1.233.0).

## Funn

1. **`app/[locale]/games/[id]/leaderboard/*View.tsx` + `holes/*HolesView.tsx` +
   `formats/state3.tsx` — S1-tilgrensende, IKKE blokkerende.** Info-bærende
   gulltekst på lyse flater finnes fortsatt i live-visningene (state 3):
   leder-tall 28px (`BingoBangoBongoView.tsx:241`, `RoundRobinView.tsx:254`,
   `NinesView.tsx:267`, `ShambleView.tsx:259`), Wolf-poeng
   (`WolfView.tsx:372`), Skins-carry (`SkinsView.tsx:316,386`), unit-badges i
   holes-views (`NassauHolesView.tsx`, `NinesHolesView.tsx` m.fl.) — alle
   fortsatt `text-accent` (~2,1:1). Disse er utenfor kontraktens Success
   Criterion 1 (som kun siterer podium/ScoreCard/Kicker/State4View/admin/
   HandicapChip) og byggeren har trukket grensen konsistent med
   commit-meldingen — men samme sollys-argument gjelder. Kandidat for
   oppfølgings-issue, ikke ombygging her.

Kontraktens gate «staging-klikk i lys modus» gjenstår som PR-port
(staging-verify før merge, jf. #1076) — den ligger utenfor denne evalueringen.
