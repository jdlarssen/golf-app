# Spec: Native N1 — fundament-spike (Expo-skjelett, delt scoring, OTP mot staging)

## Problem

Epic #1816 (eier-beslutning 2026-08-30) gjør ekte native app til målet; webben var stop-gap. Før noe av appen bygges må de to største tekniske risikoene bevises døde i minste mulige bit: (1) at web-appen og en Expo-app kan konsumere `lib/scoring` fra samme kilde uten at Vercel-bygget røres, og (2) at Supabase-OTP-innlogging fungerer i React Native uten cookie-laget fra `@supabase/ssr`. Feiler en av disse, må etappeplanen tegnes om — derfor spike først.

## Research Findings

- **Expo (SDK 52+, nå ~57) auto-konfigurerer Metro kun for workspace-monorepos** (npm/yarn/pnpm/bun). Ikke-workspace-deling dekkes ikke av docs, men løses med standard Metro-konfig: `watchFolders` mot repo-rota + resolver-oppsett. Kilde: docs.expo.dev/guides/monorepos (lest 2026-08-30).
- **Workspace-konvertering av rota er feil verktøy her:** npm-workspaces ville hoistet Expo/RN-avhengigheter inn i rotas `node_modules` → tyngre Vercel-install på hver web-deploy + risiko for React-versjonskollisjon (Next 16s React vs. RN-parets). Epicens egen risikolinje («workspace-oppsettet må ikke knekke Vercel-bygget») løses sikrest ved å ikke røre web-oppsettet i det hele tatt.
- **Supabase i RN:** offisiell quickstart = `@supabase/supabase-js` + `@react-native-async-storage/async-storage` + `react-native-url-polyfill`. AsyncStorage er dokumentert standard-adapter; auto-refresh knyttes til `AppState` (start/stopAutoRefresh). OTP-API-et (`signInWithOtp`/`verifyOtp({type:'email'})`) er identisk med web. Kilde: supabase.com/docs (2026-08-30).
- Expo støtter tsconfig-`paths` i Metro (SDK 51+) — kandidat for å resolve `@/`-aliasene inni `lib/scoring` (f.eks. `@/lib/scoring/modes/types`). Verifiseres i spiken; fallback er relative imports av selvstendige moduler.

## Prior Decisions

- **#1816:** RN + Expo, alt i appen fra dag én, butikk-bytte ved paritet. Spiken er N1 i etappeplanen.
- **#1283/#1282 (skallet):** bundle id `no.tornygolf.app` + team `8C8WCW67J9` er OPPTATT av Capacitor-skallet (ligger i TestFlight på eierens enhet). Native-appen arver id-en først ved butikk-byttet (N8) — spiken bruker egen dev-id.
- **Testing-disiplin:** all skriving mot staging (`snwmueecmfqqdurxedxv`), aldri prod. Autonom OTP: mint kode via service-role `POST /auth/v1/admin/generate_link` → `email_otp` (etablert staging-mønster).
- **#35:** web beholder Dexie — spiken rører ikke offline-laget (det er N2).

## Design

**Plassering:** frittstående Expo-app i `native/app/` med egen `package.json`/`node_modules` — IKKE workspace-medlem, samme mønster som `native/ios/` (Capacitor-skallet). Root-`package.json`, `next.config`, web-`tsconfig` og Vercel-oppsettet endres ikke med én linje.

**Deling av hjernen:** `metro.config.js` i appen setter `watchFolders: [<repo-rot>]` og resolver slik at appen importerer `lib/scoring`-kilden direkte (samme filer som web — ingen kopi, ingen publisert pakke). `@/`-aliasene inni `lib/scoring` resolves via tsconfig-paths i appens tsconfig (`@/*` → repo-rot). Bevis-import: minst `calculateCourseHandicap` fra `lib/scoring/courseHandicap.ts` (selvstendig modul) OG én modul som drar med seg interne `@/`-imports (f.eks. `lib/scoring/index.ts`) — det beviser at alias-resolvingen holder for hele biblioteket, ikke bare løvfiler.

**Spike-appen (to skjermer, norsk copy, ingen designpolish):**
1. *Login:* e-postfelt → «Send meg kode» (`signInWithOtp`, `shouldCreateUser: false`) → kodefelt → «Logg inn» (`verifyOtp({type:'email'})`). Mot staging via `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` i gitignorert `.env`.
2. *Hjem:* viser innlogget e-post + en banehandicap-beregning fra delt `lib/scoring` med hardkodede demo-inputs (f.eks. hcp-indeks 12.4, slope 128, CR 71.2, par 72 → verdien skal matche `calculateCourseHandicap`-testens fasit).

**Auth-klient:** `createClient` med `{ auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }` + `AppState`-lytter som kaller `startAutoRefresh`/`stopAutoRefresh`. SecureStore-herding er bevisst utsatt (senere etappe).

**Enhet:** dev bundle id `no.tornygolf.dev`, team `8C8WCW67J9`. Iterasjon i iOS-simulator; sluttbevis på fysisk iPhone (`npx expo run:ios --device` — Xcode-løypa er bevist på denne maskinen av #1281/#1282-øktene).

**Dokumentasjon:** kort runbook `docs/native/app-spike.md` (boot-kommandoer, env-oppsett, device-kjøring) i stil med `docs/native/ios-shell.md`.

## Edge Cases & Guardrails

- **Web-fredning er absolutt:** `git diff` mot main skal vise NULL endringer utenfor `native/app/`, `docs/native/` og `.forge/` — treffer spiken en hindring som «krever» web-endring, stopp og eskaler i stedet for å røre web.
  - *Sanksjonert unntak (bygge-runde 1):* én linje i rot-`tsconfig.json` — `"native"` lagt i `exclude`. Uten den forgifter React Natives globale typer (egen `FormData`) DOM-typene i hele web-programmet (fantom-TS2339 i `app/api/unsubscribe/product-update/route.ts`). Endringen berører kun typesjekk-scope, aldri runtime; rot-typecheck er verifisert grønn med den.
- Staging-koden valideres kun mot staging; ingen prod-URL noe sted i appen (grep-sjekk før commit).
- `.env` i `native/app/` gitignores; repoet er offentlig — aldri commit nøkler (anon-key er ok å bruke lokalt, men holdes ute av git likevel for vane-konsistens).
- Feil kode / utløpt kode i login-skjermen: vis Supabase-feilmeldingen enkelt — polish er ikke i scope.
- `lib/scoring`-testene skal IKKE endres eller dupliseres i appen (Type A-suiten eies av web-repoet; app-en konsumerer kun).

## Key Decisions

- **Deling via Metro watchFolders, ikke npm-workspaces** — beskytter Vercel-bygget fullstendig; workspace-konvertering revurderes i senere etappe hvis behovet oppstår.
- **AsyncStorage som session-lager** — dokumentert Supabase-standard; SecureStore-herding utsatt bevisst.
- **Egen dev bundle-id (`no.tornygolf.dev`)** — kolliderer ikke med TestFlight-skallet på eierens enhet.
- **Ingen changelog-notat:** intern/dev-only → commits prefixes `chore(native):` (ev. `docs:`), aldri feat/fix (ikke bruker-synlig).

**Claude's Discretion:**
- Expo SDK-versjon (nyeste stabile ved bygging), navigasjonsløsning (expo-router vs. minimal state — velg minst mulig for to skjermer), eksakt metro/tsconfig-mekanikk for alias-resolving, mappestruktur inni `native/app/`.

## Success Criteria

- [x] 1. `native/app/` bygger og kjører i iOS-simulator (skjermbilde-evidens av begge skjermer).
  - *Evidens (2026-08-30, runde 2, Xcode 26.6):* BUILD SUCCEEDED (Release, /tmp/xcb3.log); app installert og kjørt på iPhone 17 Pro-simulator (UDID 820CA940). Skjermbilder tatt i økta av både login- og hjem-skjermen (simulator-panelet, 10:52–10:55).
- [x] 2. Hjem-skjermen viser banehandicap beregnet av DELT kilde: import-sti i app-koden peker på `lib/scoring/` (fil:linje-evidens), ingen kopierte scoring-filer i `native/app/`, og verdien matcher `calculateCourseHandicap` for demo-inputene. I tillegg importeres `lib/scoring/index.ts` (eller tilsvarende modul med interne `@/`-imports) uten runtime-feil.
  - *Evidens:* `native/app/App.tsx:17-18` importerer `../../lib/scoring` (index, hele modus-grafen inkl. `@/lib/games/teamCaptain`-verdiimporten) og `../../lib/scoring/courseHandicap`; ingen scoring-kopier under `native/app/` (kun App.tsx/src/supabase.ts). Hjem-skjermen viser «Delt scoring-motor lastet: ✓» og banehandicap **13** for (12.4, 128, 71.2, 72) = formelens fasit (13.246 → 13). Skjermbilde 10:54.
- [x] 3. OTP-innlogging mot staging fungerer i appen: send kode → verifiser → Hjem viser innlogget e-post. Session overlever kill + relansering (evidens: skjermbilde etter relansering uten ny innlogging).
  - *Evidens:* e2e-spiller-adressen limt inn → «Send meg kode» (staging svarte; feil adresse ga tidligere korrekt «Signups not allowed for otp» — shouldCreateUser-gaten virker) → kode-steg → service-role-mintet kode tastet → Hjem viser «Innlogget som jlarssen90+e2eplayer@gmail.com». `simctl terminate` + relansering (PID 81418→81595) → rett inn på Hjem uten innlogging. Skjermbilder 10:54/10:55.
- [x] 4. Web er urørt: `git diff origin/main --stat` viser kun `native/app/`, `docs/native/`, `.forge/`; `npm run typecheck`, `npx vitest run lib/scoring` og `npm run build` er grønne fra repo-rota.
  - *Evidens (2026-08-30, bygge-runde 1):* diff-stat = `native/app/**` + `docs/native/app-spike.md` + `.forge/` + den sanksjonerte `tsconfig.json`-exclude-linja (se Guardrails). `npm run typecheck` exit 0; `npx vitest run lib/scoring` → 1176 passed (1176); `npm run build` exit 0 (full logg i øktas /tmp/webbuild.log).
- [ ] 5. Appen kjører på fysisk iPhone med bundle id `no.tornygolf.dev` (foto/skjermbilde-evidens; krever eier-assistanse med enheten — utilgjengelig enhet i økta → dokumentert `VERIFICATION GAP` + eier-tapptest som restanse, ikke stille hopp).
- [ ] 6. Runbook `docs/native/app-spike.md` finnes og kommandoene i den er kjørt som skrevet minst én gang.

## Gates

- [ ] `npm run typecheck` (repo-rot) grønt
- [ ] `npx vitest run lib/scoring` grønt (1176 tester — uendret antall)
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npm run build` (repo-rot) grønt før PR

## Files Likely Touched

- `native/app/**` — ny Expo-app (package.json, app-kode, metro.config.js, tsconfig.json, .gitignore)
- `docs/native/app-spike.md` — runbook
- `.forge/contracts/1818-native-n1-fundament-spike.md` — denne kontrakten

## Out of Scope

- Lokal DB / offline-kø (N2), spillerflater (N3+), push/deep links i Expo-appen (N7), EAS/TestFlight-distribusjon, SecureStore-herding, workspace-konvertering av repoet, enhver endring i web-appen, prod-tilgang, designsystem/polish i spike-skjermene.
- Deferred idé: pakke `lib/scoring` som ekte workspace-pakke med eget navn — kun hvis Metro-delingen viser seg skjør i senere etapper.
