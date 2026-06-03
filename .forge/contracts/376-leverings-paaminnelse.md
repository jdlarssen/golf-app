# Forge-kontrakt — #376 Leverings-påminnelse (auto-nudge + admin spillerstatus/purring)

**Issue:** [#376](https://github.com/jdlarssen/golf-app/issues/376) — «Leverings-påminnelse: auto-varsel når spilleren er ferdig (hull 18) + admin-purring»
**Branch:** `claude/focused-darwin-ee21c3`
**Milestone:** Tier 4 — End-game robusthet
**Type:** MINOR (ny bruker-synlig feature)

---

## Bakgrunn

I dag finnes ingen påminnelse til spillere om å levere scorekortet. Har spilleren tastet alle 18 hull men ikke levert, må arrangøren mase manuelt eller bruke «avslutt likevel» (#375). Vi bygger to mekanismer på toppen av det eksisterende varsel-systemet (`notify()` + in-app-først + off-app-mail-gating + `Promise.allSettled` best-effort):

1. **Auto-nudge (primær):** Når en spiller har registrert alle 18 hull men ikke levert, fyres ett `deliver_reminder`-varsel automatisk. In-app alltid; mail kun til off-app-spillere (samme terskel-gating som øvrige varsler). Idempotent — én gang per spiller.
2. **Admin spillerstatus + purring (sekundær):** En dedikert **spillerstatus-side** der arrangøren ser hvor langt hver spiller har kommet (X/18 hull), hvem som er ferdige men ikke har levert, og «tid siden siste registrering» som hint om hvem som må purres. Derfra sender arrangøren én knapp-purring til de ferdige-men-ikke-leverte.

Brukerbeslutning (2026-06-03): admin vil se dette som en **status-side over spillere** med fremdrift + «tid siden forrige aksjon», ikke bare en naken knapp.

---

## Designbeslutninger (tekniske valg gjort selv)

### Ny notification-kind `deliver_reminder`
Føyes inn i alle 6 uttømmende steder (tsc-build håndhever at ingen glemmes):
- `lib/notifications/types.ts` — `NotificationKind`-union + `deliverReminderSchema` (`game_id`, `game_name`) + `schemas`-map.
- `supabase/migrations/0068_deliver_reminder.sql` — drop+add `notifications_kind_check` med ny verdi (samme mønster som 0044).
- `components/notifications/NotificationCard.tsx` — `EMOJI`-Record + `buildCardContent`-switch.
- `app/innboks/InboxClient.tsx` — `buildDeeplink`-switch → `/games/{game_id}/submit`.

### Idempotens via ny kolonne
`game_players.deliver_reminder_sent_at timestamptz` (migrasjon 0068). Atomisk betinget update er gaten — samme airtight-mønster som `submitScorecard`s `.is('submitted_at', null)`:
```sql
update game_players set deliver_reminder_sent_at = now()
 where game_id = ? and user_id = ?
   and deliver_reminder_sent_at is null
   and submitted_at is null
   and withdrawn_at is null
 returning user_id;
```
Returneres en rad → vi «vant» → fyr varsel. Ingen rad → allerede purret / allerede levert / trukket → skip. Re-render/re-visit gir aldri duplikat.

### Auto-trigger: i game-home server-render via `after()`
Spilleren ser game-home (`app/games/[id]/page.tsx`). Pre-gate i render: `game.status === 'active' && !me.submitted_at && !me.withdrawn_at`. Da skedules `after(() => maybeSendDeliveryReminder({ gameId, userId, gameName }))` — `after()` fordi `notify()` kaller `revalidateTag` som kaster i render-fasen (samme presedens som auto-start-fallbacken + `markNotificationsRead` allerede i denne fila).

`maybeSendDeliveryReminder` (server-only, admin-client) self-gater:
1. Tell hull med `strokes is not null` for (gameId, userId). < 18 → return.
2. Atomisk kolonne-guard (over). Ingen rad → return.
3. `notify({ kind: 'deliver_reminder', ... })` → in-app insert + `shouldAlsoSendMail`.
4. Hvis `shouldAlsoSendMail` og spiller har e-post → `sendDeliverReminderNotification(...)` (best-effort).

Helperen self-gater på hull-telling, så den er frikoblet fra Suspense-barnet `PrimaryCtaSection` og gjenbruker den verifiserte `after()`-plasseringen i hoved-body. Best-effort: svelger feil (`console.error`), kaster aldri (kjører i `after()`).

> Bevisst begrensning: auto-mail fyrer sjelden, fordi trigger-flaten krever at spilleren er på game-home (= aktiv = in-app, ikke off-app). Det er korrekt — auto-nudgen dekker den aktive glemmeren via innboks/bell; admin-purringen er den bevisste mail-stien for spillere som har gått hjem. Dokumenteres i kode-kommentar.

### Admin spillerstatus-side `/admin/games/[id]/status`
Server-component, `requireAdmin`. Laster `game_players` (+ `users`) og en `scores`-aggregat (`select user_id, hole_number, updated_at where strokes is not null` — ingen `strokes`-verdier, ingen spoiler). Per spiller:
- **Fremdrift:** `holesFilled` / 18.
- **Status-badge:** via ren `classifyDeliveryStatus(...)` (se under).
- **Siste registrering:** `max(updated_at)` → `formatRelativeNb(...)` («for 12 min siden»), eller «—» uten registreringer.
- Ferdige-men-ikke-leverte flagges visuelt (purre-kandidatene), sorteres øverst.

**Purre-action:** `remindUnsubmittedPlayers(gameId)` server-action → mål-sett = spillere med `holesFilled === 18 && !submitted_at && !withdrawn_at` → `sendDeliveryReminder` per spiller (`Promise.allSettled`, best-effort) → redirect tilbake med suksess-banner. Bekreftelse: liten to-trinns confirm-knapp (klient-komponent, speiler `ApprovePlayerButton`/`EndGameButton`-mønstret). Mål-settet (de ferdige-men-ikke-leverte) er synlig på sida før send, så ingen separat bekreftelses-side trengs.

> Scoping: bulk-purringen treffer **kun ferdige-men-ikke-leverte** (holder copy-en korrekt: «du er ferdig, husk å levere», og matcher brukerens signal «gått 18 registrerte hull men ikke levert»). Spillere midt i runden vises med fremdrift, men purres ikke automatisk (de er ikke ferdige). Auto-nudge + manuell purre deler samme `sendDeliveryReminder`-primitiv.

**Discoverability:** I aktiv-spill «Avslutt spillet»-kortet på game-detail, når `notSubmittedCount > 0`: lenke «Se spillerstatus og purr →» → `/admin/games/[id]/status`. Knytter purringen til avslutt-flyten (issue: «i avslutt-flyten / spill-detalj»).

### Delt primitiv + ren logikk
- `lib/notifications/events.ts` (ved siden av `notifyPlayersGameFinished`): `sendDeliveryReminder({ player: { userId, email, name }, game: { id, name } })` — `notify()` + betinget mail. Gjenbrukes av auto-trigger og admin-purre.
- `lib/games/deliveryStatus.ts`: ren `classifyDeliveryStatus({ holesFilled, submittedAt, approvedAt, withdrawnAt, requirePeerApproval })` → `'withdrawn' | 'delivered' | 'pending_approval' | 'ready_not_delivered' | 'playing' | 'not_started'`. Type A-testet.

### Ny mail-helper
`lib/mail/deliverReminderNotification.ts` — speiler `scorecardSubmittedNotification.ts` (enkelt single-recipient), men **spiller-rettet**, deeplink `/games/{gameId}/submit`. Type B snapshot-test (subject + text + ekstrahert body).

### Copy (kjøres gjennom `humanizer:humanizer` før commit)
- In-app: tittel «Husk å levere scorekortet», detalj «Du er ferdig i {game_name}», emoji `📤`.
- Mail subject: «Lever scorekortet i {gameName}». Heading «Lever scorekortet». Body: «Du spilte ferdig {gameName}, men scorekortet er ikke levert ennå. Lever det, så er du med i resultatet.» CTA «Lever scorekortet».

---

## Filer som endres / opprettes

**Nye:**
- `supabase/migrations/0068_deliver_reminder.sql`
- `lib/mail/deliverReminderNotification.ts` + `.test.ts`
- `lib/games/deliveryStatus.ts` + `.test.ts`
- `app/admin/games/[id]/status/page.tsx`
- `app/admin/games/[id]/status/actions.ts` (`remindUnsubmittedPlayers`)
- `app/admin/games/[id]/status/RemindButton.tsx` (to-trinns confirm)

**Endres:**
- `lib/notifications/types.ts` (kind + schema)
- `lib/notifications/events.ts` (`sendDeliveryReminder`)
- `lib/notifications/maybeSendDeliveryReminder.ts` (ny server-only helper, eller i events.ts)
- `components/notifications/NotificationCard.tsx` (EMOJI + content)
- `app/innboks/InboxClient.tsx` (deeplink)
- `app/games/[id]/page.tsx` (auto-trigger `after()`)
- `app/admin/games/[id]/page.tsx` (lenke til status-side i «Avslutt spillet»-kortet)
- `package.json` + `CHANGELOG.md` (MINOR-bump)

---

## Akseptkriterier (sjekkes med evidens)

- [ ] **K1** — Ny `deliver_reminder`-kind wiret gjennom alle uttømmende steder; `npm run build` grønn (tsc håndhever).
- [ ] **K2** — Spiller med 18/18 registrert + ikke levert + ikke trukket får nøyaktig ETT in-app `deliver_reminder` (idempotent via `deliver_reminder_sent_at`-guard). Mail kun ved off-app (`shouldAlsoSendMail`).
- [ ] **K3** — Gjentatt game-home-render/-besøk gir ingen duplikat-varsler (kolonne-guard).
- [ ] **K4** — Admin spillerstatus-side viser per spiller: fremdrift X/18, status-badge, «siste registrering» relativ tid; ferdige-men-ikke-leverte flagges.
- [ ] **K5** — Admin-purre-knapp sender `deliver_reminder` til alle ferdige-men-ikke-leverte (in-app + off-app-mail), best-effort, med confirm + suksess-feedback; nåbar fra game-detail (aktive spill).
- [ ] **K6** — `lib/mail/deliverReminderNotification.ts` finnes (spiller-rettet, submit-deeplink) + Type B snapshot-test grønn.
- [ ] **K7** — Ren `classifyDeliveryStatus` + Type A `it.each`-test grønn over alle 6 states.
- [ ] **K8** — Migrasjon `0068_deliver_reminder.sql` skrevet + applisert (Supabase MCP; additiv, trygg).
- [ ] **K9** — All ny norsk copy kjørt gjennom humanizer; version-bump (MINOR) + CHANGELOG-oppføring i samme commit som feature.
- [ ] **K10** — Gates grønne: `npm run build` + `npx vitest run` (berørte filer).

## Out of scope
- Purring av spillere midt i runden (< 18 hull) — vises, men purres ikke.
- Tidsforsinket/eskalerende auto-nudge (cron) — vi fyrer på første ferdig-deteksjon.
- #377 (avslutnings-varsel-mail) — egen issue, deler kun in-app-først-logikken.
- 9-hulls spill — appen er 18-hull (`hole_number between 1 and 18`).

## Gates
1. `npm run build` — tsc-uttømmende (kind i alle switch/Record) + lint.
2. `npx vitest run lib/mail lib/notifications lib/games` + nye co-located test-filer.
3. Migrasjon applisert via Supabase MCP (`apply_migration`).

## Risiko
- `after()` i game-home: verifiseres at varselet faktisk fyres i preview/runtime (formell evaluator + Vercel-logg).
- Mail-snapshot: ÉN chrome-lås per template (test-disiplin B).
- RLS: admin leser `scores`-timestamps — allerede bevist mulig (eksisterende `progressPromise` i game-detail).
