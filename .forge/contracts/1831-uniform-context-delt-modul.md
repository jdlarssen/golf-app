# Spec: Ekstraher buildUniformContext til import-ren delt modul (fjern app-duplikatet)

(Kontrakt-smedens kontrakt, postet som issue-kommentar på #1831 2026-08-30. Klasse: teknisk. Produktvalg: nei.)

## Problem

`buildUniformContext` — den uniforme `ScoringContext`-byggingen for lag-/side-formatene
uten dedikert builder (best ball, matchplay-familien, scramble-familien, shamble,
patsome) — bor i `lib/scoring/buildModeResultForGame.ts:302-341`, som åpner med
`import 'server-only'`. Native-appen kunne derfor ikke importere den og bærer en
bokført kopi (`native/app/src/lib/scoringContext.ts:210-247`, avvik F3 i
N4-evalueringen). To hjem for samme regel er trap 4 i mild form; dette er den
sanksjonerte flyttingen i egen liten PR.

## Research Findings (verifisert 2026-08-31 mot main, adversarielt re-verifisert av fersk-kontekst-agent)

- Webbens versjon tar `(game, NormalizedPlayerRow[], CourseHoleRow[], ScoreRow[])`,
  filtrerer selv withdrawn (spillere OG deres scores) og `users == null`
  (buildModeResultForGame.ts:308-341). Appens kopi tar et opts-objekt med
  ferdig-filtrerte rader og en alltid-satt `users` (scoringContext.ts:78-91, 210-247);
  netto-effekten er identisk — appens `users` er alltid et objekt-literal (aldri null,
  gameBundle.ts:63-77), så helperens filtre er beviselige no-ops for app-rader.
- `buildUniformContext` er modul-privat i web-fila (ingen `export`) — eneste kallsted
  er uniform-casen i `buildContext`-switchen (linje 291); repo-grep treffer kun de to
  filene + `.forge/`-prosa. Ingen re-eksport trengs.
- Søsken-mønsteret finnes: `lib/scoring/context/build*Context.ts` (9 filer) er
  import-rene, tar opts-objekter (`{ gameId, gameMode?, modeConfig, players,
  holesRows, scoresRows }`, jf. buildStablefordContext.ts:52-59), deklarerer
  rad-typene strukturelt i fila, og importerer typer via
  `import type {…} from '@/lib/scoring/modes/types'`. Appen importerer allerede 7 av
  dem (scoringContext.ts:26-32).
- Fasit-suitene: `npx vitest run lib/scoring` (1176 tester per
  `.forge/evaluations/1828` — ikke re-målt her) og appens `scoringContext.test.ts`
  under jest. App-testen importerer kun de offentlige funksjonene (linje 10) og
  refererer aldri den lokale helperen direkte — slettingen brekker ingen tester.
- `lib/scoring/buildModeResultForGame.test.ts` dekker uniform-grenen kun for
  `hole_segment`-scoping med aldri-withdrawn-fiksturer — den nye Type A-fila gir
  reelt ny dekning, ikke re-assertering.

## Design

1. **Ny fil `lib/scoring/context/buildUniformContext.ts`** (import-ren): flytt webbens
   implementasjon uendret i logikk, med opts-signatur på linje med søsknene:
   `{ gameId, gameMode, modeConfig, players, holesRows, scoresRows }`. Rad-typene
   deklareres strukturelt i fila (som søsknene gjør): `players` med
   `withdrawn_at: string | null` og `users: {…} | null`; filtreringen
   (`users != null && withdrawn_at == null` + WD-score-filteret) BEHOLDES i helperen —
   den er regelens hjem.
2. **Web:** `buildModeResultForGame.ts` importerer den nye modulen og kaller den fra
   `buildContext`-switchen (samme case-liste); den private funksjonen slettes.
3. **App:** slett den lokale `buildUniformContext` i `scoringContext.ts` og kall den
   delte via samme relative sti-form som søsknene
   (`../../../../lib/scoring/context/buildUniformContext`) — appens rader er allerede
   filtrert, helperens filter er da et no-op (samme dobbeltfiltrerings-mønster appen
   alt bruker).
4. **Test:** ny `lib/scoring/context/buildUniformContext.test.ts` (Type A) som låser
   mapping + withdrawn-/users-null-filtreringen (spillere og scores). Eksisterende
   suiter er adferds-fasit og skal være grønne med uendret antall.

Ingen adferdsendring noe sted — ren flytting.

## Edge Cases & Guardrails

- **Signatur-tilpasningen er den eneste omskrivingen** (posisjonsargumenter →
  opts-objekt); selve map/filter-uttrykkene flyttes tegn-likt der det lar seg gjøre.
- **Filter-asymmetrien er bevisst:** `scores` filtreres KUN på `withdrawnIds`, ikke
  på det gjenværende spiller-settet — en `users == null`-rad som ikke er trukket
  mister spiller-raden, men beholder scorene (samme mønster som
  `buildStablefordContext.ts:78` vs `:99`). Flytt uttrykkene tegn-likt — ikke
  «rydd» dem sammen.
- **`team_number`-kontrakten består:** helperen mottar normaliserte rader
  (`team_number: number`, post-`?? 0`) — typen i den nye fila skal kreve `number`,
  ikke gjeninnføre `| null` (jf. #844-evalueringen).
- **Ingen `server-only` i den nye fila.** Typene importeres som søsknene gjør —
  `import type {…} from '@/lib/scoring/modes/types'`; `@/`-aliaset er trygt i appen
  (tsconfig `paths` + metro-config + jest `moduleNameMapper` løser det, og
  `import type` erases uansett i transpilering). Rad-typene deklareres strukturelt i
  fila — ikke importert fra `@/lib/supabase/queryFragments`.
- **Kommentaren i appen** (scoringContext.ts:201-209) som bokfører duplikatet
  slettes — den beskriver en restanse som ikke lenger finnes.

## Key Decisions

- **Filtreringen bor i helperen** (webbens semantikk vinner): den er den defensive
  varianten, og dobbel filtrering i appen er harmløs. Alternativet (kreve
  pre-filtrerte rader) ville flyttet regelen ut til hvert kallsted.
- **Ingen re-eksport fra `buildModeResultForGame.ts`** — funksjonen var privat; en
  re-eksport ville skapt et nytt (server-only-gatet) hjem å importere feil fra.

**Claude's Discretion:** eksakt typenavn i den nye fila, testcasenes utforming,
om `gameMode` bakes i et `game`-objekt eller flate felter (velg det som minner mest
om søsknene).

## Success Criteria

- [ ] 1. `lib/scoring/context/buildUniformContext.ts` finnes, er import-ren
  (ingen `server-only`), og både web-switchen og appens adapter kaller den; den
  private web-versjonen og app-duplikatet er slettet (grep `buildUniformContext`
  treffer kun den nye modulen + kallsteder/tester/dok).
- [ ] 2. `npx vitest run lib/scoring` grønn med ny test-fil for modulen; øvrige
  suiter uendret antall.
- [ ] 3. `npx jest` grønn i `native/app/` uten endringer i forventede verdier
  (adferden er identisk).
- [ ] 4. Alle Gates grønne.

## Gates

(Fersk worktree: `npm install` kreves i BÅDE repo-rot og `native/app/` — appen har
eget lockfile.)

- [ ] `npx vitest run lib/scoring` grønt
- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npm run lint` grønt
- [ ] `npm run build` (rot) grønt før PR

## Files Likely Touched

- `lib/scoring/context/buildUniformContext.ts` (ny) + `buildUniformContext.test.ts` (ny)
- `lib/scoring/buildModeResultForGame.ts` — import + slett privat funksjon
- `native/app/src/lib/scoringContext.ts` — slett duplikat, kall delt modul

## Out of Scope

- **De seks inline-kopiene av liknende uniform-mapping i
  `app/[locale]/games/[id]/leaderboard/formats/`** (matchplay.tsx:58-90,
  fourballMatchplay.tsx:68, foursomesMatchplay.tsx:69, texasScramble.tsx:131,
  shamble.tsx:65, patsome.tsx:45). De er IKKE adferds-like — de filtrerer ikke
  trukne spillere — så å la dem kalle den delte hjelperen ville endret adferd.
  Eget issue hvis det skal samles, ikke denne PR-en.
- Enhver adferdsendring i scoring; flytting av andre hjelpere fra
  `buildModeResultForGame.ts` (`fetchWolfChoices` m.fl. er server-bundne og blir);
  wolf/BBB-arbeidet (#1832); opprydding i appens øvrige kommentarer.
