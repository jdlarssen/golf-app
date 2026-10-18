// #1954 A4: `withTxn` for tester som mocker `data/db`. Oppgaven kjøres med et
// gjenkjennelig transaksjons-objekt, så testen kan se at en skriving fikk
// transaksjonens forbindelse og ikke den delte (`getDb()`).
//
// Brukes i en `jest.mock`-factory, som heises over importene:
//   withTxn: require('../test/txnPassthrough').txnPassthrough(),

/** Objektet skrivingene får når de går gjennom `withTxn`. */
export const TXN = { txn: true } as const;

export function txnPassthrough(): jest.Mock {
  return jest.fn(async (task: (txn: unknown) => Promise<unknown>) => task(TXN));
}
