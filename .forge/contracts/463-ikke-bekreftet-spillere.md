# Forge-kontrakt: «Ikke bekreftet» — lagt-til spillere må godta (#463)

**Issue:** [#463](https://github.com/jdlarssen/golf-app/issues/463)
**Branch:** `claude/eager-ptolemy-2f8319`
**Type:** feat (område: scoring/admin/leaderboard/auth + ny migrasjon)
**Versjon:** minor → `1.84.0` (ny bruker-synlig modell: bekreftelses-status overalt der man legges til)

## Sammendrag

Når en arrangør legger til en *annen* bruker i et spill/liga, blir det i dag en stille innsetting. Issuet gjør hver slik handling til en invitasjon mottakeren nudges til å bekrefte. Spilleren er **fullt med** (scorene teller, ingenting blokkeres) — `accepted_at = null` gir bare en «Ikke bekreftet»-badge + et innboks-varsel. Funnel-en drar spillere inn i appen.

## Beslutninger (avklart med eier)

1. **Modell = merkelapp + dytt.** Ingen hard sperre på scoring/spillstart. Badge + varsel.
2. **Bekreftelse:** auto ved aktivitet (åpner spillet ELLER taster score) **+** eksplisitt «Bekreft»-knapp i innboks/varsel. Aktive spillere rydder badgen selv.
3. **Admin-purre:** ja — gjenbruk den eksisterende spillerstatus-flaten (`/admin/games/[id]/status`, #376-mønster) med en «purr ubekreftede»-knapp.

## Kjerneprinsipp for innsetting

> `accepted_at = now()` når raden lages av/for brukeren selv gjennom deres egen handling; `accepted_at = null` når en arrangør lager den for noen andre.

Per-rad-regel: `user_id === actingUserId ? now() : null`.

## Touch-points (verifisert i kode 2026-06-07 via recon)

### Datamodell (migrasjon `0082` — neste ledige; siste er `0081`)
- `game_players.accepted_at timestamptz null`
- `league_players.accepted_at timestamptz null`
- **Backfill:** alle eksisterende rader `accepted_at = now()` (de er allerede «med»).
- RLS (speil `0012_mark_invitations_accepted`, men på `auth.uid()`): bruker kan UPDATE `accepted_at` kun på egen rad, `using (user_id = auth.uid() and accepted_at is null)`, `with check (user_id = auth.uid() and accepted_at is not null)` — for begge tabeller.
- Applyes til prod via Supabase MCP (additiv + backfill = trygt før kode-deploy; speiler Liga `0080`-mønsteret).

### Innsettings-regler (per-rad `actingUserId`-sjekk)
| Sted | Fil | Regel |
|---|---|---|
| Picker-add (eks. bruker) | `app/admin/games/[id]/inviteToGameActions.ts` `addExistingPlayerToGame` | annen → `null` |
| E-post→eks. bruker | samme fil `inviteEmailToGame` | annen → `null` |
| OTP-aksept (game-scoped) | `app/(auth)/login/actions.ts` `verifyCode` | self → `now()` (handlingen ER aksept) |
| Lag-påmelding (kaptein) | `app/signup/[shortId]/teamActions.ts` | kaptein self → `now()`, medspillere → `null` |
| Selv-påmelding (open) | `app/signup/[shortId]/actions.ts` | self → `now()` |
| Admin opprett (bulk) | `app/admin/games/new/actions.ts` | per rad: `user_id === creator ? now() : null` |
| Liga flight-start | `lib/league/actions.ts` `startLeagueRoundFlight` | starter self → `now()`, flight-co → `null` |
| Liga opprett | `lib/league/actions.ts` `createLeagueDraft` | per rad: creator → `now()`, andre → `null` |
| Liga legg-til | `lib/league/actions.ts` `addLeaguePlayers` | andre → `null` |

### Bekreft-handling
- Ny server-action `confirmParticipation(gameId)` / `confirmLeagueParticipation(leagueId)`: RLS-backed (bruker-klient), setter `accepted_at = now()` på egen rad. Brukes av «Bekreft»-knapp i varsel/innboks + roster.
- Auto-bekreft: ny `maybeAutoConfirmParticipation(gameId, userId)` (speil `maybeSendDeliveryReminder`), admin-klient, idempotent atomisk `update … where accepted_at is null`. Hektes på game-home `after()`-callback (`app/games/[id]/page.tsx`) = «åpnet spillet». (Hull-siden nås via game-home; game-home er det kanoniske «åpnet»-signalet.)

### Varsel (nytt kind)
- Ny `NotificationKind` `'player_added'` i `lib/notifications/types.ts` (TS-union + zod-payload `{ game_id|league_id, name }`) + DB-constraint (`drop/re-add notifications_kind_check`, ny migrasjon-blokk i `0082`).
- Ved arrangør-add av annen bruker: `notify({ userId, kind: 'player_added', payload })` — «{navn} la deg til i {X}. Bekreft deltakelse.» med «Bekreft»-knapp (NotificationBell/innboks-rendering).

### Badge «Ikke bekreftet» (der `accepted_at is null`)
- Game-home roster: `app/games/[id]/page.tsx` (krever `accepted_at` i `getGameWithPlayers`-select → tag `game-${id}`).
- Admin spill-side + status-side: `app/admin/games/[id]/page.tsx`, `app/admin/games/[id]/status/page.tsx` (legg `accepted_at` i select).
- Liga-deltakere: `app/liga/[id]/...` + `app/admin/liga/[id]/...`.

### Admin-purre (gjenbruk #376)
- `app/admin/games/[id]/status/actions.ts`: ny action `remindUnconfirmedPlayers(gameId)` (speil `remindUnsubmittedPlayers`) → `sendAddConfirmationReminder` for hver ubekreftet. Idempotens via nytt `game_players.confirm_reminder_sent_at` ELLER gjenbruk uten stamp (nudge kan sendes flere ganger — avklar: bruk eget `*_sent_at` for auto, men admin-purre kan sende på nytt). Knapp på `status/page.tsx` (`RemindButton`-mønster).

## Gates
- `npx tsc --noEmit` (full)
- `npm run build` (Vercel-paritet)
- Co-located tester for hver endret `*.ts/.tsx` med egen `*.test`
- `npx vitest run` på berørte: gamePayload, league actions, notifications, inviteToGame, signup actions, status actions

## Akseptkriterier
- [x] Migrasjon `0082` lagt til + applyt til prod (begge `accepted_at`-kolonner + backfill + RLS for begge tabeller). Verifisert via MCP (gp 13/0 null, lp 0/0, 2 policies, kind_ok true).
- [x] Arrangør-add av annen bruker → `accepted_at = null`; self/egen-rad/OTP-aksept/selv-påmelding → `now()`. `acceptedAtForActor`-helper (3 Type-A-tester) wiret på alle 9+ innsettings-steder; verifyCode-testen oppdatert.
- [x] «Bekreft»-knapp setter `accepted_at = now()` på egen rad (RLS-backed). `confirmParticipation`/`confirmLeagueParticipation` i confirmActions.ts.
- [x] Auto-bekreft ved å åpne spillet/liga-siden (`after()`), idempotent (`maybeAutoConfirmParticipation` / `...League...`, atomisk `is('accepted_at', null)`).
- [x] «Ikke bekreftet»-badge vises i game-roster, admin-spill/status, og liga-deltakere når `accepted_at is null` (`UnconfirmedBadge`, 4 flater).
- [x] Arrangør-add nudges via in-app-varsel (eksisterende `invite`-kind på add; `player_added` brukes som confirm-purre — bevisst forenkling, ingen dobbelt-varsel).
- [x] Admin-purre-knapp for ubekreftede på spillerstatus-siden (`remindUnconfirmedPlayers` + knapp).
- [x] Historiske rader uberørt (backfill = now() — MCP-verifisert 0 nulls).
- [x] `tsc` + `build` grønt; versjon `1.84.0` + CHANGELOG (ny minor-serie, 1.83.y kollapset).

**Avvik fra kontrakt:** `player_added`-varselet ble repurposed fra «on-add» til «admin-purre-reminder» — on-add beholder den eksisterende `invite`-kinden (konsistent på tvers av bulk-create/edit/picker-add; unngår to varsler på samme handling). `mode_config.teams_count`-type var allerede number. Team-medspiller dobbelt-varsel (subagent) fjernet.

## Utenfor scope
- Auto-vennskap ved aksept (#464s nice-to-have).
- «Kun venner i picker» (#464 — egen issue, deler flate).
- Hard sperre på scoring/start for ubekreftede (bevisst: merkelapp + dytt).
- Cup-spesifikk re-confirm utover game_players (cup-flights ER game_players → dekkes av game-regelen).

## Bygge-rekkefølge (chunks, atomiske commits)
1. Migrasjon `0082` + RLS + apply via MCP + verifiser (`chore(db)` / `feat` m/ bump på sluttcommit).
2. Innsettings-regler game_players (+ Type-A-tester per sted).
3. Innsettings-regler league_players (+ tester).
4. `accepted_at` inn i `getGameWithPlayers` + select-stedene; bekreft-action + auto-confirm-helper (+ tester).
5. Badge i alle roster-views.
6. `player_added`-varsel + admin-purre (gjenbruk #376) (+ tester).
7. CHANGELOG + bump `1.84.0` (feat-commit bærer bumpen).
