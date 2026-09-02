# Spec: Native — tapp-innlogging som testbruker i Tørny Dev (staging)

Issue: #1923 · Spec-økt 2026-09-02 (Fable) · Bygges i egen lokal Opus-økt på eierens Mac
(to-økters-mønsteret; trenger `.env.staging.local`, `native/app/.env.local` og telefonen).
Eier-designnotat: `docs/superpowers/specs/2026-09-02-dev-login-testbrukere-design.md`.

## Problem

Eieren tester native-appen («Tørny Dev», `native/app`, bundle `no.tornygolf.dev`) på fysisk
iPhone flere ganger om dagen. Innloggingen er OTP-kode på e-post (`Login.tsx`), og den er en
blindvei for testing: stagings innebygde SMTP går på time-taket etter noen få koder («email
rate limit exceeded»), GoTrue nekter å sende til `@torny-e2e.invalid`, og nødløsningen —
sesjon skrevet rett inn i AsyncStorage over kabel (`docs/native/app-spike.md` «Logg inn på
test-enhet uten e-post») — krever at en økt sitter ved Mac-en med telefonen ulåst.

Eierbestilling 2026-09-02: «trykk på kontoen jeg skal logge inn på, og så er jeg logget inn»,
en fast gjeng standard testbrukere, og en rutine som gjør at økter som vil ha eieren til å
teste som en bestemt bruker kan legge den til raskt.

## Research Findings (verifisert 2026-09-02 mot main `f6f503d4` + staging)

- **Passord-innlogging er alt på i begge Supabase-prosjekter.** Webben bruker
  `signInWithPassword` for App Store-review-kontoen (`app/[locale]/(auth)/review-login/`,
  #1284). Probe mot staging (`POST /auth/v1/token?grant_type=password` med ukjent bruker)
  svarte `400 invalid_credentials` — altså aktivert provider, ikke «Email logins are
  disabled». `@example.test`- og `@torny-e2e.invalid`-adresser passerer formatvalideringen
  (brukere med disse finnes på staging; kun *sending* av e-post nektes).
- **Appens auth-klient** (`native/app/src/supabase.ts`): AsyncStorage-sesjon,
  `persistSession`, `detectSessionInUrl: false`. `App.tsx` lytter på `onAuthStateChange` og
  bytter selv til navigasjons-stacken når en sesjon kommer — `Login.tsx` navigerer aldri.
  `signInWithPassword` utløser samme `SIGNED_IN`-hendelse som `verifyOtp`.
- **Expo-env:** `EXPO_PUBLIC_*` inlines av Metro ved bundling (også `expo run:ios
  --configuration Release`, som er eierens telefonbygg), MEN kun ved *bokstavelig*
  `process.env.EXPO_PUBLIC_NAVN`-tilgang — aldri `process.env[navn]` eller destrukturering
  (docs.expo.dev/guides/environment-variables, hentet 2026-09-02). Expo CLI leser
  `native/app/.env.local` (gitignorert). I jest er `process.env` en vanlig runtime-lesing
  (`supabaseMock.ts` finnes nettopp fordi den ekte modulen kaster uten env i test).
  Verdiene ligger i klartekst i bundelen — derfor skal passordet bare finnes i staging.
- **`__DEV__` duger IKKE som gate:** eierens telefonbygg er Release (`__DEV__ === false`).
  Gaten må stå på env + vert.
- **Supabase Storage:** `sponsor-logos` er repoets eneste bucket (migrasjon 0143, public,
  lesing via `/storage/v1/object/public/<bucket>/<path>` uten policy). storage-js 2.105.4
  (rot-`node_modules`): `createBucket(id, { public, fileSizeLimit, allowedMimeTypes })`,
  `upload(path, body, { upsert, contentType, cacheControl })`. `cacheControl` = «sekunder
  cachet i nettleser OG Supabase-CDN, `Cache-Control: max-age=<s>`, default 3600»
  (JSDoc i `dist/index.d.mts`). Free-tier har ikke Smart CDN (auto-invalidering) — så
  fila MÅ lastes opp med `cacheControl: '0'`, og appen MÅ hente med cache-buster i
  query-strengen. Staging har i dag kun `sponsor-logos`; prod har kun `sponsor-logos`
  (begge lest 2026-09-02). Ingen `dev-login`-bucket finnes noe sted.
- **Eksisterende testbrukere på staging** (`public.users` lest 2026-09-02): Kari Arrangør
  `torny+tapptest1909-arrangor@example.test`, Ola Kompis `torny+tapptest1909-kompis@example.test`,
  Testspiller Tapp `torny+tapptest1909-spiller@example.test` (alle hcp 18, gender tom,
  `profile_completed_at` NULL — halvferdige profiler fra #1909-tapptesten), pluss e2e-kontoene
  Test Admin (`E2E_ADMIN_EMAIL`, is_admin, hcp 12) og Test Spiller (`E2E_PLAYER_EMAIL`, hcp 18).
  E2e-adressene er eierens Gmail med plusstagg — se Key Decisions for hvorfor de IKKE går i lista.
- **Provisjonerings-mønsteret finnes:** `scripts/provision-review-account.mjs` (#1284) har
  `loadEnv`, `findAuthUserId` (users-rad → `listUsers`-fallback), `waitForUsersRow`
  (trigger lager `public.users`-raden etter `auth.admin.createUser`), `updateUserRow`, og
  passord-rotasjon via `auth.admin.updateUserById({ password, email_confirm: true })`.
  Komplett profil = `name, hcp_index, handicap_updated_at, profile_completed_at, gender
  ('mens'), level ('normal'), is_guest, deleted_at: null`.
- **Lokal base på enheten:** `torny.db` er IKKE bruker-skopet. `wipeLocalData()`
  (`native/app/src/data/db.ts`, #1876) tømmer `scores`, `sync_queue`, `conflicts`,
  `cache_entries` i én transaksjon og er trygg under drain. «Logg ut» wiper i dag ikke
  (#1877, åpen).
- **Test-rigg:** jest-expo i `native/app/` (`jest.config.js`: expo-sqlite → better-sqlite3,
  `@/*` → repo-rot, TZ=UTC). `src/test/supabaseMock.ts` har `auth.getSession`/`signOut`
  (additivt utvidbar). Render-tester bruker `@testing-library/react-native` +
  `testID` (mønster: `screens/Account.test.tsx`).
- **Tema-primitiver** (`native/app/src/theme.ts`, `useTheme()`): `ui.sectionTitle`,
  `ui.buttonSecondary`/`buttonSecondaryText` (minHeight `TAP` = 44), `ui.badge`/`badgeText`,
  `ui.muted`, `ui.error`. Aldri `fontWeight` oppå `FONTS`-familier.
- **CHANGELOG-praksis for native:** alle `feat(native)`/`fix(native)`-commits til nå bruker
  `[no-changelog]` (appen er ikke i butikk; changeloggen er webbens). Samme her.

## Prior Decisions (videreført)

- Native-appen er målet, web er døråpner (#1816). Testing skjer på staging, aldri prod.
- Eier-tapptest på fysisk iPhone er det avgjørende beviset for app-endringer (N3–N6-presedens).
- Auth-/sikkerhetsendringer auto-merges aldri (CLAUDE.md «Aldri auto-merge») — PR-en venter på
  eieren.
- Repoet er offentlig: aldri e-poster til ekte personer eller nøkler i commits.
- Fable = spec-økter, Opus = bygge-økter (eierregel 2026-08-31).

## Eierbeslutninger (2026-09-02, denne økta)

1. **Rollebesetning A:** én arrangør + tre spillere + én admin = fem knapper.
2. **Lista bor i staging** (alternativ 1), ikke i app-koden: en økt som legger til en bruker
   skal se den i appen uten nytt bygg.
3. Designet (fire seksjoner: det du ser · det bak · rutinen · testing/levering) godkjent «ja».

## Design

### 1. Datakontrakt — `users.json` i bucket `dev-login` (kun staging)

```json
{
  "version": 1,
  "updatedAt": "2026-09-03T08:00:00.000Z",
  "users": [
    { "email": "torny+dev-admin@example.test",              "label": "Anne Admin",       "role": "admin",    "origin": "cast" },
    { "email": "torny+tapptest1909-arrangor@example.test",  "label": "Kari Arrangør",    "role": "arrangor", "origin": "cast" },
    { "email": "torny+tapptest1909-kompis@example.test",    "label": "Ola Kompis",       "role": "spiller",  "origin": "cast" },
    { "email": "torny+dev-putter@example.test",             "label": "Per Putter",       "role": "spiller",  "origin": "cast" },
    { "email": "torny+tapptest1909-spiller@example.test",   "label": "Testspiller Tapp", "role": "spiller",  "origin": "cast" },
    { "email": "torny+dev-nina@example.test", "label": "Nina Ny", "role": "spiller", "origin": "#1930", "addedAt": "2026-09-05T10:12:00.000Z" }
  ]
}
```

- `role`: `admin | arrangor | spiller`. Vises som merkelapp «Admin» / «Arrangør» / «Spiller».
  `admin` = `users.is_admin = true`; `arrangor` er bare en merkelapp (alle brukere kan
  opprette spill) — den sier hvem eieren skal *bruke* som arrangør i et testspill.
- Rekkefølge = rekkefølgen appen viser. Skriptet garanterer rollebesetningen først, i fast
  rekkefølge, deretter ekstra brukere etter `addedAt`.
- Bucket: `dev-login`, `public: true`, `allowedMimeTypes: ['application/json']`,
  `fileSizeLimit: 65536`. Opprettes av skriptet (ikke migrasjon — fila skal aldri finnes i
  prod; bevisst avvik fra 0143-mønsteret, se Key Decisions).
- Opplasting: `upload('users.json', body, { upsert: true, contentType: 'application/json',
  cacheControl: '0' })`.

### 2. App — `native/app/src/devLogin.ts` (ny, ren modul + én nett-funksjon)

```ts
export const STAGING_SUPABASE_HOST = 'snwmueecmfqqdurxedxv.supabase.co';
export const DEV_LOGIN_BUCKET = 'dev-login';
export const DEV_LOGIN_OBJECT = 'users.json';

export type DevLoginRole = 'admin' | 'arrangor' | 'spiller';
export interface DevLoginUser { email: string; label: string; role: DevLoginRole }
export interface DevLoginConfig { supabaseUrl: string; password: string }

/** Leser de to env-variablene BOKSTAVELIG (Expo inliner kun `process.env.EXPO_PUBLIC_X`). */
export function readDevLoginEnv(): { supabaseUrl?: string; password?: string };

/** Ren gate: config kun når passordet er satt OG verten er staging. Ellers null. */
export function resolveDevLoginConfig(env: { supabaseUrl?: string; password?: string }): DevLoginConfig | null;

/** Ren parser for users.json. Ugyldig form → []. Oppføringer uten email/label droppes,
 *  ukjent role → 'spiller', duplikat-email → første vinner, rekkefølge bevares. */
export function parseDevLoginUsers(json: unknown): DevLoginUser[];

/** GET <url>/storage/v1/object/public/dev-login/users.json?t=<Date.now()>, 5 s AbortController-
 *  timeout. Alt annet enn 200 + gyldig JSON → []. Kaster aldri. */
export function fetchDevLoginUsers(config: DevLoginConfig, signal?: AbortSignal): Promise<DevLoginUser[]>;

/** 1) await wipeLocalData()  2) supabase.auth.signInWithPassword({ email, password }).
 *  Feiler wipe-en, avbrytes innloggingen (aldri bland to brukeres lokale tall).
 *  Returnerer { error: string | null } — ren streng, aldri Supabase-meldingen rett ut. */
export function signInAsDevUser(user: DevLoginUser, config: DevLoginConfig): Promise<{ error: string | null }>;
```

Gaten er tredobbel og hver del alene stopper prod: (a) `EXPO_PUBLIC_DEV_LOGIN_PASSWORD` tom
→ null; (b) `EXPO_PUBLIC_SUPABASE_URL` sin vert ≠ `STAGING_SUPABASE_HOST` → null (bruk
`new URL()`; uparsbar URL → null); (c) prod har ingen `dev-login`-bucket → tom liste selv om
(a)+(b) skulle svikte. Staging-refen står alt i CLAUDE.md og runbøker — ingen ny lekkasje.

### 3. Skjerm — `native/app/src/screens/Login.tsx`

- Ved mount: `config = resolveDevLoginConfig(readDevLoginEnv())`. Er den satt: hent lista
  (AbortController avbrytes i cleanup) → `devUsers`-state. Ingen spinner; boksen dukker opp
  når lista er der. Tom liste / feil → ingen boks, skjermen ser ut som i dag.
- Boksen står **over** e-post-skjemaet, kun når `config && devUsers.length > 0`:
  - `ui.sectionTitle`: «Testbrukere (staging)» — `testID="dev-login-section"`.
  - Én `Pressable` per bruker, `ui.buttonSecondary` (≥ 44 pt), innhold: `label` i
    `buttonSecondaryText` + rolle-merkelapp (`ui.badge`/`badgeText`: Admin / Arrangør /
    Spiller). `testID="dev-login-user-<index>"`, `accessibilityLabel="Logg inn som <label>"`.
  - Under lista: `ui.muted` «eller med e-post» som skille mot skjemaet.
- Trykk: `setBusy(true)`, `setError(null)`, `await signInAsDevUser(user, config)`; ved feil
  `setError(...)`, `setBusy(false)`. Ved suksess gjør `App.tsx` resten. Alle knapper (også
  skjemaets) disabled mens `busy`.
- Feilkopi (eier-språk, dev-bygg): «Fikk ikke logget inn som {label}. Passordet i appen kan
  være utdatert — be økta kjøre synk-skriptet for testbrukere, eller bygge appen på nytt.»
  Wipe-feil: «Fikk ikke tømt de lokale tallene på telefonen. Prøv igjen.» Vises i dagens
  `testID="login-error"`.
- Overskriften «Tørny Dev» og OTP-flyten er uendret. Ingen nye navigasjons-ruter.

### 4. Skript — `scripts/dev-login-users.mjs` (nytt, Node 22, kjøres fra repo-rota)

```
node scripts/dev-login-users.mjs                 # = sync
node scripts/dev-login-users.mjs sync            # rollebesetning + passord + bucket + fil, idempotent
node scripts/dev-login-users.mjs add --email torny+dev-<slug>@example.test --name "<Navn>" [--role spiller|arrangor|admin] [--hcp 18] [--issue N]
node scripts/dev-login-users.mjs remove --email <e>   # fjerner fra lista (brukeren røres ikke); rollebesetningen kan ikke fjernes
node scripts/dev-login-users.mjs list
```

- **Env:** leser KUN `.env.staging.local` (ingen `--env`-flagg finnes). Hard vakt: URL-en må
  inneholde `snwmueecmfqqdurxedxv`, ellers exit 1 før første kall. Krever
  `SUPABASE_SERVICE_ROLE_KEY` og `DEV_LOGIN_PASSWORD` (≥ 24 tegn, samme regel som
  review-kontoen). Printer «Skriver til: <URL>» før første skriv. Passordet printes aldri.
- **Rollebesetning** (konstant i skriptet, fast rekkefølge, alle `@example.test`):

  | # | label | email | role | hcp |
  |---|---|---|---|---|
  | 1 | Anne Admin | `torny+dev-admin@example.test` | admin | 12 |
  | 2 | Kari Arrangør | `torny+tapptest1909-arrangor@example.test` | arrangor | 18 |
  | 3 | Ola Kompis | `torny+tapptest1909-kompis@example.test` | spiller | 18 |
  | 4 | Per Putter | `torny+dev-putter@example.test` | spiller | 18 |
  | 5 | Testspiller Tapp | `torny+tapptest1909-spiller@example.test` | spiller | 18 |

  Anne Admin og Per Putter er nye kontoer; de tre andre finnes og gjenbrukes (beholder
  spillhistorikken fra #1909). E-postene er syntetiske og kan stå i repoet.
- **`sync`:** (1) `getBucket('dev-login')`, opprett om mangler; (2) per rollebesetnings-
  medlem: finn auth-bruker på e-post (users-rad → `listUsers`-fallback som i provision-
  skriptet); mangler → `createUser({ email, password, email_confirm: true })`; finnes →
  `updateUserById({ password, email_confirm: true })`; vent på `public.users`-raden; sett
  komplett profil (name, hcp_index, handicap_updated_at, profile_completed_at, gender 'mens',
  level 'normal', is_guest false, deleted_at null, is_admin = role === 'admin');
  (3) last ned eksisterende `users.json` (finnes den), behold `origin ≠ 'cast'`-oppføringene
  og roter passordet deres òg (én `updateUserById` per stykk — brukere som ikke lenger finnes
  droppes fra lista med en logglinje); (4) skriv lista = rollebesetning + ekstra, `upsert`,
  `cacheControl: '0'`; (5) print lista. Idempotent — kjør så ofte du vil.
- **`add`:** samme sikre-bruker-sti for én adresse; adresse som alt er i rollebesetningen →
  exit 1 («finnes i rollebesetningen»); finnes alt som ekstra → oppdater label/role og
  behold `addedAt`. `origin` = `--issue N` → `"#N"`, ellers `"manuell"`. Deretter (4)+(5).
- **`remove`:** rollebesetning → exit 1; ekstra → fjern fra lista, last opp. Brukeren slettes
  ikke (spillhistorikk kan være poenget).
- **`list`:** last ned og print `label · role · email · origin`.
- Helper-funksjonene kopieres fra `provision-review-account.mjs` med en kildekommentar
  (to skript, ingen delt `_lib` ennå — trekk ut først når et tredje skript trenger dem).
  `provision-review-account.mjs` røres ikke.
- Skriptet feiler høyt på `error`-svar og på 0-rads-oppdateringer (`.select()` + assert,
  trap 2).

### 5. Oppsett i bygge-økta (engangs, på eierens Mac — ikke i repoet)

1. `openssl rand -base64 30` → legg `DEV_LOGIN_PASSWORD=<verdi>` i
   `/Users/jdl/Dokumenter/GitHub/golf-app/.env.staging.local` (rot-repoet; worktrees kopierer
   fila derfra).
2. `native/app/.env.local`: `EXPO_PUBLIC_DEV_LOGIN_PASSWORD=<samme verdi>` ved siden av
   `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` (staging).
3. `node scripts/dev-login-users.mjs sync` → `list` → `curl -s
   https://snwmueecmfqqdurxedxv.supabase.co/storage/v1/object/public/dev-login/users.json`
   viser fem oppføringer i rekkefølge.
4. Bygg til telefonen (`npx expo run:ios --device <klassisk UDID> --configuration Release`,
   se app-spike.md) → eier-tapptest.

### 6. Rutine for økter (dokumentasjon som er del av leveransen)

- **CLAUDE.md «Testing — staging» → «Kjør appen mot staging»**, nytt kulepunkt:
  «**Eier-tapptest i native-appen (#1923):** innloggingsskjermen i Tørny Dev har
  trykk-innlogging for rollebesetningen (Anne Admin, Kari Arrangør, Ola Kompis, Per Putter,
  Testspiller Tapp — alle `@example.test`). Rigg testspill til eieren med disse. Trenger du en
  annen bruker: `node scripts/dev-login-users.mjs add --email torny+dev-<slug>@example.test
  --name "<Navn>" --role spiller --issue <N>` — den står i appen neste gang
  innloggingsskjermen åpnes, uten nytt bygg. Passord: `DEV_LOGIN_PASSWORD` i
  `.env.staging.local` = `EXPO_PUBLIC_DEV_LOGIN_PASSWORD` i `native/app/.env.local` (begge
  gitignorert). Skriptet nekter alt annet enn staging. Detaljer: `docs/native/app-spike.md`
  «Testbrukere i appen».»
- **`docs/native/app-spike.md`**, ny seksjon «Testbrukere i appen — tapp for å logge inn
  (#1923)»: hvordan det virker, gaten, skriptkommandoene, env-nøklene, feilsøking
  («Fikk ikke logget inn …» = passord-drift → `sync` eller nytt bygg; tom boks = feil vert,
  manglende env eller staging pauset). Seksjonen «Logg inn på test-enhet uten e-post» BLIR
  STÅENDE med en innledende setning: den er nå fallback for automatisert simulator-kjøring
  (økter uten eierens telefon) og for brukere utenfor lista.
- Memory-notat (bygge-økta): rollebesetningen + skriptet, lenket fra MEMORY.md.

## Edge Cases & Guardrails

| Tilfelle | Forventet |
|---|---|
| Uten nett / staging pauset | Fetch feiler → ingen boks; e-post-skjemaet står som før. Aldri en feilmelding for lista i seg selv. |
| Prod-bygg (prod-URL, ingen env) | `resolveDevLoginConfig` → null → ingen fetch, ingen boks. Testet i jest-tabellen. |
| Env satt, men URL = prod | null (vert-gaten). Testet. |
| Passordet rotert, appen bygget med gammelt | `invalid_credentials` → feilkopien om synk/nytt bygg. Skjemaet virker fortsatt. |
| Wipe feiler (db låst) | Innlogging avbrytes, egen feilkopi; ingen sesjon settes. |
| Trykk mens `busy` | Alle knapper disabled — ingen dobbel innlogging. |
| Ugyldig / halv `users.json` | Parser dropper ugyldige oppføringer; helt ugyldig → []. Testet. |
| Duplikat-email i fila | Første vinner. Testet. |
| Rollebesetnings-medlem slettet (anonymisert) av en tidligere tapptest | `sync` finner ikke adressen (anonymisering skrubber e-posten) → oppretter ny konto med samme label. Bokføres i skript-output. |
| Ekstra bruker slettet, står i lista | `sync` dropper oppføringen med logglinje; appen ville ellers vist en død knapp (innlogging feiler ærlig). |
| Skriptet kjøres i worktree uten `.env.staging.local` | Samme feil som provision-skriptet: «Fant ikke … kjør fra rota». |
| Skriptet pekes mot prod (feil env-fil kopiert inn) | Ref-vakten stopper før første kall. Prod-brannmuren (#1074) står i tillegg. |
| natt-VM / cloud-økt | Har ikke `DEV_LOGIN_PASSWORD` → kan ikke kjøre skriptet. Bokført begrensning (Out of Scope). |
| Simulator-automatisering | Uendret: sesjons-injeksjonen i app-spike.md er fortsatt veien for økter uten telefon. |

Logikk-tabell (T1 steg 4) for parser/gate: tom liste → []; én → én; mange → rekkefølge
bevart; grense: label/email tom streng → droppet; duplikat → første; ugyldig JSON-form → [];
samtidighet: N/A (én fetch per mount, avbrytes ved unmount); tidssone: N/A (`addedAt` vises
ikke i appen).

## Key Decisions

1. **Passord-grant, ikke OTP-mint i appen.** Alternativet (appen kaller et endepunkt som
   minter kode med service-role) ville lagt en service-role-flate på nettet. Passord i
   dev-bundelen er akseptabelt fordi det kun låser opp syntetiske staging-kontoer.
2. **Lista i Storage, ikke i app-kode og ikke i DB-skjema.** App-kode = nytt bygg per bruker
   (eier valgte bort). DB-tabell/RPC = skjema-drift mot prod eller en tom dev-tabell i prod.
   En public bucket er data, ikke skjema: ingen migrasjon, ingen drift-sjekk, prod uberørt.
3. **Bucket via skript, ikke migrasjon** (avvik fra 0143): fila skal aldri finnes i prod, og
   migrasjoner kjører i begge. Bokført her og i app-spike.md.
4. **Kun syntetiske adresser i lista.** Bucketen er verdensleselig for den som kjenner
   staging-URL-en (som står i offentlige docs). E2e-kontoene er eierens Gmail med plusstagg —
   den ville avslørt grunnadressen. Derfor får admin- og spiller-slottene nye
   `@example.test`-kontoer (Anne Admin, Per Putter) i stedet for Test Admin/Test Spiller.
   E2e-kontoene røres ikke og fortsetter å eie web-e2e. Eieren orienteres om navnebyttet
   (designnotatet).
5. **`cacheControl: '0'` + cache-buster.** Free-tier har ikke Smart CDN; default max-age er
   3600 s. Begge tiltak, så «uten nytt bygg» også betyr «uten å vente en time».
6. **Wipe før innlogging, i dev-veien.** `torny.db` er ikke bruker-skopet; bytte av
   testbruker uten wipe ville blandet tall. Den generelle «Logg ut»-wipen er #1877 og
   forblir egen sak.
7. **Vert-gate hardkodet på staging-refen.** En env-basert «er dette staging»-bryter kunne
   settes feil; refen er alt offentlig. Prod-refen nevnes ikke i appen.
8. **Ingen `[x]`-forhåndsutfylling:** kriteriene under krysses kun med evidens fra bygge-økta.

## Success Criteria

1. [ ] **Gate og parser (jest, Type A):** `it.each`-tabell for `resolveDevLoginConfig`
   (tom/manglende passord, prod-vert, uparsbar URL → null; staging + passord → config) og
   for `parseDevLoginUsers` (gyldig, ikke-objekt, `users` ikke array, manglende label/email
   droppet, ukjent role → spiller, duplikat → første, rekkefølge bevart). Grønt; antall
   rapporteres.
2. [ ] **Én render-test (Type C) `Login.test.tsx`:** med env satt til staging + passord og
   `fetch` mocket til to brukere: boksen rendres med to rader; trykk på rad 1 kaller
   `wipeLocalData` FØR `supabase.auth.signInWithPassword({ email, password })` (assert på
   `mock.invocationCallOrder`). `supabaseMock.auth` får `signInWithPassword: jest.fn()`
   (additivt).
3. [ ] **Staging-rigg (skript):** `sync` oppretter bucket + fem kontoer; `curl` på public-URL-en
   gir fem oppføringer i rekkefølgen over, alle med komplett profil
   (`profile_completed_at` satt, gender `mens`, Anne Admin `is_admin = true`) — vist med
   read-only SQL. `add --email torny+dev-test1923@example.test --name "Test 1923" --issue 1923`
   → `curl` viser seks innen 60 s (faktisk målt ventetid bokføres); `remove` → fem igjen.
   `add` på en rollebesetnings-adresse → exit 1.
4. [ ] **Eier-tapptest på fysisk iPhone:** innloggingsskjermen viser «Testbrukere (staging)»
   med fem navn; trykk på «Kari Arrangør» → hjem med
   `torny+tapptest1909-arrangor@example.test` i footeren, uten e-post-steg. «Logg ut» → trykk
   «Ola Kompis» → hjem viser Olas adresse. Bevis = eierens bekreftelse på PR-en.
5. [ ] **Prod-vakt i bundelen:** `npx expo export --platform ios` UTEN
   `EXPO_PUBLIC_DEV_LOGIN_PASSWORD` → `grep -r "<passordet>" dist/` gir 0 treff; MED
   variabelen → ≥ 1 treff. (Beviser at env-variabelen er passordets eneste bærer.) Slett
   `dist/` etterpå.
6. [ ] **Docs:** CLAUDE.md-kulepunktet og app-spike-seksjonen er inne (sitert i PR-en);
   memory-notat skrevet.
7. [ ] **PR-form:** «Fordeler/ulemper»-blokk i body; ingen produktvalg-heading (valgene er
   tatt av eieren i #1923); PR-en merges av eieren, ikke kortet (auth).
8. [ ] **Ingen endring** i `lib/`, `supabase/migrations/`, web-`/login`, `proxy.ts`, e2e.

## Gates

(Fersk worktree: `npm install` i BÅDE repo-rot og `native/app/` — eget lockfile. Node 22.
`.env.staging.local` + `native/app/.env.local` må kopieres inn.)

- [ ] `npx jest` i `native/app/` grønt — antall vs baseline rapporteres
- [ ] `npx tsc --noEmit` i `native/app/` grønt
- [ ] `npx expo export --platform ios` grønt (slett `dist/` etterpå)
- [ ] `npm run typecheck` (rot) grønt
- [ ] `npx vitest run` (rot) grønt — identisk antall som baseline
- [ ] `npx eslint native/app scripts/dev-login-users.mjs` grønt
- [ ] `npm run build` (rot) grønt m/ pipefail

## Files Likely Touched

- `native/app/src/devLogin.ts` (ny, + `devLogin.test.ts`) — gate, parser, fetch, innlogging
- `native/app/src/screens/Login.tsx` (+ ny `Login.test.tsx`, maks én render-test) — boksen
- `native/app/src/test/supabaseMock.ts` — `auth.signInWithPassword` (additivt)
- `scripts/dev-login-users.mjs` (ny) — sync/add/remove/list
- `docs/native/app-spike.md` — ny seksjon + innledning på sesjons-injeksjonen
- `CLAUDE.md` — kulepunkt under «Kjør appen mot staging»
- Commits: `feat(native)`/`chore(scripts)`/`docs` med `Refs #1923`; `[no-changelog]` på
  feat (ikke spiller-synlig, jf. native-presedens)

## Out of Scope

- Trykk-innlogging på **web**-`/login` mot staging (kan gjenbruke samme `users.json` senere —
  egen issue ved pull).
- #1877 («Logg ut» wiper lokal base) — egen sak; dev-veien wiper selv.
- natt-VM/cloud-økter: skriptet krever `DEV_LOGIN_PASSWORD` lokalt. Å legge passordet som
  GitHub-secret er en mulig oppfølger, ikke del av dette.
- Android-verifisering (iOS er eierens testplattform).
- Fjerning av sesjons-injeksjons-oppskriften (den blir fallback).
- Endringer i e2e-kontoene, `provision-review-account.mjs`, RLS, migrasjoner.
