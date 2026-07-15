# Spec: Betaling-admin — fjern redundant summary-kort + gate kompakt-linje på withdrawn_at

**Issue:** #1145 · **Branch:** claude/1145-betaling-fjern-summary-kort-gate-withdrawn

## Problem
To små betalings-visnings-rester fra #1049/#1068:

1. **Redundant summary-kort på `/betaling`.** `app/[locale]/admin/games/[id]/betaling/page.tsx:110-122` viser et kort med «Startkontingent {beløp}» / «{paid} av {total} betalt» / «{count} mangler». Den samme informasjonen står allerede på admin-spillsiden i `BetalingOverviewSection.tsx:34-50` (ett tapp unna, via `viewAll`-lenken til nettopp denne siden), og purre-knappen i `BetalingClient.tsx:90-99` viser allerede det handlingsrettede mangler-tallet. Kortet er dobbel-visning uten egen jobb.
2. **Bonus-bug som forsvinner ved fjerning.** `page.tsx:82-84` regner `paidCount`/`totalCount`/`missingCount` fra `active` (ekskluderer withdrawn, men inkluderer gjest), mens `BetalingClient`-knappen ekskluderer gjest (`BetalingClient.tsx:45-47`). To tellemåter side om side. Når kortet fjernes, forsvinner den divergerende tellingen helt — ingen egen fiks trengs.
3. **Kompakt betalingslinje vises for trukne spillere.** `app/[locale]/games/[id]/(home)/page.tsx:882-888` (#1068) gater kun på `me.paid_at == null` og ligger UTENFOR `me.withdrawn_at`-ternæren (linje 849-875). En trukket, ubetalt spiller ser derfor angre-banneret (linje 850-864) OG rett under en betalingslinje som ber dem betale for en runde de er ute av.

## Design

### 1. Fjern summary-kortet på `/betaling`
I `app/[locale]/admin/games/[id]/betaling/page.tsx`:
- Slett `<div className="rounded-xl border border-border bg-surface-2 …">`-blokka, linje 110-122.
- Slett den nå foreldreløse utregningen linje 79-84 (`active` / `paidCount` / `totalCount` / `missingCount`) — verifiser med grep at ingen andre referanser står igjen i fila (allerede sjekket: kun kortet brukte dem).
- Slett `formatKr`-importen linje 8 (`import { formatKr } from '@/lib/format/formatKr';`) — den ble kun brukt i kortet (linje 112). `npm run build` fanger evt. gjenværende bruk.
- `game.entry_fee_kr <= 0`-grenen (linje 104-107) og roster-rendringen (`MiniRibbon` + `BetalingClient`, linje 124-131) står urørt. `game` og `players` hentes fortsatt.

### 2. Rydd de foreldreløse i18n-nøklene (T2 change-propagation)
De tre nøklene brukes KUN av kortet (grep-bekreftet — eneste call-site er `page.tsx:112/115/119`). Fjern dem fra BEGGE kataloger for å holde `messages/catalogParity.test.ts` grønn:
- `messages/no.json:3068-3070` — `summaryLabel` / `summaryCount` / `summaryMissing` under `admin.game.betaling`.
- `messages/en.json:3068-3070` — samme tre nøkler under samme sti.
- ⚠️ Det finnes andre `summaryLabel`-nøkler på andre stier (no.json:3435, 3496, 3963) — IKKE rør dem. Kun de tre under `admin.game.betaling`.

### 3. Gate kompakt-linja på `withdrawn_at`
I `app/[locale]/games/[id]/(home)/page.tsx:882`, endre guarden fra
`{me.paid_at == null && (` til `{me.paid_at == null && me.withdrawn_at == null && (`.
`me.withdrawn_at` er allerede i bruk i samme fil (linje 849, 1175) — ingen ny felt-henting.

### 4. Levering (bruker-synlig → full flyt)
- Atomiske commits, hver med `Refs #1145` i body. Foreslått deling: (a) home-page withdrawn-gate = `fix`, (b) betaling-kort-fjerning + i18n = `fix`.
- Version-bump per `fix`-commit: `npm version patch --no-git-tag-version`, stage `package.json` + `package-lock.json`.
- CHANGELOG: én Feilrettinger-linje per bruker-synlig endring under «Juli 2026»-seksjonen (`docs/changelog-conventions.md` FØR skriving). Utkast:
  - withdrawn-gate: «Trekker du deg fra en runde som pågår, ber ikke appen deg lenger om å betale startkontingenten — betalingslinja er borte når du er ute.»
  - kort-fjerning: «Betaling-siden for arrangøren er ryddet: det doble «X av Y betalt»-kortet øverst er borte — tallet står på spillsiden, og purre-knappen viser hvor mange som mangler.»
- PR: `Closes #1145` i body, `Refs #1145` i commits. Staging-verify av begge flatene FØR merge (se Gates). Merge `gh pr merge --rebase --delete-branch`.

## Key Decisions
- **Ingen ny «X av Y»-telling på `/betaling`.** Tallet lever på admin-spillsidens overview-kort (ett tapp unna) + purre-knappens mangler-count. Å beholde en tredje telling var nettopp problemet.
- **Bonus-buggen fikses ved fjerning, ikke ved retting.** Den divergerende `missingCount` forsvinner med kortet — ingen grunn til å harmonisere en telling vi sletter.
- **Ingen nye tester.** Rent view-subtraksjon + én-linjes guard. Ingen render-test finnes på disse to komponentene (grep-bekreftet), og test-disiplinen forbyr «mens jeg var her»-tester. Catalog-parity-testen holdes grønn ved å fjerne nøklene fra begge kataloger.

**Claude's Discretion:** commit-granularitet (én samlet `fix` vs. to atomiske), eksakt CHANGELOG-ordlyd (kjør `humanizer:humanizer` på de norske linjene), og om `game.status`-typefeltet (page.tsx:18) fortsatt trengs etter opprydding (behold hvis `game` fortsatt typet via `GameRow`).

## Success Criteria
- [x] `/betaling` viser ikke lenger «Startkontingent {beløp}» / «{paid} av {total} betalt»-kortet — kun heading, spillnavn og roster (med purre-knapp). — EVIDENS: kortet slettet i a0dcdd74; staging-render mot `torny-staging` gir `[data-testid="betaling-content"].childElementCount = 3` (`header,div,div`) og 0 `bg-surface-2`-kort direkte under content, med `entry_fee_kr = 200` (dvs. kontingent-grenen rendret faktisk).
- [x] `formatKr`-import og `active`/`paidCount`/`totalCount`/`missingCount` er borte fra `betaling/page.tsx` uten gjenværende referanser. — EVIDENS: `grep -n "formatKr\|paidCount\|totalCount\|missingCount\|const active"` på fila → 0 treff; `npm run build` exit 0.
- [x] `summaryLabel`/`summaryCount`/`summaryMissing` under `admin.game.betaling` er fjernet fra både `no.json` og `en.json`; øvrige `summaryLabel`-nøkler urørt. — EVIDENS: JSON-path-sjekk (node require) → `admin.game.betaling` 20 → 17 nøkler i BEGGE kataloger, `summary*` = [], parity true; `grep -c summaryLabel` = 3 i hver katalog (courses/archived tees, formats/auditLog, liga/addRound) — uendret.
- [x] En trukket, ubetalt spiller ser IKKE den kompakte betalingslinja på spill-hjem under aktiv runde (kun angre-banneret). — EVIDENS: staging, spill `E2E-1145-withdrawn` (aktiv, 200 kr, `withdrawn_at` satt, `paid_at` null): `[data-testid="payment-compact"]` → 0 treff, angre-banner → 1.
- [x] En ikke-trukket, ubetalt spiller ser fortsatt betalingslinja som før (ingen regresjon på #1068). — EVIDENS: staging, spill `E2E-1145-betaling` (samme spiller, samme kontingent, `withdrawn_at` null): `[data-testid="payment-compact"]` → 1 treff, angre-banner → 0. A/B-en skiller kun på `withdrawn_at`, så orakelet er beviselig i stand til å både slå ut og la være.
- [x] `package.json` bumpet (patch) og CHANGELOG har Feilrettinger-linje(r) for de bruker-synlige endringene. — EVIDENS: 1.205.1 → 1.205.2 (withdrawn-gate) → 1.205.3 (kort-fjerning); to linjer under «Juli 2026»-skuffen, teller 23 → 25. commit-msg-hooken godtok begge.

## Gates
- [x] `npm run build` (fanger foreldreløs `formatKr`/variabel-bruk og manglende i18n-nøkler) — exit 0, 0 failure-markører, full rute-tabell.
- [x] `npm run lint` — exit 0, 0 errors (56 warnings). KORRIGERT (evaluator-funn): warningene ligger i ~50 filer, ikke bare `lib/scoring`/`lib/wizard`, og ÉN av dem — `app/[locale]/games/[id]/(home)/page.tsx:166` — er berørt av denne PR-en. `GameHomePage`-kompleksiteten går 123 → 124 fordi guarden får ett `&&` til. Fortsatt kun warning (taket er 25; main lå allerede ~5× over), lint exit 0 → ikke blokkerende, men påstanden «urørte filer» var feil.
- [x] `npx vitest run messages/catalogParity.test.ts` (grønn = katalogene fortsatt i balanse) — 1 fil, 2 tester, grønn.
- [x] Staging-verify: (a) admin `/admin/games/[id]/betaling` uten summary-kort, (b) trukket ubetalt spiller på spill-hjem uten betalingslinje, (c) ikke-trukket ubetalt spiller MED betalingslinje. Post bevis på PR-en. — EVIDENS: alle tre grønne, 0 console errors, 0 kall mot prod-ref. Bevis-kommentar + `staging-verified`-label på PR #1254; testdata (`E2E-1145-*`) slettet og bekreftet med frisk SELECT.

## Files Likely Touched
- `app/[locale]/admin/games/[id]/betaling/page.tsx` — fjern summary-kort + foreldreløs utregning + formatKr-import
- `app/[locale]/games/[id]/(home)/page.tsx` — legg `me.withdrawn_at == null` til betalingslinje-guarden (linje 882)
- `messages/no.json` — fjern tre foreldreløse nøkler under `admin.game.betaling`
- `messages/en.json` — fjern de samme tre nøklene
- `CHANGELOG.md` — Feilrettinger-linje(r)
- `package.json` (+ `package-lock.json`) — patch-bump

## Out of Scope
- Ingen server-/RLS-/skjema-endring. `paid_at` forblir admin-gated med affected-rows-sjekk i `betaling/actions.ts` — betalingslinja og kortet er rene visninger.
- `BetalingOverviewSection.tsx` (admin-spillsidens telle-kort) og dens telling endres ikke.
- `BetalingClient`-purre-knappen / gjest-eksklusjon endres ikke.
- Ingen nye tester.
