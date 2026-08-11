# Spec: Varsle berørte spillere når scorekort eller spill gjenåpnes

**Issue:** #1363 · **Branch:** claude/1363-reopen-notifications

## Problem

`reopenScorecard` (`app/[locale]/admin/games/[id]/actions.ts:440-484`) og `reopenGame` (:590-631) kaller kun `logAdminEvent` + revalidate — ingen `notify()`. Kontrast i samme fil: start, godkjenning og avslutning varsler alle (game_started :112-133, `scorecard_approved` i `adminApproveScorecard` :210-234, game_finished :383-387). Spilleren hvis kort gjenåpnes tror fortsatt hen er ferdig («levert og godkjent» var siste status), og avslutningen blokkerer deretter på `not_all_submitted`. Ved `reopenGame` ser deltakerne resultatlisten forsvinne uten forklaring. Auto-nudgen (`maybeSendDeliveryReminder`, `(home)/page.tsx:392-401`) hjelper bare den som selv åpner spill-hjem.

## Design

Følg 0149-mønsteret (`0149_scorecard_rejected_notification.sql` — siste kind-utvidelse) ende-til-ende:

1. **Migrasjon `supabase/migrations/0151_reopen_notifications.sql`** (0150 er høyeste på `origin/main` per 2026-08-05 — re-verifiser nummeret rett før commit): utvid `notifications_kind_check` med `'scorecard_reopened'` og `'game_reopened'` (atomær `drop constraint` + `add constraint` med hele verdilista re-statet, jf. 0149:22-51). Staging først via Supabase MCP, verifiser, prod kun gjennom brannmur-luka #1074 (nattkjøreren rører kun staging).
2. **`lib/notifications/types.ts`:** kind-union (:12-13-området) + zod-payload-skjemaer + `schemas`-map (:309-310). Payloads:
   - `scorecard_reopened`: `{ game_id, game_name, actor_name? }`
   - `game_reopened`: `{ game_id, game_name, actor_name? }`
   `actor_name` er **optional** — ikke hardkod norsk fallback-prosa i payload (samme prinsipp som #1364-kontrakten skrevet i dag; render-tida oversetter).
3. **`lib/notifications/cardContent.ts`:** title/detail for begge kinds via t-nøkler i `messages/no.json` + `en.json` (`inbox.kinds.*`; katalog-paritet håndheves av `messages/catalogParity.test.ts`). Retning på copy (humanizer på endelig norsk): «Scorekortet ditt i {gameName} er gjenåpnet — rediger og lever på nytt» / «{gameName} er gjenåpnet av arrangøren». Merk: `inboxTranslator.ts` er kind-agnostisk (ren `createTranslator`-fabrikk) — ingen endring der.
4. **`lib/notifications/deeplink.ts`:** begge kinds → spill-hjem `/games/[id]` (samme som `scorecard_approved`, :33-42). Både `cardContent` og `deeplink` er compile-håndhevet (strict, ingen `default`-gren) — tsc feiler til casene finnes.
5. **`components/notifications/NotificationCard.tsx`:** `EMOJI: Record<NotificationKind, string>` (:27) er exhaustive — tsc feiler uten emoji-oppføring for begge nye kinds. Velg emoji i stil med naboene (Claude's Discretion, f.eks. 🔓/↩️).
6. **`(home)/page.tsx` mark-read:** nye kinds som deeplinker til spill-hjem MÅ inn i `markNotificationsRead`-lista (`app/[locale]/games/[id]/(home)/page.tsx:288-297`) — ellers blir bjelle-badgen hengende etter at spilleren har sett siden (nøyaktig regresjonen #1358 la `scorecard_rejected` dit for å unngå; ikke compile-håndhevet, så lett å glemme).
7. **Call-sites** (begge plasseres ETTER vellykket UPDATE og FØR `redirect()` — redirect kaster; notify-try/catch må IKKE omslutte redirecten. `logAdminEvent`-plasseringen viser riktig sted):
   - `reopenScorecard`: best-effort `notify()` til `playerUserId` (try/catch + `console.error`, mønster `adminApproveScorecard` :213-234). Utvid game-selecten (:445-449) med `name` til payloaden.
   - `reopenGame`: fan-out til alle aktive deltakere. Etablert hjem for multi-mottaker-varsling er `lib/notifications/events.ts` (`notifyPlayersGameStarted` :93, `notifyPlayersGameFinished` :44 — `Promise.allSettled` + `console.error` med logPrefix): legg en `notifyPlayersGameReopened`-helper der fremfor inline i actionen. Roster-mønster: `actions.ts:119-124` (`select('user_id').eq('game_id',...).is('withdrawn_at', null)`); withdrawn = `withdrawn_at != null` (ingen status-kolonne). Claude's Discretion: om aktøren (admin/arrangør) ekskluderes fra fan-outen (game_started-mønsteret :128 ekskluderer aktøren).
8. **Ingen mail** (issue: «ingen mail nødvendig») — `notify()` sender aldri mail selv (returnerer bare `shouldAlsoSendMail`-flagget; push håndteres internt, ingen per-kind-registrering). Ikke bygg ny push-/mail-infrastruktur, ikke konsumer mail-flagget.
9. **Tester:** det FAKTISKE 0149-mønsteret er `deeplink.test.ts:27` + call-site-testen (`approve/actions.test.ts:308-364`) — `types.test.ts`/`cardContent.test.ts` er ikke exhaustive per kind og skal ikke utvides ukritisk. Utvid `deeplink.test.ts`, `events.test.ts` (for ny helper) og evt. én call-site-assert. Ingen nye testfiler.
10. **Versjon:** feat → minor-bump + CHANGELOG Funksjon-linje.

## Edge Cases & Guardrails

- **Varsling må aldri blokkere gjenåpningen** — best-effort med `console.error`; feil i notify endrer ikke redirect/utfall (I3: sanksjonert fire-and-forget).
- **Ingen varsel på no-op:** `reopenScorecard` med allerede-gjenåpnet kort (0-rad-update, `.not('submitted_at','is',null)` :465) skal ikke varsle. Dagens kode destrukturerer kun `{ error }` — 0 rader er usynlig. Bruk `expectAffected`/`NoRowsAffectedError` (allerede importert i fila, :21) og følg `adminApproveScorecard`-presedensen :175-199: 0 rader = idempotent SUKSESS-redirect uten varsel — IKKE en `?error=`-redirect (det ville endre dagens oppførsel).
- **Stille insert-feil:** `notify()` svelger insert-feil (notify.ts:60-68, kun console.error) — en kind som mangler i CHECK-en feiler LYDLØST med identisk symptom som buggen vi fikser. Derav migrasjons-/merge-rekkefølgen under Gates.
- **Withdrawn spillere** varsles ikke ved `game_reopened`.
- **Samspill med #1362** (kontraktert i dag, samme funksjon): #1362 bytter gate til `loadAdminOrCreatorContext`. Byggene er uavhengige — denne kontrakten forutsetter IKKE #1362; bygges begge, rebase den som kommer sist. `actorName` finnes i begge kontekst-varianter.
- **Migrasjonsnummer-kollisjon:** kjent felle — verifiser nummereringen mot `origin/main` rett før commit (#1362-kontrakten kan også ta et nummer).

## Key Decisions

- **To nye kinds fremfor gjenbruk av `scorecard_rejected`:** semantikken er en annen (avvist-med-grunn vs. gjenåpnet-av-arrangør), og kind-utvidelse er billig by design (0032-kommentaren: ingen DB-CHECK på payload-struktur).
- **Varsle alle aktive deltakere ved `reopenGame`** (ikke bare de som hadde levert): resultatlisten forsvinner for alle, og alle kan igjen redigere.
- **Dekker også #1396** (samme funn fra admin-vinkelen — reopenScorecard varsler ikke): closing-kommentaren på denne PR-en skal foreslå #1396 lukket som duplikat.

**Claude's Discretion:** eksakt payload-feltsett utover game_id/game_name, no-op-deteksjonsmekanikk, testcasenes form innenfor eksisterende mønster.

## Success Criteria

- [ ] Gjenåpnes et scorekort, får spilleren in-app-varsel med spillnavn og deeplink til spill-hjem; å tappe varselet lander på `/games/[id]`.
- [ ] Gjenåpnes et spill, får alle aktive (ikke-withdrawn) deltakere varsel.
- [x] Feilet varsling endrer ikke utfallet av gjenåpningen (verifiserbart: simulert notify-feil → redirect skjer, console.error logges). **Bevis:** unit-test i actions.test.ts (notify-feil → suksess-redirect + console.error), evaluator-runde 1.
- [x] Ingen varsel ved no-op-gjenåpning (kort som ikke var levert). **Bevis:** expectAffected/NoRowsAffectedError-sti unit-testet: idempotent suksess uten notify og uten audit-logg (evaluator-runde 1).
- [x] Kind-CHECK utvidet og påført staging med verifisering; typer/zod/cardContent/deeplink/EMOJI/mark-read dekker begge kinds; `tsc`/`lint`/`vitest` grønne. **Bevis:** 0158 påført staging via MCP, pg_get_constraintdef viser 28 kinds (hovedøkt + evaluator uavhengig); tsc exit 0, build exit 0, 174 tester grønne.
- [ ] Staging-verifisering av begge flyter før merge.

## Gates

Pre-push + CI (tsc/lint/vitest), e2e `@gate` mot staging, staging-klikkrunde (gjenåpne kort → se varsel i innboksen) FØR merge. Commits med `Refs #1363`; PR-body med `Closes #1363` + Fordeler/ulemper-blokk.

**Merge-rekkefølge (hard):** PR-en merges FØRST etter at migrasjonen er påført prod via brannmur-luka #1074 — main auto-deployer, og deployes koden før CHECK-en er utvidet gir begge nye kinds stille insert-feil i prod (0149-headerens egen deploy-regel, :12-16). Prod-migrasjonen går ALDRI i natt-økten; dette er dermed en aldri-auto-merge-PR (venter på eier uansett).

## Files Likely Touched

- `supabase/migrations/0151_reopen_notifications.sql`
- `lib/notifications/types.ts` + `cardContent.ts` + `deeplink.ts` + `deeplink.test.ts`
- `lib/notifications/events.ts` + `events.test.ts` (fan-out-helper for game_reopened)
- `components/notifications/NotificationCard.tsx` (EMOJI-mappet)
- `app/[locale]/admin/games/[id]/actions.ts` (reopenScorecard + reopenGame)
- `app/[locale]/games/[id]/(home)/page.tsx` (markNotificationsRead-lista)
- `messages/no.json` + `messages/en.json`
- `package.json` + `package-lock.json` + `CHANGELOG.md`

## Out of Scope

- Mail-varsling.
- Endringer i `maybeSendDeliveryReminder`.
- #1362 (creator-gate — egen kontrakt).

## Drift-tabell (kontrakt 2026-08-05 → HEAD c399cf26, verifisert 2026-08-11)

| Kontrakt-påstand | Status på HEAD |
|---|---|
| Migrasjonsnummer 0151 ledig | UTDATERT — origin/main har t.o.m. 0157; bruk **0158** |
| 0149 er siste kind-utvidelse av `notifications_kind_check` | BEKREFTET (git grep origin/main) |
| `reopenScorecard`/`reopenGame` mangler `notify()` | BEKREFTET (0 treff i begge funksjoner) |
| `lib/notifications/events.ts` har fan-out-helpere | BEKREFTET (`notifyPlayersGameFinished` :44, `notifyPlayersGameStarted` :100 — linjenumre har driftet, verifiser ved lesing) |
| Linjenumre i kontrakten (actions.ts, types.ts, m.fl.) | ANTATT DRIFTET — les filene, stol aldri på numrene |
