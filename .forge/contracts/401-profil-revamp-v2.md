# Forge-kontrakt: #401 — Profil-revamp v2

**Issue:** https://github.com/jdlarssen/golf-app/issues/401
**Branch:** `issue-401-profil-revamp-v2`
**Milestone:** Tier 2 — Navigasjon
**Bygger på:** #393 + #399 (kompakt Profil)

## Kontekst

Gray area-diskusjonen er gjort i sin helhet (lang design-økt med eier, live-verifisert mockup i prod-Chrome). Beslutningene er låst i #401 og under. Kontrakten formaliserer dem — ingen ny diskusjon.

## Designbeslutninger (låst)

Topp → bunn på `/profile`:
1. **Profil-header (ny):** initial-sirkel (1. bokstav av navn) + navn + «hcp 25,5» (tabular-nums).
2. **Navn** (full bredde).
3. **Kallenavn + Handicap på samme rad:** Kallenavn `flex-1` (placeholder «Valgfritt»), Handicap smalt felt. Under raden (full bredde): «Handicap oppdatert {dato}»; > 4 uker (`isHandicapStale`) → ⚠ varsel.
4. **Plusshandicap — inline «+»-chip:** magnitude-felt (positivt, `inputMode="decimal"`) + tappbar «+»-chip til venstre. På = grønn aktiv, av = inaktiv. **Ingen statisk hjelpetekst.** Live «Lagres som +1,5 · plusshandicap» når på. Lagres internt negativt.
5. **«Golfprofil»** (omdøpt fra «Flere innstillinger», sammenleggbar, åpen når kjønn mangler): Kjønn (2) + Spillerklasse (3) som **segmenterte knapper** (Nassau-oppsett-stil, kompakt — ikke store wizard-fliser). Trimmet hint.
6. **E-post** → kompakt grå skrivebeskyttet linje nederst i kortet.
7. **Lagre** uendret logikk, nederst (ikke sticky).
8. **Logg ut** → full bredde, outline/secondary.
9. **Fjern** personvern-prosaen (redundant med footer-lenke).

`/innboks`:
10. Kompakt **«Månedsbrev»**-toggle + ny `toggleProductUpdates`-action. `updateProfile` slutter å røre `product_updates_unsubscribed_at`. Kortere copy.

Onboarding:
11. Samme hcp-felt + plusshandicap-chip i `/complete-profile`.

## Success-kriterier

- [ ] **K1 — Profil-header:** initial-sirkel + navn + hcp øverst på `/profile`. E-post er IKKE lenger første element; demotert til kompakt grå skrivebeskyttet linje nederst i skjema-kortet.
- [ ] **K2 — Kallenavn + Handicap på samme rad:** Kallenavn `flex-1` + smalt Handicap-felt (ikke full bredde). «Handicap oppdatert {norsk dato}» under raden; stale-varsel (varselfarge) når `isHandicapStale(handicap_updated_at)`.
- [ ] **K3 — Plusshandicap-chip:** «+»-chip toggler plusshandicap uten å taste fortegn; ingen statisk hjelpetekst; live «Lagres som …»-bekreftelse vises når på. Lagret korrekt negativt (Golfbox «+1,5» → DB −1,5). Innlasting av negativ verdi → chip på + magnitude. Fungerer på `/profile` OG `/complete-profile`.
- [ ] **K4 — Fortegns-logikk testet:** ren parse/format-helper for magnitude↔signed med enhetstester (begge retninger, 0, boundary −10/54, plus + vanlig).
- [ ] **K5 — Segmenterte felt:** Kjønn + Spillerklasse rendres som segmenterte knapper (Nassau-stil) i «Golfprofil» via gjenbrukbar `SegmentedField`. Verdiene lagres fortsatt korrekt via FormData; dirty-sporing virker for segment- og chip-endringer.
- [ ] **K6 — «Golfprofil»-omdøping:** seksjonen heter «Golfprofil» (ikke «Flere innstillinger»), fortsatt sammenleggbar, åpen som standard når kjønn er null. Hint trimmet til én linje.
- [ ] **K7 — Månedsbrev flyttet:** fjernet fra profil-skjemaet; `updateProfile` rører IKKE `product_updates_unsubscribed_at` lenger (verifiser: lagring av navn med default-skjema endrer ikke opt-in). Kompakt toggle + `toggleProductUpdates`-action i `/innboks`, kortere copy (ingen «maks én mail»-tekst).
- [ ] **K8 — Logg ut + personvern:** «Logg ut» full bredde (outline); personvern-prosa-setningen fjernet.
- [ ] **K9 — Ingen funksjonalitet tapt:** alle felt redigerbare og lagre-bare; alle MER-rader nåbare; invitér uendret.
- [ ] **K10 — Gater grønne** (se under).

## Gates

```bash
# Co-lokerte tester for endrede områder
npx vitest run app/profile app/innboks app/complete-profile components/ui lib/handicap

# Typecheck + full prod-build (autoritativ)
npm run build

# Lint på endrede filer (scope per chunk)
npx eslint app/profile app/innboks app/complete-profile components/ui/SegmentedField.tsx lib/handicap
```

UI-kriterier (K1–K3, K5, K6, K8) verifiseres til slutt **live i Chrome på prod** (etter merge/deploy) per [[feedback_verify_live_via_chrome]] — `/profile` er auth-gated, så ingen lokal innlogget render.

## Foreslåtte chunks (atomiske commits)

1. `SegmentedField` + test (refactor, ubrukt → ingen bump)
2. Plusshandicap-sign-helper + test (lib/handicap)
3. Profil: header + layout (Kallenavn+Handicap-rad, smal hcp, demote e-post)
4. Profil: hcp freshness + plusshandicap-chip + live-echo (bruk helper)
5. Profil: «Golfprofil» segmenterte kjønn/klasse (bruk SegmentedField)
6. Profil: Logg ut full bredde + fjern personvern-prosa
7. `updateProfile`: signed hcp + slutt å røre product-updates
8. `/complete-profile`: samme hcp + chip
9. Innboks: månedsbrev-toggle + `toggleProductUpdates`-action
10. Versjon: MINOR-bump + CHANGELOG (samlet bruker-synlig)

## Utenfor scope

- Ingen «din aktivitet»-teaser.
- Ingen endring i `lib/scoring/` (kun input-representasjon av eksisterende negativ-hcp).
- Ingen andre varsel-innstillinger enn månedsbrev.

## Versjonering

Bruker-synlig, flere nye elementer → **MINOR-bump** (1.68.x → 1.69.0) + CHANGELOG-oppføring (ny minor-serie-heading, wrap forrige serie i `<details>` per `docs/changelog-conventions.md`). Hook-håndhevet prefiks (`feat`) på den bruker-synlige commiten.
