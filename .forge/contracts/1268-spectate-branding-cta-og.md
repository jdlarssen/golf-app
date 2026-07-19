# Kontrakt: Spectate — diskret Tørny-branding, «Lag din egen»-CTA og delbar OG-metadata (#1268)

## Problem

Delte spectate-lenker er produktdemoer for hele feltet (SEO-revisjonen 17.07), men flaten mangler konverteringselementene: ingen synlig Tørny-branding (sticky-banneret viser kun status + live-dot; `TopBar` har ingen logo), ingen CTA for besøkende, og OG-metadata er kun en generisk tittel uten turneringsnavn — lenken ser anonym ut i Messenger/WhatsApp.

Eier-rammer (fra kø-instruksen 19.07): statisk brand-kort med turneringsnavn som OG v1; CTA kun på spectate (IKKE embed — tredjeparts klubbsider); CTA-mål = self-reg-innmelding.

## Research-funn (verifisert i økten)

- `app/[locale]/spectate/[token]/page.tsx` — token-oppslag via admin-klient (`lib/games/spectate.ts:24-42`), rendrer sticky banner + `SponsorStrip` + `renderLeaderboardContent()` + `SpectatePoller`. `/spectate` står i `PUBLIC_PATH_PATTERN` (`proxy.ts:26`): proxyen hopper over auth-oppslag helt — **besøkerens innloggingsstatus er ukjent server-side**.
- `generateMetadata` (`page.tsx:20-26`) leser i dag KUN locale-katalogen («Token pages must never leak game data into metadata») + `robots noindex`. OG-bilde faller gjennom til rot-brand-kortet `app/[locale]/opengraph-image.tsx` (statisk Tørny-kort, 1200×630).
- Embed-flatene har allerede sin branding: `EmbedFooter` («always rendered, never optional», attribusjonslenke) — embed røres derfor IKKE i denne kontrakten.
- Self-reg har ingen egen `/register`-side — den bor i OTP-login-flyten (`app/[locale]/(auth)/login/`, flagg `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION`). CTA-målet er altså `/login`.
- `BrandMark` (`components/ui/BrandMark.tsx`) er den delte logo-lockupen.

## Design

**1. OG-metadata (deling):** `generateMetadata` i spectate-page utvides til å slå opp token-spillet (samme `getGameBySpectateToken`; ugyldig token → dagens generiske metadata) og sette:
- `title`: turneringsnavnet (går gjennom `localizeGameName`-mønsteret fra #614 ved visning — sjekk hvordan leaderboard-siden gjør det) + eksisterende `%s – Tørny`-template.
- `description`: kort norsk/engelsk linje fra message-katalogen («Følg leaderboardet live på Tørny»-tone).
- og:image: INGEN ny bilde-rute — rot-brand-kortet gjelder (statisk brand-kort = eier-besluttet v1).
- `robots noindex` BEHOLDES (deling ≠ indeksering; token-URL).
Dette reverserer den gamle «aldri game-data i metadata»-kodekommentaren for TITTELENS del — eier-besluttet 19.07; oppdater kommentaren til å beskrive den nye grensen (navn i tittel OK, aldri scores/spillerliste, aldri data på ugyldig token).

**2. Diskret branding:** `BrandMark` inn i sticky-banneret på spectate (venstrejustert, liten — banneret har allerede status/live-dot til høyre). Ikke i veien for leaderboardet: ingen ny sticky-flate, gjenbruk eksisterende banner.

**3. «Lag din egen»-CTA (kun spectate):** liten kort/linje NEDERST på siden (etter leaderboard-innholdet): «Lag din egen turnering gratis» → `SmartLink` til `/${locale}/login`. Tap-mål ≥ 44px, forest/champagne-stil, `data-testid="spectate-cta"`.
- «Ikke-innloggede besøkende»-gaten: siden er bevisst auth-løs server-side. Liten klient-komponent skjuler CTA-en når en Supabase-auth-cookie finnes (`document.cookie`-sjekk på `sb-`-prefikset — heuristikk, ingen nettverkskall). ASSUMPTION: cookie-heuristikk er nok for v1; feilmodusen (CTA vist til innlogget bruker med utløpt cookie-navn-endring) er kosmetisk.

## Kanttilfeller & vakter

- Ugyldig/revokert token: `notFound()` som i dag; metadata-fallback uten game-data (ingen enumerasjons-lekkasje).
- Draft/scheduled-spill: page redirecter/404-er allerede — metadata må følge samme gate (ingen navn-lekkasje for ikke-visbare spill).
- Embed (`/embed/spill`, `/embed/liga`): NULL endring — verifiseres i evaluering med diff-sjekk.
- `SpectatePoller`-refresh (20s) må ikke remounte CTA-en synlig (den er statisk utenfor poller-treet).
- Norsk copy gjennom humanizer-sjekk; begge locales.

## Nøkkelbeslutninger

- **OG v1 = statisk brand-kort + navn i tittel** (eier-besluttet) — ingen dynamisk bilde-rute; ev. bilde-med-navn er eget oppfølgings-issue ved behov.
- **CTA kun spectate** (eier-besluttet) — embed er tredjeparts-flate; `EmbedFooter` er brandingen der og er allerede alltid-på.
- **CTA-mål `/login`** — self-reg bor der; ingen egen signup-side finnes. ASSUMPTION dokumentert.
- **Commit:** `feat(spectate)` + minor-bump + CHANGELOG-linje («Delte spectate-lenker viser nå turneringsnavnet …»). Refs #1268.

**Claude's discretion:** eksakt plassering/utforming av CTA-kortet og BrandMark-størrelsen; i18n-nøkkelnavn; om beskrivelsen nevner formatet.

## Suksesskriterier

- [ ] `curl -s localhost:3000/spectate/<gyldig-token> | grep og:title` viser turneringsnavnet; ugyldig token gir generisk tittel og 404. **Bevis:** curl-output.
- [ ] noindex står fortsatt i `<head>` på spectate (curl-grep).
- [ ] Spectate-siden viser BrandMark i banneret og CTA nederst (uinnlogget); CTA lenker til login. **Bevis:** staging-klikkrunde (offentlig side, ingen login trengs — preview-verktøyene holder) + skjermbilde; `staging-verified`-label.
- [ ] Med aktiv sesjons-cookie skjules CTA-en. **Bevis:** jsdom-test av klient-komponenten (cookie satt/ikke satt) — preview-MCP kan ikke drive React-interaksjoner (#1219), men dette er ren render-gate.
- [ ] `git diff --name-only` viser INGEN endring under `app/[locale]/embed/`. **Bevis:** diff-listing i evaluering.

## Gates

- [ ] `npm run build` + `npm run lint` grønne; maks ÉN ny render-test (Type C-regelen); humanizer på ny copy
- [ ] Commit-body `Refs #1268`; PR-body `Closes #1268`; bevis-kommentar + `staging-verified` før merge

## Filer som trolig berøres

- `app/[locale]/spectate/[token]/page.tsx` — metadata + banner + CTA-innplassering
- `app/[locale]/spectate/[token]/SpectateCta.tsx` — NY (klient, cookie-gate)
- `messages/no.json` + `messages/en.json` — CTA/description-nøkler
- `package.json`/`package-lock.json`/`CHANGELOG.md`

## Utenfor scope

- Embed-flatene (branding finnes: EmbedFooter); dynamisk OG-bilde med turneringsnavn; noindex-endringer; liga-spectate (finnes ikke som egen flate); sponsor-stripen.
