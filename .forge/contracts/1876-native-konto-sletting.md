# Spec: Native — konto-sletting i appen (App Store-kravet)

## Problem

Must-punkt i #1816: spillere skal kunne slette kontoen sin fra native-appen før
butikk-byttet (App Store 5.1.1(v)). I dag finnes sletting kun på webben
(`/profile/slett-konto`, #1012) — appen har ingen vei, og etter byttet er appen
hovedflaten. Del-issue: #1876. Bygges ETTER at N6c (#1856) er merget
(sekvensiell N6-disiplin — slicene deler `native/app`-filer).

**Verifisert forbehold** (epicens «verifiseres mot faktisk app-flyt»): appens
login har `shouldCreateUser: false` (`Login.tsx:26`) — appen oppretter i dag
IKKE kontoer, så 5.1.1(v) binder strengt tatt først når kontoopprettelse kommer
til appen. Must-statusen er eiervalg (2026-08-30) og står; web-veien alene blir
uansett en blindvei etter byttet.

## Research Findings (verifisert mot repoet i denne økta, 2026-09-01)

- **Webbens sletting er hel-service-role — ingen RLS-vei finnes.**
  `slett-konto/actions.ts` → `getDeleteBlockReason` + `deleteOrAnonymizeUser`
  (`lib/users/deleteAccount.ts`), begge på `getAdminClient()`:
  `anonymize_user`-RPC (0131) kalles med admin-client, og GoTrue-softdelete er
  `auth.admin.deleteUser(id, true)` — et admin-API. Appen kan ALDRI holde
  service-role, så den trenger en server-vei.
- **Ingen DB-endring trengs.** `anonymize_user` (0131) er i prod siden
  2026-07-03; blokk-regelen er ren TS. Prod-brannmuren #1074 er dermed IKKE i
  spill i denne slicen — men merge-policyens «aldri auto-merge destruktive
  flyter/auth» gjelder (se footer).
- **Route-veien er åpen:** proxy-matcheren ekskluderer `api/` (proxy.ts:416),
  rutene håndterer egen auth (cron-rutene = Bearer-presedens med CRON_SECRET).
  Bruker-JWT-varianten er ny for repoet: `auth.getUser(jwt?)` finnes
  (auth-js `GoTrueClient.d.ts:1493`) og validerer tokenet mot GoTrue.
  `SUPABASE_SERVICE_ROLE_KEY` ligger alt i Vercel-env (andre admin-flyter).
- **App-siden:** sesjonen bor i AsyncStorage via supabase-klienten
  (`supabase.ts`); `App.tsx` eier `onAuthStateChange` og flipper til
  Login-stacken når sesjonen blir null — lokal signOut etter sletting gir
  navigasjonen gratis. `signOut({ scope: 'local' })` finnes (SignOutScope,
  auth-js). Lokal DB `torny.db` har 4 tabeller (scores, sync_queue, conflicts,
  cache_entries — db.ts); `SQLite.deleteDatabaseAsync` finnes i expo-sqlite
  SDK 57.
- **Kjent nabo-gap, utenfor scope:** dagens «Logg ut» (Home.tsx:208) rydder
  ikke lokal DB — filed som #1877 (kobler wipe-primitiven herfra på utlogging).
- **Copy-fasit:** `messages/no.json` → `profile.deleteAccount` (bannere,
  bullets, bekreft-tekst, feilmeldinger) — gjenbrukes som literaler (appen er
  norsk-only, #1850-paritet).
- DeepWiki utilgjengelig i økta — API-påstandene er i stedet verifisert mot
  bundlede typedefinisjoner i repoet (auth-js, expo-sqlite), som er ferskere
  enn treningsdata.

## Prior Decisions (videreført)

- Ingen service-role i appen; server-siden/RLS er authz (AGENTS trap 3).
- **Destruktiv flyt = dedikert bekreftelses-side**, aldri inline (husregelen;
  jf. N6c-kontrakten).
- En regel har ett hjem (trap 4): blokk-regelen bor i `getDeleteBlockReason`
  og gjenbrukes — speiles ALDRI i appen.
- Design-tokens/`useTheme` (#1830), `[no-changelog]` på native-commits,
  relative imports i `native/app`, én simulator per økt,
  ærlig-feil-guardrailen, skriv krever nett.
- Sekvensiell N6-disiplin: ingen `autonomy:ready` på #1876 før N6c (#1856) er
  merget.

## Design

### Web-delen: konto-API med bruker-JWT

Ny route handler `app/api/account/delete/route.ts` (+`route.test.ts`;
eksakt navn/form = diskresjon):

- **Auth:** `Authorization: Bearer <access_token>`; verifiseres server-side
  med `auth.getUser(token)`; bruker-id hentes KUN fra tokenet — aldri fra
  body/params (ingen vei til å slette andre).
- **GET** → `{ blocked: 'admin_account' | 'active_engagements' | null }` via
  `getDeleteBlockReason` — appen bruker den til å vise blokk-banner FØR
  bekreftelsesskjermen viser slette-knappen.
- **POST** → re-sjekker blokk-regelen (autoritativt), kaller
  `deleteOrAnonymizeUser(userId, '[api/account/delete]')`;
  200 `{ mode }` · 401 uten gyldig token · 403 `{ error: <reason> }` ·
  500 `{ error: 'delete_failed' }`.
- Webbens eksisterende flyt (`actions.ts`/`page.tsx`/helpers) røres IKKE —
  ruten er additiv.

### App-delen

- **Inngang:** «Konto»-lenke i Home-footeren → ny `Account`-skjerm (e-post,
  «Logg ut», lavmælt «Slett konto»-inngang). ASSUMPTION (autonom økt): valgt
  framfor en «Slett konto»-lenke rett i Home-footeren — holder Home ren og gir
  App Review en gjenfinnbar konto-flate; eier kan veto-e plasseringen i PR-en.
- **`DeleteAccount`-bekreftelsesskjerm** (dedikert, husregelen): speiler
  webbens tre blokker — «Dette vil bli slettet» / «Dette beholdes» /
  bekreft-avsnitt med navn — med copy-paritet fra `messages/no.json`; rød
  bekreft-knapp (danger-token fra theme) + «Avbryt». Blokkert (GET) → samme
  bannertekster som web, INGEN slette-knapp.
- **Utfør (krever nett):** POST → ved 200: stopp sync-worker/realtime, lukk
  DB-tilkoblingen og fjern `torny.db` (deleteDatabaseAsync eller tømming av
  alle fire tabeller — diskresjon; utfallet som teller: ingen lokale data
  igjen), deretter `signOut({ scope: 'local' })` (server-sesjonene er alt
  revokert av GoTrue; lokal scope unngår 403-støy) → App.tsx-lytteren flipper
  til Login.
- **Env:** `EXPO_PUBLIC_WEB_BASE_URL` i `native/app/.env.local`
  (staging-verify = lokal web i prod-server-modus; butikk-bygg =
  `https://tornygolf.no`). Mangler den → ærlig feilmelding på skjermen, aldri
  stille no-op.
- **Datamodul** `native/app/src/data/account.ts` (+tester): GET/POST-kallene,
  typede feil, wipe-primitiven (primitiven selv i `db.ts` så #1877 kan
  gjenbruke den).

## Edge Cases & Guardrails

- **Blokk-tilstander:** admin-konto og aktive engasjementer viser webbens
  bannertekster; GET styrer UI, POST håndhever (ett regel-hjem).
- **401 (utløpt token, refresh feilet):** «Logg inn på nytt og prøv igjen» —
  ALDRI lokal wipe på 401 (tokenet kan bare være utløpt; var kontoen faktisk
  slettet, feiler re-innlogging naturlig med «ingen konto»).
- **Dobbel-tapp/retry:** `deleteOrAnonymizeUser` har `deleted_at`-shortcircuit
  → idempotent; knappen disables under pending uansett.
- **Svar tapt etter server-suksess:** neste forsøk får 401 (sesjonene
  revokert) → 401-stien over dekker; ingen halv-tilstand på enheten.
- **Offline:** bekreft-knappen krever nett (N6-mønsteret); les-og-vis frit.
- **Sync-kø forkastes ved wipe** — ok by design: blokk-regelen garanterer
  ingen aktive spill, køen er i praksis tom for en som kan slette seg.
- **STAGING-VERN:** e2e-testen sletter ALDRI `E2E_ADMIN`/`E2E_PLAYER` —
  opprett engangsbruker via service-role admin-API og slett DEN. Prod-vakten
  står: staging-mintet token validerer kun mot staging.
- **Ingen service-role-nøkkel i appen**, ingen userId-parameter i API-et.

## Key Decisions

- **Slette-veien = route handler på web-deployen.** Gjenbruker
  `lib/users/deleteAccount.ts` as-is, null DB-endring, umiddelbar effekt, og
  webben består som døråpner etter byttet så avhengigheten er varig. Forkastet:
  (a) SECURITY DEFINER-RPC som skriver i auth-skjemaet — måtte replikere
  GoTrue-interna (e-post-obfuskering, token-nulling, sesjonsrevokering) i SQL,
  skjørt + prod-migrasjon; (b) Supabase Edge Function — repoet har ingen
  (`supabase/functions` finnes ikke), ny deploy-flate for null gevinst;
  (c) markørkolonne + cron-sweep (N6c-mønsteret) — passer en mail/AI-hale, ikke
  én atomisk service-role-operasjon; brukeren ville stått «halv-slettet»
  innlogget til sweepen kom.
- **GET-status + POST-utfør mot samme helper** — appen speiler aldri
  blokk-regelen.
- **Enhets-opprydding er del av slicen** (torny.db + AsyncStorage) — en
  slettet konto skal ikke etterlate spor på enheten.
- **ASSUMPTION (autonom økt):** Konto-skjerm som inngang (se Design) — eier
  kan veto-e i PR-en uten ombygging av betydning (liten reversibilitet).

**Claude's Discretion:** rutenavn/-form (én route m/ GET+POST vs to ruter),
wipe-mekanisme (slett fil vs tøm tabeller), om «Logg ut» flyttes fra footeren
inn i Konto-skjermen eller dupliseres, skjerm-/modulnavn, feilkopi-detaljer
innenfor copy-pariteten, hvordan `displayName` hentes (egen users-rad via RLS
el. sesjonens e-post).

## Success Criteria

- [ ] 1. **Jest-paritet (native/app):** blokk-tilstander rendrer banner uten
  slette-knapp; suksess-stien kaller wipe + lokal signOut i riktig rekkefølge;
  401-stien wiper IKKE; wipe-primitiven fjerner data fra alle fire tabeller.
  `npx jest` grønn.
- [ ] 2. **Route-tester (rot, Type A):** 401 uten/med ugyldig token; 403 med
  reason for admin/aktiv; 200 kaller `deleteOrAnonymizeUser` med TOKENETS
  bruker-id; en userId i request-body ignoreres. `npx vitest run` grønn.
- [ ] 3. **Staging e2e (engangsbruker):** slett fra appen → staging-DB viser
  `deleted_at` satt, `name = 'Slettet bruker'`, tombstone-e-post
  `slettet+<uuid>@deleted.tornygolf.no`, auth-raden soft-slettet; historiske
  scores består med «Slettet bruker». Service-role-lesing som bevis +
  skjermbilder.
- [ ] 4. **Enhets-opprydding bevist:** etter sletting står appen på Login;
  `torny.db` borte/tom og AsyncStorage-sesjonen borte; ny innlogging som annen
  bruker starter rent (bevis: jest på primitiven + relaunch-skjermbilde).
- [ ] 5. **Blokkert-sti på staging:** engangsbruker i aktivt spill → banner,
  ingen slette-mulighet (skjermbilde).
- [ ] 6. **Web-regresjon:** webbens slett-konto uendret — `deleteAccount.ts`/
  `actions.ts`/`page.tsx` urørte (diff-bevis), rot-vitest grønn.
- [ ] 7. **Porter + runbook:** alle Gates grønne; `docs/native/app-spike.md`
  får konto-sletting-seksjon (API-kontrakten, env-varen, staging-vernet for
  e2e-brukere). Eier-tapptest hvis tilgjengelig, ellers `VERIFICATION GAP` +
  restanse.

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/`. Node 22.
Ingen nye native moduler. Staging-verify av web-ruta i prod-server-modus —
`next build` m/ staging-env + `next start`, aldri dev.)

- [ ] `npx jest` i `native/app/` grønt
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — inkl. nye route-tester
- [ ] `npx eslint native/app app/api/account` grønt
- [ ] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `app/api/account/delete/route.ts` (ny, +`route.test.ts`) — bruker-JWT-API-et
- `native/app/src/screens/Account.tsx` + `DeleteAccount.tsx` (nye) — inngang +
  bekreftelse
- `native/app/src/data/account.ts` (ny, +tester) — API-kall og utfør-flyten
- `native/app/src/data/db.ts` — wipe-primitiv (additiv)
- `native/app/src/screens/Home.tsx` + `navigation.tsx` — footer-lenke + routes
- `docs/native/app-spike.md` — konto-sletting-seksjon

## Out of Scope

- Kontoopprettelse i appen (`shouldCreateUser`-flippen — egen vurdering
  ved/etter byttet)
- Admin-slett av andre spillere fra appen (forblir web/Sekretariat)
- Wipe ved vanlig utlogging (#1877 — bygger på primitiven herfra)
- Endringer i webbens slett-konto-UI, blokk-regelen eller `anonymize_user`
- Push-avmelding (ingen push før N7), i18n i appen (norsk-only, etablert)

---

**Til byggeren:** bygges ETTER at N6c (#1856) er merget — bekreft det først.
Drift-verifisering mot HEAD før første kodelinje (#1850-mønsteret), sjekk
natt-PR-ene for overlapp. Ingen prod-DB-migrasjon i denne PR-en, men PR-en
auto-merges LIKEVEL ALDRI: konto-sletting er destruktiv flyt + auth-tilstøtende
per merge-policyen — eier godkjenner. Presentér Konto-skjerm-ASSUMPTION-en som
veto-punkt i PR-teksten (vanlig norsk).
