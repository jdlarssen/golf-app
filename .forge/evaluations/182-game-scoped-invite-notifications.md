# Evaluation — Game-scoped invite-notifikasjoner (#182)

**Verdict:** ACCEPT
**Contract:** `.forge/contracts/182-game-scoped-invite-notifications.md`
**Build commits:** `cfa18fd` ← `75f4cde` ← `cabd384` ← `79c8b0b` ← `a2c8645` ← `de8e450` ← `24cdb8a` ← `f3b8221`
**Evaluator:** fresh-context sub-agent, 2026-05-26

---

## Gate results

| Gate | Outcome | Notes |
|---|---|---|
| `npm test` | PASS — 1196/1196 grønn (103 filer) | Duration 11.4s. Matcher kontraktens forventning. |
| `npm run build` | PASS | Next.js 16 produksjonsbuild grønn. Eneste output-warning er turbopack root-inferens (preeksisterende, ikke fra denne build-en). |
| `npm run lint` | PASS for endrede filer | 5 errors står igjen, alle i `e2e/sync/offline-sync.spec.ts` (commit `5866728`, 2026-05-19 — pre-dates denne build-en med en uke). Ingen nye errors i berørte filer; kun preeksisterende warnings i urelaterte komponenter. |

---

## Per-criterion verdict

| K# | Verdikt | Evidens |
|---|---|---|
| **K1** — `notifyInvitedToGame.ts` med tester | PASS | Helper i `lib/notifications/notifyInvitedToGame.ts:22-75`. Test-fila `lib/notifications/notifyInvitedToGame.test.ts:51-192` dekker alle fem cases kontrakten ber om: happy path (l.52-79), email-fallback i invited_by_name (l.81-105), finished-game skip (l.107-121), game-not-found error+swallow (l.123-140), inviter-not-found error+swallow (l.142-163), notify-rejects swallow (l.165-191). Alle bruker prefikset `[notifyInvitedToGame]`. |
| **K2** — `InviteToGameSection.tsx` for draft/scheduled | PASS | Komponenten i `app/admin/games/[id]/InviteToGameSection.tsx:33-94` returnerer null for active/finished (l.39). Page-mount-en i `app/admin/games/[id]/page.tsx:661-668` gjør i tillegg en gate på `game.status === 'draft' || 'scheduled'` (defense in depth). Mode-aware kapasitetsbanner ved 8/8 i `InviteToGameSection.tsx:62-78`. Minor avvik: card-en plasseres FØR Spillere-table (l.661 før l.670), ikke MELLOM table og status-CTA-er som §2 spesifiserer. Funksjonelt korrekt, kosmetisk avvik. |
| **K3** — server-actions med authz, status, kapasitet, idempotens | PASS | `inviteToGameActions.ts:30-91` (`addExistingPlayerToGame`) og `l.106-215` (`inviteEmailToGame`). Authz via `requireAdminOrTrustedCreator` (l.42 + l.119) — helperen finnes i `lib/admin/auth.ts:63`. Status-gate l.46-48 + l.123-125. Kapasitetsgate l.50-58 + l.127-135 — `count: 'exact', head: true` flyter gjennom `buildSupabaseMock`'s `then`-resolver (`tests/serverActionMocks.ts:124-130`). Duplikat-håndtering på `23505` l.71-79 + l.152-160. Inviter-self skip l.81 + l.162. Test-fila `inviteToGameActions.test.ts` har 11 tester som dekker alle invariants. |
| **K4** — backfill i `/new` | PASS | `app/admin/games/new/actions.ts:154-167` filtrerer ut inviter-self og fyrer notify per ny spiller via `Promise.allSettled`. Tester i `actions.test.ts:358-473` asserterer 8 kall ved publish, 7 ved skip-inviter, game-creation lykkes selv ved notify-reject (l.418, l.428), og draft-uten-players fyrer ikke notify (l.473). |
| **K5** — diff-add i edit-flyten | PASS | Snapshot tas FØR delete på `app/admin/games/[id]/edit/actions.ts:187-192`. Etter wholesale-replace beregnes diff på l.234-236 (`!priorRosterIds.has(id) && id !== userId`). Tester i `edit/actions.test.ts:194-295` verifiserer 4 nye fyrer notify når u0..u3 var med fra før, eksisterende uendret roster fyrer 0, og admin-som-blir-ny skipper. |
| **K6** — deferred-notify i `verifyCode` | PASS | `app/(auth)/login/actions.ts:139-211`. Henter pending invites med admin-client FØR accepted_at flippes (l.141-148) for å fange game_id + invited_by. Slår opp `userRow.id` fra `public.users` via email (l.161-165) — dette er public.users.id, ikke auth.users.id (riktig per kontrakt). Insert i game_players + notify per game-scoped invite (l.168-206) i Promise.allSettled. Helper-en skipper finished-game internt. Login-redirect (l.213) kjører uavhengig av om side-effekten kaster (try/catch + console.warn på l.209-211). Tester i `login/actions.test.ts:177+` dekker happy path, finished/expired skip, og at notify ikke kalles for ikke-game-scoped invitasjoner. |
| **K7** — mark-as-read for `kind: 'invite'` | PASS | `app/games/[id]/page.tsx:216-225` (player-side) markerer både `invite` og `scorecard_approved` for `entityId: id` i `after()`. `app/admin/games/[id]/page.tsx:213-226` (admin-side) markerer både `scorecard_submitted` og `invite`. `markRead.ts:40` filtrerer på `payload->>game_id` når entityId er satt. `inviteSchema` har `game_id` på l.25 av `lib/notifications/types.ts`. Filter-chain er korrekt. |
| **K8** — mail-helper med valgfri `gameName` | PASS | `lib/mail/inviteNotification.ts:31-41` definerer valgfri `gameName?: string`. Subject l.48-50 inkluderer spill-navnet når satt; ellers generisk «Du er invitert til Tørny». Body har egen game-grein l.52-58. Test-fila l.31-75 har tre cases: uten gameName (generisk), med gameName (spill-spesifikk), og XSS-test (`<script>` escaped i HTML, intakt i text — l.63-75). Eksisterende friend/admin-invite uendret (gameName ikke satt). Subject inneholder rå `gameName` (ingen escape), men subject-linjer rendres aldri som HTML — det er korrekt mail-praksis. |
| **K9** — eksisterende test-suite grønn + nye tester | PASS | `npm test` rapporterer 1196 tester passed i 103 filer. Alle nye tester (`notifyInvitedToGame.test.ts`, `inviteToGameActions.test.ts`, oppdatert `actions.test.ts` i `/new` og `/edit`, deferred-notify-tester i `login/actions.test.ts`) er med i suiten. |
| **K10** — `npm run lint` + `npm run build` grønn | PASS (with caveat) | Build grønn. Lint har 5 pre-eksisterende `no-explicit-any`-errors i `e2e/sync/offline-sync.spec.ts` (commit `5866728`, 2026-05-19). Ingen av disse touched av denne build-en. Ingen nye errors introdusert. |
| **K11** — manuelt verifisert i prod | DEFERRED | Out of evaluator scope. Kontrakten flagger dette som «manuell verifisering via `verify`-skill etter deploy» — kan ikke verifiseres her. |
| **K12** — versjons-bump + CHANGELOG | PASS | `package.json:3` viser `"version": "1.29.0"` (en ren MINOR-bump fra 1.28.x). `CHANGELOG.md:14-40` har ny 1.29.y-serie med stakeholder-tagline (l.20: «Spillere som blir lagt til et spill får nå et varsel i appen…»), `<details>`-wrapped tekniske notes med Added/Changed/Notes, og 1.28.y-serien wrappet i `<details>` på l.44-47. |

---

## Sanity-checks (evaluator-skepticism)

1. **Capacity-check mock**: `count: 8` flyter gjennom mock-en via `then`-resolveren (`serverActionMocks.ts:124-130`) som popper neste queue-entry. Action-en destrukturerer `const { count }` direkte — testen er ekte, ikke false-positive.
2. **verifyCode user_id**: bruker `userRow.id` fra `public.users.ilike(email)` (l.161-165 av login/actions.ts), ikke auth.users-id. Korrekt — `game_players.user_id` er FK til `public.users(id)`.
3. **Edit diff-snapshot**: `priorRoster`-select kjøres BEFORE `delete` (l.187-202). Korrekt — snapshot på riktig side av wholesale-replace.
4. **markRead filter-kjede**: `payload->>game_id` filter på markRead.ts:40 + `game_id` i inviteSchema (types.ts:25) lukker sirkelen. Bell-prikken forsvinner kun for det spillet.
5. **Subject HTML-escape**: gameName i subject er rå (ikke escapet). Ikke en bug — mail-klienter rendrer ikke subject som HTML.
6. **Inviter-self skip**: tre call-sites håndterer dette konsistent. Picker l.81, /new l.156, edit l.236, deferred-notify (irrelevant siden invitee ≠ inviter per definisjon).
7. **Idempotens på pending invitation**: `inviteEmailToGame` queryer `accepted_at IS NULL` + `game_id = X` + `email ilike X` (l.175-181). Treff → swallow, no mail, no notify. Robust.

---

## Issues / concerns

**Minor, ikke-blokkerende:**

- **K2 plassering avviker fra spec**: kontrakten sier «mellom Spillere-table og status-CTA-er», men `page.tsx:661-668` plasserer card-en FØR Spillere-table. Funksjonelt ekvivalent og visuelt akseptabelt, men skiller seg fra spec-en. Verdt en linje i closing-kommentaren under «Teknisk → Avvik».
- **K11 ikke verifisert**: prod-manuell test er evaluators-out-of-scope. Anbefal at brukeren kjører gjennom de fire stegene i §Gates-listen før closing av issue.

**Ingen blokkere identifisert.** Alle K1–K10 + K12 har sterk, sporbar evidens. Capacity-check, deferred-notify user_id, og diff-snapshot ble eksplisitt verifisert mot kontraktens edge-case-listen.

---

## Recommendation

**Klar for merge.**

Build-en oppfyller alle automatiserbare success-kriterier med solid testdekning og rene gates. Den eneste anbefalingen er å:

1. Notere card-plasserings-avviket i PR-closing-kommentaren under «Avvik fra issue-design».
2. Kjøre manuell prod-verifisering (K11) før issue-closure, slik kontrakten foreskriver.

Ingen blocker. Ingen technical debt introduced. Lint pre-existing errors er sporet til `5866728` (2026-05-19) og er ikke ansvaret til denne PR.
