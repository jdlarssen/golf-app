# Forge-kontrakt #419 — Rød `tsc --noEmit` på main: tre type-feil i test-filer

**Issue:** [#419](https://github.com/jdlarssen/golf-app/issues/419)
**Branch:** `claude/keen-mclaren-8d58cf`
**Type:** `test` (kun test-fil-type-fikser → ingen version-bump, ingen CHANGELOG)
**Milestone:** Backlog — uplanlagt / scale-triggered

## Bakgrunn

`npx tsc --noEmit` er rød på `main` med nøyaktig tre type-feil, alle i **test-filer**
(verifisert: full tsc gir 3 feil, ingen flere). `next build` (prod) påvirkes ikke —
Next bygger ikke test-filer inn i app-grafen — men typecheck-gaten er rød, så ekte
feil kan drukne i kjent støy. Oppgaven: gjør `tsc --noEmit` grønn ved å rette de tre
fikstur-/mock-typene, uten å endre test-oppførsel eller røre produksjonskode.

## De tre feilene + valgt fix (alle behavior-preserving)

### F1 — `app/complete-profile/actions.test.ts:84` (TS2493)
`expect(updateMock.mock.calls[0][0]).toMatchObject({ hcp_index: -1.5 })` — `updateMock`
er `vi.fn(() => ({ eq: updateEqMock }))` (linje 20), som inferrer **null argumenter**,
så `.mock.calls[0]` er tom-tuple `[]` og `[0]` finnes ikke.
**Fix:** gi `updateMock` eksplisitt arg-signatur, samme mønster som `updateEqMock`
allerede bruker (`vi.fn<(...args: unknown[]) => …>`):
`const updateMock = vi.fn<(...args: unknown[]) => { eq: typeof updateEqMock }>(() => ({ eq: updateEqMock }));`

### F2 — `app/profile/ProfileFormBody.test.tsx:51` (TS2322)
`renderForm({ gender: null })` — `baseInitial.gender` er `'mens' as const` (type `'mens'`),
så `Partial<typeof baseInitial>` gjør gender til `'mens' | undefined`; `null` passer ikke.
Komponentens faktiske prop-type er `InitialValues.gender: Gender | null` (`Gender = 'mens' | 'ladies'`).
**Fix (test-only, produksjonskode urørt):** widen fikstur-feltets type inline til
`gender: 'mens' as 'mens' | 'ladies' | null`. (`InitialValues`/`Gender` er **ikke** eksportert
fra komponenten, og issue-scope sier ingen produksjonskode røres → derfor inline union i
testen, ikke en ny eksport fra `ProfileFormBody.tsx`.)

### F3 — `lib/games/deliveryStatus.test.ts:105` (TS2769)
`['withdrawn', …].filter(isDeliveryReminderTarget)` — array-literalet inferreres som
`string[]`, men `isDeliveryReminderTarget(status: DeliveryStatus)` tar den smalere
`DeliveryStatus` (ikke en type-guard), så ingen `.filter`-overload matcher. Den ytre
`: DeliveryStatus[]`-annotasjonen + `as DeliveryStatus[]`-casten gjelder resultatet, ikke
arrayet som går *inn* i filter.
**Fix:** type array-literalet som `DeliveryStatus[]` før filtrering, og dropp den nå
overflødige trailing-casten:
`const all: DeliveryStatus[] = ['withdrawn', …]; const targets = all.filter(isDeliveryReminderTarget);`

## Suksesskriterier

- [x] **K1** — `actions.test.ts`: `updateMock` har eksplisitt arg-signatur; `.mock.calls[0][0]` resolver; `toMatchObject`-assertion uendret; testen grønn. *Evidens: diff @17 `vi.fn<(...args: unknown[]) => { eq: typeof updateEqMock }>`; G1 tsc-rent; G2 grønn.*
- [x] **K2** — `ProfileFormBody.test.tsx`: `baseInitial.gender` aksepterer `null`; `renderForm({ gender: null })` typechecker; testene grønne; **`ProfileFormBody.tsx` (produksjonskode) urørt**. *Evidens: diff @12 `gender: 'mens' as 'mens' | 'ladies' | null`; `git status` viser ingen `.tsx`-produksjonsfil endret; G1/G2 grønn.*
- [x] **K3** — `deliveryStatus.test.ts`: array typet `DeliveryStatus[]` før `.filter`; `toEqual(['ready_not_delivered'])`-assertion uendret; testen grønn. *Evidens: diff @95 `const all: DeliveryStatus[] = [...]; const targets = all.filter(...)`; assertion-linja urørt; G2 grønn.*
- [x] **K4** — `npx tsc --noEmit` returnerer **0 feil** (hele prosjektet grønt). *Evidens: «G1 PASS: tsc fully clean (0 errors)».*
- [x] **K5** — Diffen er **kun type-/mock-justeringer i de tre `*.test.*`-filene**: ingen produksjonskode endret, ingen nye tester lagt til, ingen assertions endret. *Evidens: `git status` = kun de tre `*.test.*` modifisert; diff er 3 hunks, alle type-/mock-only; G2 19/19 (samme antall tester som før).*

## Gates

```bash
# G1 — Hele poenget: full typecheck grønn.
npx tsc --noEmit

# G2 — De tre endrede test-filene består fortsatt (oppførsel bevart).
npx vitest run app/complete-profile/actions.test.ts app/profile/ProfileFormBody.test.tsx lib/games/deliveryStatus.test.ts

# G3 — Lint på de tre endrede filene (ingen nye lint-problemer).
npx eslint app/complete-profile/actions.test.ts app/profile/ProfileFormBody.test.tsx lib/games/deliveryStatus.test.ts
```

## Out of scope

- Eksportere typer (`InitialValues`/`Gender`) fra produksjonskomponenten — issue-scope er test-only.
- Legge til nye tester eller endre eksisterende assertions (test-disiplin: ren type-hygiene).
- Andre tsc-advarsler/lint-mønstre utenfor de tre filene.
- En CI-gate for å hindre regresjon — egen eventuell oppgave, ikke gold-plate her.

## Commit-plan

Én atomisk `test`-commit (de tre fiksene henger sammen via «gjør tsc grønn»):

```
test: #419 fix three pre-existing type errors in test fixtures
```
