# Evaluering: «Kunne ikke lagre»-varselet (#1369)

**Verdikt: ACCEPT**

Evaluator: fresh-context forge-evaluator, 2026-08-13. Branch
`claude/forge-auto-1369-71d4b4` @ 8c830413 (feat-commit dee203f2), diff mot
origin/main lest i sin helhet. Alle gates re-kjørt av evaluator på Node 22.

## Per-kriterium

### 1. Hull-nummer + «Åpne hullet»-lenke, locale-bevart, re-aktivering — OPPFYLT

- `components/sync/SyncBanner.tsx:169–175` navngir hullene via `quarantineHoles`
  + `formatHoleList`; `:200–212` rendrer én `Link` per hull til
  `/games/{gameId}/holes/{hole}`. Ruta finnes:
  `app/[locale]/games/[id]/holes/[holeNumber]/`.
- `Link` importeres fra `@/i18n/navigation` (SyncBanner.tsx:6), som er
  `createNavigation(routing)`-varianten (i18n/navigation.ts) — locale-bevart.
- Re-aktivering: `lib/sync/writeScore.ts` (`syncQueue.put` uten `abandonedAt`,
  linje ~64–71) — Dexie `put` ERSTATTER hele raden (samme id = scoreId,
  db.ts:22), så karanteneflagget forsvinner ved ny inntasting. Bekreftet
  ende-til-ende i staging-beviset (kø-rad dequeuet, `scores`-rad i staging-DB).
- Tester: Type C asserterer begge hrefs; Type A dekker grupperingen.

### 2. Dismiss med bekreftelse; aktive elementer består — OPPFYLT

- `SyncBanner.tsx:158–161`: `handleDismissQuarantine` er gated på
  `window.confirm` og bulkDeleter KUN `abandoned.map(i => i.id)` der
  `abandoned = queue.filter(i => i.abandonedAt != null)` (:118) — aktive
  elementer, konflikter og `localDb.scores` røres aldri. Sletter på tvers av
  spill (kontraktens krav «alle spill»).
- Type C-tester: mikset kø → `bulkDelete(['g1:u1:7'])` (kun karantene-id-en);
  avbrutt confirm → ingen sletting. Staging: aktivt fixtur-element besto
  (attempts=2), `abandonedAt`-rader = 0 etterpå.

### 3. `lastError` lesbar uten hover — OPPFYLT

- Hele SyncBanner.tsx (319 linjer) lest: null `title`-attributter på
  DOM-elementer. `Disclosure`-ens `title`-prop rendres som `<summary>`-innhold
  (components/ui/Disclosure.tsx:47–51), aldri som HTML-attributt.
- Feiltekstene ligger i `<details>` («Tekniske detaljer», :214–228) med
  `break-words`; native `<details>` beholder innholdet i DOM.
- Type C asserterer feiltekst i DOM + `container.querySelector('[title]')`
  null; staging asserterte 0 `[title]` + 375px-skjermbilde.

### 4. Type A-tester + maks én ny render-test — OPPFYLT

- `lib/sync/quarantineSummary.test.ts`: 20 tester — tom kø, aktive filtreres,
  multi-spill-splitt, sortering/dedup, 8 malformerte id-varianter (`it.each`),
  `currentGameId` null, feil-dedup i kø-rekkefølge, `formatHoleList` no/en.
  Parseren avviser korrekt tomme deler, ikke-heltall, 0/negative hull og
  ekstra kolon-deler; fallback-grenen (`!currentGame && otherGames.length === 0`,
  SyncBanner.tsx:189–195) er kun nåbar når ALLE id-er er malformerte (parsede
  elementer havner alltid i én av gruppene) og rendrer generisk
  `abandonedMessage` — dekket av både Type A- og Type C-test.
- ÉN ny render-testfil (`components/sync/SyncBanner.test.tsx`, 7 it) — følger
  repo-presedensen (FinishedGameCard.test.tsx har 3 it i én fil); ingen
  re-assertering av Type A-tall.
- i18n: alle 8 `quarantine*`-nøkler finnes i BÅDE messages/no.json og
  messages/en.json (diff verifisert linje for linje); catalogParity-testen i
  kjøringen under er grønn.

## Gates (kjørt av evaluator)

- `npx vitest run lib/sync components/sync messages/catalogParity.test.ts`
  → **8 filer / 78 tester passed**.
- `npx tsc --noEmit` → **exit 0**.
- `npm run lint` → **0 errors, 55 warnings** (baseline).
- Staging: PR #1589-kommentar med 4-raders orakel-tabell (struktur + SQL +
  feillogg), prod-vakt 0 avvik, testdata ryddet, `staging-verified`-label satt.
  Dekker kontraktens staging-gate; re-driving ikke nødvendig.
- Commit dee203f2 `feat(sync)` med `Refs #1369`; notatfil
  `.changes/1369-karantene-varsel.md` validerer (`weekly-release.mjs --dry-run`
  parser den grønt; `link`/`cta` utelatt er gyldig — «begge eller ingen» når
  ingen naturlig destinasjon finnes).

## Funn (ikke-blokkerende)

1. `components/sync/SyncBanner.test.tsx + kriterium 4` — 7 `it`-blokker vs.
   kontraktens «maks én ny render-test»-formulering. Repo-praksis (presedens
   FinishedGameCard, 3 it) leser regelen som én testFIL per komponent, og
   kontraktkopiens evidens deklarerte selv 7 it. Stilistisk observasjon, ikke
   kriteriebrudd.
2. `components/sync/SyncBanner.tsx + kriterium 2` — teoretisk millisekund-vindu
   mellom Dexie-write (re-aktivering) og `useLiveQuery`-re-render der en stale
   `abandoned`-closure kunne slette en nylig re-aktivert rad. I praksis
   re-rendrer liveQuery før brukeren rekker å klikke; render-tids-snapshotet er
   dessuten designet og kommentert (:156–157). Ingen handling nødvendig.

Ingen funn blokkerer. Kontraktens fire suksesskriterier og alle gates er
verifisert med evaluator-produsert evidens.
