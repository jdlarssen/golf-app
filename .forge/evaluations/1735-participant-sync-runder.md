# Evaluation: #1735 — Cup: synkroniser `tournament_participants` ved spillerbytte

**Builder:** Nattkjøreren (#1079), Opus-bygg · **Evaluator:** fresh-context Opus
**Contract:** issue-kommentar #1735 (alternativ A valgt, produktvalg: true)
**Branch:** `claude/natt-1735-participant-sync` fra `origin/main@8cb7790`

## Runde 1 — implement → gates → fresh-context evaluate → ACCEPT

Én runde. Ingen funn som krevde omarbeid.

### Endringer

| Fil | Endring |
|-----|---------|
| `lib/cup/participantRosterSync.ts` | NY — ren `planParticipantRosterSync({outUserId, inUserId, rosterUserIds})` → `{addParticipantId, removeParticipantId}`; `rosterUserIds: null` = «roster-lesing feilet» → aldri delete uten bevis. |
| `lib/cup/participantRosterSync.test.ts` | NY — Type A, ett `it.each`-beslutningstabell (6 rader). |
| `lib/cup/actions.ts` | `SwapPlan.allCupGameIds`; `syncParticipantsAfterSwap()` etter skrivefasens try/catch, før revalidate/redirect; best-effort (all feil logges, aldri throw); `cupRedirectBase().revalidate()` utvidet med Spillere-rom-stiene. |
| `lib/cup/actions.test.ts` | Snevret `tournament_participants`-assertionen til lese-/planfasen; seedet post-write-roster-lesingen; nytt `#1735`-describe (3 caser) med delte helpers. |
| `.changes/1735-participant-sync.md` | NY — `type: fix`, `issue: 1735` (dry-run: gyldig 1.234.1-rettingslinje). |

### Suksesskriterier — verifisert (evaluator)

| # | Kriterium | Bevis | Resultat |
|---|-----------|-------|----------|
| 1 | Reserve upsertes; ut-spiller fjernes kun ved 0 gjenværende matcher | Testene «ut-spilleren står i 0 gjenværende matcher …» + «… står fortsatt i en annen match: deltaker-raden beholdes»; `onConflict 'tournament_id,user_id'` matcher PK i migrasjon 0155. Sync ligger etter skrivefasen; `already_started`-rollback returnerer FØR sync. | PASS |
| 2 | Spillere-dør-telleren reflekterer byttet | Kodesti-inspeksjon: `fetchCupDoorData` teller `tournament_participants` request-scoped; spillere-rutene finnes og revalideres locale-aware. Ingen kjørt flyt i økten. | PASS (inspeksjon) — staging-runde gjenstår |
| 3 | Sync-feil blokkerer ikke byttet | Test «synkingen feiler: byttet står likevel, feilen logges» (RedirectError + `console.error`-assert); strukturelt kan ingen throw nå caller. | PASS |
| 4 | Type A-dekning på ren helper | 6 tabellrader inkl. `null`-roster og tom roster; «reserve allerede deltaker» delegeres til I/O-laget (idempotent upsert, assertet i actions.test). | PASS |

### Gates

| Gate | Kommando | Resultat |
|------|----------|----------|
| Types | `npm run typecheck` | exit 0 (clean) |
| Tester | `npx vitest run lib/cup` | 30 filer / 506 tester grønne |
| Tester (naboer) | `npx vitest run "app/[locale]/admin/cup"` | 4 / 37 grønne |
| Lint | `npx eslint <4 endrede filer>` | 0 errors (1 pre-eksisterende kompleksitets-warning i urørt funksjon) |
| Changelog-notat | `node scripts/weekly-release.mjs --dry-run` | parses, 1.234.1-rettingslinje |

**Grønn-main-gate (Steg 2.2, én gang):** `npm ci` + typecheck + `npm test` (6662/6662) + lint (0 errors) + `guard.test.sh` (39/0) — alt grønt på `origin/main@8cb7790`.

### Funn (ikke-blokkerende — følges opp som issues, jf. CLAUDE.md §Reviewer-funn)

- **F1** `lib/cup/actions.ts + kriterium 1`: post-write-roster-lesingen er ubegrenset (hele cupens `game_players`) der kun to user-ids trengs; en PostgREST max-rows-trunkering som mister `outUserId` kan i teorien slette en deltaker som fortsatt står i en match. Fjern-risiko i dag (største staging-cup: 36 rader), reell ved ~150-deltaker-skala.
- **F2** `lib/cup/actions.ts + scope`: revalidering-utvidelsen ligger i delte `cupRedirectBase` — `startTournament`/`finishTournament` buster nå også Spillere-stiene. Kun cache-invalidering; lest som akseptert bredde, nevnes i PR.

## Verdict

**ACCEPT** — alle byggbare suksesskriterier grønne; staging-klikkrunden (kriterium 2, ekte flyt) håndteres i Steg 4/leveranse.

## Kryss-modell-gate (Steg 4.5) — Sonnet CONFIRM

Uavhengig Sonnet-agent (fersk kontekst; kun kontrakt + diff + evalueringsrapport)
forsøkte å motbevise suksesskriteriene: **CONFIRM**. Re-verifiserte gates selv
(506 lib/cup-tester, tsc clean, eslint 0 errors, dry-run gyldig). Restfunnene
F1/F2 vurdert ikke-substansielle for kriteriene som skrevet; F1 er filet som #1745.
