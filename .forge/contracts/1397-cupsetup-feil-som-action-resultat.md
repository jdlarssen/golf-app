# Spec: CupSetup — feil som action-resultat, ikke redirect (#1379-mønsteret)

**Issue:** #1397 · **Branch:** claude/contract-issue-1397-519eab

## Problem

`createTournamentDraft` (`lib/cup/actions.ts:110-202`) signaliserer alle feil med `redirect(errBase + kode)` tilbake til opprett-siden. `CupSetup.tsx` er en klient-komponent med state (format-multi-select) og utfylte felter (navn, to lagnavn, poeng for seier/delt) — redirecten unmounter den, så arrangøren får feilbanner over et TOMT skjema. Nøyaktig samme figur ble fjernet fra spill-veiviseren i #1379 (PR #1405); cupen ble bevisst holdt utenfor den PR-en for scope. Begge rutene rammes: `/admin/games/new?intent=cup` (frittstående) og `/klubber/[id]/cup/ny` (klubb-cup) — de deler `CupSetup`.

## Research Findings

- Mønsteret er bevist to ganger i repoet på den pinnede Next 16-versjonen, i prod: `ReadyStep.tsx:198-245` (#1379) og `CreateLigaForm.tsx:66-71` + `lib/league/actions.ts` (`LeagueActionError`). In-repo-presedens > eksterne docs her.
- **Felle:** en server-action som gis DIREKTE til `useActionState` må ta `(prevState, formData)`. Begge in-repo-konsumentene omgår det ved å wrappe i en klient-closure — server-signaturen forblir `(formData)`:
  ```ts
  const [state, formAction] = useActionState(
    async (_prev: CupActionError, formData: FormData) => createTournamentDraft(formData),
    INITIAL_STATE,
  );
  ```
- **Felle:** `redirect()` kaster `NEXT_REDIRECT`. Ikke wrap action-kallet i try/catch som svelger den — suksess-redirecten og dead-session-gaten skal fortsatt kaste seg gjennom.
- Kode→melding-oppslaget bruker `t.has`-guard + `unexpected`-fallback med `{code}` (ReadyStep:242-244) — en umappet kode skal aldri gi tom banner.

## Prior Decisions

- **#1379:** feil returneres som action-state `{ error: kode }`; kun suksess og dead-session-auth-gate redirecter fortsatt. Banner rendres rett over submit-knappen.
- **Trap 4 (én regel, ett hjem):** cup-feilkodene ligger i dag duplisert i `wizard.errors.cup_*` OG `cup.create.errors.cup_*`. Etter fiksen: ett hjem — `cup.create.errors.*`.
- **#1142/#1441:** formen har ingen allowance-felter (defaults server-side); win/tie-points er valgfrie. Allowance-feilkodene er derfor unåelige fra ekte UI (kun håndlaget POST).

## Design

### 1. `lib/cup/actions.ts` — `createTournamentDraft` returnerer feil

- `export type CupActionError = { error: string }` (egen type — ikke import fra league; domenene skal ikke koples).
- Signatur: `export async function createTournamentDraft(formData: FormData): Promise<CupActionError>`.
- Alle 12 feilgrener (11 validerings-redirects `:137-156` + `cup_insert_failed` `:190-193`) → `return { error: '<kode>' }`. Kodene er uendret. `errBase`-konstanten (`:115-120`) dør.
- Suksess-redirecten (`:197-201`) og auth-gatene (`requireAdminOrClubAdmin`/`getRoleContext`) er URØRT.
- `startTournament`/`finishTournament`/`deleteTournament` røres IKKE (se Out of Scope).

### 2. `CupSetup.tsx` — useActionState + Banner

- Wrap `createTournamentDraft` i `useActionState` via closure (CreateLigaForm-mønsteret over); `<form action={formAction}>`.
- Feilmelding: `Banner tone="error"` rett over submit-knappen. Oppslag i `cup.create.errors.*` med `t.has`-guard; miss → `cup.create.errors.unexpected` med `{code}`.
- Ingen pending/spinner-tillegg — paritet med CreateLigaForm.

### 3. Død-kode-rydding (egen commit)

Etter 1-2 produserer INGENTING lenger `?error=` mot disse rutene (verifisert repo-grep 2026-08-07; `startTournament` m.fl. redirecter til detalj-/slett-sider, ikke opprett-sidene). Builder re-verifiserer med grep før sletting:

- `app/[locale]/klubber/[id]/cup/ny/page.tsx`: fjern `SearchParams`/`errorParam`/`errorMessage` + `Banner`-blokka (`:36-43`, `:65-69`) + ubrukte imports (`first`, evt. `Banner`).
- `app/[locale]/admin/games/new/page.tsx`: fjern `buildErrorMessage` + banner-blokka (`:81-93`, `:133-137`) + `error`/`emails` fra `SearchParams`-typen. `first` brukes fortsatt til andre params — behold importen.
- `messages/no.json` + `messages/en.json`: fjern de 8 `wizard.errors.cup_*`-nøklene (cup_allowance, cup_insert_failed, cup_name, cup_team_1, cup_team_2, cup_team_dup, cup_tie_points, cup_win_points); legg til `cup.create.errors.unexpected` («Uventet feil: {code}» / “Unexpected error: {code}” — speiler liga). `catalogParity`-testen må forbli grønn.

### 4. Tester (test-først, jf. test-disiplin)

- **NY `lib/cup/actions.test.ts` (Type A):** system-grense-mocking etter `lib/league/actions.test.ts`-stilen. Dekk: (a) `it.each` over 2-3 representative validerings-koder (f.eks. `cup_name`, `cup_team_dup`, `cup_win_points`) → `{ error: kode }`, ingen insert; (b) insert-feil → `{ error: 'cup_insert_failed' }`; (c) suksess redirecter fortsatt (assert på kastet redirect-mock). Ikke alle 12 grener — regresjonen er «retur i stedet for redirect», ikke valideringslogikken.
- **`CupSetup.test.tsx` (Type C, eksisterende fil):** oppdater `createTournamentDraft`-mocken til resultat-formen; legg til banner-assertion for returnert feilkode etter `CreateLigaForm.test.tsx`-presedens. Fiks samtidig den stale kommentaren som refererer «lib/cup/actions.test» som om den fantes.

## Edge Cases & Guardrails

- **Umappede koder:** `cup_greensome_allowance`/`cup_chapman_allowance`/`cup_gruesome_allowance` har ingen melding i noen katalog (unåelige fra ekte UI). De skal treffe `unexpected`-fallbacken — IKKE legg til meldinger for dem.
- **Dead session:** auth-gatens redirect skal fortsatt propagere (ingen catch rundt).
- **Progressive enhancement:** `useActionState`-form virker før hydrering (server-action-referansen står i markupen).
- **Klubb-ruta:** deler `CupSetup`, får fiksen gratis — men verifiseres separat (banner + bevart state der òg).

## Key Decisions

- **Retur-form `{ error: string }`, egen `CupActionError`:** samme form som liga, men uten cross-domain-import — domenene forblir uavhengige.
- **Meldings-hjem = `cup.create.errors.*`:** cup-scopet, komplett kodesett, brukes av begge ruter via samme klient-komponent. `wizard.errors.cup_*`-duplikatene fjernes (trap 4).
- **Wizard-sidens URL-banner fjernes helt:** siste produsent var cup-koden; å la død kode stå ville skjult at kanalen er retirert.

**Claude's Discretion:** hook-granularitet for oversettelser i CupSetup (én ekstra `useTranslations('cup.create')` vs. annen oppdeling); eksakt mock-utforming i actions-testen; commit-oppdeling utover «rydding separat».

## Success Criteria

- [ ] `lib/cup/actions.ts`: ingen `errBase`, ingen feil-redirect i `createTournamentDraft`; alle feilgrener returnerer `{ error }` — verifisert av ny test-suite.
- [ ] `npx vitest run lib/cup "app/[locale]/admin/games/new/CupSetup.test.tsx" messages` grønt (inkl. catalogParity).
- [ ] `npm run build` + lint grønt (ikke bare `tsc --noEmit`, jf. memory om exhaustive-switch-fella).
- [ ] Staging-klikkrunde: `/admin/games/new?intent=cup` → fyll cup-navn + SAMME lagnavn i begge felter → submit → banner «Lagene må ha forskjellige navn.» vises over knappen OG alle felter + checkbox-valg står urørt. Skjermbevis på PR (staging-verified-label før merge).
- [ ] Repo-grep bekrefter null gjenværende `?error=`-produsenter mot `/admin/games/new` og `/klubber/[id]/cup/ny`; banner-stiene fjernet.

## Gates

- `npm install` først (denne worktreen mangler `node_modules`).
- Per commit: `npx tsc --noEmit` + co-located tester for endrede filer; full `npm run build` + `npm run lint` + `npx vitest run` før PR.
- `fix` → patch-bump + CHANGELOG-Feilrettinger-linje (bruker-synlig), f.eks.: «Cup-skjemaet beholder det du har fylt ut når oppretting feiler.»
- PR-body: Fordeler/ulemper-blokk (fast form, #1413). Ingen produktvalg her → auto-merge når portene er grønne + staging-bevis.

## Files Likely Touched

- `lib/cup/actions.ts` — retur-type + 12 grener
- `lib/cup/actions.test.ts` — NY (Type A)
- `app/[locale]/admin/games/new/CupSetup.tsx` — useActionState + Banner
- `app/[locale]/admin/games/new/CupSetup.test.tsx` — mock-oppdatering + banner-assertion
- `app/[locale]/klubber/[id]/cup/ny/page.tsx` — fjern død URL-banner
- `app/[locale]/admin/games/new/page.tsx` — fjern død URL-banner
- `messages/no.json`, `messages/en.json` — flytt/rydd nøkler + `unexpected`
- `package.json`/`package-lock.json`, `CHANGELOG.md` — bump + linje

## Out of Scope

- `startTournament`/`finishTournament`/`deleteTournament` sine `?error=`-redirects: knapp-actions på detalj-/slett-sider uten skjema-state å miste — annen risikoprofil, eget issue om ønskelig.
- Persistering av format-multi-selecten (`allowed_match_formats`) — kjent F2-hull, eget issue.
- Meldinger for de unåelige allowance-kodene.
- Pending-state/spinner på submit-knappen.
