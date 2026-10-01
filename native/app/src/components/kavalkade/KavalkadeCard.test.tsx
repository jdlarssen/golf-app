// #2265 PR 2: kortene i Kavalkaden. Type C — hvert kort viser det webbens
// `KavalkadeCardView` viser for de samme fakta, og leses som én setning.
// Tallene er Type A på webben (`buildKavalkadeFacts`, `kavalkadeCards`).
import { render, screen } from '@testing-library/react-native';
import {
  buildKavalkadeDeck,
  type KavalkadeCard as Card,
} from '../../../../../lib/kavalkade/kavalkadeCards';
import { makeKavalkadeFacts } from '../../test/kavalkadeFixtures';
import { KavalkadeCard, kavalkadeCardBody, kavalkadeCardLabel } from './KavalkadeCard';

const deck = buildKavalkadeDeck(makeKavalkadeFacts(), 'Et år å huske.');
const all = [...deck.personal, ...deck.gang];
const card = (id: Card['id']) => all.find((c) => c.id === id) as Card;

/** Det kortet sier, som webben skriver det: kicker, stort tall, enhet, linjer. */
function said(id: Card['id']) {
  const body = kavalkadeCardBody(card(id));
  return [body.kicker, body.headline, body.headlineUnit ?? null, ...body.lines.filter(Boolean)];
}

describe('kavalkadeCardBody', () => {
  it('writes «Ditt år» as the web does', () => {
    expect(said('year')).toEqual(['Året ditt', '2026', null, '12 runder', '10 med egen ball', '2 som lag']);
    expect(said('best-round')).toEqual(['Beste runde', '82', 'slag', 'Lørdagscup · Losby · 14. jun']);
    expect(said('nemesis-hole')).toEqual([
      'Nemesis-hullet',
      'Hull 7',
      null,
      '1,44 over par i snitt',
      'Spilt 9 ganger',
      'Flest slag på hullet: 8',
    ]);
    expect(said('rival')).toEqual(['Rivalen', 'Ola', null, '8 runder sammen', '3 seire, 4 tap, 1 uavgjort']);
    expect(said('form-peak')).toEqual(['Formtoppen', '84', 'slag i snitt', 'Beste strekk på 3 runder', '1. jun – 1. jul']);
    expect(said('team')).toEqual([
      'Som lag',
      '2',
      'lagrunder',
      'Beste lagrunde: 68 slag',
      'med Kari',
      'Beste lagkamerat: Kari',
    ]);
  });

  it('writes «Gjengen» as the web does', () => {
    expect(said('gang-summary')).toEqual([
      'Gjengen',
      '6',
      'spillere',
      '12 runder sammen',
      'Alle du fullførte minst én runde med i år.',
    ]);
    expect(said('gang-winner')).toEqual(['Årets vinner', 'Ola', null, '5 seire']);
    expect(said('gang-birdies')).toEqual(['Flest birdier', 'Jørgen', null, '11 birdier']);
    expect(said('gang-snowmen')).toEqual(['Årets snowman', 'Per', null, '4 snowman']);
    expect(said('gang-tightest')).toEqual([
      'Tetteste oppgjør',
      'Skilt av 1 slag',
      null,
      'Jørgen 84 mot Ola 85',
      'Tirsdagsrunden · Losby · 5. mai',
    ]);
  });

  it('says the message under the threshold, and names a player without a name', () => {
    const below = buildKavalkadeDeck(makeKavalkadeFacts({ personal: null, team: null })).personal;
    expect(kavalkadeCardBody(below[1])).toMatchObject({
      kicker: 'Ditt år',
      headline: 'For få runder i år',
      headlineSize: 'small',
      lines: [
        'Din egen kavalkade krever 3 runder med egen ball. I år har du 10.',
        'Lagrundene dine står på «Som lag»-kortet.',
      ],
    });
    const nameless = { id: 'gang-winner', fact: { userId: 'x', name: null, count: 1 } } as Card;
    expect(kavalkadeCardBody(nameless)).toMatchObject({ headline: 'Ukjent spiller', lines: ['1 seier'] });
  });
});

describe('KavalkadeCard', () => {
  it('draws the opening with the narrative, read as one sentence with its place', async () => {
    await render(<KavalkadeCard card={card('year')} position="Kort 1 av 5" />);
    expect(screen.getByText('ÅRET DITT')).toBeTruthy();
    expect(screen.getByTestId('kavalkade-narrative')).toHaveTextContent('Et år å huske.');
    expect(screen.getByLabelText('Kort 1 av 5. Året ditt. 2026. 12 runder. 10 med egen ball. 2 som lag. Et år å huske.')).toBeTruthy();
  });

  it('draws start, now and best under the form peak', async () => {
    await render(<KavalkadeCard card={card('form-peak')} position="Kort 5 av 6" action={null} />);
    expect(screen.getByText('START')).toBeTruthy();
    expect(screen.getByText('92')).toBeTruthy();
    expect(screen.getByText('NÅ')).toBeTruthy();
    expect(screen.getByText('86')).toBeTruthy();
    expect(screen.getByText('BESTE')).toBeTruthy();
    expect(kavalkadeCardLabel(kavalkadeCardBody(card('form-peak')), 'Kort 5 av 6')).toBe(
      'Kort 5 av 6. Formtoppen. 84 slag i snitt. Beste strekk på 3 runder. 1. jun – 1. jul. Start 92. Nå 86. Beste 82',
    );
  });
});
