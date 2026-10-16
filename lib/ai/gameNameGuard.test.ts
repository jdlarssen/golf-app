import { describe, expect, it } from 'vitest';
import { gameNameMentions } from './gameNameGuard';

// #2561: the game name is the organiser's free text and goes to the model.
// When it names a participant who has not said yes, it must not go.
describe('gameNameMentions', () => {
  const ola = { name: 'Ola Nordmann', nickname: null };

  it.each([
    ['the first name with a genitive s', 'Olas 50-årsdag', [ola], true],
    ['the last name before a hyphen', 'Nordmann-cupen', [ola], true],
    ['the full name', 'Bursdag for Ola Nordmann', [ola], true],
    ['any case', 'OLA OPEN', [ola], true],
    ['letters outside a–z', 'Bjørns sommerspill', [{ name: 'Bjørn Ås', nickname: null }], true],
    ['a last name of two letters', 'Ås-turneringen', [{ name: 'Bjørn Ås', nickname: null }], true],
    ['a nickname of two words', 'Store Pers slag', [{ name: 'Per Hansen', nickname: 'Store Per' }], true],
    ['a nickname alone', 'Tigerens cup', [{ name: 'Kari Lie', nickname: 'Tigeren' }], true],
    ['only part of a longer word', 'Olav-cupen', [ola], false],
    ['nobody', 'Lørdagscup', [ola], false],
    ['a single-letter name part on its own', 'Lag N', [{ name: 'Ola N.', nickname: null }], false],
    ['a single-letter nickname', 'Lag N', [{ name: 'Nils Berg', nickname: 'N' }], false],
    ['a single-letter name', 'Lag A', [{ name: 'A', nickname: null }], false],
    ['a name written in decomposed form (NFD)', 'Åses cup', [{ name: 'A\u030Ase Lund', nickname: null }], true],
    ['a game name written in decomposed form (NFD)', 'A\u030Ases cup', [{ name: 'Åse Lund', nickname: null }], true],
    ['a person without a name', 'Lørdagscup', [{ name: null, nickname: null }], false],
    ['an empty list', 'Olas 50-årsdag', [], false],
  ] as const)('%s: %s', (_label, gameName, people, expected) => {
    expect(gameNameMentions(gameName, people)).toBe(expected);
  });
});
