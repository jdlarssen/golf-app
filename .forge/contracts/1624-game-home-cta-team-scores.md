# Kontrakt: #1624 — Game-home-CTA teller lagets kort, ikke bare mitt

**Issue:** [#1624](https://github.com/jdlarssen/golf-app/issues/1624)
**Branch:** `claude/1624-game-home-cta-team-scores`
**Type:** fix (bruker-synlig → `.changes/`-notat + staging-verifisering før merge).
Ingen produktvalg: tredje flate av samme rot-mønster som #1577 (hull-siden) og
#1538 (Hjem-kortet) — fiks-figuren er etablert og merget (PR #1625).

## Rotårsak

`PrimaryCtaSection` (`app/[locale]/games/[id]/(home)/PrimaryCta.tsx:64–71`)
teller fullførte hull med `.eq('user_id', currentUserId)`. I lag-kollapsede
modus (scramble-familien, alternate-shot-matchplay, patsome fra hull 7) eier
lag-kapteinen (lex-min `user_id`) lagets `scores`-rader — for ikke-kapteiner
blir settet aldri komplett: CTA-en står i «Fortsett runden» og når aldri
`ready_to_submit`, selv når lagkortet er ferdig tastet. `nextHole`-scannen
peker også på hull laget alt har tastet.

## Drift-tabell (sjekket mot HEAD 390fbb5d)

| Issue-påstand | HEAD-status |
|---|---|
| PrimaryCta.tsx ~68 teller `eq('user_id', currentUserId)` | Stemmer (:64–71) |
| Helper-paret fra #1577 «på PR-branch» | UTDATERT — PR #1625 er MERGET i dag; `lib/games/scoreOwner.ts` + `teamCaptain.ts` ligger på main |
| Hjem-kortet bruker `teamScoreOwnerId` | Stemmer (`getActiveGameCardData.ts`) |

## Avgjørelser

- **D1 — samme figur som #1625:** callsite (game-home `page.tsx`) beregner
  `myTeamScoreOwnerId` fra allerede-lastede `gwp.players`
  (`me.team_number == null ? null : teamScoreOwnerId(players på mitt lag)`)
  og sender `gameMode` + `teamScoreOwnerId` som props til `PrimaryCtaSection`.
  Ingen ny fetch — rosteren er alt i minnet.
- **D2 — fetch + per-hull-filter i seksjonen:** `.in('user_id',
  scoreOwnerUserIds(gameMode, currentUserId, teamScoreOwnerId))` +
  `select('hole_number, user_id')`, deretter `filter(r => r.user_id ===
  scoreOwnerForHole(gameMode, r.hole_number, …))` før hull-settet bygges —
  patsome-kravet (egen rad hull 1–6, kapteinens 7–18) håndteres av helperen,
  aldri av et flatt id-bytte.
- **D3 — `computeState`/`nextHole` røres ikke:** de leser det korrigerte
  hull-settet; solo-modus og kaptein er byte-identisk (`scoreOwnerUserIds`
  returnerer `[viewerId]`).
- **D4 — utenfor scope:** submit-siden og hull-siden (#1577, alt fikset),
  Hjem-kortet (#1538), øvrige `eq('user_id')`-flater uten CTA-effekt.

## Suksesskriterier

- [x] **S1:** Ny test `PrimaryCta.test.ts` (mock `getGameContext`, inspiser
      returnert element-props — ingen render): (a) ikke-kaptein i greensome
      med komplett lagkort → `state: 'ready_to_submit'` (RED mot HEAD);
      (b) patsome ikke-kaptein: egne rader 1–6 + kapteinens 7–18 → komplett,
      men kapteinens rader på 1–6 teller IKKE (per-hull-filteret);
      (c) solo-modus uendret (egne rader, `teamScoreOwnerId` null).
      **Evidens:** RED 21:43 (3 failed / 1 passed — nøyaktig de tre lag-casene);
      GREEN 21:44 (4/4). Mocken filter-emulerer user_id-filtrene; evaluator
      re-verifiserte RED-påstanden mot origin/main-koden.
- [x] **S2:** Gates: `npx vitest run` på ny testfil + `lib/games/scoreOwner.test.ts`
      + `npm run build` exit 0.
      **Evidens:** 2 filer / 93 tester grønne (builder OG evaluator);
      `npm run build` exit 0 (bakgrunnslogg); evaluator `tsc --noEmit` exit 0.
- [x] **S3:** Staging: rigg aktiv lag-kollapset runde der e2e-admin IKKE er
      kaptein og lagkortet er komplett → game-home viser lever-CTA-en
      (ready_to_submit; faktisk katalog-copy er «Gjennomgå og lever →»,
      kontrakten siterte husket tekst). Bevis-kommentar +
      `staging-verified`-label på PR.
      **Evidens:** rigget «TEST-1624 Greensome» (aktiv, admin ikke-kaptein,
      kortfører eier alle 18 rader) → Playwright: «Gjennomgå og lever →» +
      «18 av 18 hull tastet inn» + submit-lenke (count 1); skjermbilde;
      prod-vakt 0 treff; rigg slettet. PR #1639-kommentar + label.
- [x] **S4:** `.changes/1624-*.md`-notat (type fix).
      **Evidens:** `.changes/1624-lever-cta-lagmodus-hjem.md`, type fix,
      issue 1624; sitert copy rettet til «Gjennomgå og lever» etter
      evaluator-funn (kosmetisk).

## Gates

- `npx vitest run "app/[locale]/games/[id]/(home)/PrimaryCta.test.ts" lib/games/scoreOwner.test.ts`
- `npm run build`

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Solo-modus (teamScoreOwnerId null) | Byte-identisk — egne rader telles |
| Kaptein i kollapset modus | Egen id == eier-id → identisk oppførsel |
| Ikke-kaptein, komplett lagkort | ready_to_submit (fiksens kjerne) |
| Ikke-kaptein, delvis lagkort | in_progress med riktig telling + nextHole |
| Patsome hull 1–6 | Egne rader teller, kapteinens ignoreres |
| Patsome hull 7–18 | Kapteinens rader teller |
| Helt withdrawn lag | teamScoreOwnerId null → egne rader (som før #1577) |
| Segment-spill (front9/back9) | Uendret — samme segmentHoles-scan på korrigert sett |
