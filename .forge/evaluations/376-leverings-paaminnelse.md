# Forge-evaluering — #376 Leverings-påminnelse

**Evaluator:** Skeptisk uavhengig gjennomgang (fresh-context)
**Dato:** 2026-06-03
**Branch:** `claude/focused-darwin-ee21c3`
**Kontrakt:** `.forge/contracts/376-leverings-paaminnelse.md` (K1–K10)

## Overordnet verdikt: **ACCEPT**

Alle ti akseptkriterier er uavhengig verifisert mot kildekoden. Alle gates er kjørt og er grønne. Migrasjonen er bekreftet applisert i live-DB (CHECK + kolonne). Idempotens-guarden er airtight (Postgres row-lock + conditional UPDATE, samme mønster som `submitScorecard`). Unik-constraint på `scores` gjør hull-tellingen sikker. Ingen blokkerende bugs funnet. Én ikke-blokkerende grammatikk-nit (manglende komma før «men») og to mindre observasjoner notert under.

---

## Gate-output (kjørt av evaluator)

### `npm run build`
```
✓ Compiled successfully in 2.7s
```
Ny rute bekreftet i build-output:
```
├ ƒ /admin/games/[id]/status
```
(eneste warning: Next.js workspace-root-inferens — kosmetisk, ikke relatert).

### `npx vitest run lib/mail lib/notifications lib/games`
```
Test Files  36 passed (36)
     Tests  516 passed (516)
```

### `npx vitest run 'app/innboks/InboxClient.test.tsx'`
```
Test Files  1 passed (1)
     Tests  10 passed (10)
```

### `npx vitest run` (full suite, for K10-verifisering)
```
Test Files  215 passed (215)
     Tests  2599 passed (2599)
```

### Live-DB-verifisering (Supabase MCP, prosjekt `glofubopddkjhymcbaph`)
- `notifications_kind_check` inkluderer `'deliver_reminder'::text` ✓
- `game_players.deliver_reminder_sent_at`-kolonne finnes ✓
- `scores` har `UNIQUE (game_id, user_id, hole_number)` → hull-telling kan aldri telle duplikat ✓

---

## Per-kriterium

| K | Status | Evidens |
|---|--------|---------|
| **K1** Kind wiret gjennom alle uttømmende steder; build grønn | **VERIFIED** | Union + `deliverReminderSchema` + `schemas`-map: `lib/notifications/types.ts:20,125,142`. EMOJI-Record `NotificationCard.tsx:35` + `buildCardContent`-case `:198`. `buildDeeplink`-case `InboxClient.tsx:169` → `/games/{game_id}/submit`. Migrasjon-CHECK `0068:29`. Grep over hele repoet for `NotificationKind`: kun `types.ts`, `NotificationCard.tsx`, `markRead.ts` (param, ingen switch), `notify.ts` (ingen switch) — ingen oversett uttømmende switch/Record. `npm run build` → «✓ Compiled successfully». |
| **K2** 18/18 + ikke levert + ikke trukket → nøyaktig ETT in-app; mail kun off-app | **VERIFIED** | `maybeSendDeliveryReminder` (`deliveryReminder.ts:69`): teller hull med `.not('strokes','is',null)` `:83`, `< TOTAL_HOLES → return` `:85`. Atomisk update `:87-96` med `.is('deliver_reminder_sent_at',null).is('submitted_at',null).is('withdrawn_at',null)` → `.maybeSingle()`. `sendDeliveryReminder` `:19` kaller `notify()`, så `if (shouldMail && player.email)` `:39` for mail. `notify()` (`notify.ts:69`) returnerer `shouldAlsoSendMail` via `last_seen_at`-terskel, og `false` ved insert-feil (`:61` — ingen mail uten in-app). |
| **K3** Gjentatt render/besøk → ingen duplikat | **VERIFIED** | Conditional `UPDATE ... WHERE deliver_reminder_sent_at IS NULL` er gaten. Postgres tar row-lock; taper-transaksjonen re-evaluerer WHERE etter lock-release, `IS NULL` feiler, 0 rader → `.maybeSingle()` gir `null` → `if (updErr || !won) return` `:98`. Samme bevist mønster som `submitScorecard`. Admin-purringen stamper også kolonnen etterpå (`actions.ts:86-95`) så auto-nudgen ikke dobbel-fyrer. |
| **K4** Status-side: fremdrift X/18, badge, relativ siste-registrering; ferdige flagges | **VERIFIED** | `status/page.tsx`: `{r.holesFilled}/{TOTAL_HOLES} hull` `:257`; `STATUS_META`-badge `:46,231`; `formatRelativeNb(r.lastActionAt)` `:245` (null-guardet via `r.lastActionAt ? ... : 'Ingen registreringer ennå'`). `⚠️`-flag for target `:253` + topp-sortering via `SORT_ORDER` (`ready_not_delivered: 0`) `:57,140`. Henter kun `user_id, hole_number, updated_at` med `.not('strokes','is',null)` `:99-104` — ingen `strokes`-verdier, ingen spoiler. |
| **K5** Admin-purre sender til alle ferdige-men-ikke-leverte, best-effort, confirm + feedback, nåbar fra game-detail | **VERIFIED** | `remindUnsubmittedPlayers` (`actions.ts:27`): mål-sett `!submitted_at && !withdrawn_at && filledByUser >= TOTAL_HOLES` `:64-69`; `Promise.allSettled` `:71`; gater på `game.status === 'active'` `:39`. `RemindButton` `window.confirm` `:29`. Suksess-banner via `?status=reminded&count=` (`page.tsx:178-186`). Entry-lenke i `game.status==='active'` «Avslutt spillet»-SectionCard (`admin/games/[id]/page.tsx:1018-1024`) → `/admin/games/[id]/status`, med «og send påminnelse» når `notSubmittedCount > 0`. |
| **K6** Mail-helper finnes (spiller-rettet, submit-deeplink) + Type B snapshot grønn | **VERIFIED** | `lib/mail/deliverReminderNotification.ts`: subject «Lever scorekortet i {gameName}», deeplink `https://tornygolf.no/games/${gameId}/submit` `:43`, spiller-rettet salutation. 4 snapshot-tester i `.test.ts` (default, null-firstName, HTML-escape, full chrome-lås — ÉN gang). Registrert i delt `__tests__/resend-contract.test.ts:182`. Alle grønne (del av 516). |
| **K7** Ren `classifyDeliveryStatus` + Type A it.each over alle 6 states | **VERIFIED** | `deliveryStatus.ts:23` ren funksjon, 6-state union `:15-21`, withdrawn-forrang `:40` (over levert/spiller). `deliveryStatus.test.ts` it.each dekker alle 6: withdrawn, delivered (×2 grener), pending_approval, ready_not_delivered, playing, not_started + target-filter-test. 8 tester grønne. |
| **K8** Migrasjon skrevet + applisert | **VERIFIED** | `supabase/migrations/0068_deliver_reminder.sql` finnes. Live-DB-sjekk: CHECK-constraint inneholder `'deliver_reminder'`; `deliver_reminder_sent_at`-kolonne eksisterer. Additiv (`add column if not exists`) + drop/add CHECK — trygg. |
| **K9** Copy gjennom humanizer; version-bump + CHANGELOG i samme commit | **VERIFIED** | `package.json` version `1.71.1`. CHANGELOG har 1.71.y-serie (`1.71.0` auto-nudge + `1.71.1` admin) med tre-lags struktur (tema-heading + tagline-blockquote + Teknisk-details). Copy kjørt gjennom humanizer-mønstre: ingen em-dash-kjeder (eneste em-dash er kanonisk brand-tagline), ingen anglisismer/calques, ingen særskriving, ingen «X-spillet»-redundans, imperativ kompis-stemme. |
| **K10** Gates grønne (build + vitest berørte filer) | **VERIFIED** | Build «✓ Compiled successfully». Full vitest 215 filer / 2599 tester grønne. Berørte dirs (lib/mail, lib/notifications, lib/games) 516 grønne. InboxClient 10 grønne. |

---

## Bugs / gaps funnet

| # | Severity | Beskrivelse |
|---|----------|-------------|
| 1 | **Trivial (ikke-blokkerende)** | Manglende komma før «men» i status-side-copy: «har gått ferdig men ikke levert scorekortet» (`page.tsx:202-204`) bør være «…gått ferdig, men ikke levert…». Grammatikk-nit, ikke en AI-tell. Samme i CHANGELOG-tagline. |
| 2 | **Info (by design)** | Auto-nudge-mail fyrer sjelden i praksis: trigger-flaten (game-home-render) krever at spilleren er aktiv/on-app, som typisk gir `shouldAlsoSendMail === false`. Dette er bevisst og dokumentert i kontrakt + kode-kommentar (`deliveryReminder.ts:53`). Admin-purringen er den bevisste mail-stien for off-app-spillere. Ikke et bug. |
| 3 | **Info (akseptabel race-vindu)** | Admin-purringens stamping av `deliver_reminder_sent_at` skjer ETTER `Promise.allSettled`-sendingen, ikke atomisk før. Et teoretisk vindu finnes der en samtidig game-home-render kan dobbel-sende for samme spiller. I praksis ufarlig: spilleren må være on-app (game-home) samtidig som admin trykker purre — sjeldent, og verste utfall er to identiske påminnelser. Auto-nudgens egen atomiske guard hindrer dobbel fra auto-stien. Akseptabel for best-effort-varsel. |

Ingen blokkerende bugs. Ingen reviewer-funn som krever eget GitHub-issue (observasjon #1 er en stilnit, #2/#3 er by-design/akseptable).

---

## Null-håndtering verifisert

- `firstName(null)` → `null` (`lib/firstName.ts:2`); mail bruker da «Hei!» (`deliverReminderNotification.ts:44`). ✓
- Status-side bruker `p.users?.name ?? p.users?.email ?? '(ukjent spiller)'` (`page.tsx:130`) — krasjer ikke på null navn. ✓
- `formatRelativeNb` kalles kun bak `r.lastActionAt ?`-guard (`page.tsx:244`) — ingen null inn. ✓
- Auto-nudge pre-gate `!me.submitted_at && !me.withdrawn_at` leser ekte cachede felt (`PlayerForHole` har begge, `getGameWithPlayers.ts:117,121`). ✓

## Auto-trigger-plassering verifisert

`app/games/[id]/page.tsx:308-316`: gaten `game.status === 'active' && !me.submitted_at && !me.withdrawn_at` ligger ETTER auto-start-re-fetch-blokken (`:290-300`), så `game` er post-auto-start-verdien. Kallet er inne i `after(() => maybeSendDeliveryReminder(...))` — kaster aldri i render-fasen (notify→revalidateTag-presedens). ✓

## Ikke utført (med begrunnelse)

Live klikk-gjennomgang av status-sida og auto-nudge i nettleser ble **ikke** utført. Begge flatene er auth-gatet (krever Supabase admin/spiller-session + et spill i en spesifikk tilstand: aktivt, spiller på 18/18 uten levering). Full e2e er upraktisk i sandkassen uten å seede en kunstig spilltilstand mot prod-DB. UI-kriteriene (K4/K5) er i stedet verifisert via (a) rute kompilerer + vises i build-output, (b) nøye kode-review av render-/sort-/badge-logikk, (c) entry-lenke-wiring på game-detail. Ingen Playwright-kjøring er fabrikkert.
