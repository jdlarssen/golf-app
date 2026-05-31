# Evaluering: #307 + #308 — DB-redigerbar modus-forklaring + detaljsider

**Verdikt:** ACCEPT (etter én NEEDS WORK-runde)
**Metode:** Fresh-context skeptisk sub-agent (sonnet) + full suite + build + tsc. Bygget av tre sonnet-implementere (foundation/content, read path, admin) mot kontrakt.

## NEEDS WORK → fikset

1. **6 modi manglet fra `/spillformer`-indeks** (acey_deucey, bingo_bango_bongo, nines, patsome, round_robin, shamble) — hadde detaljsider men ingen kort. Fikset: lagt til i CATALOG.
2. **`ModeGuideCard.test.tsx` tsc-feil** (spurious `mode=`-prop, 4×) — `next build` fanger ikke test-filer, men `tsc --noEmit` gjorde. Fikset.

## Bonus-funn (utenfor #307/#308)

- **#309-regresjon:** `inviteToGameActions.test.ts` feilet på main — #309-gaten kjørte kun `lib/mail/`, ikke action-testen som asserterte eksakte `sendInviteNotification`-args. Fikset assertion (la til gameMode-arg).
- **#322 tsc-feil:** `setupStepInitialValues.test.ts` stableford-fixture manglet `points_table`. Fikset.

## Verifisert

- `mergeModeContent` ren (ingen DB-import), DB-verdi vinner per felt, fallback inkl. 4BBB. `getModeContentMap` cached på `format-mapping`-tag.
- `updateFormatContent` → `revalidateTag('format-mapping')` buster både innholds-map OG getFormatsForIntent (samme tag).
- Alle 3 `ModeGuideCard`-kallsteder oppdatert til props-API. Detaljside `await params`, 404, slug-validering avledet fra MODE_LABELS.
- Innhold: spot-sjekket flere modi, golf-faglig riktig, norsk ryddet.

## Gates

- `npx vitest run` → 2326 passed (196 filer)
- `npm run build` → ✓, /spillformer + /spillformer/[slug] dynamiske
- tsc: 13 baseline-feil (pre-eksisterende #263-filer), 0 i feature-filer
- Prod: migrasjon applisert, 22/22 modi har rules_long + rules_example
