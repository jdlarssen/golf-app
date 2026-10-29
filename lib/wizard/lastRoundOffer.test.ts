import { describe, it, expect } from 'vitest';
import {
  carriedGameName,
  joinNames,
  lastRoundHrefs,
  lastRoundPeople,
  shouldOfferLastRound,
} from './lastRoundOffer';

describe('shouldOfferLastRound', () => {
  it('offers the card on a blank /opprett-spill', () => {
    expect(shouldOfferLastRound({})).toBe(true);
    expect(shouldOfferLastRound({ step: '1' })).toBe(true);
  });

  it.each(['fra', 'sist', 'bane', 'klubb', 'intent', 'format', 'oppsett'])(
    'hides it when ?%s= prefills the wizard',
    (key) => {
      expect(shouldOfferLastRound({ [key]: 'x' })).toBe(false);
      expect(shouldOfferLastRound({ [key]: ['x', 'y'] })).toBe(false);
    },
  );

  it('ignores an empty prefill param', () => {
    expect(shouldOfferLastRound({ intent: '', bane: [] })).toBe(true);
  });

  // Owner's answer 29.10 (B): «Med kompiser» in the Klubbhus room opens
  // ?intent=kompis, the main door to a friends' round, so the card stays.
  it('keeps the card when only «Kompis-runde» is chosen', () => {
    expect(shouldOfferLastRound({ intent: 'kompis' })).toBe(true);
    expect(shouldOfferLastRound({ intent: 'kompis', step: '1' })).toBe(true);
  });

  it.each(['klubb', 'cup', 'solo'])('hides it for ?intent=%s', (intent) => {
    expect(shouldOfferLastRound({ intent })).toBe(false);
  });

  it('hides it when ?intent=kompis comes with another prefill', () => {
    expect(shouldOfferLastRound({ intent: 'kompis', format: 'stableford' })).toBe(false);
  });
});

describe('lastRoundHrefs', () => {
  it('sends «Bruk samme oppsett» to «Klar?» and «Endre» to step 1', () => {
    expect(lastRoundHrefs('g-1')).toEqual({
      use: '/opprett-spill?sist=g-1&step=5',
      edit: '/opprett-spill?sist=g-1',
    });
  });
});

describe('carriedGameName', () => {
  it('keeps a name the organiser wrote', () => {
    expect(carriedGameName('Lørdagsrunden', 'Byneset North')).toBe('Lørdagsrunden');
  });

  it('drops the wizard\'s name, so the new round gets a new date', () => {
    expect(carriedGameName('Byneset North 3. oktober', 'Byneset North')).toBeUndefined();
    expect(carriedGameName('Byneset North', 'Byneset North')).toBeUndefined();
  });
});

const p = (name: string | null, nickname: string | null = null) => ({ name, nickname });

describe('lastRoundPeople', () => {
  it('shows everyone when there are four or fewer, as the artboard does', () => {
    expect(
      lastRoundPeople([
        p('Sondre Aune'),
        p('Marte Lie'),
        p('Jonas Berg'),
        p('Anders Moe'),
      ]),
    ).toEqual({
      initials: ['SA', 'ML', 'JB', 'AM'],
      firstNames: ['Sondre', 'Marte', 'Jonas', 'Anders'],
      others: 0,
    });
  });

  it('shows three and counts the rest from five players', () => {
    expect(
      lastRoundPeople([p('A A'), p('B B'), p('C C'), p('D D'), p('E E')]),
    ).toEqual({ initials: ['AA', 'BB', 'CC'], firstNames: ['A', 'B', 'C'], others: 2 });
  });

  it('uses the nickname as the name, as the rest of the app does', () => {
    expect(lastRoundPeople([p('Jørgen Larssen', 'Jølle')]).firstNames).toEqual(['Jølle']);
    expect(lastRoundPeople([p('Jørgen Larssen', 'Jølle')]).initials).toEqual(['JL']);
  });

  it('handles one player and nobody', () => {
    expect(lastRoundPeople([p('Kari')])).toEqual({
      initials: ['K'],
      firstNames: ['Kari'],
      others: 0,
    });
    expect(lastRoundPeople([])).toEqual({ initials: [], firstNames: [], others: 0 });
  });

  it('never prints an empty name', () => {
    expect(lastRoundPeople([p(null)])).toEqual({ initials: ['?'], firstNames: ['?'], others: 0 });
  });
});

describe('joinNames', () => {
  it('joins with «og» in Norwegian and «and» in English', () => {
    expect(joinNames(['Sondre', 'Marte', 'Jonas', 'Anders'], 'no')).toBe(
      'Sondre, Marte, Jonas og Anders',
    );
    expect(joinNames(['Sondre', 'Marte', '2 others'], 'en')).toBe('Sondre, Marte and 2 others');
    expect(joinNames(['Kari'], 'no')).toBe('Kari');
  });
});
