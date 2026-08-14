# Evaluering: #1371 «Logg inn»-lenke i SyncBanner

**Verdikt: ACCEPT** (fersk-kontekst evaluator, 2026-08-14)

Branch: `fix/1371-syncbanner-login-link` @ `6a8676af` · kontrakt:
`.forge/contracts/1371-syncbanner-login-lenke.md`
Diff mot `origin/main`: 5 filer / +61 −14 (`.changes/`, `SyncBanner.tsx`,
`SyncBanner.test.tsx`, `messages/no.json`, `messages/en.json`).

All evidens under er reprodusert av meg i denne økten (Node v22.23.0), ikke
kopiert fra byggerapporten.

## Kriterier

### 1. Aktiv kø + auth-feil → «Logg inn»-lenke — PASS

`components/sync/SyncBanner.tsx:265` — `const showLogin = hasErrors && errorKey === 'errorAuth';`
Lenken rendres først i handlingsgruppa, med `href={`/login?next=${encodeURIComponent(loginNext)}`}`.

Evidens (egen kjøring):

```
npx vitest run components/sync/SyncBanner.test.tsx messages/catalogParity.test.ts
Test Files  2 passed (2)
     Tests  10 passed (10)
```

### 2. Kun errorAuth i active-varianten — PASS

- `errorKey` kommer fra den uendrede `friendlySyncError` (SyncBanner.tsx:37–79);
  `network`/`permission`/`rateLimit`/`generic` gir `showLogin === false`.
- Ingen feil (`hasErrors === false`, dvs. ren `queueWaiting`) → `showLogin`
  kortslutter på `hasErrors` FØR `errorKey`-sammenligningen, så lenken vises
  ikke i venter-banneret. Verifisert i kode; eksisterende `queueWaiting`- og
  network-tester fortsatt grønne.
- Quarantine-varianten er upåvirket: `showLogin`/`loginNext` beregnes ETTER
  `if (abandoned.length > 0) { … return … }` (SyncBanner.tsx:170), så koden er
  uåpnåelig derfra.
- **Kontraktens «aksepterte hull» er i praksis inert:** auth-feil kan aldri bli
  quarantined. `lib/sync/classifyError.ts:23–39` lister `jwt`/`expired`/
  `session`/`401`/`unauthorized` som TRANSIENT_PATTERNS, og
  `syncRetryDecision` (linje 93–100) returnerer `'retry'` for alt som ikke er
  eksplisitt permanent. En utløpt sesjon havner derfor alltid i active-
  varianten — der lenken finnes.

### 3. next-param: locale-prefiks + encodeURIComponent, samme mønster som proxy.ts — PASS

Bygget (SyncBanner.tsx:266–267):

```
const loginNext = locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;
```

`proxy.ts:294–301`:

```
const prefix = pathLocale && pathLocale !== routing.defaultLocale ? `/${pathLocale}` : '';
url.pathname = `${prefix}/login`;
url.search = `?next=${encodeURIComponent(currentPath)}`;
```

Samme defaultLocale-gate, samme encodeURIComponent. Prefikset MÅ ligge i
`next`-verdien: `app/[locale]/(auth)/login/actions.ts:3` importerer `redirect`
fra `next/navigation` (ikke `@/i18n/navigation`) og kaller `redirect(next)`
rått på linje 529 — ingen re-lokalisering på mottakersiden.

**Dobbelt-prefiks-sjekken (eksplisitt etterspurt): ingen dobling.** Verifisert
mot next-intl 4.13.0-kildene i `node_modules`:

- `navigation/shared/createSharedNavigationFns.js` — for en streng-`href` blir
  hele strengen `pathname`, og går gjennom `applyPathnamePrefix(pathname, locale, config, undefined)`.
- `navigation/shared/utils.js` → `applyPathnamePrefix` → `prefixPathname` i
  `shared/utils.js:19–28` gjør ren konkatenering (`'/en' + '/login?next=%2Fen%2F…'`).
  Query-delen røres aldri, og fordi `loginNext` er encodet finnes det ingen
  rå `/` i verdien som kunne blitt tolket som path.
- `usePathname` fra `@/i18n/navigation` er `useBasePathname`
  (`navigation/react-client/useBasePathname.js`) — den STRIPPER locale-prefikset.
  Kjeden for en engelsk bruker på `/en/games/x/holes/3` blir derfor:
  `pathname='/games/x/holes/3'` → `loginNext='/en/games/x/holes/3'` →
  `href='/login?next=%2Fen%2Fgames%2Fx%2Fholes%2F3'` → Link-render
  `/en/login?next=%2Fen%2Fgames%2Fx%2Fholes%2F3`. Identisk med det proxy.ts
  produserer. Prefikset legges på path-delen én gang, aldri på query-verdien.

### 4. Ny test er bærende — PASS

Byttet inn `origin/main`-versjonen av `SyncBanner.tsx`, kjørte suiten, restaurerte:

```
git show origin/main:components/sync/SyncBanner.tsx > components/sync/SyncBanner.tsx
npx vitest run components/sync/SyncBanner.test.tsx
 → Test Files  1 failed (1)
   Tests  1 failed | 7 passed (8)
   components/sync/SyncBanner.test.tsx:148  getByRole('link', {name:'Logg inn'})
git checkout -- components/sync/SyncBanner.tsx   → tre rent, fil bit-identisk med HEAD
```

Testen feiler av riktig grunn (lenken finnes ikke), ikke på en tilfeldig
assert. Merk at `vitest.setup.ts:36–56` globalt mocker `@/i18n/navigation`
(Link → `<a href>`, usePathname → `'/'`), så unit-testen dekker rå-href-en, ikke
locale-prefikset — det er korrekt avgrenset og dokumentert i testkommentaren
og i kontrakten (staging-kriteriet).

### 5. `SyncBanner.loginAction` i BEGGE kataloger — PASS

`messages/no.json`: `"loginAction": "Logg inn"` · `messages/en.json`: `"loginAction": "Log in"`.
Egen node-sjekk: `Object.keys(no.SyncBanner).filter(k => !(k in en.SyncBanner))` → `[]`.
`messages/catalogParity.test.ts` grønn (2/2).

### 6. Ingen endring i classifyError/syncWorker — PASS

`git diff origin/main...HEAD --stat` rører ingen fil under `lib/sync/`. De fem
filene er `.changes/1371-*.md`, `components/sync/SyncBanner.{tsx,test.tsx}`,
`messages/{no,en}.json`.

### 7. Tap-targets ≥44px på begge handlinger — PASS

Begge har `inline-flex min-h-[44px] items-center` (SyncBanner.tsx:288, 296).
`min-height` respekteres på inline-flex også under foreldrens `items-center`.
Retry-knappen ble løftet fra `py-1` til 44px i samme slengen — dokumentert
avvik i kontrakten, og riktig kall: paret ville ellers stått visuelt ulikt.

### 8. Gater — PASS

- `npm run typecheck` → **exit 0** (ingen output).
- `npx eslint components/sync/SyncBanner.tsx components/sync/SyncBanner.test.tsx` → **exit 0**.
- `npx vitest run components/sync/SyncBanner.test.tsx messages/catalogParity.test.ts` → **10/10**.
- `node scripts/weekly-release.mjs --dry-run` → notatfila validerer og faller
  inn som `1.233.0`-linje under Feilrettinger. Ingen `package.json`-bump, ingen
  `CHANGELOG.md`-redigering i diffen.

### 9. Staging-verifisering — IKKE VURDERT

Siste checkbox er eksplisitt utenfor dette mandatet.

## Funn (alle ikke-blokkerende)

Ingen av disse bryter et kontraktkriterium; de er notert for staging-runden og
eventuell oppfølging.

1. **`components/sync/SyncBanner.tsx` + next-param** — query-strengen faller
   bort. `proxy.ts` bygger `next` av `pathname + search`; her brukes bare
   `usePathname()`, som ikke inneholder search. 11 ruter under
   `app/[locale]/games/[id]/` leser `searchParams`, så en spiller som logger inn
   fra f.eks. leaderboard med aktivt filter lander på grunnstien uten det.
   Kontraktens ordlyd sier «gjeldende path», så bygget er innenfor — men
   avviket fra proxy-mønsteret er reelt.
2. **`components/sync/SyncBanner.tsx` + robusthet** — `usePathname()` kan
   returnere `null`. next-intl dokumenterer det selv i
   `navigation/react-client/createNavigation.js` («`null` is returned when used
   outside of Next, but the types indicate that a string is always returned»),
   og `useBasePathname` gir `null` rett videre. Da blir `loginNext` enten
   `encodeURIComponent(null) === 'null'` eller strengen `/ennull`. I App
   Router-render skjer det ikke i praksis, så dette er hardening, ikke en bug.
3. **`components/sync/SyncBanner.tsx` + tap-targets/layout** — på 320px-skjerm
   tar de to handlingene ca. 175px `shrink-0` (mot ~90px før). Meldingsdiven har
   `min-w-0` + `truncate`, så oppsettet brekker IKKE — men «Innloggingen er
   utløpt — logg inn på nytt. 3 slag venter.» klippes hardt. Verdt å se på i
   staging-klikket; en `flex-wrap` eller kortere melding når `showLogin` er på
   ville hjulpet.
4. **`components/sync/SyncBanner.tsx` + kodestil** — `actionButtonClasses`
   (linje 148) ble innført for quarantine-varianten og gjenbrukes ikke i
   active-varianten, som nå har nesten identiske inline-klasser med `px-2.5`
   mot konstantens `px-3`. Ren duplikasjonsdrift, ingen funksjonell effekt.
5. **`components/sync/SyncBanner.tsx` + feilvalg** — `rawError` er
   `active.find(i => i.lastError)`, altså første feil i køen. Ligger en
   nettverksfeil foran en auth-feil, viser banneret nettverksmeldingen og
   skjuler lenken. Pre-eksisterende semantikk som lenken bare arver; nevnt for
   fullstendighet.

## Konklusjon

Alle åtte evaluerbare kriterier PASS med egen-reprodusert evidens. Testen er
bevist bærende, next-param-mønsteret matcher proxy.ts eksakt, og next-intl
dobbelt-prefikser ikke query-verdien. Funnene er nits, ikke omkamper.
