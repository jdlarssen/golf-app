# Forge-evaluering: #984 — Foreslå en idé (lean feedback-boks)

**Verdikt: ACCEPT**
**Dato:** 2026-06-29
**Evaluator:** skeptisk fresh-context gjennomgang (kode + porter + live RLS-probe mot staging `snwmueecmfqqdurxedxv`)

Arbeidet leverer kontrakten fullt ut. Alle tre automatiske porter passerte uavhengig kjørt, RLS er verifisert live mot staging og samsvarer eksakt med kontrakten, den lukkede sløyfa er korrekt wiret, og mail-laget er genuint best-effort. Ingen blokkerende funn.

## Porter (uavhengig kjørt, Node 22)

| Port | Kommando | Resultat |
|---|---|---|
| Build | `npm run build` | **exit 0**. Begge nye ruter kompilert (`/[locale]/foreslaa-ide`, `/[locale]/admin/ideer` i no+en). Den nye `NotificationKind`-en traff hver exhaustiv switch + Record uten feil. |
| Lint | `npx eslint <16 endrede filer>` | **exit 0**. 0 errors, 1 warning (pre-eksisterende complexity-warning på `buildNotificationText` — switch med 23 cases, kun +1 case lagt til; ikke introdusert av denne endringen). |
| Vitest | `npx vitest run lib/notifications "app/[locale]/foreslaa-ide" "app/[locale]/admin/ideer" lib/mail` | **exit 0**. 116 passed (14 filer) for scope; med lib/mail inkludert fortsatt exit 0. |

## Live RLS-verifikasjon (staging, READ-ONLY — 0 writes)

- `idea_submissions`: `rls_enabled=true`, `policy_count=4`.
- INSERT `idea_submissions_insert_own`: `with check (user_id = (select auth.uid()))`, ingen `using` (korrekt for INSERT).
- SELECT `idea_submissions_select_own_or_admin`: `using ((user_id = (select auth.uid())) OR is_admin())`.
- UPDATE `idea_submissions_update_admin`: `using is_admin() with check is_admin()`.
- DELETE `idea_submissions_delete_admin`: `using is_admin()`.
- `notifications_kind_check` inneholder `'idea_built'` = true.
- Kolonner = eksakt kontrakt-spec (id/user_id/text/status/built_at/created_at, nullbarhet stemmer).
- CHECK: `status IS NULL OR status='bygd'`; `char_length(btrim(text)) between 1 and 2000`.
- `is_admin()` er `SECURITY DEFINER` → ingen RLS-rekursjon, kan ikke subverteres.

**Hostile-vektor vurdert:** En ikke-admin har INGEN UPDATE-policy → en direkte PostgREST PATCH matcher 0 rader (kan ikke falsk-trigge «vi bygde det»). En ikke-admin SELECT ser kun egne rader (kan ikke lese andres ideer). Begge holder på datalaget, ikke bare i TS.

## Per-kriterium

| SC | Verdikt | Evidens (funnet uavhengig) |
|---|---|---|
| SC1 — Schema+RLS | **PASS** | Live staging-probe over: tabell + 4 policies + kind-constraint + kolonner + CHECKs alle som spesifisert. Migrasjon `0122_idea_submissions.sql` er korrekt og idempotent-formet (drop+add på kind-check bevarer hele eksisterende sett). |
| SC2 — `idea_built`-kind wiret | **PASS** | `types.ts:31` union + `ideaBuiltSchema` (`submission_id: uuid`) + `payloadSchemas`-record (`types.ts:283`); `cardContent.ts:236` case; `deeplink.ts:106` returnerer `null` (samme mønster som registration_rejected); `NotificationCard.tsx:50` EMOJI `💡`. Build grønn = exhaustiv dekning bevist. types.test.ts:269 + cardContent.test.ts:24 har idea_built-cases. |
| SC3 — Innsending | **PASS** | `/foreslaa-ide/page.tsx` rendrer textarea, gated på innlogget (`auth.getUser()` → redirect `/login`), ikke admin-gated. `submitIdea` validerer (tom/>2000 → `?error=empty`, ingen DB-touch), `expectOne` insert med `user_id: user.id` (RLS tvinger uansett uid). Verktøy-tile `sparkle` i `ToolsView` (PlayerKlubbhusViews.tsx:284). 5 action-tester grønne. |
| SC4 — Lukket sløyfe | **PASS** | `/admin/ideer/page.tsx` admin-only (`getRoleContext`→`notFound` hvis ikke admin), nyeste først (`order created_at desc`), submitter-navn via `users(name)`-embed. `markIdeaBuilt`: `requireAdmin` → `expectOne` update `status='bygd'`+`built_at` → `notify({kind:'idea_built', payload:{submission_id:id}})` med riktig submitter-`user_id` fra update-returen → mail-fallback når `shouldAlsoSendMail`. Admin-tile m/ ubygd-badge (TilesGrid.tsx:188, partial index `idea_submissions_unbuilt` backer tellingen). 3 action-tester grønne. |
| SC5 — RLS-sikkerhet | **PASS** | Verifisert live (se RLS-seksjon). Ikke-admin kan ikke mark-built (ingen UPDATE-policy) og kan ikke lese andres ideer. Co-located insert/update-tester finnes. |
| SC6 — Copy & i18n | **PASS** | Paritet-sjekk: 43 nye nøkler i no.json, 43 i en.json, 0 manglende i hver retning (foreslaaIde/adminIdeer/inbox.ideaBuilt/mail.idea*/tiles+meta). Norsk copy leser idiomatisk («Vi bygger Tørny etter hva dere ønsker dere», «Takk! Vi har fått idéen din»). Engelsk fullt oversatt. |
| SC7 — Release-disiplin | **PASS** | `package.json` = `1.157.0` (MINOR, fra 1.156). CHANGELOG har én Funksjon-rad for #984 i riktig 2-seksjons-format. Alle porter grønne. |

## Tilleggs-verifikasjon

- **Best-effort mail (kontrakt-fokus):** `submitIdea` — admin-mail i `Promise.allSettled` med rejected-logging, kaster aldri. `markIdeaBuilt` — `notify` i try/catch, mail-oppslag + send i try/catch + `Promise.allSettled`. En Resend-feil kan IKKE bryte brukerflyten i noen av dem. Verifisert ved kodetrace + test «still reaches the sent state when the admin mail fails».
- **error.tsx (AGENTS.md trap #5):** Ingen per-rute `error.tsx`, men det er etablert konvensjon — 0 av 33 admin-ruter har egen `error.tsx`; alt dekkes av catch-all `app/[locale]/error.tsx` (#680) + `app/global-error.tsx`. De nye rutene følger samme mønster som resten av appen. Ingen gap.
- **notify()** bruker admin-client + validerer payload (kaster ved ugyldig) — men `markIdeaBuilt` fanger det, så DB-raden er allerede oppdatert og sløyfa er robust.

## Funn (severity-rangert)

1. **(Nit / observasjon, ikke blokkerende):** I `submitIdea` er `Promise.all([submitterNavn, adminsListe])` IKKE wrappet i try/catch. PostgREST-reads rejecter normalt ikke (returnerer `{data, error}`), så i praksis trygt — og idéen er allerede persistert via `expectOne` over. Verste fall ved transport-feil: bruker ser en feil etter at idéen er lagret. Lav sannsynlighet, lav konsekvens. Ikke verdt egen issue.

Ingen P1/P2-funn. Ingen korrekthetsbugger. Ingen manglende kontrakt-leveranser.
