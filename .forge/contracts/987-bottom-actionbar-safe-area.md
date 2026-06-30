# Kontrakt: BottomActionBar — slutt på «bleed» i safe-area

**Issue:** [#987](https://github.com/jdlarssen/golf-app/issues/987)
**Type:** Bug-fix (CSS/presentasjon), lav blast-radius
**Berører:** `components/hole/BottomActionBar.tsx` (+ verifiser bunn-klarering i `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx`)
**Bump:** PATCH (bruker-synlig utseendeendring) → én linje i CHANGELOG under Feilrettinger

## Problem

`BottomActionBar` ER baren: full bredde, kant-til-kant, avrundet topp + flush bunn, og knappens egen grønne farge fyller `env(safe-area-inset-bottom)` helt ned til skjermkanten ([BottomActionBar.tsx:17-34](components/hole/BottomActionBar.tsx)). På en telefon med home-indikator legger det ~34px grønt under teksten; ligger baren mid-skjerm (kort innhold) har den grønne ingenting under seg → leses som «bleed». Komponenten rendres i normal flyt (ikke sticky/fixed) som siste element i `HoleClient`-fragmentet ([HoleClient.tsx:986](app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx)), eneste konsument.

## Design

Gjør baren til en **innrammet, avgrenset knapp** i stedet for en kant-til-kant-flate:

1. **Avrund alle fire hjørner** — `borderRadius: '18px 18px 0 0'` → ett radius-tall på alle fire (f.eks. `16`).
2. **Insett fra skjermkantene** — fjern `width: '100%'`; `display: block` med horisontal margin gir auto-bredde minus margin. Legg til side-margin (f.eks. `0 16px`).
3. **Flytt safe-area-klareringen fra padding til bunn-margin** — knappens `padding-bottom` skal IKKE lenger inneholde `env(safe-area-inset-bottom)`. I stedet får knappen en bunn-margin på `calc(16px + env(safe-area-inset-bottom, 0px))`, så page-bakgrunnen (linen / `--bg`) fyller sonen under knappen og home-indikatoren ligger på bakgrunnen — ikke på den grønne flaten.
4. **Padding** blir symmetrisk igjen (f.eks. `17px 18px`), uten safe-area-inset.

Resultat: en grønn, fullt avrundet knapp med luft rundt seg; det nederste på skjermen er page-bakgrunnen, ikke knappen. `HoleClient` trenger trolig ingen endring fordi bar-marginen nå eier bunn-klareringen (inkl. safe-area) — men verifiseres visuelt.

Oppdater også komponent-kommentaren (linje 12-16) så den beskriver det nye, innrammede mønsteret (ikke «knappen ER bunn-baren»).

## Suksesskriterier

- [ ] **K1 — Alle fire hjørner avrundet.** `barStyle` bruker ett `borderRadius`-tall på alle fire hjørner (ingen `… 0 0`).
- [ ] **K2 — Innrammet/insett.** `width: '100%'` er fjernet; knappen har horisontal margin slik at page-bakgrunnen vises på sidene. `box-sizing` håndteres så bredden ikke overflyter (`display: block` + margin gir auto-bredde).
- [ ] **K3 — Safe-area på bakgrunn, ikke på knapp.** `env(safe-area-inset-bottom)` finnes IKKE lenger i knappens `padding`; den ligger i en bunn-margin (`calc(16px + env(safe-area-inset-bottom, 0px))`). På en telefon med home-indikator er sonen under knappen page-bakgrunn, ikke `--primary`.
- [ ] **K4 — Disabled/enabled-adferd uendret.** `disabled` → `<button disabled>` med `--disabled-bg`/`--disabled-fg`; enabled+href → `<a href>`; enabled uten href → `<button>`. `aria-label` = `label`.
- [ ] **K5 — Eksisterende test grønn.** `components/hole/BottomActionBar.test.tsx` passerer uendret (struktur + farger). Ingen nye tester (stil-/CSS-endring, jf. test-disiplin).
- [ ] **K6 — Visuell verifikasjon på staging.** På iPhone-viewport (mobil) leses CTA-en på hull-flaten som en avgrenset, fullt avrundet knapp med home-indikator-sonen på page-bakgrunnen under — ingen grønn «bleed» til skjermkanten. Gjelder både når baren er mid-skjerm (kort innhold) og nederst (langt innhold).
- [ ] **K7 — Porter grønne + versjon.** `tsc --noEmit` rent, lint rent, PATCH-bump i `package.json` (+ `package-lock.json`) og én Feilrettinger-linje i `CHANGELOG.md`.

## Gates

```bash
# Co-located test (skal forbli grønn)
npx vitest run components/hole/BottomActionBar.test.tsx

# Type-sjekk (NB: full build ikke nødvendig for ren CSS-endring, men tsc fanger regresjon)
npx tsc --noEmit

# Lint (scoped til endret fil)
npx next lint --file components/hole/BottomActionBar.tsx 2>/dev/null || npm run lint
```

Visuell gate: staging-klikkrunde av hull-flaten (`preview_start("torny-staging")` → naviger til et aktivt spills hull → `preview_screenshot` på mobil-viewport, evt. `preview_resize` til ~390px bredde).

## Ikke i scope

- Endre tekst/copy på knappen (`bottomLabel` styres av `HoleClient`).
- Endre sticky/scroll-oppførsel (baren er og forblir i normal flyt).
- Røre andre CTA-er eller `components/ui/`-primitiver.
