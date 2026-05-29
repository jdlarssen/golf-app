# Contract: Verifiser + fiks trusted-creator games-RLS-gap

**Issue:** [#230](https://github.com/jdlarssen/golf-app/issues/230)
**Parent prior art:** [#198](https://github.com/jdlarssen/golf-app/issues/198) (allowlist-MVP) + [#223](https://github.com/jdlarssen/golf-app/issues/223) Fase 4 (writeClient-pattern i courses)
**Branch:** `claude/lucid-goldwasser-0f661c`

## Diagnose (verifisert via Supabase MCP, kun read-only SQL)

| Spørsmål | Funn | Konklusjon |
|---|---|---|
| `fornes.even@yahoo.no`.is_admin | `false` | Genuine trusted-non-admin → forklaring #2 («secretly admin») **falsk** |
| `games` RLS `admin write` | `is_admin()` for USING+WITH CHECK, polcmd `*` | Matcher migrasjon 0002 → forklaring #3 («manuell dashboard-endring») **falsk** |
| `game_players` RLS `admin write` | `is_admin()` likeså | Bulk-insert av medspillere blokkeres òg |

**Verdikt: forklaring #1 — bug shipped 2026-05-25 (#198 merge), aldri testet med en faktisk trusted-bruker.** #198-kontrakten (linje 29–31) *planla* `getAdminClient()`-bypass betinget av «verifiser at RLS faktisk blokkerer» — den verifiseringen konkluderte feil / ble hoppet over, og bypass-en ble aldri implementert. Eksisterende test (`actions.test.ts:167`) mocker `games.insert` til å lykkes uansett klient → ga falsk trygghet.

**Bonus-funn:** publish-flytens roster-read (`users` select på linje 94) er RLS-bundet (`users select own or shared games`). For et splitter nytt spill deler de tilføyde spillerne ennå ikke et spill med skaperen → RLS returnerer en delmengde → `findPendingPlayers` ser færre rader → «pending-spiller»-sperra **no-op-er stille** for trusted-skapere (feiler ikke, hopper bare over sjekken). Bruker valgte full paritet → denne lesningen eleveres òg.

## Mål

Trusted-non-admin creators kan opprette spill (draft + publish) via `/opprett-spill` nøyaktig som admin, med pending-spiller-sperra i paritet. **Ingen RLS-endringer** (viderefører #198 small-bet; full RLS-revisjon er parent #22).

## Tekniske beslutninger

1. Destrukturer `isAdmin` fra `requireAdminOrTrustedCreator(supabase)`.
2. `const writeClient = isAdmin ? supabase : getAdminClient();` — én binding, speiler #223 Fase 4 courses-pattern (`app/admin/courses/[id]/edit/actions.ts:220`).
3. Rut gjennom `writeClient`: `games` INSERT, `game_players` INSERT, **og** publish-roster-read (gate-paritet — brukervalgt full paritet).
4. `tournaments`-read forblir request-scoped (`supabase`): RLS = `true` (alle authenticated), og cup-link-stien nås ikke av trusted-skapere uansett.
5. `notifyInvitedToGame` urørt — bruker allerede `getAdminClient()` internt (`lib/notifications/notifyInvitedToGame.ts:28`), så den er ikke RLS-blokkert for trusted. Ikke et latent funn.
6. Ingen RLS-/migrasjons-endringer, ingen nye tabeller/kolonner.

## Filer som endres

| Fil | Status | Hva |
|---|---|---|
| `app/admin/games/new/actions.ts` | ENDRET | import `getAdminClient`; destrukturer `isAdmin`; `writeClient`-binding; 3 call-sites (games insert, game_players insert, publish roster read) |
| `app/admin/games/new/actions.test.ts` | ENDRET | mock `@/lib/supabase/admin`; regresjonstest som beviser admin-klient brukes for trusted (det den gamle testen bommet på), og IKKE for admin |
| `package.json` | ENDRET | PATCH-bump `1.44.0` → `1.44.1` (bruker-synlig fix) |
| `CHANGELOG.md` | ENDRET | Oppføring under 1.44.y-serien |

## Suksess-kriterier (en checkbox per kriterium, med bevis)

- [x] **K1:** `actions.ts` destrukturerer `isAdmin` og binder `writeClient = isAdmin ? supabase : getAdminClient()`. Bevis: `actions.ts:5` (import), `:92` (destructure), `:101` (binding).
- [x] **K2:** `games` INSERT bruker `writeClient`. Bevis: `actions.ts:140-141` (`await writeClient.from('games').insert(...)`).
- [x] **K3:** `game_players` INSERT bruker `writeClient`. Bevis: `actions.ts:192`.
- [x] **K4:** publish-roster-read bruker `writeClient` (gate-paritet). Bevis: `actions.ts:104-105` (`await writeClient.from('users')...`).
- [x] **K5:** Admin-stien uendret — `writeClient === supabase` når `isAdmin` (`:101`); `tournaments`-read forblir på `supabase` (`:124`, RLS=`true`). Admin-test (`actions.test.ts`) asserterer `getAdminClient` IKKE kalt.
- [x] **K6:** Regresjonstest — trusted draft: `getAdminClient` kalt 1×; `games`+`game_players` insert på `adminMock.__fromCalls`, IKKE `supabaseMock`; `created_by='trusted-1'`. Publish-variant: roster-read (`users.in`) på `adminMock`. Bevis: 18/18 grønn + revert-test (byttet `writeClient`→`supabase` på games insert → begge trusted-tester feilet med `error=db_game`, admin-tester grønn) → testene fanger faktisk bug-en.
- [x] **K7:** Regresjonstest — admin: `expect(getAdminClientMock).not.toHaveBeenCalled()` + writes på `supabaseMock`. Grønn.
- [x] **K8:** `npm test` grønn — 1766 passed (151 filer).
- [x] **K9:** `npm run lint` grønn — 0 errors (11 pre-eksisterende `_gameId`-warnings i urelaterte leaderboard-views).
- [x] **K10:** `npm run build` grønn (full route-table, ingen typecheck-feil).
- [x] **K11:** PATCH-bump `1.44.0` → `1.44.1` (`package.json`) + CHANGELOG-oppføring under 1.44.y med stakeholder-tagline (humanizer-kjørt). Commit-msg-hook passerte (krever package.json+CHANGELOG stagede for `fix(...)`).

## Gates (kjøres etter hver chunk)

```bash
npm run lint
npm test -- app/admin/games/new/actions.test.ts   # scoped underveis
npm run build
```

Full `npm test` kjøres før evaluator.

## Commits-plan (atomiske)

1. `fix(admin): route trusted-creator game creation through admin client (RLS bypass)` — kode + test + version-bump + CHANGELOG (én commit; version-bump-hook krever samtidig stage av package.json + CHANGELOG.md for `fix(...)`).

## Out-of-scope-funn å notere

- #198 false-confidence-lærdom (test mocket bort RLS) → noteres i #230 closing-kommentar under «Teknisk», ikke egen issue.
- Andre funn → ny GitHub-issue per `feedback_review_findings_as_issues`.
