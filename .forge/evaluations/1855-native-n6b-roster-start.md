# Evaluering: #1855 — Native N6b

**Verdikt: ACCEPT** (runde 2, etter én fikserunde)

## Kriterier

| # | Kriterium | Status |
|---|---|---|
| 1 | Jest-låst start-paritet | Oppfylt — reason-koder, wolf-slots, greensome-override, vinner-semantikk og CH-frysing til eksakt tall låst i webbens suite; appens `startGame.test.ts` mocker kjernen (riktig lagdeling) |
| 2 | Staging e2e — hele driften | Oppfylt — inkl. wolf-rotasjon etter at begge blokkeringer ble løst |
| 3 | Valideringsportene | Oppfylt — «Wolf trenger 3–5 spillere for å starte. Nå er 2 påmeldt.», null skriv |
| 4 | WD-flyten | Oppfylt — `withdrawn_at` satt og nullet, med arrangøren som `withdrawn_by_user_id` |
| 5 | Web uendret | Oppfylt — 522/7028 = baseline; eksportert feilform byte-identisk |
| 6 | Porter + runbook | Oppfylt |

## Porter (exit-koder lest fra fil, ikke gjennom `tail`)

```
JEST_EXIT:0        39 suiter / 623 tester
TSC_EXIT:0
ESLINT_EXIT:0
TYPECHECK_EXIT:0
VITEST_EXIT:0      522 filer / 7028 tester
BUILD_EXIT:0
EXPO_EXPORT:0
```

## Mutasjonstester — 4 kjørt, 4 fanget

1. `alreadyRunning: !result.started` → `result.started` → 3 tester røde
2. Driftet `team-full`-copy bort fra `no.json` → rød med eksakt streng-diff
3. `(row) => row === null` → `() => true` (nektet delete som suksess) → rød
4. Deaktiverte wrapperens notify-fan-out → 2 tester røde

## VERIFICATION GAP

- `npm run test:rls` ikke kjørt: Docker Desktop kjører ikke på maskinen.
  pgTAP-suiten (9 asserts) er skrevet og committet; CI kjører den.
  Migrasjonen er verifisert funksjonelt mot staging gjennom appen.
- Migrasjon 0168 er påført staging. Ikke videre — det er eierens luke.

## Restanse

#1867 · #1868 · #1869 · #1871 · #1872 — alle filet med milestone før merge.
