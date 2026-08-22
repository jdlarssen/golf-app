# Evaluation: #1390 — Løft 8–10px mikrotekst til 11px i kjerneløkkas resultatflater

**Builder:** Nattkjøreren (#1079), Opus-bygg
**Evaluator:** Fersk-kontekst Opus (separat agent)
**Contract:** issue-kommentar på #1390 (kontrakt-smeden 2026-08-21), Alternativ A
**Branch:** `claude/natt-1390-mikrotekst` fra `origin/main@db9eb5c`

## Runde 1 — implement → gates → evaluate → ACCEPT

Én sweep-commit (`676ccda`, 50 filer, +146/−132): 127 forekomster løftet (122
`text-[8–10px]`-klasser i 42 filer + 5 inline `fontSize`), 0 klassifisert som
dekor i scope, 0 bruk av 10.5-unntaksventilen (drilldown-pillene MÅLT med ekte
Inter-advance-widths: «+22» ≈ 21.1px i 24px innholdsboks ved 11px — passer).
`GAMES_LEDGER_GRID` 84→100px («PÅMELDING» målt til 95.5px ved 11px + tracking;
84px-sporet var alt 0.4px for trangt på main), skeleton `w-20`→`w-24`;
`COURSES_LEDGER_GRID` bevisst urørt (64px-kolonnen holder tee-antall, ikke chip).
StatusChip-JSDoc og ScoreCard-kommentaren oppdatert i samme commit (T2).
Én kommentar-linje i `LedgerHeader.tsx` rettet (84→100px — ellers lyver dokken);
ingen størrelses-endring der.

Fersk-kontekst-evalueringen kunne ikke motbevise noen kriterier:

- SC1: kontraktens grep gir ÉN gjenværende treff i scope — `HoleClient.tsx:1053`
  `fontSize: 10.5` (compliant gulv; regexen over-matcher 10.5 i inline-form).
  Komplettsjekk mot main: 47 filer / 128 treff — null treff-filer urørt.
- Inverse/Out-of-Scope: kun to filer utenfor scope rørt, begge tillatt
  (grid-konstanten) eller kommentar-only (LedgerHeader — verifisert hunk).
- SC2-ankerne: alle verifisert på eksakt linje.
- Ingen copy-endringer; script-normalisering av alle 126 endrede kodelinje-par
  viser byte-identisk modulo størrelses-token (tracking/uppercase/tabular-nums/
  faste bredder bevart).
- SC4: ingen testfiler i diffen, full vitest 6554/6554 uten snapshot-writes.

**Verdict: ACCEPT** med 2 minor + 1 nit (ingen blokkerende):

| Sev | Funn | Utfall |
|-----|------|--------|
| minor | Død ternary i `NassauPodium.tsx:344` (begge grener identiske etter løftet — `size`-propen uten effekt) | Fikset i `e80b7d4` (prop fjernet, konstant klasse); tsc ✓, 217 leaderboard-tester ✓ |
| minor | Matchplay-«brutto»-sublabelen er nå samme størrelse som parent-headeren (hierarki hviler på font-normal/normal-case/opacity-80) — kontrakt-konformt, men første sjekkpunkt i 360px-runden | Notert i PR (staging-runden) |
| nit | 360px-sjekklisten bør også ta et blikk på øvrige StatusChip-mounts (cup-/liga-ledger, klubbhuset) — chipen vokste ~14 % | Notert i PR (staging-runden) |

### Gates på `676ccda` (re-kjørt av evaluator) + `e80b7d4`

| Gate | Resultat |
|------|----------|
| `npx tsc --noEmit` | exit 0 (begge commits) |
| `npm run lint` | 0 errors, 56 advarsler (identisk main-baseline) |
| `npx vitest run` (full) | 493 filer, **6554 passed**, ingen snapshot-oppdateringer |
| `npx vitest run 'app/[locale]/games/[id]/leaderboard'` (etter e80b7d4) | 217 passed |
| `node scripts/weekly-release.mjs --dry-run` | én #1390-linje, gyldig |

## Verdict

**ACCEPT** etter 1 runde (+ minor-opprydding). Gjenstår: obligatorisk
staging-klikkrunde på 360px (SC3) — matchplay-view (brutto-sublabel først),
holes-drilldown, hull-side m/ «+N SLAG», podium, admin-spillisten (100px-kolonnen)
og admin/courses-listen; pluss et blikk på cup-/liga-/klubbhus-chipene.
Kryss-modell-gate (Steg 4.5) kjøres separat før levering.
