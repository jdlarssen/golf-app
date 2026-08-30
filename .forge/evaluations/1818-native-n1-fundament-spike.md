# Evaluering: #1818 — Native N1 fundament-spike

**Evaluator:** fersk-kontekst skeptisk subagent, 2026-08-30
**Branch:** claude/app-performance-loading-8c9a87 (HEAD b2f5749c)
**Kontrakt:** `.forge/contracts/1818-native-n1-fundament-spike.md`

Skjermbilde-/eierbekreftelses-evidens (kriterium 1/3/5) finnes kun i hovedøktas
samtale og behandles som attestert per oppdraget; alle mekaniske spor er
etterprøvd uavhengig i denne økta.

## Mekanisk verifisering (kjørt i denne økta, Node v22.23.0)

| Port | Resultat |
|---|---|
| `npm run typecheck` (rot) | exit 0 ✓ |
| `npx vitest run lib/scoring` (rot, pipefail) | 1176 passed (1176), exit 0 ✓ |
| `npx tsc --noEmit` (native/app) | exit 0 ✓ |
| `npx expo export --platform ios` (native/app) | Bundlet OK: 666 moduler, index-*.hbc 2.2MB — delt lib/scoring-graf inkl. `@/`-alias resolver i Metro ✓ (dist/ slettet etterpå) |

## Per-kriterium status

1. **Simulator-bygg/kjøring — PASS (spor verifisert, skjermbilder attestert).**
   Binær `native/app/ios/build/Build/Products/Release-iphonesimulator/TrnyDev.app/TrnyDev`
   finnes (12.5MB, 2026-08-30 10:48); `grep -c "BUILD SUCCEEDED" /tmp/xcb3.log` = 1;
   `simctl listapps 820CA940-…` ga 2 tornygolf-treff (appen er installert på simulatoren).

2. **Delt scoring-kilde — PASS (fullt mekanisk verifisert).**
   `native/app/App.tsx:17-18` importerer `../../lib/scoring` (index/modus-grafen) og
   `../../lib/scoring/courseHandicap`. Ingen scoring-kopier: `git ls-files` + `find`
   (utenfor node_modules/ios) gir null treff på scoring/courseHandicap-filnavn; `src/`
   inneholder kun `supabase.ts`. Kjørte selv delt kilde:
   `calculateCourseHandicap({12.4, 128, 71.2, 72})` = **13** — matcher påstått
   skjermverdi. `expo export` beviser at hele grafen (inkl. interne `@/`-imports)
   bundler i Metro.

3. **OTP mot staging + session-persistens — PASS (attestert; kode-mekanikk verifisert).**
   `App.tsx` bruker `signInWithOtp({shouldCreateUser: false})` + `verifyOtp({type:'email'})`;
   `src/supabase.ts` har AsyncStorage-storage, `persistSession: true`,
   `detectSessionInUrl: false` og AppState-koblet start/stopAutoRefresh — nøyaktig
   kontraktens design. Selve innloggings-/relanserings-beviset er skjermbilder i
   hovedøkta (attestert).

4. **Web urørt + rot-porter grønne — PASS (fullt mekanisk verifisert).**
   `git diff origin/main...HEAD --stat` = kun `native/app/**`, `docs/native/app-spike.md`,
   `.forge/**` og den sanksjonerte énlinjeren i rot-`tsconfig.json`
   (`"exclude": ["node_modules"]` → `["node_modules", "native"]` — eksakt guardrail-unntaket).
   Typecheck + vitest grønne (over). Web-build-spor: `/tmp/webbuild.log` (10:22 i dag)
   ender i vellykket rutetabell.

5. **Fysisk iPhone — PASS (spor verifisert, eierbekreftelse attestert).**
   Binær `Release-iphoneos/TrnyDev.app/TrnyDev` finnes (6.25MB, 10:56);
   `grep -c "BUILD SUCCEEDED" /tmp/xcb-device.log` = 1; `CFBundleIdentifier` i BEGGE
   bygde Info.plist-er = `no.tornygolf.dev` (verifisert med PlistBuddy — matcher
   kontraktens dev-id, kolliderer ikke med TestFlight-skallets `no.tornygolf.app`).

6. **Runbook — PASS.** `docs/native/app-spike.md` finnes; kommandoene samsvarer med
   artefaktene: `-derivedDataPath build` matcher faktisk build-plassering,
   `npm run ios`-scriptet finnes i `native/app/package.json`, env-oppsettet peker på
   `.env.local` (som finnes og er gitignorert), OTP-mint-mønsteret matcher etablert
   staging-praksis, og fallgruve-notatene (Xcode 26.4+, pod-LANG, tsconfig-exclude)
   er konsistente med det som er bokført.

## Guardrail-sjekker

- Prod-URL-grep: eneste treff i app-kode er `"bundleIdentifier": "no.tornygolf.dev"`
  i `app.json` — eksplisitt OK per kontrakt/oppdrag. Ingen `tornygolf.no`-URL. ✓
- `git check-ignore native/app/.env.local` → ignorert ✓; ingen utrackede
  ikke-ignorerte filer under `native/app`. ✓
- `lib/scoring`-testene uendret (1176 — samme antall som fasit). ✓

## Funn (ingen blokkerende)

1. `native/app/.gitignore` + kriterium «Edge Cases & Guardrails (.env gitignores)» —
   **kosmetisk drift:** gitignore-mønsteret er `.env*.local`, så en bar `.env` ville
   IKKE vært ignorert. Filen som faktisk brukes er `.env.local` (ignorert), runbook
   og feilmelding i `src/supabase.ts` peker begge konsekvent på `.env.local`, og
   ingen `.env` finnes. Ikke-blokkerende; verdt en linje `.env` i gitignore i en
   senere etappe for robusthet (repoet er offentlig).
2. `.forge/contracts/1818-native-n1-fundament-spike.md` + seksjonen «Gates» —
   **kosmetisk:** gate-checkboksene står u-krysset mens suksesskriteriene er krysset.
   Alle fire gates er uansett verifisert grønne i denne evalueringa.

VERDIKT: ACCEPT
