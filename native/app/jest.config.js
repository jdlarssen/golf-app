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
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/test/sqliteMock.ts',
    '^@/(.*)$': '<rootDir>/../../$1',
  },
  // Hjelperne under src/test/ er rigg, ikke suiter.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/test/'],
};
