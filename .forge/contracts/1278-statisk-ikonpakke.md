# Kontrakt: Statiske app-ikoner, maskable-ikon og splash-assets (#1278)

## Problem

Alle app-ikoner er runtime-genererte `next/og`-ruter (`app/icon.tsx` 192px, `app/icon0.tsx` 512px, `app/apple-icon.tsx` 180px) som henter Fraunces fra Google Fonts ved rendring. Butikkene (#1279 Bubblewrap, #1283 Capacitor) trenger statiske filer, og manifestet (`app/manifest.ts`) har kun `purpose: any`-ikoner — Androids adaptive maskering beskjærer eller letterboxer dagens design. Eieren skal kunne gi tommel opp på det rendrede settet i PR-en før #1279 konsumerer det.

## Research-funn (verifisert i økten)

- Design-fasiten finnes allerede: `docs/design/realized/brand-foundations/assets/brand-mark-icon-only.svg` (serif «T» i Fraunces 500, `#F8F6F0` på `#1B4332`, champagne-dot `#C9A961` nede til høyre) — samme motiv som `app/icon.tsx` gjenskaper i kode.
- `app/manifest.ts`: `background_color: '#f8f6f0'`, `theme_color: '#1b4332'`, tre ikon-entries, ingen maskable.
- `public/` har ingen ikonfiler; matcheren i `proxy.ts` ekskluderer allerede `.png`-stier fra auth-gaten → statiske ikoner under `public/icons/` trenger INGEN proxy-endring.
- Playwright chromium er repo-avhengighet og etablert rendrings-motor for SVG→PNG (#1260-kontrakten) — ingen ny dependency.
- `sharp` følger med Next i `node_modules` (verifiser med `npm ls sharp` før bruk) — trengs for alfa-stripping av App Store-ikonet (chromium-screenshots har alfakanal; App Store Connect avviser PNG med alfa).

## Design

**1. Master-kilde:** `native/assets/icon-master.svg` — avledet fra `brand-mark-icon-only.svg`. Sjekk om SVG-en bruker `<text>` eller paths: bruker den `<text>`, rendres via chromium med Google-Fonts `@font-face`-lenke i en HTML-harness (nett kreves kun ved generering); alternativt konverteres tekst til path én gang. To varianter i master-harnessen:
   - **Full-bleed** (motiv fyller flaten, forest-bakgrunn) — for App Store 1024 og `purpose: any`.
   - **Safe-zone** (motiv skalert inn i midtre ~61 % for Android adaptive / midtre 80 %-sirkel for maskable, forest-bakgrunn helt ut) — for maskable + adaptive foreground.

**2. Genererings-script:** `native/assets/generate-icons.mjs` (Playwright chromium, committes — regenerering skal være én kommando). Output:

| Fil | Størrelse | Krav |
|---|---|---|
| `native/assets/appstore-1024.png` | 1024×1024 | **ingen alfakanal** (IHDR color type 2) |
| `native/assets/android-foreground-432.png` | 432×432 | motiv i midtre ~61 %, transparent bakgrunn |
| `native/assets/android-background.png` + dokumentert fargeverdi `#1B4332` | 432×432 | ensfarget |
| `public/icons/maskable-192.png` + `maskable-512.png` | 192/512 | motiv innenfor 80 %-sirkelen |
| `native/assets/ios-splash-logo.png` | ~512 bred, transparent | til #1283-storyboard (logo + bakgrunnsfarge `#F8F6F0`) |
| `native/assets/preview-contact-sheet.png` | — | alle assets samlet + sirkel-/squircle-maskert forhåndsvisning av maskable |

**3. Manifest:** `app/manifest.ts` får to nye entries `{src: '/icons/maskable-192.png' | '/icons/maskable-512.png', purpose: 'maskable'}` — dagens `any`-entries beholdes uendret (issue-krav).

**4. TWA-splash-verifisering:** dokumentér i PR-en at `background_color #f8f6f0` + 512-ikonet gir pen splash (TWA-splash = disse to verdiene); ingen kodeendring ventes.

**5. Eier-tommel-opp:** PR-kommentar som VISER settet — embed de committede PNG-ene via raw-URL-er på branchen (`https://raw.githubusercontent.com/jdlarssen/golf-app/<branch>/…`) med contact-sheet øverst. PR-en merkes `needs-manual-qa` («eier godkjenner ikonsettet visuelt») — #1279 skal ikke starte før tommelen.

## Kanttilfeller & vakter

- **Alfa-verifisering mekanisk:** les PNG-IHDR (byte 25 = color type) i genererings-scriptet og feil høyt hvis 1024-filen ikke er type 2 — aldri «ser riktig ut».
- **Maskable-sjekk uten ekstern tjeneste:** contact-sheet-harnessen tegner maskable-ikonet bak `clip-path: circle(40%)` — beskåret motiv blir synlig i selve PR-bildet. (maskable.app-kriteriet fra issuet dekkes av samme geometri; eieren kan dra filen dit ved tvil.)
- **Ingen rendring i CI/natt-VM uten nett:** scriptet er engangs/på-forespørsel — output committes, bygget avhenger aldri av scriptet.
- Dark mode: app-ikoner følger ALLTID light-paletten (samme regel som `lib/og/palette.ts` — «must NOT invert in dark mode»).
- `app/icon.tsx`-rutene røres ikke (PWA-nettleser-kanalen beholder dem).

## Nøkkelbeslutninger

- **Plassering `native/assets/`** — ASSUMPTION: ny toppnivå-mappe; matcher #1283s plan om `native/ios/`. Butikk-assets skal ikke ligge i `public/` (serveres unødig); kun manifest-ikonene bor i `public/icons/`.
- **Playwright-rendring, ikke ny dependency** — #1260-presedens.
- **Commit:** `feat(pwa)` + minor-bump + CHANGELOG-linje («Appikonet tilpasser seg nå Androids ikon-maskering») — maskable-ikonet er synlig for Android-brukere ved installasjon. Refs #1278.
- Lighthouse-kriteriet fra issuet erstattes av mekaniske sjekker (manifest-JSON-form + fil-eksistens + IHDR) — Lighthouse-PWA-kategorien er deprecated og gir ikke stabil CI-signal.

**Claude's discretion:** eksakt motiv-skalering innenfor safe-zonene; om `android-background` leveres som PNG, ren fargeverdi i en README-linje, eller begge; harness-detaljer.

## Suksesskriterier

- [ ] Alle filene i tabellen finnes og har eksakt oppgitt pikselstørrelse (script-output listes i PR).
- [ ] `appstore-1024.png` har IHDR color type 2 (ingen alfa) — script-asserten kjørt, output i PR.
- [ ] `app/manifest.ts` har begge maskable-entries; `curl -s localhost:3000/manifest.webmanifest | jq '.icons'` viser 5 entries; `curl -sI localhost:3000/icons/maskable-512.png` gir 200 uinnlogget.
- [ ] Contact-sheet i PR-kommentaren viser hele settet inkl. sirkelmaskert forhåndsvisning uten beskåret motiv; `needs-manual-qa` satt med eier-sjekken navngitt.
- [ ] Regenerering er deterministisk: å kjøre scriptet på nytt gir samme dimensjoner/formkrav (ikke nødvendigvis byte-identisk).

## Gates

- [ ] `npm run build` + `npm run lint` grønne; co-located vitest for endrede filer (glob — trolig kun manifest, ingen test-sibling)
- [ ] Commit-body `Refs #1278`; PR-body `Closes #1278`

## Filer som trolig berøres

- `native/assets/` — NY (master-SVG, script, 5+ PNG-er, contact-sheet)
- `public/icons/maskable-192.png`, `public/icons/maskable-512.png` — NYE
- `app/manifest.ts` — to maskable-entries
- `package.json`/`package-lock.json`/`CHANGELOG.md` — bump + linje

## Utenfor scope

- Bubblewrap-/Capacitor-konfig som konsumerer filene (→ #1279/#1283)
- Endring/fjerning av runtime-ikonrutene
- iOS-storyboard-selve (→ #1283; kun logo-asset + fargeverdi leveres her)
