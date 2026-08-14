# Evaluering: #1624 — Game-home-CTA teller lagets kort

**Dato:** 2026-08-14
**Branch:** `claude/1624-game-home-cta-team-scores` (PR #1639)
**Kontrakt:** `.forge/contracts/1624-game-home-cta-team-scores.md`
**Evaluator:** fresh-context forge-evaluator

## Per-kriterium

### S1 — Ny `PrimaryCta.test.ts` (a/b/c) — PASS

`app/[locale]/games/[id]/(home)/PrimaryCta.test.ts` (156 linjer, 4 tester, props-inspeksjon
uten render). Nøkkelpunkt verifisert:

- **Mocken EMULERER filtrene** (`eq`/`in` på `user_id`, `not` på `strokes`) — dette er det
  som gjør RED-påstanden reell. Verifisert mot `origin/main`-versjonen av `PrimaryCta.tsx`
  (`.eq('user_id', currentUserId)`, `select('hole_number')`):
  - (a) greensome ikke-kaptein, kapteinen eier 1–18: gammel kode filtrerer til 0 rader →
    `not_started` ≠ forventet `ready_to_submit` → RED. Ny kode: `in([viewer, captain])` +
    per-hull-filter → 18/18 → GRØNN.
  - (b) patsome-testene: gammel kode gir strokesCount 5 (≠17) hhv. 6 + `in_progress`
    (≠18/`ready_to_submit`) → RED. Mock-modulene (`./gameContext`, `segmentSibling`)
    finnes med samme stier på main; ekstra props ignoreres — testen kjører reelt mot main.
  - (c) solo (`teamScoreOwnerId: null`): asserter både resultat (17, `in_progress`,
    `nextHole` 18) og query-form (`captured.inIds ?? [captured.eqUserId]` = kun viewer) —
    gammel og ny kode gir identisk utfall; byte-identisk oppførsel er pinnet.
- **Patsome-grensen sjekket hardt** mot `modeCollapsesToTeamCard`
  (`lib/scoring/modes/types.ts:182–191`): patsome kollapser ved `holeNumber >= 7`.
  Test (b) er presist konstruert: viewer 1–5 + kaptein 1–18 → forventet 17
  (egne 1–5 + kapteinens 7–18), kapteinens rad på hull 6 maskerer IKKE viewerens
  manglende hull 6, `nextHole` = 6. Stemmer med helper-semantikken.

### D1 — callsite-figur (speil av #1625) — PASS

`page.tsx:1113–1123`: `me.team_number == null ? null :
teamScoreOwnerId(gwp.players.filter(p => p.team_number === me.team_number))` —
eksakt samme figur som hull-sidens `holes/[holeNumber]/page.tsx:271–275` (merget
PR #1625). Ingen ny fetch; `gwp.players` har `team_number` + `withdrawn_at`
(tsc grønn bekrefter `TeamMemberRow`-formen). Helt withdrawn lag → `null` →
egne rader (edge-tabellens siste rad).

### D2 — fetch + per-rad-filter — PASS

`PrimaryCta.tsx:82–95`: `select('hole_number, user_id')` +
`.in('user_id', scoreOwnerUserIds(...))`, deretter per-rad
`r.user_id === scoreOwnerForHole(gameMode, r.hole_number, ...)`. Aldri flatt
id-bytte — patsome-kravet håndteres av helperen. `scoreOwnerUserIds` bruker
hull 18 som «kollapser modusen noensinne»-probe og returnerer `[viewer]` for
solo/kaptein (byte-identisk sti). Semantikk lest og bekreftet i
`lib/games/scoreOwner.ts` (merget via PR #1625).

### D3 — `computeState`/`nextHole` urørt — PASS

Diffen rører ingen linjer i `computeState` (linje 18–35) eller
segment-scan-løkka (103–111); de leser kun det korrigerte hull-settet.
Solo-testen pinner at telling/nextHole er uendret.

### S2 — Gates — PASS

- `npx vitest run "app/[locale]/games/[id]/(home)/PrimaryCta.test.ts" lib/games/scoreOwner.test.ts`
  → **2 filer, 93 tester, alle grønne** (Node 22, kjørt i denne evalueringen).
- `npx tsc --noEmit` → **exit 0** (kjørt i denne evalueringen).
- `npm run build` → exit 0 rapportert av byggeren (ikke re-kjørt her; tsc + vitest
  re-verifisert uavhengig).

### S3 — Staging-verifisering — PASS

PR #1639 har `staging-verified`-label + bevis-kommentar (owner-konto):
frittstående aktiv greensome der e2e-admin IKKE er kaptein (lex-min-lagkamerat
eier alle 18 rader, admin har 0 egne), Playwright-drevet UI-flyt viste
**«Gjennomgå og lever →»** med «18 av 18 hull tastet inn» + submit-lenke,
prod-vakt (0 kall utenfor staging-ref `snwmueecmfqqdurxedxv`), rigg ryddet.
Kontraktens S3 skrev «Se over og lever» — faktisk katalog-copy er
`ctaReviewAndSubmit` = «Gjennomgå og lever →» (`messages/no.json:1882`).
Kontrakten siterte feil streng; kriteriet (CTA i `ready_to_submit` for
ikke-kaptein med komplett lagkort) er oppfylt i substans.

### S4 — `.changes`-notat — PASS

`.changes/1624-lever-cta-lagmodus-hjem.md`: frontmatter `type: fix`,
`issue: 1624`; body 142 tegn (≤400). `node scripts/weekly-release.mjs --dry-run`
validerer notatet (fail-closed parser, notatet listes og folder til
CHANGELOG-linje).

### Scope — PASS

Tracked diff = 4 filer + kontrakten, alle sporer til #1624
(notat, test, `PrimaryCta.tsx`, `page.tsx`-callsite). `.staging-*.mjs`-riggene
er untracked og ikke i diffen.

## Funn

- **[non-blocking] Changelog-notatet siterer utdatert CTA-copy.** Notatet (og
  kontraktens S3) skriver «Se over og lever», men knappen sier «Gjennomgå og
  lever →» (`messages/no.json:1882`). Samme stale sitat står i pre-eksisterende
  #1466-kommentarer i `PrimaryCta.tsx` (ikke denne branchens verk). Kosmetisk —
  brukeren som leser changeloggen ser et litt annet sitat enn knappen. Kan
  rettes i notatet før mandags-rollup, blokkerer ikke.

VERDICT: ACCEPT
