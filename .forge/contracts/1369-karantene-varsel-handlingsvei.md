# Kontrakt: «Kunne ikke lagre»-varselet skal navngi hull, gi en vei videre og kunne ryddes (#1369)

Kilde: kontrakt-kommentar på issue #1369 (kontrakt-smeden, 2026-08-06). Dette er
byggeøktens kopi med drift-tilpasninger, suksesskriterier og evidens. Branch
`claude/forge-auto-1369-71d4b4`. Produktvalg: JA (Alternativ A bygges, B beskrives
i PR-body).

## Drift fra kontrakt-ankeret (verifisert mot HEAD d7d699aa før bygging)

- Byggerekkefølge-kravet er oppfylt: #1355 (SyncBanner-i18n) er LANDET og CLOSED
  (commit `412bb5cb fix(sync): translate SyncBanner queue and error messages`
  ligger i branch-historikken). Denne kontrakten bygger oppå nøkkel-strukturen.
- Kontraktens linjenumre i SyncBanner.tsx har flyttet seg (toArray nå :77–80,
  `title` :161, rawError :127) — innholdet i påstandene stemmer fortsatt.
- Kontraktens gate «minor-bump + CHANGELOG-Funksjon-rad» er foreldet av #1562
  (notatfil-regimet): `.changes/1369-*.md` skrives i stedet; package.json/CHANGELOG
  røres ikke.
- SyncBanner er montert kun i `app/[locale]/games/[id]/layout.tsx` (TopBar nevner
  den bare i en z-index-kommentar) → gameId leveres som ny optional prop fra
  layouten, ikke via usePathname-parsing (kontrakten tillot begge).

## Design (Alternativ A — som bygget)

1. **Navngi hullene uten Dexie-join:** `scoreId` er `${gameId}:${userId}:${holeNumber}`
   (kolonfrie uuid-er) → ren hjelpefunksjon `lib/sync/quarantineSummary.ts`
   (`summarizeQuarantine(items, currentGameId)`) grupperer karantene-elementer per
   spill: gjeldende spill (hull-liste, sortert/dedupet) skilles fra fremmede spill;
   malformede id-er telles men grupperes ikke (fallback til generisk melding).
   Hull-lista joines locale-bevisst med `Intl.ListFormat`.
2. **Vei videre:** «Åpne hull N»-lenke per karantene-hull i gjeldende spill via
   locale-bevisst `Link` fra `@/i18n/navigation` → `/games/{id}/holes/{n}`, i den
   indre `pointer-events-auto`-diven. Fremmede spill: én linje per spill («N slag
   fra en annen runde …») med «Åpne runden»-lenke til `/games/{gameId}`. Hjelpe-copy
   lover reparasjon betinget (kun mens runden er aktiv).
3. **Detalj uten hover:** `title`-attributtet fjernes; karantene-varianten viser
   `lastError`-tekster i eksisterende `Disclosure`-primitiv («Tekniske detaljer»),
   og meldingen brytes normalt (ikke `truncate`).
4. **Opprydningsvei:** dismiss-knapp på karantene-banneret med `window.confirm`-vakt
   (presedens `EndGameButton.tsx:60`); confirm-teksten sier konsekvensen rett ut.
   Sletter KUN elementer med `abandonedAt != null` (alle spill — ellers gjenoppstår
   banneret i neste runde); aktive elementer, konflikt-varsler og `localDb.scores`
   røres aldri.

## Suksesskriterier

- [x] 1. Med et karantenesatt element viser banneret hull-nummer og en «Åpne
  hullet»-lenke til riktig hull (locale-bevart); ny inntasting re-aktiverer
  elementet (kø-raden mister `abandonedAt`), og synker når årsaken er borte.
  **Evidens:** Staging-driver (PR #1589-kommentar): 2× `quarantine-open-hole`
  med korrekte hrefs; klikk på hull-3-lenka → tap-til-par på eget kort →
  kø-raden dequeuet, `scores`-rad (strokes 4) i staging-DB, banneret droppet
  hull-3-lenka. Locale-bevaring: `Link` fra `@/i18n/navigation` + Type C-test
  asserterer href. Re-aktivering er `writeScore.put` (writeScore.ts:65–71 —
  ny rad uten `abandonedAt`).
- [x] 2. Dismiss med bekreftelse fjerner karantene-varselet permanent; aktive
  kø-elementer består.
  **Evidens:** `handleDismissQuarantine` bulkDeleter kun render-tidens
  `abandoned`-id-er bak `window.confirm`. Staging: confirm-dialog fanget,
  `abandonedAt`-rader = 0 etterpå, banner borte, det aktive fixtur-elementet
  besto (attempts=2). Type C-test «dismiss sletter kun karantene-elementene»
  asserterer bulkDelete-argumentene mot mikset kø.
- [x] 3. Karantene-`lastError` er lesbar på mobil (uten hover).
  **Evidens:** `title`-attributt fjernet (0 `[title]` i banneret, assertet på
  staging); Disclosure «Tekniske detaljer» viser rå-feilen med `break-words`;
  skjermbilde 375px viser utbrettet detalj; Type C-test asserterer feilteksten
  i DOM.
- [x] 4. `quarantineSummary` har Type A-tester (grupperings-/parse-kasus inkl.
  flere spill, 1 vs. flere hull); maks én ny render-test (Type C) for
  karantene-varianten.
  **Evidens:** `lib/sync/quarantineSummary.test.ts` — 20 tester (tom kø,
  aktive filtreres, multi-spill-splitt, sortering/dedup, 8 malformerte
  id-varianter via `it.each`, currentGameId null, feil-dedup, formatHoleList
  no/en). Én ny render-testfil `components/sync/SyncBanner.test.tsx` (7 it,
  samme komponent — presedens FinishedGameCard).

## Gates

- [x] `tsc` + `lint` + `vitest` grønne (pre-push + CI) + `npm run build` (full gate).
  **Evidens:** vitest 78/78 (lib/sync + components/sync + catalogParity);
  lint 0 errors / 55 pre-eksisterende warnings; `npm run build` fullført med
  rutetre (suksess-markør); pre-push-gaten kjørte grønt ved push av dee203f2.
- [x] Staging-verifisering av karantene-flyten før merge (karantene-element mintet
  ved Dexie-manipulasjon på staging); bevis-kommentar + `staging-verified`-label på PR.
  **Evidens:** PR #1589-kommentar med orakel-tabell (9/9 driver-steg OK,
  prod-vakt 0 avvik, testdata ryddet); `staging-verified`-label satt.
- [x] Commit: `feat`-prefix med `Refs #1369` + `.changes/1369-*.md`-notatfil
  (notatfil-regimet #1562 — erstatter kontraktens utdaterte bump-gate).
  **Evidens:** commit dee203f2 `feat(sync): …` med `.changes/1369-karantene-varsel.md`;
  commit-msg-hooken passerte.

## Out of Scope

- Kø-telling/-filter per spill (#1370) — tellingen forblir global.
- SyncBanner utenfor spill-sidene (#1391).
- «Innloggingen er utløpt»-lenke til /login (#1371).
- Auto-sletting av karantene ved spillslutt.
