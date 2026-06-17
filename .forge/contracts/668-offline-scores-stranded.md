# Forge-kontrakt: #668 — Offline-scores strandet ved levering før synk

**Issue:** [#668](https://github.com/jdlarssen/golf-app/issues/668) · **Alvor:** P1 · **Flyt:** spille-runde
**Branch:** `claude/youthful-noyce-a463bd`
**Kilde:** multi-agent helse-audit 2026-06-17 (adversarielt re-verifisert mot live skjema)

## Problem (kort)

En spiller som taster slag offline (eller under synk-backlog) og leverer scorekortet
**før** Dexie-køen rekker å synke, mister slagene permanent:

1. `/submit` leser kortet fra Postgres (ikke Dexie), så preview viser de utastede hullene
   som «mangler».
2. Spilleren leverer → `submitted_at` settes → RLS fryser score-writes.
3. Den fortsatt-køede Dexie-write-en kjører → `upsert_score_if_newer` (SECURITY INVOKER)
   treffer RLS WITH CHECK `submitted_at is not null` → **hard error**.
4. Sync-worker behandler RPC-*error* som «retry forever» — ingen attempt-cap, ingen graceful
   no-op. Slagene når aldri serveren, kortet er levert med blanke hull, køen looper evig.

Sekundært: submit-CTA-en på hull-flaten gjemmes når `myCompletedHoles < 18`, og den tellingen
er server-side — en spiller som tastet alle 18 offline finner aldri «Lever»-knappen.

0073 ga `withdrawn_at`-caset en graceful no-op nettopp for å unngå denne loopen; det
ekvivalente `submitted_at`-caset ble aldri behandlet.

## Designbeslutning (lagdelt forsvar)

Datatapet fjernes av **Del 1b + Del 2 sammen** (drain-før-levering + lokal hull-telling).
RPC-no-op-en (Del 1a) er kun loop-sikring for det sub-sekund-race-vinduet etter at køen er
tømt. Del 4 (attempt-cap) er belte-og-bukseseler for *andre* gift-elementer, gjort **nett-trygt**:
gi BARE opp på eksplisitt permanente feil, ALDRI på tapt signal (eier-beslutning 2026-06-17).

## Suksesskriterier

- [x] **K1 (Del 1a — RPC graceful no-op for submitted).** `upsert_score_if_newer` returnerer
  `was_applied = false` uten å forsøke INSERT/UPDATE når mål-spilleren har `submitted_at is not null`
  (i tillegg til eksisterende `withdrawn_at`). Speiler 0073-mønsteret. Ny migrasjon `0102_*.sql`,
  applikert til prod via MCP (bakoverkompatibel — gammel klient kaller fortsatt via RPC).
  *Bevis:* `def_has_submitted_guard=true` (pg_get_functiondef); no-op-probe mot submitted
  game_player `e045ac34…` med NYERE timestamp + strokes=99 ga `was_applied=f`, `strokes_after=3`
  (umutert), rullet tilbake via RAISE. Migrasjon `0102` + `apply_migration` success.

- [x] **K2 (Del 2 — lokal hull-telling).** `HoleClient` unionerer server-snapshot-en med en
  `useLiveQuery`-telling av lokale non-null scores for `(gameId, myUserId)` over alle 18 hull:
  `roundComplete = Math.max(myCompletedHoles, localCompletedHoles ?? 0) >= 18`. `Math.max` (ikke
  ren fallback) så server-synkede hull fra en tidligere økt aldri under-telles. Rent additivt —
  ingen skjema/RPC-endring. *Bevis:* `HoleClient.tsx` `useLiveQuery(... .where('[gameId+userId]')
  .equals([gameId, myUserId]).filter(r => r.strokes != null).count())` + `Math.max`-union på
  roundComplete-linja; 22/22 HoleClient-tester grønne (ingen regresjon — kan bare avsløre CTA-en
  tidligere). Commit `3209691c`.

- [x] **K3 (Del 1b + Del 3 — drain før levering).** `/submit` kicker `drainQueue()` ved mount og
  blokkerer «Lever»-knappen så lenge `localDb.syncQueue` har ventende elementer (label → «Lagrer
  slag …»). Når køen går fra ikke-tom → tom, kalles `router.refresh()` så preview-en re-renderer
  med de nå-synkede scorene (riktige hull-tall + brutto). Dekker Del 3 automatisk: spilleren MÅ
  innom `/submit` for å re-levere etter en reject, så drain-vakta fyrer der. *Bevis:* `SubmitForm.tsx`
  `useLiveQuery(syncQueue.filter(abandonedAt==null).count())`, mount-`drainQueue()`, `wasPending`-ref →
  `router.refresh()` på tom, `disabled={syncing}` + onSubmit-guard `if (syncing) preventDefault()`;
  ny i18n-nøkkel `game.submit.syncingPending` i begge kataloger (parity grønn). Build grønn (force-dynamic).

- [x] **K4 (Del 4 — nett-trygg attempt-cap).** `drainQueue` gir opp på et element KUN når feilen er
  eksplisitt permanent (`isPermanentSyncError` = permission/403/row-level/constraint/invalid/400) OG
  `attemptCount + 1 >= MAX_PERMANENT_ATTEMPTS` (5). Da settes `abandonedAt` på kø-elementet og det
  hoppes over i alle videre drains. Nettverks-, auth-utløp-, rate-limit- og *ukjente* feil er ALDRI
  permanente → retry uendelig (tapt signal mister aldri slag). `SyncBanner` surfacer abandoned-elementer
  distinkt. *Bevis:* `lib/sync/classifyError.ts` (`isPermanentSyncError` + `syncRetryDecision`);
  `classifyError.test.ts` 24 grønne (network/auth/unknown=retry uansett antall, permanent=abandon ved cap);
  `syncWorker.ts:` `if (item.abandonedAt) continue;` + `decision === 'abandon'`-gren. Commit `9f95170d`.
  Herdet i `fcc0889b` (evaluator-funn): statuskoder matches nå med ord-grenser (`\b400\b`) + timeout/abort
  eksplisitt transient, så ingen siffer-kollisjon (f.eks. «1400ms») kan abandone et offline-slag. 29
  classifier-tester grønne.

- [x] **K5 (Gates grønne).** `npx tsc --noEmit` exit 0; `npm run build` grønn (full rute-tabell);
  full `npx vitest run` = **283 filer / 3590 tester grønne**. `lib/sync/classifyError.test.ts` 24 grønne.
  Humanizer kjørt på nye strenger («Kunne ikke lagre N slag …», «Lagrer slag …», CHANGELOG-taglines);
  pre-commit-advarsel kun på en intern kode-kommentar-em-dash (ikke bruker-copy) + pre-eksisterende
  SyncBanner-hardkoding (ikke ekstrahert ennå — OK per hook).

## Gates (kjør scoped til det som endres)

```bash
npx tsc --noEmit
npx vitest run lib/sync/                 # classifier + eksisterende sync-tester
npx vitest run                           # full suite før commit av siste chunk
npm run build                            # exhaustive switch / PPR-sjekk
```

RPC-verifikasjon (via Supabase MCP, prosjekt `glofubopddkjhymcbaph`):
```sql
-- definisjon viser submitted-grenen
select pg_get_functiondef('public.upsert_score_if_newer(uuid,uuid,int,int,uuid,timestamptz)'::regprocedure);
-- funksjonell no-op-probe (transaksjons-trygg) mot en submitted game_player
```

## Filer som berøres

- `supabase/migrations/0102_block_submitted_score_writes_in_rpc.sql` — ny (Del 1a)
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` — lokal hull-telling (Del 2)
- `app/[locale]/games/[id]/submit/SubmitForm.tsx` — drain-vakt + refresh (Del 1b/3)
- `lib/sync/db.ts` — `abandonedAt?` på `SyncQueueItem` (ikke-indeksert, ingen versjon-bump)
- `lib/sync/syncWorker.ts` — attempt-cap + skip abandoned (Del 4)
- `lib/sync/classifyError.ts` — ny pure classifier (Del 4)
- `lib/sync/classifyError.test.ts` — ny Type A-test
- `components/sync/SyncBanner.tsx` — surface abandoned distinkt (Del 4)
- `messages/no.json` + `messages/en.json` — «Lagrer slag …» + abandoned-banner-tekst
- `package.json` + `CHANGELOG.md` — PATCH-bump (bug-fix)

## Bevisst utenfor scope

- Ingen ny Dexie-tabell for failed-kø — `abandonedAt`-flagg holder (ingen versjon-bump, DB heter
  fortsatt `'golf-app'`).
- Ingen offline-e2e (for flaky å simulere pålitelig); risiko-logikken (classifier/retry-decision)
  dekkes av Type A i stedet, RPC-en av live-SQL.
- Lag-modus-keying (Texas/Ambrose captain-kort) i Del 2 er uendret — speiler eksisterende
  server-prop-keying; north-star er solo/individuell slagspill.
- Ingen endring i `submitScorecard`/RLS-policyene utover RPC-funksjonen.
```