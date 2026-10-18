import { describe, expect, it } from 'vitest';

import type { ShareCardModel, ShareCardRow } from '@/lib/games/buildShareCardData';
import messages from '@/messages/no.json';
import messagesEn from '@/messages/en.json';

import {
  CHARS_PER_LINE,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  cardKicker,
  estimateLines,
  firstName,
  chooseHeadline,
  headlineLayout,
  rowDisplayName,
  shareCardHeight,
} from './shareCardLayout';

function row(rank: number, memberNames: string[]): ShareCardRow {
  return {
    rank,
    name: memberNames.join(' / '),
    memberNames,
    score: { kind: 'vsPar', label: '−2' },
    isSharer: false,
  };
}

/** A placement card with one row per member list; the first row is the winner. */
function placement(...rows: string[][]): ShareCardModel {
  const podium = rows.map((m, i) => row(i + 1, m));
  return {
    band: 'placement',
    podium,
    winners: podium.slice(0, 1),
    sharerStrip: null,
    match: null,
    sideTournaments: [],
  };
}

function matchplay(side1: string[], side2: string[]): ShareCardModel {
  return {
    band: 'matchplay',
    podium: [],
    winners: [],
    sharerStrip: null,
    sideTournaments: [],
    match: {
      sharerOutcome: null,
      headline: { kind: 'tied' },
      sides: [
        { name: side1.join(' / '), memberNames: side1, won: false },
        { name: side2.join(' / '), memberNames: side2, won: false },
      ],
    },
  };
}

const ONE = { headlineLines: 2, headlineFontSize: 116 };

describe('the card frame', () => {
  it('is a 1080×1350 portrait', () => {
    expect([SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT]).toEqual([1080, 1350]);
  });
});

describe('estimateLines', () => {
  it('a short name is one line', () => {
    expect(estimateLines('Kristian Strand', CHARS_PER_LINE.row)).toBe(1);
  });

  it('wraps greedily on spaces', () => {
    expect(estimateLines('Benjamin Løkken / Martin Aas', 23)).toBe(2);
  });

  it('one unbroken token longer than a line is split', () => {
    expect(estimateLines('x'.repeat(50), 23)).toBe(3);
  });

  it('empty text still takes one line', () => {
    expect(estimateLines('', 23)).toBe(1);
  });
});

describe('cardKicker', () => {
  it.each([
    ['an own name and the course', 'Lørdagsrunden', 'Byneset North', 'Lørdagsrunden · Byneset North'],
    ['an auto name «course date»', 'Byneset North 27. september', 'Byneset North', 'Byneset North'],
    ['a name equal to the course', 'Byneset North', 'Byneset North', 'Byneset North'],
    ['no course', 'Lørdagsrunden', null, 'Lørdagsrunden'],
  ])('%s', (_label, name, course, expected) => {
    expect(cardKicker(name, course)).toBe(expected);
  });

  it('cuts anything over 40 characters with «…»', () => {
    const kicker = cardKicker('Den store årlige høstturneringen for kompisgjengen', 'Byneset North');
    expect(kicker).toHaveLength(40);
    expect(kicker.endsWith('…')).toBe(true);
  });

  it('keeps exactly 40 characters', () => {
    const name = 'x'.repeat(40);
    expect(cardKicker(name, null)).toBe(name);
  });
});

describe('firstName and rowDisplayName', () => {
  it('firstName takes the first word', () => {
    expect(firstName('Marte L.')).toBe('Marte');
    expect(firstName('Ola')).toBe('Ola');
  });

  it('a short joined name is kept as is', () => {
    expect(rowDisplayName(['Marte L.', 'Jonas B.'])).toBe('Marte L. / Jonas B.');
  });

  it('a joined name over the line budget falls back to first names', () => {
    expect(rowDisplayName(['Marte Lie', 'Jonas Berg', 'Sigrid Aas', 'Ola Nordmann'])).toBe(
      'Marte / Jonas / Sigrid / Ola',
    );
  });

  it('a single name over the budget is cut to its first word too', () => {
    expect(rowDisplayName(['Wilhelmine-Marie Haugenstad-Olsen'])).toBe('Wilhelmine-Marie');
  });
});

describe('headlineLayout', () => {
  it('a short headline keeps 116px', () => {
    expect(headlineLayout('Marte vant med 38 poeng')).toEqual({ fontSize: 116, lines: 2 });
  });

  it('three lines still fit at 116px', () => {
    expect(headlineLayout('Marte og Jonas delte seieren med 38 poeng').fontSize).toBe(116);
  });

  it('a forced break starts a new line', () => {
    expect(headlineLayout('Marte vant\nmed 38 poeng')).toEqual({ fontSize: 116, lines: 2 });
    // One line of text would be 2 lines anyway; the break must not merge them.
    expect(headlineLayout('Marte\nvant\nmed\n38 poeng').lines).toBeGreaterThanOrEqual(4);
  });

  it('a headline that needs four lines drops to 80px', () => {
    const layout = headlineLayout('Christopher, Alexander, Sebastian og Magnus vant på −12');
    expect(layout.fontSize).toBe(80);
    expect(layout.lines).toBeLessThanOrEqual(4);
  });
});

describe('chooseHeadline', () => {
  it('takes the first variant that fits at 116px', () => {
    expect(chooseHeadline(['Marte vant\nmed 38 poeng', 'Marte vant med 38 poeng'])).toEqual({
      index: 0,
      fontSize: 116,
      lines: 2,
    });
  });

  it('falls back to the running block when the broken one needs four lines', () => {
    // Broken: 5 lines at 116px. Running: 3 lines at 116px.
    const choice = chooseHeadline([
      'Marte, Jonas, Sigrid og Ola vant\npå −12',
      'Marte, Jonas, Sigrid og Ola vant på −12',
    ]);
    expect(choice).toMatchObject({ index: 1, fontSize: 116 });
  });

  it('sets the last variant at 80px when none fits', () => {
    const choice = chooseHeadline([
      'Christopher, Alexander, Sebastian og Magnus vant\npå −12',
      'Christopher, Alexander, Sebastian og Magnus vant på −12',
    ]);
    expect(choice).toMatchObject({ index: 1, fontSize: 80 });
  });
});

describe('shareCardHeight', () => {
  it.each([
    ['three single players', placement(['Alice'], ['Bob'], ['Charlie'])],
    ['two matchplay sides', matchplay(['Alice'], ['Bob'])],
    ['a team of two per row', placement(['Alice B.', 'Bob C.'], ['Dina E.', 'Finn G.'], ['Hedda I.', 'Ivar J.'])],
    ['no rows at all', null],
  ])('%s is the full 1350', (_label, model) => {
    expect(shareCardHeight(model, ONE)).toBe(SHARE_CARD_HEIGHT);
  });

  it('never goes below the frame height', () => {
    expect(shareCardHeight(null, { headlineLines: 1, headlineFontSize: 116 })).toBe(1350);
  });

  // Worst case in the font render (job rig, Fraunces/Inter from Google): a team
  // of four that wins alone, a three-line headline at 116px and two-line row
  // names on all three rows. The render needed 1294px up to the bottom line's
  // top plus the 40px air this estimate keeps; the estimate must not be lower.
  it('a three-line headline over three two-line rows is lifted above the frame', () => {
    const model = placement(
      ['Marte', 'Jonas', 'Sigrid', 'Ola'],
      ['Christopher', 'Alexander', 'Sebastian', 'Magnus'],
      ['Ingeborg', 'Fredrik', 'Henrik', 'Silje'],
    );
    const h = shareCardHeight(model, { headlineLines: 3, headlineFontSize: 116 });
    expect(h).toBeGreaterThanOrEqual(1294 + 40);
  });

  it('more lines in the headline never make the card shorter', () => {
    const model = placement(['Alice'], ['Bob'], ['Charlie']);
    const two = shareCardHeight(model, { headlineLines: 2, headlineFontSize: 116 });
    const four = shareCardHeight(model, { headlineLines: 8, headlineFontSize: 116 });
    expect(four).toBeGreaterThan(two);
  });

  it('a wrapping kicker adds a line', () => {
    const model = placement(['Alice'], ['Bob'], ['Charlie'], ['Dina']);
    const base = { headlineLines: 8, headlineFontSize: 116 };
    expect(shareCardHeight(model, { ...base, kicker: 'x'.repeat(40) })).toBeGreaterThan(
      shareCardHeight(model, { ...base, kicker: 'x' }),
    );
  });
});

describe('the pun in the tagline', () => {
  it.each([
    ['no', messages.leaderboard.shareCard],
    ['en', messagesEn.leaderboard.shareCard],
  ])('%s reads the same as the plain tagline once the gold tags are gone', (_locale, card) => {
    expect(card.taglinePun.replace(/<\/?gold>/g, '')).toBe(card.tagline);
  });
});
