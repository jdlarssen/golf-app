// #2201: manuell mock for skjermtestene. Merk-lest har sin egen test
// (lib/useMarkVisitRead.test.tsx); i en skjermtest er det bare en skriving
// mot `notifications` som `routeFrom` ikke har rigget. Brukes med
// `jest.mock('../lib/useMarkVisitRead')`.
export const useMarkVisitRead = jest.fn();
