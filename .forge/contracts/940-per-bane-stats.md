# Forge-kontrakt: #940 — Per-bane prestasjonsoversikt + historikk-hub-toggle

**Issue:** [#940](https://github.com/jdlarssen/golf-app/issues/940) — «Per-bane prestasjonsoversikt (snitt/beste/runder gruppert per bane)»
**Milestone:** Runde 1 — Nå (quick wins + stats-momentum)
**Branch:** `claude/loving-franklin-952bdf`
**Type:** feat (bruker-synlig) → minor bump + CHANGELOG Funksjon-rad

---

## Bakgrunn og beslutninger (gray-area-diskusjon med eier)

Spilleren tenker «jeg går 82 på hjemmebanen men 91 på bortebanen» — i dag finnes
ikke svaret uten å skanne kort manuelt. #940 er ett av 6 personlig-statistikk-
features i epic [#954](https://github.com/jdlarssen/golf-app/issues/954) (trend ✓,
per-bane=denne, sesong-recap #946, handicap-trend #941, achievement-vegg #947,
putts #939).

**Avklart med eier (2 runder):**

1. **Tall per bane:** brutto **snitt + beste + antall** (matcher motivasjonen «82 her,
   91 der» direkte; kompakt på mobil). Netto og course-rating-sammenligning er
   bevisst utsatt (var «evt.» i issuet) — kan komme som oppfølging.

2. **Plassering / langsiktig IA:** `/profile/historikk` blir den **personlige stats-huben.**
   Eier ba om en **toggle øverst på siden** med to visninger:
   - **«Statistikk»** (default) — alt av statistikk: dagens trend-graf (#936) +
     det nye «Baner»-panelet. Dette er det spilleren primært vil se.
     Framtidige stats (#941/#946/#947) lander som seksjoner her.
   - **«Runder»** — den kronologiske per-runde-lista (dagens `GameHistoryCard`-liste).
     Ikke lenger landingen → ingen tvungen endless-scroll; man går inn på den ved interesse.

   `/profile` (Mine tall) forblir lett (3 overskriftstall + lenke inn). `/profile/statistikk`
   er klubb-tavla (urørt — issue-tekstens «statistikk-siden» var upresis).

## Grunnlag i koden (verifisert)

- `app/[locale]/profile/historikk/page.tsx` — server-komponent. Henter ferdige spill
  (`game_players` + `courses(name)`-embed), beregner brutto/netto per spill, tegner
  trend-graf (≥2 komplette 18-hulls-runder) + liste. **Mangler `course_id` i select-en.**
- `lib/stats/playerStats.ts` — `completeRoundTotal()`-mønsteret: komplett 18-hulls =
  nøyaktig 18 ikke-null slag; ellers ekskludert fra snitt/beste (eple-mot-eple).
  Per-bane skal bruke **samme disiplin**.
- `lib/stats/clubStats.ts` + `playerStats.ts` — `Map`-akkumulator-mønster + co-lokalisert
  test. Per-bane = ny `courseStats.ts` i samme stil (Type A, ren, I/O-fri).
- `app/[locale]/games/[id]/leaderboard/LeaderboardTabs.tsx` — **eksakt toggle-mønster
  å speile**: `'use client'`, tar to `ReactNode`-props (server-rendret), `useState`
  default = første tab, `role="tablist"`/`role="tab"`, `min-h-[44px]`.
- `messages/no.json` + `messages/en.json` — `profile.historikk.*`. Parity-tester
  (`catalogParity.test.ts`, `apostropheParity.test.ts`) krever begge språk i sync.

---

## Success-kriterier

- [ ] **K1 — Ren aggregator (TDD).** Ny `lib/stats/courseStats.ts` eksporterer
  `computeCourseStats(rounds: CourseRoundInput[]): CourseStat[]`:
  - Input per runde: `{ courseId: string | null; courseName: string; completeBrutto: number | null }`
    (`completeBrutto` = total brutto KUN for komplette 18-hulls-runder, ellers `null`).
  - Grupperer på `courseId`; hopper over runder med `courseId == null` eller `completeBrutto == null`.
  - Per bane: `rounds` (antall komplette runder), `average` (avrundet brutto-snitt),
    `best` (laveste brutto), `courseName` (bæres fra input).
  - Sortert: `rounds` synkende, deretter `courseName` stigende (`localeCompare`).
  - Co-lokalisert `courseStats.test.ts` dekker: gruppering på tvers av spill, snitt-avrunding,
    beste, sortering (antall desc → navn asc), eksklusjon av ikke-komplett runde,
    eksklusjon av `null` courseId, tomt input → `[]`, én runde → snitt=beste=den runden.
  - **Evidens:** `npx vitest run lib/stats/courseStats` grønn.

- [ ] **K2 — Toggle-komponent.** Ny klient-komponent (speiler `LeaderboardTabs`) tar
  `statsContent` + `roundsContent` som `ReactNode`, `useState` default = `'stats'`,
  `role="tablist"` med to `role="tab"`-knapper (`min-h-[44px]`), labels fra i18n.
  **Evidens:** fil finnes, `tsc` grønn, rendres i historikk-siden.

- [ ] **K3 — Statistikk-tab (default).** Viser eksisterende trend-graf (uendret oppførsel)
  + nytt «Baner»-panel. **Evidens:** staging-klikk + `preview_snapshot`.

- [ ] **K4 — Runder-tab.** Viser eksisterende kronologiske `GameHistoryCard`-liste
  (uendret oppførsel — samme kort, samme lenker). **Evidens:** staging-klikk.

- [ ] **K5 — «Baner»-panel.** Én rad per bane med ≥1 komplett 18-hulls-runde:
  banenavn + antall + brutto snitt + brutto beste, alle tall `tabular-nums`,
  sortert antall synkende. Fallback-navn «Ukjent bane» når `courses(name)` er null.
  Tom-tilstand når det finnes ferdige runder men ingen komplette 18-hulls.
  **Evidens:** `preview_snapshot` viser rad-per-bane med riktige tall mot staging-data.

- [ ] **K6 — i18n.** Alle nye bruker-strenger har `no` + `en` nøkler under
  `profile.historikk.*` (tab-labels, panel-heading, kolonne-labels, tom-tilstand,
  «Ukjent bane»). **Evidens:** `npx vitest run messages` (parity) grønn.

- [ ] **K7 — Query.** Historikk-select-en henter også `games.course_id`; `GameRow`-typen
  utvidet. Ingen ny tabell/kolonne/RLS. **Evidens:** `file:line` + `tsc` grønn.

- [ ] **K8 — Tom-tilstand uendret.** Når spilleren har 0 ferdige runder vises ingen
  toggle — samme `emptyState`-Card som i dag. **Evidens:** kode-sti.

- [ ] **K9 — Versjon + CHANGELOG.** `npm version minor`, én Funksjon-rad i CHANGELOG
  (per `docs/changelog-conventions.md`). **Evidens:** diff.

## Gates (kjøres scoped til det som endres)

| Gate | Kommando |
| --- | --- |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Enhetstester | `npx vitest run lib/stats messages` |
| Full build (exhaustive-switch/route-safety) | `npm run build` |
| Staging-verifisering (bruker-synlig) | `preview_start('torny-staging')` → logg inn som spiller med runder → `/profile/historikk` → toggle Statistikk↔Runder → `preview_snapshot` |

## Eksplisitt UTENFOR scope (ikke gold-plate)

- Netto per bane, course-rating-sammenligning (utsatt — egen oppfølging).
- Omdøping av «historikk»-ruten, eller migrering av trend-grafen til ny struktur
  utover toggle-en.
- Flytting av #946 (sesong-recap) hit — **noteres som kommentar på #946** (eier valgte
  historikk-hub, så #946 bør re-pekes), men bygges ikke nå.
- Type C render-test for panelet: aggregatoren (Type A) eier tallene; toggle-en speiler
  en allerede-etablert primitiv. Hopper over med mindre evaluator krever det
  (test-disiplin: «maks én Type C», unngå lav-verdi re-assert).

## Notater til oppfølging (filer som issues/kommentar FØR merge hvis substansielt)

- Kommentar på #946: re-pek til Statistikk-taben på historikk (hub-beslutning).
- Vurder eget issue for «historikk → tydeligere navn» når flere stats-seksjoner lander.
