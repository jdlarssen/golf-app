# Spec: CreateLigaForm — hopp over React 19 auto-reset ved server-feil (#1475)

## Problem

Runde-2-evalueringen av #1397 (PR #1474) fant at `CreateLigaForm.tsx` har nøyaktig samme wipe-on-error-figur som CupSetup hadde: `<form action={formAction}>` + `useActionState`-feilretur uten onSubmit-guard. React 19 auto-resetter formen når en `action=`-innsending fullfører — native reset tømmer de ukontrollerte feltene (navn, datoer, tee-select, best-N, fast straff) idet feilbanneret vises. Kontrollerte felter (radios, bane-select, spiller-checkboxes) overlever. Begge konsumenter rammes: `/admin/liga/new` og `/klubber/[id]/liga/ny` (deler komponenten).

## Research Findings

- **Bevist fiks-mønster i repoet (samme dag):** CupSetup, commit `fb242957` på PR #1474 — `onSubmit` med `e.preventDefault()`, bygg `FormData` fra `e.currentTarget` FØR transitionen, dispatch `formAction(formData)` INNE i `startTransition`; `action`-attributtet står igjen som pre-hydrerings-fallback. Verifisert ende-til-ende på staging.
- CreateLigaForm har allerede `data-testid="liga-create-form"` (linje 138); feilbanneret (linje 734) mangler `testId` — Banner-komponenten støtter proppen.
- Server-valideringens rekkefølge (lib/league/actions.ts): `name` → `dates` (`seasonEnd < seasonStart`, linje 94) → … Enkleste staging-repro: gyldig navn + sluttdato før startdato (native `required` blokkerer tom-submit klient-side).
- ~~Ingen `useFormStatus`-pending-UI i skjemaet~~ **KORRIGERT under bygging (I1):** skjemaet bruker `SubmitButton`, som leser `useFormStatus().pending` — og useFormStatus ser IKKE manuelle dispatches. Fiksen bytter derfor til `useActionState`s tredje tuple-element (`isPending`) + delte `Button` med `pending`/`pendingLabel` (samme API som resten av appen) så pending-state bevares.
- jsdom-eksperimentet (Design §3) REPRODUSERTE wipe-en: testen var rød mot u-fikset kode («expected '' to be 'Torsdagsligaen'») — regresjonstesten beholdes.

## Prior Decisions

- **#1397/fb242957:** preventDefault + transition-dispatch er valgt mønster for uncontrolled-felter-i-action-forms; ikke re-diskuter (memory: react19-form-action-autoreset-trap).
- **Test-disiplin:** hvis auto-reset-figuren ikke lar seg reprodusere i jsdom (vitest), er staging-driveren regresjons-oraklet — ikke skriv en vakuøs unit-test som er grønn også uten fiksen.

## Design

1. `CreateLigaForm.tsx`: importer `startTransition`; legg `onSubmit`-guard på formen (identisk med CupSetup.tsx:97–107 inkl. kommentaren som forklarer hvorfor); behold `action={formAction}`.
2. Feilbanneret (linje 734) får `testId="liga-create-error"` (samme e2e-krok-mønster som cup/login-bannerne).
3. Test-først-eksperiment (time-boxet): forsøk en jsdom-regresjonstest i `CreateLigaForm.test.tsx` — fyll name, submit via fireEvent til feil-retur, assert at name-inputen beholder verdien. Kjør mot u-fikset kode: FEILER den (reproduserer wipe) → behold som regresjonstest. Er den grønn uten fiksen (jsdom trigger ikke auto-reset) → dropp den og noter i closing-kommentaren.

## Edge Cases & Guardrails

- Suksess-stien urørt: `redirect()` kaster server-side; klient-transitionen følger den. Ingen try/catch.
- FormData MÅ bygges synkront før transitionen (`e.currentTarget` er null etterpå).
- Ingen endring i `lib/league/actions.ts`, i18n eller andre skjemaer.
- Klubb-ruta får fiksen gratis (delt komponent) — kodefestet, staging-verifiseres på admin-ruta.

## Key Decisions

- **Gjenbruk fb242957-mønsteret uendret** — bevist samme dag, samme runtime.
- **Commit-type `fix`** (patch + Feilrettinger-linje — bruker-synlig oppførsel).

**Claude's Discretion:** jsdom-testens skjebne (per eksperimentet over); eksakt CHANGELOG-ordlyd.

## Success Criteria

- [ ] `CreateLigaForm.tsx` har onSubmit-guarden (preventDefault + FormData før transition + dispatch i `startTransition`) OG beholder `action={formAction}` — kodelesing.
- [ ] Feilbanneret har `testId="liga-create-error"` — kodelesing.
- [ ] `npx vitest run "app/[locale]/admin/liga/new/CreateLigaForm.test.tsx" lib/league` grønn.
- [ ] `npm run build` + `npm run lint` grønn.
- [ ] Patch-bump + én Feilrettinger-linje i CHANGELOG.
- [ ] Staging-verifisering: `/admin/liga/new` → fyll navn, datoer med slutt FØR start, bane + tee → submit → `liga-create-error`-banner synlig OG navn/datoer/tee-valg står urørt; negativt SQL-orakel: ingen liga-rad opprettet. Bevis-kommentar + staging-verified-label på PR-en.

## Gates

- `npx tsc --noEmit` + co-located tester per commit; full build + lint før PR.

## Files Likely Touched

- `app/[locale]/admin/liga/new/CreateLigaForm.tsx` — onSubmit-guard + banner-testId
- `app/[locale]/admin/liga/new/CreateLigaForm.test.tsx` — evt. regresjonstest (per eksperiment)
- `package.json`, `package-lock.json`, `CHANGELOG.md` — bump + linje

## Out of Scope

- Andre skjemaer med `action=` (repo-grep etter flere ofre er en egen sveip-sak hvis ønskelig).
- Kontrollerte-felter-refactor av liga-skjemaet.
- `lib/league/actions.ts`.
