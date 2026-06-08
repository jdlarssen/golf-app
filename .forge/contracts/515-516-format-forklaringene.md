# Kontrakt: Format-forklaringene — distinkt Ambrose-copy + tydeligere ModeGuideCard-affordanse

**Issues:** [#515](https://github.com/jdlarssen/golf-app/issues/515), [#516](https://github.com/jdlarssen/golf-app/issues/516)
**Branch:** `claude/nervous-shaw-a1332d`
**Dato:** 2026-06-08

## Kontekst

To funn fra utforskningen som strammer scopet kraftig:

1. **#515 er smalere enn issuet fryktet.** Skannet alle 22 formater i `MODE_GUIDE`
   (`lib/formats/modeGuide.ts`). Kun **ett** par har identisk player-rettet `summary`:
   **Ambrose** og **Texas scramble** (begge: «Laget spiller én ball: alle slår, dere
   plukker det beste slaget, og alle slår derfra igjen»). Resten er distinkte, og
   golf-faktaene leser riktig.

2. **Duplikatet bor i kode, ikke DB.** `formats.rules_summary` / `rules_points` er
   NULL i migrasjon 0066; appen faller tilbake til `MODE_GUIDE` (kode). Så fiksen er
   en kode-endring + dens test — **ingen migrasjon, ingen `revalidateTag`**. (Issuet
   antok DB; korrigert her.) DB-ens `rules_long` for Ambrose/Texas er allerede
   differensiert.

## Gråsone-beslutninger (avklart med eier 2026-06-08)

- **Ambrose vs Texas:** Behold begge formatene. Skill copyen: Ambrose sin `summary`
  skrives om så den **eier det utjevnende lag-handikapet** som sin distinkte vri.
  Texas forblir den «rene» scramblen (uendret). Ingen sammenslåing.
- **#516-affordanse:** Ekte chevron-SVG (rene streker, matcher `SettingRow`-stilen)
  + tekst som veksler **«Vis regler» → «Skjul regler»** via ren CSS på åpen-tilstand.
  Reduced-motion-trygt (kun transition fjernes; tekst-bytte + retning kommuniserer
  tilstand uten animasjon).

## Scope

### #516 — `components/ModeGuideCard.tsx`
Erstatt affordanse-spanet (i dag «Slik funker det» + rotert `⌄`-glyf):
- Tekst: `Vis regler` (lukket) ↔ `Skjul regler` (åpen) via `group-open:hidden` /
  `hidden group-open:inline` (parent `<details>` har alt `.group`).
- Ikon: inline chevron-SVG, `viewBox 0 0 24 24`, `stroke=currentColor`, `strokeWidth 2`,
  round caps, path `m6 9 6 6 6-6` (peker ned), `group-open:rotate-180` (peker opp),
  `motion-reduce:transition-none`.

### #515 — `lib/formats/modeGuide.ts`
Skriv om **kun** `ambrose`-entryen (`summary` + `points`) så den er distinkt fra
`texas_scramble` og fremhever det utjevnende lag-handikapet. Texas uendret.
Retning (endelig ordlyd gjennom humanizer):
- summary: en scramble der laget plukker beste slag, men med et lag-handikap som
  veier inn alle og jevner ut sterke/svake lag.
- points: mekanikk (alle slår → velg beste → spill derfra) · handikapet bygger på
  alle på laget · lavest lagtotal etter handikap vinner.

## Suksesskriterier

- [ ] **#516:** `ModeGuideCard` viser et ekte chevron-SVG (ikke `⌄`-glyf), som peker
      ned lukket og opp åpen. Evidens: `ModeGuideCard.tsx` + render-/visuell sjekk.
- [ ] **#516:** Affordanse-teksten er «Vis regler» når lukket og «Skjul regler» når
      åpen (CSS-bytte, ingen JS). Evidens: kode + DOM/visuell sjekk.
- [ ] **#516:** Ingen rotasjons-*animasjon* under `prefers-reduced-motion`
      (`motion-reduce:transition-none` beholdt). Evidens: klasse i kode.
- [ ] **#515:** `MODE_GUIDE.ambrose.summary` ≠ `MODE_GUIDE.texas_scramble.summary`,
      og Ambrose-copyen nevner det utjevnende lag-handikapet. Evidens: `modeGuide.ts`.
- [ ] **#515:** Ingen andre format-summaries er identiske (verifisert: kun dette
      paret var det). Evidens: skann/diff.
- [ ] Ny/endret norsk copy kjørt gjennom `humanizer`. Evidens: notat i commit/eval.
- [ ] Eksisterende co-lokaliserte tester grønne; oppdater snapshot/assertion kun hvis
      en faktisk asserterer endret innhold (ingen ny test — Type C, per test-disiplin).

## Gates

- `npx tsc --noEmit` → 0 feil.
- `npx vitest run lib/formats/modeGuide.test.ts components/ModeGuideCard.test.tsx` → grønt.
- Visuell verifisering av `/spillformater` (chevron + Vis/Skjul-bytte) i evaluator-passet.

## Out of scope

- Ingen DB-migrasjon, ingen `revalidateTag('format-mapping')` (innholdet er i kode).
- Ingen sammenslåing/fjerning av formater (eier valgte «behold begge»).
- Ingen omskriving av de øvrige 21 formatene (kun Ambrose var et reelt duplikat).
- Ingen nye render-tester (maks-én-per-komponent-regelen er alt oppfylt).

## Versjon / CHANGELOG

To bruker-synlige PATCH-bumps (copy-justering + design-polish), én commit per issue,
begge nestet under den åpne `## 1.105.y`-temaet (patch-nesting per eier-konvensjon).
Begge issues lukkes av samme PR.
