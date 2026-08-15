# Evaluering: Varsel-restanser (#1598 · #1665)

**Branch:** `claude/varsel-restanser-1598-1665` (2 commits over `origin/main`)
**Kontrakt:** `.forge/contracts/1598-1665-varsel-restanser.md`
**Evaluator:** fresh-context, skeptisk. Ingen produkt-/testfiler endret (alle mutasjoner reversert, `git status` ren).

---

## Success Criteria

| # | Kriterium | Verdikt | Bevis |
|---|---|---|---|
| 1 | `scorecard_approved`-skjemaet har `approver_role` (nullable + optional) | PASS | `lib/notifications/types.ts:78` — `z.enum(['peer','organizer']).nullable().optional()`. Kast-probe mot `parseNotificationPayload`: historisk payload uten feltet, minimal payload, eksplisitt `null`, samt `'peer'`/`'organizer'` parser alle; `'admin'` avvises (kaster). 4/5 probe-asserts grønne, den femte feilet kun fordi helperen KASTER i stedet for å returnere null — dvs. avvisningen er reell. |
| 2 | Alle produsenter setter rollen riktig | PASS | Peer: `app/[locale]/games/[id]/approve/actions.ts:172` → `'peer'`. Arrangør: `app/[locale]/admin/games/[id]/actions.ts:276` → `'organizer'`. Tredje «produsent» i kontrakten (`app/[locale]/games/[id]/(home)/page.tsx:344`) er verifisert som **konsument**, ikke produsent: linja er `markNotificationsRead({userId, kind:'scorecard_approved', entityId:id})` inne i `after()`. Byggerens avvik er korrekt; kontrakten leste feil. |
| 3 | `approver_role: 'organizer'` dekker både admin og oppretter | PASS | `loadAdminOrCreatorContext` (`admin/games/[id]/actions.ts:58-71`) bygger på `requireAdminOrCreator`; `name` = `ctx.name?.trim() \|\| null` (rått profilnavn), `actorName` = audit-strengen med `'Admin'`/`'En arrangør'`-fallback. Begge roller går gjennom `adminApproveScorecard` → samme payload. Riktig: fra spillerens side ER begge arrangøren. |
| 4 | `cardContent` velger `organizerFallback` for organizer-uten-navn, `somePlayerFallback` ellers | PASS | `lib/notifications/cardContent.ts:57-65`. Unit: `cardContent.test.ts` dekker organizer / peer / historisk (uten felt) / navn-slår-rolle. **Mutasjon:** ternæren tilbakestilt til `p.approver_name ?? t('somePlayerFallback')` → nøyaktig 1 test rød (`scorecard_approved uten navn velger fallback etter rolle (#1598)`), 5 grønne. |
| 5 | `reopenScorecard` sender rått navn; `logAdminEvent` beholder audit-strengen | PASS | `actions.ts:429` → `actor_name: name` (rått, null uten profilnavn); `actions.ts:405` → `logAdminEvent({ actorName })` uendret. Testen `#1598: a nameless organizer sends actor_name null...` asserterer BEGGE i samme case. Staging bekrefter: payload `actor_name: null`. |
| 6 | `organizerFallback` finnes i begge locales | PASS | `messages/no.json` `inbox.organizerFallback` = «Arrangøren»; `messages/en.json` = "The organizer". Samme namespace som `somePlayerFallback`/`actionFailed`. |
| 7 | `markNotificationsRead({userId, notificationId})` med 0 rader → `false` | PASS | `lib/notifications/markRead.ts:66-77` — `.select('id')` KUN på enkelt-id-grenen, radtelling + `console.error` + `return false` før `revalidateTag`. **Mutasjon:** guard fjernet → `#1665: enkelt-id som treffer 0 rader → false` rød. Staging (punkt 2b) beviser den ende-til-ende. |
| 8 | Bulk med 0 rader → `true` | PASS | Samme fil: bulk-grenen henter ingen rader (`await q`) og radtellingen er gatet på `opts.notificationId`. Test `#1665: bulk-kall som treffer 0 rader → true` + `archiveNotifications` «Tøm leste» 0 rader → true. Arkiv-bulkgrenen er uendret i diffen. |
| 9 | `archive.ts` samme skille | PASS | `lib/notifications/archive.ts:54-70`. Ny fil `lib/notifications/archive.test.ts` (3 cases: enkelt 0→false + ingen revalidate + `.select('id')` faktisk kalt; enkelt 1→true + revalidate; bulk 0→true). **Mutasjon:** guard fjernet → 1 rød. |
| 10 | Øvrige kallere upåvirket | PASS | Uttømmende grep: kun `markOneAsRead`/`archiveOne` (`app/[locale]/innboks/actions.ts:31,57`) sender `notificationId`. `(home)/page.tsx:341-362`, `admin/games/[id]/page.tsx:264,269`, `leaderboard/page.tsx:110`, `approve/page.tsx:100` bruker `kind`+`entityId` (bulk-gren, uendret) og `void`-er returverdien inne i `after()`. |
| 11 | Banner ruller tilbake + viser `product-banner-action-error` ved `!ok` | PASS | `components/products/ProductUpdateBannerClient.tsx:38-56` + `:104-112` (`role="status"`, egen testid, `t('actionFailed')`). Ingen gjenbruk av `inbox-action-error` (F5 i #1664-evalueringen respektert). **To mutasjoner:** (a) rollback fjernet → rød; (b) testid endret til `inbox-action-error` → rød. Staging punkt 2a+2b: banneret kom tilbake, `product-banner-action-error` synlig, `inbox-action-error` ikke i DOM. |
| 12 | Banner-testene justert til `act()` + `{ ok: true }`-default | PASS | `ProductUpdateBannerClient.test.tsx` — default-mock i `beforeEach`, `act()` rundt klikk i de tre interaktive casene. Justeringen er nødvendig (komponenten awaiter nå), ikke maskerende: rollback-testen er falsifiserbar (to mutasjoner over). |
| 13 | Peer-stien tagger `'peer'` ubetinget | PASS (akseptert avvik) | `approve/actions.ts` sjekker ikke `is_admin` før payloaden. En admin som bruker `/approve` i stedet for admin-flaten får «En spiller»-fallback. Dokumentert i kodekommentar (`:161-164`) og i kontraktens avvik-liste. Praktisk sjelden: arrangør-flaten er egen rute. |
| 14 | `.changes/`-notater parser | PASS | `node scripts/weekly-release.mjs --dry-run` — begge linjene renders i 1.233.0-diffen (#1598, #1665). |

---

## Gates

| Gate | Kommando | Resultat |
|---|---|---|
| Co-located vitest | `npx vitest run lib/notifications "app/[locale]/admin/games/[id]" "app/[locale]/games/[id]/approve" "app/[locale]/games/[id]/(home)" components/products "app/[locale]/innboks"` | **27 filer / 275 tester grønt** |
| Typecheck | `npx tsc --noEmit -p .` | **Ren** (ingen output) |
| Lint | `npx eslint` på alle 13 endrede kildefiler | **0 errors**, 1 warning: `cardContent.ts:19` complexity 51 > 25 — pre-eksisterende (50 på `origin/main`, verifisert ved å bytte inn main-versjonen) |
| Build | `npm run build` (`set -o pipefail`) | **exit 0** |
| Changelog | `node scripts/weekly-release.mjs --dry-run` | **Begge notater parser** |
| Commit-disiplin | `git log origin/main..HEAD` | 2 commits, begge `fix(...)` + `Refs #N` i body, begge med `.changes/`-notat |

---

## Staging-bevis

Kjørt mot `torny-staging` (`snwmueecmfqqdurxedxv`) fra denne worktreen, `next dev -p 3146` med `.env.staging.local` (cwd verifisert via `lsof -a -p <pid> -d cwd`), Playwright via Bash, OTP-mintet innlogging.

| Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
|---|---|---|---|
| **1a #1598** — navnløs arrangør godkjenner et levert kort, spilleren leser innboksen | Innboks-kortet: «Scorekortet er godkjent — **Arrangøren** godkjente kortet i TEST-GoldenPath-1786822581969-golden». Inneholder «Arrangøren», ikke «En spiller». Admin-flaten redirigerte til `?status=admin_approved#leverte-scorekort` | 0 console-errors, 0 requestfailed | `notifications?kind=eq.scorecard_approved&user_id=eq.<spiller>&order=created_at.desc&limit=1` → payload `{approver_name: null, approver_role: "organizer", game_id, game_name}` |
| **1b #1598** — samme navnløse arrangør gjenåpner kortet | Innboks-kortet: «Scorekortet er åpnet igjen — **Arrangøren** åpnet kortet ditt i …». Ingen 'Admin'-streng i bruker-teksten. Redirect `?status=scorecard_reopened` | 0 / 0 | `kind=eq.scorecard_reopened` → payload `{actor_name: null, game_id, game_name}` (audit-strengen «Admin» lekket IKKE inn) |
| **2b #1665** — 0-rads-skriving (raden alt lest) → `ok:false` → rollback | Banneret kom TILBAKE (`product-update-banner` count 1) + `product-banner-action-error` synlig med «Fikk ikke lagret — prøv igjen.». `inbox-action-error` ikke i DOM (count 0). Server-action-POST observert til `http://localhost:3146/` | 0 / 0 | Riggen: `PATCH notifications?id=eq.<n>` `read_at=now()` → enkelt-id-UPDATE-en treffer 0 rader (filteret `.is('read_at', null)`) |
| **2a #1665** — action-POST blokkert (`page.route` abort) → catch-gren | Banneret tilbake + `product-banner-action-error` synlig, samme tekst | Forventede aborter: `net::ERR_FAILED` + `[products] product update banner dismiss failed TypeError: Failed to fetch` (bevisst injisert) | `notifications?id=eq.<n>&select=read_at` → `read_at: null` (ingenting skrevet) |
| **2c #1665** — ekte dismiss | Banneret borte (`bannerGone: true`), ingen feillinje | 0 / 0 | `read_at: "2026-08-15T21:49:11.647+00:00"`, `archived_at: null` |
| **3 (ekstra) #1665** — innboks-✕ under RLS med ny `.select('id')` | Kort 4 → 3, `inbox-action-error` count 0 | 0 / 0 | `archived_at: "2026-08-15T21:49:17.945+00:00"`. Falsifiserer risikoen for at `UPDATE … RETURNING` skulle bli filtrert bort av RLS: `notifications_select_own` er `user_id = auth.uid()` uten `archived_at`-filter (lest fra `pg_policies` på staging) |

**Prod-vakt: 0 brudd — alle Supabase-kall gikk til `snwmueecmfqqdurxedxv.supabase.co` (21 kall over 4 kjøringer).** `stagingEnv()` hard-stopper på feil ref, og `rest()` nekter ikke-staging-URL-er.

### Opprydding (verifisert med SQL etter kjøring)

| Ting | Status |
|---|---|
| `users.name` for E2E-admin | tilbake til «Test Admin» |
| `games.require_peer_approval` (82bfb793…) | tilbake til `false` |
| `game_players` (submitted_at/approved_at/approved_by_user_id/rejection_reason) | tilbake til `null`/`null`/`null`/`null` |
| Varsler laget av kjøringen | 2 slettet (spiller tilbake på 5 rader = baseline) |
| Seedede `product_update`-rader | 0 igjen (`payload->>title like 'EVAL-1665%'` → 0) |
| Arkiverte admin-varsler | 0 (den arkiverte raden var vår egen seed, slettet) |
| Dev-server | stoppet, port 3146 fri |
| `git status` | rent bortsett fra `?? .forge/contracts/1598-1665-varsel-restanser.md` |

---

## Findings

| # | Fil + kriterium | Alvorlighet | Funn |
|---|---|---|---|
| F1 | `app/[locale]/innboks/InboxClient.tsx:28` — kriterium 7/10 | nit (dokumentasjon) | Docblocken sier fortsatt at `markOneAsRead` er «no-op for allerede-lest». Etter #1665 returnerer et enkelt-id-kall på en alt-lest rad `false` → `runOptimistic` ruller tilbake og viser `inbox-action-error`. Ingen live regresjon: `handleTap` (:91) kaller kun når `wasUnread`, og banneret rendres kun for uleste rader. Men kommentaren beskriver oppførsel som ikke lenger holder, og en framtidig caller som dropper gaten får en falsk feillinje. |
| F2 | `lib/notifications/cardContent.ts:19` — Gates/lint | nit | ESLint-complexity-advarselen på `buildNotificationText` gikk 50 → 51 (grense 25). Pre-eksisterende warning, ikke error, ikke innført av denne PR-en. Funksjonen er en ren `switch` over 28 varsel-kinds — verdt en egen refaktor-issue en gang, ikke her. |
| F3 | `lib/notifications/markRead.ts:66-77` — kriterium 7 | lav (design-konsekvens, kontrakt-foreskrevet) | Fler-fane/dobbelttrykk-kappløp: leser fane A varselet først, gir samme trykk i fane B «Fikk ikke lagret — prøv igjen.» selv om raden FAKTISK er lest. Kontrakten valgte eksplisitt «enkelt-id + 0 rader = feil», og alternativet (svelge 0 rader) gjenåpner nettopp bugen #1665 rapporterte. Nevnt for ordens skyld — ikke en avvik fra kontrakten. |

Ingen funn blokkerer. F1 er en to-linjers kommentar-oppdatering som kan tas her eller som eget issue; F2/F3 er notater.

---

## VERDICT: ACCEPT
