# Spec: Offentlig forside — anonym landing på / som forteller hva Tørny er (#1265)

## Problem

`/` redirecter anonyme (inkl. Googlebot) til `/login` — det finnes ingen inngangsdør der en fremmed kan lese hva Tørny er. SEO-revisjonen 2026-07-17 pekte på gapet, og epic #1021 «Vindu ut» stilte spørsmålet ordrett («finnes det ett eneste sted en fremmed kan LESE de ordene uten å logge inn?»). Fundamentet fra #1264 (PR #1287) er på plass: `/` ligger allerede i sitemapen med hreflang, rot-OG-bildet finnes, `metadataBase` + canonical-helper er etablert. Det som mangler er selve siden.

## Research Findings

Brainstorm 2026-07-19 (5 research-agenter + 3 designforslag + 3-dommer-panel; full dokumentasjon i issue-kommentaren):

- **SERP-gap (verifisert via websøk, med US-locale-forbehold):** ingen norsk produktside svarer på «arranger golfturnering selv, med venner/kolleger». Gimmie/GolfBox = offisiell klubb-/medlemskapsinfrastruktur; Golf GameBook/Squabbit = engelsk + app-nedlasting; GolfAcross = dansk; Devhuset Scramble = kun ett format. Underserverte fraser: «arrangere golfturnering», «golfturnering med venner», «turneringsapp golf», «firmagolf turnering», formatnavn-longtail.
- **`components/ui/BrandHero.tsx` hardkoder `<h1>Tørny</h1>`** (taglinen er en `<p>`); docstring sier «One per page»-heading-eierskap. Landingen bruker derfor BrandMark + egen H1 — ingen BrandHero-refactor.
- **`canonicalPath(locale, '/')` gir `/en/`** for engelsk, mens sitemapen bruker `/en` uten skråstrek (`app/sitemap.ts:32`) — rot trenger spesialtilfelle i helperen.
- **JSON-LD-idiomet** finnes på nøyaktig ett sted: `app/[locale]/baner/[slug]/page.tsx:76-90` (inline `<script type="application/ld+json">` i server-komponenten, apex-URL-er).
- **Anon-chrome finnes:** `BrandMark`, `AppShell` (nav-padding ufarlig uten nav), `LocaleSwitcher`, `AnonDiscoverySection` (tar `games`-prop, caller henter via `lib/games/getPublicDiscoverableGames.ts`), `data-testid="anon-*"`-konvensjonen fra `/finn-turneringer`.
- **Format-data uten DB:** `getFormatGuideEntries()` i `lib/formats/buildFormatGuide.ts` — bilingv, serialiserbar; slugs = GameMode-verdier (verifisert: `texas_scramble`, `stableford`, `singles_matchplay`, `wolf`, `skins`, `best_ball` finnes i `lib/scoring/modes/types.ts`).
- **Google-krav SoftwareApplication-rich-result** (hentet live): `name` + `offers.price` **og** (`aggregateRating` eller `review`). Uten ekte omtaler kommer ingen rich result — markupen er likevel gyldig og maskinlesbar; ingen ratings skal fabrikeres.
- **Flyt-forankring:** `docs/flows/01-bli-bruker-fremtid.svg` har ingen anonym `/`-node i dag (innganger: /demo og /login) — diagrammet MÅ oppdateres i samme PR (CLAUDE.md «Hold flytene levende»).

## Prior Decisions

- **#1185/#1264-rammeverket:** side der innloggede beholder personalisering + bunn-nav → **AUTH_OPTIONAL**, aldri PUBLIC (PUBLIC stripper `x-torny-user-id` → innloggede mister nav). `/` er nettopp en slik side: innloggede beholder dagens hjem UENDRET.
- **Kanonisk host = apex** `https://tornygolf.no` (#1264).
- **Brand:** kanonisk tagline «Tørny — fyr opp golfturneringen på et par minutter» er fredet; subordinat form «Fyr opp golfturneringen på et par minutter». Champagne-gull KUN til vinnere/highlights.
- **Nabo-issues eier sitt:** #1266 (formatside-innhold), #1267 (pilarside «Arranger golfturnering»-guide), #1268 (spectate/embed-branding) — forsiden lenker og posisjonerer, den dupliserer ikke.
- **Dommerpanel-utfall:** SEO-forslaget vant 2 av 3 dommere (fremmed-golfer + SEO-ekspert); brand-vokteren vant frem med grafts (posisjoneringslinjer, tagline-plassering, ingen konkurrentnavn). Syntesen under er vinnerskjelettet + vedtatte grafts.

## Design

### 1. Proxy: `/` blir auth-valgfri (`proxy.ts`)

Utvid `AUTH_OPTIONAL_PATH_PATTERN` til å matche bar rot: `/^\/$|^\/(finn-turneringer|spillformater)(\/|$)/`. `splitLocalePrefix` gir `'/'` for både `/` og `/en`, så én alternasjon dekker begge locales. PUBLIC testes først og matcher ikke `/` — ingen kollisjon. Header-slettingen i anon-branchen (linje 83) gjenbrukes automatisk. `config.matcher` røres ikke. Oppdater kommentaren over mønsteret.

### 2. Anonym branch i `app/[locale]/page.tsx`

Erstatt `if (!userId) redirect({ href: '/login', locale })` (linje 74–76) med `if (!userId) return <AnonLanding locale={locale} />`. Returen skjer FØR Suspense/HomeBody-blokken (ellers blinker innlogget-skjelettet for anonyme). Innlogget-stien er ellers urørt — alle `userId`-avhengige komponenter ligger bak guarden som før.

### 3. Ny komponent `app/[locale]/AnonLanding.tsx` (colokert, server-komponent)

Alt innhold fra ny katalog-namespace `landing.*` (no + en). Ingen DB unntatt seksjon 7. Komposisjon i rekkefølge:

1. **Topprad:** `BrandMark` venstre; `LocaleSwitcher` + tekstlenke «Logg inn» → `/login` høyre (`data-testid="anon-login-cta"`). Fanger arrangøren som allerede har konto.
2. **Hero:** H1 (Fraunces): **«Arranger golfturnering på et par minutter»**. Undertekst (utkast): «Velg spillform, del en lenke med gjengen, og tavla regner netto handicap mens dere spiller. Du trenger verken klubb eller komité.» Primær-CTA «Prøv Tørny på 60 sekunder» → `/demo` (`data-testid="anon-demo-cta"`); sekundær «Lag din egen turnering» → `/login`. Mikro-tillitslinje under knappene: «Gratis. Ingen app å laste ned.» Hero + CTA-er innenfor første mobile viewport.
3. **Slik funker det** — H2 «Slik arrangerer du en golfturnering». Tre nummererte steg (opprett med bane/spillform → inviter via lenke, engangskode på e-post → spill, alle taster egne slag og tavla er live). Lenke til `/login` i steg 2, `/baner` i steg 1.
4. **Tavle-smakebit** — H2 «Tavla lever mens dere spiller». Hardkodet eksempel-leaderboard fra katalogen (4–5 rader, Fraunces + `tabular-nums`, lederraden i champagne-gull — sanksjonert gullbruk). Tekstlenke under: «Prøv den selv i demoen» → `/demo`.
5. **Spillformer** — H2 «Over 20 spillformer: scramble, stableford, matchplay og flere til». Seks kort via `getFormatGuideEntries()` filtrert til `texas_scramble`, `stableford`, `singles_matchplay`, `wolf`, `skins`, `best_ball` (label + `shortDescription`), hvert kort lenker `/spillformater/<mode>` (`data-testid="anon-format-card"`). Tekstlenke «Se alle spillformatene» → `/spillformater`. Aldri hardkodet antall («23»); «over 20» er formuleringen.
6. **For hvem** — H2 «Golfturnering med venner, i firmaet eller for hele klubben». Kort ingress med posisjoneringen (utkast): «Klubbturneringen har sitt system. Kompisrunden har Tørny — du er komiteen.» Tre kort med H3: «Kompisrunden» (4 spillere, Wolf eller Skins), «Firmagolfen» (påmelding via åpen lenke, ingen krav om golf-administrasjon), «Klubbkvelden» (opptil rundt 150 spillere, flighter og godkjenning). Ingen konkurrentnavn.
7. **Norske baner** (tynn med vilje) — H2 «Norske golfbaner ligger klare». Gjenbruk: «Slope, course rating og hulloversikt for norske golfbaner.» + én setning om at Tørny regner banehandicap etter WHS når banen er valgt. Lenke → `/baner`. Banesidene eier bane-longtail-en; denne seksjonen sender bare autoritet dit og fjerner «må jeg legge inn banen selv?»-friksjonen.
8. **Åpne turneringer** (eneste DB-seksjon, valgfri) — H2 «Åpne turneringer du kan bli med i». `AnonDiscoverySection` med data fra `getPublicDiscoverableGames()`, + tekstlenke → `/finn-turneringer`. Tom liste → hele seksjonen rendres ikke. Suspense-wrappet så DB-feil/treghet aldri blokkerer det statiske skallet.
9. **Spørsmål og svar** — H2 «Lurer du på noe?». Seks Q/A-par (kilde: ETT array i katalogen som mater både synlig liste og FAQPage-JSON-LD): «Hvordan arrangerer jeg en golfturnering med venner?» · «Hva koster Tørny?» · «Må vi laste ned en app?» · «Må vi være medlem av en klubb?» · «Hvordan logger spillerne inn?» (gjenbruk «Du logger inn med engangskode på e-post. Det tar under et minutt.» + self-reg) · «Hvordan regnes handicapet?» (WHS netto, slope/CR).
10. **Slutt-CTA** — H2 = subordinat tagline «Fyr opp golfturneringen på et par minutter» (med «par» i gull, som BrandHero-presedensen). Self-reg-linjen «Skriv inn e-posten din. Er du ny her, lager vi en konto til deg.» Primærknapp «Lag turnering» → `/login`; tekstlenke «… eller prøv demoen først» → `/demo`. Rekkefølgen snus bevisst: den som har scrollet hit er varm.
11. **Bunnlenker:** `/spillformater`, `/baner`, `/demo`, `/finn-turneringer`, `/login`, `/legal/privacy`. `AppShell` gir `AppVersionFooter`; bunn-nav uteblir automatisk for anonyme (`BottomNav` returnerer null uten user-header).

Rot-element: `data-testid="anon-landing"`. Ingen `InstallBanner`/`PushNudge`/`PasskeyEnrollmentNudge`/`ProductUpdateBanner` i anon-branchen.

### 4. Metadata (`generateMetadata` på `/`)

Kun `params` (aldri `headers`/`cookies` — bevarer statisk skall-evne). Én metadata for begge publikum (samme rute); kjent trade-off: innloggedes fane-tittel endres fra «Tørny» til SEO-tittelen — akseptert.

- **Title (absolutt, ikke template):** «Tørny — arranger golfturnering gratis i nettleseren» (51 tegn). Em-tankestrek per brand-tegnsetting; halen er bevisst ULIK taglinens («på et par minutter») så tittelfeltet ikke parodierer den fredede formen.
- **Description (utkast, 146 tegn):** «Gratis turneringsapp for golf. Sett opp scramble, stableford eller matchplay med venner eller firmaet. Tørny regner handicap og holder tavla live.» Maks 155 tegn — tell etter humanizer-justering.
- **Canonical:** rot-spesialtilfelle i `lib/seo/canonical.ts`: `path === '/'` → default-locale `'/'`, ellers `/${locale}` (uten skråstrek — samme form som sitemapen). Ny/utvidet co-located Type A-test.
- Engelsk katalog får egne oversettelser av title/description/H1 (no-nb-konvensjonene).

### 5. JSON-LD (inline i `AnonLanding`, baner-idiomet)

Ett `@graph` med stabile `@id`-ankre, tekst fra katalogen per locale:

- **`WebSite`** (`#website`): `name: "Tørny"`, `url: "https://tornygolf.no"`, `inLanguage` per locale, `publisher` → Organization-ref. Ingen `SearchAction` (finnes ikke sidesøk).
- **`Organization`** (`#organization`): `name`, `url`, `logo` (absolutt URL til eksisterende brand-asset — se Discretion).
- **`WebApplication`** (`#app`): `name`, `url`, `description` (= meta-description), `applicationCategory: "SportsApplication"`, `operatingSystem: "Any"` (aldri «Web»), `inLanguage: ["nb", "en"]`, `offers: { "@type": "Offer", "price": "0", "priceCurrency": "NOK" }`. **Ingen** `aggregateRating`/`review`. Merk: rich result utløses ikke uten ekte omtaler — det er greit, markupen er for maskinlesbarhet (inkl. LLM-søkeflater).
- **`FAQPage`** (`#faq`): `mainEntity` bygget fra SAMME katalog-array som synlig FAQ (tekst identisk per konstruksjon — Googles krav). Kuttes FAQ-seksjonen, kuttes noden i samme commit.

Bare anon-branchen rendrer JSON-LD (innlogget hjem skal ikke bære markup for en side den ikke viser).

## Edge Cases & Guardrails

- **Innlogget regresjon er hovedrisikoen:** innlogget bruker på `/` skal se dagens hjem identisk (greeting, banners, bunn-nav). Verifiseres eksplisitt i staging-klikkrunden + dekkes implisitt av eksisterende @gate-e2e som lander på hjem etter login.
- **Skjelett-blink:** anon-return FØR `<Suspense><HomeBody /></Suspense>`.
- **Ingen `export const runtime`** (cacheComponents; kun `npm run build` fanger det).
- **Header-spoofing:** proxyens anon-branch beholder `request.headers.delete('x-torny-user-id')`.
- **`/en`-rot:** canonical `https://tornygolf.no/en` (uten skråstrek), aldri `/en/`.
- **Tom discovery-liste** → seksjon 8 rendres ikke (ingen tom-tilstand på en salgsside).
- **Copy-disiplin:** all ny norsk copy gjennom `humanizer:humanizer` før commit; «på et par minutter» kun i H1 + slutt-CTA-H2 (bevisst rim, ikke stamming — taglinen står ALDRI i heroen sammen med H1); maks én «ingen X, ingen Y»-figur per viewport; ingen «Kom i gang gratis» (SaaS-kalk); ingen konkurrentnavn i copy eller markup.
- **e2e asserter aldri norsk copy** — kun `data-testid`/roller.
- **`redirect`-importen** i `page.tsx` fjernes hvis ubrukt etter endringen (lint fanger).
- **#1286-fella (PPR-200 på ugyldige slugs) gjelder ikke** — ruta har ingen dynamisk segment.
- **Måling:** ingen custom event-instrumentering; demo→login-trakten leses fra Vercel Analytics (sideflyt) + GSC etter indeksering.

## Key Decisions

- **AUTH_OPTIONAL, ikke PUBLIC** — innloggede beholder personalisert hjem + bunn-nav (#1185-fella).
- **H1 = målfrasen** «Arranger golfturnering på et par minutter»; **taglinen flyttes til slutt-CTA-en** (subordinat form). Løser hero-stammingen alle tre dommerne flagget, uten å ofre verken SEO-signalet eller den fredede taglinen. BrandHero brukes IKKE på landingen (dens docstring krever heading-eierskap).
- **Demo er primær-CTA i hero, login primær i slutt-CTA** — alle tre designforslagene konvergerte hit uavhengig: kald trafikk trenger bevis før e-postadresse; varm scroller skal slippe omveien.
- **Title absolutt med brand først** — forsiden er navigasjonssøkets landingsside; template-formen «X – Tørny» gjemmer merkenavnet.
- **JSON-LD = WebSite + Organization + WebApplication + FAQPage** i ett @graph; ingen fabrikerte ratings; FAQ-noden er commit-koblet til synlig seksjon.
- **Forsiden er lenkenav, ikke pilarside:** tynne seksjoner som sender autoritet ned til `/spillformater/[slug]` og `/baner` (de eier longtail-en); dybdeinnholdet bor i #1266/#1267.
- **Seks formatkort** (texas_scramble, stableford, singles_matchplay, wolf, skins, best_ball) — dekker alle fire katalogseksjoner og begge målgrupper (kompis ↔ klubb).

**ASSUMPTION-er (eier kan veto-e uten å lese kode — si fra, så justerer buildern):**

1. Demo som primær-CTA i hero (snus i slutt-CTA).
2. Taglinen ut av heroen og inn i slutt-CTA-en; H1 får målfrasen. (Vil du heller ha taglinen øverst, bytter vi — men da mister H1 søkefrasen.)
3. Tittel-halen «gratis i nettleseren» (ikke «på et par minutter» — unngår tagline-parodi i SERP-en).
4. FAQ-spørsmålet om klubb stilles UTEN å navngi GolfBox/Gimmie.

**Claude's Discretion:**

- Endelig ordlyd i alle `landing.*`-strenger (utkastene over er retning, humanizer avgjør detaljene) + engelske oversettelser.
- Tavle-eksempelets navn/tall og formatkort-layouten (innenfor palett/typografi-reglene).
- Organization-`logo`-asset: eksisterende ikon-rute eller statisk fil — velg det som gir en stabil, crawlbar absolutt URL.
- `AnonDiscoverySection`-gjenbruk: importer fra `finn-turneringer/` eller løft til `components/` — velg minst diff.
- Baneseksjonen (7) kan slås sammen med steg 1 i «Slik funker det» hvis siden kjennes lang på mobil — behold `/baner`-lenken uansett.

## Success Criteria

- [ ] Anonym `curl` (uten cookies) mot staging `/` gir 200 med server-rendret innhold: `data-testid="anon-landing"`, H1-teksten, `<link rel="canonical">` med apex-rot, absolutt title, description, og ett `application/ld+json`-script som parser med de fire @type-ene. `/en` gir engelsk innhold + canonical `…/en`.
- [ ] Innlogget staging-klikkrunde: `/` viser dagens hjem uendret (greeting, «Pågår nå», bunn-nav). Ingen landing-elementer lekker inn.
- [ ] Anonym staging-klikkrunde: hero-CTA → `/demo` er spillbar; «Logg inn»/slutt-CTA → `/login`; minst ett formatkort → riktig `/spillformater/<slug>`.
- [ ] FAQ-tekst i JSON-LD er identisk med synlig FAQ (samme kildearray — verifisert i render-testen).
- [ ] Type A-test for `canonicalPath` rot-tilfellet grønn; ÉN Type C render-test for `AnonLanding` grønn; ny Type D e2e (`e2e/landing.spec.ts`, @gate): anonym `/` → `anon-landing` synlig → klikk `anon-demo-cta` → `/demo` laster.
- [ ] `docs/flows/01-bli-bruker-fremtid.svg` har anonym `/`-inngangsnode, PNG regenerert (qlmanage-crop visuelt verifisert), `docs/user-flows.md` §0 oppdatert.
- [ ] `npm run build` grønt; co-located tester for alle endrede filer grønne; `npm run lint` grønt.
- [ ] Minor-bump + CHANGELOG Funksjon-linje.

## Gates

- [ ] `npm run build` (fanger cacheComponents-brudd; per chunk)
- [ ] `npx vitest run` på co-located tester for endrede filer (inkl. ny canonical- og AnonLanding-test)
- [ ] `npm run lint`
- [ ] e2e `landing.spec.ts` mot staging (source `.env.staging.local` — ellers silent skip)
- [ ] Staging-verifisering (staging-verify-skillet) + bevis-kommentar + `staging-verified`-label FØR merge

## Files Likely Touched

- `proxy.ts` — AUTH_OPTIONAL-regex + kommentar
- `app/[locale]/page.tsx` — anon-branch i stedet for redirect + `generateMetadata`
- `app/[locale]/AnonLanding.tsx` — NY (+ én co-located render-test)
- `lib/seo/canonical.ts` — rot-spesialtilfelle (+ Type A-test, ny/utvidet fil)
- `messages/no.json` + `messages/en.json` — ny `landing.*`-namespace
- `e2e/landing.spec.ts` — NY (@gate)
- `docs/flows/01-bli-bruker-fremtid.svg` + PNG, `docs/user-flows.md` — flyt-oppdatering
- `CHANGELOG.md`, `package.json`/`package-lock.json` (minor bump)

## Out of Scope

- Formatside-innholdsutvidelse (#1266) og pilarsiden «Arranger golfturnering» (#1267) — forsiden lenker IKKE til pilarsiden ennå (den finnes ikke)
- Spectate/embed-branding (#1268)
- Vercel www→apex-flip og Search Console (eieroppgave #1270)
- Custom analytics/event-instrumentering av demo→login-trakten (Vercel Analytics + GSC dekker behovet nå)
- BrandHero-refactor (`as`-prop) — ikke nødvendig med valgt hero-design
- Endringer i /login-metadata (noindex består), sitemap (rot ligger der), OG-bilde (rot-kortet består)
