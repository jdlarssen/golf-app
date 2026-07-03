# Spec: Liga-tabellen som embed på klubbens nettside (#1024)

**Issue:** [#1024](https://github.com/jdlarssen/golf-app/issues/1024) — del 3 av 3 i epic [#1021](https://github.com/jdlarssen/golf-app/issues/1021) «Vindu ut»
**Branch:** `claude/1024-liga-embed`
**Type:** `feat` · area:leaderboard → MINOR-bump + CHANGELOG Funksjon-rad
**Autonom kontrakt:** brukeren var ikke tilgjengelig; gray areas er avgjort etter beslutningsreglene i issuet. Avvik listes i closing-kommentaren.

## Problem

Klubber har ingen måte å vise Tørny-innhold på egen nettside eller infoskjerm. Hvert klubbmedlem som ser liga-tabellen på klubbens side er en potensiell bruker, og backlinks forsterker banesidene (#1023) sin domain authority. Det finnes en offentlig live-lenke for spill (`/spectate/[token]`, #938), men den kan ikke rammes inn på en ekstern side på en kontrollert måte — og liga-tabellen (den varige, sesonglange flaten som er mest verdt for en klubbside) har ingen offentlig flate i det hele tatt.

## Research Findings

- **Appen har i dag INGEN clickjacking-beskyttelse** — ingen `X-Frame-Options`/`frame-ancestors` i `next.config.ts`, `vercel.json` eller proxy. Epic-føringen «resten av appen beholder clickjacking-vernet» betyr i praksis å *innføre* det. 
- **Next 16 `headers()`** (verifisert i `node_modules/next/dist/docs/01-app/.../headers.md`): regler evalueres i rekkefølge, siste regel som matcher samme sti + samme header-nøkkel vinner. Bruk derfor KUN `Content-Security-Policy: frame-ancestors` (ikke X-Frame-Options — den kan ikke «slås av» per rute, og moderne nettlesere lar frame-ancestors overstyre XFO uansett): catch-all-regel setter `frame-ancestors 'none'`, embed-regler setter `frame-ancestors *`. Config-headere gjelder også CDN-serverte PPR-shells (mer robust enn proxy-satte headere).
- **Locale-prefiks:** `no` er uprefikset, `en` under `/en/...` (`i18n/routing.ts`, `localePrefix: 'as-needed'`) → embed trenger to header-regler: `/embed/:path*` og `/en/embed/:path*` (kodekommentar om at nytt språk krever ny regel).
- **Tema:** dark-paletten fyrer via `@media (prefers-color-scheme: dark)` gatet på `:root:not([data-theme='light'])` (`app/globals.css:135`) → å tvinge lys modus i embed er billig (`data-theme='light'` på `<html>` via liten klient-øy/inline-script).

## Prior Decisions (videreført)

- **#938 (spectate):** offentlig lenke = opt-in token per entitet (`games.spectate_token uuid null`), generert av arrangør, revokert ved `null`; oppslag via admin-klient (`lib/games/spectate.ts`); eksponering navn+scores+banehandicap akseptert av eier. Liga-embedden gjenbruker NØYAKTIG denne tilgangsmodellen.
- **#1022:** offentlig segment = `PUBLIC_PATH_PATTERN` i `proxy.ts` + felt-whitelistet admin-klient-henting.
- **#679/#938:** live-oppdatering på offentlige flater = polling (`SpectatePoller`, `router.refresh()` på intervall), IKKE realtime (anon kan ikke abonnere). Issue-regelen «enkel polling holder trolig» bekrefter.
- **#598:** nye leaderboard-flater IMPORTERER delte primitiver, aldri copy-paste.
- **Memory/RLS-sweep:** liga-data er world-read by design i RLS; ingen RLS-endring trengs for lesing. Skriving (token-toggle) går via authed klient + eksisterende UPDATE-policyer + `expectAffected`.

## Design

To embed-flater under nytt offentlig segment `/embed`, begge chrome-løse, selv-oppdaterende, med attribusjonslenke:

### 1. Liga-embed — `/embed/liga/[token]` (hovedleveransen)

- **Migrasjon 0130:** `alter table public.leagues add column spectate_token uuid unique;` (nullable; null = av). Staging først → verifiser → prod (0107-mønsteret), deretter `gen:types`. Nullable → ingen default-felle.
- **`lib/league/spectate.ts`:** speiler `lib/games/spectate.ts` — `getLeagueBySpectateToken(token)` (admin-klient, UUID-guard, null ved ukjent/revokert) + `setLeagueEmbed(leagueId, enabled)` (authed klient, ikke roter eksisterende token, `expectAffected`, revalider aktuell cache/path).
- **Side:** henter snapshot via eksisterende `getLigaSnapshot(id)`, rendrer liga-navn + `LeagueStandingsPanel` (gjenbruk — Netto/Brutto-toggle følger med gratis) + attribusjonsfot. Ingen AppShell/TopBar/nav. Viser samme standings-data som `/liga/[id]` viser innlogget — verken mer eller mindre (ingen deltaker-e-post, ingen forvaltnings-UI).
- **Tom-tilstand:** liga uten talte runder viser tabellen slik `/liga/[id]` gjør det (deltakere med 0 runder) — ingen egen tom-flate.
- **Polling:** gjenbruk `SpectatePoller`-mønsteret, 60 s intervall (sesongtabell endres sjelden, infoskjerm trenger bare «etter hvert»).

### 2. Spill-embed — `/embed/spill/[token]`

- Rir DIREKTE på `games.spectate_token` — ingen ny kolonne. Live-følg på = embed mulig; av = begge dør (404). Det ER «samme data som offentlig live-lenke»-garantien.
- **Kompakt visning** (issue-regel «kompakt tabell uten app-chrome», IKKE full format-visning): bygg radene fra `buildShareCardData` (én-beregningsvei-prinsippet fra #1008): placement/skins-band → tabell rank/navn/scoreLabel (`tabular-nums`); matchplay-band → duell-headline (vinner/margin/status) i stedet for tabell.
- **Polling:** `SpectatePoller` 20 s mens `status='active'`, stopp ved finished (identisk med spectate).
- Draft/scheduled → `notFound()` (som spectate).
- Attribusjon for spill-embed lenker til **spectate-siden** (full leaderboard, mer verdi enn forsiden); liga-embed lenker til **tornygolf.no-forsiden** (akkvisisjon).

### Felles embed-infrastruktur

- **`proxy.ts`:** `PUBLIC_PATH_PATTERN` += `embed`.
- **`next.config.ts` `headers()`:** (1) `/:path*` → `Content-Security-Policy: frame-ancestors 'none'`; (2) `/embed/:path*` og `/en/embed/:path*` → `frame-ancestors *`. Rekkefølgen gjør at embed-reglene overstyrer.
- **Tema:** embed tvinger `data-theme='light'` uansett besøkers OS (forutsigbart på klubbsider); `?theme=dark` støttes (infoskjerm). Mekanisme (inline-script vs klient-øy) = builders valg; unngå synlig FOUC om mulig.
- **`robots` noindex** på begge embed-rutene (widgets skal ikke i Google — banesidene (#1023) eier SEO).
- **Attribusjonsfot:** diskré «Følg med på Tørny»-linje, `target="_blank" rel="noopener"`, alltid synlig (det er markedsføringspoenget).
- **Snippet-bygger:** ren helper `buildEmbedSnippet(url, {height})` → `<iframe src="…" style="width:100%;border:0;…" loading="lazy" title="…"></iframe>`. Ren iframe, IKKE script-tag (issue-regel: enklest som funker på WordPress/Squarespace — script-tags blokkeres ofte der). Fast høyde + intern scroll; default-høyder = builders valg.

### Arrangør-kontroller («Embed»-knappen)

- **Spill:** utvid `LiveFollowControl` (game-home) — når live-følg er på, ny «Kopier embed-kode»-affordans ved siden av del-lenken (clipboard, #942-mønsteret som alt bor i komponenten).
- **Liga:** ny kontroll på liga-forvaltningssiden (`app/[locale]/admin/liga/[id]/`, ved siden av eksisterende seksjoner): slå embed på/av + kopier snippet + vis lenken. Klubb-ligaer forvaltes samme sted → én kontroll dekker begge.

## Edge Cases & Guardrails

- Revokert token (null) → embed 404-er umiddelbart; allerede innlimte iframes på klubbsider viser 404-siden — akseptert (samme som spectate-lenker som dør).
- Anon REST-probe mot `leagues`/`games` skal IKKE få mer enn før — token-oppslag skjer kun server-side via admin-klient; RLS uendret.
- Resten av appen (inkl. login, admin, spectate, baner) skal IKKE kunne rammes inn etter dette — verifiser med curl at `/`, `/login`, `/spectate/x` sender `frame-ancestors 'none'` og at embed-rutene sender `frame-ancestors *`.
- `cacheComponents`: INGEN `export const runtime` på embed-ruter (bygget knekker — kjent felle); dynamiske data bak Suspense per PPR-mønsteret; `npm run build` er gate.
- Snippet-URL må bruke prod-origin (`https://tornygolf.no`) uavhengig av kjøremiljø — sjekk hvordan #1022/plakat løste origin-oppslag og gjenbruk.
- Norsk copy: humanizer-sjekk; begge språk (no + en).

## Key Decisions

- **Begge flater i v1 (liga + spill):** issue-tittelen og klubb-verdien peker på liga; regelen «velg ut fra hva live-lenken alt støtter» dekker spill nesten gratis via spectate-tokenet. Liga får token-modellen (ikke en åpen ID-URL) nettopp for å ri på #938-tilgangsmodellen.
- **Ren iframe, ikke script-tag** — enklest på klubb-CMS; fast høyde + intern scroll er v1-akseptabelt.
- **Kun CSP frame-ancestors, ikke X-Frame-Options** — XFO kan ikke overstyres per rute og er obsolet når frame-ancestors finnes.
- **Polling, ikke realtime** — anon har ingen realtime-vei; SpectatePoller-mønsteret finnes.
- **Lys modus som default i embed, `?theme=dark` opt-in** — billig via `data-theme`-gaten i globals.css.

**Claude's Discretion:** default snippet-høyder; FOUC-mekanisme for tema; eksakt plassering/utseende på liga-embed-kontrollen; om spill-embeddens matchplay-headline gjenbruker tekstbyggere fra share-kortet; CHANGELOG ↳-lenke.

## Success Criteria

- [ ] Arrangør kan hente kopier-lim-klar iframe-snutt fra liga-forvaltningssiden og fra game-home (LiveFollowControl) — verifisert på staging.
- [ ] `/embed/liga/[token]` og `/embed/spill/[token]` rendrer uinnlogget inne i en iframe fra en lokal HTML-fil mot staging-serveren; resten av appen (`/`, `/login`) nekter framing (curl-verifiserte headere).
- [ ] Embed viser samme data som hhv. liga-siden og live-lenken — ingen nye felter eksponeres; revokert token → 404.
- [ ] Embed oppdaterer seg uten interaksjon (poller observert) mens spill er aktivt / liga pågår.
- [ ] `tabular-nums` på alle tall; copy finnes på no + en; humanizer kjørt på ny norsk copy; noindex på embed-ruter.
- [ ] Migrasjon 0130 påført staging → verifisert → prod; `gen:types` regenerert.
- [ ] Flyt-diagrammet som dekker liga/offentlige flater oppdatert hvis featuren hører hjemme der (regenerer PNG per docs/flows/README.md) — eller eksplisitt begrunnet hvorfor ikke.

## Gates

- [ ] `npx tsc --noEmit` — 0 feil
- [ ] `npx eslint <endrede filer>` — 0 nye feil
- [ ] `npx vitest run <co-located tester for endrede filer>` — grønt (snippet-helper = Type A; maks én render-test per ny komponent)
- [ ] `npm run build` — grønt (cacheComponents-fella)
- [ ] Staging-klikkrunde av begge flyter før merge

## Files Likely Touched

- `supabase/migrations/0130_league_spectate_token.sql` — ny kolonne
- `lib/database.types.ts` — gen:types (etter prod-apply)
- `lib/league/spectate.ts` (+ test) — token-oppslag + toggle-action
- `lib/embed/snippet.ts` (+ test) — iframe-snutt-bygger
- `app/[locale]/embed/liga/[token]/page.tsx` + `app/[locale]/embed/spill/[token]/page.tsx` (+ error.tsx per route-konvensjonen)
- `app/[locale]/spectate/[token]/SpectatePoller.tsx` — gjenbrukes (evt. intervall-prop)
- `app/[locale]/games/[id]/(home)/LiveFollowControl.tsx` — embed-snutt-affordans
- `app/[locale]/admin/liga/[id]/` — ny embed-kontroll + montering
- `proxy.ts`, `next.config.ts` — public segment + frame-ancestors-headere
- `messages/no.json`, `messages/en.json` — embed/kontroll-copy
- `CHANGELOG.md`, `package.json` — minor + Funksjon-rad

## Out of Scope

- Cup-embed (egen flate, eget issue hvis ønsket)
- Script-tag-innpakning med responsiv høyde (v2 hvis klubber ber om det)
- Offentlig liga-SIDE (full `/liga`-flate uten login) — embedden er den offentlige flaten i v1
- Realtime-kanal for anon; tema utover light/dark-param
- Emoji-reaksjoner/interaktivitet i embed (#943/#977-territorium)
