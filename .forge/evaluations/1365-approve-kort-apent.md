# Forge-evaluering: #1365 — Åpne 18-hulls-kortet som standard på /approve

**Dato:** 2026-08-13
**Branch:** `claude/forge-auto-1365-b2f2bc` (PR #1588)
**Verdict: ACCEPT**

Evaluert med fersk kontekst mot kontrakten i issue-kommentar 1 på #1365
(«Forge-kontrakt tilgjengelig», Alternativ A). Default var NEEDS WORK; alle
punkter under er positivt bevist.

## A. Kontraktens 5 designpunkter mot diffen

Diff-omfang: 4 filer, +22/−4 (`git diff origin/main...HEAD --stat`):
`.changes/1365-approve-kort-apent.md`, `app/[locale]/games/[id]/approve/page.tsx`,
`messages/en.json`, `messages/no.json`.

1. **`open` på details, summary beholdt** — OK. Diffen viser
   `<details open data-testid="approve-scorecard-details" className="px-4 py-3 border-b border-border">`
   med `<summary>`-elementet urørt under (`approve/page.tsx:262–268`).
2. **Nøytral etikett i begge locales** — OK. `messages/no.json:1999`
   «Vis 18-hulls-kort» → «18-hulls-kort»; `messages/en.json:1999`
   "Show 18-hole card" → "18-hole card". Grep bekrefter at gammel streng er
   borte overalt og at `showCard`-nøkkelen kun brukes på dette ene stedet
   (`approve/page.tsx:268`).
3. **Ingen confirm på godkjenn** — OK. `ReviewActions.tsx` er IKKE i diffen
   (name-only-lista over er komplett).
4. **Skeleton modellerer åpent kort** — OK. `PendingApprovalsSkeleton` fikk
   6 tabellrad-skeletons (`h-4 w-full`, trinnvis delay) under summary-linja i
   stedet for én linje (`approve/page.tsx:361–369` i diffen).
5. **`data-testid="approve-scorecard-details"`** — OK, på details-elementet
   (`approve/page.tsx:264`).

## B. Out of Scope respektert

OK. Diffen rører ingen approve-/reject-actions, ikke `pendingApprovalsFor`,
ikke admin-siden, ikke nøkkeltall-sammendrag — kun de tre kontrakt-filene +
`.changes/`-notatet. Kontraktens tilleggskrav om oppfølgings-issue for
admin-godkjenningsstien er oppfylt: **#1586** («Admin- og oppretter-godkjenning
av scorekort viser ingen hulltall — samme mønster som #1365 fikset på /approve»)
er opprettet med milestone «Backlog — uplanlagt / scale-triggered» og labels
`enhancement` + `area:scorecard` (repoets label-konvensjon, verifisert mot
`gh label list`).

## C. Suksesskriterier

Staging-bevis: kommentar fra jdlarssen på PR #1588 («✅ Staging-verifisert»,
Playwright mot torny-staging `snwmueecmfqqdurxedxv`, spill «E2E-1365
Approve-kort»).

1. **Åpent kort uten tapp** — alle tre orakler grønne: `details.open=true` +
   18 `tbody tr` + første/siste rad synlig; console-errors tomme; SQL bekrefter
   1 pending rad før kjøring.
2. **Toggle virker** — struktur-orakel (klikk → `open=false`/rader skjult →
   klikk → `open=true`/rader synlige) og feillogg grønne; SQL-orakel markert
   «–» med begrunnelse «ren visning» (se funn 1).
3. **Godkjenn/avvis uendret** — begge bevislinjer holder: (a) staging viser
   POST 303, kortet ut av pending-lista, `approved_at` + `approved_by_user_id`
   satt (alle tre orakler grønne); (b) diffen rører ikke actions (punkt A3/B);
   (c) e2e-@gate (slag→lever→godkjenn) grønn i PR-CI (`gh pr checks 1588`:
   e2e pass 3m40s).

Prod-vakt dokumentert i beviset: samtlige Supabase-kall mot staging-ref,
håndhevet i driveren. Testdata slettet etter kjøring.

## D. Gates

| Gate | Kommando | Resultat |
|---|---|---|
| Vitest (4 i18n-suiter) | `npx vitest run lib/scoring/modes/types.i18n.test.ts lib/i18n/format.test.ts lib/games/status.i18n.test.ts lib/games/allowanceCopy.test.ts` | GRØNN — 4 filer, 231/231 tester passert |
| Typecheck | `npx tsc --noEmit` | GRØNN — exit 0 |
| Changes-notat | Manuell sjekk mot `.changes/README.md` + `node scripts/weekly-release.mjs --dry-run` | GRØNN — `type: fix`, `issue: 1365`, én brødtekstlinje ≤400 tegn, ingen title/link/cta (korrekt for fix); dry-run exit 0, notatet foldes inn i 1.233 («45 rettinger») uten valideringsfeil |
| Commit-melding | `git log origin/main..HEAD` | GRØNN — én commit `d45bd6f4` med `fix(approve):`-prefix og `Refs #1365` i body |
| CI på PR | `gh pr checks 1588` | GRØNN — verify ×2, e2e ×2, scan, Vercel: alle pass |

Merk: kontraktens gate-tekst «patch-bump + CHANGELOG-linje» er skrevet før
versjonsregime #1562; bygget følger korrekt dagens regime (notatfil, ingen
bump — diff mot `package.json`/`CHANGELOG.md` er tom). Se funn 2.

## E. PR-form

OK på alle punkter (`gh pr view 1588`):
- Body har `## Produktvalg`-heading med `### Alternativ A` (bygget) og
  `### Alternativ B`, hver med fordeler/ulemper som punktliste.
- Ombyggingskostnad for B: «liten–middels — samme data, annen visning».
- Reversibilitet: «Høy for begge …».
- Svar-instruks: «Svar 'alternativ B' her, så bygges det om på samme branch.
  Ingen hast — PR-en venter til du svarer eller merger.»
- `isDraft: true` (draft-først per #1516).
- Label `staging-verified` satt.
- `Closes #1365` i body.

## Funn

Ingen blokkerende funn. To ikke-blokkerende observasjoner:

1. **Staging-bevis punkt 2 mangler SQL-orakel** — markert «–» med begrunnelsen
   «ren visning». Akseptert: en klient-side details-toggle har ingen DB-tilstand
   å assertere; struktur- og feillogg-oraklene dekker punktet.
2. **Kontrakt-drift på versjonsgaten** — kontrakten krever «patch-bump +
   CHANGELOG-linje», som er utdatert etter #1562. Bygget fulgte korrekt dagens
   obligatoriske regime (`.changes/`-notat, ingen bump). Avvik fra kontraktens
   ordlyd, ikke fra repoets regler — ingen handling nødvendig.
