# Evaluering: 18-hulls-kort i godkjenningslistene (#1586)

**Dato:** 2026-08-13
**Branch:** `claude/forge-auto-1586-kortvisning` (4 commits foran origin/main)
**PR:** #1596 (draft)

## Verdict: ACCEPT

Alle fem designpunkter er implementert som kontrahert, out-of-scope er respektert,
staging-beviset dekker suksesskriteriene 1–4 med tre orakler per punkt, og alle
gates jeg kunne kjøre lokalt er grønne. Fire mindre funn, ingen blokkerende.

---

## A. Kontraktens 5 designpunkter

### A1. Delt `ScorecardTable` + atferds-identisk /approve-refaktor — OPPFYLT

- Ny server-komponent `app/[locale]/games/[id]/_components/ScorecardTable.tsx`
  (98 linjer): props `{ holes, scores, teeGender, holeSegment }`, filtrerer selv
  med `isHoleInSegment` (linje 31–33), rendrer kolonnene
  `colHole/colPar/colSi/colStrokes`, `ParAsideInline`, `ScoreShape`/`scoreShape`/
  `scoreTone`. Markupen i komponenten er tegn-for-tegn identisk med JSX-en som
  ble fjernet fra `approve/page.tsx` (verifisert ved å lese begge sider av
  diffen, inkl. `text-[10.5px]`-klassene, `score-num`, `#252`-kommentaren).
- `/approve` bruker komponenten (`approve/page.tsx:266-271`). `<details open
  data-testid="approve-scorecard-details">` består (`approve/page.tsx:258-262`
  med #1365-kommentaren intakt).
- Approve-siden segment-filtrerer fortsatt selv (`approve/page.tsx:197-198`,
  trengs for played-telleren på linje 232) — komponenten filtrerer samme mengde
  én gang til, idempotent. Ingen atferdsendring.

### A2. Sekretariatet — OPPFYLT

- `admin/games/[id]/page.tsx:1028-1035`: «Leverte scorekort»-seksjonen mapper
  `submitted` = ALLE med `submitted_at != null` (både needsApproval og
  godkjente); details-blokken (linje 1084–1099) ligger per rad i den mappen,
  sammenslått (ingen `open`), `data-testid="submitted-scorecard-details"`,
  summary = `game.approve.showCard`.
- `hole_segment` lagt til i games-selecten (linje 230) + `GameRow` (linje 99);
  `tee_gender` i game_players-selecten (linje 410) + `GamePlayerRow` (linje 128).
- Datahenting kun ved aktivt spill: `submittedIds` er `[]` når
  `game.status !== 'active'` (linje 444–449), og `fetchScorecardReviewData`
  tidlig-returnerer uten queries på tom liste.
- Fremdrifts-queryen (linje 415–427, `select('user_id, hole_number')` uten
  strokes) er urørt — ikke i noen diff-hunk.

### A3. Oppretter-flaten — OPPFYLT

- `games/[id]/spillere/page.tsx:219-231`: scores via `getAdminClient()` med
  begrunnelses-kommentar (#1542/#1009-mønsteret sitert), `course_holes` via
  vanlig `supabase`-klient (første argument). Details-mønsteret per
  `awaitingApproval`-rad (linje 410–424), samme testid og summary.

### A4. Delt datahenting — OPPFYLT

- `lib/games/scorecardReviewData.ts`: `fetchScorecardReviewData(holesClient,
  scoresClient, ...)` — scores-klienten som parameter, med JSDoc som forklarer
  authz-forskjellen mellom flatene. `throw holesRes.error` / `throw
  scoresRes.error` (linje 58–59) — I3 oppfylt, ingen stille no-op.
  `ScorecardHole`-typen speiler `COURSE_HOLES_SELECT`-fragmentet eksakt
  (verifisert mot `lib/supabase/queryFragments.ts:19-20`).

### A5. Testid-er — OPPFYLT

- `submitted-scorecard-details` på begge nye details (admin:1086,
  spillere:412).
- `approve-on-behalf` på `ApprovePlayerButton` (egen test-commit 72902125);
  `SubmitButton` → `Button` spreader `...props` til DOM-elementet (verifisert i
  begge komponenter).

## B. Out of scope respektert — OPPFYLT

- Diff-fillisten er 9 filer: ingen actions-filer (approve/reject/reopen urørt),
  ikke `lib/games/flightScope.ts` (`pendingApprovalsFor` urørt), ingen
  `supabase/migrations/`, ingen `messages/`-filer (kun gjenbruk av
  `game.approve.*` og `admin.game.*`).
- #1595 er OPEN og IKKE forsøkt fikset: `admin/games/[id]/actions.ts` (der
  rotårsaken bor per issuet) er ikke i diffen. PR-body-en deklarerer det
  eksplisitt.

## C. Suksesskriterier 1–4 (staging-bevis på PR #1596) — OPPFYLT

Bevis-kommentaren (jdlarssen, 2026-08-13T20:57:33Z) har tre-orakel-tabellen:

1. **Sekretariatet:** testid attached, `open=false` default, 18 rader etter
   tapp; console-errors tomme.
2. **Oppretter-flaten:** samme, for en oppretter som IKKE er deltaker, med
   RLS-probe (0 scores synlige for sesjonsklienten) → service-role-stien er
   positivt bevist, ikke bare antatt. SQL-orakel: 18 score-rader for kortets
   eier.
3. **/approve-regresjon:** `approve-scorecard-details` fortsatt `open=true`,
   18 rader uten tapp (#1365 består). I tillegg: e2e-`@gate` grønn i CI (se D).
4. **Godkjenn-knappene:** `approve-on-behalf`-klikk → POST 303 på begge flater;
   SQL-orakel `approved_at` + riktig `approved_by_user_id` i begge spill
   (2 rader). Første kjøring traff #1595-blindsonen (selv-rapportert), deretter
   re-verifisert på støttede stier — se funn 3.

Prod-vakt håndhevet i driveren (`page.on('request')`, 0 avvik); testdata
slettet.

## D. Gates

| Gate | Resultat |
|---|---|
| `npx vitest run ScorecardTable.test.tsx approve/actions.test.ts` | GRØNN — 2 filer, 12 tester passed (581ms) |
| `npx tsc --noEmit` | GRØNN — exit 0 |
| `.changes/1586-leverte-scorekort-kortvisning.md` | GYLDIG — `type: fix`, `issue: 1586`, én linje ≤400 tegn, ingen title/link/cta (riktig for fix) |
| `node scripts/weekly-release.mjs --dry-run` | GYLDIG — bump 1.232.2 → 1.233.0, 1586-notatet med som fix-linje |
| `git log origin/main..HEAD` | 4 atomiske commits (`refactor` → `feat` → `fix` → `test`), alle med `Refs #1586` i body; refactor/feat/test har `[no-changelog]`/test-prefix, fix-commiten bærer notatet |
| `gh pr checks 1596` | verify + e2e + scan + Vercel **pass** på nyeste run; ett eldre duplikat-run (31743396265) står pending på e2e+verify (kjent intermitterende dobbel-trigger, #1469) |

## E. PR-form — OPPFYLT

- Body har «## Fordeler/ulemper» med 3 fordeler / 2 ulemper.
- INGEN `## Produktvalg`- eller `## Alternativ`-heading — riktig, begge valg
  avgjort av eier; avklaringene står dokumentert både i kontrakten
  («Eier-avklaringer», grå-sone-diskusjon 2026-08-13) og i PR-body-ens andre
  avsnitt.
- `isDraft: true` (draft-først per #1516), `staging-verified`-label satt,
  `Closes #1586` i body.

## Funn (ingen blokkerende)

1. **Commit-prefiks avviker fra kontrakt-gaten:** gaten sier «fix-prefix», men
   706f97e6 bruker `feat(spillere)` med `[no-changelog]`. Netto
   changelog-utfall (én fix-linje via notatet på e8d3dde8) matcher kontrakten;
   avviket er ren commit-taksonomi. Kosmetisk.
2. **Type C-testen asserter ikke testid:** kontrakt-gaten sier «18 rader +
   testid», men testid-en ligger per design (punkt 4) på konsumentenes
   `<details>`, ikke i komponenten — komponent-testen KAN ikke assertere den.
   Kontrakt-intern inkonsistens, ikke en bygge-defekt; testid-ene er verifisert
   live av staging-driveren.
3. **Kriterium 4-beviset har en selv-rapportert omvei:** første kjøring brukte
   ikke-deltakende oppretter og traff #1595 (pre-eksisterende no-op), deretter
   re-verifisert på støttede stier. Tabellens SQL-orakel («admin i A, oppretter
   i B — 2 rader») og merknaden er konsistente, men oppsettet for
   B-godkjenningen (deltakende oppretter) er ikke detaljert i kommentaren.
   Beviset holder; noterer uklarheten.
4. **Duplikat CI-run pending:** run 31743396265 (e2e+verify) sto pending ved
   evaluering mens nyeste run er helgrønt. Må være grønt/borte før
   `gh pr ready` + merge (branch protection krever verify+e2e+scan).
