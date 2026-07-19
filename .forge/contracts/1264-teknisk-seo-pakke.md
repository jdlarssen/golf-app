# Spec: Teknisk SEO-pakke — åpne spillformater, komplett sitemap, canonical/OG, noindex (#1264)

## Problem

SEO-revisjon 2026-07-17 (16 agenter, kritiske funn adversarielt verifisert mot live prod): tornygolf.no har **null sider i Googles indeks**. Årsakene er tekniske og fiksbare: (1) formatguiden — sidens beste indekserbare innhold, 23 formater tospråklig — er auth-sperret; (2) sitemapen har bare 8 URL-er; (3) ingen side har canonical, metadataBase eller OG-metadata (unntatt signup); (4) /login og /spectate mangler noindex, og alle ukjente URL-er soft-404-er til login med 200. Norske søk som «texas scramble regler» og «wolf golf regler» har i dag null norske treff — innholdet finnes allerede i appen.

## Research Findings

- Next 16 bundled docs (`node_modules/next/dist/docs/.../generate-metadata.md`):
  - `metadataBase` settes i rot-layout; relative stier i URL-baserte felt komponeres mot den; absolutte URL-er ignorerer den. Relativ sti UTEN metadataBase = build error.
  - `title.template: '%s – Tørny'` krever `title.default`; template gjelder KUN child-segmenter (page-titler), ikke segmentet selv.
  - `alternates.canonical` kan være relativ (`'/baner'`) når metadataBase finnes.
- OG-image-filkonvensjon: `opengraph-image.tsx` i et segment gjelder segmentet + alle barn til et barn overstyrer (signup/[shortId] har sin egen i dag — beholdes). Gjenbrukbar infrastruktur finnes: `lib/og/fonts.ts` + `lib/og/palette.ts`.
- cacheComponents-fella: ALDRI `export const runtime` i route-filer (memory + demo-page-kommentar); kun `npm run build` fanger bruddet.
- `getFormatGuideEntries`/`buildFormatGuide.ts` har ingen session-/DB-avhengighet (verifisert grep) — spillformater kan trygt åpnes anonymt.
- Live-verifisert (2026-07-17): apex 307→www (midlertidig); sitemap/robots/JSON-LD peker apex; `site:tornygolf.no` = 0 treff.

## Prior Decisions

- #1023 (offentlige banesider): banesidene er SEO-malen — server-rendret, unik metadata, JSON-LD, sitemap via `listPublicCourseSlugs`. Denne pakken følger samme mønster.
- #1185 (anonym browse): PUBLIC_PATH_PATTERN vs AUTH_OPTIONAL — spillformater er ren læringsressurs uten per-bruker-data → PUBLIC (som baner/demo), ikke auth-optional.
- #1024 (embed): `robots: { index: false, follow: false }`-mønsteret — kopieres til spectate.
- Denne økten (SEO-revisjonen): **kanonisk host = apex `https://tornygolf.no`** (matcher brand + all eksisterende kode-URL-er; Vercel-flippen www→apex 308 er eieroppgave #1270). **Ingen offentlig forside her** (#1265). **Ingen proxy-404-manifest** — noindex på /login er den pragmatiske soft-404-fiksen.

## Design

### 1. Åpne /spillformater (proxy.ts)
Legg `spillformater` inn i `PUBLIC_PATH_PATTERN`-alternasjonen med `(\/|$)`-gruppen (som baner): anonym GET til `/spillformater` og `/spillformater/<slug>` rendrer siden i stedet for 307 til login. Oppdater kommentaren over mønsteret.

### 2. Komplett sitemap (app/sitemap.ts)
Behold `BASE = 'https://tornygolf.no'` (apex-beslutningen). Utvid:
- Eksisterende: rot, `/baner`, banesider.
- Nye: `/spillformater`, `/spillformater/<slug>` for hver `GameMode` (avled fra `Object.keys(MODE_LABELS)` — samme kilde som detaljsidens `VALID_MODES`, så nye modi følger med automatisk), `/demo`, `/finn-turneringer`, `/legal/privacy`.
- hreflang per entry: `languages: { no: BASE+path, en: BASE+'/en'+path, 'x-default': BASE+path }` (i dag mangler selvreferanse + x-default — Googles hreflang-regler krever bidireksjonalitet).
- Ny co-located test `app/sitemap.test.ts` (Type A, mock `lib/courses/publicCourses` ved systemgrensen): alle MODE_LABELS-slugs til stede, hreflang har no/en/x-default, alle URL-er starter med BASE.

### 3. Metadata-fundament (app/[locale]/layout.tsx)
- `metadataBase: new URL('https://tornygolf.no')`.
- `title: { default: t('appName'), template: '%s – Tørny' }`.
- Lokalisert description fra katalogen (ny nøkkel `common.metaDescription`, no + en) — erstatter hardkodet norsk streng som i dag lekker til /en.
- `openGraph: { siteName: 'Tørny', type: 'website', locale }` på layout-nivå.

### 4. Rot-OG-bilde (app/[locale]/opengraph-image.tsx — NY)
Statisk brand-bilde (1200×630): BrandMark-stil «Tørny» i Fraunces + tagline, forest/champagne-palett — gjenbruk `lib/og/fonts` + `lib/og/palette` (mønster: signup-og-bildet, minus spilldata). Ingen `export const runtime`. Signup beholder sitt eget (barnet vinner).

### 5. Canonical + descriptions per offentlig side
Liten helper (f.eks. `lib/seo/canonical.ts`): `canonicalPath(locale, path)` → `path` for default-locale, `/en${path}` for en — brukes i `alternates: { canonical: ... }` per side. Sider som endres:
- `/spillformater` (liste): description (ny katalognøkkel) + canonical. Tittel beholdes («Spillformater» → templates til «Spillformater – Tørny»).
- `/spillformater/[slug]`: description fra formatens `content.<slug>.summary` (finnes allerede i katalogen — ikke ny copy) + canonical. Tittel: `tModes(mode)` (templates automatisk).
- `/demo`: description (ny nøkkel) + canonical.
- `/finn-turneringer`: description (ny nøkkel) + canonical.
- `/legal/privacy`: canonical; fjern « – Tørny» fra `legal.privacy.metaTitle` (template tar over).
- `/baner` + `/baner/[slug]`: canonical; fjern « – Tørny»-suffiks fra `publicCourses.detail.metaTitle` og evt. liste-tittel (unngå «– Tørny – Tørny»). JSON-LD-url er allerede apex = riktig, uendret.
- `/login`: NY metadata-eksport: tittel («Logg inn» → templates), description (ny nøkkel, benefit-ledet: hva Tørny er), `robots: { index: false, follow: false }` (soft-404-fiksen: alle `?next=`-varianter faller ut av indeksen), canonical `/login`.
- `/spectate/[token]`: NY metadata-eksport: `robots: { index: false, follow: false }` + fornuftig tittel (token-URL-er skal aldri indekseres; embed har mønsteret).

### 6. Katalognøkler (messages/no.json + en.json)
Nye: `common.metaDescription`, descriptions for spillformater-liste, demo, finn-turneringer, login. Endrede: strip «– Tørny»-suffiks fra `publicCourses.detail.metaTitle` + `legal.privacy.metaTitle`. All ny norsk copy gjennom humanizer-disiplinen (docs/copy-style.md) før commit.

## Edge Cases & Guardrails

- **Tittel-dobling:** enhver katalogstreng som i dag slutter på «– Tørny» MÅ strippes når template innføres — grep etter `– Tørny` i messages/*.json og verifiser rendret `<title>` på berørte sider.
- **/en-canonical:** canonical for `/en/spillformater` skal være `https://tornygolf.no/en/spillformater` (locale-aware helper), aldri den norske varianten.
- **Ugyldig format-slug:** `/spillformater/tullball` skal fortsatt gi 404 (eksisterende `notFound()`), IKKE havne i sitemap.
- **Signup-OG:** signup/[shortId] skal fortsatt bruke sitt eget dynamiske OG-bilde etter at rot-bildet innføres (verifiser i staging: `curl` head på signup-side viser fortsatt egen og:image-URL).
- **Anonym spillformater-render:** BackLink til `/` på listesiden vil for anonyme gi login-redirect ved klikk — akseptert til #1265 (forsiden) lander; ikke fiks her.
- **Ingen `export const runtime`** i nye/endrede route-filer (cacheComponents).
- **proxy-endringen må ikke røre auth for andre ruter** — kun alternasjonen utvides; `x-torny-user-id`-strippingen i public-branchen gjelder da også spillformater (riktig).
- **Sitemap-testen må ikke treffe DB:** mock `listPublicCourseSlugs`.

## Key Decisions

- Kanonisk host = apex `https://tornygolf.no` — brand-konsistent, all kode-URL er allerede apex; Vercel-redirect-flip (www→apex, permanent) = eieroppgave #1270. Kode-siden er komplett uavhengig av når eieren flipper.
- noindex på /login i stedet for proxy-404-manifest — proxyen kan ikke skille «ukjent path» fra «gyldig men gated path» uten rutemanifest (over-engineering); noindex dreper indekserings-støyen.
- Spillformater → PUBLIC (ikke auth-optional) — siden har ingen personalisering; auth-optional koster en getUser() per request uten gevinst.
- Format-slug-descriptions gjenbruker `content.<slug>.summary` — ingen ny copy å vedlikeholde, alltid i sync med sideinnholdet.
- Sitemap-hreflang får no + en + x-default — dagens en-only bryter Googles bidireksjonalitetskrav.

**Claude's Discretion:**
- Eksakt utforming av rot-OG-bildet (typografi/layout) — innenfor forest/champagne + Fraunces/Inter, gjenbruk `lib/og/*`.
- Om canonical-helperen blir egen fil eller inline — velg det som gir minst duplisering over ~8 call-sites.
- Ordlyd i nye katalognøkler (norsk først, engelsk oversettelse) — humanizer-disiplin, benefit-ledet, ingen AI-tells.
- lastmod i sitemap: utelat (ingen pålitelig kilde per URL i dag) — ikke fabrikker datoer.

## Success Criteria

- [ ] Anonym GET (uten cookies) til `/spillformater` og `/spillformater/scramble` gir 200 med server-rendret innhold — verifiseres på staging (curl + klikkrunde).
- [ ] `/sitemap.xml` inneholder rot, /baner + banesider, /spillformater + én URL per GameMode i MODE_LABELS, /demo, /finn-turneringer, /legal/privacy — alle med hreflang no/en/x-default. Verifikasjon: `app/sitemap.test.ts` grønn + staging-curl.
- [ ] Rendret `<head>` på /baner/<slug>, /spillformater, /demo har `<link rel="canonical">` med apex-host og locale-riktig sti, unik description, og og:image (rot-bildet); ingen tittel inneholder «– Tørny – Tørny». Verifikasjon: staging-curl av head.
- [ ] /login og /spectate/<token> har `<meta name="robots" content="noindex, nofollow">`; signup-siden viser fortsatt sitt eget OG-bilde. Verifikasjon: staging-curl.
- [ ] `npm run build` grønt; alle co-located tester for endrede filer grønne; ingen nye lint-feil.

## Gates

- [ ] `npm run build` (full gate — fanger cacheComponents-brudd; kjøres per chunk)
- [ ] `npx vitest run app/sitemap.test.ts` + co-located tester for endrede filer (glob per fil)
- [ ] `npm run lint`
- [ ] Staging-verifisering (staging-verify-skillet) FØR merge — feat-PR, bruker-synlig

## Files Likely Touched

- `proxy.ts` — PUBLIC_PATH_PATTERN + kommentar
- `app/sitemap.ts` — nye entries + hreflang; `app/sitemap.test.ts` — NY
- `app/[locale]/layout.tsx` — metadataBase, title-template, lokalisert description, openGraph
- `app/[locale]/opengraph-image.tsx` — NY
- `lib/seo/canonical.ts` — NY (evt. inline)
- `app/[locale]/spillformater/page.tsx` + `[slug]/page.tsx` — description + canonical
- `app/[locale]/demo/page.tsx`, `app/[locale]/finn-turneringer/page.tsx`, `app/[locale]/legal/privacy/page.tsx` — description/canonical/tittel-strip
- `app/[locale]/baner/page.tsx` + `[slug]/page.tsx` — canonical
- `app/[locale]/(auth)/login/page.tsx` — NY metadata (tittel, description, noindex, canonical)
- `app/[locale]/spectate/[token]/page.tsx` — NY metadata (noindex, tittel)
- `messages/no.json` + `messages/en.json` — nye nøkler + suffiks-strip
- `package.json`/`package-lock.json` (minor bump) + `CHANGELOG.md` (Funksjon-linje)

## Out of Scope

- Offentlig forside på `/` (#1265 — needs-brainstorming)
- Innholdsutvidelse av formatsidene (#1266)
- Pilarside «Arranger golfturnering» (#1267)
- Spectate/embed branding + CTA + delbar OG (#1268 — spectate får KUN noindex her)
- Vercel/Domeneshop/Search Console (eieroppgaver, #1270)
- robots.ts-endringer (peker allerede riktig på apex; blanket allow beholdes)
- Proxy-404-manifest / not-found-håndtering utover noindex på login
- lastmod/priority i sitemap
