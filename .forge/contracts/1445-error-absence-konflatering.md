# Spec: Rydd opp error/absence-konflatering i actions og helpers (#1445)

**Issue:** [#1445](https://github.com/jdlarssen/golf-app/issues/1445)
**Branch:** `claude/1445-error-absence-konflatering` (kontrakt fra 2026-08-07, gjenbrukt 2026-08-16 — linjenumre er ca., grep før du redigerer; `edit/actions.ts` er endret av #1677 i mellomtiden)
**Type:** refactor — ingen adferdsendring i normal drift, ingen versjonsbump, ingen CHANGELOG

## Problem

PR #1442 (#1441-post-mortem) beviste mekanismen: Next 16s cacheComponents-dev-maskineri
aborterer in-flight fetches ved cache-miss-restart, supabase-js svelger AbortError-en inn i
`res.error` i stedet for å kaste, og kode med formen `if (res.error || !res.data)
notFound()/return null/return '<not_found-kode>'` gjør en **transient feil** om til «finnes
ikke». De fem kritiske render-stiene ble fikset på PR #1442 (commits 42c0b59c + 255dfc68 +
Type A-test `lib/games/getGameWithPlayers.test.ts`). Dette issuet tar restene: alle
gjenværende `error || !data`-steder klassifiseres og de ekte konflateringene fikses.

## Research Findings

- **supabase-js-semantikk (bevist in-repo, sterkere enn docs):** `maybeSingle()` gir
  `data: null, error: null` ved 0 rader (= ekte fravær); `single()` gir error `PGRST116` ved
  0 rader (fravær lander i error-benet!); transiente fetch-feil (AbortError) returneres i
  `error`, kastes aldri. Fasit: `lib/games/getGameWithPlayers.ts:232-241` + testen
  `lib/games/getGameWithPlayers.test.ts` mot installert `@supabase/supabase-js@^2.105.4`.
  (context7-oppslag utilgjengelig i økten — ugyldig API-nøkkel; in-repo-bevis dekker behovet.)
- **Konsekvens for fix-mønsteret:** Alle `.single()`-steder som skal splitte error fra
  fravær MÅ samtidig bytte til `.maybeSingle()` — ellers rapporteres ekte fravær som DB-feil.
- **UI-fallback finnes allerede:** `FoursomesTeeStarterBanner.tsx:41-44` mapper ukjente
  action-feilkoder til generisk `teeStarterErrors.unknown` — ny `'db_error'`-kode krever
  ingen i18n-endring der. `startScheduledGame`-unionen har allerede `'db_game'`/`'db_players'`,
  og cron-ruta (`app/api/cron/start-scheduled-games/route.ts:125-142`) behandler allerede
  db_* som transient (error-level, retry neste minutt).
- **Error boundaries finnes:** `app/[locale]/error.tsx` (fanger admin-rutene),
  `app/[locale]/games/[id]/error.tsx`. Kast fra sider/actions er trygt (AGENTS.md trap 5).

## Prior Decisions

- **PR #1442 (42c0b59c/255dfc68):** render-path-mønsteret — `.maybeSingle()` +
  `if (error) throw error; if (!data) notFound()`. Gjelder uendret her for side-restene.
- **Kontrakt #567:** logg-konvensjonen `console.error('[<fnNavn>] <operasjon> failed', err)`
  umiddelbart før feil-utgangen. Alle nye error-ben følger den.
- **#567s out-of-scope-notat** («if (gameError || !game) → not_found svelger en Supabase-feil
  — adjacent gap; kan filtreres som eget issue») — dette issuet ER det gapet. Sirkelen sluttes.

## Design

Grep-fasit per 2026-08-07 (`grep -rnE '(error|Error)\s*\|\|\s*!' app/ lib/ components/`,
ekskl. tester): 46 treff. Issuets liste nevner `app/[locale]/cup/actions.ts:189` — koden bor
nå i `lib/cup/actions.ts:190`. Hvert treff er klassifisert (a) ekte konflatering → fiks, eller
(b) bevisst best-effort → la stå. **Fravær-benet beholder eksakt dagens oppførsel overalt.**

### Tabell A — ekte konflatering, fikses (16 steder)

Fire fix-mønstre. Error-benet får alltid `console.error('[fn] …', error)` først.

**A1 — render-sider (255dfc68-mønsteret):** bytt `.single()` → `.maybeSingle()`;
`if (error) throw error;` fravær beholder dagens `notFound()`/`redirect(...)`.

| Sted | Fravær beholder |
|---|---|
| `app/[locale]/admin/courses/[id]/edit/page.tsx:109` | `notFound()` |
| `app/[locale]/admin/games/[id]/page.tsx:227` | `notFound()` |
| `app/[locale]/admin/games/[id]/status/page.tsx:86` | `notFound()` |
| `app/[locale]/admin/games/[id]/edit/page.tsx:118` | `redirect('/admin/games')` |
| `app/[locale]/games/[id]/rediger/page.tsx:86` | `redirect('/games/${id}')` |

**A2 — actions med strukturert feilkode-retur:** splitt benene; error →
`{ ok: false, error: 'db_error' }` (legg til i unionen der den mangler); fravær beholder
dagens semantiske kode. Queriene her er allerede `maybeSingle` — ingen query-bytte.

| Sted | Fravær beholder |
|---|---|
| `app/[locale]/games/[id]/foursomesActions.ts:44,58,71` | `not_in_game`/`candidate_not_in_game`/`game_not_found` |
| `app/[locale]/games/[id]/patsomeActions.ts:43,57,70` | samme koder som foursomes |
| `lib/bbb/setBingoBangoBongoHole.ts:70` | `game_not_found` |
| `app/[locale]/signup/[shortId]/teamActions.ts:625` | `not_found` (unionen har allerede `db_error`) |

Builder verifiserer at konsumentene av patsome-/BBB-/team-kodene har samme
ukjent-kode-fallback som `FoursomesTeeStarterBanner` (scouting bekreftet kun foursomes);
mangler fallback et sted, legges `'db_error'` inn i mappingen der med eksisterende generisk
melding — ingen nye i18n-nøkler.

**A3 — `startScheduledGame.ts:94`:** bytt til `.maybeSingle()`; error →
`{ ok: false, reason: 'db_game' }` (finnes i unionen); fravær beholder `'not_found'`.
Builder sjekker alle 5 konsumenter (admin-action, game-home-fallback, cron-ruta,
`lib/league/actions.ts:736`, `lib/games/syncDerivedGamesStatus.ts:195`) for at `'db_game'`
fra dette oppslaget håndteres — cron-ruta er alt bekreftet OK.

**A4 — admin-actions med redirect-feilkoder:** error → logg + `throw error` (til rutas
error boundary — å dikte nye `?error=`-koder ×4 flyter er tyngre og issuet sier selv
«kast/propager»); fravær beholder dagens redirect. `.single()`-steder bytter til
`.maybeSingle()`.

| Sted | Fravær beholder |
|---|---|
| `app/[locale]/admin/games/[id]/inviteToGameActions.ts:316` | `?error=not_found` |
| `app/[locale]/admin/games/[id]/signups/actions.ts:78,88` | `request_not_found`/`game_not_found` |
| `app/[locale]/admin/games/[id]/edit/actions.ts:162` | `?error=not_editable` |
| `app/[locale]/admin/games/[id]/edit/actions.ts:234` | `not_editable` (optimistic-lock-miss = fravær; i dag er lock-miss PGRST116-error — maybeSingle-byttet er selve fiksen) |
| `app/[locale]/admin/courses/[id]/edit/actions.ts:120` | `?error=tee_not_found` (alt maybeSingle; kun splitt) |

### Tabell B — bevisst best-effort, la stå (resten, ~25 steder)

Ingen adferdsendring. Steder som mangler logg på error-benet får `console.error` (#567-
konvensjonen); steder der intensjonen ikke er kommentert får én linje `// Best-effort by
design (#1445): …` så fremtidige audits ikke re-flagger.

- **Degradér-til-tomt-helpers (logger allerede):** `lib/friends/getFriendIds.ts:20`,
  `getFriendConnectionIds.ts:21`, `getFriendPlayerOptions.ts:39`,
  `lib/users/getCoPlayerIds.ts:19,33`, `getTeamCandidates.ts:54`,
  `lib/clubs/isClubAdminAnywhere.ts:32` (fail-closed), `lib/games/inviteEligibility.ts:52,73`
  (dokumentert fail-safe), `getPublicSignupRoster.ts:33`, `getGameSocialProof.ts:53`,
  `recomputeCourseHandicap.ts:134`, `lib/notifications/notifyInvitedToGame.ts:36,55`
  (best-effort-varsel per CLAUDE.md).
- **Inserts/RPC uten fravær-semantikk (feil er feil, koden er riktig):**
  `app/[locale]/admin/games/new/actions.ts:281`, `app/[locale]/admin/courses/new/actions.ts:81`,
  `lib/cup/actions.ts:190`, `lib/games/createGuestPlayer.ts:168`.
- **Generisk-feilkode-actions (begge ben lander på ærlig generisk melding):**
  `app/[locale]/admin/spillere/actions.ts:126,160` (resend_failed/withdraw_failed — mangler
  logg, legg til), `app/[locale]/invite/actions.ts:59` (invite_error=unknown — legg til logg).
- **Prefill-conveniences fra search-params:** `app/[locale]/opprett-spill/page.tsx:106,183`
  — revansje-/bane-prefill degraderer til tom veiviser; å kaste ville veltet hele
  opprett-døra for en prefill-flake. Legg til logg på error-benet.
- **Klient-side med ærlig feilmelding + retry:** `components/passkey/PasskeyLoginButton.tsx:38`.
- **Død `!data`-ben på listequeries:** `lib/games/startScheduledGame.ts:189` (`db_players`
  er alt riktig kode) — la stå.

## Edge Cases & Guardrails

- **Fravær må aldri begynne å kaste:** `.single()`→`.maybeSingle()`-byttene er nettopp for at
  ekte 0-rad IKKE skal treffe det nye throw/db-kode-benet. Testene låser begge ben.
- **`redirect()` kaster NEXT_REDIRECT:** throw-before-redirect-rekkefølgen i A4 er trygg;
  ikke pakk `redirect()` i try/catch.
- **Exhaustive switches:** nye `'db_error'`-medlemmer i action-unioner kan treffe
  `Record`/switch-konsumenter — `npm run build` er gate, ikke bare `tsc` (kjent felle).
- **Ingen retry-logikk, ingen ny abstraksjon** (helper for splitten e.l.) — mønsteret er tre
  linjer per sted; en abstraksjon gjemmer semantikken denne oppryddingen skal synliggjøre.

## Key Decisions

- **A2 gir kode, A4 kaster:** in-play-actions (tee-starter, BBB) skjer midt i runden — generisk
  feilmelding + retry på stedet er riktig UX; admin-redirect-actions er sjeldne og har error
  boundary med retry. Uniformt «kast overalt» ville gitt full feilside midt i scoreføring.
- **Ingen nye i18n-nøkler:** ukjent-kode-fallbacks gjenbrukes; er fallback fraværende et sted,
  mappes `db_error` til eksisterende generisk melding.
- **ASSUMPTION (autonom økt):** ingen produktvalg her — brukersynlig endring skjer kun under
  transiente DB-feil, der dagens oppførsel (villedende «finnes ikke») byttes mot ærlig
  feil + retry. Eier har veto via PR-en.

**Claude's Discretion:** eksakt loggmeldingstekst; om en (b)-kommentar er overflødig der
eksisterende kommentar alt dekker intensjonen; testfil-intern organisering.

## Success Criteria

- [ ] **K1:** Alle 16 tabell A-steder splitter error fra fravær per mønster A1–A4 (verifiser i diff per sted).
- [ ] **K2:** Fravær-adferd uendret: samme koder/redirects/notFound som før for ekte 0-rad (tester + diff-review).
- [ ] **K3:** Type A error-vs-fravær-tester (getGameWithPlayers.test-mønsteret: error → throw/db-kode, 0-rad → dagens semantikk) lagt til i de eksisterende co-located testfilene for: foursomesActions, patsomeActions, teamActions, edit/actions, signups/actions, inviteToGameActions, courses/[id]/edit/actions, startScheduledGame, setBingoBangoBongoHole. Ingen nye testfiler; ingen tester for (b)-steder eller sider.
- [ ] **K4:** Hvert nytt error-ben logger med `[fnNavn]`-prefiks og feilobjektet som argument.
- [ ] **K5:** Tabell B-steder: uendret oppførsel; manglende logg lagt til; `#1445`-markørkommentar der intensjon ikke alt er kommentert.
- [ ] **K6:** `npx tsc --noEmit`, endrede filers co-located tester, `npm run lint` og `npm run build` grønt; ingen versjonsbump/CHANGELOG (refactor-prefiks, `Refs #1445`).

## Gates

```bash
npx tsc --noEmit
npx vitest run <co-located tester for alle endrede filer>
npm run lint
npm run build   # fanger exhaustive-switch-brudd tsc alene ikke ser
```

Ingen staging-klikkrunde: endringen er kun observerbar under transiente DB-feil, som ikke
kan fremprovoseres i en klikkrunde. e2e-@gate i CI (kjører mot prod-bygg siden 06a9aff9)
dekker regresjonsvern for normalflyten. Noteres i PR-en som `VERIFICATION GAP`-erstatning.

## Files Likely Touched

Tabell A: 5 page.tsx + 8 action-/helperfiler. Tabell B: ~6 filer får logg/kommentar.
Tester: 9 eksisterende `.test.ts`-filer får nye cases. Ingen migrasjoner, ingen skjema, ingen RLS.

## Out of Scope

- Retry-/backoff-logikk, strukturert logging, observability-plattform.
- `?error=`-koder som ikke stammer fra `error || !`-formen (dekket av #567).
- Rendrede feilmeldingers copy — ingen nye i18n-strenger.
- Eksisterende (b)-steders design (f.eks. om inviteEligibility burde kaste) — dokumentert
  fail-safe står.
