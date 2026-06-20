# Forge-kontrakt: #726 — `cookies()` inne i `after()` (Next 16 ustøttet → varsler markeres aldri lest)

**Issue:** [#726](https://github.com/jdlarssen/golf-app/issues/726) · **Type:** bug/fix · **Flyt:** spille-runde (godkjenn scorekort + leaderboard)
**Branch:** `claude/loving-sanderson-4abc70`
**Bruker-synlig:** Ja (varselprikken ryddes ikke når du åpner tavla/godkjenner) → `fix(...)` + **PATCH-bump** + CHANGELOG.

---

## Bakgrunn / rot-årsak (verifisert)

E2e-WebServer-loggen (CI for #698) inneholder gjentatte:

```
[WebServer] An error occurred in a function passed to `after()`:
Error: Route /[locale]/games/[id]/approve used `cookies()` inside `after()`.
```

(samme for `/leaderboard`). Sporet til rot:

- `markNotificationsRead` ([lib/notifications/markRead.ts:30](lib/notifications/markRead.ts)) kaller `await getServerClient()`.
- `getServerClient` ([lib/supabase/server.ts:6](lib/supabase/server.ts)) kaller `await cookies()`.
- Begge ruter wrapper kallet i `after()`:
  - [app/[locale]/games/[id]/approve/page.tsx:104](app/[locale]/games/[id]/approve/page.tsx)
  - [app/[locale]/games/[id]/leaderboard/page.tsx:189](app/[locale]/games/[id]/leaderboard/page.tsx)

Next.js 16 forbyr `cookies()` inne i en `after()`-callback (kjører etter respons, utenfor request-scope). Resultatet er at **hele callbacken kaster** → `markNotificationsRead` fullfører aldri: varselet markeres **ikke** lest, og `revalidateTag(`notifications-${userId}`)` fyrer aldri. Bruker-symptom: bell-prikken/«ulest»-markøren forsvinner ikke når du åpner resultattavla eller godkjenner et scorekort, selv om den skulle.

### Bredere funn (utvider issue-teksten 2 → 4 ruter)

Samme defekt finnes i to ruter issuet ikke navnga, fordi de ikke ble truffet i akkurat den e2e-kjøringen:
- [app/[locale]/games/[id]/(home)/page.tsx:274](app/[locale]/games/[id]/(home)/page.tsx) — `after()` kaller `markNotificationsRead` for `invite` + `scorecard_approved`.
- [app/[locale]/admin/games/[id]/page.tsx:232](app/[locale]/admin/games/[id]/page.tsx) — `after()` kaller `markNotificationsRead` for `scorecard_submitted` + `invite`.

Fordi fixen ligger i **roten** (`markNotificationsRead`), repareres alle fire ruter av én endring — uten å røre call-sites. Per AGENTS.md-felle #4 («a rule has one home») er rot-fix riktig nivå.

### Presedens i kodebasen (samme `after()`, allerede løst slik)

`maybeAutoConfirmParticipation` ([lib/games/confirmParticipation.ts:20](lib/games/confirmParticipation.ts)) kjører i **nøyaktig samme** `after()` på home-sida og bruker bevisst `getAdminClient()` med kommentaren *«cookies ikke er tilgjengelig inni after()-callbacken»*. Mønsteret er allerede etablert og akseptert i prod.

## Designbeslutning (mekanisme — mitt valg innen eierens retning)

Bytt `markNotificationsRead` fra `getServerClient()` (cookies) til `getAdminClient()` (service-role, ingen cookies) — speiler `maybeAutoConfirmParticipation`.

**Authz bevares uendret:**
- Update-en er alltid scopet med `.eq('user_id', opts.userId)`.
- Hver caller utleder `userId` server-side via `getProxyVerifiedUserId()` (verifisert: innboks/actions.ts, approve, leaderboard, home, admin) — aldri klient-levert. En bruker kan dermed kun markere sine egne varsler, akkurat som før.
- RLS-policyen `notifications_update_own` blir stående på tabellen (vi fjerner den ikke) — den fortsetter å gardere den offentlige PostgREST-flaten (AGENTS.md-felle #3 tilfredsstilt). Vi bytter kun hvilken klient denne server-interne helperen bruker.
- Skrivingen er lav-sensitiv (`read_at`-tidsstempel). Sibling-en gjør det samme for en *mer* sensitiv kolonne (`accepted_at`).

**Hvorfor admin-client framfor «bygg cookies-klient utenfor after() og send inn»:**
- Minimalt: én fil i roten, ingen signatur- eller call-site-endring, fikser alle fire ruter.
- Robust: ingen cookies i pathen → virker likt i og utenfor `after()`, uten å lene seg på antakelsen om at en allerede-resolvet cookie-store kan leses i `after()`.
- Konsistent med den allerede-shippede sibling-en.

### Scope ut
- Ingen endring i call-sites (approve/leaderboard/home/admin) — de rører ikke cookies selv.
- Ingen endring i RLS-policy eller `notifications`-skjema.
- Ingen jakt på andre `after()`-bruk utenfor markRead (auto-start-fallbacken bruker allerede `revalidateTag` uten cookies; `maybeAutoConfirmParticipation` er allerede admin-client).

---

## Akseptansekriterier

- [x] **AC1 — Rot-årsak fjernet.** `markNotificationsRead` bruker `getAdminClient()` (synkron, ingen `cookies()`); `getServerClient`-importen er borte. Evidens: [markRead.ts:3](lib/notifications/markRead.ts) (import), [markRead.ts:37](lib/notifications/markRead.ts) (`const supabase = getAdminClient();`); mekanisk gate `! grep getServerClient/next/headers && grep getAdminClient` → «OK: admin client, no cookies in markRead.ts».
- [x] **AC2 — Authz uendret.** Update fortsatt scopet `.eq('user_id', opts.userId)` ([markRead.ts:42](lib/notifications/markRead.ts)); alle callere sender server-verifisert `userId` (innboks/actions.ts via `getProxyVerifiedUserId`; approve/leaderboard/home/admin via samme). Evidens: `eq('user_id','u1')`-assertion grønn + kodelesing av alle 5 call-sites.
- [x] **AC3 — Alle fire `after()`-ruter reparert av rot-fixen.** approve:104, leaderboard:189, home:274, admin:232 kaller `markNotificationsRead`; ingen call-site endret. Evidens: grep bekrefter de fire kallene + at `markRead.ts` ikke importerer `getServerClient`/`next/headers`. **Bonus:** scannet alle 8 `after()`-sites i app/ — de øvrige helperne (`maybeAutoConfirmLeagueParticipation`, `maybeSendDeliveryReminder`, `notifyPlayersGameStarted`, `revalidateTag`) er allerede cookies-frie, så markRead var den eneste twin-en. Ingen lurende søsken-bug.
- [x] **AC4 — Tester oppdatert + grønne.** `markRead.test.ts` mocker nå `@/lib/supabase/admin` (`getAdminClient`); alle 6 query-shape-assertions uendret og grønne (`vitest run lib/notifications/markRead.test.ts` → 6 passed). Mock-kilden ER regresjonsvakt: revert til `getServerClient` treffer ekte `cookies()` i test og feiler.
- [x] **AC5 — Side-effekt verifisert.** `revalidateTag(`notifications-${userId}`, 'max')` fyrer på happy path (test «happy path» grønn); error-path svelger + logger uten revalidate (test «error-path» grønn).
- [x] **AC6 — Gates grønne + bump.** `vitest markRead` 6 passed · `eslint` exit 0 · `npm run typecheck` clean. PATCH-bump 1.133.18→1.133.19 + CHANGELOG-oppføring i `fix(...)`-commit 7201dd60. Humanizer kjørt på taglinen (passiv «ryddes» → aktiv «forsvinner»).
- [x] **AC7 — Ingen `after()`/cookies-feil fra markRead-pathen.** Verifisert ved kodelesing + grep at ingen cookies-avhengighet gjenstår i pathen. Note: full e2e-gate (som produserte loggen) kjører i CI på PR mot staging — neste kjøring skal ha ren WebServer-logg; kan ikke kjøres lokalt uten staging-secrets.

---

## Gates

```bash
npx vitest run lib/notifications/markRead.test.ts
npx eslint lib/notifications/markRead.ts
npm run typecheck
# Mekanisk rot-fix-bevis:
! grep -q "getServerClient\|from 'next/headers'" lib/notifications/markRead.ts && grep -q "getAdminClient" lib/notifications/markRead.ts && echo "OK: admin client, no cookies"
```

## Test-plan (test-disiplin)

- **Type A (eneste type).** Oppdater eksisterende `markRead.test.ts`: bytt `vi.mock('@/lib/supabase/server')` → `vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => supabaseMock }))`. Alle 6 eksisterende assertions beholdes uendret (de tester query-shape, ikke klient-kilde). Ingen nye «mens jeg var her»-tester — mock-byttet er regresjonsvakten.
- Ingen Type B/C/D: ingen rendret output, ingen ny UI, e2e dekkes allerede av gaten som fanget bugen.

## Versjon / commit

- `fix(notifications): ...` med **PATCH-bump** (`npm version patch --no-git-tag-version`) + CHANGELOG-oppføring (tagline-utkast: «Når du åpner resultattavla eller godkjenner et scorekort, ryddes varselprikken igjen — slik den alltid skulle.»). Humanizer på taglinen.
- Atomisk commit (én logisk fix). `Refs #726` i body, `Closes #726` i PR-body.
