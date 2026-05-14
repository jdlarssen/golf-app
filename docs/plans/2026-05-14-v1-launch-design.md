# v1.0 launch — design

**Status:** godkjent 2026-05-14
**Ship-mål:** MAJOR-bump til `v1.0.0` med samle-entry «Første stabile release»
**Subagent-modell-overstyring:** Bruk Opus for builder-subagentene i denne leveransen (overstyrer Tørny-standard som er sonnet for plan-eksekusjon).

## Bakgrunn

Etter pilot 2026-05-13 har vi tre features som er det vi vil ha på plass før vi flytter til v1.0:

1. **Per-spill reveal-mode** — admin velger «live» (alt synlig, dagens oppførsel) eller «reveal» (skjul netto under runden, avslør på slutten). Reveal-mode legger til en sosial mekanikk hvor laget med høyere handicap kan slå laget som leder på brutto — som er hele poenget med best-ball-netto. I dag forsvinner den følelsen fordi netto-tall er synlig hele tiden.

2. **Scorekort-former rundt stortall** — universell golf-konvensjon (sirkel = birdie, dobbel-sirkel = eagle, firkant = bogey, dobbel-firkant = double-bogey-eller-verre). Visuell oppgradering for alle modi. Gjør appen øyeblikkelig gjenkjennelig som golf-app for folk som er vokst opp med papir-scorekort, og fungerer som a11y-forsterkning av delta-koden (form bærer info uavhengig av farge).

3. **Navne-reveal** — under runden bruker vi `nickname ?? name` overalt (= dagens oppførsel). Når et spill går til status=finished, vises full-format `Karl "Knølkis" Jensen` på alle finished-flater. Dobler dramatic-effekt på reveal-mode (avslører både vinneren OG identiteten bak kallenavnet), og gir live-mode en gratis premium-touch ved spillets slutt.

Vi dropper den opprinnelige TODO-en om per-bruker `display_pref`-toggle. Den var løsning på feil problem — det vi egentlig vil ha er ikke «hver bruker velger sin visning», men «den lekne kallenavn-energien er en del av Tørny-kulturen, og navnet kommer på slutten som del av revealet».

## Featurer

### Feature 1: Reveal-mode (per-spill visibility)

**DB-endring (migrasjon `0021_score_visibility.sql`):**

```sql
alter table public.games
  add column score_visibility text not null default 'live'
  check (score_visibility in ('live', 'reveal'));
```

Default `'live'` betyr eksisterende spill påvirkes ikke. Ingen RLS-endring (kolonnen er en visning-pref, ikke en sikkerhets-pref).

**Lås-regel:** `score_visibility` kan endres kun mens `status in ('draft', 'scheduled')`. Server-action validerer dette; admin-UI viser toggle-en kun i de statusene.

**Admin-UI (`/admin/games/new` + `/admin/games/[id]/edit`):**

Ny seksjon «Synlighet under runden» med to alternativer (radio-gruppe eller segmented control):

- ○ **Vis alt under runden** (live) — netto-tall synlige fra hull 1
- ○ **Avslør på slutten** (reveal) — brutto under runden, netto avsløres når spillet avsluttes

Helper-tekst under: «Reveal-modus skjuler handicap-slag og netto-rangering under runden. Lag med høyere handicap kan slå brutto-lederen — det blir et virkelig spennings-moment når du trykker avslutt.»

**Visibility-logikk i kode:**

Helper i `lib/games/visibility.ts`:

```ts
export type ScoreVisibility = 'live' | 'reveal';

export type RevealState = 'live-always' | 'reveal-active' | 'reveal-finished';

export function revealState(
  visibility: ScoreVisibility,
  status: GameStatus,
): RevealState {
  if (visibility === 'live') return 'live-always';
  if (status === 'finished') return 'reveal-finished';
  return 'reveal-active';
}

export function shouldHideNetto(state: RevealState): boolean {
  return state === 'reveal-active';
}
```

Hver side som rendrer score-info leser `games.score_visibility`, kaller `revealState` og betinger rendering på resultatet.

### Feature 2: Scorekort-former rundt stortall

**Ny SVG-komponent (`components/scoring/ScoreShape.tsx`):**

Tar `score: number | null`, `par: number`, `children: ReactNode` (selve tallet). Rendrer:

| Score relativ til par | Form | Streke-spec |
|---|---|---|
| ≤ par − 2 (eagle, albatross) | Dobbel-sirkel | To konsentriske ringer, 3px gap |
| par − 1 (birdie) | Sirkel | Én ring |
| par | Ingen | Bare tallet, ingen container |
| par + 1 (bogey) | Firkant | Én firkant, 4px corner-radius |
| ≥ par + 2 (double bogey+) | Dobbel-firkant | To konsentriske firkanter, 3px gap |
| `null` (ikke satt) | Ingen | Ghost-tall i muted farge (dagens oppførsel) |

Streke-farge: matcher eksisterende `scoreTone` (`under`=forest-green, `over1`=amber, `over2`=deep-red). Streke-vekt: 1.5–2px avhengig av kort-størrelse. Padding inni form: nok til at tallet puster.

Helper i `lib/scoring/scoreShape.ts`:

```ts
export type ScoreShape = 'none' | 'circle' | 'double-circle' | 'square' | 'double-square';

export function scoreShape(score: number | null, par: number): ScoreShape {
  if (score === null) return 'none';
  const diff = score - par;
  if (diff <= -2) return 'double-circle';
  if (diff === -1) return 'circle';
  if (diff === 0) return 'none';
  if (diff === 1) return 'square';
  return 'double-square';
}
```

Med unit-tester for alle terskler.

**Hvor brukes den:**

| Skjerm | Hvor formen pakker | Pill ved siden av? |
|---|---|---|
| Hull-skjerm (`ScoreCard.tsx`) | Stortallet (38pt) | Nei — droppes (form erstatter pillen helt) |
| Scorekort-oversikt (`/scorecard`) | «Slag»-kolonne-tallet | Ja — beholder eksisterende delta-pill |
| Lever-skjerm (`/submit`) | Som scorekort-oversikt | Ja |
| Approve-skjerm (`/approve`) | Som scorekort-oversikt | Ja |
| Hull-leaderboard (`/leaderboard/holes`) | Per-hull-tall i grid | Ingen pill (for trangt) |
| Leaderboard (`/leaderboard`) | Per-hull-tall hvis det vises | Som hull-leaderboard |
| Historikk (`/profile/historikk`) | Per-runde-tall hvis det vises | Som scorekort-oversikt |

### Feature 3: Navne-reveal

**Helper i `lib/names/formatRevealName.ts`:**

```ts
export function formatRevealName(name: string, nickname: string | null): string {
  if (!nickname || nickname.trim().length === 0) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return `"${nickname}"`;
  if (parts.length === 1) return `${parts[0]} "${nickname}"`;
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} "${nickname}" ${last}`;
}
```

Eksempler (dekkes av unit-tests):
- `("Karl Erik Jensen", "Knølkis")` → `Karl "Knølkis" Jensen`
- `("Sondre Reitan Aar", "Pingvin")` → `Sondre "Pingvin" Aar`
- `("Karl Jensen", "Knølkis")` → `Karl "Knølkis" Jensen`
- `("Karl", "Knølkis")` → `Karl "Knølkis"`
- `("Karl Jensen", null)` → `Karl Jensen`
- `("Karl Jensen", "")` → `Karl Jensen` (tom string telles som ingen nickname)
- `("Karl Jensen", "   ")` → `Karl Jensen`

**Hvor brukes den:**

- **Under runden (alle skjermer, alle modi):** uendret `nickname ?? name` — eksisterende oppførsel
- **Når `status='finished'`:** `formatRevealName(name, nickname)` på:
  - `/games/[id]/leaderboard` (top spillere, lag-medlemmer)
  - `/games/[id]/leaderboard/holes` (spiller-rad-headere)
  - `/profile/historikk` (mine medspillere/motspillere)

Den per-bruker `display_pref`-kolonnen som var i den opprinnelige TODO-en strykes — vi trenger den ikke.

### Feature 4: Live brutto leaderboard (for reveal-mode aktiv)

**Samme rute, modus-drevet innhold.** `/games/[id]/leaderboard/page.tsx` leser `games.score_visibility` + `games.status`, kaller `revealState`, og rendrer:

| State | Innhold |
|---|---|
| `live-always` (active eller finished) | Netto best-ball (dagens — uendret) |
| `reveal-active` | Brutto-totaler — ny seksjon |
| `reveal-finished` | Netto best-ball + reveal-flourish (eksisterende `ConfettiBurst`) + `formatRevealName` på spillere |

**Brutto-totaler-seksjon (reveal-active):**

```
LIVE LEADERBOARD            Brutto · etter N hull

[Lag-card 1]
1ste — Lag rød                                  65
  · Knølkis              38
  · Pingvin              27

[Lag-card 2]
2dre — Lag grønn                                67
  · Henrik               33
  · Knatten              34

       🤫 Vinneren avsløres når runden er ferdig
```

**Beregnings-regler:**

- **Lag-total** = sum-av-best-brutto-per-spilte-hull. For hvert hull der minst én spiller på laget har en score, ta `min(brutto)` over lagets spillere. Summer over spilte hull. Dette er analogt med dagens netto-best-ball men på brutto.
- **Per-spiller-total** = sum av spillerens egne brutto-slag (ikke best-ball).
- **Spilte hull** = unionen av alle hull med minst én score på laget.
- **Ranking** = stigende på lag-total (lavest først). Tie-break: flest spilte hull først, så lagets totale antall scores (mer data = trolig mer pålitelig tall).

Helper i `lib/leaderboard/bruttoTotals.ts` med unit-tester.

**Visuell stil:**

- Navn vises som `nickname ?? name` (vi er fortsatt under runden — reveal har ikke skjedd ennå)
- Ingen handicap-info, ingen «+slag», ingen netto-hint
- Ingen gull/champagne-medalje på #1ste — det reserveres for finished-state
- Subtil visuell hierarki (font-vekt + størrelse), ikke prangende
- Tease-tekst nederst med 🤫-emoji

### Feature 5: Hull-skjerm leaderboard-ikon

**Plassering:** Erstatt det tomme 34px-span-et i `HoleClient.tsx` header-en. Foreslått ikon: liten laurel-krans eller subtil stolpediagram (vi har `components/icons/Laurel.tsx` tilgjengelig).

**Navigasjon:** Klikket går til `/games/[id]/leaderboard?return=hole&n=N` der `N` er nåværende hull-nummer.

**Return-knapp på leaderboard:** Leser `searchParams`. Hvis `return=hole` og `n` er gyldig hull-nummer (1–18), settes back-knappen til `/games/[id]/holes/N`. Ellers default til `/games/[id]`. Bruker eksisterende `TopBar`-mønster.

## Per-skjerm visibility-matrise

Dette er kontrakten som skal stå:

| Skjerm | live-always | reveal-active | reveal-finished |
|---|---|---|---|
| Hull-skjerm (`ScoreCard`) | Brutto m/form + «+N SLAG»-badge | Brutto m/form, **ingen «+N SLAG»** | (Spiller har levert — redirect til game-home) |
| Scorekort-oversikt | Slag-kolonne m/form + pill + **«+slag»-kolonne** | Som live-always **men «+slag»-kolonne SKJULT** | Som reveal-active **men «+slag»-kolonne tilbake + ny «Netto»-kolonne** |
| Lever-skjerm | Som scorekort-oversikt | Som scorekort-oversikt reveal-active | (Spiller har levert) |
| Leaderboard | Netto best-ball (dagens) | **Brutto-totaler** (Feature 4) | Netto best-ball + confetti + `formatRevealName` |
| Hull-leaderboard | Per-hull-tall m/form, netto-fargekoding | Per-hull-tall m/form, **ingen netto-fargekoding** | Netto-fargekoding tilbake |
| Approve-skjerm | Brutto-tabell m/form + «+slag»-kolonne | Som live-always **men «+slag»-kolonne SKJULT** | (Typisk pre-finished) |
| Historikk | Dagens | (Spillet ikke fullført — ikke synlig) | Full netto + `formatRevealName` |

**Edge-cases å passe på:**

- **Mid-runde-flush** av `score_visibility`: forbudt av låsen, så ingen mid-runde-state-change kan skje. Men hvis en bug skulle slippe en endring gjennom, må viewene være idempotent på modus-skifte.
- **Sync-cache:** Dexie cacher ikke `games.score_visibility` (det er server-side). Hver hull-skjerm-render leser fra server. Ingen lokal cache å invalidere.
- **Per-spiller ulike views:** Alle spillere i et spill ser samme modus. Ingen per-bruker-overstyring.
- **Mail-tekst på «runden er ferdig»**: Eksisterende `gameFinishedNotification.ts` — ingen endring. Lenken i mailen tar dem til leaderboard, hvor revealet (hvis reveal-mode) er ferdig synlig fordi `status=finished` allerede er satt.

## Implementerings-rekkefølge (foreslått)

Tas i wrapping-plans-skill, men her er logisk rekkefølge:

1. **Schema + helpers** (DB-migrasjon + `lib/games/visibility.ts` + `lib/scoring/scoreShape.ts` + `lib/names/formatRevealName.ts` + `lib/leaderboard/bruttoTotals.ts` med tester) — ingen UI-endring, alt grønt
2. **Admin-UI for modus-valg** (`/admin/games/new` og edit) — bruker schema, ingen avhengig UI ennå
3. **ScoreShape-komponent** (`components/scoring/ScoreShape.tsx`) — frittstående, kan testes isolert
4. **Anvend shapes** på hull-skjerm + scorekort-oversikt + lever + approve + hull-leaderboard + historikk (cross-cutting, men gentil)
5. **Visibility-respekt på hull-skjerm** — skjul «+N SLAG», droppe pill på hull-skjermen (form erstatter)
6. **Visibility-respekt på scorekort-oversikt + lever + approve** — skjul «+slag»-kolonne i reveal-active; vis netto-kolonne i reveal-finished
7. **Visibility-respekt på hull-leaderboard** — fjern netto-fargekoding i reveal-active
8. **Live brutto leaderboard** — ny seksjon i `/games/[id]/leaderboard/page.tsx`
9. **Hull-skjerm-leaderboard-ikon + return-to-hole** — header-endring i `HoleClient.tsx` + back-knapp-logikk på leaderboard
10. **formatRevealName** anvendt på finished-flater (leaderboard, hull-leaderboard, historikk)
11. **Test-pass** — vitest grønt (180/180 ++ nye tester), Playwright-smoke
12. **CHANGELOG + version bump til 1.0.0** (én commit, samle-entry «Første stabile release» med tagline som spenner over alle tre featurene)

## Out-of-scope (deferred til senere milestones)

Eksplisitt UT av v1.0:

- **E-lite-stack** med netto under brutto på hull-skjerm i live-mode
- **Netto-kolonne** på scorekort-oversikt i live-mode
- **Toggle brutto/netto leaderboard** i live-mode (krever toggle-state + ny UI)
- **Per-bruker navn/kallenavn-preferanse** (kansellert helt — erstattes av navne-reveal)
- **Alternative spillmoduser** (stableford, scramble, matchplay) — egen milestone, blokkerer ikke v1.0

## Testing

- **Unit-tester** for alle nye lib-helpers (`scoreShape`, `formatRevealName`, `bruttoTotals`, `revealState`, `shouldHideNetto`)
- **Component-tester** for `ScoreShape.tsx` (alle 5 form-typer + null)
- **Component-tester** for `ScoreCard.tsx` (form synlig i live, «+N SLAG» skjult i reveal-active)
- **E2E-test (Playwright):** lag-2-spill med reveal-mode, spill noen hull, sjekk at netto-info ikke lekker noe sted, avslutt spillet, sjekk at netto + full-format-navn dukker opp
- **Manuell røyk-test:** create reveal-mode-game som pilot-kompis, gjør en hel runde, sjekk reveal-følelsen subjektivt

## Versjon

Når alle 12 implementerings-steg er grønne: **bump direkte fra `0.10.22` til `1.0.0`** (skipper minor-bumps underveis siden vi sikter mot ett enkelt sammenkoblet release). CHANGELOG-entry:

```markdown
### [1.0.0] - 2026-05-XX

**Første stabile release. Tre nye featurer som markerer at Tørny er klar
for ekte bruk.**

#### Added
- Reveal-modus: admin kan velge at netto-tall skjules under runden og
  avsløres når spillet er ferdig. Skaper drama for kompisgjenger der
  laget med høyere handicap kan slå brutto-lederen.
- Scorekort-former: birdies får sirkel, bogeys får firkant, eagle og
  double bogey får dobbel-form — universell golf-konvensjon, premium
  visuell touch.
- Navne-reveal: under runden kalles spillerne ved kallenavnet sitt,
  når spillet er ferdig avsløres fullt navn med kallenavnet midt i:
  Karl "Knølkis" Jensen.

<details>
<summary>Teknisk</summary>

#### Added
- Migrasjon 0021: `games.score_visibility` enum (live/reveal) med
  CHECK-constraint og lås-regel mot status=active/finished.
- `lib/games/visibility.ts`, `lib/scoring/scoreShape.ts`,
  `lib/names/formatRevealName.ts`, `lib/leaderboard/bruttoTotals.ts`.
- `components/scoring/ScoreShape.tsx` SVG-baserte former rundt
  stortall (sirkel/firkant/dobbel) brukt på 7 skjermer.
- Live brutto leaderboard (reveal-mode aktiv): lag-totaler basert på
  best-brutto-per-spilte-hull, per-spiller-totaler, ingen handicap-info.
- Hull-skjerm leaderboard-ikon i header med return-to-hole nav.

#### Changed
- `/admin/games/new` og edit har ny seksjon «Synlighet under runden».
- `formatRevealName(name, nickname)` brukes på alle finished-flater
  (leaderboard, hull-leaderboard, historikk) i alle modi.
- Hull-skjermens score-pill droppes — formen rundt stortallet erstatter
  den. Andre flater beholder pillen ved siden av formen.

#### Removed
- Opprinnelig planlagt per-bruker `display_pref`-toggle strykes
  (erstattet av navne-reveal).

</details>
```
