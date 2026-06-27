# Forge-evaluering: #944 — Glove-vennlige tap-targets + ett-trykks angre

**Verdikt: ACCEPT**

Uavhengig verifisert mot kontrakten `.forge/contracts/944-glove-tap-targets-undo.md`. Alle syv kriterier passerer; alle gates grønne; ingen kutt funnet.

## Per-kriterium

| Krit. | Status | Bevis |
|-------|--------|-------|
| K1 — Steppere ≥44×44px | PASS | `stepperBtnStyle` `width:44, height:44` (ScoreCard.tsx:223–224). Begge `+`/`−`-knappene spreder `...stepperBtnStyle` (linje 335, 344). Test «+ and − steppers render at ≥44×44px» leser faktisk `btn.style.width`/`height` på rendrede knapper (test:271–278) — ikke tautologisk. |
| K2 — `⋯` ≥44px touch-target | PASS | `moreBtnStyle` `width:44, height:44, background:'transparent'` (ScoreCard.tsx:239–250); brukt på ⋯-knappen (linje 353). Glyfen forblir lett (transparent bg, fontSize 14). Test «⋯ button has a ≥44px touch target» (test:280–285). |
| K3 — Angre synlig kun når score satt OG ikke disabled | PASS | JSX-vilkår `{confirmed && !disabled && (<button …/>)}` (ScoreCard.tsx:293). `confirmed = score != null` (linje 90), uavhengig av `hideNetto` → vises også i reveal-modus. Tre tester: hidden-when-unset (252), appears-when-set (257), hidden-when-disabled (312). |
| K4 — Ett-trykks nullstilling, ikke avhengig av ⋯-arket | PASS | `onUndo` → `e.stopPropagation()` + `onClear(playerId)` (ScoreCard.tsx:128–132). I HoleClient: `onClear={onClearFromCard}` (827) → `onClearFromCard` → `clearScoreFor` → `writeScore({strokes:null})` (587–610). Helt separat fra `onClearScore` (601–605, som er ⋯-arkets X og gateet på `valueSheetFor`). Angre-stien rører ALDRI `valueSheetFor`. Test «Angre link calls onClear and does not also fire card tap» (262–267). |
| K5 — Eksisterende oppførsel uendret | PASS | tap=par (onCardClick 98–108), no-op når score satt (106), clamp 1–15 (MIN/MAX 43–46, klamp-tester 233–243), ⋯→sheet (onLongPress→setValueSheetFor 575–578), disabled-gating (alle handlers retur tidlig). Hele eksisterende interaksjons-/disabled-/rendering-suiten grønn (69 tester totalt). |
| K6 — i18n parity | PASS | `undoScore`/`undoScoreAriaLabel` finnes i BÅDE no.json (1803–1804: «Angre» / «Nullstill scoren for {name}») og en.json (1803–1804: «Undo» / «Reset the score for {name}»). `catalogParity.test.ts` grønn. Copy idiomatisk, ingen AI-tells. |
| K7 — Tester genuint assertende | PASS | Nye tester leser faktiske rendrede styles (px-verdier parses fra DOM), faktiske callbacks (`onClear` mock + `onSetScore` IKKE kalt), faktisk synlighet (`queryByText('Angre')` null/present). Ikke tautologiske. |

## Gates (kjørt på Node v22.23.0)

- `npx vitest run ScoreCard.test.tsx catalogParity.test.ts HoleClient.test.tsx` → **3 files / 69 passed**.
- `npm run typecheck` (`tsc --noEmit`) → **grønn, 0 feil**.
- `npx eslint ScoreCard.tsx HoleClient.tsx` → **0 errors, 1 warning** (pre-eksisterende complexity 86 på HoleClient — akseptabelt per kontrakt; ikke introdusert av denne endringen).

## Versjonering

Korrekt minor-bump: `main` 1.148.0 → branch 1.149.0. CHANGELOG har én Funksjon-rad under «1.149 · Lettere å taste med hanske» med #944-lenke. Stemmer med feat→minor + bruker-synlig→CHANGELOG-regelen.

## Sanity-sjekk: Angre-lenkas tap-target

`undoBtnStyle` bruker `minHeight:44, minWidth:44, padding:'11px 6px', margin:'-9px 0'`. Negativ margin trekker kun nabolayout sammen — den krymper IKKE elementets egen box. `minHeight/minWidth:44` garanterer at selve hit-arealet er ≥44px. Tap-target er genuint ≥44px; ingen bekymring.

## Funn

Ingen. Implementasjonen matcher kontrakten på alle punkter; ingen skjulte kutt, ingen scope-avvik. Angre-stien er korrekt frikoblet fra ⋯-arkets state (det var den primære risikoen i kontrakt-design og er håndtert rent via separat `onClearFromCard`/`onClearScore`-par).
