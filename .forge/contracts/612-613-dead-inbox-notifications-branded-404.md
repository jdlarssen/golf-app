# Forge-kontrakt: Døde innboks-varsler + merket 404-side (#613 + #612)

**Branch:** `claude/hungry-solomon-23f70d`
**Issues:** [#613](https://github.com/jdlarssen/golf-app/issues/613) (død-lenke i innboks) + [#612](https://github.com/jdlarssen/golf-app/issues/612) (rå engelsk Next.js-404)
**Versjon:** 1.127.6 → 1.128.0 (#612, ny merket side) → 1.128.1 (#613, bugfix nestet under samme tema)

## Problem (slik en ikke-teknisk bruker opplever det)

Et eldre påmeldings-varsel i Innboks («X vil bli med — bane, dato») navigerer til
`/admin/games/<id>/signups`. Når spillet er slettet kaller siden `notFound()`
(`app/[locale]/admin/games/[id]/signups/page.tsx:92`). Fordi det ikke finnes
noen `app/[locale]/not-found.tsx`, faller appen tilbake til Next.js sin innebygde,
ustilte **engelske** 404 (svart bakgrunn, «404 — This page could not be found.»,
ingen merke, ingen vei tilbake). Ser ut som appen har krasjet.

I tillegg: noen varsler peker til `/innboks` (seg selv) — `registration_rejected`
og `product_update` uten lenke. Et trykk gjør `router.push('/innboks')` mens du
står på `/innboks` → null synlig endring → føles ødelagt.

## Funn fra utforsking (sannhetsankere)

- **Routing:** `i18n/routing.ts` → `localePrefix: 'as-needed'`, default `no` (uprefikset),
  `en` under `/en/…`. `proxy.ts` rewriter ALLE stier til `app/[locale]/…`. ⟹ **én**
  `app/[locale]/not-found.tsx` fanger både ukjente topp-nivå-stier (#612-reproen) OG
  `notFound()` fra nestede sider (signups, #613). Ingen `app/not-found.tsx` trengs.
- **not-found.tsx rendres inne i `[locale]`-layouten** (`app/[locale]/layout.tsx`):
  får `<html lang>`, `NextIntlClientProvider` og `BottomNavGate` (bunn-nav) automatisk.
  Komponenten får IKKE `params` som prop → les locale via `getTranslations('ns')`
  (request-kontekst via `next/root-params`), samme mønster som
  `app/[locale]/signup/[shortId]/not-found.tsx`.
- **Mal for stil:** `app/[locale]/finn-turneringer/page.tsx:71-90` (champagne-medaljong
  + `PinFlag` + serif-heading + `LinkButton`) er gullstandarden issuet peker på.
  `app/[locale]/signup/[shortId]/not-found.tsx` er mal for not-found-strukturen
  (AppShell + getTranslations + LinkButton href="/").
- **Innboks-data:** `notifications`-tabell → `app/[locale]/innboks/page.tsx` (server)
  → `InboxClient.tsx`. `buildDeeplink()` (InboxClient.tsx ~144-220) mapper kind→rute.
  `handleTap` (InboxClient.tsx ~55-73) markerer-lest + `router.push(buildDeeplink(...))`.
  Selvpekende kinds: `registration_rejected` → `/innboks`; `product_update` uten
  `link` → `/innboks`.
- **Signups-blindvei:** `requireAdminOrTrustedCreator` redirecter ikke-admins til `/`
  FØR spill-spørringen (`lib/admin/auth.ts:79`). `notFound()` nås derfor kun når en
  faktisk admin/creator åpner et **slettet/utilgjengelig** spill → merket not-found
  er riktig destinasjon.
- **i18n:** 28 topp-namespaces i `messages/{no,en}.json`. Ingen `error`/`404`-namespace
  i dag. Server-komponenter: `await getTranslations('ns')`.
- **Komponenter (bekreftet eksisterer):** `AppShell`, `Card`, `LinkButton` (Button.tsx),
  `BrandMark`, `ChampagneMedallion`, `PinFlag`. Palett-tokens: `bg-bg`, `text-text`,
  `text-primary`, `text-accent`, `text-muted`, `bg-surface` (globals.css `@theme inline`).

## Suksesskriterier

### #612 — Merket, lokalisert not-found-side

- [ ] **C1** `app/[locale]/not-found.tsx` finnes: default-eksportert `async`
      server-komponent, rendres inne i `[locale]`-layouten (arver bunn-nav + `<html lang>`
      + NextIntl). Bruker `getTranslations('notFound')` (ingen `params`-prop).
- [ ] **C2** Visuelt merket i forest-and-champagne: `BrandMark` + `ChampagneMedallion`
      med `PinFlag`-illustrasjon + serif-heading + linen-bakgrunn via `AppShell`.
      INGEN rå engelsk Next-default. Tap-target ≥44px på «Til Hjem».
- [ ] **C3** All copy via nytt `notFound`-namespace i BÅDE `messages/no.json` og
      `messages/en.json` (byte-identisk struktur). Norsk: heading «Denne siden finnes
      ikke», vennlig body, knapp «Til Hjem». Engelsk: meningsekvivalent. Norsk er kilde
      → `humanizer`-skillet kjørt før commit.
- [ ] **C4** «Til Hjem»-`LinkButton` → `/` (lokalisert av SmartLink). Bunn-nav synlig
      for innloggede (arvet fra layout) — ikke duplisert i siden.
- [ ] **C5** Ukjent sti rendrer siden på riktig språk: `/dette-finnes-ikke-12345` (norsk)
      og `/en/dette-finnes-ikke` (engelsk). Verifisert via `npm run build` (prerender
      per locale) + strukturlesing (+ preview-screenshot hvis dev-server kan startes).

### #613 — Døde innboks-varsler (Lean + skjul utdaterte)

- [ ] **C6** Selvpekende varsler (`registration_rejected`; `product_update` uten `link`)
      navigerer IKKE lenger til `/innboks` ved trykk — de markeres kun som lest.
      Implementert via ren helper `notificationDestination(notification): string | null`
      (returnerer `null` for selv/ingen-destinasjon); `handleTap` gjør `router.push`
      kun når destinasjonen er non-null. Enhetstestet (Type A, `it.each`).
- [ ] **C7** `registration_request`-varsler som peker til et spill som ikke lenger
      finnes skjules fra innboks-lista. Filtrert ved innlasting i
      `app/[locale]/innboks/page.tsx` via ÉN batched eksistens-spørring
      (`select id from games where id = any(...)`) med admin-klient (RLS-bypass, kun
      eksistens — ingen datalekkasje). Ren helper
      `filterStaleSignupNotifications(rows, existingGameIds)` enhetstestet (Type A).
      Ikke-destruktivt: rader blir værende i DB, bare skjult fra visning.
- [ ] **C8** Gjenværende sjeldne blindveier (et fortsatt-vist varsel hvis side kaller
      `notFound()`) lander på den merkede #612-siden, ikke rå engelsk 404. (Følger av C1.)

## Gates (kjør scoped til det som er endret)

- [ ] **G1** `npx tsc --noEmit` rent — ingen nye type-feil; uttømmende `switch`-er intakte
      (memory: Vercel-bygg feiler på manglende grener).
- [ ] **G2** `npm run build` grønt (Vercel-paritet; not-found prerendres per locale).
- [ ] **G3** Co-located vitest grønt for endrede/nye filer: nye helper-testfiler +
      evt. eksisterende innboks-tester.
- [ ] **G4** `humanizer`-skillet kjørt på ny norsk copy; `.githooks/pre-commit` (AI-tells)
      + `.githooks/commit-msg` (version-bump + CHANGELOG for bruker-synlige commits) passerer.

## Commit-plan (atomisk, hver med `Refs #N`)

1. `feat(404): branded localized not-found page` — `not-found.tsx` + `notFound`-namespace
   (no+en) + bump **1.128.0** + CHANGELOG-tema «Døde innboks-varsler og merket 404».
   `Refs #612`, `Closes #612`.
2. `fix(inbox): stop dead-end taps — skip self-navigation and hide deleted-game signups`
   — `notificationDestination` + `filterStaleSignupNotifications` helpere + enhetstester
   + `InboxClient.handleTap`-guard + `page.tsx` stale-filter-wiring + bump **1.128.1**
   + CHANGELOG (nestet under 1.128-tema). `Refs #613`, `Closes #613`.

PR: `gh pr create --base main` med `Closes #612` + `Closes #613` i body.
Closing-kommentar (Teknisk + Funksjonell, norsk) på begge issues ved merge.

## Ikke-mål (eksplisitt utenfor scope)

- #616: lest/ulest-badge på bunn-nav, «merk alle som lest»-UI-utvidelse, arkiver/fjern-varsel,
  demping av «Resultatet er klart»-duplikat, 2-linjers undertekster. Egen issue.
- Eksistens-sjekk for ikke-signup-kinds (invite/game_finished/player_added → `/games/{id}`):
  vi stoler på #612-sikkerhetsnettet for deres sjeldne blindveier (unngår per-varsel-spørringer).
- Endring av `notifications`-skjema / nye migrasjoner / destruktiv sletting av varsel-rader.
- Render-test for `not-found.tsx`: hoppes (async server-komponent + getTranslations er
  vanskelig å rendre i vitest; test-disiplin TILLATER maks én, krever den ikke). Verifiseres
  visuelt via build + preview i stedet.
