# Evaluering: #1434 — Mail-kvote skilles fra 60-sekunders-throttlen

**Dato:** 2026-08-07
**Verdikt:** ACCEPT
**Commit evaluert:** 6affd82e (`fix(auth): honest login copy when the project-wide mail quota is hit`)
**Branch:** claude/rebase-after-1499-4bdbd0 — HEAD (cdd0e424) avviker fra 6affd82e kun med
kontraktfilen (`git diff --stat 6affd82e..HEAD` → 1 fil, `.forge/contracts/…`), og
arbeidstreet var rent. All verifisering under kjørte altså mot nøyaktig fikscommitens
produktkode. Uavhengig verifisert — alle kommandoer kjørt på nytt i denne økten.

## Per kriterium

### 1. Type A-test: kvote fra steg 1 → `rate_limited_quota` uten verify-parkering — PASS

Kommando: `npx vitest run "app/[locale]/(auth)/login/actions.test.ts" --reporter=verbose` (Node 22)

```
✓ sendCode — rate-limit > maps the project-wide mail quota to rate_limited_quota WITHOUT verify-parking (#1434)
```

Testen (actions.test.ts:455) asserter eksakt redirect
`/login?email=kompis%40example.com&error=rate_limited_quota` — ingen `step=verify`.

### 2. Kvote fra `from=verify` → verify-steget via errorCtx — PASS

Samme kjøring:

```
✓ sendCode — rate-limit > quota hit from «Send ny kode» (from=verify) stays on the verify step via errorCtx (#1434)
```

Testen (actions.test.ts:475) asserter
`/login?step=verify&email=kompis%40example.com&error=rate_limited_quota`.

### 3. Eksisterende throttle-test uendret og grønn — PASS

`git show 6affd82e -- "app/[locale]/(auth)/login/actions.test.ts"` viser KUN tillegg
(de to nye testene etter linje 452) — throttle-testen på actions.test.ts:433 («maps the
Supabase 60-second throttle to rate_limited_minute and keeps the user on the verify step
(#1347)») er ikke berørt av diffen. Grønn i samme verbose-kjøring:

```
✓ sendCode — rate-limit > maps the Supabase 60-second throttle to rate_limited_minute and keeps the user on the verify step (#1347)
```

Full suite: `npx vitest run "app/[locale]/(auth)/login"` → **4 filer, 40/40 passed**.

### 4. Render av ny copy på begge steg + unknown-fallback — PASS

Uavhengig curl mot kjørende dev-server (staging, http://localhost:3000):

```
curl -s "http://localhost:3000/login?error=rate_limited_quota&email=x@y.no" | grep -c "Vi får ikke sendt flere koder akkurat nå"   → 1
curl -s "http://localhost:3000/login?step=verify&error=rate_limited_quota&email=x@y.no" | grep -c "Vi får ikke sendt flere koder akkurat nå" → 1
curl -s "http://localhost:3000/login?error=tull&email=x@y.no" | grep -c "Noe gikk galt"  → 1
```

Ny copy rendres på steg 1 OG verify-steget; ukjent kode faller fortsatt til
«Noe gikk galt»-fallbacken (negativ kontroll).

### 5. Nøkkel i begge locales + catalogParity — PASS

Kommando: `npx vitest run messages/catalogParity.test.ts` (Node 22)

```
Test Files  1 passed (1)
Tests  2 passed (2)
```

`grep -n '"rate_limited_quota"'`:
- `messages/no.json:2992` — «Vi får ikke sendt flere koder akkurat nå. Prøv igjen senere.»
- `messages/en.json:2992` — "We can't send more codes right now. Try again later."

### 6. Lint + union/KNOWN_ERROR_CODES-konsistens — PASS

Kommando: `npm run lint` → `✖ 56 problems (0 errors, 56 warnings)` — 0 errors,
warnings er pre-eksisterende (complexity/max-depth i urelaterte filer).

Kodesjekk (per evaluerings-instruks; byggerens `npm run build` EXIT 0 ikke re-kjørt):
- `actions.ts:138` — `'rate_limited_quota'` i code-unionen.
- `page.tsx:44` — `'rate_limited_quota'` i `KNOWN_ERROR_CODES`.

## Kontrakt-spesifikke feller — alle sjekket, ingen funn

- **Rekkefølge:** kvote-sjekken ligger på `actions.ts:143`, FØR den generelle
  heuristikken (`else if` på :150) — heuristikkens `msg.includes('rate')` kan ikke
  sluke kvote-strengen. Bekreftet av kommentaren OG av test 1 (kvote-strengen
  inneholder «rate» og treffer likevel `rate_limited_quota`).
- **#1347-fredningen:** ingen eksisterende gren fjernet eller smalnet — heuristikkens
  betingelse er ordrett uendret, kun flyttet bak en mer spesifikk gren.
  `user_not_found`-grenen og `rate_limited_minute`-parkeringen (:201–203) er identiske;
  eneste endring der er en tilleggs-kommentar om `over_request_rate_limit`-impostoren
  (kontraktens design-punkt 4, levert).
- **Ingen step-overstyring:** kvote-grenen faller gjennom til plain
  `loginErrorRedirect(code, errorCtx)` (`actions.ts:205`) — verify kun når
  `from=verify` satte den i errorCtx (test 2 beviser stien).
- **#361-oppslaget:** gated på `code === 'user_not_found'` (`actions.ts:174`) —
  `rate_limited_quota` kan ikke treffe expired-invite-oppslaget.
- **Copy lover ikke tidspunkt:** «Prøv igjen senere» / "Try again later" — ingen
  minutt-løfte.
- **Egen-bucketen uberørt:** `rate_limited`-testene (15-min-copy) grønne i samme
  kjøring; `consumeLoginRateLimit`-stien ikke rørt av diffen.
- **Versjonering:** patch-bump 1.227.6 → 1.227.7 + én Feilrettinger-linje i CHANGELOG
  (bruker-synlig fix) — riktig bump-type for `fix`.

## Konklusjon

Alle 6 suksesskriterier PASS, alle kontrakt-feller sjekket uten funn. ACCEPT.
