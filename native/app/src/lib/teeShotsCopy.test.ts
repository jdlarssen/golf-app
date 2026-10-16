// #2580: utslagstekstene i appen. Type A — malene er webbens tegn for tegn, og
// setningene blir de samme som på nettet (components/games/teeShotCopy.test.ts
// har de samme setningene i sin snapshot).
import source from '../../../../messages/no.json';
import {
  teeShotDeliveryAdvice,
  teeShotHoleLine,
  teeShotStatus,
} from '../../../../lib/games/teeShots';
import {
  TEE_SHOTS_APP_TEXT,
  TEE_SHOTS_TEXT,
  teeShotBoxText,
  teeShotButtonLabel,
  teeShotCountText,
  teeShotHoleLineText,
  teeShotOrganizerLines,
} from './teeShotsCopy';
import { formatMessage } from './kavalkadeCopy';

const M = 'marte';
const J = 'jonas';
const S = 'sigrid';
const P = 'per';
const X = 'withdrawn';
const TEAM = [M, J, S, P];
const NAME: Record<string, string> = { marte: 'Marte', jonas: 'Jonas', sigrid: 'Sigrid', per: 'Per' };
const nameOf = (id: string) => NAME[id] ?? id;
const LEVERING = [S, M, M, J, S, M, M, J, P, S, M, J, P, J, M, S, J, M];
const status = (owners: string[]) =>
  teeShotStatus({ minimum: 4, memberIds: TEAM, picks: owners.map((teeShotBy, i) => ({ holeNumber: i + 1, teeShotBy })) });
const lineFor = (owners: string[]) => teeShotHoleLineText(teeShotHoleLine(status(owners), 'none'), nameOf);
const boxFor = (owners: string[]) => {
  const st = status(owners);
  return teeShotBoxText(teeShotDeliveryAdvice(st)!, st, true, nameOf);
};

describe('the web’s strings', () => {
  it('are teeShots.* in messages/no.json, character for character', () => {
    expect(TEE_SHOTS_TEXT).toEqual(source.teeShots);
  });

  it('the app’s own strings are not in the web catalog', () => {
    const web = new Set(Object.values(source.teeShots));
    for (const text of Object.values(TEE_SHOTS_APP_TEXT)) expect(web.has(text)).toBe(false);
  });

  it('formats every template for one and for many, with nothing left in braces', () => {
    for (const template of Object.values(TEE_SHOTS_TEXT)) {
      for (const n of [1, 3]) {
        const values: Record<string, string | number> = {};
        for (const [, name, type] of template.matchAll(/\{(\w+)(?:,\s*(\w+))?/g)) {
          values[name] = type === 'plural' ? n : type === 'select' ? 'team' : `<${name}>`;
        }
        expect(formatMessage(template, values)).not.toMatch(/[{}#]/);
      }
    }
  });
});

describe('the sentences, as on the web', () => {
  it('Utslag 2, 2b and 5 on the hole page', () => {
    expect(lineFor(LEVERING.slice(0, 7))).toBe('Per mangler 4, Jonas 3 og Sigrid 2 · 2 hull å velge fritt på');
    expect(lineFor(LEVERING.slice(0, 15))).toBe('Sigrid og Per trenger utslagene på de tre hullene som er igjen.');
    expect(lineFor([M, J, S, P, J, S, M])).toBe('Per mangler 3, de andre 2 hver · 2 hull å velge fritt på');
  });

  it('Utslag 3: the delivery box', () => {
    expect(boxFor(LEVERING)).toEqual({
      title: 'Per mangler 2 utslag',
      body: 'Alle må ha minst 4 utslag før lagets kort kan leveres. Trykk «Rediger hullene» og bytt til Per på to hull der Marte eller Jonas står.',
    });
  });

  it('a team already short, and the swaps held by someone no longer on the team', () => {
    expect(lineFor([M, M, M, M, J, J, J, J, S, S, S, S, P, P, X, X, X])).toBe(
      'Per mangler 2, og bare 1 hull er igjen. Bytt på et tidligere hull der en som ikke er med på laget lenger står.',
    );
    expect(lineFor([M, M, M, M, M, J, J, J, J, S, S, S, S, P, X, X, X])).toBe(
      'Per mangler 3, og bare 1 hull er igjen. Bytt på et tidligere hull der Marte eller en som ikke er med på laget lenger står.',
    );
    expect(boxFor([M, M, M, M, M, J, J, J, J, S, S, S, S, P, X, X, X, X]).body).toBe(
      'Alle må ha minst 4 utslag før lagets kort kan leveres. Trykk «Rediger hullene» og bytt til Per på tre hull der Marte eller en som ikke er med på laget lenger står.',
    );
  });

  it('shamble: the box says «noen på laget kan levere», and the partial line', () => {
    const st = status(LEVERING);
    expect(teeShotBoxText(teeShotDeliveryAdvice(st)!, st, false, nameOf).body).toContain('før noen på laget kan levere.');
    expect(teeShotHoleLineText({ kind: 'partial' }, nameOf)).toBe(
      'Et kort på laget er levert. Du kan bare bytte så lenge alle har nok.',
    );
  });

  it('the organiser line, the counts and the button labels', () => {
    expect(teeShotOrganizerLines(status(LEVERING), nameOf)).toEqual(['Per har 2 av 4 utslag']);
    const [marte, , , per] = status(LEVERING).players;
    expect(teeShotCountText(per!, 4)).toBe('2 av 4');
    expect(teeShotCountText(marte!, 4)).toBe('har 7');
    expect(teeShotButtonLabel('Per', per!, 4, true)).toBe('Per, 2 av 4 utslag');
    expect(teeShotButtonLabel('Marte', marte!, 4, false)).toBe('Marte, har 7 utslag, kan ikke velges nå');
  });
});
