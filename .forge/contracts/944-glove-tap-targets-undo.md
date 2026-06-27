# Forge-kontrakt: Glove-vennlige tap-targets + ett-trykks angre på hull-skjermen

**Issue:** [#944](https://github.com/jdlarssen/golf-app/issues/944)
**Branch:** `claude/frosty-heisenberg-45173a`
**Effort:** S
**Flyt-forankring:** Kjernesløyfa `spill → score`. Fjerner friksjon i selve inntastingen — går foran polish per CLAUDE.md.

## Problem

På banen tastes det med hanske, i solgløtt, ofte enhåndt. To konkrete friksjoner i `ScoreCard`:

1. `+`/`−`-stepperne er **38×30px** — under appens egen ≥44px tap-target-regel (CLAUDE.md «Stil»).
2. Å rette en feiltastet score krever **3 steg**: trykk `⋯` → spesifikk-score-arket åpnes → trykk `X` (clear). `onClearScore` finnes, men er kun eksponert inne i `SpecificValueSheet`.

## Berørte filer (verifisert)

- `components/hole/ScoreCard.tsx` — stepper-knapper (`stepperBtnStyle` 38×30, `moreBtnStyle` h18), helper-linje (`data-testid="helper-text"`).
- `components/hole/ScoreCard.test.tsx` — eksisterende `describe('ScoreCard — interaction')` + `— disabled`.
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` — `onClearScore` (linje ~587, bundet til `valueSheetFor`), `onSetScore`, kort-render (linje ~804).
- `messages/no.json` + `messages/en.json` — `holes.scoreCard.*` nøkler (parity-håndhevet av `messages/catalogParity.test.ts`).

## Beslutninger (gray-area-diskusjon avklart med eier)

1. **Angre-semantikk = nullstill scoren.** Ett trykk → score tilbake til ghost/par-placeholder. Redo via tap-kort = par, eller `+`/`−`. Ingen per-kort-historikk, ingen «revert til forrige verdi».
2. **Ingen bekreftelse.** Nullstilling er billig å gjøre om — én tap, ingen confirm-dialog. (Destructive-confirm-regelen gjelder konto/spill-sletting, ikke en enkelt score.)
3. **Plassering = liten «Angre»-lenke i helper-linja** (under navnet, der «Netto X» står). Vises kun når score er satt OG kortet ikke er disabled. Holder `+`/`−`/`⋯`-kolonnen uklemt.
4. **`⋯` beholdes.** Spesifikk-score-arket trengs fortsatt for blow-up-hull (>par+2). Angre erstatter det ikke.
5. **Stepper-layout beholdes vertikalt** (`+`/`−`/`⋯`-kolonne) — bare forstørret. Kortet vokser noe i høyde; akseptabelt, glove-vennlighet er målet.

## Success-kriterier

- [ ] **K1 — Steppere ≥44×44px.** `+` og `−` i `ScoreCard` rendres med width ≥44 og height ≥44 (var 38×30). Verifiseres med render-test som leser knappenes style.
- [ ] **K2 — `⋯` ≥44px touch-target.** «Flere»-knappen (`moreBtnStyle`, var h18) har ≥44px tap-høyde og -bredde, glyfen forblir visuelt lett (transparent bg).
- [ ] **K3 — Angre synlig når score satt.** En «Angre»-kontroll vises i helper-linja **kun** når `score != null` og `!disabled`. Skjult når score er null og når disabled. Vises også i reveal-modus (`hideNetto`) siden score kan være satt der.
- [ ] **K4 — Ett-trykks nullstilling.** Klikk på Angre kaller en ny `onClear(playerId)`-prop → `writeScore({ strokes: null })` for den spilleren, uten å åpne `⋯`-arket. Kortet går tilbake til ghost (par-placeholder). Klikket bobler ikke til kort-tap (`stopPropagation`).
- [ ] **K5 — Eksisterende oppførsel uendret.** Tap-kort=par, `+`/`−`-clamp (1–15), `⋯`→ark, disabled-gating — alt uendret. Eksisterende `ScoreCard`-tester grønne.
- [ ] **K6 — i18n parity.** Nye nøkler (`holes.scoreCard.undoScore` label + `undoScoreAriaLabel`) lagt til i **både** `no.json` og `en.json`. `catalogParity.test.ts` grønn. Norsk copy kjørt mot `humanizer`-tells.
- [ ] **K7 — Tester.** Nye interaksjonstester i `ScoreCard.test.tsx` dekker Angre vis/skjul/klikk + stepper-størrelse. `HoleClient.test.tsx` fortsatt grønn (oppdater wiring hvis nødvendig).

## Gates (kjøres scoped til endring)

```bash
npx vitest run components/hole/ScoreCard.test.tsx messages/catalogParity.test.ts app/\[locale\]/games/\[id\]/holes/\[holeNumber\]/HoleClient.test.tsx
npm run typecheck
npm run lint
npm run build
```

## Versjonering

Bruker-synlig `feat` → bump minor (`npm version minor --no-git-tag-version`) + én Funksjon-rad i `CHANGELOG.md` (per `docs/changelog-conventions.md`).

## Eksplisitt utenfor scope

- Ingen schema-/RLS-endring (ren klient-UI).
- Ingen endring av `SpecificValueSheet`-arkets innhold (X-knappen der beholdes).
- Ingen «revert til forrige verdi»-historikk.
- Ingen redesign av kort-layouten utover stepper-størrelse + Angre-lenke.
