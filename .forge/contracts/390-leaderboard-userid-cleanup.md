# Forge-kontrakt #390 — Rydd opp død `userId`-tråding i leaderboard-viewet

**Issue:** [#390](https://github.com/jdlarssen/golf-app/issues/390)
**Branch:** `claude/keen-mclaren-8d58cf`
**Type:** `refactor` (ingen oppførselsendring → ingen version-bump, ingen CHANGELOG)
**Milestone:** Tier 2 — Navigasjon

## Bakgrunn

Under #355 (vedvarende bunn-nav) ble nav-en først integrert via en `userId`-prop på
`AppShell`, så pivotert til global render i `app/layout.tsx`. Revert-en lot død
`userId`-tråding stå igjen i leaderboard-laget. Den er inert (passerer `tsc` + `build`;
kun lint-warning, prosjektet har ikke `noUnusedLocals`), men skal ryddes. Funn fra
forge-evaluator på #355.

## Hva som er dødt (verifisert ved kode-lesing)

| Fil | Linje (før) | Hva |
|-----|-------------|-----|
| `RevealBruttoView.tsx` | 20–25 | JSDoc-blokk + `userId: string \| null;` i `Props` — aldri lest i body |
| `RevealBruttoView.tsx` | 40 | `userId,` i prop-destrukturering |
| `page.tsx` | 652 | `userId,` call-site i `renderState3({…})` |
| `page.tsx` | 664 | `userId,` call-site i `renderState35({…})` |
| `page.tsx` | 686 | `userId={userId}` på `<RevealBruttoView/>` |
| `page.tsx` | 3308 | `userId: string \| null;` i `renderState3` opts-type |
| `page.tsx` | 3310 | `userId` i `renderState3`-destrukturering |
| `page.tsx` | 3410 | `userId: string \| null;` i `renderState35` opts-type |
| `page.tsx` | 3412 | `userId` i `renderState35`-destrukturering |
| `page.tsx` | 297 | `const { supabase, userId } = …` — `userId` blir foreldreløs når de tre call-sites fjernes |
| `page.tsx` | 1356 | `const { supabase, userId } = …` i `renderStablefordWithSideTournament` — **allerede** foreldreløs (samme #355-pivot-klasse; ikke listet i issue-teksten, funnet av G3-lint-gaten) |
| `RevealBruttoView.test.tsx` | 88, 123, 146 | `userId="test-user-1"` JSX-prop — blir excess-property når prop-en fjernes |

> **Funn under bygg (G3-lint-gaten):** issue-teksten enumererte tre mottakere, men
> `renderStablefordWithSideTournament` (`page.tsx:1356`) hadde en fjerde, allerede
> foreldreløs `userId`-destrukturering av samme #355-pivot-klasse — `supabase` brukes,
> `userId` aldri lest (alle andre `userId`-tokens i fn-en er `userIds`-flertall eller
> datafelt-nøkler). Tatt med under «full opprydding» (owner-valgt) fordi G3-kriteriet
> krever at no-unused-vars-warningen er *borte* fra fila, ikke bare fra de tre stiene.

### Scope-utvidelse utover issue-teksten (godkjent av owner)

Issue-teksten lister «de tre mottakerne». Kode-lesing viser at de tre call-sites
(652/664/686) er de **eneste** reelle referansene til `userId`-variabelen som
destruktureres i `LeaderboardBody` på `page.tsx:297`. Å fjerne dem foreldreløser
den destruktureringen → ny ubrukt lokal. Owner valgte **full opprydding**:
forenkle 297 til `const { supabase } = …`. Tilsvarende må test-fila droppe de tre
nå-ugyldige `userId`-prop-ene for å holde `tsc` grønn.

## Legitime `userId` som IKKE røres (eksplisitt bevart)

- `page.tsx:177–178, 225–226, 235, 249` — auth-redirect, admin-sjekk, RLS-medlemssjekk.
- `page.tsx:260` — `markNotificationsRead({ userId, … })` (bruker ytre komponents `userId` fra linje 225).
- Alle `userId:`-**datafelt** (object-literal-nøkler) som mapper DB-rader til domene-objekter
  (`page.tsx` ~572, 597, 759, 814+, og hele resten av fila; `RevealBruttoView.tsx` 103/104/107/108/130/131/136; `RevealBruttoView.test.tsx` `makeTeam`-shape).

## Suksesskriterier

- [x] **K1** — `RevealBruttoView`-komponenten har ingen `userId`-prop lenger: prop-type (inkl. JSDoc) og destrukturering fjernet; `pc.userId`/`p.userId`-datafeltene urørt. *Evidens: diff `RevealBruttoView.tsx` −7 linjer (JSDoc 20–24 + `userId: string|null` 25 + destrukt. 40); G1 tsc-rent, G2 3/3 grønn.*
- [x] **K2** — `renderState3` og `renderState35` i `page.tsx` har verken `userId` i opts-type eller i destrukturering. *Evidens: diff hunks @3302 + @3403 fjerner `userId: string|null` fra opts-type og `userId` fra destrukt. i begge.*
- [x] **K3** — De tre call-sites (`renderState3({…})`, `renderState35({…})`, `<RevealBruttoView/>`) sender ikke lenger `userId`. *Evidens: diff hunks @649, @660, @681 i `page.tsx`.*
- [x] **K4** — `page.tsx:297` (`LeaderboardBody`) **og** `page.tsx:1356` (`renderStablefordWithSideTournament`) er forenklet til `const { supabase } = await getLeaderboardContext();`. *Evidens: diff hunks @294 + @1353; G3 eslint 0 warnings (var 1 før 1356-fixen).*
- [x] **K5** — `RevealBruttoView.test.tsx` sender ikke lenger `userId`-prop (3 steder); `makeTeam`-datafeltene urørt; testene grønne. *Evidens: diff −3 `userId="test-user-1"`; `makeTeam`-shape urørt; G2 `Tests 3 passed (3)`.*
- [x] **K6** — Ingen legitim `userId`-bruk er rørt (auth/RLS/`markNotificationsRead`/datafelt). *Evidens: grep bekrefter linje 226 (`if (!userId) redirect`), 235 (`.eq('id', userId)`), 249 (RLS-medlemssjekk), 260 (`markNotificationsRead`) intakt; G1 tsc 0 leaderboard-feil.*

## Gates (kjøres scoped til endringen)

```bash
# G1 — Typesjekk: fanger excess-property hvis call-site og type kommer ut av sync.
#      Dette er den primære sikkerhetsnett-en issue-en nevner.
npx tsc --noEmit

# G2 — Co-located test for endret komponent (per feedback_run_colocated_tests).
npx vitest run "app/games/[id]/leaderboard/RevealBruttoView.test.tsx"

# G3 — Lint på de to endrede source-filene: bekrefter at no-unused-vars-warning-en
#      (selve grunnen til issuet) er borte.
npx eslint "app/games/[id]/leaderboard/page.tsx" "app/games/[id]/leaderboard/RevealBruttoView.tsx"
```

## Out of scope

- `useUnreadNotificationsCount`-mock-en i test-fila (linje 14–16) — test-infrastruktur, ikke del av `userId`-tråden; røres ikke.
- Det doble `getLeaderboardContext()`-kallet (225 + 297) — eksisterende mønster, ikke dette issuets ansvar.
- Enhver annen `userId`-bruk i fila.

## Commit-plan

Én atomisk `refactor`-commit (alt henger sammen via `tsc`-konsistens; å splitte ville gi midlertidig rød `tsc`):

```
refactor(leaderboard): #390 remove dead userId threading after #355-pivot
```
