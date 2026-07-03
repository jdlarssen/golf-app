# Spec: Turneringsplakat og offentlig påmeldingsside (#1022)

- **Issue:** #1022 · Del 1 av epic #1021 «Vindu ut»
- **Branch:** `claude/youthful-raman-fa0b9d`
- **PR-body:** `Closes #1022` + `Part of #1021`
- **Modus:** autonom (/forge:auto) — gråsonene er avgjort av byggeren og registrert under; eieren var ikke tilgjengelig.

## Problem

Selv-påmeldingslenken (`/signup/[shortId]`) er proxy-offentlig, men siden gater selv: uinnlogget bruker redirectes til `/login` FØR spilldata hentes ([page.tsx:68-75](app/[locale]/signup/[shortId]/page.tsx)). En fremmed som får lenken i WhatsApp ser altså en innloggingsvegg — null fortelling, null OG-bilde (ingen `opengraph-image.*` finnes i appen i dag). Epic #1021 sitt første steg er å gjøre denne lenken til en reklameplakat: offentlig landingsside, delbart OG-bilde, print-klar plakat med QR, og kilde-attribusjon inn i nøkkeltall-kortet (#1010).

## Research Findings

- **Next 16 OG-filkonvensjon** (`node_modules/next/dist/docs/.../01-metadata/opengraph-image.md`): `opengraph-image.tsx` under et segment default-eksporterer en funksjon som får `params` som **Promise**; eksporter `alt`, `size` (1200×630 anbefalt), `contentType`. `ImageResponse` fra `next/og` tilfredsstiller returtypen. og:image-tags genereres automatisk.
- **cacheComponents-fellen:** ingen `export const runtime` i route-/OG-filer — kun `npm run build` fanger bruddet (dokumentert i [share-image/route.tsx:68-71](app/[locale]/games/[id]/leaderboard/share-image/route.tsx)).
- **Satori:** flexbox-only, hver `<div>` med flere barn trenger `display: flex`, hardkodede hex-farger (aldri CSS-variabler), lange ubrutte strenger må cappes (mønster: route.tsx:237-240).
- **QR:** ingen QR-lib i package.json; ingen `@media print` i hele repoet. Ny avhengighet `qrcode` (node-qrcode) valgt — server-side SVG-generering, null klient-JS. API-en verifiseres med lokalt kjøre-eksperiment før bruk (context7 utilgjengelig i sesjonen).
- **Ingen `metadataBase`/openGraph-metadata finnes** — delte lenker har i dag kun `<title>`.

## Prior Decisions (fra .forge/contracts/ + memory)

- **SECURITY DEFINER-RPC etter 0076-malen + 0104-herding** for admin-lesing; endring av `admin_key_metrics` = NY migrasjon med `create or replace` + re-anvendt revoke/grant-blokk (0126-mønsteret), aldri rediger gammel fil. Staging → verifiser → prod FØR merge (0107-mønsteret).
- **Wrapper/View-splitten** (KeyMetricsCard/KeyMetricsView) + `parseMetrics`-narrowing: nytt RPC-felt krever parser-oppdatering, ellers forsvinner kortet stille.
- **#1007-presedens:** ingen ny telemetri-plattform; måling skjer via #1010-kortet. Denne kontrakten følger det — attribusjon er én kolonne + én RPC-linje, ikke analytics.
- **Én dør per rom (#344):** ingen parallelle flyter; landingssiden bor på lenken som allerede deles.
- **#559:** ugyldig/utilgjengelig lenke skal gate uinnlogget bruker til login, ikke 404.

## Gray-area decisions (autonome, registrert)

| # | Beslutning | Valg + hvorfor |
|---|---|---|
| 1 | Route for landingssiden | **Samme route, `/signup/[shortId]`** — lenken arrangøren alt deler BLIR landingssiden (én dør per rom). Ingen ny URL å vedlikeholde. |
| 2 | Hvilke spill er offentlige | `status='scheduled'` **og** `registration_mode ∈ {open, manual_approval}` **og** `signups_closed_at IS NULL`. Alt annet (invite_only, draft, active, finished, stengt, ukjent shortId) beholder dagens oppførsel: uinnlogget → login-redirect (#559 bevart), innlogget → dagens sjekk-kaskade. |
| 3 | Persondata på offentlig flate | Fornavn + etternavns-initial («Ola N.»), maks 12 navn + «+N flere», pluss antall. Ingen e-post, hcp eller fulle etternavn. Strammere enn spectate (fulle navn) fordi denne siden er ment for bred deling på åpne kanaler. |
| 4 | Plakat-format | **Print-CSS-side** på `/signup/[shortId]/plakat` (A4-vennlig), ikke PDF-generering. `window.print()`-knapp skjules med `@media print`. Enklest som ser bra ut. |
| 5 | Kilde-attribusjon | Ny nullable kolonne `game_players.signup_source` med CHECK `('public_page','poster')`. `?src=public\|plakat` følger `next`-parameteren gjennom OTP-login tilbake til signup-siden → hidden field → `registerForOpenGame`/`requestApproval`-løypa setter kolonnen ved insert (kun open-modus-insert i v1; requests arver ved godkjenning = out of scope). Nøkkeltall-RPC får `public_signups`-tall (migrasjon 0128). |
| 6 | OG for ikke-synlige spill | Generisk Tørny-brandbilde (ingen spilldata, ingen 404) — scrapere cacher; lekkasje utelukket, lenken ser fortsatt pen ut. |
| 7 | Absolutt-URL i QR/plakat | Hardkodet `https://tornygolf.no` (presedens: [RegistrationOverviewSection.tsx:51](app/[locale]/admin/games/[id]/RegistrationOverviewSection.tsx)). |
| 8 | Font-/palett-gjenbruk | `fetchGoogleFont`/`loadFonts` + brand-hex-konstantene løftes fra share-image-routen til `lib/og/` og gjenbrukes av ny OG-fil; share-image refaktoreres til å importere derfra. De tre icon-filenes private kopier røres IKKE (egen opprydding, ikke denne PR-en). |

## Design

**Landingsside** (`app/[locale]/signup/[shortId]/page.tsx`): flytt spill-oppslaget (`getGameByShortId`, felt-whitelistet admin-client) FORAN auth-sjekken. Uinnlogget + synlig spill (beslutning 2) → render offentlig landing: spillnavn, bane (`courses.name`), dato/tid (`formatTeeOffDate`/`formatTeeOffTime` — Oslo-tz), format (`formatDisplayLabel(mode, modeConfig)`), påmeldt-liste (beslutning 3, ny slim helper med felt-whitelist), stor «Bli med»-CTA → `/login?next=/signup/{shortId}?src=…`, diskret «Skriv ut plakat»-lenke, LocaleSwitcher (login-side-mønsteret), BrandMark. Uinnlogget + ikke-synlig/ukjent → `redirect('/login?next=…')` som i dag. Innlogget → dagens kaskade uendret, nå med `src` videreført til påmeldings-skjemaene som hidden field (allowlist-validert server-side).

**OG-bilde** (`app/[locale]/signup/[shortId]/opengraph-image.tsx`): filkonvensjon, 1200×630, `await params`, data via `getGameByShortId`, samme synlighets-predikat; synlig → navn + bane + dato + brand-lockup (Satori-byggeklosser fra `lib/og/`); ikke-synlig → generisk brandbilde. `generateMetadata` på siden utvides med openGraph title/description.

**Plakat** (`app/[locale]/signup/[shortId]/plakat/page.tsx`): arver offentligheten fra `/signup`-segmentet i PUBLIC_PATH_PATTERN ([proxy.ts:22-23](proxy.ts)) — ingen proxy-endring. Samme synlighets-predikat (ellers samme redirect som landing). A4-layout: stor tittel, bane/dato/format, QR-SVG (server-generert, `qrcode`-pakken) som peker på `https://tornygolf.no/signup/{shortId}?src=plakat`, URL i klartekst under, Tørny-avsender. Klient-knapp «Skriv ut» + `@media print`-regler. Lenke til plakaten fra landingssiden + fra RegistrationOverviewSection (admin).

**Synlighets-predikatet** er én ren funksjon (`lib/games/publicSignupVisibility.ts`) med unit-tester — én regel, ett hjem, brukt av page + OG + plakat.

**Attribusjon** (migrasjon `0128`): `alter table game_players add column signup_source text check (signup_source in ('public_page','poster'))`; `create or replace function admin_key_metrics` med nytt felt `public_signups` (count over `finished_players`-CTE-ens grunnlag uten finished-kravet: alle game_players med `signup_source is not null` og `withdrawn_at is null`) + re-anvendt revoke/grant; KeyMetrics-typen + `parseMetrics` + ny `<dt>/<dd>`-rad med `data-testid` + i18n-nøkler no+en; oppdater eksisterende Type C-test.

## Edge Cases & Guardrails

- Ukjent/ugyldig shortId + uinnlogget → login-redirect (IKKE 404) — #559 bevart. Regex-guard `^[0-9a-z]{8}$` beholdes før DB-kall.
- `src` valideres mot allowlist server-side; ukjente verdier droppes stille (ingen feil). Honeypot/rate-limiting i actions røres ikke.
- 0 påmeldte → landing viser inviterende tom-tilstand, ikke tom liste.
- Manglende bane/tee-tid (`course_id`/`scheduled_tee_off_at` NULL) → utelat feltet pent, både på landing, OG og plakat.
- OG-scrapere er uinnloggede og cacher — ALDRI persondata utover beslutning 3 i bildet; ingen cookie-avhengig personalisering.
- Admin-client overalt → felt-whitelist er sikkerhetsgrensen; ny roster-helper select-er KUN `users(name, nickname)` for ikke-trukne spillere.
- Kolonnen `signup_source` settes kun ved insert; ingen UPDATE-flate eksponeres (ingen ny RLS-policy nødvendig — inserts går via admin-client/eksisterende policies).
- `parseMetrics` og RPC må endres i samme commit-serie; migrasjonen påføres staging → verifiseres → prod FØR merge, ellers forsvinner kortet stille i prod.

## Success Criteria

- [x] **K1 Offentlig landing:** ✅ Staging (dev-server mot torny-staging, testspill `u9mqplnh` open/scheduled): uinnlogget curl → 200 med `data-testid="public-landing"`, navn, bane, tee-tid, «1 påmeldt / Test A.», «Bli med». Skjermbilde av utlogget landing tatt i preview. Ikke-synlige: `o8x8uklh` (invite_only), `vx8uzbhi` (stengt), `zzzzzzzz` (ukjent) → alle bærer `login?next=…;307`-redirect i RSC-payload, 0 navn-lekkasje (grep `E2E-1022` = 0). Draft/active/finished dekkes av samme predikat (Type A-tester, 13 stk).
- [x] **K2 Innlogget uendret:** ✅ Innlogget sesjon på samme URL viste eksisterende «Meld meg på»-kaskade (skjermbilde); påmelding gjennomført; hele vitest-suiten (4524 tester) grønn uten endringer i eksisterende signup-tester.
- [x] **K3 OG-bilde:** ✅ `GET /signup/u9mqplnh/opengraph-image` → 200 `image/png` 1200×630 med navn/bane/dato/CTA (visuelt inspisert); `o8x8uklh` → 200 generisk brandkort uten spilldata (visuelt inspisert). Sidens HTML har `og:image`/`og:title`(=spillnavn)/`og:description` + twitter-kort (curl-grep). Robusthet: tom fonts-array krasjet Satori i sandkassen → fikset med betinget spread (commit «fix(signup): tolerate font-fetch failure»).
- [x] **K4 Plakat:** ✅ `/signup/u9mqplnh/plakat` → `data-testid="poster"` + `poster-qr`; QR-SVG-path **byte-identisk** med lokalt generert QR for `https://tornygolf.no/signup/u9mqplnh?src=plakat` (programmatisk dekoding-ekvivalens); `print:hidden` på knappen; ikke-synlig spill (`vx8uzbhi`) → redirect til påmeldingssiden (marker i payload).
- [x] **K5 Attribusjon:** ✅ Migrasjon 0128: staging → probe (RPC-shape `public_signups`, CHECK avviser 'evil', hostile spiller-JWT → not_authorized, alt i rollback-transaksjoner) → prod (read-only-verifisert, `public_signups=0`). Ende-til-ende på staging: innlogget + `?src=plakat` → rad med `signup_source='poster'`; full uinnlogget runde (landing → «Bli med» → OTP-login → tilbake med `?src=public` → «Meld meg på») → rad med `signup_source='public_page'`. RPC talte 1 etter første påmelding. `database.types.ts` byte-identisk med MCP-generert prod-skjema. Kort-render: Type C-test oppdatert (`key-metrics-public-signups`); visuell admin-sjekk stoppet av login-rate-limit i sesjonen — dekket av test + parser-probe.
- [x] **K6 Ingen lekkasje:** ✅ Offentlige flater viser kun fornavn + etternavns-initial (`formatPublicName`, 8 tester) — ingen e-post/hcp/scores i landing-HTML, OG-PNG eller plakat (inspisert); invite_only-hostile-curl → 0 bytes spilldata.
- [x] **K7 Copy + flyt:** ✅ catalogParity grønn; humanizer-skill kjørt — em-dash-klynge i tre strenger funnet og fikset; `docs/flows/02-bli-med-i-spill-fremtid.svg` fikk #1022-gren (C-kolonnen) + PNG regenerert med qlmanage (commit 8e3dfdeb).

## Gates

- [x] `npx tsc --noEmit` — ren ✅ (siste kjøring etter alle endringer)
- [x] `npm run lint` — 0 feil ✅ (52 advarsler = pre-eksisterende kompleksitets-klasse; page.tsx var over grensen også før endringen — verifisert med stash-sjekk)
- [x] `npx vitest run` — 359 filer / 4524 tester grønne ✅ (nye: 13 predikat/src-mapping, 8 formatPublicName, 1 Type C landing-view; oppdatert KeyMetricsView-test)
- [x] `npm run build` — grønn ✅ (exit 0, kjørt to ganger: etter OG-filen og etter fonts-fiksen)
- [x] Migrasjon 0128: staging → probet (shape/CHECK/hostile, rollback-transaksjoner) → prod read-only-verifisert ✅ — FØR merge
- [x] Staging-klikkrunde ✅: offentlig landing → «Bli med» → OTP (kode mintet service-role) → tilbake med `?src=public` → påmeldt → `signup_source='public_page'` i DB; RPC `public_signups` teller. (Admin-kortets visuelle render: rate-limit stoppet re-login; dekket av Type C-test + RPC-probe.)
- [x] Versjon: 1.168.0 (feat, minor) + CHANGELOG Funksjoner-rad; 1.168.1 (fix, patch, `[no-changelog]`); alle commits med `Refs #1022` ✅

## Files Likely Touched

- `app/[locale]/signup/[shortId]/page.tsx` — landing-gren + src-videreføring
- `app/[locale]/signup/[shortId]/opengraph-image.tsx` — NY
- `app/[locale]/signup/[shortId]/plakat/page.tsx` (+ PrintButton-klientkomponent) — NY
- `app/[locale]/signup/[shortId]/actions.ts` (+ evt. teamActions) — signup_source ved insert
- `lib/games/publicSignupVisibility.ts` (+ test) — NY, ren predikat
- `lib/games/getGameByShortId.ts` / ny slim roster-helper — felt-whitelist
- `lib/og/fonts.ts` + `lib/og/palette.ts` — NY (løftet fra share-image); `share-image/route.tsx` importerer
- `supabase/migrations/0128_signup_source_and_public_metric.sql` — NY
- `app/[locale]/admin/KeyMetricsCard.tsx` + `KeyMetricsView.tsx` (+ test) — ny linje
- `app/[locale]/admin/games/[id]/RegistrationOverviewSection.tsx` — plakat-lenke
- `messages/no.json` + `messages/en.json` — nye nøkler
- `docs/flows/` — bli-med-diagram + PNG
- `package.json` — `qrcode` (+ typer), versjons-bump; `CHANGELOG.md`

## Out of Scope

- Offentlige banesider (#1023) og liga-embed (#1024) — egne kontrakter
- Prøvespill/demo (epic 2 i køen)
- Attribusjon på manual_approval-GODKJENNING (kun open-modus-insert i v1; requests kan arve kolonnen senere)
- Refaktorering av de tre icon-filenes font-kopier
- `metadataBase`/global OG-oppsett for andre sider
- Payments/premier på plakaten
- Sitemap (hører til #1023)
