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

- [x] **K1 — Profil-header:** *Evidens: [page.tsx ProfileFormCard](app/profile/page.tsx) rendrer initial-sirkel + navn + hcp (Golfbox-format via `fromSignedHcp`+`formatGolfboxHcp`) øverst i Card; e-post flyttet til grå linje nederst i [ProfileFormBody.tsx](app/profile/ProfileFormBody.tsx).*
- [x] **K2 — Kallenavn + Handicap på samme rad:** *Evidens: ProfileFormBody — `flex` med Kallenavn `flex-1` + `w-[148px]` Handicap; full-bredde linje «Handicap oppdatert {nb-dato}» / stale-varsel via `isHandicapStale(handicapUpdatedAt)`.*
- [x] **K3 — Plusshandicap-chip:** *Evidens: «+»-chip (`aria-pressed`) toggler `isPlus` uten fortegn-tasting; ingen statisk hjelpetekst; live «Lagres som +1,5 · plusshandicap» via `formatGolfboxHcp`; action lagrer `toSignedHcp`(magnitude,plus). Innlasting: `splitInitialHcp`/`fromSignedHcp`. Samme i [OnboardingHcpField](app/complete-profile/OnboardingHcpField.tsx). Test: ProfileFormBody.test «lagret negativ hcp → chip på» + complete-profile.test «lagrer plusshandicap negativt».*
- [x] **K4 — Fortegns-logikk testet:** *Evidens: [lib/handicap/sign.ts](lib/handicap/sign.ts) + [sign.test.ts](lib/handicap/sign.test.ts) — 21 tester (toSigned/fromSigned/format/round-trip, 0, ±10, 54).*
- [x] **K5 — Segmenterte felt:** *Evidens: [SegmentedField.tsx](components/ui/SegmentedField.tsx) brukt for kjønn+klasse i ProfileFormBody; skjulte input `gender`/`level` + `hcp_plus` for FormData; `dirty` derivert fra state (inkl. segment/chip). Build grønn ⇒ FormData-typer OK.*
- [x] **K6 — «Golfprofil»-omdøping:** *Evidens: disclosure-legend «Golfprofil»; `showMore` default `initial.gender === null`; hint én linje. Test «Golfprofil-disclosure» (aria-expanded, åpen-når-null).*
- [x] **K7 — Månedsbrev flyttet:** *Evidens: mail-blokk fjernet fra ProfileFormBody; `updateProfile` rører ikke `product_updates_unsubscribed_at` ([actions.ts](app/profile/actions.ts)); `toggleProductUpdates` + [MonthlyDigestToggle](app/innboks/MonthlyDigestToggle.tsx) i Innboks; copy «Månedsbrev» / «Nytt i Tørny på e-post» (ingen «maks én mail»).*
- [x] **K8 — Logg ut + personvern:** *Evidens: [page.tsx](app/profile/page.tsx) AccountActions `Button variant="secondary" className="w-full"`; personvern-`<p>` slettet.*
- [x] **K9 — Ingen funksjonalitet tapt:** *Evidens: alle felt kontrollert+submittes; MER-lista/invitér urørt; build grønn.*
- [x] **K10 — Gater grønne:** *Evidens: `vitest run` → 144/144; `eslint` → 0 errors (1 pre-eksisterende warning i statistikk/page.tsx); `npm run build` → Compiled successfully.*

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
