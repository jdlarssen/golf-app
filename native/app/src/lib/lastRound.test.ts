// Hjem v2 (#2385): poengene i «Forrige runde» (Type A).
//
// Hvor mange poeng en stableford-runde gir, er motorens sak og testet der. Her
// låses bare hvilke runder som får poeng, og at tallet er ditt.
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { lastRoundPoints } from './lastRound';

const PLAYERS = [homePlayer({ userId: 'me' }), homePlayer({ userId: 'marte' })];

function finished(gameMode: string) {
  return homeBundle({ game: { id: 'last', status: 'finished', gameMode }, players: PLAYERS });
}

it('gir dine stableford-poeng for runden, regnet av appens motor', () => {
  // Par 4 og handicap 0: fire slag gir 2 poeng, fem gir 1.
  const scores = [...holeScores('last', 'me', 18, 4), ...holeScores('last', 'marte', 18, 5)];
  expect(lastRoundPoints(finished('stableford'), scores, 'me')).toBe(36);
  expect(lastRoundPoints(finished('stableford'), scores, 'marte')).toBe(18);
});

it('modifisert stableford teller med sin egen tabell, også når summen er 0', () => {
  const scores = holeScores('last', 'me', 18, 4);
  expect(lastRoundPoints(finished('modified_stableford'), scores, 'me')).toBe(0);
});

it('gir ingen poeng for formater som teller slag, eller uten egne slag', () => {
  const scores = holeScores('last', 'me', 18, 4);
  expect(lastRoundPoints(finished('solo_strokeplay'), scores, 'me')).toBeNull();
  expect(lastRoundPoints(finished('stableford'), holeScores('last', 'marte', 18, 4), 'me')).toBeNull();
  expect(lastRoundPoints(finished('stableford'), scores, 'ikke-med')).toBeNull();
});
