# Spec: Bryt opp «Hull for hull»-god-fila (#714)

**Issue:** [#714](https://github.com/jdlarssen/golf-app/issues/714) — søsken til [#682](https://github.com/jdlarssen/golf-app/issues/682)
**Type:** Ren refaktor — oppførsel bevart. Ingen `package.json`-bump, ingen CHANGELOG (per CLAUDE.md skip-regel for `refactor(...)`).
**Branch:** `issue-714-holes-godfile-split` (egen branch → PR, per issue «egen branch + egen PR, ikke bunt med feature»).

## Problem

`app/[locale]/games/[id]/leaderboard/holes/page.tsx` er **1591 linjer** med samme god-fil-mønster som leaderboard-hovedfila hadde før #682:

- **16 `return (`-grener** + 19 funksjons-/komponent-deklarasjoner i én modul.
- **`course_holes`-fetch-blokken er duplisert ×10** — samme tabell, samme `course_id`-filter, samme `.select(...).order('hole_number')`-shape, gjentatt i hver av de 9 `XHolesBody`-funksjonene + den generiske `DrilldownBody`.
- Per-format `XHolesBody`-funksjonene (Skins, Wolf, Nines, Round Robin, Acey-Deucey, Bingo Bango Bongo, Nassau, Solo strokeplay, Solo stableford) er nær-identiske: hent → bygg context → kjør mode-router → `notFound()` på feil kind → bygg `playersById` → render `XHolesView`. Den generiske `DrilldownBody` + `DrilldownView` + `HoleTable` + `HoleRow` + `TeamNavLink` + helpers (`vsParTone`/`formatVsPar`/`firstNameOf`) er best-ball-lag-scorekortet for alle ikke-epic-#496-formater.

Målet er **å gjøre fila vedlikeholdbar uten å endre noe brukeren ser** — byte-identisk rendret output for alle 10 format-grener.

## Research Findings

Verifisert mot faktisk kode i worktreen:

- **Leaf-view-komponentene finnes allerede.** `holes/SkinsHolesView.tsx`, `WolfHolesView.tsx`, `NinesHolesView.tsx`, `RoundRobinHolesView.tsx`, `AceyDeuceyHolesView.tsx`, `BingoBangoBongoHolesView.tsx`, `NassauHolesView.tsx`, `SoloStrokeplayHolesView.tsx`, `SoloStablefordHolesView.tsx` — hver med co-located `.test.tsx`. De er `'use client'`-leaf-views og **røres ikke**. Det som ligger i `page.tsx` er server-side data-fetch-wrappere (`XHolesBody`) som bygger context og rendrer disse views.
- **Den generiske best-ball-grenen har ingen ekstrahert view.** `DrilldownView`/`HoleTable`/`HoleRow`/`TeamNavLink` + `vsParTone`/`formatVsPar`/`firstNameOf`/`ScoreTone` lever kun inline i `page.tsx`. Disse må flyttes near-verbatim til en ny `holes/formats/drilldown.tsx` (det finnes ingen eksisterende drilldown-view å gjenbruke).
- **#682-mønsteret er presedens.** Hovedfila bruker `formats/X.tsx`-render-moduler + delte `leaderboardTypes.ts` (`CourseHoleRow`/`ScoreRow` finnes allerede, byte-identiske med holes-fila sine lokale typer) + `leaderboardContext.ts` (`getLeaderboardContext` cache + `fetchSideWinners`). Holes-fila har sin EGEN `getDrilldownContext`-cache (ikke `getLeaderboardContext`) og sin egen `localizeHolesGameName`-helper — disse blir delt på tvers av format-modulene via et nytt `holes/holesData.ts`-shared-module.
- **Next.js 16 App Router:** server-komponenter kan splittes fritt på tvers av modulfiler uten direktiv. Ekstraksjon av `async function XHolesBody(...)` til søsken-moduler følger server-komponent-modellen uten ny boundary.

## Prior Decisions

- **#682 (leaderboard-hovedfila):** `formats/X.tsx` + delt `leaderboardTypes.ts`/`leaderboardContext.ts`. Speil dette layoutet.
- **epic #496 («Hull for hull» format-bevisst):** hver solo-/score-format har sin egen `XHolesView` med per-hull-drilldown. Ikke endre hvilken view en format ruter til.
- **#624 (re-lokaliser frosset spillnavn):** `localizeHolesGameName` gjør én ekstra bane-PK-oppslag kun i grenen som faktisk rendres. Bevares uendret som delt helper.
- **#679 (LeaderboardRealtime):** `withRealtime`-wrapperen i page-dispatcheren monterer realtime én gang rundt hver Suspense-gren. Bevares i dispatcheren.

## Design

### Målarkitektur

```
app/[locale]/games/[id]/leaderboard/holes/
  page.tsx                  # LeaderboardHolesPage (entry) + tynn dispatcher (withRealtime + Suspense per game_mode)
  holesData.ts              # getDrilldownContext (cache) + localizeHolesGameName + DrilldownSkeleton + delte typer-reeksport
  formats/
    skins.tsx               # SkinsHolesBody
    wolf.tsx                # WolfHolesBody
    nines.tsx               # NinesHolesBody
    roundRobin.tsx          # RoundRobinHolesBody
    aceyDeucey.tsx          # AceyDeuceyHolesBody
    bingoBangoBongo.tsx     # BingoBangoBongoHolesBody
    nassau.tsx              # NassauHolesBody
    soloStrokeplay.tsx      # SoloStrokeplayHolesBody
    soloStableford.tsx      # SoloStablefordHolesBody
    drilldown.tsx           # DrilldownBody + DrilldownView + HoleTable + HoleRow + TeamNavLink + vsParTone/formatVsPar/firstNameOf/ScoreTone
  *HolesView.tsx            # uendret (leaf views, allerede ekstrahert)
```

### Konsolidering av ×10 `course_holes`-fetch

Mirror `fetchSideWinners`-pattern fra #682. Lag i `holesData.ts`:

```ts
export type CourseHoleRow = { hole_number; par_mens; par_ladies; par_juniors; stroke_index };
export type ScoreRow = { user_id; hole_number; strokes };

export async function fetchHolesAndScores(supabase, gameId, courseId):
  Promise<{ gwp; rawHoles: CourseHoleRow[]; rawScores: ScoreRow[] }>
```

Denne kjører `getGameWithPlayers` + `course_holes`-query + `scores`-query i ÉN `Promise.all`, kaster på error, `notFound()` på manglende gwp — **eksakt samme rekkefølge og semantikk** som hver `XHolesBody` har inline i dag. Formater som trenger ekstra data (Wolf → `getWolfChoices`, BBB → `getBingoBangoBongoHoles`) henter det i parallell via egen `Promise.all` i format-modulen, akkurat som i dag. Den delte fetchen returnerer `rawHoles`/`rawScores` som hver format-modul sender uendret inn i sin `buildXContext`.

`CourseHoleRow`/`ScoreRow` er byte-identiske med `leaderboardTypes.ts` — re-eksporter derfra hvis ren import, ellers behold lokal definisjon i `holesData.ts` (holes-dir holdes selvstendig; ingen modifikasjon av delte parent-moduler).

### Dispatcheren

`LeaderboardHolesPage` beholder ALL sin nåværende logikk (params/searchParams-parsing, auth-redirect, admin-sjekk, `revealState`/`forceBrutto`, `withRealtime`, status-gating) uendret. Kun endring: de inline-definerte `XHolesBody`/`DrilldownBody`/`DrilldownView`/... fjernes fra fila og importeres fra `formats/`-modulene + `holesData.ts`. `DrilldownSkeleton` flyttes til `holesData.ts` (delt fallback).

## Suksesskriterier

1. **Byte-identisk rendret output for ALLE 10 format-grener.** Ingen JSX-, streng-, eller logikk-endring. Render-kropper flyttes UENDRET; kun imports legges til.
2. **`page.tsx` er en tynn dispatcher** — kun entry-komponenten + import + Suspense-dispatch. Ingen `XHolesBody`/view-/table-definisjoner igjen i fila.
3. **`course_holes`-fetchen finnes på ÉTT kall-sted** (`fetchHolesAndScores` i `holesData.ts`), ikke ×10. `grep -c "from('course_holes')"` på `page.tsx` = 0; på `holesData.ts` = 1.
4. **`npx tsc --noEmit` er ren.** (Eksaustive switcher over game-format er hovedrisikoen.)
5. **Co-located vitest for `holes/`-views grønn** — alle eksisterende `*HolesView.test.tsx` passerer uendret (vi rører ikke views).
6. **Brace-diff verifisert** for et utvalg flyttede funksjoner (DrilldownView + 2 HolesBody) mot original `page.tsx` — bekrefter verbatim flytt.
7. **Filgrenser:** kun filer under `app/[locale]/games/[id]/leaderboard/holes/`. Delte parent-moduler (`leaderboardTypes.ts`/`leaderboardContext.ts`) kun read-only import, ikke modifisert.

## Gates (per chunk, scoped til endrede filer)

- `npx tsc --noEmit` (MÅ være ren)
- `npx vitest run app/\[locale\]/games/\[id\]/leaderboard/holes/`
- Brace-diff av sample-funksjoner mot original
- `npm run build` + Playwright e2e: **utsatt til CI** (.env.local/staging fraværende i denne worktreen).

## Ute av scope

- Ingen endring av `*HolesView.tsx`-leaf-komponentene eller deres tester.
- Ingen endring av scoring-/context-builder-moduler i `lib/`.
- Ingen versjons-bump, ingen CHANGELOG, ingen feature-arbeid.
