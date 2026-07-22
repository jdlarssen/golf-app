# Evaluation: #1277 — Serv /.well-known/-filene forbi auth-proxyen

**Builder+evaluator:** Nattkjøreren (#1079), Opus-bygg
**Contract:** issue-kommentar #1277 + `.forge/contracts/1277-well-known-forbi-proxyen.md`
**Branch:** `claude/natt-1277-well-known` fra `origin/main@fffe3f3`

## Runde 1 — implement → gates → self-evaluate → ACCEPT

Én runde. Bygget mot kontrakten uten funn som krevde omarbeid.

### Endringer

| Fil | Endring |
|-----|---------|
| `app/.well-known/assetlinks.json/route.ts` | NY — GET returnerer placeholder-assetlinks (gyldig android_app-form), `application/json`, `Cache-Control: public, max-age=300`. |
| `app/.well-known/apple-app-site-association/route.ts` | NY — GET returnerer placeholder-AASA (applinks/details/appIDs), extensionless, `application/json`. |
| `proxy.ts` | Matcher-unntak `\.well-known` (samme mekanisme som `sitemap\.xml`) + www→apex host-kanonisering (308) øverst i `proxy()`. |
| `e2e/public/well-known.spec.ts` | NY — 2 request-context @gate-specs (ingen login): 200 + `application/json` + parsebar form. |

### Suksesskriterier — verifisert

| # | Kriterium | Bevis | Resultat |
|---|-----------|-------|----------|
| 1 | Begge `.well-known/`-stier: 200 + `application/json`, GET + HEAD (lokalt, uinnlogget) | `curl -sS -i` og `-I` mot dev-server (port 3100): begge 200, `content-type: application/json`, GET og HEAD identisk. | PASS |
| 2 | Lekkasje-sjekk: `/.well-known/../profile` gir ikke app-innhold; `/profile` uinnlogget 307-er til `/login` | `curl --path-as-is …/.well-known/../profile` → 307 `location: /login?next=%2Fprofile`; `/profile` → 307 til login; `/.well-known/does-not-exist` → 404. | PASS |
| 3 | Playwright `e2e/public/well-known.spec.ts` grønn (@gate) | `npm run e2e:gate`: begge specs grønne (96ms / 55ms). | PASS |
| 4 | Proxy inneholder host-kanonisering med `.well-known`/`api`-immunitet | Kodegjennomlesing + live: `Host: www.tornygolf.no` på `/spillformater` → 308 `location: https://tornygolf.no/spillformater` (ingen port); samme host på `/.well-known/assetlinks.json` → 200 direkte (matcher ekskluderer, proxy kjører ikke); `/api/...` → 405 (ingen www-redirect). | PASS |
| 5 | Prod curl-matrise (begge filer × begge verter = 200) | Kan ikke verifiseres i natt-bygget — krever deploy + eier-steg i Vercel-dashboardet (www-domenet fra «Redirect» til «serve production»). PR merket `needs-manual-qa` med denne matrisen navngitt. | DEFERRED (manuell QA) |

### Gates

| Gate | Kommando | Resultat |
|------|----------|----------|
| Types | `npm run typecheck` | exit 0 (clean) |
| Lint | `npx eslint proxy.ts app/.well-known/**/*.ts e2e/public/well-known.spec.ts` | exit 0, 0 errors |
| Build | `npm run build` | exit 0; begge `.well-known`-ruter registrert i `app-paths-manifest.json` |
| e2e (berørt flyt) | `npm run e2e:gate` (well-known-specs) | 2/2 grønne |

**Grønn-main-gate (Steg 2.2, én gang ved start):** `npm ci` + typecheck + `npm test` (4963/4963) + lint (0 errors) + `guard.test.sh` (39/0) — alt grønt på `origin/main@fffe3f3`.

### Note: urelaterte e2e-feil (ikke fra denne diffen)

Full `npm run e2e:gate` viste 6 passed / 7 failed. De 7 røde er alle seedede staging-flyter
(cup, lifecycle-validate, scoring-golden-path, solo-roster, liga-UI-flight, manual-approval,
self-withdraw), alle `toBeVisible()`-timeouts — én renderer en 404-side (seedet game-rad
fraværende). Diffen kan ikke nå disse: host-kanoniseringen kjører kun på `Host ===
www.tornygolf.no` (e2e bruker localhost), og matcher-unntaket fjerner kun `.well-known`-stier.
`invitation-flow` @gate (live OTP + game-navigasjon) passerte, som beviser at ruting er
uendret. Flagget som staging-helse (CI-vaktas domene), ikke en regresjon her.

## Verdict

**ACCEPT** — alle byggbare suksesskriterier grønne; kriterium 5 er deferred til eier-QA
(deploy-avhengig) per kontrakt.
