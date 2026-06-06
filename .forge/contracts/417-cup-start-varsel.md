# Forge-kontrakt — #417 Cup-start-varsel via in-app-først-logikk

**Issue:** [#417](https://github.com/jdlarssen/golf-app/issues/417) — «Cup-start-varsel via in-app-først-logikk (ingen blanket-mail til alle)»
**Branch:** `claude/frosty-shockley-916262`
**Milestone:** Backlog → flyttes til Tier 4 (End-game robusthet) — symmetrisk søster av #377 som lå i Tier 4.
**Type:** MINOR (ny bruker-synlig oppførsel: cup-deltakere får nå in-app-varsel ved cup-start; mail kun ved off-app)

---

## Bakgrunn

Prinsippet (brukerbeslutning 2026-06-03, flyt 5-gjennomgang, sitert i #377-kontrakten): **når et spill skifter tilstand — uavhengig av type — sendes alltid in-app-varsel først, og mail går kun til deltakere som ikke ser varselet (off-app). Ingen blanket-mail til alle.**

#377 brakte cup-**avslutningen** inn i dette systemet (ny `cup_finished`-kind + `notifyParticipantsCupFinished`). Under det arbeidet ble cup-**start** filert som eget funn (#417): `startTournament` ([lib/cup/actions.ts:199](lib/cup/actions.ts)) har nøyaktig samme anti-mønster — `sendCupStartedNotification` fyres som **blanket-mail til alle deltakere** uten in-app-varsel og uten off-app-gating.

Dette issuet er den **symmetriske start-varianten** av #377. Mønsteret er ferdig demonstrert og shipped (PR #418, v1.72.0). Arbeidet er en presis speiling: samme primitiv-form, samme wiring-steder, samme gating, kun `finished`→`active` / `cup_finished`→`cup_started` byttet.

### Status mot dagens kode (verifisert under utforskning)

- **`startTournament`** ([lib/cup/actions.ts:234-257](lib/cup/actions.ts)): laster `loadTournamentParticipantEmails` og `Promise.allSettled`-fan-outer `sendCupStartedNotification` til **alle** `recipients.map(...)` — ingen in-app, ingen gating. Dette er anti-mønsteret.
- **Ingen `cup_started` in-app-kind** finnes ([lib/notifications/types.ts:8-25](lib/notifications/types.ts) topper på `friend_accepted`).
- **`notify()`-gating er trygg** ([lib/notifications/notify.ts:78-83](lib/notifications/notify.ts)): `shouldSendMailFallback` returnerer `true` (→ send mail) når `last_seen_at == null` (aldri logget inn) eller stale (off-app > terskel). Aldri-innlogget deltaker droppes derfor IKKE — den får mail. Aktiv deltaker får in-app, ingen mail. Insert-feil → `false` → fail-closed (ingen mail uten in-app). Ingen deltaker faller mellom to stoler. Dette er ekstra relevant ved start (flere deltakere er reelt off-app før de har engasjert seg).

---

## Designbeslutninger (speiler #377 nøyaktig)

### Ny notification-kind `cup_started`
Føyes inn i alle uttømmende steder (tsc-build håndhever at ingen glemmes — samme som `cup_finished`/`deliver_reminder`):
- `lib/notifications/types.ts` — `NotificationKind`-union + `cupStartedSchema` (`tournament_id`, `tournament_name`) + `schemas`-map. Identisk slank payload som `cupFinishedSchema`.
- `supabase/migrations/0079_cup_started.sql` — drop+add `notifications_kind_check` med **hele gjeldende kind-settet** (fra 0077) **+ `cup_started`**. Additiv CHECK-utvidelse, trygg å applye før kode-deploy (jf. 0075/0077-headerne).
- `components/notifications/NotificationCard.tsx` — `EMOJI`-Record (`🏌️`) + `buildCardContent`-case (tittel «Cupen har startet», detalj = `tournament_name`).
- `app/innboks/InboxClient.tsx` — `buildDeeplink`-case → `/cup/{tournament_id}` (samme rute som `cup_finished`; `app/cup/[id]/page.tsx` = deltaker-facing `PublicCupPage`).

### Delt primitiv `notifyParticipantsCupStarted`
I `lib/notifications/events.ts`, ved siden av `notifyParticipantsCupFinished` og strukturelt identisk:
```ts
notifyParticipantsCupStarted(
  participants: Array<{ user_id: string }>,
  tournament: { id: string; name: string },
  logPrefix: string,
): Promise<Map<string, boolean>>   // userId → shouldAlsoSendMail
```
Fyrer `notify({ kind: 'cup_started', payload: { tournament_id, tournament_name } })` per deltaker (`Promise.allSettled`, best-effort), returnerer per-deltaker mail-gating-flagget. Notify-feil → utelat fra map → fail-closed (ingen mail uten in-app), nøyaktig som `cup_finished`-primitivet. Type A-tester i `events.test.ts` (mirror av de 4 `notifyParticipantsCupFinished`-testene, log-prefix `'startTournament'`).

### `startTournament`-omskriving
Etter status-flippen til `active`, erstatt dagens blanket-mail-blokk med:
1. `const recipients = await loadTournamentParticipantEmails(supabase, id)` (returnerer allerede `{ user_id, email, name }`).
2. `const sendMailByUserId = await notifyParticipantsCupStarted(recipients, { id, name: current.name }, 'startTournament')` — in-app for alle deltakere.
3. Mail kun til off-app: `recipients.filter((r) => sendMailByUserId.get(r.user_id) === true)` → `Promise.allSettled` med `sendCupStartedNotification` (uendret mail-helper + payload: `team1Name`/`team2Name`/`pointsToWin` fra `current`).

> **Invariant dokumentert i kode-kommentar** (kopieres fra `finishTournament`): `loadTournamentParticipantEmails` dropper deltakere uten e-post, men Tørny-auth er e-post-OTP — alle brukere har e-post, så lista ER hele deltaker-settet. In-app fyrer for alle reelle deltakere.

### Copy (kjørt gjennom `humanizer:humanizer` før commit)
- In-app card (`cup_started`): tittel **«Cupen har startet»** (brukervalg 2026-06-06), detalj = `{tournament_name}`. Emoji **🏌️**.
- **Ingen ny mail-copy** — `cupStartedNotification.ts` finnes allerede; #417 endrer kun HVEM som får mailen (off-app-gating), ikke mail-innholdet. Ingen ny mail-snapshot.

---

## Filer som endres / opprettes

**Nye:**
- `supabase/migrations/0079_cup_started.sql`

**Endres:**
- `lib/notifications/types.ts` (kind + `cupStartedSchema` + schemas-map)
- `lib/notifications/events.ts` (`notifyParticipantsCupStarted`)
- `lib/notifications/events.test.ts` (Type A-tester for nytt primitiv — utvider eksisterende fil)
- `components/notifications/NotificationCard.tsx` (EMOJI + buildCardContent-case)
- `app/innboks/InboxClient.tsx` (buildDeeplink-case)
- `lib/cup/actions.ts` (`startTournament` → in-app-først + off-app-mail)
- `package.json` + `CHANGELOG.md` (MINOR-bump til 1.82.0; wrap 1.81.y-serie i `<details>`)

---

## Akseptkriterier (sjekkes med evidens)

- [x] **K1** — Ny `cup_started`-kind wiret gjennom alle uttømmende steder; `npm run build` grønn (tsc håndhever at ingen switch/Record glemmes). _Evidens: union ([types.ts:22](lib/notifications/types.ts)) + `cupStartedSchema` + schemas-map (`cup_started: cupStartedSchema`); `EMOJI['cup_started'] = '🏌️'` + `buildCardContent`-case («Cupen har startet») i [NotificationCard.tsx](components/notifications/NotificationCard.tsx); `buildDeeplink`-case → `/cup/{id}` i [InboxClient.tsx](app/innboks/InboxClient.tsx); CHECK i [0079](supabase/migrations/0079_cup_started.sql). `npm run build` → «✓ Compiled successfully in 2.9s»._
- [x] **K2** — `notifyParticipantsCupStarted` fyrer in-app `cup_started` for alle cup-deltakere; returnerer per-deltaker `shouldAlsoSendMail`-map; fail-closed ved notify-rejection. _Evidens: funksjon i [events.ts](lib/notifications/events.ts) + 4 Type A-tester i [events.test.ts](lib/notifications/events.test.ts) (map, fail-closed, log-prefix, tom liste). `npx vitest run` → 206 tester grønne (4 nye)._
- [x] **K3** — `startTournament` sender in-app til alle og mail KUN til off-app-deltakere; ingen blanket-mail til alle (tidligere `recipients.map(...)` uten gating er borte). _Evidens: [lib/cup/actions.ts](lib/cup/actions.ts) — `notifyParticipantsCupStarted(recipients, { id, name: current.name }, 'startTournament')` → `recipients.filter((r) => sendMailByUserId.get(r.user_id) === true)` før mail-fan-out._
- [x] **K4** — Migrasjon `0079_cup_started.sql` skrevet + applisert (Supabase MCP; additiv CHECK-utvidelse med hele 0077-settet + `cup_started`). _Evidens: `apply_migration` → `{"success":true}`; fil i supabase/migrations/ (renummerert 0078→0079 etter rebase pga. #444-kollisjon)._
- [x] **K5** — Innboks-kort for `cup_started` viser «Cupen har startet» + cup-navn og deeplinker til `/cup/{tournament_id}`; norsk copy kjørt gjennom humanizer. _Evidens: `buildCardContent`-case (tittel «Cupen har startet», detalj = `tournament_name`) + `buildDeeplink` → `/cup/{tournament_id}`; humanizer-verdikt: ren (V2-ordstilling, ingen anglisisme/særskriving/AI-tell), beholdt uendret._
- [x] **K6** — Version-bump (MINOR → 1.82.0) + CHANGELOG-oppføring i samme commit som feature; 1.81.y-serie wrappet i `<details>`. _Evidens: package.json 1.82.0 + CHANGELOG `## 1.82.y — Cup-start-varsel`-serie åpen, 1.81.y wrappet i `<details><summary><strong>1.81.y … (3 oppføringer)</strong>`; commit `726a9dc` (commit-msg-hook passerte)._
- [x] **K7** — Gates grønne: `npm run build` + `npx vitest run lib/notifications lib/cup lib/mail` (berørte filer) + co-located tester. _Evidens: build «✓ Compiled successfully in 2.9s»; `npx vitest run lib/notifications lib/cup lib/mail` → 24 filer / 206 tester grønne._

---

## Out of scope (filerres som egne funn ved behov)

- **Per-match `game_started`/`game_finished` inni en cup** — hver cup-match er et `game`; enkeltspill-stien dekker dette der den brukes. Ingen ny utgraving.
- **WD-spillere** — bruker bekreftet (2026-06-03, #377): trukne deltakere får fortsatt varsel. Ingen `withdrawn_at`-filter.
- **Mail-innhold/-template for cup-start** — uendret; kun mottaker-gating endres. Ingen ny mail-snapshot.
- **`min 2 matches`-guard + status-guards** i `startTournament` — uendret; kun mail/varsel-blokken røres.

## Gates
1. `npm run build` — tsc-uttømmende (kind i alle switch/Record) + lint.
2. `npx vitest run lib/notifications lib/cup lib/mail` + berørte co-located test-filer.
3. Migrasjon applisert via Supabase MCP (`apply_migration`).

## Risiko
- tsc-uttømmende: ny kind MÅ inn i alle wiring-steder ellers feiler Vercel-build (per memory `feedback_tsc_gate_preexisting_trap`). `npm run build` (ikke bare vitest) er gaten.
- Migrasjon må mirrore **gjeldende** constraint (0077-settet), ikke stale 0069-settet — ellers droppes nyere kinds (`friend_*`, `club_*`). Verifisert: 0077 er siste som rører `notifications_kind_check`.
- `cup_started` deeplink `/cup/{id}` er allerede verifisert nåbar for deltakere via #377 (`PublicCupPage`).
- Mail-snapshot: ingen ny mail = ingen ny chrome-lås nødvendig.
