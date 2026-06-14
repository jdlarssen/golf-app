# Forge-evaluering: #612 + #613 — ACCEPT

**Kontrakt:** `.forge/contracts/612-613-dead-inbox-notifications-branded-404.md`
**Branch:** `claude/hungry-solomon-23f70d` · **Versjon:** 1.128.0 + 1.128.1
**Evaluator:** fersk-kontekst skeptisk sub-agent (opus), uavhengig verifisert
**Dato:** 2026-06-14 · **Verdikt:** **ACCEPT**

## Resultat per kriterium

| ID | Verdikt | Bevis |
|----|---------|-------|
| C1 not-found async server-komp, i `[locale]`-layout, `getTranslations('notFound')`, ingen params | PASS | `app/[locale]/not-found.tsx:20-21` |
| C2 merket forest-and-champagne, ≥44px tap-target | PASS | `not-found.tsx:23-41`; `LinkButton` `min-h-[44px]` (Button.tsx:11) |
| C3 `notFound`-namespace i begge catalogs, identisk struktur | PASS | no.json + en.json; catalogParity-test grønn |
| C4 «Til Hjem» → `/` lokalisert; bunn-nav arvet ikke duplisert | PASS | `LinkButton href="/"` via SmartLink; nav fra layout |
| C5 ukjent sti rendrer per locale | PASS (by construction) | proxy rewriter alle stier til `app/[locale]/…`; build prerendrer per locale |
| C6 selvpekende kinds navigerer ikke, kun mark-read; `notificationDestination(): string\|null`; testet | PASS | deeplink.ts:24-27,55-57; handleTap-guard InboxClient.tsx:75-76 |
| C7 stale `registration_request` skjult via batched admin-query, gardet, ikke-destruktiv; testet | PASS | page.tsx:48-61; staleNotifications.test.ts |
| C8 gjenværende blindveier → merket 404 | PASS | følger av C1 |
| G1 `tsc --noEmit` rent | PASS | exit 0; uttømmende switch (21 kinds) |
| G2 `npm run build` grønt | PASS | implementer kjørte (exit 0, alle locale-ruter ◐ PPR); evaluator resonnerte build-safe (admin-klient kun request-tid) |
| G3 co-located vitest grønt | PASS | 23 tester grønne (deeplink 6, stale 5, InboxClient eksisterende, catalogParity) |
| G4 humanizer + hooks | PASS | norsk copy ren, ingen AI-tells; commit-msg-hook godtok bump+CHANGELOG |

## Nøkkelfunn

- **404-routing verifisert:** Én `app/[locale]/not-found.tsx` fanger både ukjente topp-nivå-stier og nestet `notFound()`, fordi `proxy.ts` rewriter alt til `app/[locale]/…` og `as-needed` aldri gir ugyldig `[locale]`. Den teoretiske gapet (layout-ens eget `!hasLocale → notFound()`) er uoppnåelig i prod fordi proxy-en garanterer locale ∈ {no, en}.
- **Deeplink-ekstraksjon er adferds-bevarende:** linje-for-linje-diff mot `origin/main:buildDeeplink` — alle 21 kinds mapper til identisk sti, unntatt de to tilsiktede null-returene (`registration_rejected`, `product_update` uten lenke).
- **Stale-filter:** beskjærer kun `registration_request`, én batched query, gardet, ikke-destruktiv, build-safe.
- **Test-disiplin:** ingen andre render-test for InboxClient lagt til; nye tester er rene Type A.

## Kjent, avgrenset begrensning (bevisst utenfor scope → #616)

En skjult stale signup som fortsatt er ulest teller mot bunn-nav-ens ulest-**prikk** (`useUnreadNotificationsCount` teller alle uleste rader; filteret påvirker kun den viste lista). Aldri en blindvei (raden er skjult, kan ikke trykkes) — kun prikken. Eneste slike lekkasje, og korrekt henvist til badge-arbeidet i #616.

## Konklusjon

Alle 8 kriterier + 4 gates passerer. Ingen korrekthets-bugs, ingen kontrakt-brudd, ingen disiplin-brudd. **ACCEPT — klar for PR.**
