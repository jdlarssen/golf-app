# Kontrakt: Offentlig side /hvorfor-torny — «Dette får du i Tørny» vs. andre golf-apper (#1419)

## Problem

Tørny mangler en flate som svarer på «hvorfor Tørny og ikke en vanlig golf-app?».
Eieren bestilte en sammenligningsside 2026-07-30/31 (eier-pull — overstyrer
ferdiggrensen i `docs/hva-er-nok.md`). Designet er ferdig brainstormet med eieren
over tre mockup-iterasjoner; **v3 er godkjent** og er fasit:
`docs/superpowers/specs/2026-07-31-hvorfor-torny-mockup.html` (struktur + all norsk copy)
og `docs/superpowers/specs/2026-07-31-hvorfor-torny-design.md` (beslutninger + rammer).

Eier-rammer (alle eksplisitt bekreftet i økten):
- Egen offentlig side (`/hvorfor-torny`), ikke forside-seksjon, ikke del av pilarsiden #1267.
- Generisk sammenligning — ALDRI navngitte konkurrenter; påstander om «andre apper»
  holdes myke («Krever abonnement», «Varierer»).
- Positiv vinkling — ingen «dette mangler vi»-seksjon.
- Visuelt over tekst — eieren avviste v1 som «mye tekst og lite visuelt»; tall-fliser,
  hake-matrise og mini-tavle ER designet. Ikke gjeninnfør prosa-blokker.

## Research-funn (verifisert i økten)

- `app/[locale]/AnonLanding.tsx` (456 linjer) er mønsteret: server component, copy via
  `getTranslations('landing')`, JSON-LD `@graph`, lokale hjelpere `SectionHeading`,
  `Step`, `AudienceCard`, `TextLink`, `FooterLink` nederst i fila.
- `proxy.ts:47-48`: `AUTH_OPTIONAL_PATH_PATTERN = /^\/$|^\/(finn-turneringer|spillformater)(\/|$)/`
  — anonym leser uten redirect, innlogget beholder verified-user-header og bunn-nav.
  PUBLIC ville strippet headeren (#1185-fella, dokumentert i kommentaren over mønsteret).
- i18n: `messages/no.json` + `messages/en.json`; `catalogParity.test.ts` håndhever at
  nye nøkler finnes i begge.
- `app/sitemap.ts` + `app/sitemap.test.ts` finnes (test må oppdateres med ny URL).
- Kapasitetsanalyse 2026-07-31 (prod, read-only): DB 106 av 500 MB, 20 brukere; gratis-
  stacken holder til klubbskala. «0 kr»-påstanden er sann i dag; «for alltid» loves ikke.

## Design

**1. Rute:** `app/[locale]/hvorfor-torny/page.tsx`, server component, helt statisk
(ingen DB). `hvorfor-torny` inn i `AUTH_OPTIONAL_PATH_PATTERN` (IKKE PUBLIC).

**2. Sidestruktur — speil mockup v3 nøyaktig (9 seksjoner):**
topprad (BrandMark + LocaleSwitcher + login-lenke) → hero («Dette får du i Tørny» /
«Laget for én ting: turneringen deres.») → 2×2 tall-fliser (0 kr gull-aksent / 20+ /
2 min / 150; Fraunces, proporsjonale siffer — IKKE `tabular-nums` på store frittstående
tall) → hake-matrise «Tørny mot resten» (8 rader, ✓-sirkel mot kort dempet note) →
mini-tavle «Spenningen er innebygd» (statisk eksempelkort: live-dot, gull-leder 🏆,
`tabular-nums` på poengkolonnen, tre chips) → tre ikon-punkter «Spisset for turneringen»
+ mørkegrønt sitatkort med gull-utheving → FAQ (3 stk) → slutt-CTA (demo primær,
login-tekstlenke) → bunnlenker.

**3. Copy:** norsk copy løftes ORDRETT fra mockup v3 inn i ny `whyTorny.*`-namespace i
`messages/no.json` (den er allerede humanizer- + no-nb-vasket — ikke omskriv).
`messages/en.json` oversettes etter intensjon (no-nb-prinsippene i revers), ikke ord
for ord. FAQ-arrayen mater både synlig FAQ og FAQPage-JSON-LD (identisk tekst per
konstruksjon, samme mønster som AnonLanding).

**4. Metadata/SEO:** `generateMetadata` per locale; JSON-LD WebPage + FAQPage — IKKE
dupliser WebSite/Organization-nodene (de bor på forsiden). Rute inn i `app/sitemap.ts`
(begge locales). Ny `FooterLink` «Hvorfor Tørny?» på AnonLandings bunnlenke-rad.

**5. Gjenbruk:** `Card`/`LinkButton`/`SmartLink`/`BrandMark`/`LocaleSwitcher` fra
`components/ui/`. AnonLandings lokale hjelpere som trengs begge steder
(`SectionHeading`, `TextLink`, `FooterLink`) trekkes ut til en delt modul under
`app/[locale]/` og importeres fra begge sider — ikke dupliser. Sidespesifikke biter
(tall-flis, matrise-rad, chip, tavle-kort) bor lokalt i den nye sida.

## Harde copy-vakter

- **App-framing:** native app kommer (epic #1276). Selg «Bli med rett fra nettleseren» /
  «Alle må ha appen» (andre) — ALDRI «ingen app finnes». FAQ-svaret er formulert så det
  holder også etter app-lansering.
- **Aldri «gratis for alltid»** — copy beskriver nåtid.
- **Ingen konkurrentnavn** noe sted på sida (heller ikke i en-katalogen eller metadata).
- Matrise-tittelen «Tørny mot resten» er bevisst brand-stemme (eier så den to ganger og
  beholdt den). Tavle-navnene (Kristian/Marte/Jonas) er fiktive og OK.

## Nøkkelbeslutninger

- AUTH_OPTIONAL, ikke PUBLIC (innloggede beholder bunn-nav — #1185-fella).
- Statisk side uten DB — Suspense/feilhåndtering trengs ikke.
- Dark mode via eksisterende semantiske tokens (mockupen viser bare lys modus).
- Commit: `feat(marketing)` e.l. + minor-bump + CHANGELOG Funksjon-linje. Refs #1419.

**Claude's discretion:** eksakt navn/plassering på den delte hjelper-modulen;
i18n-nøkkelstruktur under `whyTorny.*`; om ikon-boblene bruker emoji (som mockupen)
eller eksisterende ikon-konvensjon hvis appen har en.

## Suksesskriterier

- [x] Anonym GET `/hvorfor-torny` og `/en/hvorfor-torny` gir 200 med innhold (ingen
  login-redirect). **Bevis:** evaluator-runde 1: `next start` + anonym curl → 200/200;
  kontroll `/profile` → 307 login-redirect (gaten aktiv).
- [x] Innlogget besøkende ser sida MED bunn-nav. **Bevis:** staging-klikk: login-POST
  303 → `/hvorfor-torny`, `[data-testid="bottom-nav"]` i live DOM + skjermbilde
  (Hjem/Innboks/Klubbhuset/Profil synlig). PR #1563-kommentar.
- [x] Sidestrukturen matcher mockup v3 (alle 9 seksjoner, 8 matriserader, 3 FAQ).
  **Bevis:** evaluator-runde 1: bygget HTML — 9 seksjoner i mockup-rekkefølge, 8
  matriserader, 3 FAQ, 4 fliser i 2×2. Skjermbilde følger i staging-runden.
- [x] Norsk copy er identisk med mockupens (stikkprøve på minst matrise + FAQ i
  evalueringen — avvik er funn). **Bevis:** evaluator-runde 1: full streng-for-streng-
  diff mockup → `whyTorny.*` i no.json — alt ordrett; 38 strenger gjenfunnet i bygget HTML.
- [x] JSON-LD i kilden inneholder FAQPage med samme tekst som synlig FAQ; ingen
  WebSite/Organization-duplikat. **Bevis:** evaluator-runde 1: `@graph` = kun
  WebPage + FAQPage; FAQPage deep-equal med katalog-arrayet.
- [x] `grep -ri "gamebook\|for alltid" app/\[locale\]/hvorfor-torny messages/` (case-
  insensitivt, whyTorny-nøklene) er tomt. **Bevis:** grep tom i hele diffen + begge
  bygde HTML-varianter (kommentar som siterte frasen omformulert i `af481177`).
- [x] Sitemap inneholder begge locale-URL-ene; `sitemap.test.ts` oppdatert og grønn.
  **Bevis:** no-URL som entry + en-URL som hreflang-alternate (filas mønster); test grønn.
- [x] Forsiden har bunnlenke til sida. **Bevis:** runtime-curl av `/` viser
  `href="/hvorfor-torny"` med «Hvorfor Tørny?»; `landing.footer.whyTorny` i begge kataloger.
- [x] Maks ÉN ny render-test (Type C); `catalogParity`-testene grønne. **Bevis:**
  nøyaktig én ny testfil (`page.test.tsx`); 34/34 grønne inkl. catalogParity + apostropheParity.

## Gates

- [x] `npm run build` + `npm run lint` + berørte co-located tester grønne
  **Bevis:** build exit 0 (begge locale-ruter prerendret); lint 0 errors / 0 nye
  warnings i berørte filer; 34/34 tester grønne (builder + evaluator, uavhengig).
- [x] Commit-body `Refs #1419`; PR-body `Closes #1419` + Fordeler/ulemper-blokk
  **Bevis:** PR #1563 opprettet draft-først med begge deler.
- [x] Staging-bevis-kommentar + `staging-verified`-label FØR merge (#1076)
  **Bevis:** PR #1563-kommentar (orakel-tabell) + label satt 2026-08-11.
- [x] Ingen produktvalg gjenstår (alle tatt av eier i brainstorm) → auto-merge-policyen
  gjelder når portene er grønne

## Filer som trolig berøres

- `app/[locale]/hvorfor-torny/page.tsx` — NY
- `app/[locale]/AnonLanding.tsx` — hjelper-uttrekk + ny FooterLink
- ny delt hjelper-modul under `app/[locale]/`
- `proxy.ts` — AUTH_OPTIONAL-mønsteret
- `app/sitemap.ts` + `app/sitemap.test.ts`
- `messages/no.json` + `messages/en.json`
- `package.json`/`package-lock.json`/`CHANGELOG.md`

## Utenfor scope

- Pilarsiden #1267 (lenker hit senere, eget issue)
- Konkurrent-navngitte SEO-sider
- OG-bilde-rute for sida (rot-brand-kortet gjelder)
- Copy-oppdatering av FAQ-svaret når native-appene shipper (naturlig del av #1276)
