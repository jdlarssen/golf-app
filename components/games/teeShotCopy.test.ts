import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import messages from '@/messages/no.json';
import { teeShotDeliveryAdvice, teeShotHoleLine, teeShotStatus } from '@/lib/games/teeShots';
import { sortByTeeShotName, teeShotBoxText, teeShotHoleLineText, teeShotNames, type TeeShotT } from './teeShotCopy';

const t = createTranslator({ locale: 'no', messages, namespace: 'teeShots' }) as unknown as TeeShotT;

const member = (user_id: string, name: string | null, nickname: string | null = null) => ({
  user_id,
  users: { name, nickname },
});

// Type A (#2580): which short name each member gets, and the team order every
// tee-shot surface uses.
describe('teeShotNames', () => {
  it('the nickname when there is one, else the first name', () => {
    const names = teeShotNames([member('u1', 'Marte Lie'), member('u2', 'Jonas Berg', '  Joggen ')], 'Ukjent');
    expect(names.get('u1')).toBe('Marte');
    expect(names.get('u2')).toBe('Joggen');
  });

  it('the full name when two on the team share a first name (#2286)', () => {
    const names = teeShotNames([member('u1', 'Per Hauge'), member('u2', 'Per Olsen'), member('u3', 'Sigrid Aas')], 'Ukjent');
    expect([...names.values()]).toEqual(['Per Hauge', 'Per Olsen', 'Sigrid']);
  });

  it('the stand-in when the name is missing', () => {
    expect(teeShotNames([member('u1', null)], 'Ukjent').get('u1')).toBe('Ukjent');
  });
});

describe('sortByTeeShotName', () => {
  it('orders by the short name with Norwegian collation (Æ, Ø, Å last), then by id', () => {
    const team = [
      member('u4', 'Åse Lund'),
      member('u2', 'Øystein Moe'),
      member('u3', 'Zara Vik'),
      member('u1', 'Ærlend Bø'),
      member('u6', 'Anna B'),
      member('u5', 'Anna A'),
    ];
    // The two Annas share a first name, so their full names decide.
    expect(sortByTeeShotName(team, 'Ukjent').map((m) => m.user_id)).toEqual(['u5', 'u6', 'u3', 'u1', 'u2', 'u4']);
  });

  it('uses the nickname the buttons show, and the id breaks a tie', () => {
    const team = [member('b', 'Marte Lie', 'Kaptein'), member('a', 'Jonas Berg'), member('c', 'Kari Kaptein', 'Kaptein')];
    expect(sortByTeeShotName(team, 'Ukjent').map((m) => m.user_id)).toEqual(['a', 'b', 'c']);
  });
});

// Type B (#2580): the sentences the artboards draw (row 71 on the design
// canvas), rendered with the real no.json. The team is the artboards' Marte,
// Jonas, Sigrid and Per, in that team order.
describe('the artboard sentences, with the real messages', () => {
  const M = 'marte';
  const J = 'jonas';
  const S = 'sigrid';
  const P = 'per';
  const TEAM = [M, J, S, P];
  const NAME: Record<string, string> = { marte: 'Marte', jonas: 'Jonas', sigrid: 'Sigrid', per: 'Per' };
  const nameOf = (id: string) => NAME[id] ?? id;
  const LEVERING = [S, M, M, J, S, M, M, J, P, S, M, J, P, J, M, S, J, M];
  const status = (owners: string[]) =>
    teeShotStatus({ minimum: 4, memberIds: TEAM, picks: owners.map((teeShotBy, i) => ({ holeNumber: i + 1, teeShotBy })) });

  const X = 'withdrawn';
  const boxFor = (owners: string[]) => {
    const st = status(owners);
    return teeShotBoxText(teeShotDeliveryAdvice(st)!, st, true, nameOf, t, 'no').body;
  };

  it('Utslag 2, 2b, 3 and 5', () => {
    const levering = status(LEVERING);
    const box = teeShotBoxText(teeShotDeliveryAdvice(levering)!, levering, true, nameOf, t, 'no');
    const sentences = {
      'Utslag 2 (hull 7)': teeShotHoleLineText(teeShotHoleLine(status(LEVERING.slice(0, 7)), 'none'), nameOf, t, 'no'),
      'Utslag 2b (hull 16)': teeShotHoleLineText(teeShotHoleLine(status(LEVERING.slice(0, 15)), 'none'), nameOf, t, 'no'),
      'Utslag 3 (boks, tittel)': box.title,
      'Utslag 3 (boks, setning)': box.body,
      'Utslag 5 (shamble, hull 7)': teeShotHoleLineText(teeShotHoleLine(status([M, J, S, P, J, S, M]), 'none'), nameOf, t, 'no'),
    };
    expect(sentences).toMatchInlineSnapshot(`
      {
        "Utslag 2 (hull 7)": "Per mangler 4, Jonas 3 og Sigrid 2 · 2 hull å velge fritt på",
        "Utslag 2b (hull 16)": "Sigrid og Per trenger utslagene på de tre hullene som er igjen.",
        "Utslag 3 (boks, setning)": "Alle må ha minst 4 utslag før lagets kort kan leveres. Trykk «Rediger hullene» og bytt til Per på to hull der Marte eller Jonas står.",
        "Utslag 3 (boks, tittel)": "Per mangler 2 utslag",
        "Utslag 5 (shamble, hull 7)": "Per mangler 3, de andre 2 hver · 2 hull å velge fritt på",
      }
    `);
  });

  it('not drawn: the swap when someone no longer on the team holds the holes, alone or with a member', () => {
    const sentences = {
      // Marte, Jonas and Sigrid on 4, Per 2, X 3, one open.
      'hull, bare en som ikke er med': teeShotHoleLineText(teeShotHoleLine(status([M, M, M, M, J, J, J, J, S, S, S, S, P, P, X, X, X]), 'none'), nameOf, t, 'no'),
      // Marte, Jonas and Sigrid on 4, Per 2, X 4: every hole chosen.
      'boks, bare en som ikke er med': boxFor([M, M, M, M, J, J, J, J, S, S, S, S, P, P, X, X, X, X]),
      // Marte 5, Jonas 4, Sigrid 4, Per 1, X 3, one open.
      'hull, Marte og en som ikke er med': teeShotHoleLineText(teeShotHoleLine(status([M, M, M, M, M, J, J, J, J, S, S, S, S, P, X, X, X]), 'none'), nameOf, t, 'no'),
      // The review's probe: Marte 5, Jonas 4, Sigrid 4, Per 1, X 4.
      'boks, Marte og en som ikke er med': boxFor([M, M, M, M, M, J, J, J, J, S, S, S, S, P, X, X, X, X]),
    };
    expect(sentences).toMatchInlineSnapshot(`
      {
        "boks, Marte og en som ikke er med": "Alle må ha minst 4 utslag før lagets kort kan leveres. Trykk «Rediger hullene» og bytt til Per på tre hull der Marte eller en som ikke er med på laget lenger står.",
        "boks, bare en som ikke er med": "Alle må ha minst 4 utslag før lagets kort kan leveres. Trykk «Rediger hullene» og bytt til Per på to hull der en som ikke er med på laget lenger står.",
        "hull, Marte og en som ikke er med": "Per mangler 3, og bare 1 hull er igjen. Bytt på et tidligere hull der Marte eller en som ikke er med på laget lenger står.",
        "hull, bare en som ikke er med": "Per mangler 2, og bare 1 hull er igjen. Bytt på et tidligere hull der en som ikke er med på laget lenger står.",
      }
    `);
  });
});
