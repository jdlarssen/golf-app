# Evaluering: #844 — supabase-client-lint-guard

**VERDICT: ACCEPT**

Evaluert: 2026-06-22
Evaluator: skeptisk subagent (claude-sonnet-4-6)

---

## Per-kriterium

### K1 — ESLint flat-config-regel finnes: PASS

`eslint.config.mjs` inneholder en ny config-blokk med:
- `files: ["lib/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"]`
- `ignores: ["**/*.test.{ts,tsx}", "**/__tests__/**"]`
- To `no-restricted-syntax`-selektorer: én for bar `SupabaseClient`, én for `SupabaseClient<any>`

### K2 — Regelen fanger begge former: PASS (med notis)

Egenopprettet scratch `lib/__eval_scratch_844.ts` med én bar-form (linje 3) og én `<any>`-form (linje 7), kjørt `npx eslint lib/__eval_scratch_844.ts`:

```
3:23  error  Bruk SupabaseClient<Database> (typed), aldri bar SupabaseClient ...  no-restricted-syntax
7:38  error  Bruk SupabaseClient<Database>, ikke SupabaseClient<any> ...           no-restricted-syntax
```

Begge former fanges av korrekte, distinkte meldinger. **Notis:** resultatet er 3 feil totalt (ikke 2 som kontrakten predikerte) fordi `@typescript-eslint/no-explicit-any` slår inn uavhengig på `<any>`-formen. Dette er ikke et problem — to separate lint-regler rapporterer begge på samme node. Kontraktens «2 problems» var en underestimering, men begge tiltenkte fangster er verifisert.

Negativ test (`SupabaseClient<Database>` + `import type`-linje): 0 feil, kun 1 unused-vars-warning. Korrekt.

### K3 — Regelen treffer IKKE eksisterende kode: PASS

`npm run lint` på hele treet:
```
app/.../drilldown.tsx  3:10  warning  'notFound' is defined but never used...
✖ 1 problem (0 errors, 1 warning)
```
0 feil. Den ene pre-eksisterende unused-vars-advarselen i `drilldown.tsx` er uendret og utenfor scope.

### K4 — `GamePlayerRow.team_number` er `number | null`: PASS

`buildModeResultForGame.ts` linje 46: `team_number: number | null;`

Ny `NormalizedPlayerRow`-type (linje 60–62) er `Omit<GamePlayerRow, 'team_number'> & { team_number: number }` — representerer post-`?? 0`-grensen korrekt. Normalisering skjer én gang på linje 147 i `buildModeResultFromData`. `buildContext` og `buildUniformContext` mottar begge `NormalizedPlayerRow[]`, og `teamNumber: p.team_number` på linje 286 er nå type-ærlig (ikke `| null`).

Ingen runtime-oppførselsendring: `?? 0` er bevart på normaliseringsstedet; ingenting ny kode-sti.

### K5 — Alle gates grønne: PASS

- `npx tsc --noEmit` → exit 0 (ingen output)
- `npx vitest run lib/scoring` → 977/977 passed (38 testfiler, 3.66s)
- `npm run lint` → 0 feil (bekreftet under K3)

---

## Potensielle hull undersøkt

**Type-alias og generic constraint:** Testet `type AliasAny = SupabaseClient<any>` og `function badGeneric<T extends SupabaseClient>(...)` — begge fanges av respektive selektorer. Ingen åpning her.

**Nestet any:** `SupabaseClient<Complex<any>>` trigger IKKE den egendefinerte Supabase-regelen — kun `no-explicit-any` slår inn på inner `any`. Det er korrekt: builder-kommentaren i `eslint.config.mjs` dokumenterer at flat child-kombinator `>` er valgt nettopp for å unngå over-matching av nestede type-arg. Verifisert.

**Test-ekskludering:** `lib/__eval_test_scratch_844.test.ts` med bar `SupabaseClient` → 0 feil. Teststeder er korrekt unntatt.

**`buildUniformContext` `?? 0` fjerning:** Linje 286 bruker nå `p.team_number` direkte (uten `?? 0`) — men dette er OK fordi `buildUniformContext` mottar `NormalizedPlayerRow[]` der `team_number` allerede er `number`. tsc bekrefter ingen type-mismatch.

---

## Konklusjon

Implementeringen er korrekt og fullstendig. Begge leak-former bannes av ESLint-regelen. Regelen er korrekt scoped (produksjonskode, ikke tester), fanger alle kjente unnvikelsesformer, og over-matcher ikke legitime use-sites. team_number-fiksen er type-ærlig og introduserer ingen runtime-endring. Alle gates passerer.
