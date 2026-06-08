# Evaluering: Format-forklaringene (#515 + #516)

**Verdikt: ACCEPT**
**Dato:** 2026-06-08
**Evaluator:** fresh-context sub-agent (skeptisk), gates kjørt uavhengig.

## Per kriterium

| Kriterium | Resultat | Evidens |
|---|---|---|
| #516 ekte chevron-SVG (ikke `⌄`) | PASS | `ModeGuideCard.tsx` path `m6 9 6 6 6-6`, glyf fjernet |
| #516 peker ned lukket / opp åpen | PASS | `group-open:rotate-180` |
| #516 «Vis regler» ↔ «Skjul regler» via CSS | PASS | `group-open:hidden` / `hidden group-open:inline`, ingen JS/useState |
| #516 reduced-motion bevart | PASS | `motion-reduce:transition-none` |
| #515 Ambrose ≠ Texas summary | PASS | distinkte strenger verifisert |
| #515 Ambrose eier utjevnende lag-handikap | PASS | summary + point 2 |
| #515 Texas uendret | PASS | diff rører kun ambrose-blokken |
| Ingen andre identiske summaries | PASS | uavhengig scan, 0 duplikater (23 strenger) |
| Norsk copy-kvalitet | PASS | ingen AI-tells / særskriving / em-dash-kjeder |
| Scope: ingen migrasjon | PASS | ingen migrasjonsfil i diff |
| Scope: ingen øvrige formater rørt | PASS | kun ambrose-blokk endret |
| Scope: ingen nye render-tester | PASS | ingen testfil i diff |

## Gates

- `npx tsc --noEmit` → 0 feil.
- `npx vitest run lib/formats/modeGuide.test.ts components/ModeGuideCard.test.tsx` → 55/55 grønt.

## Merknad

`/spillformater` er auth-gatet → ikke headless-verifiserbar visuelt. UI-kriteriene
er verifisert via kode + eksisterende render-test. Visuell bekreftelse skjer i prod
(eier tester på simulator).

## Issues funnet

Ingen.
