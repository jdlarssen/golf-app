# Evaluering — 1361-games-error-banner

- **Dato:** 2026-08-11
- **Branch:** `claude/1361-games-error-banner`
- **Commit:** 26d9ebbbd308fd46a2a89bdea762bea2f8d57920 (HEAD = samme SHA)
- **Evaluator:** fersk-kontekst forge-evaluator (runde 2, uavhengig)

## Per suksesskriterium

### 1. `/games/[id]?error=<kode>` rendrer error-Banner for alle 8 kodene, begge locales, inkl. scheduled — PASS

- `SearchParams` har `error?: string | string[]` — `app/[locale]/games/[id]/(home)/page.tsx:81`.
- `ERROR_BANNER_CODES` inneholder nøyaktig de 10 avtalte kodene (8 nåbare + not_found + unknown) — page.tsx:106–117.
- `resolveErrorCode(first(sp.error), ERROR_BANNER_CODES, 'unknown')` — page.tsx:217; helperen (`lib/url/searchParams.ts:19–26`) returnerer `undefined` ved fraværende param (ingen falsk banner på vanlig sidelast) og `'unknown'` ved ukjent verdi (aldri stille dropp).
- `errorBanner`-fragment med `role="alert"` + `data-testid="game-error-<kode>"` + `Banner tone="error"` — page.tsx:225–232; `Tone`-unionen i `components/ui/Banner.tsx:3` har `'error'`.
- Rendret i BEGGE returns: scheduled-tidlig-return (return page.tsx:635, banner :645) og hovedreturnen (return :947, banner :1012).
- Error undertrykker statusBanner: `statusBannerKey = errorCode ? undefined : …` — page.tsx:218–220.
- i18n: alle 10 koder har nøkkel under `admin.game.errors` i BÅDE `messages/no.json` og `messages/en.json` (node-skript over begge kataloger: 0 MISSING). Nye nøkler `not_deletable` + `unknown` finnes i begge (no.json:3275–3276, en.json:3275–3276).

**Produsent-dekning verifisert selvstendig (er settet komplett?):** grep av alle `error=`-redirects mot `/games/[id]` for oppretter:
- `endGame` (admin actions.ts:294, `detailPath = /games/${gameId}` for creator) → endGameCore-reasons: not_active, no_players, not_all_submitted, not_all_approved, db_finish. `db_winners` unåbar her (ingen sideWinners sendes).
- `endGameWithSideWinners` (avslutt/actions.ts:127–128): `db_winners` → wizardPath (`/avslutt`, egen feilvisning), resten → detailPath — samme fem koder.
- `endGameMarkingWithdrawals` (avslutt-likevel/actions.ts:66): db_players → `/games/[id]`.
- `deleteGame` (slett/actions.ts:49): not_deletable → `/games/[id]`; not_found/delete_failed går til `/admin/games` hhv. slett-sidene, ikke spill-hjem.
- `rediger/page.tsx:95`: not_editable → `/games/[id]`.
- `games/[id]/avslutt/page.tsx:84`: not_active → `/games/[id]`.
- `reopenGame` (not_finished/db_game, actions.ts:470/482) bruker `loadAdminContext` — admin-only, `detailPath = /admin/games/...`, aldri `/games/[id]`.
- Withdraw/reinstate/approve-actionene bruker `loadAdminOrCreatorContext` med creator-detailPath `/games/${gameId}/spillere` — ikke spill-hjem.

**Konklusjon: ingen nåbar oppretter-kode mot `/games/[id]` mangler i settet.** De 8 + not_found (defensivt) + unknown (fallback) er riktig avgrensning.

### 2. Stale-kommentar borte: grep `doesn't render ?error` i `app/` → 0 treff — PASS

`grep -rn "doesn't render ?error" app/` → exit 1 (0 treff), kjørt i denne evalueringen. Erstatningskommentaren i `games/[id]/avslutt/page.tsx:38–39` peker nå på #1361-banneret.

### 3. `typecheck && test && lint` grønt — PASS

Kjørt selv på Node 22 (v22.23.0): `npm run typecheck` → `tsc --noEmit` exit 0; `npx vitest run messages/catalogParity.test.ts messages/apostropheParity.test.ts` → 2 filer / 4 tester PASS. Lint/build ikke re-kjørt her; kontraktens evidens + CI (verify på PR #1569, Vercel DEPLOYED) dekker dem.

### 4. Staging-klikkrunde av reelt race — PASS (evidens vurdert kritisk, ikke gjenskapbar)

Staging-serveren er stoppet og testdata ryddet, så runden kan ikke gjentas. Evidensen i kontraktfilen er spesifikk og internt konsistent med koden:
- Siterte tekster matcher katalogene eksakt («The game is not active and cannot be ended.» = en.json:3273; «Noe gikk galt. Prøv igjen.» = no.json:3276).
- `error-outranks-status`-testen (`?error=db_finish&status=submitted` → error, 0 suksess) matcher implementasjonen (page.tsx:218–220).
- Race-riggen (last `/avslutt` som ren bekreftelse → service-role nuller medspillers `submitted_at` → klikk → `not_all_submitted`-bounce) er nøyaktig flyten koden gir: /avslutt-siden er allerede lastet, endGame(gameId, false) treffer endGameCore.ts:190.
- Scheduled-grenen testet via den ekte produsenten (avslutt-page:84-bounce), ikke bare håndskrevet URL.
- 9/9 = 8 nåbare + not_found; unknown testet separat som fallback. Konsistent telling.

### 5. Funn-disiplin: db_winners-mislabel → eget issue — PASS

Issue #1567 OPEN, «SideWinnersForm viser valideringsmelding for db_winners-databasefeil», bug + area:admin, milestone «Backlog — uplanlagt / scale-triggered».

### Versjon/CHANGELOG — PASS (med kjent prosess-punkt)

`package.json` = 1.232.1; CHANGELOG-linje `1.232.1 · #1361` under August 2026 (teller 39→40); commit-body har `Refs #1361`; fix → patch-bump korrekt. Kjent og håndtert: søster-PR #1568 (OPEN, ikke merget ennå) bumper også til 1.232.1 og merges først; denne branchen skal rebases + re-bumpes til 1.232.2 etterpå. **Påminnelse i det punktet:** CHANGELOG-linjen embedder versjonsstrengen `1.232.1` — re-bumpen må oppdatere BÅDE package.json og CHANGELOG-linjen (hooken sjekker bare bumpen).

### PR #1569-body — PASS

Draft (draft-først per #1516, korrekt). Body har: `## Fordeler/ulemper`-blokk, `## Alternativer (produktvalg)`-heading (maskin-markøren som stopper auto-merge), anbefaling øverst, fordeler/ulemper for både A og B, ombyggingskostnad for B («liten–middels»), reversibilitet, svar-instruks («svar 'alternativ B' her …») + «Ingen hast — PR-en venter». Alle formkrav oppfylt.

## Funn

1. **(Før merge — prosess, ikke kode)** PR #1569 mangler `staging-verified`-bevis-kommentar + label (#1076-disiplinen). Evidensen ligger i kontraktfilen, men er ikke postet på PR-en; kun Vercel-bot-kommentar, 0 labels. Må postes før merge — naturlig å gjøre sammen med rebase/re-bump etter #1568.
2. **(Påminnelse inne i det kjente re-bump-punktet)** CHANGELOG-linjen for #1361 hardkoder `1.232.1` — re-bump til 1.232.2 må også endre den linjen.

Ingen kode-funn. Ingen kontrakts-kriterium feiler.

## Sluttverdikt

**ACCEPT** — alle fem suksesskriterier verifisert uavhengig (kode, i18n, produsent-dekning, gates re-kjørt); staging-evidensen er spesifikk, etterprøvbar mot koden og internt konsistent. De to funnene er merge-forberedelser, ikke bygge-mangler.
