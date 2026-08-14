# Evaluering: #1631 — «Hull for hull» følger source_game_id-redirecten

**Dato:** 2026-08-14
**Branch:** `claude/1631-holes-drilldown-source-redirect` (HEAD 2c50084a)
**Evaluator:** fresh-context forge-evaluator

## Per kriterium

- **S1 — PASS.** `holesData.test.ts` er load-bearing: gammel kode filtrerte scores på rå
  `gameId` inne i `Promise.all`, så avledet-testen ville fanget `scoresGameId = 'derived-1'`
  og feilet mot `toBe('host-1')` — RED mot gammel kode, GREEN nå (2/2). Fiksen matcher D1:
  gwp awaites FØR de parallelle fetchene, `scoresGameId = gwp.game.source_game_id ?? gameId`
  (holesData.ts:89–103), ingen signaturendring, brukerens klient urørt (D2). Host-testen
  låser byte-identisk oppførsel for `source_game_id = null`.
- **S2 — PASS.** `npx vitest run "app/[locale]/games/[id]/leaderboard/holes/"` → 10 filer /
  11 tester grønne (Node 22). `npx tsc --noEmit` exit 0 kjørt i stedet for ny full build
  (builder kjørte `npm run build` exit 0 tidligere; substitusjon per evalueringsinstruks).
- **S3 — PASS (bevisvurdering).** PR #1636 har eier-kommentar med spesifikt bevis: avledet
  kamp `d97c4c10…` («Singel 1», 0 egne score-rader) viser full tabell 10–18 med K-kolonne
  4,4,5,4,4,5,4,3,5 kryss-sjekket mot SQL-orakel (service-role SELECT på hostens back9);
  host `67cf7f32…` uendret (58 sifferceller); prod-vakt: 0 kall utenfor staging-ref
  `snwmueecmfqqdurxedxv`. `staging-verified`-label satt. Browserflyten er ikke re-kjørt av
  evaluator — beviset er konkret, tallfestet og orakel-forankret, ikke generisk.
- **S4 — PASS.** `.changes/1631-hull-for-hull-avledet-kamp.md`: frontmatter `type: fix` +
  `issue: 1631`, ingen ekstra nøkler, brødtekst 105 tegn (≤400), norsk brukerstemme.
  Validerer i `weekly-release.mjs --dry-run` (fail-closed-parseren godtar notatet).
- **Scope — PASS.** Diffen (utenom `.forge/`-bokføring) er nøyaktig 3 filer: notatfil, ny
  test, holesData.ts — alle sporer til #1631. `.staging-dev.mjs` / `.staging-verify-1631.mjs`
  er untracked (`??` i porcelain), IKKE i diffen. Ingen drive-by-endringer.

## Merknad (ikke-blokkerende)

PR #1636 står som draft — forventet per draft-først-konvensjonen (#1516); `gh pr ready`
skjer etter at bokføringen (denne evalueringen) er pushet.

VERDICT: ACCEPT
