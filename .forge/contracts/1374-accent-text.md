# Kontrakt: lesbar aksent-tekst på lyse flater — --accent-text-token (#1374)

## Problem

Paletten sier «accent kun til vinnere/highlights», men `text-accent` (#c9a961, ~2:1 mot lin/hvit) bærer informasjon på lyse flater: vinnerens poengtotal på podiene, «+N SLAG»-badgen på ScoreCard (`components/hole/ScoreCard.tsx:193` — felt-kritisk info, 9,5px), `Kicker` med `tone='accent'` (`components/ui/Kicker.tsx:8` → `text-accent`, 10px uppercase — bl.a. turneringsnavnet i leaderboard-headeren), «Leder»-badgen i State4View, admin-statuslabel og HandicapChip stale-tilstand. Appen brukes utendørs i sollys; ~2:1 er i praksis usynlig. `--accent-deep` (#b89446) finnes for formålet, men måler bare 2,64:1 (`app/globals.css:41`) — og Kicker bruker den ikke engang. Dark mode er OK (8,7:1). HCD-audit funn F33 (P2).

## Design (alternativ A — anbefalt)

1. Ny token i `app/globals.css`: `--accent-text` for lys modus = **#7d6224** (beregnet: 5,33:1 mot `--bg` #f8f6f0, 5,76:1 mot `--surface` #ffffff, 4,93:1 mot `--surface-2` #f0ede5, 5,06:1 mot champagne-plinten `bg-accent/[0.08]` ≈ #f4f0e5 — klarerer 4,5:1 på ALLE lyse flater i paletten; den først vurderte #8a6d2b faller til 4,17:1 på surface-2 og forkastes). I begge dark-mode-blokkene (media-query + `[data-theme]`) peker `--accent-text` på dagens dark-accent `#d4b870` → dark mode er uendret visuelt. Registrer `--color-accent-text` i `@theme`-blokken (samme mønster som `--color-accent-deep`, globals.css:319-320). Kontrasttallene gjenberegnes og dokumenteres i PR-en.
2. `Kicker` `tone='accent'` → `text-accent-text`.
3. Sweep meningsbærende tekst-bruk på lyse flater over på den nye tokenen: ScoreCard-badgen (`ScoreCard.tsx:193`), vinnertallet i alle **13** podium-filer, «Leder»-badgen + 64px-tallet (`State4View.tsx:382,386`), admin-statuslabelen (`admin/games/[id]/status/page.tsx:160`), HandicapChip stale (`components/handicap/HandicapChip.tsx:36`). NB: `text-accent` finnes i 59 komponent-filer totalt — sweep-grensen er «bærer tekstlig informasjon på lys flate», ikke alle treff; dekor-treff står.
4. Ren dekor beholder `--accent`: hairlines, borders, medaljer/medaljonger, ikoner ved siden av tekst.

## Edge Cases & Guardrails

- **Dark mode skal være pikselidentisk**: token-verdiene i begge dark-blokkene (media-query + `[data-theme]`) settes til eksisterende farge.
- **Koordinering med åpen PR #1593 (podium-refactoren som lukker issue #1573):** på DAGENS main hardkoder alle 13 podium-filer `text-accent` med per-fil-duplisert `TIER_ACCENT`; `podiumPresentation.ts` finnes først når #1593 er merget. Bygg på fersk `main` den natta: er #1593 inne, endres vinnertall-fargen i de delte konstantene (én gang); er den fortsatt åpen, sweep per fil — men IKKE innfør nye delte konstanter parallelt med #1593 (merge-konflikt-fabrikk).
- `--accent-deep` beholdes (brukes i tagline/brand-lockup) — men vurder i bygget om dens to-tre tekst-bruk også skal over på `--accent-text`; brand-taglinen er bevisst bevart og røres ikke uten videre.
- Stor tekst (podium-tall 32px) krever 3:1, småtekst 4,5:1 — #7d6224 oppfyller begge; bruk samme token overalt for enkelhet.
- Champagne-medaljen/medaljongen som GRAFISK element skal fortsatt være #c9a961 — det er tekst som endres.

## Key Decisions

- Én token + målrettet sweep, ikke global erstatning av `text-accent` (dekor skal beholde glansen).
- Dark mode uendret (tokenen peker på eksisterende verdi der).

## Alternativer (produktvalg)

**Anbefaling: Alternativ A** — mørkere gulltone for all meningsbærende gull-tekst; beholder champagne-identiteten i vinner-øyeblikkene og løfter alle flatene med én token.

**Alternativ A — mørk champagne-token (bygges):**
- Fordeler: gull-følelsen beholdes der den betyr noe (vinner-tall er fortsatt gull); én token løfter alle flater samtidig; dark mode urørt.
- Ulemper: mørkere gull er mindre «champagne» enn i dag; enda en farge-token å vedlikeholde; grensen «meningsbærende vs. dekor» krever skjønn per flate.

**Alternativ B — meningsbærende tekst i vanlig tekstfarge, gull kun som dekor:**
- Fordeler: maksimal lesbarhet (tekstfargen måler >12:1); færre spesialfarger i paletten; ingen ny token.
- Ulemper: vinnertallet mister gull-signaturen — podiet flater visuelt ut; mer per-flate-omlegging (badge-borders/medaljonger må bære highlighten alene).
- Ombyggingskostnad: liten–middels — samme flater, andre klasser; ingen datamodell-endring.

**Reversibilitet:** full — tokenverdien (eller valget A/B) kan endres når som helst uten datatap.

Svar «alternativ B» i PR-en, så bygges det om på samme branch. Ingen hast — PR-en venter til du svarer eller merger.

## Success Criteria

1. Alle flater sitert i issue-bodyen (podium-vinnertall ×13, ScoreCard-badge, Kicker accent, State4View-badge, admin-statuslabel, HandicapChip stale) leser ≥4,5:1 (småtekst) / ≥3:1 (≥24px) i lys modus — målt mot flatens FAKTISKE bakgrunn (inkl. `--surface-2` og accent-tintede plinter), med beregnede tall i PR-beskrivelsen.
2. Dark mode: ingen visuell endring.
3. Dekor-elementer (borders, hairlines, medaljer) bruker fortsatt #c9a961.

## Gates

- `tsc` + `lint` + `vitest` grønne; snapshot-diffs reviewes visuelt.
- Staging-klikk i lys modus: podium (ferdig spill), hull-side med tildelte slag (+N SLAG), leaderboard-header, HandicapChip stale.

## Files Likely Touched

- `app/globals.css` (token + @theme)
- `components/ui/Kicker.tsx`
- `components/hole/ScoreCard.tsx`, `components/handicap/HandicapChip.tsx`
- `app/[locale]/games/[id]/leaderboard/`-flater (13 podium-filer — via delte konstanter hvis #1593 er merget — samt `State4View.tsx`, `RevealBruttoView.tsx`, `LeaderboardChrome.tsx`)
- `app/[locale]/admin/games/[id]/status/page.tsx`

## Out of Scope

- TIER_ACCENT-dedupe og podium-konstant-opprydding (#1591).
- Warning-amber-kontrast (#1388) — egen sak.
- Brand-taglinen og BrandMark (bevisst bevart, jf. CLAUDE.md §Brand).
- Dark-mode-palettjusteringer.


---

## Drift-sjekk (2026-08-14)

- **PR #1593 er MERGET** — `app/[locale]/games/[id]/leaderboard/podiumPresentation.ts` finnes. Vinnertall-fargen endres i de delte konstantene der (én gang), IKKE per podium-fil. Verifiser hva som faktisk er samlet der og hva som fortsatt er per-fil.
- `--accent-text` finnes ikke i `app/globals.css`; `--accent-deep` på `:41` (lys #b89446), `:159`/`:253` (dark #c9a961), `@theme`-registrering `:320` — som kontrakten beskriver.
- Bruker-synlig fix → `.changes/1374-<slug>.md`-notatfil (#1562-regimet).

---

## Bygge-evidens (2026-08-14)

S1–S3 + a–f: PASS (evaluator runde 1 ACCEPT — `.forge/evaluations/1374-accent-text.md`; kontrast gjenberegnet uavhengig av BÅDE builder og evaluator: 5,33/5,76/4,93/5,06, verste flate 4,68 — alle klarerer). Staging: PASS — computed-style-orakler viser #7d6224 på podium- og leaderboard-flater i lys modus, #d4b870 (uendret) i dark, og NULL gammel-gull-tekst igjen (negativt orakel rent). Restsweep-funn filet som eget issue.
