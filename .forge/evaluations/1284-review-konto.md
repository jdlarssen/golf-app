# Evaluering: 1284-review-konto — runde 1

Fresh-context, skeptisk. Alt under er re-verifisert i denne økta i worktreet
`/Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/app-store-review-account-d88d17`
(Node v22.23.0). Bygget som kjørte på `http://localhost:3131` er bekreftet startet fra
DETTE worktreet (`lsof -a -p 13999 -d cwd` → worktree-rota), så live-observasjonene under
gjelder denne branchen.

Commits under evaluering: `2dc455fc` (kontrakt), `fa71279c` (rute), `b4b15562` (skript),
`560e1d13` (runbook), `7eed3812` (navn-konstant), `430989cc` (bokføring).
Arbeidstreet er rent (`git status --porcelain` tomt).

---

## Kriterium 1 — `/review-login` finnes, env-gatet, noindex, nåbar utlogget

**VERIFIED**

Egne funn:

- Live, uten cookies: `GET http://localhost:3131/en/review-login` → `status=200`, ingen
  redirect. Sida inneholder `<meta name="robots" content="noindex, nofollow"/>`,
  `id="review-email"` og `id="review-password"`. `GET /review-login` (norsk) → 200 med
  samme felter.
- Kontroll at auth-gaten faktisk står ellers: `GET /venner` utlogget →
  `status=307 loc=http://localhost:3131/login?next=%2Fvenner`. Altså er 200-en på
  `/review-login` PUBLIC_PATH_PATTERN-effekt, ikke en generelt åpen app.
- `proxy.ts:31-32`: `^\/(login|register|review-login)$|…`. Testes mot locale-strippet sti
  (`proxy.ts:218-220` `splitLocalePrefix`, `proxy.ts:270` `PUBLIC_PATH_PATTERN.test(barePathname)`),
  så `/en/review-login` dekkes. Grenen sletter `x-torny-user-id` før i18n-routing
  (`proxy.ts:271`) — header-strippingen følger med som kontrakten sier.
- Env-gaten: `page.tsx:58` `await connection()` står FØR `page.tsx:60-62`
  `if (!(process.env.REVIEW_ACCOUNT_EMAIL ?? '').trim()) notFound()`.
- Uavhengig bevis på at `connection()`-fiksen virker: den prerenderte shellen
  `.next/server/app/en/review-login.html` (8369 bytes) inneholder **verken**
  `id="review-email"` **eller** not-found-markører (`not-found|Fant ikke|404` → 0 treff).
  Beslutningen 404-vs-skjema er altså ikke bakt inn i shellen, men tas per request.
  Det er den egenskapen runbookens steg 2 hviler på.
- Action-ens egen usatt-env-gren er dekket av `actions.test.ts:73-83` (grønn).

VERIFIKASJONSGAP: jeg bootet ikke en server med `REVIEW_ACCOUNT_EMAIL` usatt for å se
404-en live. Shell-artefakten + `connection()`-plasseringen + unit-testen er indirekte,
men samstemte bevis.

## Kriterium 2 — kun `REVIEW_ACCOUNT_EMAIL`, identisk feilkode, rate-limit før auth

**VERIFIED**

Egne funn:

- `app/[locale]/(auth)/review-login/actions.ts:50-54`: `getClientIp()` →
  `consumeLoginRateLimit({ email, ip })` → `rate_limited`-redirect. Dette står FØR
  env-/adresse-sjekken (`:56-63`) og før `signInWithPassword` (`:66`). Rekkefølgen er
  altså: rate-limit → adresse-gate → auth. En angriper brenner bucket uansett adresse.
- `:61` `if (!expected || !email || !password || email !== expected)` →
  `review_failed`. Samme kode som `:68-73` (Supabase-feil) → `review_failed`.
  Ingen annen kode-vei ut av action-en.
- `:71` logger en statisk streng (`'[review-login] password sign-in rejected'`) — hverken
  passord eller Supabase-melding.
- `npx vitest run "app/[locale]/(auth)/review-login" "messages/"` → **Test Files 3 passed,
  Tests 10 passed**. Alle 6 review-login-testene grønne, inkludert
  `konsumerer rate-limit før auth-kallet…` som asserterer
  `consumeLoginRateLimitMock.mock.invocationCallOrder[0] < signInWithPasswordMock.mock.invocationCallOrder[0]`
  (`actions.test.ts:156-158`) — altså ekte rekkefølge-assertion, ikke bare «ble kalt».
- Live: feil passord ga
  `http://localhost:3131/review-login?email=applereview%2Bstaging%40tornygolf.no&error=review_failed`
  og bannerne `data-testid="review-login-error-review_failed"`.
- `?error=bogus` kollapser til `review-login-error-review_failed`
  (`page.tsx:77-81` + `lib/url/searchParams.ts:resolveErrorCode`) — ukjente koder lekker ikke.
- Terskler i runbooken stemmer med kilden: `lib/auth/loginRateLimit.ts:35-49`
  `emailMax = 5`, `ipMax = 10`, `windowSeconds = 15 * 60`.

## Kriterium 3 — provisjoneringsskriptet er idempotent

**VERIFIED** (kode + indirekte live-korroborering; ikke re-kjørt av meg)

Egne funn:

- `node --check scripts/provision-review-account.mjs` → exit 0.
- Idempotens-mekanikken lest linje for linje:
  - `:251-272` auth-bruker: `findAuthUserId` → `updateUserById({password, email_confirm})`
    hvis funnet, ellers `createUser`. `created`-flagget styrer bare sluttlinja.
  - `:299-361` demo-spillet: slås opp på `created_by = reviewUserId AND name = DEMO_GAME_NAME`,
    opprettes bare hvis fraværende.
  - `:364-452` roster: leses først, medspillere matches på navn, insert kun ved miss.
  - `:457` `delete().eq('game_id', …)` + `:492-494` re-insert → scores tilbake til kjent
    tilstand. `:497-526` nullstiller `status/started_at/ended_at/round_report` og alle
    leverings-/godkjennings-/uttreknings-felt.
- Trap 2 (0-rad-skriv = feil) er faktisk håndtert: `updateUserRow` (`:128-133`) kjeder
  `.select('id')` og kaster hvis `rows.length !== 1`; `ok()` (`:94-101`) kaster på enhver
  PostgREST-feil; `:358` og `:451` asserterer 1 rad på insertene.
- Prod-vakt (`:228-240`): staging-kjøring som peker på samme Supabase-URL som `.env.local`
  aborterer FØR første skriv. `--env prod` må skrives eksplisitt (`:192-206`), og
  mål-URL printes før skriv (`:242-247`).
- Korroborering fra min egen driver-kjøring: spillet revieweren havnet i har id
  `488a4819-d1aa-465f-9e39-1a4c1acc3f55` — samme id kontrakten siterer fra kjøring 1 OG 2,
  med Emma/Jonas/Nora i roster og fortsettelse på hull 4. Konsistent med at gjenkjøringen
  gjenbrukte spillet i stedet for å lage et nytt.

VERIFIKASJONSGAP: jeg kjørte ikke skriptet selv (ville skrevet til staging uten behov).
Idempotensen er verifisert ved kodelesing + at DB-tilstanden matcher det kontrakten
hevder etter to kjøringer.

## Kriterium 4 — staging ende-til-ende

**VERIFIED** (re-kjørt av meg)

`REVIEW_ACCOUNT_EMAIL=applereview+staging@tornygolf.no … BASE_URL=http://localhost:3131
node --input-type=module --eval "$(cat review-login-driver.mjs)"`:

```
PASS  skjema-utlogget                 email+password-felt, robots="noindex, nofollow"
PASS  feil-passord-generisk-feil      /review-login?email=…&error=review_failed
PASS  innlogget-ser-demo-spill        url=http://localhost:3131/en demoSynlig=true
PASS  spill-flate-viser-roster        /en/games/488a4819-…/holes/4
PASS  prod-vakt-kun-staging-supabase  ingen fremmede hosts
FAIL  feillogg-tom                    404 http://localhost:3131/en/_vercel/insights/script.js
```

Den ene FAIL-en er `_vercel/insights/script.js` — et kjent `next start`-lokalt artefakt
(Vercel injiserer scriptet først i deployet miljø). Ingen andre console-errors, ingen
failed requests, ingen fremmede Supabase-hosts (prod-vakten i driveren så kun
`snwmueecmfqqdurxedxv`).

Merk at innloggingen landet på `/en` (ikke `/`) — `users.locale = 'en'` fra skriptet
virker, revieweren får engelsk UI. Locale overlever også feil-redirecten: `/en/review-login`
setter `set-cookie: NEXT_LOCALE=en`, og et påfølgende `GET /review-login?error=review_failed`
med den cookien svarer `307 → /en/review-login?error=review_failed` (verifisert med curl).
Så en engelsk reviewer som taster feil havner ikke på norsk side.

PR-bevis: `gh pr list` → PR **#1813**, OPEN, draft, label `staging-verified`.
`gh api …/issues/1813/comments` → kommentar `5465782884` fra `jdlarssen`,
«## ✅ Staging-verifisert … (`snwmueecmfqqdurxedxv`) … Playwright mot en produksjonsbygget
server fra PR-branchen». Begge deler finnes.

## Kriterium 5 — runbook-dokumentet finnes og er følgbart

**VERIFIED med MINOR** (se F1)

- `docs/native/app-store-review-konto.md`, 176 linjer. Innholder sikkerhetsmodell (:20-39),
  fire eier-steg (:41-98), reset-seksjon (:100-118), demo-data (:120-128),
  engelsk ASC-notes-mal (:130-166), «ikke i repoet» (:168-176).
- Navigasjonsstier er eksakte: «Vercel → prosjektet `golf-app` → Settings → Environment
  Variables» (:56), «App Store Connect → appen → App Review Information» (:93).
  Kommandoene er kopier-lim-klare og har `source ~/.nvm/nvm.sh && nvm use 22` med
  (:76, :107). Hvert steg har «Forventet resultat» (:66-69, :86-89, :115).
- Steg 2 sier eksplisitt at env-varen krever redeploy (:62-64) — korrekt for Vercel og
  nødvendig, siden `connection()` bare gjør beslutningen request-time, ikke deploy-fri.
- ASC-malen er faktuelt riktig mot appen:
  - `/en/review-login` (:141) → live `status=200` med skjema. ✔
  - `/en/demo` (:162) → live `status=200`; ruta finnes (`app/[locale]/demo`) og står i
    `PUBLIC_PATH_PATTERN`s `demo`-alternasjon. ✔
  - «holes 1-6 … co-players, 1-3 review account» (:148-150) stemmer med
    `SCORE_OFFSETS` (`scripts/provision-review-account.mjs:46-51`). ✔
  - «Scores: 21» (:87) = 3 + 6 + 6 + 6. «Spillere: 4» = review + 3 gjester. ✔
- Feil: linje :122 sier kontonavnet er «App Reviewer». Skriptet setter «Alex Reviewer»
  (`scripts/provision-review-account.mjs:29`, endret i `7eed3812`). Se F1.

## Kriterium 6 — gates grønne

**VERIFIED** (egne kjøringer)

- `npx vitest run "app/[locale]/(auth)/review-login" "messages/"` → `Test Files 3 passed (3)`,
  `Tests 10 passed (10)`. Filene: `actions.test.ts` (6), `messages/catalogParity.test.ts` (2),
  `messages/apostropheParity.test.ts` (2). Ingen unhandled errors i output.
- `npm run lint` → `LINT_EXIT=0`, `✖ 52 problems (0 errors, 52 warnings)`. Alle 52
  warnings er pre-eksisterende complexity/max-depth i `lib/notifications/`,
  `lib/scoring/`, `lib/wizard/` — ingen i de nye filene.
- `node --check scripts/provision-review-account.mjs` → exit 0.
- `npm run build` ikke re-kjørt per instruks. Indirekte korroborering: `.next/`-artefaktene
  i worktreet er bygget fra denne branchen (serveren på :3131 kjører dem og svarer riktig
  på alle nye ruter), og `prerender-manifest.json` har `/[locale]/review-login` under
  `dynamicRoutes` med `/en/review-login` + `/no/review-login` prerendret som shells.

---

## Sikkerhetsvurdering

**Generisk feil / ingen konto-orakel — REELL.** Alle tre tilfellene (usatt env, feil/ukjent
adresse, feil passord) ender på nøyaktig samme redirect-kode `review_failed`
(`actions.ts:61-63` og `:68-73`), og siden mapper koden til én streng
(`messages/no.json` `auth.reviewLogin.errors.review_failed` = «Feil e-post eller passord.»).
Testene asserterer likheten direkte (`actions.test.ts:104-106`). Ukjent `?error=`-verdi
kollapser også til `review_failed`, så URL-fikling gir ingen ny informasjon.
`rate_limited` er den ene koden som skiller seg ut — den lekker ingenting om kontoen,
bare at kvoten er brukt opp. Én reell, liten sidekanal gjenstår, se F4.

**Rate-limit før auth — JA.** `actions.ts:50-51` er de første linjene etter feltlesingen;
`signInWithPassword` skjer først på `:66`. Bekreftet med rekkefølge-assertion i test
(`invocationCallOrder`), ikke bare kall-telling. Bucketene er de samme som `/login`
(`login:email:<email>`, `login:ip:<ip>`, 5/10 per 15 min) — bevisst per kontrakt.
Arvet egenskap verdt å kjenne: `consumeLoginRateLimit` **fail-open**-er ved DB-feil
(`lib/auth/loginRateLimit.ts:66-72, 77-80`). Ikke innført her, men det betyr at
rate-limiten ikke er en hard garanti under en `admin_action_rate_limit`-utfall.

**Nåbar utlogget — JA, og bare denne ruta.** Verifisert live (200 uten cookies) med
kontroll (`/venner` → 307). PUBLIC-grenen sletter `x-torny-user-id`, så den nye offentlige
stien kan ikke brukes til å spoofe verifisert-bruker-headeren.

**Hemmeligheter i repoet — INGEN.**
- `git grep -iE "applereview|REVIEW_ACCOUNT_PASSWORD="` gir bare 4 treff, alle
  plassholdere/instruksjoner: `docs/native/app-store-review-konto.md:78,109` (`'<passordet…>'`)
  og `scripts/provision-review-account.mjs:6,213` (bruksmelding). Ingen `applereview`-treff.
- Grep etter selve staging-passordet (innholdet i scratchpad-fila, uten å printe det) i hele
  det committede treet: ingen treff.
- Grep etter `*review*@tornygolf.no`: ingen treff.
- Sporede env-filer: kun `.env.example` (som ikke nevner review-kontoen i det hele tatt).
  `.gitignore:37` `.env*.local` dekker `.env.local` og `.env.staging.local` — begge
  usporet. Arbeidstreet er rent, så ingenting ligger og venter på å bli committet.
- Skriptet printer aldri passordet: eneste console-linjer om det er lengde-advarselen
  (`:217-219`, printer kun antall tegn) og sluttlinja `:543` som eksplisitt sier at
  passordet ikke står der.

**Kan en vanlig bruker få passord-innlogging? NEI.**
- `signInWithPassword` finnes ett eneste sted i produktkode: `actions.ts:66`, bak
  `email !== expected`-gaten.
- Eneste sted et passord settes på en bruker er provisjoneringsskriptet
  (`:255-257` `updateUserById({password})`, `:262-265` `createUser({password})`).
  De to andre `updateUserById`/`createUser`-kallene i repoet setter INGEN passord:
  `app/[locale]/admin/spillere/[id]/actions.ts:101-104` (kun `{ email }`) og
  `e2e/_helpers/games.ts:779-782` (kun `{ email, email_confirm }`).
  Eksisterende brukere har altså ikke noe passord å logge inn med, akkurat som
  kontrakten forutsetter.

**Eskalerer review-kontoen? NEI.** `grep -n "is_admin" scripts/provision-review-account.mjs`
→ ingen treff; skriptet rører aldri feltet. Kolonnen er
`is_admin boolean not null default false` (`supabase/migrations/0001_initial_schema.sql:8`),
så en ny konto får `false`. Ved gjenkjøring settes bare navn/hcp/locale/`is_guest: false`/
`deleted_at: null` (`:282-293`) — `is_admin` er ikke i patchen og kan ikke flippes.
Skriptet gir heller ingen klubb-/liga-/cup-medlemskap, og action-en har ingen
invitasjons-side-effekter (til forskjell fra `verifyCode`), så en reviewer kan ikke dra
med seg tilganger inn.

**Meldings-paritet no/en — JA.** `messages/catalogParity.test.ts > en.json has exactly the
same leaf keys as no.json` er grønn i min kjøring. Diffen viser identiske nøkkelsett under
`auth.reviewLogin` (metaTitle, heading, intro, emailLabel, passwordLabel, submit,
errors.review_failed, errors.rate_limited) i begge katalogene.

---

## Funn

| # | Signatur (fil + kriterium) | Alvorlighet | Beskrivelse |
|---|---|---|---|
| F1 | `docs/native/app-store-review-konto.md:122` + kriterium 5 (runbook følgbar/korrekt) | MINOR | Runbooken sier kontoens navn er «App Reviewer». Kilden er `scripts/provision-review-account.mjs:29` `REVIEW_USER_NAME = 'Alex Reviewer'` — endret i `7eed3812` uten at dokumentet fulgte med. Eieren som leser «Demo-dataene revieweren møter» får feil forventning, og ASC-notes-malen ville sagt feil navn hvis den senere utvides med det. To hjem for én regel (AGENTS.md trap 4). Fiks: én ordendring i :122, eller la runbooken si «navnet i `REVIEW_USER_NAME`». |
| F2 | `.env.example` + kriterium 1 (env-gate oppdagbar) | MINOR | `REVIEW_ACCOUNT_EMAIL` er ikke dokumentert i `.env.example` (`grep -c "REVIEW_ACCOUNT" .env.example` → 0). Fila er repoets env-katalog; den nye server-only-varen er kun oppdagbar fra runbooken og en proxy-kommentar. En fremtidig økt som setter opp et nytt miljø ser den ikke. Fiks: én kommentert linje `# REVIEW_ACCOUNT_EMAIL=  # App Store-review-konto (#1284) — settes i Vercel, se docs/native/app-store-review-konto.md`. |
| F3 | `app/[locale]/(auth)/review-login/page.tsx:25-31` + kriterium 1 (env-gate = «finnes ikke») | NIT | `generateMetadata` kaller ikke `connection()`, så tittelen bakes inn i den statiske shellen: `.next/server/app/en/review-login.html` inneholder `<title>Sign in with password – Tørny</title>` også når env-gaten senere 404-er. En 404-respons med den tittelen røper at ruta finnes. Kosmetisk her — repoet er public og ruta står i runbooken, så stien er ikke hemmelig. Ingen handling påkrevd. |
| F4 | `app/[locale]/(auth)/review-login/actions.ts:61-66` + sikkerhet (ingen konto-orakel) | NIT | Timing-sidekanal: feil adresse returnerer uten nettverkskall, riktig adresse med feil passord gjør en GoTrue-rundtur. Målbar latensforskjell er i prinsippet et adresse-orakel, selv om feilkoden er identisk. Dempet av at rate-limiten konsumeres FØR forgreningen (5 forsøk per adresse / 15 min gir svært få målepunkter) og av at adressen er én fast alias. Kontraktens krav (identisk feilkode) holder. Ingen handling anbefalt — en konstant-tid-gate ville kreve et dummy-auth-kall og gjøre koden verre for lite. |
| F5 | Supabase `/auth/v1/token?grant_type=password` + sikkerhet (rate-limit) | NIT (informativ) | `consumeLoginRateLimit` beskytter kun app-ruta. GoTrue-endepunktet er nåbart direkte med anon-nøkkelen og omgår våre buckets helt; kun Supabase sine egne /token-grenser gjelder der. Kontrakten anerkjenner dette eksplisitt («Supabase egne /token-limits»), og det bærende tiltaket er passordstyrken — skriptet advarer under 24 tegn (`:216-220`) og runbooken :37 krever ≥24. Ikke en defekt i dette arbeidet, men det er dette som faktisk holder kontoen trygg, ikke app-rate-limiten. |
| F6 | `scripts/provision-review-account.mjs:139` + kriterium 3 (idempotens) | NIT | `findAuthUserId` bruker `.ilike('email', email)` — adressen brukes som LIKE-mønster. En adresse med `_` (lovlig i local-part) eller `%` ville matche bredere enn tiltenkt og kunne treffe feil bruker. Input er operatør-kontrollert, så risikoen er lav. Fiks om noen er inne i fila: `.eq('email', email)` (adressen er allerede lowercased på :208) eller filtrer etter `listUsers`. |

Ingen BLOCKER.

---

## Hva jeg ikke kunne verifisere

- **Live 404 med usatt `REVIEW_ACCOUNT_EMAIL`.** Serveren på :3131 kjører med varen satt,
  og jeg ville ikke starte en ny server. Verifisert indirekte (tom prerender-shell +
  `connection()`-plassering + unit-test), som til sammen er sterkt, men ikke en direkte
  404-observasjon.
- **Skriptets idempotens ved egen re-kjøring.** Verifisert ved kodelesing + at
  DB-tilstanden driveren møtte matcher kontraktens beskrivelse etter to kjøringer
  (samme spill-id `488a4819`, hull 4, samme tre gjester).
- **`npm run build`.** Ikke kjørt per instruks. `.next`-artefaktene fra branchens bygg er
  inspisert som erstatning.
- **Prod.** Ikke rørt. Prod-provisjonering er eksplisitt utenfor scope for denne kontrakten
  og er eier-gatet.

---

VERDIKT: ACCEPT
