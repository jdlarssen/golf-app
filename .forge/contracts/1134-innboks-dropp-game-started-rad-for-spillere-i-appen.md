# Spec: Innboks — dropp game_started-rad for spillere som er inne i appen

**Issue:** #1134 · **Branch:** claude/1134-innboks-dropp-game-started-rad-for-spillere-i-appen

## Problem

`game_started` er nest største varsel-type i prod (51 rader) og er bevisst in-app-only —
ingen mail-fallback (`lib/notifications/events.ts:45-81`). Men `notify()` inserter
_alltid_ en in-app-rad uansett om spilleren sitter i appen i det spillet flippes til
`active` (`lib/notifications/notify.ts:42-58`); off-app-terskelen (`shouldSendMailFallback`,
`notify.ts:108-113`) gater i dag kun mail og push, ikke selve in-app-innsettingen.

For en spiller som er aktiv i appen er raden redundant: `ScheduledWaitingRoom.tsx`
abonnerer allerede på `postgres_changes` på `games.status` og kaller `router.refresh()` i
det den flipper, og en on-app-spiller ser uansett spillet gå live ved neste navigering.
Vi vil derfor slutte å insertere game_started-raden for on-app-spillere, men **beholde den
for off-app** (de får varselet ved retur — det er hele poenget med raden).

Det finnes nøyaktig én produsent av `game_started`-rader: `notifyPlayersGameStarted` i
`events.ts` (grep bekreftet — `kind: 'game_started'` treffer kun `events.ts:67`). De tre
call-sitene (`app/[locale]/admin/games/[id]/actions.ts:127`,
`app/[locale]/games/[id]/(home)/page.tsx:327`,
`app/api/cron/start-scheduled-games/route.ts:107`) går alle gjennom denne helperen, så én
gate der dekker samtlige start-veier.

## Design

Gate in-app-innsettingen i fan-out-helperen — ikke i den delte `notify()`-primitiven.
`notify()` er hot og brukes av alle varsel-kinds; å legge betinget insert der ville tvinge
en sekvensiell «hent bruker → beslutt insert»-omskriving og duplisere insert/push/guest-
logikken. Gating av «hvem skal få denne kind-en» hører hjemme i orkestreringslaget
(`events.ts`), som allerede eier fan-out-en. `notify()` røres ikke.

1. **`lib/notifications/events.ts` — `notifyPlayersGameStarted`:**
   - Importer `getAdminClient` fra `@/lib/supabase/admin` og `shouldSendMailFallback` fra
     `./notify` (i dag importeres kun `notify`).
   - Tidlig `return` hvis `players.length === 0` (unngå en tom `.in()`-spørring).
   - Batch-hent `last_seen_at` for alle `players.map(p => p.user_id)` i ÉN spørring:
     `admin.from('users').select('id, last_seen_at').in('id', ids)`. Bygg en
     `Map<user_id, last_seen_at | null>`.
   - Partisjonér med `shouldSendMailFallback(last_seen_at)` (true = off-app = behold raden):
     - Off-app spillere → kall `notify({ kind: 'game_started', ... })` som i dag.
     - On-app spillere → hopp over `notify()` helt (ingen in-app-rad, ingen push — begge
       er unødvendige når spilleren er i appen).
   - **Fail-open (guardrail):** ved query-error ELLER en spiller som mangler rad i Map-en,
     behandle spilleren som off-app (behold raden). Logg query-error med `logPrefix`. Vi
     dropper aldri en rad på usikkerhet — issuets eksplisitte krav er «verifiser at
     off-app-spillere fortsatt får raden».
   - Behold den eksisterende `Promise.allSettled` + per-rejection `console.error`-loggingen
     over den filtrerte (off-app) lista.

   Vurder å trekke ut partisjoneringen til en ren, testbar helper (f.eks.
   `partitionOffApp(players, lastSeenById): { offApp, onApp }`) for enklere Type A-dekning —
   byggerens valg.

2. **Oppdater `lib/notifications/events.test.ts`** (T5 — atferden endres):
   - De to eksisterende `notifyPlayersGameStarted (#502)`-testene antar at ALLE oppgitte
     spillere får `notify`. Med gaten må testen mocke `getAdminClient` sin
     `users.select().in()` til å returnere off-app `last_seen_at` (null eller > terskel) for
     de spillerne som forventes varslet.
   - Nye caser: (a) on-app spiller (fresh `last_seen_at`) → `notify` IKKE kalt for den;
     (b) off-app spiller → `notify` kalt; (c) query-error → fail-open, alle varsles;
     (d) spiller uten users-rad → behandlet off-app (varslet).
   - Mock-mønster: se `notify.test.ts:9-25` for hvordan `getAdminClient` mockes med
     `from(table)`-dispatch; `shouldSendMailFallback`/`OFF_APP_THRESHOLD_MS` importeres
     fra `./notify` for å bygge fersk/stale `last_seen_at` i testene.

3. **Version-bump + CHANGELOG** (bruker-synlig): en on-app-spiller vil observere at de ikke
   lenger får en «runden er i gang»-innboksrad. Patch-bump (`npm version patch
   --no-git-tag-version`) + én CHANGELOG-linje under **Feilrettinger** (redundant
   game_started-varsel fjernes for spillere som allerede er i appen). Ingen ny norsk
   bruker-copy endres → `humanizer` N/A.

## Edge Cases & Guardrails

- **Fail-open ved usikkerhet:** query-error eller manglende users-rad → behold raden. Den
  eneste akseptable feilretningen er «en redundant rad for mye», aldri «en manglende rad for
  en off-app-spiller».
- **Gjester / slettede kontoer:** `is_guest`/`deleted_at`-brukere har `last_seen_at = null`
  → `shouldSendMailFallback` gir true → off-app → raden beholdes (gjestens egen historikk,
  jf. `notify.ts:74-84`). Ingen særbehandling nødvendig — `last_seen_at`-predikatet dekker
  dem korrekt.
- **On-app definisjon = samme terskel som push:** `shouldSendMailFallback` er den ene
  kilden (delt med push-gaten i `notify.ts:86-98`), så «on-app» kan ikke drifte fra
  push-definisjonen. Dette er den «presise paa-app-definisjonen» issuet ber om.
- **Bredere enn venterommet (bevisst):** last_seen_at-terskelen dropper raden for ALLE
  on-app-spillere, ikke bare de som sitter i det aktuelle venterommet. Eier-akseptert i
  issuet (risiko: medium) — en on-app-spiller ser uansett spillet gå live ved neste
  navigering, og push bruker allerede samme gate.

## Key Decisions

- **Gate i `events.ts`, ikke i `notify()`.** Minst blast-radius: den delte insert-
  primitiven og alle andre varsel-kinds forblir uendret; ingen sekvensialisering av den
  hot-pathen. Én ekstra batch-spørring i start-fan-out (få spillere) er billig.
- **Fail-open framfor fail-closed.** Motsatt av mail-gatingens fail-closed-rasjonale
  (`events.test.ts:46-51`), fordi konsekvensen her er invertert: en tapt game_started-rad
  for en off-app-spiller er verre enn en overflødig rad for en on-app-spiller.
- **Bruker-synlig → patch + CHANGELOG Feilrettinger.** Klassifiseres som feilretting
  (fjerner overflødig/duplisert varsel). Om byggeren mener `feat` passer bedre → minor +
  Funksjoner-linje; commit-msg-hooken håndhever bump-typen uansett.

**Claude's Discretion:** Om partisjoneringen trekkes ut til en egen ren helper eller ligger
inline i `notifyPlayersGameStarted`. Eksakt CHANGELOG-ordlyd. Testenes mock-oppsett for
`getAdminClient` (gjenbruk `notify.test.ts`-mønsteret). Commit-prefiks (`fix` vs `feat`) så
lenge bump-typen matcher.

## Success Criteria
- [ ] En on-app-spiller (fersk `last_seen_at`, innenfor `OFF_APP_THRESHOLD_MS`) får INGEN
      `game_started`-innboksrad når spillet flippes til `active`.
- [ ] En off-app-spiller (null eller stale `last_seen_at`) får FORTSATT `game_started`-raden.
- [ ] Alle tre start-veier (admin-knapp, auto-start ved sidebesøk, cron-sweep) respekterer
      gaten — den ligger i den ene delte helperen de alle kaller.
- [ ] Fail-open: ved users-query-error eller en spiller uten users-rad beholdes raden
      (spilleren varsles).
- [ ] Off-app-spillere får fortsatt push (uendret `notify()`-oppførsel for dem).
- [ ] `events.test.ts` dekker on-app-drop, off-app-behold, query-error-fail-open og
      manglende-rad-fail-open.

## Gates
- [ ] `npm run build` — grønt
- [ ] `npm run lint` — grønt på berørte filer
- [ ] `npx vitest run lib/notifications/events.test.ts lib/notifications/notify.test.ts` — grønt
- [ ] Version-bump: patch (`npm version patch --no-git-tag-version`) + CHANGELOG Feilrettinger-linje (bruker-synlig)
- [ ] Staging-verify (bruker-synlig): på `torny-staging`, logg inn spiller A (→ on-app via
      proxy-`last_seen_at`-skriv) og la spiller B stå urørt (off-app); admin starter et
      planlagt spill; bekreft A ikke får game_started-rad i `/innboks` mens B får den. Den
      kritiske egenskapen å verifisere er at off-app-spilleren (B) FÅR raden.

## Files Likely Touched
- `lib/notifications/events.ts` — batch `last_seen_at`-henting + off-app-filter i `notifyPlayersGameStarted`
- `lib/notifications/events.test.ts` — oppdater de to game_started-testene + nye on-app/fail-open-caser
- `package.json` + `package-lock.json` — patch-bump
- `CHANGELOG.md` — Feilrettinger-linje

## Out of Scope
- `notify()`-primitiven (`notify.ts`) — røres ikke; ingen ny option der.
- Mail-/push-gating (`shouldSendMailFallback`, `sendPushToUser`) — uendret.
- Andre varsel-kinds (game_finished, cup_*, registration_expired m.fl.) — kun `game_started`.
- Card-copy/deeplink for game_started (`cardContent.ts`, `deeplink.ts`) — ingen tekstendring.
- `ScheduledWaitingRoom.tsx` — realtime-refreshen er allerede på plass, ingen endring der.
- Endring av `OFF_APP_THRESHOLD_MS` eller «on-app»-definisjonen.
