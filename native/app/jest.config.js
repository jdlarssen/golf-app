// Native N3 (#1825): app-side test harness.
//
// Egen jest, ikke repoets vitest: appen er et selvstendig npm-prosjekt, og
// `jest-expo` er Expos offisielle oppskrift (den drar inn RN-transformen og
// mocker native-delene av SDK-en). Repoets vitest-oppsett røres ikke.
//
// To mappinger bærer hele riggen:
//  - `expo-sqlite` → en adapter over better-sqlite3 (in-memory). Datalaget
//    kjører dermed EKTE SQL i test — migrasjoner, constraints og transaksjoner
//    oppfører seg som på enheten, i stedet for mot en håndskrevet fake.
//  - `@/*` → repo-rota, samme alias som `tsconfig.json` og Metro bruker inne i
//    den delte `lib/`-grafen.
// Tidssonen er PINNET. Uten den kjører suiten i maskinens egen sone, og på en
// norsk maskin er «enhetens lokaltid» og «Oslo-veggklokke» det samme tallet —
// da blir en tee-off-test som skal fange en Oslo-konvertering en identitet som
// aldri kan feile. Evaluatoren i #1854 gjeninnførte nettopp den feilen og alle
// 499 testene forble grønne. UTC er også det CI-maskiner kjører i, så dette
// gjør suiten deterministisk i tillegg til å gjøre vakten ekte.
process.env.TZ = 'UTC';

module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/test/sqliteMock.ts',
    '^@/(.*)$': '<rootDir>/../../$1',
  },
  // Én felles tidsgrense for hele suiten, lik rot-vitest (`vitest.config.ts`).
  // Jests standard på 5000 ms er for knapp: første test i en fil betaler for
  // modul-transform og første render (~150–365 ms alene, 4–7 s under last), og
  // CI kjører suitene i parallelle workers mens andre økter kan teste på samme
  // maskin. Hvilken test som ryker avhenger av hvilken fil som starter kaldt
  // under mest last, så grensen hører hjemme her — ikke som tredje argument
  // på enkelt-tester (#1872, #1916, #1946). `jest-expo` setter ingen egen.
  testTimeout: 20000,
  // Hjelperne under src/test/ er rigg, ikke suiter.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/test/'],
};
