# Forge-evaluering: #726 — `cookies()` inne i `after()`

**Verdict: ACCEPT**

Skeptisk, uavhengig re-derivasjon av hvert kriterium. Alle gates kjørt selv, alle
authz-stier lest, regresjonsvakten bevist med faktisk revert-kjøring, og alle åtte
`after()`-sites i `app/` traset for twin-bugs. Ingen hull funnet.

---

## Per-kriterium

| AC | Verdict | Evidens (egen-innhentet) |
|----|---------|--------------------------|
| **AC1 — Rot-årsak fjernet** | PASS | `lib/notifications/markRead.ts:3` importerer `getAdminClient` (ikke `getServerClient`); `:37` `const supabase = getAdminClient();` (synkron, ingen `await cookies()`). Mekanisk gate kjørt: `grep -c getServerClient markRead.ts` → `0`, `grep -c next/headers` → `0`, gate-script ekkoet «OK: admin client, no cookies». |
| **AC2 — Authz uendret** | PASS | `markRead.ts:42` `.eq('user_id', opts.userId)` står på hver query. Alle 5 call-sites leser `userId` server-side via `getProxyVerifiedUserId()` (`lib/auth/userId.ts:12-14` → `headers().get('x-torny-user-id')`, proxy-injisert, browseren setter den aldri). `notificationId`-stien (`innboks/actions.ts:17-21`) er dobbelt-scopet: `.eq('user_id', userId)` AND `.eq('id', notificationId)` — en gjettet/stjålet id treffer kun caller-ens egne rader. Ingen klient-levert userId-sti finnes. |
| **AC3 — Alle 4 ruter reparert av rot-fix** | PASS | approve:105, leaderboard:190, home:276/277, admin:233/238 kaller `markNotificationsRead`; ingen call-site endret i diffen. Alle 8 `after()`-sites i `app/` traset: de øvrige helperne (`maybeAutoConfirmLeagueParticipation`, `maybeSendDeliveryReminder`, `notifyPlayersGameStarted`→`notify`, `maybeAutoConfirmParticipation`, rå `revalidateTag`) bruker alle `getAdminClient` eller ingen klient. Bekreftet cookie-fri transitivt (events.ts→notify.ts→getAdminClient). Ingen lurende twin-bug. |
| **AC4 — Tester oppdatert + grønne** | PASS | `npx vitest run lib/notifications/markRead.test.ts` → **6 passed**. Mock byttet til `vi.mock('@/lib/supabase/admin', …)` (markRead.test.ts:9-11). |
| **AC5 — Side-effekt + regresjonsvakt** | PASS | happy-path-test asserter `revalidateTag('notifications-u1','max')`; error-path asserter IKKE kalt + `console.error`. **Bevist regresjonsvakt:** revertet source til `getServerClient` lokalt → alle 6 tester FEILET med `cookies was called outside a request scope` (samme feilklasse som prod-bugen). Restaurerte source. Mock-kilden ER vakten. |
| **AC6 — Gates + bump** | PASS | `npx eslint markRead.ts markRead.test.ts` exit 0. `npm run typecheck` (tsc --noEmit) exit 0. `package.json` 1.133.18→1.133.19. CHANGELOG-oppføring `[1.133.19] · #726` øverst i åpen `## 1.133.y`-serie, over 1.133.18. Tagline aktiv stemme («forsvinner»). PATCH korrekt: bug-fix av bruker-synlig oppførsel. Alle tre filer i commit 7201dd60. |
| **AC7 — Ingen cookies-feil fra markRead-pathen** | PASS | Verifisert ved kode-lesing + grep at ingen cookies-avhengighet gjenstår i markRead eller noen `after()`-helper. Full e2e mot staging kan ikke kjøres lokalt (mangler secrets) — eneste ikke-lokalt-verifiserbare bit, men avgrenset og forventet per kontrakt. |

---

## Rot-årsak-korrekthet (verifisert selv)

- `lib/supabase/server.ts:6` `const cookieStore = await cookies();` — bekreftet at `getServerClient` VAR cookies-kilden, importerer `cookies` fra `next/headers`.
- `lib/supabase/admin.ts:10-19` `getAdminClient()` — synkron, bruker `SUPABASE_SERVICE_ROLE_KEY` + `createClient` fra `@supabase/supabase-js`, `persistSession:false`, ingen `cookies()`. Genuint cookie-fri.
- Revert-eksperimentet ga den eksakte feilen (`next-dynamic-api-wrong-context`, `cookies()` i `getServerClient`) — fixen adresserer den reelle årsaken, ikke et symptom.

## Risiko / merknader (ingen blokkerende)

1. **Service-role bypasser RLS** — by design, men mitigert: query-filteret `.eq('user_id', opts.userId)` med server-utledet userId gjør at skriving aldri kan treffe andres rader. Sibling-presedensen (`maybeAutoConfirmParticipation`) gjør det samme for en mer sensitiv kolonne (`accepted_at`). RLS-policyen `notifications_update_own` står igjen og garderer den offentlige PostgREST-flaten (AGENTS.md-felle #3 tilfredsstilt).
2. **E2e mot staging ikke kjørt lokalt** — eneste uverifiserte bit; krever staging-secrets i CI. Forventet og avgrenset. Neste PR-CI-kjøring skal vise ren WebServer-logg.
3. Ingen frontend-filer rørt → Playwright/browser-verifisering ikke aktuelt (korrekt utelatt).

## Konklusjon

Solid rot-fix på rett nivå (én fil, alle fire ruter). Authz bevart og bevist. Regresjonsvakten
er reell (bevist med revert). Gates grønne. Versjon/CHANGELOG-disiplin overholdt. **ACCEPT.**
