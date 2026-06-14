# Forge-evaluering: Status-bevisst leaderboard-footer (#605)

- **Verdict:** ✅ **ACCEPT**
- **Branch:** `claude/inspiring-wescoff-45e2c1`
- **Commit evaluert:** `afd6d66b` — `fix(leaderboard): status-aware footer says «Vel spilt!» on finished games`
- **Evaluator:** fresh-context skeptisk verifisering, 2026-06-14
- **Kontrakt:** `.forge/contracts/605-finished-leaderboard-footer.md`

Alle 7 success-kriterier (C1–C7) verifisert med command-output / file:line-evidens. Alle gates grønne (tsc, eslint, vitest). Design-sanity-sjekk bestått: ingen annen konsument av den repurposede `wellPlayed`-nøkkelen.

## Per-kriterium

| # | Kriterium | Verdict | Evidens |
|---|-----------|---------|---------|
| **C1** | `wellPlayed` = "Vel spilt!"/"Well played!", ingen duplikat, catalogParity grønn | ✅ PASS | `grep -c '"wellPlayed"'` = **1** i hver fil (`no.json:1800` = `"Vel spilt!"`, `en.json:1800` = `"Well played!"`). Ligger i `leaderboard.common`-namespace ved siden av `goodLuck`/`congratulations`. `catalogParity.test.ts`: **3 passed**. |
| **C2** | `LeaderboardFooter` finnes, rendrer `wellPlayed` på finished ellers `goodLuck`; test grønn | ✅ PASS | Komponent: `LeaderboardFooter.tsx:29` → `{gameStatus === 'finished' ? tc('wellPlayed') : tc('goodLuck')}`. Server-komponent (ingen `'use client'`), egen `useTranslations('leaderboard.common')`, props `gameStatus`/`className?`. Test: **2 passed** (finished→Vel spilt; draft/scheduled/active→Lykke til). |
| **C3** | Nøyaktig 18 sites bruker `<LeaderboardFooter`; ingen leftover inline footer | ✅ PASS | `grep 'LeaderboardFooter gameStatus'` (ekskl. test) = **18** render-sites i **18** distinkte filer (9 views + 9 holes-views). `grep 'wellPlayed'` under `holes/` = **0** (alle hardkodede main-footere erstattet). Per-fil diff (BBBView/BBBHolesView) viser ren erstatning ETTER `</ul>`, className bevart. |
| **C4** | Live-only sites UENDRET | ✅ PASS | `git show afd6d66b --name-only` rører **ingen** av: SoloStablefordView, SoloStrokeplayView, TexasScrambleView, TeamStablefordView, eller noen `page.tsx`. Alle 4 gameStatus-løse views beholder inline `goodLuck` (SoloStrokeplay:122, SoloStableford:116, TexasScramble:130, TeamStableford:104) og importerer **ikke** komponenten. Reveal-hidden `goodLuck`-PullQuotes i holes-views' early-return-grener (linje 70–89) urørt. `LeaderboardFooter` importeres kun innenfor `leaderboard/`-dir. |
| **C5** | Finished → «Vel spilt!»; live → «Lykke til.» | ✅ PASS | Komponenttest beviser status→tekst-mappingen. Views threader ekte `gameStatus`-prop (BBBView:44 union-type i signatur, :147 sendt til footer; samme variabel driver `statusLabel`:106 + reveal-gate:73 → genuint live-felt). |
| **C6** | Ingen «Gratulerer»-dobling: podium = congratulations, footer = wellPlayed | ✅ PASS | `tc('congratulations')` konsumeres KUN av Podium-komponentene (BingoBangoBongoPodium m.fl.) + matchplay-views. `LeaderboardFooter.tsx`-treffet er FALSK POSITIV — kun JSDoc-kommentar (linje 16/18), ikke render. Footer rendrer aldri `congratulations`. |
| **C7** | Versjon `1.127.4` + CHANGELOG-oppføring m/ #605 | ✅ PASS | `package.json:3` = `"1.127.4"`. `CHANGELOG.md:24` = `### [1.127.4] - 2026-06-14 · #605`, korrekt nestet under åpen `1.127.y`-tema-serie, tre-lags struktur (tagline-blockquote + Teknisk-details), tagline idiomatisk norsk. |

## Gates

| Gate | Resultat |
|------|----------|
| `npx tsc --noEmit` | ✅ exit 0, ingen feil |
| `npx eslint` (18 endrede .tsx) | ✅ **0 errors**, 8 warnings — alle `_gameId` unused-var, **pre-eksisterende** (`git diff` rører ingen `_gameId`-linje), eksplisitt akseptert i kontrakten |
| `npx vitest run app/[locale]/games/[id]/leaderboard` | ✅ **36 files / 184 tests passed** |
| `npx vitest run messages/catalogParity.test.ts` | ✅ 3 passed |
| `npx vitest run LeaderboardFooter.test.tsx` | ✅ 2 passed |
| `npx vitest run lib/mail/gameFinishedNotification.test.ts` | ✅ 31 passed (regresjons-sjekk for ordlyd-endring) |

Build (`npm run build`) ikke kjørt — tsc + tester gir tilstrekkelig signal per evaluerings-instruks; ingen exhaustive-switch/Record-feller forventet (komponenten bruker enkel ternær, ikke ny `GameMode`-medlem).

## Design-sanity-sjekk: er repurposing av `wellPlayed` trygt?

✅ **Trygt.** Eneste kode-konsument av `leaderboard.common.wellPlayed` repo-vidt er den nye `LeaderboardFooter.tsx`. De 9 holes-views konsumerte den tidligere direkte, men ruter nå alle gjennom komponenten.

Litteralen «Godt spilt.» / «Well played.» finnes fortsatt, men i en **separat, urelatert** streng: ICU-meldingen `mail.gameFinished.bodyMatchplay` (`no.json:4253` / `en.json:4253`) og dens inline-snapshots i `gameFinishedNotification.test.ts:404/411/854`. Dette er hardkodet prosa inne i en mail-template, IKKE en referanse til `wellPlayed`-nøkkelen. Verdi-endringen påvirker dem ikke — bekreftet ved at mail-suiten (31 tester) er grønn. Ingen snapshot-filer refererer footer-teksten.

## Begrensninger (ikke feil)

Live browser-verifisering (Playwright/Chrome/preview) IKKE utført: krever auth + et seedet finished-spill per format, ikke gjennomførbart i dette miljøet (eier tester i prod). C5/C6 verifisert ved komposisjon — komponenttest beviser logikken, diff beviser prop-threading, separate Podium-komponenter beviser congratulations-skillet. Anbefal eier-spotsjekk på én ferdig BBB/Nassau-leaderboard i prod post-deploy.

## Gaps

Ingen blokkerende. Implementasjonen følger kontrakten nøyaktig — 18 sites wiret, 4 live-only + page.tsx + reveal-grener urørt, ingen nye tester utover C2-komponenttesten (per test-disiplin), versjon/CHANGELOG på plass.
