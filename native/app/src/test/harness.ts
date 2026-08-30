// Native N3 (#1825): felles rigg for datalags-testene.
//
// `db.ts` cacher forbindelsen på modulnivå (`dbPromise`) og serialiserer
// transaksjonene på en modul-global kjede. Isolasjon mellom tester krever
// derfor at HELE modulgrafen bygges på nytt — ikke bare at tabellene tømmes.
// Derav `jest.resetModules()` foran hver test, og `require(...)` INNE i testen:
// modulen testen får tak i er da den samme instansen koden under test bruker.
//
// `require`, ikke `await import(...)`: babel-preset-expo lar dynamisk import stå
// som ekte ESM, og jests CJS-runtime avviser den («A dynamic import callback was
// invoked without --experimental-vm-modules»). Typene hentes med `as typeof
// import(...)`, som er ren type-syntaks og forsvinner i kompileringen.

/**
 * Frisk modulgraf + tom base per test.
 *
 * Kall den øverst i en `describe`. Etterpå henter testen modulene sine med
 * `require(...)` inne i testen — en statisk import øverst i fila ville bundet
 * seg til instansen fra før nullstillingen.
 */
export function useFreshModules(): void {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    // Hentes her, ikke øverst i fila: dette skal treffe basen testen nettopp
    // brukte. `expo-sqlite` og denne stien peker på samme fil
    // (moduleNameMapper), altså samme modulinstans.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { __resetForTests } = require('./sqliteMock') as typeof import('./sqliteMock');
    __resetForTests();
  });
}
