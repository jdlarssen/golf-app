# Evaluering: #1499 — Cup-avslutningsvarslene peker på resultatsiden og teaser bare

## VERDIKT: ACCEPT

Fresh-kontekst skeptisk gjennomgang av `claude/auto-1499-82dadf` (5 commits over
origin/main). Hvert Success Criteria verifisert selvstendig — ingen avkryssing tatt på tro.
Alle porter grønne, ingen resultat-lekkasje igjen i mailen, deeplinken lander på
resultatsiden, `cup_started` urørt, uavgjort/vinner-branchen er borte.

## Per kriterium

| # | Kriterium | Verdikt | Bevis |
|---|---|---|---|
| 1 | `deeplink.test.ts` grønn: `cup_finished` → `/cup/{id}/resultater`, `cup_started` → `/cup/{id}` | PASS | `npx vitest run lib/mail/cupFinishedNotification.test.ts lib/notifications/deeplink.test.ts` → «Test Files 2 passed / Tests 9 passed». cup_started-vakt: deeplink.test.ts:59–68. |
| 2 | `CupFinishedNotificationParams` uten team-/poeng-/vinnerfelt, build/typecheck grønn | PASS | cupFinishedNotification.ts:28–35 har kun `to`/`playerFirstName`/`tournamentName`/`tournamentId`/`locale`. `npm run typecheck` → EXIT=0. |
| 3 | Mail-body uten vinner/stilling for både vinner- og uavgjort-scenario | PASS | Templaten har ingen vinner/uavgjort-branch (cupFinishedNotification.ts:55–104 — kun salutation + bodySettled + teaser + CTA). Text-snapshot: «Cup-en "Høst-cup 2026" er avgjort. / Hvordan endte det? Svaret venter på resultatsiden. / Se resultatet: …». Ingen lagnavn/poeng/vinner. |
| 4 | CTA «Se resultatet»-familien i begge locales; ingen forlatte cupFinished-result-nøkler | PASS | `grep resultWinner\|resultDraw\|viewLeaderboard messages/ lib/` treffer kun `holes.entry` (no/en:2206) og `gameFinished` (no/en:5266) + `gameFinishedNotification.ts` — alle egne namespaces, IKKE cupFinished. messages/{no,en}.json:5231–5236 har nå teaser/viewResult/viewResultText. |
| 5 | Berørt flyt staging-verifisert før merge (innboks-kort → resultatsiden), bevis + label | PASS | PR #1513 har label `staging-verified`. Bevis-kommentar: e2e-spiller tappet innboks-kort → RESULTATER-siden, nettverkslogg `GET /cup/5c9eefec-…/resultater → 200`. Mail-sending flagget som VERIFICATION GAP (best-effort, snapshot-dekket) — ærlig og i tråd med I3. |

## Ekstra kontroller (utover avkryssingen)

- **`team1Points`/`winnerTeamName` i hele repoet:** `grep -rn 'team1Points\|winnerTeamName' --include='*.ts'` → alle treff i cup-leaderboard/scoring (`computeCupLeaderboard.ts` + tester, `getCupSnapshot.test.ts`) og `actions.ts:426–428` (winnerTeam-DB-utledning). `winnerTeamName` gir NULL treff — helt ute av mailen. Ingen treff refererer cup-MAILEN. LEGITIME.
- **Kallstedet `finishTournament` (actions.ts:466–492):** mail-kallet sender kun `to`/`playerFirstName`/`tournamentName`/`tournamentId` + `locale`; `winnerName`-utledningen slettet; `Promise.allSettled` best-effort-mønster intakt. `winnerTeam`-DB-skrivingen (actions.ts:425–440, `winner_team: winnerTeam` via `expectAffected`) STÅR. `finalLeaderboard` har fortsatt konsument (winnerTeam-utledningen) — ikke dødt.
- **`cup_started`-deeplink (deeplink.ts:86–89):** returnerer fortsatt `/cup/${p.tournament_id}` uten /resultater. Urørt.
- **Edge — uavgjort vs vinner:** ingen branch igjen i templaten; body er deterministisk (kun tournamentName/playerFirstName/tournamentId/locale som input). Uavgjort- og vinner-mailen er nå BIT-IDENTISKE. Kontrakt-kravet oppfylt.
- **Skjema-kommentar:** types.ts:180–184 (`cupFinishedSchema`) oppdatert til å peke på `/cup/[id]/resultater`. `cupFinishedSchema` selv urørt (payload bar aldri resultatdata). formatNumber-importen fjernet (cupFinishedNotification.ts:11).
- **Naboer:** `npx vitest run lib/mail lib/notifications` → Test Files 28 passed / Tests 257 passed (inkl. den trimmede `resend-contract.test.ts`-fixturen).

## Funn

Ingen blokkerende funn. Arbeidet oppfyller kontrakten fullt ut.
