// native/app/src/lib/settlementCopy.test.ts
// Paritets-porten mellom appens oppgjørstekster og webbens kilde (#2221).
//
// `settlementCopy.ts` er en håndkopi av `leaderboard.common.settlement` i
// `messages/no.json`. Testen leser kilden fra node-siden (bundles aldri) og
// krever tegn-for-tegn likhet: rettes en tekst på web, blir denne rød til
// appen følger etter. Samme vern som `sideTournamentCopy.test.ts`.
import source from '../../../../messages/no.json';
import { SETTLEMENT_TEXT } from './settlementCopy';

describe('SETTLEMENT_TEXT', () => {
  it('er tegn for tegn lik leaderboard.common.settlement i no.json', () => {
    expect(SETTLEMENT_TEXT).toStrictEqual(source.leaderboard.common.settlement);
  });
});
