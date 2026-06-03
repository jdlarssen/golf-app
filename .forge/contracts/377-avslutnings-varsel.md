# Forge-kontrakt — #377 Avslutnings-varsel via samme in-app-først-logikk

**Issue:** [#377](https://github.com/jdlarssen/golf-app/issues/377) — «Avslutnings-varsel via samme in-app-først-logikk (ingen egen avslutningsmail til alle)»
**Branch:** `claude/cranky-davinci-f449dc`
**Milestone:** Tier 4 — End-game robusthet
**Type:** MINOR (ny bruker-synlig oppførsel: cup-deltakere får nå in-app-varsel ved cup-avslutning; mail kun ved off-app)

---

## Bakgrunn

Prinsippet er: **når et spill avsluttes — uavhengig av type — sendes alltid in-app-varsel først, og mail går kun til spillere som ikke ser varselet (off-app).** Ingen blanket-mail til alle.

Brukerbeslutning (2026-06-03, flyt 5-gjennomgang): «Så lenge etter at et spill (uavhengig av type) er avsluttet så skal man først sende varsel, for så å sende mail om varselet ikke blir oppfattet.» → prinsippet gjelder ALLE spilltyper, også cup.

### Status mot dagens kode (verifisert under utforskning)

**Enkeltspill — følger allerede prinsippet (ingen endring trengs):**
- `endGame` ([app/admin/games/[id]/actions.ts:340](app/admin/games/[id]/actions.ts)) og `endGameWithSideWinners` ([app/admin/games/[id]/avslutt/actions.ts:195](app/admin/games/[id]/avslutt/actions.ts)) kaller `notifyPlayersGameFinished` → in-app `game_finished` for ALLE deltakere (`notify()` inserter alltid in-app uavhengig av mail-gating).
- Mail filtreres til off-app via `sendMailByUserId.get(userId) === true`.
- Ingen blanket-mail-sti.
- Allerede Type A-testet: [lib/notifications/events.test.ts](lib/notifications/events.test.ts).

**Cup — bryter prinsippet (dette er arbeidet):**
- `finishTournament` ([lib/cup/actions.ts:300](lib/cup/actions.ts)) sender `sendCupFinishedNotification` som **blanket-mail til alle deltakere**, uten in-app-varsel og uten off-app-gating.
- Det finnes ingen `cup_finished` in-app notification-kind ([lib/notifications/types.ts:8](lib/notifications/types.ts)).

Arbeidet i #377 er derfor: (1) bekrefte enkeltspill-stien (evidens, ingen kode), (2) bringe cup-avslutningen inn i samme in-app-først-system.

---

## Designbeslutninger (tekniske valg gjort selv)

### Ny notification-kind `cup_finished`
Føyes inn i alle uttømmende steder (tsc-build håndhever at ingen glemmes — samme mønster som #376s `deliver_reminder`):
- `lib/notifications/types.ts` — `NotificationKind`-union + `cupFinishedSchema` (`tournament_id`, `tournament_name`) + `schemas`-map. Slank payload speiler `game_finished`.
- `supabase/migrations/0069_cup_finished.sql` — drop+add `notifications_kind_check` med `cup_finished` (mirror 0068).
- `components/notifications/NotificationCard.tsx` — `EMOJI`-Record (`🏁`) + `buildCardContent`-case.
- `app/innboks/InboxClient.tsx` — `buildDeeplink`-case → `/cup/{tournament_id}` (ruta finnes: `app/cup/[id]/page.tsx`, deltaker-facing).

### Delt primitiv `notifyParticipantsCupFinished`
I `lib/notifications/events.ts`, ved siden av `notifyPlayersGameFinished` og strukturelt identisk:
```ts
notifyParticipantsCupFinished(
  participants: Array<{ user_id: string }>,
  tournament: { id: string; name: string },
  logPrefix: string,
): Promise<Map<string, boolean>>   // userId → shouldAlsoSendMail
```
Fyrer `notify({ kind: 'cup_finished', payload: { tournament_id, tournament_name } })` per deltaker (`Promise.allSettled`, best-effort), returnerer per-deltaker mail-gating-flagget. Notify-feil → utelat fra map → fail-closed (ingen mail uten in-app), nøyaktig som game-finished-primitivet.

### `finishTournament`-omskriving
Etter status-flippen til `finished`:
1. `const recipients = await loadTournamentParticipantEmails(supabase, id)` (returnerer allerede `{ user_id, email, name }`).
2. `const sendMailByUserId = await notifyParticipantsCupFinished(recipients, { id, name: snapshot.tournament.name }, 'finishTournament')` — in-app for alle deltakere.
3. Mail kun til off-app: `recipients.filter(r => sendMailByUserId.get(r.user_id) === true)` → `Promise.allSettled` med `sendCupFinishedNotification` (uendret mail-helper + snapshot-payload).

> **Invariant dokumentert i kode-kommentar:** `loadTournamentParticipantEmails` dropper deltakere uten e-post, men Tørny-auth er e-post-OTP — alle brukere har e-post, så denne lista ER hele deltaker-settet. In-app fyrer altså for alle reelle deltakere. (Samme effektive sett som enkeltspill, der `notifyPlayersGameFinished` får alle game_players og mail-recipients er e-post-subsettet.)

### Copy (kjøres gjennom `humanizer:humanizer` før commit)
- In-app card (`cup_finished`): tittel + detalj — utkast «Cupen er avgjort» / `{tournament_name}`, humaniseres før commit.
- **Ingen ny mail-copy** — `cupFinishedNotification.ts` finnes allerede; #377 endrer kun HVEM som får mailen (off-app-gating), ikke mail-innholdet. Ingen ny mail-snapshot.

---

## Filer som endres / opprettes

**Nye:**
- `supabase/migrations/0069_cup_finished.sql`

**Endres:**
- `lib/notifications/types.ts` (kind + `cupFinishedSchema` + schemas-map)
- `lib/notifications/events.ts` (`notifyParticipantsCupFinished`)
- `lib/notifications/events.test.ts` (Type A-tester for nytt primitiv — utvider eksisterende fil)
- `components/notifications/NotificationCard.tsx` (EMOJI + buildCardContent-case)
- `app/innboks/InboxClient.tsx` (buildDeeplink-case)
- `lib/cup/actions.ts` (`finishTournament` → in-app-først + off-app-mail)
- `package.json` + `CHANGELOG.md` (MINOR-bump)

---

## Akseptkriterier (sjekkes med evidens)

- [ ] **K1** — Enkeltspill-avslutning bekreftet: in-app `game_finished` for ALLE deltakere (også aktive), mail kun off-app, ingen blanket-mail. _Evidens: kode-sitat fra `endGame`/`endGameWithSideWinners` + `notifyPlayersGameFinished` + eksisterende `events.test.ts`._
- [ ] **K2** — Ny `cup_finished`-kind wiret gjennom alle uttømmende steder; `npm run build` grønn (tsc håndhever at ingen switch/Record glemmes). _Evidens: union + `cupFinishedSchema` + schemas-map i `types.ts`; `EMOJI` + `buildCardContent`-case i `NotificationCard.tsx`; `buildDeeplink`-case i `InboxClient.tsx`; CHECK i `0069`._
- [ ] **K3** — `notifyParticipantsCupFinished` fyrer in-app `cup_finished` for alle cup-deltakere; returnerer per-deltaker `shouldAlsoSendMail`-map; fail-closed ved notify-rejection. _Evidens: funksjon i `events.ts` + Type A-tester i `events.test.ts` (map, fail-closed, log-prefix, tom liste)._
- [ ] **K4** — `finishTournament` sender in-app til alle og mail KUN til off-app-deltakere; ingen blanket-mail til alle. _Evidens: kode-sitat — `notifyParticipantsCupFinished(recipients, ...)` → `recipients.filter(r => sendMailByUserId.get(r.user_id) === true)` før mail-fan-out._
- [ ] **K5** — Migrasjon `0069_cup_finished.sql` skrevet + applisert (Supabase MCP; additiv CHECK-utvidelse, trygg). _Evidens: `apply_migration` → success; fil i `supabase/migrations/`._
- [ ] **K6** — Innboks-kort for `cup_finished` viser fornuftig tittel/detalj + deeplinker til `/cup/{tournament_id}`; norsk copy kjørt gjennom humanizer. _Evidens: `buildCardContent`-case + `buildDeeplink`-case + humanizer-kjøring._
- [ ] **K7** — Version-bump (MINOR) + CHANGELOG-oppføring i samme commit som feature. _Evidens: `package.json` 1.72.0 + CHANGELOG-oppføring._
- [ ] **K8** — Gates grønne: `npm run build` + `npx vitest run` (berørte filer). _Evidens: build «✓ Compiled successfully»; vitest grønn på `lib/notifications` + cup-tester._

---

## Out of scope (filerres som egne funn ved behov)

- **Cup-START-varsel** (`sendCupStartedNotification`, [lib/cup/actions.ts:238](lib/cup/actions.ts)) er samme blanket-mail-anti-mønster, men #377 gjelder AVSLUTNING. Filerres som eget issue (in-app-først for cup-start).
- **Per-match `game_finished` inni en cup** — hver cup-match er et `game`; enkeltspill-stien dekker dette allerede der den brukes. Ingen ny utgraving.
- **WD-spillere** — bruker bekreftet (2026-06-03): trukne spillere får fortsatt avslutnings-varsel. Ingen `withdrawn_at`-filter.
- **Mail-innhold/-template for cup** — uendret; kun mottaker-gating endres.

## Gates
1. `npm run build` — tsc-uttømmende (kind i alle switch/Record) + lint.
2. `npx vitest run lib/notifications lib/cup lib/mail` + berørte co-located test-filer.
3. Migrasjon applisert via Supabase MCP (`apply_migration`).

## Risiko
- `cup_finished` deeplink `/cup/{id}` må være nåbar for deltakere (ikke admin-gated) — verifiseres (ruta er `PublicCupPage`).
- tsc-uttømmende: ny kind MÅ inn i alle 4 wiring-steder ellers feiler Vercel-build (per memory `feedback_tsc_gate_preexisting_trap`).
- Mail-snapshot: ingen ny mail = ingen ny chrome-lås nødvendig.
