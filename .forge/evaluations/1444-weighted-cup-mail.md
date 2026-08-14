# Evaluering: #1444 vektet cup-startmail

**Verdikt: ACCEPT**

Evaluert 2026-08-14 mot `origin/main..HEAD` (én commit, `5b9c58ab`) med drift-noten i kontrakten lagt til grunn (K5 = `.changes/`-notat, ikke versjons-bump; skip-gaten satt på `lib/cup/actions.ts:272`).

## Kriterier

- **K1 — PASS.** `pointsToWin: number | null` (`lib/mail/cupStartedNotification.ts:41`, med JSDoc). Null-grenen rendrer weighted-linja i BEGGE locales og i BEGGE deler: fire nye inline-snapshots (NO text + bodyHtml, EN text + bodyHtml) inneholder «Vinneren kåres når cupen avsluttes.» / «The winner is decided when the cup ends.» — ingen «Først til»/«First to»-rester og ingen `NaN`/søppeltall i null-snapshotene.
- **K2 — PASS.** `git diff --numstat` på testfila: `42 0` — kun tillegg, ikke én eksisterende snapshot-linje endret. Suite kjørt selv UTEN `-u`: `npx vitest run lib/mail lib/cup messages` → 43 filer / 586 tester grønne, null snapshots skrevet.
- **K3 — PASS.** `git diff -w` på `lib/cup/actions.ts` viser nøyaktig: ASSUMPTION-blokka fjernet, `if (pointsToWin !== null)`-gaten fjernet (`-  }` på slutten), og én kommentar-oppdatering inne i map-callbacken. Recipient-gatingen (`sendMailByUserId.get(r.user_id) === true`, #417), `Promise.allSettled` og begge `console.error`-stiene er bit for bit uendret — resten av diffen er ren re-innrykking.
- **K4 — PASS** (med notat, se Funn 1). Begge katalogene har `bodyMatchupWeighted` + `bodyMatchupWeightedText` under `mail.cupStarted`; diffen på `messages/no.json`/`en.json` er +2 linjer hver, ingenting annet rørt. NO-linja «{team1} møter {team2}. Vinneren kåres når cupen avsluttes.» er idiomatisk bokmål og verbatim kontrakt-ordlyden.
- **K5 — PASS.** `.changes/1444-vektet-cup-startmail.md` i samme (eneste) commit: `type: fix`, `issue: 1444`, brødtekst én setning godt under 400 tegn, ingen ulovlige nøkler — gyldig per `.changes/README.md`. Commit-body har `Refs #1444`. `package.json`/`CHANGELOG.md` urørt (diff-stat bekrefter).
- **K6 — DEFERRED.** Staging-verifisering av start-flyten hører til PR-fasen (staging-verified-label før merge, #1076). Ikke evaluert her.

### Adversarial

- **(a) — PASS.** `formatNumber` kalles kun på `cupStartedNotification.ts:91`, inne i `else`-grenen (ikke-null); toppnivå-kallet fra gamle :63 er borte.
- **(b) — PASS.** Nøyaktig ÉN chrome-lås i testfila (`it('HTML chrome: full template for default-case')`, linje 184); de nye casene bruker `bodyHtml()`-helperen, ingen ny full-template-snapshot.
- **(c) — PASS.** `git diff origin/main..HEAD -- lib/mail/resend-contract.test.ts` er tom; fila kjørte grønn som del av lib/mail-suiten.
- **(d) — PASS.** Bekreftet: `grep winnerTeamName|resultWinner|resultDraw` i `cupFinishedNotification.ts` gir null treff — commit `56a29a10` («cup-finished mail teases only — no winner or score», #1499-løpet) erstattet winner/draw-branchen med `bodySettled`. Presedensens fravær invaliderer ingenting: TS-branch-mønsteret (framfor ICU-select) er fortsatt det som er bygget, og null-håndteringen i cupStarted er selvstendig. Kontraktens out-of-scope-påstand om at avslutningsmailen «takler NULL» er nå trivielt sann (den brancher ikke lenger i det hele tatt).
- **(e) — PASS.** Eneste ikke-test-kallsted for `sendCupStartedNotification` er `lib/cup/actions.ts:267` (`startTournament`).

### Gates (kjørt selv, Node 22)

- `npx vitest run lib/mail lib/cup messages` → 43 filer / 586 tester, alle grønne, 0 snapshots skrevet.
- `npm run lint` → 0 errors, 55 warnings — alle pre-eksisterende (f.eks. `fitsPlayerCount`-kompleksitet, urørt av branchen).
- `npx tsc --noEmit` → exit 0.
- **`npm run build` trenger IKKE re-kjøring:** tsc-gate-fella gjelder nye union-medlemmer som treffer uttømmende switcher — her utvides kun én leaf-parameter (`number | null`), ingen union får nye medlemmer, og hele-prosjekt-`tsc --noEmit` (kjørt over) dekker typeflaten fullt. Det build-eksklusive (cacheComponents-/`export const runtime`-fella, rute-kompilering) er ikke i spill: ingen rute-/side-filer rørt, kun mail-helper, action-innmat, JSON-kataloger og tester.

## Funn

1. `messages/no.json` + K4 (evidens-del, ikke-blokkerende): Kontraktens gate 3 krever humanizer-pass på ny NO-copy med «humanizer-verdikt i commit-/PR-tekst» — commit-teksten nevner ingen humanizer-kjøring. Substansen er uproblematisk (copyen er verbatim den kontrakt-godkjente ordlyden fra issuet, A1), og evidens-kanalen «PR-tekst» er fortsatt åpen: PR-fasen bør ta med humanizer-verdiktet i PR-body-en. Blokkerer ikke ACCEPT.
