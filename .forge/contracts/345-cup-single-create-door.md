# Forge-kontrakt — #345: Cup opprettes kun via den ene Opprett-veiviseren

**Issue:** [#345](https://github.com/jdlarssen/golf-app/issues/345) · Part of [#344](https://github.com/jdlarssen/golf-app/issues/344) («Én vei til rom»)
**Branch:** `claude/crazy-tesla-a3678f`
**Type:** design / area:admin · PATCH-bump (design-polish, samme kapabilitet via renere dør)

## Problem

Cup-opprettelse har to dører som begge lander i samme veiviser:
- `app/admin/cup/page.tsx:102-105` — full-bredde `<Button>Opprett ny cup</Button>` → `/admin/games/new?intent=cup`
- `app/admin/games/page.tsx:122-127` — «+ Nytt» → `/admin/games/new` (du velger Cup-kort i intent-steget)

Det bryter «én vei til rom». Vi går for **én Opprett-dør** (intent-først-veiviseren): du skaper alt ett sted, og seksjonssider forvalter.

## Kontekst funnet i koden (sannhets-anker)

- **Intent-veiviseren** (`app/admin/games/new/`) har `IntentSelector` (steg 1) med kortene Kompis / Klubb / **Cup** / Solo. Cup-kortet (`INTENT_LABELS.cup = 'Cup'`, egen flagg-`CupIcon`, *ikke* 🏆-emoji — 🏆 i issue-teksten var bare illustrativ) → `CupSetup` (2-stegs cup-creation). Cup opprettes derfra og lander på `/admin/cup/[id]`.
- **Ingen knapp heter «Opprett» enn å.** I dag er eneste inngang til veiviseren «+ Nytt» på Spill-lista. Den konsistente «Opprett»-etiketten er #346 sin jobb (ikke shippet). → Signpost-teksten må IKKE navngi en «Opprett»-knapp som ikke finnes, ellers sender vi brukeren på leting.
- **`/admin/games/new?intent=cup`-ruten beholdes** — cup-detalj (`app/admin/cup/[id]/page.tsx:202-232`) deep-linker dit med `tournament_id` + `game_mode` for å legge til *matcher* (egen flyt, ikke cup-opprettelse). Uberørt.
- **Ingen tester** (unit eller e2e) asserter «Opprett ny cup»-knappen. Grep over `*.test.*` + `e2e/` → tom. Akseptkriterium 4 er dermed trivielt oppfylt (ingenting å fjerne), men vi verifiserer eksplisitt.
- `/admin/cup` har i dag **ingen** TopBar-`action` (kun body-knappen). Vi legger IKKE til en «+ Nytt» TopBar-action — det ville bare relokere duplikat-døra.

## Beslutning (gray-area avklart)

`/admin/cup` blir en ren administrasjons-side (liste + forvalt). Cup opprettes kun via den ene veiviseren.

**Tom-tilstand = signpost med liten inline-lenke** (bruker valgte «gjør det som er smartest» → Option A):
- Kort tekst med en *liten inline-tekstlenke* (`SmartLink`, `underline hover:no-underline` — samme mønster som `PlayerShortageBanner`) rett til `/admin/games/new?intent=cup`.
- **Ikke** en full-bredde primær-knapp som konkurrerer. Lenken er et *veiskilt mot den ene døra*, ikke en andre dør — issue-en blesser dette eksplisitt («evt. en liten inline-lenke til Opprett-døra er ok»).
- Teksten navngir ingen knapp → blir ikke feil før #346 lander. Cup forblir ett-trykk unna fra cup-lista (ingen UX-regresjon).
- Ikke-tom liste viser **ingen** opprett-affordance i det hele tatt (bare lista).

## Akseptkriterier

- [ ] **AC1** — Ingen primær «opprett cup»-knapp på `/admin/cup`: `<Button>Opprett ny cup</Button>` + `<Link href="/admin/games/new?intent=cup">`-wrapper + omkringliggende `<div className="mb-5">` er fjernet. *Evidens: grep `Opprett ny cup` → 0 treff i `app/`.*
- [ ] **AC2** — Tom-tilstand er en signpost med liten inline-`SmartLink` til `/admin/games/new?intent=cup`, ikke en konkurrerende primær-knapp. *Evidens: file:line + render.*
- [ ] **AC3** — Ingen TopBar create-action lagt til på `/admin/cup` (døra relokeres ikke). *Evidens: `TopBar` har ingen `action`-prop.*
- [ ] **AC4** — Cup opprettes fortsatt via veiviseren: `/admin/games/new` → IntentSelector → Cup → CupSetup, og lander på `/admin/cup/[id]`. *Evidens: kode-sti uendret; `IntentSelector` cup-kort + `CupSetup` intakt.*
- [ ] **AC5** — `/admin/games/new?intent=cup` fungerer fortsatt; match-deep-links fra cup-detalj uberørt. *Evidens: `parseIntent('cup')` + `app/admin/cup/[id]/page.tsx` deep-links uendret.*
- [ ] **AC6** — Ubrukte importer fjernet (`Link` fra `next/link`, `Button` fra `@/components/ui/Button` hvis ikke lenger brukt). *Evidens: lint/tsc grønn, grep.*
- [ ] **AC7** — Ingen test asserter den fjernede knappen (bekreftet ingen finnes); ingen ny test lagt til (Type C-disiplin: maks én render-test per komponent, og dette er ren fjerning). *Evidens: grep `*.test.*` + `e2e/`.*
- [ ] **AC8** — Norsk copy passerer humanizer (ingen AI-tells, ingen em-dash-kjede, action-verb). *Evidens: humanizer-skill kjørt på ny streng.*
- [ ] **AC9** — `package.json` bumpet PATCH (1.60.0 → 1.60.1) + `CHANGELOG.md`-oppføring i samme commit; commit-msg-hook grønn. *Evidens: hook passerer, footer-versjon.*

## Filer

- `app/admin/cup/page.tsx` — fjern knapp-blokk, oppdater tom-tilstand til signpost, rydd importer.
- `package.json` + `CHANGELOG.md` — version-bump + oppføring.

## Gates (scoped til endringen)

```bash
npm run lint
npx tsc --noEmit
npx vitest run app/admin/games/new   # cup-relaterte wizard-tester (nærmeste co-located dekning)
npm run build                        # fanger exhaustive-switch / RSC-feil (per tsc-gate-trap-memory)
```

Build er den autoritative gaten — `tsc --noEmit` alene fanger ikke alt i Next.js 16 RSC-grafen.

## Ut av scope (ikke gold-plate)

- Den konsistente «Opprett»-etiketten/plasseringen → #346.
- Cup-navigasjon (tilbake-lenke, spiller-vei til leaderboard) → #347.
- Ingen endring i `CupSetup`, `IntentSelector`, cup-actions, eller cup-detalj.
